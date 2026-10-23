// Demo LLM access for the public « Essayer » page (P6, cahier §3.1).
//
// The REAL engine is used (extractDay + createProvider proxy transport): this
// module only wires the anti-abuse contract announced by the /api/llm
// chantier around the engine's proxy POST:
//
//   GET  api/llm/challenge -> {challenge, difficultyBits, expiresAt}
//   POST api/llm {system, prompt, challenge, nonce, website: ''}
//        -> {text, usage, model}
//
// - one challenge per LLM call (the server makes them one-time): the fetch
//   wrapper obtains + solves a fresh challenge for every POST, on the fly;
// - `prime()` lets the caller solve the FIRST proof of work before the first
//   LLM call (visible « préparation » step in the UI);
// - `website` is the honeypot field: always sent empty, a human never fills it;
// - the engine's body fields (provider, model, maxTokens) travel too, as
//   hints: the demo server enforces ITS configured model and ceilings;
// - URLs are RELATIVE ('api/…') like every other call of the front
//   (ADR-003/ADR-009: the app can be served from any subpath);
// - automatic retries are DISABLED (maxAttempts: 1): a 429 here means the
//   demo quota, hammering it would be abuse — the UI offers a manual retry;
// - the answer comes as it is generated (2026-10-21, api/relais.js): the
//   wrapper asks for the relay, reports the characters received
//   (`onProgression`) and hands the engine the JSON the route would have
//   answered; a call cut short (the delay, the provider) was counted on the
//   day's budget for what it produced, and is not retried here;
// - an answer cut by the model's limits (OutputTruncatedError, 2026-10-22)
//   is a 200: counted, never retried (neither here nor by the engine), and
//   told apart by describeDemoError;
// - RGPD (cahier §6.5): nothing is logged nor stored anywhere in this module.

import { createProvider } from '@engine/providers/index.js'
import { ProviderError } from '@engine/providers/errors.js'
import { parseRetryAfter } from '@engine/providers/retry.js'
import { solvePow } from './pow.js'
import { ACCEPT_RELAIS, estRelais, lireRelais } from '../api/relais.js'
import { RELAIS_INTERROMPU } from '../api/client.js'

export const DEMO_CHALLENGE_URL = 'api/llm/challenge'
export const DEMO_PROXY_URL = 'api/llm'
/** Model HINT sent to the proxy — the server imposes its own (config/demo.php). */
export const DEMO_MODEL = 'demo'
/**
 * Output budget HINT sent to the proxy, which ignores it: the server sends
 * the model's whole output (2026-10-21, api/src/Llm/ModelLimits.php).
 */
export const DEMO_MAX_TOKENS = 8192

/**
 * Bounds of the visitor's text (the server bounds the whole call, template
 * included: maxInputChars). 5 000 characters at most since 2026-10-21, for the
 * « Essayer » page and the open cartography's free trial alike (Christian:
 * « 5000 caractères pour les démo "Essayer" sans compte, c'est suffisant »).
 */
export const DEMO_TEXT_MIN_CHARS = 80
export const DEMO_TEXT_MAX_CHARS = 5000

/** Safety margin before a challenge's expiresAt to avoid racing the server. */
const EXPIRY_MARGIN_MS = 2000

