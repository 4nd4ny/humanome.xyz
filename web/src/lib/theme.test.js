// Traçabilité — exigence « refonte ergonomie/navigation », point 9 : thème
// sombre complet qui SUIT le système (prefers-color-scheme) tant qu'aucun
// choix n'est fait, avec une bascule manuelle PERSISTÉE (localStorage
// 'humanome-theme') qui PRIME sur le système. Ce fichier prouve lib/theme.js :
// storedTheme, systemTheme, resolvedTheme, applyTheme et subscribeSystemTheme
// (y compris le repli addListener/removeListener des vieux navigateurs et la
// coupure du suivi système dès qu'un choix explicite est stocké). Sprint 9 :
// le retour à « Système » (themeChoice, clearTheme, applyThemeChoice) et
// l'interface (isInterface, storedInterface, resolvedInterface,
// applyInterface ; clé 'humanome-interface', défaut épistémiarque).

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_INTERFACE,
  INTERFACES,
  INTERFACE_LABELS,
  applyInterface,
  applyTheme,
  applyThemeChoice,
  clearTheme,
  isInterface,
  resolvedInterface,
  resolvedTheme,
  storedInterface,
  storedTheme,
  subscribeSystemTheme,
  systemTheme,
  themeChoice,
} from './theme.js'

const STORAGE_KEY = 'humanome-theme'
const INTERFACE_KEY = 'humanome-interface'

/** MediaQueryList factice, API moderne (addEventListener/removeEventListener). */
function fakeMq({ matches = false } = {}) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

/** MediaQueryList factice « vieux Safari » : seulement addListener/removeListener. */
function legacyMq({ matches = false } = {}) {
  return {
    matches,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
}

function stubMatchMedia(mq) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-interface')
})

describe('storedTheme', () => {
  it("retourne le choix explicite stocké ('light' ou 'dark')", () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(storedTheme()).toBe('dark')
    localStorage.setItem(STORAGE_KEY, 'light')
    expect(storedTheme()).toBe('light')
  })

  it('retourne null sans choix stocké (= suit le système)', () => {
    expect(storedTheme()).toBeNull()
  })

  it('retourne null pour une valeur invalide stockée', () => {
    localStorage.setItem(STORAGE_KEY, 'bleu-canard')
    expect(storedTheme()).toBeNull()
  })

  it("retourne null si localStorage jette (navigation privée) au lieu d'exploser", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    expect(storedTheme()).toBeNull()
  })
})

