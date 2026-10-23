// Qui paie un usage payant (sprint 6, lot S6b — ADR-013 §4) : l'analyse
// approfondie (Twin9) et la cartographie ouverte sur crédits (Twin6).
//
// Le serveur dit les payeurs possibles d'un compte (GET /api/twin9/meta,
// `payeurs` ; et l'aperçu d'un run) : chacune de ses écoles — celles dont une
// cohorte le compte, elle-même pour une école —, avec ce qu'elle peut encore
// payer pour lui ce mois-ci (son plafond restant) et si son crédit le couvre
// (`credit_suffisant`), jamais le crédit de l'école ; et son propre solde
// restant, acheté avant l'ADR-013, quand il en a un. Le serveur choisit par
// défaut son école quand il n'en a qu'une ; avec plusieurs, l'élève choisit.
//
// Ce module ne fait que lire et dire : la valeur d'un choix ('' pour le défaut
// du serveur, 'personnel', ou l'identifiant d'une école en texte) devient le
// `payeur` des requêtes (valeurPayeur).

import { formatUsd } from '../api/twin9.js'

/** Le texte que l'élève lit : son école voit le montant, jamais le contenu (ADR-013 §7). */
export const ECOLE_VOIT_LE_MONTANT =
  'Elle voit le montant de ce qu’elle paie pour vous, jamais le contenu de vos analyses.'

/** @param {unknown} payeurs @returns {Array<object>} les payeurs, une liste même vide */
export function listePayeurs(payeurs) {
  return Array.isArray(payeurs) ? payeurs.filter((p) => p && (p.type === 'ecole' || p.type === 'personnel')) : []
}

/** Les écoles qui paient pour l'élève (pas une école pour elle-même). */
export function ecolesQuiPaient(payeurs) {
  return listePayeurs(payeurs).filter((p) => p.type === 'ecole' && !p.soi)
}

/**
 * Ce qu'un payeur peut encore payer ce mois-ci, en micro-USD : une école, le
 * plafond restant de l'élève (sur sa clé comme sur son crédit) — son crédit,
 * pour une école qui paie pour elle-même ; son propre solde pour l'élève.
 */
export function resteMicrousd(payeur, cle = 'instance') {
  if (!payeur) return 0
  if (payeur.type === 'personnel') return Number(payeur.solde_microusd ?? 0)
  const reste = cle === 'ecole' ? payeur.reste_cle_microusd : payeur.reste_credit_microusd
  return Number(reste ?? payeur.reste_credit_microusd ?? 0)
}

/**
 * Le crédit de l'école qui paie pour l'élève ne couvre pas ce qui reste de
 * son plafond, sur sa clé de l'instance ($cle 'instance') : une analyse peut
 * s'arrêter en cours. Le serveur ne le dit que par un booléen, jamais le
 * montant de ce crédit.
 */
export function creditEcoleBas(payeur, cle = 'instance') {
  return Boolean(payeur && payeur.type === 'ecole' && !payeur.soi && cle !== 'ecole' && payeur.credit_suffisant === false)
}

/** Ce que l'élève lit quand le crédit de son école est bas (creditEcoleBas). */
export const CREDIT_ECOLE_BAS =
  'Le crédit de votre école ne couvre pas tout ce qu’elle vous accorde ce mois-ci : une analyse peut s’arrêter en ' +
  'cours. Prévenez-la, pour qu’elle le recharge.'

/** Le libellé d'un payeur dans un menu. */
export function libellePayeur(payeur, cle = 'instance') {
  if (payeur.type === 'personnel') return `Mon solde restant (${formatUsd(payeur.solde_microusd ?? 0)})`
  if (payeur.soi) return `Mon école, ${payeur.nom} (crédit : ${formatUsd(resteMicrousd(payeur, cle))})`
  return `Mon école, ${payeur.nom} (il me reste ${formatUsd(resteMicrousd(payeur, cle))} ce mois-ci)`
}

/** La valeur d'un payeur dans un menu : 'personnel', ou l'identifiant de l'école en texte. */
export function valeurDe(payeur) {
  return payeur.type === 'personnel' ? 'personnel' : String(payeur.id)
}

/**
 * Le choix par défaut d'une page : le seul payeur possible, ou la seule école
 * (le défaut du serveur) ; '' quand l'élève doit choisir (plusieurs écoles).
 */
export function choixParDefaut(payeurs) {
  const liste = listePayeurs(payeurs)
  const ecoles = liste.filter((p) => p.type === 'ecole')
  if (ecoles.length === 1) return valeurDe(ecoles[0])
  if (ecoles.length === 0 && liste.length === 1) return valeurDe(liste[0])
  return ''
}

/** Le payeur d'un choix, ou null. */
export function payeurChoisi(payeurs, choix) {
  return listePayeurs(payeurs).find((p) => valeurDe(p) === choix) ?? null
}

/** Le `payeur` d'une requête : null (le défaut du serveur), 'personnel', ou l'identifiant d'une école. */
export function valeurPayeur(choix) {
  if (choix === '' || choix == null) return null
  if (choix === 'personnel') return 'personnel'
  const id = Number(choix)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** La phrase d'un usage payé par l'école de l'élève, ou '' (son solde, ou une école pour elle-même). */
export function phrasePayeur(payeur) {
  if (!payeur || payeur.type !== 'ecole' || payeur.soi) return ''
  return `Payé par votre école, ${payeur.nom}. ${ECOLE_VOIT_LE_MONTANT}`
}