/** @returns {string} today's date AAAA-MM-JJ in the user's LOCAL timezone */
export function localIsoToday(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Fetches a one-time proof-of-work challenge.
 *
 * @param {{fetchFn?: typeof fetch, signal?: AbortSignal}} [options]
 * @returns {Promise<{challenge: string, difficultyBits: number, expiresAt: string|null}>}
 * @throws {ProviderError} HTTP/network failure (status + retryAfterMs kept)
 */
export async function fetchChallenge({ fetchFn, signal } = {}) {
  const doFetch = fetchFn ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) {
    throw new ProviderError('démo : réseau indisponible (copie statique ?)', {
      status: 0,
      retryable: false,
      provider: 'demo',
    })
  }
  let response
  try {
    response = await doFetch(DEMO_CHALLENGE_URL, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ProviderError(`démo : erreur réseau sur le défi (${err?.message ?? err})`, {
      status: 0,
      retryable: true,
      provider: 'demo',
      cause: err,
    })
  }
  if (!response.ok) {
    const status = response.status
    const error = new ProviderError(`démo : HTTP ${status} sur api/llm/challenge`, {
      status,
      retryable: status === 429 || status >= 500,
      provider: 'demo',
    })
    const retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'))
    if (retryAfterMs != null) error.retryAfterMs = retryAfterMs
    throw error
  }
  const data = await response.json().catch(() => null)
  if (typeof data?.challenge !== 'string' || data.challenge === '') {
    throw new ProviderError('démo : réponse de défi invalide (champ challenge absent)', {
      status: response.status,
      retryable: false,
      provider: 'demo',
    })
  }
  return {
    challenge: data.challenge,
    difficultyBits: Number(data.difficultyBits ?? 0),
    expiresAt: data.expiresAt ?? null,
  }
}

/** expiresAt -> milliseconds epoch: the API sends epoch SECONDS (int); ISO
 * strings are tolerated for robustness. null = no expiry known. */
function expiryMs(expiresAt) {
  if (expiresAt == null) return null
  if (typeof expiresAt === 'number') {
    return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt
  }
  const parsed = Date.parse(expiresAt)
  return Number.isNaN(parsed) ? null : parsed
}

function isUsable(solved, now = Date.now()) {
  if (!solved) return false
  const expires = expiryMs(solved.expiresAt)
  if (expires === null) return true
  return expires - EXPIRY_MARGIN_MS > now
}

/**
 * Builds the demo provider: the ENGINE proxy provider (transport 'proxy')
 * whose fetch is wrapped to solve one proof of work per LLM call and inject
 * {challenge, nonce, website: ''} into the POST body.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchFn] test seam (same pattern as data/load.js)
 * @param {(phase: 'challenge'|'pow'|'llm') => void} [options.onPhase]
 *   fine-grained progress for the UI (per call: fetch challenge, solve, LLM)
 * @param {(caracteres: number) => void} [options.onProgression] the characters
 *   received so far by the call in progress (from 0 at each 'llm' phase)
 * @returns {{provider: {complete: Function, name: string, transport: string},
 *   prime: (signal?: AbortSignal) => Promise<void>}}
 *   `prime()` pre-solves ONE challenge so the first LLM call starts instantly.
 */
export function createDemoProvider({ fetchFn, onPhase, onProgression } = {}) {
  const baseFetch = fetchFn ?? ((...args) => globalThis.fetch(...args))
  /** Pre-solved challenges, consumed FIFO ({challenge, nonce, expiresAt}). */
  const solvedQueue = []
  /** Calls cut short so far (code « coupe »): counted, never retried here. */
  let coupes = 0

  async function obtainSolved(signal) {
    onPhase?.('challenge')
    const { challenge, difficultyBits, expiresAt } = await fetchChallenge({
      fetchFn: baseFetch,
      signal,
    })
    onPhase?.('pow')
    const { nonce } = await solvePow({ challenge, difficultyBits, signal })
    return { challenge, nonce, expiresAt }
  }

  async function takeSolved(signal) {
    while (solvedQueue.length > 0) {
      const candidate = solvedQueue.shift()
      if (isUsable(candidate)) return candidate
    }
    return obtainSolved(signal)
  }

  const provider = createProvider({
    provider: 'anthropic', // hint only: the demo server imposes its own model
    transport: 'proxy',
    proxyUrl: DEMO_PROXY_URL,
    maxAttempts: 1, // no automatic retry against the demo quotas
    fetchFn: async (url, init = {}) => {
      const { challenge, nonce } = await takeSolved(init.signal)
      onPhase?.('llm')
      const body = JSON.parse(init.body)
      const response = await baseFetch(url, {
        ...init,
        headers: { ...init.headers, Accept: ACCEPT_RELAIS },
        body: JSON.stringify({ ...body, challenge, nonce, website: '' }),
      })
      if (!estRelais(response)) return response
      // The relayed answer, back into the JSON the engine reads, its status included.
      const issue = (await lireRelais(response, { onProgression, signal: init.signal })) ?? {
        status: 502,
        data: { error: RELAIS_INTERROMPU, code: 'coupe' },
      }
      if (issue.data?.code === 'coupe') coupes += 1
      return new Response(JSON.stringify(issue.data), {
        status: issue.status,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  // One retry on TRANSIENT upstream failures (5xx/network) with a fresh
  // challenge: an 8-call run should not die on a single gateway hiccup.
  // Never retried: 429 (demo quota — hammering it would be abuse) nor 4xx.
  const complete = async (args) => {
    const coupesAvant = coupes
    try {
      return await provider.complete(args)
    } catch (error) {
      const status = httpInfo(error)?.status ?? null
      // 503 is NOT transient here: the demo API uses it for « épuisée/désactivée ».
      // A rejected proof of work (expired/reused — e.g. after heavy tab
      // throttling) is recoverable too: the wrapper takes a FRESH challenge
      // on every attempt anyway.
      const powRejected = /défi/i.test(collectMessages(error))
      const transient =
        status === null || [500, 502, 504, 529].includes(status) || powRejected
      // A call cut short was counted for what it produced: a second one at once
      // would likely be cut too, and counted again (the engine keeps its own retry).
      const coupe = coupes > coupesAvant
      if (!transient || coupe || args?.signal?.aborted || isAbortError(error)) throw error
      onPhase?.('retry')
      await new Promise((resolve) => setTimeout(resolve, UPSTREAM_RETRY_DELAY_MS))
      return provider.complete(args)
    }
  }

  return {
    provider: { ...provider, complete },
    async prime(signal) {
      solvedQueue.push(await obtainSolved(signal))
    },
  }
}

/**
 * The refusal of POST /api/llm once the month's offered credits are spent
 * (code `offerts_epuises`, api/src/Llm/FreeCreditLedger.php), as the engine
 * carries it in its error's message.
 */
const OFFERTS_EPUISES = /Les crédits offerts de ce mois sont épuisés ; revenez le 1er [^.|]*\./

/** Pause before the single retry on a transient upstream failure. */
export const UPSTREAM_RETRY_DELAY_MS = 2500

/** Concatenates the messages of the whole `cause` chain (for text matching). */
function collectMessages(error) {
  const parts = []
  for (let err = error; err; err = err.cause) {
    if (typeof err.message === 'string') parts.push(err.message)
  }
  return parts.join(' | ')
}

/** Walks the `cause` chain looking for an HTTP status / Retry-After delay. */
function httpInfo(error) {
  for (let err = error; err; err = err.cause) {
    if (typeof err.status === 'number' && err.status > 0) {
      return { status: err.status, retryAfterMs: err.retryAfterMs ?? null }
    }
  }
  return null
}

/** @returns {boolean} true when the error (or a cause) is a cut answer (OutputTruncatedError) */
function isTruncation(error) {
  for (let err = error; err; err = err.cause) {
    if (err.code === 'sortie_tronquee') return true
  }
  return false
}

/** @returns {boolean} true when the error (or a cause) is an AbortError */
export function isAbortError(error) {
  for (let err = error; err; err = err.cause) {
    if (err.name === 'AbortError') return true
  }
  return false
}

/**
 * Maps a demo run failure to a user-facing French message (P6.4).
 *
 * @param {unknown} error anything thrown by prime()/extractDay()
 * @returns {{kind: 'quota'|'unavailable'|'tronque'|'llm', message: string, canRetry: boolean,
 *   code?: 'offerts_epuises'}} `code` when the month's offered credits are spent (sprint 7)
 */
export function describeDemoError(error) {
  const info = httpInfo(error)
  if (info?.status === 429) {
    const minutes =
      info.retryAfterMs != null ? Math.max(1, Math.ceil(info.retryAfterMs / 60000)) : null
    return {
      kind: 'quota',
      canRetry: true,
      message:
        'La démo est très demandée en ce moment : réessayez dans ' +
        (minutes != null
          ? `${minutes} minute${minutes > 1 ? 's' : ''}.`
          : 'quelques minutes.'),
    }
  }
  if (info?.status === 503) {
    // The month's offered credits are spent (sprint 7): the server's own words,
    // which name the day they come back (« revenez le 1er novembre »).
    const mois = OFFERTS_EPUISES.exec(collectMessages(error))
    if (mois) return { kind: 'unavailable', canRetry: false, code: 'offerts_epuises', message: mois[0] }
    return {
      kind: 'unavailable',
      canRetry: false,
      message:
        'La démo est épuisée pour aujourd’hui ou momentanément désactivée. ' +
        'Revenez un peu plus tard — ou créez un compte pour cartographier sans ces limites.',
    }
  }
  // A cut answer (status 200, found anywhere in the cause chain: extractDay and
  // executerTwin6 wrap it): the same text would be cut again.
  if (isTruncation(error)) {
    return {
      kind: 'tronque',
      canRetry: false,
      message:
        'Votre texte est trop long pour l’essai : la réponse du modèle a été coupée avant la fin. ' +
        'Raccourcissez-le, puis relancez l’analyse.',
    }
  }
  const detail = error instanceof Error ? error.message : String(error)
  return {
    kind: 'llm',
    canRetry: true,
    message:
      `L’analyse a échoué en cours de route (détail technique : ${detail}). ` +
      'Vous pouvez réessayer : la cartographie reprendra du début.',
  }
}
