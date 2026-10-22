// Mode d'affichage « simple » / « expert » (sprint 1, docs/ergonomie-navigation.md §5ter).
//
// Le rôle fixe les DROITS, le mode fixe la DENSITÉ de l'affichage : le mode
// simple masque des réglages avancés (profils Twin9, versions de prompt,
// modèles, espace Comparaison, tuile Réglages, outil d'anonymisation), il
// n'interdit rien. Aucune garde de vue ni du serveur ne le lit ; toute adresse
// directe reste valide.
//
// Trois états logiques, sur le modèle du thème (lib/theme.js) :
//   - aucun choix stocké : le défaut dépend des rôles de la session —
//     « expert » dès qu'un rôle de TRAVAIL est présent, « simple » sinon
//     (visiteur, apprenant seul, employeur) ;
//   - 'simple' / 'expert' : choix explicite, gardé dans CE navigateur
//     (localStorage `humanome-mode`), qui prime sur le défaut du rôle.
// Le choix n'est écrit qu'au basculement : un défaut dérivé n'est jamais
// stocké (sinon le « simple » d'un visiteur survivrait à sa connexion de
// cartographe).
//
// Principe 4 : un composant qui ignore le mode affiche TOUT. La valeur par
// défaut du contexte est « expert » ; seul le shell (App.jsx) peut choisir le
// mode simple.

import { createContext, useContext } from 'react'

export const MODE_KEY = 'humanome-mode'

/** Rôles de travail : leur présence met le mode expert par défaut (D3). */
export const WORK_ROLES = Object.freeze(['cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'admin'])

/** @param {unknown} value @returns {value is 'simple' | 'expert'} */
function isMode(value) {
  return value === 'simple' || value === 'expert'
}

/**
 * Choix explicite stocké, ou null : rien de stocké, valeur inconnue, ou
 * stockage illisible (navigation privée, accès refusé).
 * @param {Pick<Storage, 'getItem'> | null} [storage] défaut : localStorage
 * @returns {'simple' | 'expert' | null}
 */
export function storedMode(storage) {
  try {
    const store = storage === undefined ? localStorage : storage
    const value = store?.getItem(MODE_KEY) ?? null
    return isMode(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Mode par défaut d'une session, sans choix stocké.
 * @param {string[] | null | undefined} roles
 * @returns {'simple' | 'expert'}
 */
export function defaultMode(roles) {
  return (roles ?? []).some((role) => WORK_ROLES.includes(role)) ? 'expert' : 'simple'
}

/**
 * Mode effectif : le choix stocké, sinon le défaut des rôles.
 * @param {string[] | null | undefined} roles
 * @param {'simple' | 'expert' | null} [stored] défaut : storedMode()
 * @returns {'simple' | 'expert'}
 */
export function resolvedMode(roles, stored = storedMode()) {
  return isMode(stored) ? stored : defaultMode(roles)
}

/**
 * Enregistre un choix explicite. Stockage indisponible : le choix vaut pour
 * la session ouverte seulement, sans erreur.
 * @param {'simple' | 'expert'} mode
 * @param {Pick<Storage, 'setItem'> | null} [storage] défaut : localStorage
 * @returns {boolean} true si le choix a été écrit
 */
export function storeMode(mode, storage) {
  if (!isMode(mode)) throw new TypeError(`storeMode: mode inconnu « ${mode} » (attendu : simple ou expert)`)
  try {
    const store = storage === undefined ? localStorage : storage
    if (!store) return false
    store.setItem(MODE_KEY, mode)
    return true
  } catch {
    return false
  }
}

/**
 * Contexte du mode. Défaut : expert, sans bascule (un composant rendu hors du
 * shell — tests, copie autonome — affiche tout).
 * @type {import('react').Context<{expert: boolean, setExpert: (expert: boolean) => void}>}
 */
export const UiModeContext = createContext({ expert: true, setExpert() {} })

/** @returns {{expert: boolean, setExpert: (expert: boolean) => void}} */
export function useUiMode() {
  return useContext(UiModeContext)
}
