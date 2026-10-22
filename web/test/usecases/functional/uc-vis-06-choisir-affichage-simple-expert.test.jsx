// UC-VIS-06 — Choisir l'affichage simple ou expert : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-06-choisir-affichage-simple-expert.md
//
// L'application ENTIÈRE (<App/>) : l'interrupteur « Mode expert » au bas du
// tiroir, le menu, l'interface de cartographie (démonstration chargée par un
// réseau simulé), l'aide « ? », la ligne « Affichage » du compte. Le choix vit
// dans localStorage (`humanome-mode`) ; le rechargement est simulé par un
// nouveau montage. La session du shell est injectée (fetchMeFn) ; les vues qui
// sondent elles-mêmes la session reçoivent la réponse du réseau simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearDayCache } from '../../../src/data/load.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { demoNetwork, jsonResponse } from '../support/vis.js'
import { routedFetch } from '../support/appl-http.js'

const visitor = async () => ({ user: null })
const account = (roles) => async () => ({ user: { id: 5, displayName: 'Noé', roles, hasAvatar: false } })

function openApp(hash, fetchMeFn = visitor) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))
const modeSwitch = () => mainNav().getByRole('switch', { name: 'Mode expert' })
const burger = () => screen.getByRole('button', { name: 'Menu de navigation' })
const spaces = () =>
  within(screen.getByRole('navigation', { name: 'Espaces de la cartographie' }))
    .getAllByRole('link')
    .map((a) => a.firstChild.textContent)

beforeEach(() => {
  resetApiClient()
  clearDayCache()
  clearReferentielCache()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
})

describe('UC-VIS-06 — basculer l’affichage', () => {
  it('UC-VIS-06-F01 — nominal : un visiteur, en mode simple, ouvre le tiroir et active « Mode expert » ; la cartographie gagne « Comparaison » aussitôt, le tiroir reste ouvert ; le choix survit au rechargement', async () => {
    demoNetwork()
    openApp('#/cartographie')
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await waitFor(() => expect(spaces()).toContain('Gestionnaire'))
    expect(spaces()).not.toContain('Comparaison')

    fireEvent.click(burger())
    expect(modeSwitch().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('profils Twin9, versions de prompt, modèles, comparaison, réglages fins')).toBeDefined()
    fireEvent.click(modeSwitch(), { detail: 1 })

    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
    expect(burger().getAttribute('aria-expanded')).toBe('true')
    expect(spaces()).toEqual(['Cartographie', 'Gestionnaire', 'Comparaison', 'Tableau de bord', 'Dialogue', 'Export'])
    expect(localStorage.getItem('humanome-mode')).toBe('expert')

    // « Rechargement » : un nouveau montage relit le choix de ce navigateur.
    cleanup()
    openApp('#/')
    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
  })
})

