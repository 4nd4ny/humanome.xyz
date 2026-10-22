// Client de l'API Twin9 (ADR-010, ADR-011) — le SEUL point où le front parle
// au serveur Twin9. Les runs tournent sur le serveur ; les gabarits n'en sortent
// que vers l'atelier (admin ∧ promptologue), et le reste du front ne reçoit que
// des résultats filtrés.
//
// apiFetch (api/client.js) gère la session (cookie), le CSRF et la dégradation
// propre en copie statique (ApiUnavailableError).

import { apiFetch } from './client.js'

/**
 * Ce que lisent la page du crédit et la cartographie ouverte (Twin6) : offre
 * Twin6, packs, PayPal, structure du référentiel, solde, clé privée disponible.
 * (La promotion n'y est plus depuis le 2026-10-20 : la page Configuration la lit
 * dans /api/twin9/configuration.)
 */
export function fetchTwin9Meta(options) {
  return apiFetch('twin9/meta', options)
}

/** Solde + 50 derniers événements du grand-livre. */
export function fetchCredit(options) {
  return apiFetch('twin9/credit', options)
}

/** Suivi des dépenses par mois (12 derniers) + solde. */
export function fetchDepenses(options) {
  return apiFetch('twin9/depenses', options)
}

/** Facture récapitulative d'un mois (données ; le rendu imprimable est côté vue). */
export function fetchFacture(annee, mois, options) {
  return apiFetch(`twin9/facture?annee=${Number(annee)}&mois=${Number(mois)}`, options)
}

/** Crée un ordre PayPal pour un pack -> {approve_url, order_id}. */
export function creerRecharge(packIndex, options) {
  return apiFetch('twin9/credit/paypal/creer', {
    ...options,
    method: 'POST',
    body: { pack_index: packIndex },
  })
}

/** Capture un ordre PayPal approuvé (idempotent) -> {solde_microusd}. */
export function capturerRecharge(orderId, options) {
  return apiFetch('twin9/credit/paypal/capturer', {
    ...options,
    method: 'POST',
    body: { order_id: orderId },
  })
}

/**
 * Rembourse le solde inutilisé À LA DEMANDE (jamais automatique) vers PayPal.
 * Sans montant : rembourse tout le solde remboursable. -> {rembourse_microusd,
 * solde_microusd}.
 */
export function rembourserSolde(options) {
  return apiFetch('twin9/credit/rembourser', {
    ...options,
    method: 'POST',
    body: {},
  })
}

// ---- Configuration (T13 : les profils de ses runs, tout compte) ----------

/** Ses profils (sans document), le profil v9.8 et ce que l'instance permet de choisir. */
export function fetchConfiguration(options) {
  return apiFetch('twin9/configuration', options)
}

/** Un de ses profils : {id, nom, profil}. */
export function fetchProfil(id, options) {
  return apiFetch(`twin9/profils/${id}`, options)
}

/** Un nouveau profil, rendu complété : {id, nom, profil}. */
export function createProfil(nom, profil, options) {
  return apiFetch('twin9/profils', { ...options, method: 'POST', body: { nom, profil } })
}

/** Un de ses profils, modifié, rendu complété : {id, nom, profil}. */
export function saveProfil(id, nom, profil, options) {
  return apiFetch(`twin9/profils/${id}`, { ...options, method: 'PUT', body: { nom, profil } })
}

export function deleteProfil(id, options) {
  return apiFetch(`twin9/profils/${id}`, { ...options, method: 'DELETE' })
}

// ---- Runs sur le serveur (T9 : lancer, suivre, lire) ---------------------

/** Ses runs, et si l'analyse approfondie tourne sur cette instance : {disponible, runs}. */
export function fetchRuns(options) {
  return apiFetch('twin9/runs', options)
}

/**
 * Avant de lancer (T10) : les journées que le run instruirait — nouvelles ou
 * changées depuis la mémoire de sa carte —, son coût et sa durée estimés, les
 * plafonds de son profil, le crédit quand la clé de l'instance paie. Rien
 * n'est gardé.
 * @param {{profil: number|null, portfolio: {nom: string, texte: string}}} choix
 */
export function apercuRun(choix, options) {
  return apiFetch('twin9/runs/apercu', { ...options, method: 'POST', body: choix })
}

/**
 * Lance un run : son profil (null : celui de la v9.8), son portfolio, l'accord
 * de la personne, qui chaque lancement demande et qui nomme les fournisseurs
 * auxquels le run envoie le texte ({fournisseurs: [ids]}, ADR-012 ; le serveur
 * refuse une liste qui n'est pas celle du profil). Rend le run tel que sa page le suit.
 * @param {{profil: number|null, portfolio: {nom: string, texte: string}, accord: {fournisseurs: string[]}|boolean,
 *   visibilite?: string}} lancement
 */
export function lancerRun(lancement, options) {
  return apiFetch('twin9/runs', { ...options, method: 'POST', body: lancement })
}

/** Un de ses runs, tel que sa page le suit : statut, progression, ce qui le retarde. */
export function fetchRun(id, options) {
  return apiFetch(`twin9/runs/${id}`, options)
}

