// Appels API de l'espace établissement (contrat M8 fixé — P11). Toutes les
// fonctions passent par apiFetch (cookies de session + X-CSRF-Token, messages
// d'erreur français) et acceptent un `fetchFn` injectable (tests, pattern
// cartographe-api.js). Les réponses sont NORMALISÉES ici pour que les vues ne
// dépendent que d'une seule forme.
//
// Rappel d'architecture M8 (ADR-005, docs/plan-masse.md) : le serveur (worker
// cron / runner Node) n'exécute QUE l'extraction LLM par (membre, journée) ;
// le MERGE déterministe est calculé CÔTÉ CLIENT par le moteur au moment de
// l'affichage (voir membre-merge.js) — jamais réimplémenté côté PHP.

import {
  CHARS_PER_TOKEN_FR,
  getModelPricing,
  PRICING_DISCLAIMER,
} from '@engine/providers/index.js'
import { callsPerDayFor } from '@engine/providers/estimate.js'
import { apiFetch } from '../../api/client.js'

/** @param {string} iso @returns {string} date française courte ('—' si vide) */
export function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}

/** @param {number|null} usd @returns {string} montant USD affichable */
export function money(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return '—'
  return `${usd.toFixed(2)} $`
}

/** Une liste, que l'API la renvoie nue ou enveloppée sous `key`. */
function asList(data, key) {
  if (Array.isArray(data)) return data
  return Array.isArray(data?.[key]) ? data[key] : []
}

// --- Cohortes ----------------------------------------------------------------

/** GET api/etablissement/cohortes -> [{id, nom, codeInvitation, membres, createdAt}] */
export async function fetchCohortes(fetchFn) {
  return asList(await apiFetch('etablissement/cohortes', { fetchFn }), 'cohortes')
}

/** POST api/etablissement/cohortes {nom} -> {id, codeInvitation} */
export async function createCohorte(nom, fetchFn) {
  return apiFetch('etablissement/cohortes', { method: 'POST', body: { nom }, fetchFn })
}

/** Normalise un membre de cohorte (tolérant aux deux casses du contrat). */
function normalizeMembre(m) {
  const portfolio = m?.portfolio ?? m?.depot ?? null
  // avancement : OBJET {jobsTotal, jobsDone} agrégé sur tous les runs de la
  // cohorte (contrat M8) — normalisé en nombres, jamais rendu tel quel.
  const avancement =
    m?.avancement && typeof m.avancement === 'object'
      ? {
          jobsTotal: Number(m.avancement.jobsTotal ?? m.avancement.jobs_total ?? 0),
          jobsDone: Number(m.avancement.jobsDone ?? m.avancement.jobs_done ?? 0),
        }
      : null
  return {
    userId: m?.userId ?? m?.id ?? null,
    displayName: m?.displayName ?? m?.email ?? '—',
    email: m?.email ?? null,
    consentAt: m?.consentAt ?? m?.consent_at ?? null,
    portfolio: portfolio
      ? {
          titre: portfolio.titre ?? '—',
          journees: Number(portfolio.journees ?? portfolio.nbJournees ?? 0),
          taille: Number(portfolio.taille ?? portfolio.chars ?? 0) || null,
          deposeLe: portfolio.deposeLe ?? portfolio.depose_le ?? null,
        }
      : null,
    avancement,
  }
}

/**
 * GET api/etablissement/cohortes/{id} — détail (membres avec consent_at,
 * dépôt de portfolio, avancement).
 * @returns {Promise<{cohorte: object, membres: object[]}>}
 */
export async function fetchCohorte(id, fetchFn) {
  const data = await apiFetch(`etablissement/cohortes/${encodeURIComponent(id)}`, { fetchFn })
  const cohorte = data?.cohorte ?? data ?? {}
  return {
    cohorte: {
      id: cohorte.id ?? id,
      nom: cohorte.nom ?? '—',
      codeInvitation: cohorte.codeInvitation ?? cohorte.code_invitation ?? null,
    },
    membres: asList(data, 'membres').map(normalizeMembre),
  }
}

