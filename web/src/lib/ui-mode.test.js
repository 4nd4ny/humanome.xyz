// Mode d'affichage simple / expert (sprint 1, 2026-10-22) : lib/ui-mode.js.
// Choix stocké dans ce navigateur (`humanome-mode`) qui prime ; sans choix, le
// défaut des rôles (expert dès un rôle de travail) ; valeurs inconnues et
// stockage qui lève une exception tolérés ; contexte par défaut « expert ».
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import {
  MODE_KEY,
  UiModeContext,
  WORK_ROLES,
  defaultMode,
  resolvedMode,
  storeMode,
  storedMode,
  useUiMode,
} from './ui-mode.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  }
}

const throwing = {
  getItem() {
    throw new DOMException('Accès refusé', 'SecurityError')
  },
  setItem() {
    throw new DOMException('Quota', 'QuotaExceededError')
  },
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('storedMode / storeMode', () => {
  it('lit « simple » ou « expert » ; toute autre valeur, l’absence ou un stockage qui lève une exception donnent null', () => {
    expect(MODE_KEY).toBe('humanome-mode')
    expect(storedMode(memoryStorage({ [MODE_KEY]: 'simple' }))).toBe('simple')
    expect(storedMode(memoryStorage({ [MODE_KEY]: 'expert' }))).toBe('expert')
    for (const value of ['', 'Expert', 'avance', '1', 'true', 'null']) {
      expect(storedMode(memoryStorage({ [MODE_KEY]: value })), value).toBeNull()
    }
    expect(storedMode(memoryStorage())).toBeNull()
    expect(storedMode(throwing)).toBeNull()
    expect(storedMode(null)).toBeNull()
  })

  it('lit et écrit localStorage par défaut', () => {
    expect(storedMode()).toBeNull()
    expect(storeMode('expert')).toBe(true)
    expect(localStorage.getItem(MODE_KEY)).toBe('expert')
    expect(storedMode()).toBe('expert')
    localStorage.setItem(MODE_KEY, 'bizarre')
    expect(storedMode()).toBeNull()
  })

  it('écrit un choix valide ; un stockage absent ou qui lève une exception rend false, sans erreur ; un mode inconnu est refusé', () => {
    const storage = memoryStorage()
    expect(storeMode('simple', storage)).toBe(true)
    expect(storage.data.get(MODE_KEY)).toBe('simple')
    expect(storeMode('expert', throwing)).toBe(false)
    expect(storeMode('expert', null)).toBe(false)
    expect(() => storeMode('avance', storage)).toThrow(TypeError)
    expect(storage.data.get(MODE_KEY)).toBe('simple')
  })
})

describe('defaultMode / resolvedMode', () => {
  it('défaut selon le rôle : simple pour un visiteur, un apprenant seul ou un employeur ; expert dès un rôle de travail', () => {
    expect(WORK_ROLES).toEqual(['cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'admin'])
    expect(defaultMode([])).toBe('simple')
    expect(defaultMode(undefined)).toBe('simple')
    expect(defaultMode(null)).toBe('simple')
    expect(defaultMode(['apprenant'])).toBe('simple')
    expect(defaultMode(['employeur'])).toBe('simple')
    expect(defaultMode(['apprenant', 'employeur'])).toBe('simple')
    expect(defaultMode(['inconnu'])).toBe('simple')
    for (const role of WORK_ROLES) {
      expect(defaultMode([role]), role).toBe('expert')
      expect(defaultMode(['apprenant', role]), `apprenant + ${role}`).toBe('expert')
    }
  })

  it('le choix stocké prime sur le défaut du rôle, dans les deux sens ; sans choix, le défaut', () => {
    expect(resolvedMode(['apprenant', 'cartographe'], 'simple')).toBe('simple')
    expect(resolvedMode([], 'expert')).toBe('expert')
    expect(resolvedMode(['apprenant'], null)).toBe('simple')
    expect(resolvedMode(['admin'], null)).toBe('expert')
    // Lecture de localStorage par défaut.
    localStorage.setItem(MODE_KEY, 'simple')
    expect(resolvedMode(['admin'])).toBe('simple')
    localStorage.setItem(MODE_KEY, 'inconnu')
    expect(resolvedMode(['admin'])).toBe('expert')
  })
})

describe('UiModeContext', () => {
  function Probe() {
    const { expert } = useUiMode()
    return createElement('p', null, expert ? 'expert' : 'simple')
  }

  it('hors du shell, le contexte vaut expert (un composant qui ignore le mode affiche tout) ; le shell peut fournir simple', () => {
    render(createElement(Probe))
    expect(screen.getByText('expert')).toBeDefined()
    cleanup()
    render(createElement(UiModeContext.Provider, { value: { expert: false, setExpert() {} } }, createElement(Probe)))
    expect(screen.getByText('simple')).toBeDefined()
  })
})
