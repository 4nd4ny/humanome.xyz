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

import { apiFetch } from './client.js'
import { createProvider } from '@engine/providers/index.js'
import { fetchTwin9Meta, referentielPourMoteur } from './twin9.js'

/** Paquet de prompts open source (servi statiquement, téléchargeable). */
export const TWIN6_PACKAGE_URL = 'data/twin6/twin6-ouverte-1.1.0.json'

/**
 * Charge le paquet PUBLIC de prompts Twin6 (scanPole, kairos, les fiches des
 * pôles de RESPIRE v7, P1..P7) dans la forme attendue par le moteur
 * (twin6.executerTwin6).
 *
 * @param {{fetchFn?: typeof fetch, url?: string}} [opts]
 */
export async function loadTwin6Package({ fetchFn = fetch, url = TWIN6_PACKAGE_URL } = {}) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Paquet Twin6 introuvable (${res.status})`)
  const pkg = await res.json()
  if (!pkg?.scanPole || !pkg?.kairos || !pkg?.fiches) {
    throw new Error('Paquet Twin6 invalide (scanPole/kairos/fiches attendus)')
  }
  return {
    id: pkg.id,
    version: pkg.version,
    nom: pkg.nom,
    licence: pkg.licence,
    modeleCibleDefaut: pkg.modeleCibleDefaut ?? 'claude-sonnet-5',
    templates: { scanPole: pkg.scanPole, kairos: pkg.kairos, fiches: pkg.fiches },
  }
}

/**
 * Provider CRÉDITS (voie « nos crédits ») : chaque complete() passe par POST
 * /api/twin6/appel — apiFetch porte la session (cookie) et le CSRF. Facturé
 * +10 % côté serveur. Contrat moteur {complete(params)} → {text, usage, model,
 * stopReason} (identique à createProvider).
 *
 * @param {{onCout?: (microusd:number)=>void, fetchFn?: typeof fetch}} [opts]
 */
export function makeCreditsProvider({ onCout, fetchFn } = {}) {
  return {
    name: 'twin6-credits',
    transport: 'proxy',
    async complete({ model, prompt, maxTokens, system = null, signal } = {}) {
      const data = await apiFetch('twin6/appel', {
        method: 'POST',
        body: { model, prompt, system, max_tokens: maxTokens },
        ...(fetchFn ? { fetchFn } : {}),
        ...(signal ? { signal } : {}),
      })
      if (typeof onCout === 'function') onCout(data.cout_microusd ?? 0)
      return {
        text: data.text ?? '',
        usage: {
          inputTokens: data.usage?.inputTokens ?? 0,
          outputTokens: data.usage?.outputTokens ?? 0,
        },
        model: data.model ?? model,
        stopReason: data.stopReason ?? null,
      }
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
  }
}
