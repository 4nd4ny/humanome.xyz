// Client de « Cartographie ouverte Twin6 » — le point de contact du front avec
// le protocole Twin6 (OPEN SOURCE). Deux voies, comme demandé :
//   - CLÉ PERSO : le moteur (executerTwin6) tourne côté client, appel DIRECT au
//     fournisseur avec la clé de l'utilisateur → GRATUIT (rien ne nous est dû).
//   - CRÉDITS : chaque appel passe par POST /api/twin6/appel (notre clé), la
//     contribution +10 % est débitée du solde prépayé. Le prompt étant PUBLIC,
//     il n'y a aucun secret à protéger (pas de LeakFilter côté serveur).
//
// Le paquet de prompts est PUBLIC et téléchargeable : web/public/data/twin6/.
//
// Tout référentiel publié (2026-10-20) : un run Twin6 lit le référentiel choisi
// (RESPIRE par défaut) — un scan par pôle —, et ses fiches sont celles du
// paquet pour un pôle dont elles nomment exactement les compétences, sinon
// écrites depuis le document (fichesPourTwin6, moteur). Le paquet servi est la
// 1.1.0, dont les gabarits lisent le référentiel (son nom, ses pôles, ses
// compétences, la forme de ses codes) au lieu d'écrire RESPIRE v7 en toutes
// lettres ; pour RESPIRE v7, ses prompts sont ceux de la 1.0.0 à l'octet.

import { ApiError, apiFetch } from './client.js'
import { ACCEPT_RELAIS } from './relais.js'
import { classifyStop, createProvider, throwIfTruncated } from '@engine/providers/index.js'
import { fetchTwin9Meta, referentielPourMoteur } from './twin9.js'
import { sha256Bytes } from '../lib/pow.js'

/** Paquet de prompts open source (servi statiquement, téléchargeable). */
export const TWIN6_PACKAGE_URL = 'data/twin6/twin6-ouverte-1.1.0.json'