/** La page d'un run fait avancer les runs de la personne : {avance, locked}. */
export function avancerRuns(options) {
  return apiFetch('twin9/runs/avancer', { ...options, method: 'POST' })
}

export function annulerRun(id, options) {
  return apiFetch(`twin9/runs/${id}/annuler`, { ...options, method: 'POST' })
}

/**
 * Reprend un run annulé ou arrêté ; arrêté par son budget, sous un nouveau
 * budget (plafonds.budget_usd : des dollars, ou null pour aucun).
 */
export function reprendreRun(id, options, plafonds) {
  return apiFetch(`twin9/runs/${id}/reprendre`, { ...options, method: 'POST', ...(plafonds ? { body: plafonds } : {}) })
}

/** Qui lit ses résultats, outre elle-même : personne ('privee') ou son cartographe ('cartographe'). */
export function rendreRunVisible(id, visibilite, options) {
  return apiFetch(`twin9/runs/${id}/visibilite`, { ...options, method: 'PUT', body: { visibilite } })
}

/**
 * Ses résultats, filtrés : {run, lecteur, sorties: {chemin: texte}, memoire: [journées], referentiel} —
 * referentiel, celui avec lequel se lit sa carte (T17 : pôles et compétences, sans description), nul
 * pour un run d'avant T16.
 */
export function fetchResultats(id, options) {
  return apiFetch(`twin9/runs/${id}/resultats`, options)
}

// ---- Administration (rôle admin) ----------------------------------------

// Les jeux de gabarits (T14) : le jeu v9.8, en lecture seule, et les copies
// qu'en font les promptologues ; « jeu » est « v9.8 » ou l'identifiant d'une copie.

/** Les jeux de l'instance et le jeu par défaut, sans contenu (administrateur). */
export function fetchJeux(options) {
  return apiFetch('twin9/admin/jeux', options)
}

/** Copie le jeu v9.8 sous le nom donné (atelier). */
export function copierJeu(id, options) {
  return apiFetch('twin9/admin/jeux', { ...options, method: 'POST', body: { id } })
}

/** Le jeu par défaut de l'instance, celui du profil par défaut (administrateur). */
export function fixerJeuDefaut(jeu, options) {
  return apiFetch('twin9/admin/jeux/defaut', { ...options, method: 'PUT', body: { jeu } })
}

const jeuPath = (jeu) => `twin9/admin/jeux/${encodeURIComponent(jeu)}`

export function fetchProtocoleList(jeu, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole`, options)
}

export function fetchProtocole(jeu, name, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole/${encodeURIComponent(name)}`, options)
}

export function saveProtocole(jeu, name, content, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole/${encodeURIComponent(name)}`, {
    ...options,
    method: 'PUT',
    body: { content },
  })
}

export function fetchProtocoleVersions(jeu, name, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole/${encodeURIComponent(name)}/versions`, options)
}

/** Une version ARCHIVÉE avec son contenu (D13 — lecture avant restauration). */
export function fetchProtocoleVersion(jeu, name, version, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole/${encodeURIComponent(name)}/versions/${version}`, options)
}

/** Restaure une version archivée d'une copie comme gabarit vivant (D13 — jamais destructif). */
export function restoreProtocoleVersion(jeu, name, version, options) {
  return apiFetch(`${jeuPath(jeu)}/protocole/${encodeURIComponent(name)}/restore`, {
    ...options,
    method: 'POST',
    body: { version },
  })
}

export function fetchTwin9Config(options) {
  return apiFetch('twin9/admin/config', options)
}

export function saveTwin9Config(partial, options) {
  return apiFetch('twin9/admin/config', { ...options, method: 'PUT', body: partial })
}

export function testerProtocole(jeu, name, variables, options) {
  return apiFetch(`${jeuPath(jeu)}/tester`, {
    ...options,
    method: 'POST',
    body: { name, variables },
  })
}

/** Table de surveillance des comptes (soldes, cumuls, dernière activité). */
export function fetchComptes(options) {
  return apiFetch('twin9/admin/comptes', options)
}

/** Micro-USD -> chaîne « 1,23 $ » (les montants voyagent en micro-USD entiers). */
export function formatUsd(microusd) {
  const usd = (Number(microusd) || 0) / 1_000_000
  return `${usd.toFixed(usd !== 0 && Math.abs(usd) < 0.01 ? 4 : 2).replace('.', ',')} $`
}

/**
 * Référentiel du /twin9/meta ([{num, nom, competences:[{code, nom}]}]) mis à la
 * forme moteur/adaptateurs : { poles: [{num, nom}], competences: [{code, nom,
 * pole}] }. Utilisé par l'adaptateur Twin6 (mapper → sunburst).
 *
 * @param {Array<{num:number, nom:string, competences?:Array<{code:string, nom:string}>}>} metaReferentiel
 */
export function referentielPourMoteur(metaReferentiel) {
  const src = Array.isArray(metaReferentiel) ? metaReferentiel : []
  return {
    poles: src.map((p) => ({ num: p.num, nom: p.nom })),
    competences: src.flatMap((p) =>
      (p.competences ?? []).map((c) => ({ code: c.code, nom: c.nom, pole: p.num })),
    ),
  }
}
