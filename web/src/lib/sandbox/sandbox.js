// Sandbox promptologue (P10.3) — contrôleur côté parent.
//
// Exécute le code d'orchestration d'un prompt-package dans l'hôte isolé
// (iframe sandbox="allow-scripts" + Web Worker blob, voir protocol.js), en
// jouant le rôle de PONT à privilèges minimaux :
//   - route les demandes {type:'llm'} vers l'abstraction providers (quota
//     MAX_LLM_CALLS_PER_RUN, puis refus + arrêt du run) ;
//   - timeout global SANDBOX_TIMEOUT_MS puis terminate (l'hôte est détruit,
//     worker compris — un calcul infini ne survit pas au run) ;
//   - valide le document final AVANT de le rendre à l'appelant : au schéma,
//     puis — journée ou fusion — à sa conformité au référentiel transmis au
//     paquet (ses pôles, chacun une fois, ses codes ; 2026-10-20).
//
// L'hôte est INJECTABLE (hostFactory) : les tests vitest pilotent le protocole
// avec un faux hôte ; le vrai test d'isolation navigateur arrive en e2e.
// Modèle de menace : docs/securite-prompts.md.

import { validateDocument } from '@engine/validation.js'
import { validateDocumentPourReferentiel } from '@engine/conformite.js'
import {
  buildSrcdoc,
  buildWorkerSource,
  MAX_LLM_CALLS_PER_RUN,
  SANDBOX_TIMEOUT_MS,
} from './protocol.js'

/**
 * Hôte réel : iframe sandbox="allow-scripts" (origine opaque) construit par
 * srcdoc. Les messages sont filtrés par SOURCE (event.source doit être le
 * contentWindow de NOTRE iframe) — un autre iframe ou une autre fenêtre ne
 * peut pas s'insérer dans le protocole.
 *
 * @param {{doc?: Document, win?: Window}} [env] coutures de test
 * @returns {{send: Function, onMessage: Function, start: Function, terminate: Function}}
 */
export function createIframeHost({ doc = globalThis.document, win = globalThis.window } = {}) {
  const iframe = doc.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'Sandbox prompt-package')
  iframe.style.display = 'none'
  iframe.srcdoc = buildSrcdoc()

  let handler = null
  const listener = (event) => {
    if (event.source !== iframe.contentWindow) return
    handler?.(event.data)
  }

  return {
    onMessage(cb) {
      handler = cb
    },
    start() {
      win.addEventListener('message', listener)
      doc.body.appendChild(iframe)
    },
    send(msg) {
      iframe.contentWindow?.postMessage(msg, '*')
    },
    terminate() {
      win.removeEventListener('message', listener)
      iframe.remove()
    },
  }
}

/**
 * Exécute le code d'orchestration d'un paquet sur UNE journée, dans la sandbox.
 *
 * @param {object} params
 * @param {object} params.pkg document prompt-package (code.orchestration exécuté)
 * @param {string} params.dayText texte de la journée
 * @param {string} params.date date ISO AAAA-MM-JJ
 * @param {object} params.referentiel document référentiel (transmis au paquet ;
 *   le document final lui est conforme, ou il est refusé). Pour un run partiel,
 *   le référentiel restreint au périmètre : c'est lui qui fixe les pôles
 *   attendus, jamais le marqueur `perimetre` que le paquet poserait sur sa
 *   journée — retiré avant la validation et du document rendu (l'appelant pose
 *   le sien, comme le banc).
 * @param {{complete: Function}} params.provider abstraction providers — SEULE
 *   voie de sortie réseau du code sandboxé
 * @param {string} params.model modèle passé au provider
 * @param {number} [params.maxTokens]
 * @param {string} [params.expectedKind='cartographie-jour'] schéma imposé au
 *   document final
 * @param {number} [params.maxLlmCalls=MAX_LLM_CALLS_PER_RUN]
 * @param {number} [params.timeoutMs=SANDBOX_TIMEOUT_MS]
 * @param {AbortSignal} [params.signal] interruption coopérative (terminate)
 * @param {() => object} [params.hostFactory=createIframeHost] couture de test
 * @param {(info: {calls: number, max: number}) => void} [params.onLlmCall]
 * @param {(kind: string, doc: object) => {valid: boolean, errors: Array}} [params.validateFn]
 *   défaut : le schéma, puis la conformité au référentiel (journée, fusion)
 * @returns {Promise<{document: object, llmCalls: number, durationMs: number}>}
 */
