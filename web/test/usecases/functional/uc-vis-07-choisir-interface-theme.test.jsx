// UC-VIS-07 — Choisir son interface et son thème : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-07-choisir-interface-theme.md
//
// L'application ENTIÈRE (<App/>) : les listes « Interface » et « Thème » au
// bas du tiroir, la bascule de thème de l'en-tête, la ligne « Affichage » de
// « Mon compte ». Les choix vivent dans localStorage (`humanome-interface`,
// `humanome-theme`) et sur <html> (data-interface, data-theme) ; le
// rechargement est simulé par le script anti-FOUC d'index.html, exécuté
// contre le vrai document, puis un nouveau montage. jsdom n'a pas de
// matchMedia : le système est réputé clair, et n'applique pas les styles.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { jsonResponse } from '../support/vis.js'
import { routedFetch } from '../support/appl-http.js'

const here = dirname(fileURLToPath(import.meta.url))
const antiFouc = readFileSync(resolve(here, '../../../index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]

const visitor = async () => ({ user: null })
const account = (roles) => async () => ({ user: { id: 5, displayName: 'Noé', roles, hasAvatar: false } })

function openApp(hash, fetchMeFn = visitor) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

/** « Rechargement » : <html> nu, script anti-FOUC sur le vrai document, nouveau montage. */
function reload(hash = '#/') {
  cleanup()
  document.documentElement.removeAttribute('data-interface')
  document.documentElement.removeAttribute('data-theme')
  new Function(antiFouc)()
  const firstPaint = {
    interface: document.documentElement.getAttribute('data-interface'),
    theme: document.documentElement.getAttribute('data-theme'),
  }
  openApp(hash)
  return firstPaint
}

const html = () => document.documentElement
const mainNav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))
const burger = () => screen.getByRole('button', { name: 'Menu de navigation' })
const drawerInterface = () => mainNav().getByRole('combobox', { name: 'Interface' })
const drawerTheme = () => mainNav().getByRole('combobox', { name: 'Thème' })

beforeEach(() => {
  resetApiClient()
  localStorage.clear()
  html().removeAttribute('data-interface')
  html().removeAttribute('data-theme')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
  html().removeAttribute('data-interface')
  html().removeAttribute('data-theme')
})

describe('UC-VIS-07 — choisir son interface', () => {
  it('UC-VIS-07-F01 — nominal : un visiteur, en épistémiarque sans choix, ouvre le tiroir et choisit « Noèsiologue » ; <html> change aussitôt, le tiroir reste ouvert, le choix est gardé et reposé avant le premier rendu au rechargement', () => {
    openApp('#/')
    expect(html().getAttribute('data-interface')).toBe('epistemiarque')
    fireEvent.click(burger())
    expect(drawerInterface().value).toBe('epistemiarque')
    expect([...drawerInterface().options].map((o) => o.textContent)).toEqual(['Épistémiarque', 'Noèsiologue', 'Technomancien'])
    expect(document.getElementById(drawerInterface().getAttribute('aria-describedby')).textContent).toBe(
      'gardés dans ce navigateur ; ils ne changent aucun droit',
    )
    // Le défaut affiché n'est jamais écrit.
    expect(localStorage.getItem('humanome-interface')).toBeNull()

    fireEvent.change(drawerInterface(), { target: { value: 'noesiologue' } })
    expect(html().getAttribute('data-interface')).toBe('noesiologue')
    expect(localStorage.getItem('humanome-interface')).toBe('noesiologue')
    expect(burger().getAttribute('aria-expanded')).toBe('true')
    expect(drawerInterface().value).toBe('noesiologue')

    const firstPaint = reload('#/')
    expect(firstPaint).toEqual({ interface: 'noesiologue', theme: null })
    fireEvent.click(burger())
    expect(drawerInterface().value).toBe('noesiologue')
  })
})

