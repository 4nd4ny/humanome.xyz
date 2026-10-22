// UC-VIS-02 — Consulter le référentiel public : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
//
// Le visiteur consulte la page publique #/referentiel dans l'application
// ENTIÈRE (<App/>), sans session ; le shell sonde la session (GET api/auth/me
// → 401 sans cookie). Depuis S5, lot E, la page lit tout référentiel publié
// comme les parcours : la base par l'API publique d'abord (GET
// api/referentiels, api/referentiels/{id}/versions/{semver} : F12, F18, F19,
// F21), l'export STATIQUE en repli (index.json au format de StaticExporter +
// un fichier par version : F13, F14, F16, F17, F20), RESPIRE embarqué en
// dernier (F15).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import respire from '../../../../schemas/fixtures/referentiel-respire-v7.json'
// Le document qu'écrit scripts/convertir-humanome.mjs depuis la fixture FICTIVE à la forme Humanome (S5, lot B)
import humanome from '../../../../schemas/fixtures/referentiel-humanome-fictif.json'
import { calledUrls, jsonResponse } from '../support/vis.js'

const v710 = {
  ...respire,
  version: '7.1.0',
  label: 'RESPIRE v7.1.0',
  competences: respire.competences.map((c) =>
    c.code === '1.01' ? { ...c, description: 'Douter des réponses trop lisses, vérifier les sources.' } : c,
  ),
}