describe('systemTheme', () => {
  it("retourne 'dark' quand le système préfère le sombre", () => {
    stubMatchMedia(fakeMq({ matches: true }))
    expect(systemTheme()).toBe('dark')
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it("retourne 'light' quand le système préfère le clair", () => {
    stubMatchMedia(fakeMq({ matches: false }))
    expect(systemTheme()).toBe('light')
  })

  it("retourne 'light' (défaut sûr) sans matchMedia", () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(systemTheme()).toBe('light')
  })
})

describe('resolvedTheme', () => {
  it('le choix explicite stocké PRIME sur le thème système', () => {
    stubMatchMedia(fakeMq({ matches: true })) // système sombre…
    localStorage.setItem(STORAGE_KEY, 'light') // …mais choix clair stocké
    expect(resolvedTheme()).toBe('light')
  })

  it('sans choix stocké, suit le système', () => {
    stubMatchMedia(fakeMq({ matches: true }))
    expect(resolvedTheme()).toBe('dark')
    stubMatchMedia(fakeMq({ matches: false }))
    expect(resolvedTheme()).toBe('light')
  })
})

describe('applyTheme', () => {
  it('pose data-theme sur <html> ET persiste le choix', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it("n'explose pas si localStorage jette : la bascule reste valable pour la session", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / mode privé')
    })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('subscribeSystemTheme', () => {
  it('relaie les changements système au callback tant qu’AUCUN choix n’est stocké', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    subscribeSystemTheme(cb)

    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    const handler = mq.addEventListener.mock.calls[0][1]

    handler({ matches: true })
    expect(cb).toHaveBeenLastCalledWith('dark')
    handler({ matches: false })
    expect(cb).toHaveBeenLastCalledWith('light')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('n’appelle JAMAIS le callback quand un choix explicite est stocké (le choix prime)', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    localStorage.setItem(STORAGE_KEY, 'light')
    const cb = vi.fn()
    subscribeSystemTheme(cb)

    const handler = mq.addEventListener.mock.calls[0][1]
    handler({ matches: true })
    expect(cb).not.toHaveBeenCalled()
  })

  it('coupe le suivi dès qu’un choix est stocké APRÈS l’abonnement', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    subscribeSystemTheme(cb)
    const handler = mq.addEventListener.mock.calls[0][1]

    handler({ matches: true })
    expect(cb).toHaveBeenCalledTimes(1)

    applyTheme('light') // choix explicite en cours de route
    handler({ matches: false })
    expect(cb).toHaveBeenCalledTimes(1) // plus aucun appel
  })

  it('le désabonnement retire le listener (même handler)', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const unsubscribe = subscribeSystemTheme(vi.fn())
    const handler = mq.addEventListener.mock.calls[0][1]

    unsubscribe()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', handler)
  })

  it('repli addListener/removeListener quand addEventListener manque (vieux Safari)', () => {
    const mq = legacyMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    const unsubscribe = subscribeSystemTheme(cb)

    expect(mq.addListener).toHaveBeenCalledWith(expect.any(Function))
    const handler = mq.addListener.mock.calls[0][0]
    handler({ matches: true })
    expect(cb).toHaveBeenCalledWith('dark')

    unsubscribe()
    expect(mq.removeListener).toHaveBeenCalledWith(handler)
  })

  it('sans matchMedia : retourne un désabonnement inoffensif', () => {
    vi.stubGlobal('matchMedia', undefined)
    const unsubscribe = subscribeSystemTheme(vi.fn())
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe('choix « Système » (sprint 9)', () => {
  it("themeChoice : 'system' sans choix stocké (ou valeur invalide), sinon le choix", () => {
    expect(themeChoice()).toBe('system')
    localStorage.setItem(STORAGE_KEY, 'bleu-canard')
    expect(themeChoice()).toBe('system')
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(themeChoice()).toBe('dark')
  })

  it("clearTheme retire l'attribut ET la clé, et rend le thème du système", () => {
    stubMatchMedia(fakeMq({ matches: true }))
    applyTheme('light')
    expect(clearTheme()).toBe('dark')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(themeChoice()).toBe('system')
  })

  it('clearTheme : stockage qui jette -> pas de crash, attribut retiré', () => {
    applyTheme('dark')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    expect(() => clearTheme()).not.toThrow()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('applyThemeChoice : light / dark posent un choix explicite, system revient au suivi, autre chose est refusé', () => {
    stubMatchMedia(fakeMq({ matches: false }))
    expect(applyThemeChoice('dark')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(applyThemeChoice('system')).toBe('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(() => applyThemeChoice('sepia')).toThrow(TypeError)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('après un retour à « Système », le suivi du système reprend', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    applyTheme('light')
    subscribeSystemTheme(cb)
    const handler = mq.addEventListener.mock.calls[0][1]
    handler({ matches: true })
    expect(cb).not.toHaveBeenCalled()
    applyThemeChoice('system')
    handler({ matches: true })
    expect(cb).toHaveBeenCalledWith('dark')
  })
})

describe('interface (sprint 9)', () => {
  it('trois interfaces, épistémiarque par défaut, libellés des contenus du site', () => {
    expect(INTERFACES).toEqual(['epistemiarque', 'noesiologue', 'technomancien'])
    expect(DEFAULT_INTERFACE).toBe('epistemiarque')
    expect(INTERFACE_LABELS).toEqual({
      epistemiarque: 'Épistémiarque',
      noesiologue: 'Noèsiologue',
      technomancien: 'Technomancien',
    })
    expect(Object.isFrozen(INTERFACES)).toBe(true)
  })

  it('isInterface ne reconnaît que les trois identifiants exacts', () => {
    for (const name of INTERFACES) expect(isInterface(name)).toBe(true)
    for (const other of ['Epistemiarque', 'technomacien', 'dark', '', null, undefined, 3]) {
      expect(isInterface(other)).toBe(false)
    }
  })

  it('storedInterface / resolvedInterface : la valeur stockée connue, sinon null / le défaut', () => {
    expect(storedInterface()).toBeNull()
    expect(resolvedInterface()).toBe('epistemiarque')
    localStorage.setItem(INTERFACE_KEY, 'noesiologue')
    expect(storedInterface()).toBe('noesiologue')
    expect(resolvedInterface()).toBe('noesiologue')
    localStorage.setItem(INTERFACE_KEY, 'bleu-canard')
    expect(storedInterface()).toBeNull()
    expect(resolvedInterface()).toBe('epistemiarque')
  })

  it('storedInterface : localStorage qui jette -> null (le défaut s’applique)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    expect(storedInterface()).toBeNull()
    expect(resolvedInterface()).toBe('epistemiarque')
  })

  it('applyInterface pose data-interface sur <html> ET garde le choix ; le thème n’est pas touché', () => {
    applyInterface('technomancien')
    expect(document.documentElement.getAttribute('data-interface')).toBe('technomancien')
    expect(localStorage.getItem(INTERFACE_KEY)).toBe('technomancien')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    applyInterface('epistemiarque')
    expect(localStorage.getItem(INTERFACE_KEY)).toBe('epistemiarque')
  })

  it('applyInterface refuse une interface inconnue, sans rien écrire', () => {
    expect(() => applyInterface('technomacien')).toThrow(TypeError)
    expect(document.documentElement.hasAttribute('data-interface')).toBe(false)
    expect(localStorage.getItem(INTERFACE_KEY)).toBeNull()
  })

  it('applyInterface : stockage qui jette -> le choix vaut pour la session, sans crash', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / mode privé')
    })
    expect(() => applyInterface('noesiologue')).not.toThrow()
    expect(document.documentElement.getAttribute('data-interface')).toBe('noesiologue')
  })
})