/** DELETE api/etablissement/cohortes/{id} */
export function deleteCohorte(id, fetchFn) {
  return apiFetch(`etablissement/cohortes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    fetchFn,
  })
}

// --- Configuration LLM / budget ------------------------------------------------

/**
 * GET api/etablissement/config — la clé API n'est JAMAIS renvoyée : le serveur
 * indique seulement sa présence (hasApiKey).
 * @returns {Promise<{provider: 'humanome'|'endpoint', endpointUrl: string,
 *   model: string, budgetCapUsd: number|null, spentUsd: number, hasApiKey: boolean}>}
 */
export async function fetchConfig(fetchFn) {
  const data = await apiFetch('etablissement/config', { fetchFn })
  const config = data?.config ?? data ?? {}
  return {
    provider: config.provider === 'endpoint' ? 'endpoint' : 'humanome',
    endpointUrl: config.endpointUrl ?? config.endpoint_url ?? '',
    model: config.model ?? '',
    budgetCapUsd: typeof config.budgetCapUsd === 'number' ? config.budgetCapUsd : null,
    spentUsd: typeof config.spentUsd === 'number' ? config.spentUsd : 0,
    hasApiKey: Boolean(config.hasApiKey ?? config.has_api_key),
  }
}

/**
 * PUT api/etablissement/config {provider, endpointUrl?, apiKey?, model?,
 * budgetCapUsd}. La clé n'est envoyée QUE si l'utilisateur en a saisi une
 * nouvelle (chiffrée sodium côté serveur, pattern KeyVault AD-4).
 */
export function saveConfig(body, fetchFn) {
  return apiFetch('etablissement/config', { method: 'PUT', body, fetchFn })
}

// --- Runs de masse ---------------------------------------------------------------

/**
 * GET api/prompt-packages — paquets PUBLIÉS seulement : le worker substitue
 * les gabarits {{placeholders}} du paquet stocké en base, le paquet embarqué
 * du moteur (BUILTIN, run local) n'est donc PAS proposable en masse.
 */
export async function fetchPublishedPackages(fetchFn) {
  const list = asList(await apiFetch('prompt-packages', { fetchFn }), 'packages')
  return list.filter((p) => typeof p?.id === 'string' && typeof p?.version === 'string')
}

/** Modèle de référence de l'estimation quand provider = 'humanome' (prod M5). */
export const SERVICE_MODEL = 'claude-sonnet-5'

/** Taille moyenne par défaut d'une journée quand le dépôt ne la fournit pas. */
export const DEFAULT_DAY_CHARS = 3000

/** Surcoût fixe de prompt par appel (référentiel + protocole), ordre de grandeur. */
const PROMPT_OVERHEAD_CHARS = 30000

/** Tokens de sortie par appel (leçon M5 : JSON compact, budget 8192 plafond). */
const OUTPUT_TOKENS_PER_CALL = 1000

/**
 * Estimation du coût d'un run de MASSE : extraction seule — par journée, un
 * appel par pôle du référentiel du run, plus le kairos (RESPIRE v7 : 8) ; les
 * narratifs de fusion ne sont pas générés côté serveur (le merge est
 * déterministe, côté client). Modèle inconnu de la table de prix (endpoint
 * local, Ollama…) -> coût null, affiché « inconnu ».
 *
 * @param {{totalJournees: number, avgDayChars?: number, model?: string,
 *   referentiel: {poles: Array}}} params referentiel : le document du référentiel du run
 * @returns {{totalCalls: number, tokensIn: number, tokensOut: number,
 *   costUsd: number|null, disclaimer: string}}
 */
export function estimateMassRun({ totalJournees, avgDayChars = DEFAULT_DAY_CHARS, model, referentiel }) {
  const days = Math.max(0, Number(totalJournees) || 0)
  const totalCalls = days * callsPerDayFor(referentiel)
  const tokensIn = Math.ceil((totalCalls * (avgDayChars + PROMPT_OVERHEAD_CHARS)) / CHARS_PER_TOKEN_FR)
  const tokensOut = totalCalls * OUTPUT_TOKENS_PER_CALL
  const pricing = getModelPricing(model)
  const costUsd = pricing
    ? Math.round(((tokensIn * pricing.input) / 1e6 + (tokensOut * pricing.output) / 1e6) * 100) / 100
    : null
  return { totalCalls, tokensIn, tokensOut, costUsd, disclaimer: PRICING_DISCLAIMER }
}

/**
 * POST api/etablissement/cohortes/{id}/runs {promptPackageId,
 * promptPackageVersion, referentielId?, referentielVersion?, membres?} ->
 * {runId, jobs} — un job = (membre consenti AYANT DÉPOSÉ son portfolio,
 * journée) ; sans référentiel nommé, le serveur prend la dernière version
 * publiée de RESPIRE.
 */
export function launchRun(cohorteId, body, fetchFn) {
  return apiFetch(`etablissement/cohortes/${encodeURIComponent(cohorteId)}/runs`, {
    method: 'POST',
    body,
    fetchFn,
  })
}

/** Statuts de jobs du contrat M8, avec libellés français d'affichage. */
// Les six statuts de mass_jobs (contrat M8, migration 009) — les clés sont
// celles de l'API ; fetchRun tolère les alias historiques pending/error.
export const JOB_STATUS_LABELS = Object.freeze({
  queued: 'En attente',
  running: 'En cours',
  done: 'Terminés',
  failed: 'En erreur',
  budget_exceeded: 'Budget dépassé',
  cancelled: 'Annulés',
})

const JOB_STATUS_ALIASES = Object.freeze({ queued: 'pending', failed: 'error' })

/**
 * GET api/etablissement/runs/{runId} — avancement en direct.
 * @returns {Promise<{runId, statut: string, jobs: Record<string, number>,
 *   coutUsd: number, erreurs: Array<{membre: string, message: string}>}>}
 */
export async function fetchRun(runId, fetchFn) {
  const data = await apiFetch(`etablissement/runs/${encodeURIComponent(runId)}`, { fetchFn })
  const run = data?.run ?? data ?? {}
  const jobs = {}
  for (const status of Object.keys(JOB_STATUS_LABELS)) {
    jobs[status] = Number(run.jobs?.[status] ?? run.jobs?.[JOB_STATUS_ALIASES[status]] ?? 0)
  }
  return {
    runId: run.runId ?? run.id ?? runId,
    statut: run.statut ?? run.status ?? 'active',
    jobs,
    coutUsd: typeof run.coutUsd === 'number' ? run.coutUsd : Number(run.coutUsd ?? 0) || 0,
    erreurs: asList(run, 'erreurs').map((e) => ({
      membre: e?.membre ?? e?.displayName ?? String(e?.userId ?? '—'),
      message: e?.message ?? e?.erreur ?? String(e),
    })),
  }
}

/** POST api/etablissement/runs/{runId}/annuler */
export function cancelRun(runId, fetchFn) {
  return apiFetch(`etablissement/runs/${encodeURIComponent(runId)}/annuler`, {
    method: 'POST',
    fetchFn,
  })
}

// --- Documents d'un membre --------------------------------------------------------

/**
 * GET api/etablissement/membres/{userId}/documents — les documents JOUR
 * produits pour les cohortes de CET établissement uniquement (consentement
 * du membre), chacun avec le run qui l'a produit et la version du référentiel
 * que ce run a figée (absente : RESPIRE, version inconnue). Le merge est
 * ensuite calculé côté client (membre-merge.js).
 * @returns {Promise<{membre: object, documents: Array<{date: string,
 *   cohorte: string|null, runId: number|null, referentiel: {id: string,
 *   version: string|null}, document: object}>}>}
 */
export async function fetchMembreDocuments(userId, fetchFn) {
  const data = await apiFetch(`etablissement/membres/${encodeURIComponent(userId)}/documents`, {
    fetchFn,
  })
  const membre = data?.membre ?? {}
  return {
    membre: {
      userId: membre.userId ?? membre.id ?? userId,
      displayName: membre.displayName ?? membre.email ?? `membre ${userId}`,
      consentAt: membre.consentAt ?? membre.consent_at ?? null,
    },
    documents: asList(data, 'documents')
      .map((d) => ({
        date: d?.date ?? d?.document?.date ?? null,
        cohorte: d?.cohorte?.nom ?? d?.cohorte ?? null,
        runId: Number.isInteger(d?.runId) ? d.runId : null,
        referentiel: {
          id: typeof d?.referentiel?.id === 'string' && d.referentiel.id !== '' ? d.referentiel.id : 'respire',
          version: typeof d?.referentiel?.version === 'string' && d.referentiel.version !== '' ? d.referentiel.version : null,
        },
        document: d?.document ?? null,
      }))
      .filter((d) => d.document && typeof d.date === 'string'),
  }
}

// --- L'école : crédit, surtaxe, plafond par élève, clé (sprint 6, lot S6b — ADR-013) ----------

/**
 * GET api/etablissement/ecole — ses réglages, son crédit, ses clés (jamais leur
 * matériau : le fournisseur et la date), ses élèves et ce que chacun a engagé
 * ce mois-ci et en tout (des montants seulement).
 * @returns {Promise<{surtaxePct: number, surtaxeMin: number, surtaxeMax: number,
 *   plafondEleveMicrousd: number, respireNumero: number|null, creditMicrousd: number,
 *   cles: Array<{fournisseur: string, poseeLe: string}>, chiffrementDisponible: boolean,
 *   mois: string, depenseMoisMicrousd: number, eleves: Array<object>}>}
 */
export async function fetchEcole(fetchFn) {
  const data = await apiFetch('etablissement/ecole', { fetchFn })
  return {
    surtaxePct: Number(data?.surtaxePct ?? 3.5),
    surtaxeMin: Number(data?.surtaxeMin ?? 3.5),
    surtaxeMax: Number(data?.surtaxeMax ?? 10),
    plafondEleveMicrousd: Number(data?.plafondEleveMicrousd ?? 0),
    respireNumero: Number.isInteger(data?.respireNumero) ? data.respireNumero : null,
    creditMicrousd: Number(data?.creditMicrousd ?? 0),
    cles: asList(data, 'cles'),
    chiffrementDisponible: data?.chiffrementDisponible !== false,
    mois: typeof data?.mois === 'string' ? data.mois : '',
    depenseMoisMicrousd: Number(data?.depenseMoisMicrousd ?? 0),
    eleves: asList(data, 'eleves').map((e) => ({
      userId: e?.userId ?? null,
      displayName: e?.displayName ?? '—',
      cohortes: Array.isArray(e?.cohortes) ? e.cohortes : [],
      membre: e?.membre !== false,
      moisMicrousd: Number(e?.moisMicrousd ?? 0),
      totalMicrousd: Number(e?.totalMicrousd ?? 0),
    })),
    // ceux qui ont quitté ses cohortes : leurs montants ensemble, jamais leur nom (ADR-013 §7)
    partis: {
      nombre: Number(data?.partis?.nombre ?? 0),
      moisMicrousd: Number(data?.partis?.moisMicrousd ?? 0),
      totalMicrousd: Number(data?.partis?.totalMicrousd ?? 0),
    },
  }
}

/** PUT api/etablissement/ecole {surtaxePct?, plafondEleveUsd?} — la surtaxe entre 3,5 et 10, au centième. */
export function saveEcole(body, fetchFn) {
  return apiFetch('etablissement/ecole', { method: 'PUT', body, fetchFn })
}

/** PUT api/etablissement/ecole/cle {cle} — la clé Anthropic de l'école, chiffrée, jamais rendue. */
export function poserCleEcole(cle, fetchFn) {
  return apiFetch('etablissement/ecole/cle', { method: 'PUT', body: { cle, fournisseur: 'anthropic' }, fetchFn })
}

/** DELETE api/etablissement/ecole/cle/anthropic — la clé retirée pour de bon. */
export function retirerCleEcole(fetchFn) {
  return apiFetch('etablissement/ecole/cle/anthropic', { method: 'DELETE', fetchFn })
}