describe('UC-VIS-06 — scénarios alternatifs', () => {
  it('UC-VIS-06-F02 — A1 : sans choix, le défaut suit les rôles — apprenant seul en simple (échelle Essayer → Cartographier mes écrits → Analyse approfondie), cartographe en expert (« Cartographie ouverte », « Mes profils Twin9 ») ; rien n’est écrit ; un choix explicite prime ensuite', async () => {
    openApp('#/', account(['apprenant']))
    await waitFor(() => expect(mainNav().getByRole('link', { name: 'Tableau de bord' })).toBeDefined())
    const ma = () => within(mainNav().getByRole('group', { name: 'Ma cartographie' }))
    expect(ma().getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#/espace',
      '#/portfolio',
      '#/espace/nouveau-run',
      '#/twin9',
      '#/espace',
    ])
    expect(modeSwitch().getAttribute('aria-checked')).toBe('false')
    // Tuiles de l'accueil : le même plan, au même mode.
    const tiles = within(screen.getByRole('region', { name: 'Plan du site' }))
    expect(tiles.queryByText('Cartographie ouverte')).toBeNull()
    cleanup()

    openApp('#/', account(['apprenant', 'cartographe']))
    await waitFor(() => expect(mainNav().getByRole('link', { name: 'Ma file de relecture' })).toBeDefined())
    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
    expect(ma().getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#/espace',
      '#/portfolio',
      '#/espace/nouveau-run',
      '#/twin6-ouverte',
      '#/twin9',
      '#/configuration',
      '#/espace',
    ])
    expect(localStorage.getItem('humanome-mode')).toBeNull()

    // Le cartographe passe en simple : son choix prime, et le menu garde sa famille de rôle.
    fireEvent.click(modeSwitch(), { detail: 1 })
    expect(localStorage.getItem('humanome-mode')).toBe('simple')
    expect(mainNav().queryByRole('link', { name: /^Cartographie ouverte/ })).toBeNull()
    expect(mainNav().getByRole('group', { name: 'Encadrer et garantir' })).toBeDefined()
  })

  it('UC-VIS-06-F03 — A2 : masqué n’est pas interdit — en mode simple, « Comparaison » s’ouvre par son adresse (onglet affiché, marqué courant) et #/twin6-ouverte aussi', async () => {
    demoNetwork()
    openApp('#/cartographie')
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await waitFor(() => expect(spaces()).toContain('Gestionnaire'))
    goTo('#/cartographie/comparaison')
    const tab = await screen.findByRole('link', { name: 'Comparaison' })
    expect(tab.getAttribute('aria-current')).toBe('page')
    expect(modeSwitch().getAttribute('aria-checked')).toBe('false')

    goTo('#/twin6-ouverte')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cartographie ouverte Twin6' })).toBeDefined()
    expect(mainNav().queryByRole('link', { name: /^Cartographie ouverte/ })).toBeNull()
  })

  it('UC-VIS-06-F04 — A3 : stockage du navigateur bloqué (navigation privée stricte) : le défaut s’applique, la bascule vaut pour la session ouverte, sans erreur', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Accès refusé', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Accès refusé', 'SecurityError')
    })
    openApp('#/', account(['apprenant']))
    await waitFor(() => expect(mainNav().getByRole('link', { name: 'Tableau de bord' })).toBeDefined())
    expect(modeSwitch().getAttribute('aria-checked')).toBe('false')
    fireEvent.click(modeSwitch(), { detail: 1 })
    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
    expect(mainNav().getByRole('link', { name: 'Mes profils Twin9' })).toBeDefined()
    vi.restoreAllMocks()
    expect(localStorage.getItem('humanome-mode')).toBeNull()
  })

  it('UC-VIS-06-F05 — A4 : l’aide « ? » de l’espace apprenant, de la cartographie et de Twin6 dit, en mode simple seulement, où sont les réglages avancés', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Authentification requise' })))
    openApp('#/espace')
    const helpText = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
      const text = screen.getByRole('dialog').textContent
      fireEvent.keyDown(document, { key: 'Escape' })
      return text
    }
    expect(helpText()).toContain('activez le « Mode expert » au bas du menu')
    goTo('#/referentiel')
    expect(helpText()).not.toContain('Mode expert')
    goTo('#/espace')
    fireEvent.click(modeSwitch(), { detail: 1 })
    expect(helpText()).not.toContain('Mode expert')
  })

  it('UC-VIS-06-F06 — A5 : « Mon compte » porte la ligne « Affichage », synchronisée avec l’interrupteur du tiroir', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch([
        ['api/auth/me', () => jsonResponse(200, { user: { id: 5, email: 'noe@example.org', displayName: 'Noé', roles: ['apprenant'], hasAvatar: false }, csrfToken: 'csrf' })],
        ['api/keys', () => jsonResponse(200, [])],
      ]),
    )
    openApp('#/compte', account(['apprenant']))
    const row = await screen.findByRole('switch', { name: 'Mode expert', checked: false }, { timeout: 3000 }).then(() =>
      screen.getAllByRole('switch', { name: 'Mode expert' }).find((el) => el.tagName === 'INPUT'),
    )
    expect(row.checked).toBe(false)
    expect(row.closest('.account-row').querySelector('dt').textContent).toBe('Affichage')
    fireEvent.click(row)
    expect(row.checked).toBe(true)
    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('humanome-mode')).toBe('expert')
    fireEvent.click(modeSwitch(), { detail: 1 })
    expect(row.checked).toBe(false)
  })
})

describe('UC-VIS-06 — règles de gestion', () => {
  it('UC-VIS-06-F07 — RG1 : le mode n’est jamais un droit — un visiteur en mode expert garde le menu d’un visiteur, et #/configuration lui oppose la garde du serveur', async () => {
    localStorage.setItem('humanome-mode', 'expert')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Authentification requise' })))
    openApp('#/configuration')
    expect(modeSwitch().getAttribute('aria-checked')).toBe('true')
    expect(mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().queryByRole('link', { name: 'Mes profils Twin9' })).toBeNull()
    expect(await screen.findByText(/pour régler vos runs Twin9/)).toBeDefined()
  })

  // Le choix du référentiel en mode simple est rejoué par UC-APP-02-F27 et UC-APP-09-F32 ;
  // le point d'anomalies du Gestionnaire, par UC-VIS-06-U05.
  it('UC-VIS-06-F08 — RG2 : en mode simple, le Gestionnaire reste ; « Réglages » n’est pas proposé dans « Panneaux », et revient au passage en mode expert', async () => {
    demoNetwork()
    openApp('#/cartographie')
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await waitFor(() => expect(spaces()).toContain('Gestionnaire'))
    expect(screen.getByRole('link', { name: /^Gestionnaire/ }).getAttribute('href')).toBe('#/cartographie/gestionnaire')
    const panels = [...document.querySelectorAll('.carto-panels-menu label')].map((l) => l.textContent.trim())
    expect(panels).toContain('Journées')
    expect(panels).not.toContain('Réglages')
    fireEvent.click(modeSwitch(), { detail: 1 })
    await waitFor(() =>
      expect([...document.querySelectorAll('.carto-panels-menu label')].map((l) => l.textContent.trim())).toContain('Réglages'),
    )
  })
})
