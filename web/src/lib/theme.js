// Affichage : l'INTERFACE (sprint 9) et le THÈME clair / sombre.
//
// Thème, trois états logiques :
//   - aucun choix explicite (« Système ») : on SUIT le système
//     (prefers-color-scheme), l'attribut data-theme est absent, le CSS s'en
//     charge seul ;
//   - 'light' / 'dark' : choix explicite persistant, posé sur <html data-theme>.
//
// Interface : trois habillages du même site, nommés d'après les filières
// (décision de Christian, 2026-10-23) — épistémiarque (défaut), noèsiologue,
// technomancien —, chacun en clair et en sombre. Toujours posée sur
// <html data-interface> ; une valeur stockée inconnue ramène au défaut.
// C'est un réglage d'affichage de CE navigateur, jamais un droit : aucune
// vue ni le serveur ne le lisent.
//
// Le script anti-FOUC d'index.html pose data-interface (toujours) et
// data-theme (si un choix est stocké) AVANT le premier paint ; ce module gère
// ensuite la bascule à chaud. Les deux clés et la liste des interfaces sont
// recopiées dans ce script : web/src/anti-fouc.test.js les garde alignées.

import { createContext, useContext } from 'react'

const STORAGE_KEY = 'humanome-theme'
const INTERFACE_STORAGE_KEY = 'humanome-interface'

/** Clé localStorage du thème (export pour les tests et la doc). */
export const THEME_KEY = STORAGE_KEY
/** Clé localStorage de l'interface. */
export const INTERFACE_KEY = INTERFACE_STORAGE_KEY

/** Les trois interfaces, dans l'ordre du sélecteur ; la première est le défaut. */
export const INTERFACES = Object.freeze(['epistemiarque', 'noesiologue', 'technomancien'])
export const DEFAULT_INTERFACE = INTERFACES[0]

/** Libellés affichés (orthographe des contenus du site). */
export const INTERFACE_LABELS = Object.freeze({
  epistemiarque: 'Épistémiarque',
  noesiologue: 'Noèsiologue',
  technomancien: 'Technomancien',
})

/** Choix de thème offerts par les sélecteurs, « Système » compris. */
export const THEME_CHOICES = Object.freeze(['system', 'light', 'dark'])
export const THEME_CHOICE_LABELS = Object.freeze({ system: 'Système', light: 'Clair', dark: 'Sombre' })

/** @returns {boolean} true si l'environnement expose un DOM (pas les tests unitaires headless purs) */
function hasDom() {
  return typeof document !== 'undefined' && !!document.documentElement
}

/** @returns {'light' | 'dark' | null} choix explicite stocké, sinon null (= suit le système) */
export function storedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** @returns {'light' | 'dark'} thème du système (défaut clair si indécidable) */
export function systemTheme() {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** @returns {'light' | 'dark'} thème EFFECTIF (choix explicite sinon système) */
export function resolvedTheme() {
  return storedTheme() ?? systemTheme()
}

/**
 * Applique un thème et le persiste comme choix explicite.
 * @param {'light' | 'dark'} theme
 */
export function applyTheme(theme) {
  if (hasDom()) document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* stockage indisponible (mode privé) : la bascule reste valable pour la session */
  }
}

/**
 * S'abonne aux changements du thème système, UNIQUEMENT tant qu'aucun choix
 * explicite n'est stocké (sinon le choix prime). Appelle `cb(theme)` au change.
 * @param {(theme: 'light' | 'dark') => void} cb
 * @returns {() => void} désabonnement
 */
export function subscribeSystemTheme(cb) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event) => {
    if (storedTheme() === null) cb(event.matches ? 'dark' : 'light')
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler)
  else if (typeof mq.addListener === 'function') mq.addListener(handler)
  return () => {
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler)
    else if (typeof mq.removeListener === 'function') mq.removeListener(handler)
  }
}

/** @returns {'system' | 'light' | 'dark'} choix de thème courant (« system » sans choix stocké) */
export function themeChoice() {
  return storedTheme() ?? 'system'
}

/**
 * Revient au suivi du système : retire l'attribut ET le choix stocké.
 * @returns {'light' | 'dark'} le thème système, désormais affiché
 */
export function clearTheme() {
  if (hasDom()) document.documentElement.removeAttribute('data-theme')
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* stockage indisponible : le suivi du système vaut pour la session */
  }
  return systemTheme()
}

/**
 * Applique un choix de thème des sélecteurs (« Système » compris).
 * @param {'system' | 'light' | 'dark'} choice
 * @returns {'light' | 'dark'} le thème effectivement affiché
 */
export function applyThemeChoice(choice) {
  if (choice === 'system') return clearTheme()
  if (choice !== 'light' && choice !== 'dark') {
    throw new TypeError(`applyThemeChoice: thème inconnu « ${choice} » (attendu : system, light ou dark)`)
  }
  applyTheme(choice)
  return choice
}

/** @param {unknown} value @returns {value is 'epistemiarque' | 'noesiologue' | 'technomancien'} */
export function isInterface(value) {
  return INTERFACES.includes(value)
}

/** @returns {string | null} interface stockée si elle est connue, sinon null */
export function storedInterface() {
  try {
    const v = localStorage.getItem(INTERFACE_STORAGE_KEY)
    return isInterface(v) ? v : null
  } catch {
    return null
  }
}

/** @returns {string} interface EFFECTIVE : la stockée, sinon le défaut (épistémiarque) */
export function resolvedInterface() {
  return storedInterface() ?? DEFAULT_INTERFACE
}

/**
 * Applique une interface (attribut data-interface de <html>) et la garde
 * comme choix explicite de ce navigateur.
 * @param {string} name une des INTERFACES
 */
export function applyInterface(name) {
  if (!isInterface(name)) {
    throw new TypeError(`applyInterface: interface inconnue « ${name} » (attendu : ${INTERFACES.join(', ')})`)
  }
  if (hasDom()) document.documentElement.setAttribute('data-interface', name)
  try {
    localStorage.setItem(INTERFACE_STORAGE_KEY, name)
  } catch {
    /* stockage indisponible (mode privé) : le choix reste valable pour la session */
  }
}

/**
 * Réglages d'affichage partagés par le tiroir et « Mon compte » : l'interface
 * et le choix de thème, fournis par le shell (App.jsx). Défaut hors du shell
 * (tests, copie autonome) : l'interface par défaut, le thème du système, sans
 * bascule.
 * @type {import('react').Context<{
 *   interfaceName: string,
 *   setInterface: (name: string) => void,
 *   themeChoice: 'system' | 'light' | 'dark',
 *   setThemeChoice: (choice: 'system' | 'light' | 'dark') => void,
 * }>}
 */
export const DisplayContext = createContext({
  interfaceName: DEFAULT_INTERFACE,
  setInterface() {},
  themeChoice: 'system',
  setThemeChoice() {},
})

/** @returns {import('react').ContextType<typeof DisplayContext>} */
export function useDisplay() {
  return useContext(DisplayContext)
}