describe('UC-VIS-07 — scénarios alternatifs', () => {
  it('UC-VIS-07-F02 — A1 : le thème se choisit à côté (Système, Clair, Sombre) ; la bascule de l’en-tête et la liste du tiroir restent synchronisées ; « Système » rend le suivi du système', () => {
    openApp('#/')
    fireEvent.click(burger())
    expect(drawerTheme().value).toBe('system')
    expect(html().hasAttribute('data-theme')).toBe(false)

    fireEvent.change(drawerTheme(), { target: { value: 'dark' } })
    expect(html().getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('humanome-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Passer au thème clair' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Passer au thème clair' }))
    expect(drawerTheme().value).toBe('light')
    expect(localStorage.getItem('humanome-theme')).toBe('light')

    fireEvent.change(drawerTheme(), { target: { value: 'system' } })
    expect(html().hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('humanome-theme')).toBeNull()
    expect(screen.getByRole('button', { name: 'Passer au thème sombre' })).toBeDefined()
    expect(reload('#/')).toEqual({ interface: 'epistemiarque', theme: null })
  })

  it('UC-VIS-07-F03 — A2 : l’interface et le thème sont indépendants — six combinaisons, chacune gardée telle quelle', () => {
    openApp('#/')
    fireEvent.click(burger())
    for (const name of ['epistemiarque', 'noesiologue', 'technomancien']) {
      for (const theme of ['light', 'dark']) {
        fireEvent.change(drawerInterface(), { target: { value: name } })
        fireEvent.change(drawerTheme(), { target: { value: theme } })
        expect([html().getAttribute('data-interface'), html().getAttribute('data-theme')]).toEqual([name, theme])
        expect([localStorage.getItem('humanome-interface'), localStorage.getItem('humanome-theme')]).toEqual([name, theme])
      }
    }
    fireEvent.change(drawerTheme(), { target: { value: 'system' } })
    expect(html().getAttribute('data-interface')).toBe('technomancien')
    expect(localStorage.getItem('humanome-interface')).toBe('technomancien')
  })

  it('UC-VIS-07-F04 — A3 : stockage bloqué (navigation privée stricte) — l’épistémiarque s’affiche, le choix vaut pour la session, rien n’est gardé', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError')
    })
    expect(reload('#/')).toEqual({ interface: 'epistemiarque', theme: null })
    fireEvent.click(burger())
    expect(drawerInterface().value).toBe('epistemiarque')
    fireEvent.change(drawerInterface(), { target: { value: 'technomancien' } })
    expect(html().getAttribute('data-interface')).toBe('technomancien')
    expect(drawerInterface().value).toBe('technomancien')
    expect(setItem).toHaveBeenCalled()
    getItem.mockRestore()
    setItem.mockRestore()
    expect(localStorage.getItem('humanome-interface')).toBeNull()
  })

  it('UC-VIS-07-F05 — A4 : « Mon compte » porte les deux listes dans la ligne « Affichage », synchronisées avec celles du tiroir', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch([
        ['api/auth/me', () => jsonResponse(200, { user: { id: 5, email: 'noe@example.org', displayName: 'Noé', roles: ['apprenant'], hasAvatar: false }, csrfToken: 'csrf' })],
        ['api/keys', () => jsonResponse(200, [])],
      ]),
    )
    openApp('#/compte', account(['apprenant']))
    const main = within(screen.getByRole('main'))
    const accountInterface = await main.findByRole('combobox', { name: 'Interface' }, { timeout: 3000 })
    expect(accountInterface.closest('.account-row').querySelector('dt').textContent).toBe('Affichage')
    expect(main.getByText('Interface et thème : gardés dans ce navigateur ; ils ne changent aucun droit.')).toBeDefined()

    fireEvent.change(accountInterface, { target: { value: 'technomancien' } })
    expect(html().getAttribute('data-interface')).toBe('technomancien')
    expect(drawerInterface().value).toBe('technomancien')
    fireEvent.change(drawerInterface(), { target: { value: 'noesiologue' } })
    expect(accountInterface.value).toBe('noesiologue')

    fireEvent.change(main.getByRole('combobox', { name: 'Thème' }), { target: { value: 'dark' } })
    expect(drawerTheme().value).toBe('dark')
    expect(html().getAttribute('data-theme')).toBe('dark')
  })
})

describe('UC-VIS-07 — scénarios d’erreur', () => {
  it('UC-VIS-07-F06 — E1 : valeur stockée inconnue (écrite à la main, ou orthographe fautive) — le défaut s’affiche dès le premier rendu, la valeur reste ignorée jusqu’au prochain choix, qui la remplace', () => {
    localStorage.setItem('humanome-interface', 'technomacien')
    expect(reload('#/')).toEqual({ interface: 'epistemiarque', theme: null })
    fireEvent.click(burger())
    expect(drawerInterface().value).toBe('epistemiarque')
    expect(localStorage.getItem('humanome-interface')).toBe('technomacien')
    fireEvent.change(drawerInterface(), { target: { value: 'technomancien' } })
    expect(localStorage.getItem('humanome-interface')).toBe('technomancien')
  })
})

describe('UC-VIS-07 — règles de gestion', () => {
  it('UC-VIS-07-F07 — RG1 : l’interface n’est jamais un droit — le menu d’un visiteur et celui d’un apprenant restent les mêmes dans les trois interfaces, et aucun appel réseau ne part au changement', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(401, { error: 'Authentification requise' }))
    vi.stubGlobal('fetch', fetchSpy)
    for (const fetchMeFn of [visitor, account(['apprenant'])]) {
      cleanup()
      openApp('#/', fetchMeFn)
      await screen.findByRole('navigation', { name: 'Navigation principale' })
      if (fetchMeFn !== visitor) await mainNav().findByRole('link', { name: 'Tableau de bord' })
      fireEvent.click(burger())
      const menus = []
      const callsBefore = fetchSpy.mock.calls.length
      for (const name of ['epistemiarque', 'noesiologue', 'technomancien']) {
        fireEvent.change(drawerInterface(), { target: { value: name } })
        menus.push(mainNav().getAllByRole('link').map((a) => a.getAttribute('href')))
      }
      expect(menus[1]).toEqual(menus[0])
      expect(menus[2]).toEqual(menus[0])
      expect(fetchSpy.mock.calls.length).toBe(callsBefore)
    }
    // Un groupe par famille, pas un de plus.
    expect(mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))).not.toContain('Interface')
  })
})