/** L'empreinte SHA-256 d'octets, en hexadécimal minuscule. */
function sha256Hex(bytes) {
  return Array.from(sha256Bytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Charge le paquet PUBLIC de prompts Twin6 (scanPole, kairos, les fiches des
 * pôles de RESPIRE v7, P1..P7) dans la forme attendue par le moteur
 * (twin6.executerTwin6), avec l'empreinte SHA-256 des octets servis (2026-10-22) :
 * le document exporté la consigne (bloc `configuration`), et elle certifie les
 * gabarits lus, à l'octet — elle se calcule avant toute lecture du JSON.
 *
 * @param {{fetchFn?: typeof fetch, url?: string}} [opts]
 * @returns {Promise<{id, version, nom, licence, modeleCibleDefaut, sha256: string,
 *   templates: {scanPole: string, kairos: string, fiches: object}}>}
 */
export async function loadTwin6Package({ fetchFn = fetch, url = TWIN6_PACKAGE_URL } = {}) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Paquet Twin6 introuvable (${res.status})`)
  const octets = new Uint8Array(await res.arrayBuffer())
  let pkg
  try {
    pkg = JSON.parse(new TextDecoder().decode(octets))
  } catch {
    pkg = null
  }
  if (!pkg?.scanPole || !pkg?.kairos || !pkg?.fiches) {
    throw new Error('Paquet Twin6 invalide (scanPole/kairos/fiches attendus)')
  }
  return {
    id: pkg.id,
    version: pkg.version,
    nom: pkg.nom,
    licence: pkg.licence,
    modeleCibleDefaut: pkg.modeleCibleDefaut ?? 'claude-sonnet-5',
    sha256: sha256Hex(octets),
    templates: { scanPole: pkg.scanPole, kairos: pkg.kairos, fiches: pkg.fiches },
  }
}

/** Ajouté au message d'un relais coupé sans issue : le serveur a pu facturer l'appel, sa réserve au plus. */
export const RELAIS_INTERROMPU_CREDITS =
  ' L’appel a pu être facturé, au plus le montant réservé pour lui : votre solde fait foi.'

/**
 * Provider CRÉDITS (voie « nos crédits ») : chaque complete() passe par POST
 * /api/twin6/appel — apiFetch porte la session (cookie) et le CSRF. Facturé
 * +10 % côté serveur. Contrat moteur {complete(params)} → {text, usage, model,
 * stopReason, stopReasonRaw, truncated} (identique à createProvider) : l'arrêt
 * relayé (celui d'Anthropic) est normalisé, et une sortie tronquée lève
 * l'OutputTruncatedError du moteur APRÈS `onCout` — l'appel est facturé —,
 * sauf allowTruncated.
 *
 * La réponse arrive en flux (2026-10-21, api/relais.js) : `onProgression`
 * reçoit les caractères reçus de l'appel en cours. Un appel coupé en route —
 * le délai, une erreur du fournisseur — est facturé pour ce qu'il a produit :
 * `onCout` en reçoit le coût, puis l'erreur est levée ; l'annuler (signal)
 * coupe l'appel, facturé de même.
 *
 * @param {{onCout?: (microusd:number)=>void, onProgression?: (caracteres:number)=>void,
 *   fetchFn?: typeof fetch}} [opts]
 */
export function makeCreditsProvider({ onCout, onProgression, fetchFn } = {}) {
  return {
    name: 'twin6-credits',
    // Le fournisseur des appels (la configuration du document le consigne) : Anthropic seul.
    fournisseur: 'anthropic',
    transport: 'proxy',
    async complete({ model, prompt, maxTokens, system = null, signal, allowTruncated } = {}) {
      let data
      try {
        data = await apiFetch('twin6/appel', {
          method: 'POST',
          body: { model, prompt, system, max_tokens: maxTokens },
          headers: { Accept: ACCEPT_RELAIS },
          ...(onProgression ? { onProgression } : {}),
          ...(fetchFn ? { fetchFn } : {}),
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        const cout = Number(error?.data?.cout_microusd)
        if (typeof onCout === 'function' && Number.isFinite(cout) && cout > 0) onCout(cout)
        if (error instanceof ApiError && error.code === 'interrompu') {
          const interrompu = new ApiError(error.message + RELAIS_INTERROMPU_CREDITS, error.status, error.code)
          interrompu.serverMessage = interrompu.message
          interrompu.data = error.data
          throw interrompu
        }
        throw error
      }
      if (typeof onCout === 'function') onCout(data.cout_microusd ?? 0)
      const result = {
        text: data.text ?? '',
        usage: {
          inputTokens: data.usage?.inputTokens ?? 0,
          outputTokens: data.usage?.outputTokens ?? 0,
        },
        model: data.model ?? model,
        ...classifyStop('anthropic', data.stopReason),
      }
      return throwIfTruncated(result, { provider: 'anthropic', maxTokens, allowTruncated })
    },
  }
}

/**
 * Provider CLÉ PERSO (voie gratuite) : appel DIRECT navigateur → fournisseur,
 * avec la clé de l'utilisateur. Réutilise createProvider (même chemin que les
 * cartographies régulières en clé perso). La clé ne quitte pas le navigateur.
 *
 * @param {{provider?: string, apiKey: string, fetchFn?: typeof fetch}} params
 */
export function makeOwnKeyProvider({ provider = 'anthropic', apiKey, fetchFn } = {}) {
  return createProvider({
    provider,
    transport: 'direct',
    apiKey,
    ...(fetchFn ? { fetchFn } : {}),
  })
}

// referentielPourMoteur a déménagé dans api/twin9.js (D12 : il servait aussi
// l'analyse Twin9 du navigateur, partie le 2026-10-17) — ré-exporté ici pour
// les importeurs existants.
export { referentielPourMoteur }

/** Les codes de chaque pôle, dans l'ordre des numéros : la structure d'un référentiel. */
function structure(referentiel) {
  return JSON.stringify(
    referentiel.poles
      .map((p) => Number(p.num))
      .sort((a, b) => a - b)
      .map((num) => [num, referentiel.competences.filter((c) => Number(c.pole) === num).map((c) => String(c.code)).sort()]),
  )
}

/**
 * Le référentiel que lit un run Twin6 (2026-10-20) : le document publié choisi.
 * Pour RESPIRE, la structure de /api/twin9/meta — celle de l'import, aux noms
 * de pôle accentués, que portent les documents Twin6 d'hier — tant qu'elle
 * compte exactement les mêmes pôles et les mêmes compétences que la version
 * choisie ; une version d'une autre structure se lit dans son document.
 *
 * @param {{id?: string, poles: Array, competences: Array}} document le référentiel publié choisi
 * @param {Array<object>} [metaReferentiel] le référentiel de /api/twin9/meta (tableau de pôles)
 * @returns {{id?: string, poles: Array, competences: Array}} le référentiel du moteur
 */
export function referentielTwin6(document, metaReferentiel) {
  const id = typeof document?.id === 'string' && document.id !== '' ? document.id : 'respire'
  const meta = referentielPourMoteur(metaReferentiel)
  return id === 'respire' && meta.poles.length > 0 && structure(meta) === structure(document) ? meta : document
}

/**
 * Prix Twin6 (contribution +10 % déjà appliquée) par modèle, lus dans
 * /twin9/meta (le serveur applique la marge, jamais exposée).
 */
export async function fetchTwin6Offer(options) {
  const meta = await fetchTwin9Meta(options)
  return {
    modeles: meta.modeles_twin6 ?? {},
    referentiel: Array.isArray(meta.referentiel) ? meta.referentiel : [],
    // Solde prépayé du compte : sert de garde-fou avant un run sur crédits
    // (on ne lance pas si le solde ne couvre pas le poids du portfolio).
    solde_microusd: Number(meta.solde_microusd ?? 0),
    // Seule une école recharge (ADR-013 §2 e) : le message d'un solde insuffisant ne propose pas la recharge aux autres.
    peut_acheter: meta.peut_acheter === true,
  }
}