const INDEX = [
  { referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.0.json' },
  { referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', publishedAt: '2026-07-01T09:00:00', fichier: 'respire-v7.0.0.json' },
]

const HUMANOME_FICHIER = `${humanome.id}-v${humanome.version}.json`
/** L'export statique de deux référentiels : RESPIRE et le fictif à la forme Humanome. */
const INDEX_DEUX = [
  { referentielId: humanome.id, semver: humanome.version, label: humanome.label, publishedAt: '2026-10-22T09:00:00', fichier: HUMANOME_FICHIER },
  ...INDEX,
]

/** Le catalogue de la base (GET api/referentiels, lot A) : deux référentiels publiés. */
const CATALOGUE = [
  { id: humanome.id, label: humanome.label, versions: [humanome.version], source: humanome.source },
  { id: 'respire', label: 'RESPIRE v7.1.0', versions: ['7.1.0', '7.0.0'], source: respire.source },
]
const ROUTE_RESPIRE = 'api/referentiels/respire/versions/7.1.0'
const ROUTE_HUMANOME = `api/referentiels/${humanome.id}/versions/${humanome.version}`

/** L'API absente (404) : l'export statique seul. */
function staticExport({ offline = false, index = INDEX, gate = null } = {}) {
  const mock = vi.fn(async (url) => {
    if (url === 'api/auth/me') return jsonResponse(401, { error: 'Authentification requise' })
    if (offline) throw new TypeError('Failed to fetch')
    if (url === 'data/referentiel/index.json') {
      if (gate) await gate
      return jsonResponse(200, index)
    }
    if (url === 'data/referentiel/respire-v7.1.0.json') return jsonResponse(200, v710)
    if (url === `data/referentiel/${HUMANOME_FICHIER}`) return jsonResponse(200, humanome)
    return jsonResponse(404, {})
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** La base par l'API publique ; l'export statique répond aussi, mais ne doit pas être lu. */
function apiNetwork({ gate = null } = {}) {
  const mock = vi.fn(async (url) => {
    if (url === 'api/auth/me') return jsonResponse(401, { error: 'Authentification requise' })
    if (url === 'api/referentiels') {
      if (gate) await gate
      return jsonResponse(200, CATALOGUE)
    }
    if (url === ROUTE_RESPIRE) return jsonResponse(200, v710)
    if (url === ROUTE_HUMANOME) return jsonResponse(200, humanome)
    if (url === 'data/referentiel/index.json') return jsonResponse(200, INDEX_DEUX)
    if (url === 'data/referentiel/respire-v7.1.0.json') return jsonResponse(200, v710)
    if (url === `data/referentiel/${HUMANOME_FICHIER}`) return jsonResponse(200, humanome)
    return jsonResponse(404, { error: 'Unknown published version' })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Les adresses lues, sans doublon, triées. */
const lues = (network, prefix) => [...new Set(calledUrls(network).filter((u) => u.startsWith(prefix)))].sort()

const menu = () => screen.getByRole('combobox', { name: 'Référentiel' })

function openApp(hash) {
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

async function search(text) {
  fireEvent.change(screen.getByLabelText('Rechercher une compétence'), { target: { value: text } })
}

beforeEach(() => {
  resetApiClient()
  clearReferentielCache()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('UC-VIS-02 — le visiteur consulte le référentiel', () => {
  it('UC-VIS-02-F12 — nominal : menu « Référentiel » → dernière version publiée, lue dans la base, 7 pôles, 61 compétences, lien Decidim', async () => {
    let release
    const network = apiNetwork({ gate: new Promise((resolve) => (release = resolve)) })
    // Shell RÉEL : aucune session injectée (la sonde GET api/auth/me répond 401).
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)
    // Plan du site de l'accueil : l'entrée porte un indice sans chiffres (2026-10-20) — le
    // référentiel publié dit lui-même ses pôles et ses compétences, plus le menu.
    const tile = within(screen.getByRole('region', { name: 'Plan du site' })).getByRole('link', { name: /^Référentiel/ })
    expect(tile.querySelector('.route-hint').textContent).toBe('les compétences, pôle par pôle')
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    const menuLink = within(nav.getByRole('group', { name: 'Découvrir' })).getByRole('link', { name: 'Référentiel' })
    expect(menuLink.getAttribute('href')).toBe('#/referentiel')
    // Clic réel sur le lien du menu (navigation par fragment de jsdom → hashchange).
    await act(async () => {
      fireEvent.click(menuLink)
    })
    await waitFor(() => expect(window.location.hash).toBe('#/referentiel'))

    // Tant que la base n'a pas répondu : message d'attente.
    expect(await screen.findByText('Chargement du référentiel…')).toBeDefined()
    await act(async () => release())
    expect(await screen.findByRole('heading', { name: 'Référentiel de compétences' })).toBeDefined()
    await waitFor(() => expect(document.querySelector('.ref-version').textContent).toContain('version 7.1.0'))
    const header = document.querySelector('.ref-version').textContent
    expect(header).toContain('RESPIRE v7.1.0')
    expect(header).toContain('7 pôles, 61 compétences')
    expect(header).toContain('aucune version publiée n’est modifiée en place')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelector('.ref-pole').style.getPropertyValue('--pole-color')).toBe(respire.poles[0].couleur)
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    // Définition publiée en 7.1.0, affichée sous la compétence.
    expect(screen.getByText('Douter des réponses trop lisses, vérifier les sources.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Participer sur participer.harmonia.education' }).getAttribute('href')).toBe(
      'https://participer.harmonia.education',
    )
    // Le menu des référentiels publiés (S5, lot E) : RESPIRE d'abord et choisi ; sa provenance n'est pas dite.
    await waitFor(() => expect(menu().value).toBe('respire@7.1.0'))
    expect([...menu().options].map((o) => o.textContent)).toEqual(['RESPIRE v7.1.0', 'Fictif V2'])
    expect(document.querySelector('.ref-source')).toBeNull()
    expect(screen.getByRole('link', { name: '1.01' }).getAttribute('href')).toBe('#/referentiel/1.01')
    // LECTURE du référentiel : la base par l'API publique (catalogue, puis la
    // version), aucun fichier statique ; ni /api/referentiel, ni /api/competences.
    expect(lues(network, 'data/')).toEqual([])
    expect(lues(network, 'api/')).toEqual(['api/auth/me', 'api/referentiels', ROUTE_RESPIRE])
  })

  it('UC-VIS-02-F13 — nominal : recherche insensible aux accents sur code, nom et définition ; aucun résultat', async () => {
    staticExport()
    openApp('#/referentiel')
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))

    await search('pensee critique')
    expect(screen.getByRole('status').textContent).toBe('1 compétence sur 61 pour « pensee critique ».')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(1) // pôles vides masqués
    await search('VERIFIER LES SOURCES')
    expect(screen.getByRole('status').textContent).toBe('1 compétence sur 61 pour « VERIFIER LES SOURCES ».')
    await search('7.0')
    expect(screen.getByRole('status').textContent).toBe('8 compétences sur 61 pour « 7.0 ».')
    await search('zzz-rien')
    expect(screen.getByRole('status').textContent).toBe('0 compétence sur 61 pour « zzz-rien ».')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(0)
    await search('  ')
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    await search('zzz-rien')
    await search('')
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
  })

  it('UC-VIS-02-F14 — A5 : permalien #/referentiel/<code> → compétence surlignée et amenée à l’écran', async () => {
    staticExport()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      openApp('#/referentiel')
      await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))

      const link = screen.getByRole('link', { name: '7.03' })
      expect(link.getAttribute('href')).toBe('#/referentiel/7.03')
      goTo('#/referentiel/7.03')

      await waitFor(() => expect(document.getElementById('competence-7.03').className).toContain('ref-competence-focus'))
      expect(screen.getByRole('link', { name: '7.03' }).getAttribute('aria-current')).toBe('true')
      expect(scroll).toHaveBeenCalledWith({ block: 'center' })
      // C'est bien la ligne de 7.03 qui défile.
      expect(scroll.mock.contexts).toContain(document.getElementById('competence-7.03'))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('UC-VIS-02-F15 — A6 : hors ligne (ou copie statique) → référentiel embarqué v7, page complète', async () => {
    staticExport({ offline: true })
    openApp('#/referentiel')

    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-version').textContent).toContain('version 7.0.0')
    expect(screen.queryByText('Douter des réponses trop lisses, vérifier les sources.')).toBeNull()
    // ni la base ni l'export : aucun choix n'est offert (S5, lot E)
    expect(screen.queryByRole('combobox', { name: 'Référentiel' })).toBeNull()
  })

  it('UC-VIS-02-F16 — E4 : permalien vers un code absent de la version → message, l’arbre reste consultable', async () => {
    staticExport()
    openApp('#/referentiel/9.99')

    // Espaces insécables autour du code (typographie française).
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Compétence «\s9\.99\s» introuvable dans cette version du référentiel\.$/,
    )
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
  })

  it('UC-VIS-02-F17 — A6 : index publié désignant un fichier hors du dossier (« ../x.json ») → repli embarqué v7, page complète', async () => {
    const network = staticExport({ index: [{ ...INDEX[0], fichier: '../x.json' }] })
    openApp('#/referentiel')

    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-version').textContent).toContain('version 7.0.0')
    // l'index est lu (par le chargeur, puis par le menu, qui n'en garde rien), jamais le fichier désigné
    expect(lues(network, 'data/')).toEqual(['data/referentiel/index.json'])
    expect(screen.queryByRole('combobox', { name: 'Référentiel' })).toBeNull()
  })

  it('UC-VIS-02-F18 — A7 : le menu propose tout référentiel publié ; choisi, il s’affiche, lu dans la base, sa provenance dite, l’adresse le nomme', async () => {
    const network = apiNetwork()
    openApp('#/referentiel')
    await waitFor(() => expect(menu().value).toBe('respire@7.1.0'))
    const historique = window.history.length

    fireEvent.change(menu(), { target: { value: `${humanome.id}@${humanome.version}` } })
    // L'adresse est remplacée, sans entrée d'historique de plus : un lien à partager.
    await waitFor(() => expect(window.location.hash).toBe('#/referentiel?id=fictif-humanome'))
    expect(window.history.length).toBe(historique)
    await waitFor(() => expect(document.querySelector('.ref-version').textContent).toContain('Fictif V2 — version 2.0.0-proposition.1 · 2 pôles, 3 compétences'))
    expect(menu().value).toBe(`${humanome.id}@${humanome.version}`)
    expect([...document.querySelectorAll('.ref-pole')].map((p) => p.getAttribute('aria-label'))).toEqual([
      'A · Observer le fictif',
      'B · Agir dans le fictif',
    ])
    expect(document.querySelector('.ref-pole').style.getPropertyValue('--pole-color')).toBe('#2563eb')
    // Sa provenance — d'où il vient, sa licence (S5, E9) — une fois, sous l'en-tête.
    expect(document.querySelector('.ref-source').textContent).toBe(`Provenance : ${humanome.source}`)
    expect(document.querySelector('.ref-source').textContent).toContain('Licence : CC-BY-SA Éditeur fictif.')
    expect(screen.queryByTestId('referentiel-source')).toBeNull()
    // Ses définitions, ses permaliens, l'exemple de la recherche.
    expect(document.getElementById('competence-A1').querySelector('.ref-competence-desc').textContent).toBe(humanome.competences[0].description)
    expect(screen.getByRole('link', { name: 'A1' }).getAttribute('href')).toBe('#/referentiel/A1?id=fictif-humanome')
    expect(screen.getByLabelText('Rechercher une compétence').getAttribute('placeholder')).toBe('Code ou nom — ex. A1')
    await search('du pole b')
    expect(screen.getByRole('status').textContent).toBe('1 compétence sur 3 pour « du pole b ».')
    await search('')
    expect(lues(network, 'api/')).toEqual(['api/referentiels', ROUTE_HUMANOME, ROUTE_RESPIRE])
    expect(lues(network, 'data/')).toEqual([])

    // RESPIRE de nouveau : l'adresse sans identifiant, ses 61 compétences, aucune provenance.
    fireEvent.change(menu(), { target: { value: 'respire@7.1.0' } })
    await waitFor(() => expect(window.location.hash).toBe('#/referentiel'))
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-source')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('UC-VIS-02-F19 — A8 : lien profond vers une compétence d’un autre référentiel → il s’affiche, la compétence surlignée ; le menu ramène à RESPIRE sans le code', async () => {
    apiNetwork()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      openApp('#/referentiel/A2?id=fictif-humanome')
      await waitFor(() => expect(document.getElementById('competence-A2')?.className).toContain('ref-competence-focus'))
      expect(document.querySelector('.ref-version').textContent).toContain('Fictif V2 — version 2.0.0-proposition.1')
      expect(screen.getByRole('link', { name: 'A2' }).getAttribute('aria-current')).toBe('true')
      expect(scroll.mock.contexts).toContain(document.getElementById('competence-A2'))
      await waitFor(() => expect(menu().value).toBe(`${humanome.id}@${humanome.version}`))
      expect(screen.queryByRole('alert')).toBeNull()

      fireEvent.change(menu(), { target: { value: 'respire@7.1.0' } })
      await waitFor(() => expect(window.location.hash).toBe('#/referentiel'))
      await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
      expect(document.querySelector('.ref-competence-focus')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('UC-VIS-02-F20 — A9 : sans l’API, le menu et les documents viennent de l’export statique ; la provenance, du document', async () => {
    const network = staticExport({ index: INDEX_DEUX })
    openApp('#/referentiel')
    await waitFor(() => expect(menu().value).toBe('respire@7.1.0'))
    expect([...menu().options].map((o) => o.textContent)).toEqual(['RESPIRE v7.1.0', 'Fictif V2'])
    expect(document.querySelector('.ref-version').textContent).toContain('version 7.1.0')

    fireEvent.change(menu(), { target: { value: `${humanome.id}@${humanome.version}` } })
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(3))
    expect(window.location.hash).toBe('#/referentiel?id=fictif-humanome')
    // L'index ne porte pas la provenance ; le document, si (E9).
    expect(document.querySelector('.ref-source').textContent).toBe(`Provenance : ${humanome.source}`)
    expect(lues(network, 'data/')).toEqual([
      `data/referentiel/${HUMANOME_FICHIER}`,
      'data/referentiel/index.json',
      'data/referentiel/respire-v7.1.0.json',
    ])
  })

  it('UC-VIS-02-F21 — E5 : un lien vers un référentiel introuvable (inconnu, hors forme) → dit, RESPIRE à sa place', async () => {
    const network = apiNetwork()
    openApp('#/referentiel/A1?id=inconnu')
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Le référentiel «\sinconnu\s» n’a pas pu être chargé : RESPIRE s’affiche à sa\s+place\.$/,
    )
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-version').textContent).toContain('RESPIRE v7.1.0 — version 7.1.0')
    // une seule alerte : le code A1 était celui du référentiel introuvable
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    // le menu montre déjà RESPIRE : le lien de l'alerte rend l'adresse sans l'identifiant
    expect(within(screen.getByRole('alert')).getByRole('link', { name: 'RESPIRE' }).getAttribute('href')).toBe('#/referentiel')
    await waitFor(() => expect(menu().value).toBe('respire@7.1.0'))
    expect(screen.getByRole('link', { name: '1.01' }).getAttribute('href')).toBe('#/referentiel/1.01')
    // la base ne le publie pas (catalogue), l'export statique non plus (index) : aucun document demandé pour lui
    expect(lues(network, 'api/referentiels/')).toEqual([ROUTE_RESPIRE])
    expect(lues(network, 'data/')).toEqual(['data/referentiel/index.json'])

    // Un identifiant hors forme n'est demandé ni à l'API ni comme fichier.
    cleanup()
    const horsForme = apiNetwork()
    openApp('#/referentiel?id=..%2F..%2Fx')
    expect((await screen.findByRole('alert')).textContent).toContain('«\u00a0../../x\u00a0»')
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(calledUrls(horsForme).some((u) => u.includes('..'))).toBe(false)
  })
})