export function runPackageInSandbox({
  pkg,
  dayText,
  date,
  referentiel,
  provider,
  model,
  maxTokens,
  expectedKind = 'cartographie-jour',
  maxLlmCalls = MAX_LLM_CALLS_PER_RUN,
  timeoutMs = SANDBOX_TIMEOUT_MS,
  signal,
  hostFactory = createIframeHost,
  onLlmCall,
  validateFn = (kind, doc) =>
    (kind === 'cartographie-jour' || kind === 'cartographie-merge') && referentiel
      ? validateDocumentPourReferentiel(kind, doc, referentiel)
      : validateDocument(kind, doc),
} = {}) {
  if (typeof provider?.complete !== 'function') {
    return Promise.reject(new TypeError('runPackageInSandbox : provider avec complete() requis'))
  }
  let workerSource
  try {
    workerSource = buildWorkerSource(pkg)
  } catch (err) {
    return Promise.reject(err)
  }

  const host = hostFactory()
  const startedAt = Date.now()
  let llmCalls = 0
  let settled = false

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(
        new Error(
          `Sandbox : délai global de ${Math.round(timeoutMs / 60000) || 1} min dépassé — ` +
            'exécution interrompue (worker détruit).',
        ),
      )
    }, timeoutMs)

    const onAbort = () => fail(new Error('Sandbox : exécution annulée.'))
    signal?.addEventListener('abort', onAbort, { once: true })

    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      host.terminate()
    }
    function fail(err) {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    function succeed(value) {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    host.onMessage((msg) => {
      if (settled || !msg || typeof msg !== 'object') return
      switch (msg.type) {
        case 'boot':
          host.send({ type: 'init', workerSource })
          break
        case 'ready':
          host.send({ type: 'run', dayText, date, referentiel })
          break
        case 'llm': {
          const { id } = msg
          llmCalls += 1
          if (llmCalls > maxLlmCalls) {
            host.send({ type: 'llm-error', id, message: 'quota dépassé' })
            fail(
              new Error(
                `Sandbox : quota d'appels LLM dépassé (${maxLlmCalls} max par run) — exécution interrompue.`,
              ),
            )
            return
          }
          onLlmCall?.({ calls: llmCalls, max: maxLlmCalls })
          if (typeof msg.prompt !== 'string' || msg.prompt === '') {
            host.send({ type: 'llm-error', id, message: 'prompt vide' })
            return
          }
          Promise.resolve()
            .then(() => provider.complete({ model, prompt: msg.prompt, maxTokens, signal }))
            .then((res) => {
              if (!settled) host.send({ type: 'llm-ok', id, text: String(res?.text ?? '') })
            })
            .catch((err) => {
              if (!settled) {
                host.send({
                  type: 'llm-error',
                  id,
                  message: err instanceof Error ? err.message : String(err),
                })
              }
            })
          break
        }
        case 'result': {
          const recu = msg.document
          if (!recu || typeof recu !== 'object' || recu.kind !== expectedKind) {
            fail(
              new Error(
                `Sandbox : le paquet a produit un document de type « ${recu?.kind ?? 'inconnu'} » ` +
                  `au lieu de « ${expectedKind} ».`,
              ),
            )
            return
          }
          // Code tiers : son marqueur de périmètre ne choisit pas les pôles attendus.
          let doc = recu
          if (expectedKind === 'cartographie-jour' && 'perimetre' in recu) {
            const { perimetre: _marqueurTiers, ...sansMarqueur } = recu
            doc = sansMarqueur
          }
          const { valid, errors } = validateFn(expectedKind, doc)
          if (!valid) {
            const detail = errors
              .slice(0, 3)
              .map((e) => `${e.path} ${e.message}`)
              .join(' ; ')
            const nature = errors.every((e) => e.keyword === 'referentiel')
              ? 'non conforme au référentiel'
              : `invalide au schéma ${expectedKind}`
            fail(
              new Error(
                `Sandbox : document final ${nature} ` +
                  `(${errors.length} erreur(s) : ${detail}).`,
              ),
            )
            return
          }
          succeed({ document: doc, llmCalls, durationMs: Date.now() - startedAt })
          break
        }
        case 'error':
          fail(new Error(`Sandbox : ${msg.message ?? 'erreur du paquet'}`))
          break
        default:
          // Message hors protocole : ignoré (surface minimale).
          break
      }
    })

    try {
      host.start?.()
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
