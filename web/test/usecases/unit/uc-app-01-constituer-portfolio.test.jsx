// UC-APP-01 — Constituer son portfolio local : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-01-constituer-portfolio.md
//
// Code sollicité appelé directement, sans réseau réel : le routeur et la
// navigation (#/portfolio), l'adaptateur IndexedDB RÉEL du portfolio-store
// exécuté sur un IndexedDB factice (jamais exercé par les suites
// historiques), le store lui-même, le relais Google Docs (extractGdocId,
// fetchGdocText), la validation des dates de journée et l'éditeur isolé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FAMILIES } from '../../../src/nav.js'
import { isValidIsoDate, parseHash } from '../../../src/router.js'
import {
  createIndexedDbAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { GDOC_UNAVAILABLE_MESSAGE, extractGdocId, fetchGdocText } from '../../../src/lib/gdoc.js'
import PortfolioEditor from '../../../src/components/PortfolioEditor.jsx'
import PortfolioView from '../../../src/views/PortfolioView.jsx'
import { createMemoryAdapter } from '../../../src/lib/portfolio-store.js'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { jsonResponse, textResponse } from '../support/appl-http.js'

const DOC_ID = '1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UC-APP-01 — accès au module (étape 1)', () => {
  it('UC-APP-01-U07 — #/portfolio est une route publique ; le menu l’offre dans « Ma cartographie »', () => {
    expect(parseHash('#/portfolio')).toEqual({ name: 'portfolio' })
    const family = FAMILIES.find((f) => f.items.some((item) => item.href === '#/portfolio'))
    expect(family.id).toBe('cartographie')
    expect(family.roles).toEqual(['apprenant'])
    expect(family.items.find((item) => item.href === '#/portfolio').label).toBe('Mon portfolio')
  })
})

describe('UC-APP-01 — stockage local IndexedDB « humanome-portfolios » (étapes 2 et 5)', () => {
  it('UC-APP-01-U08 — l’adaptateur ouvre paresseusement la base v1, magasin « portfolios » à clé id', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    const openSpy = vi.spyOn(idb.factory, 'open')

    const adapter = createIndexedDbAdapter()
    expect(idb.openCount()).toBe(0) // import et création sans effet de bord

    await adapter.put({ id: 'p-1', titre: 'Journal', texte: 'A' })
    expect(openSpy).toHaveBeenCalledWith('humanome-portfolios', 1) // base v1
    await adapter.put({ id: 'p-2', titre: 'Carnet', texte: 'B' })
    expect(idb.databases()).toEqual(['humanome-portfolios'])
    expect(await adapter.get('p-1')).toEqual({ id: 'p-1', titre: 'Journal', texte: 'A' })
    expect((await adapter.getAll()).map((r) => r.id)).toEqual(['p-1', 'p-2'])

    await adapter.delete('p-1')
    expect(await adapter.get('p-1')).toBeUndefined()
    expect(idb.values('humanome-portfolios', 'portfolios').map((r) => r.id)).toEqual(['p-2'])
    expect(idb.openCount()).toBe(1) // connexion partagée entre opérations
  })

  it('UC-APP-01-U09 — ouverture refusée : l’opération échoue, la suivante retente l’ouverture', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    const adapter = createIndexedDbAdapter()

    idb.failNextOpen('quota dépassé')
    await expect(adapter.getAll()).rejects.toThrow('quota dépassé')
    await expect(adapter.getAll()).resolves.toEqual([])
    expect(idb.openCount()).toBe(2)
  })

  it('UC-APP-01-U10 — navigateur sans IndexedDB : message français explicite (E1)', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const store = createPortfolioStore()
    await expect(store.list()).rejects.toThrow(
      'IndexedDB est indisponible dans ce navigateur : les portfolios ne peuvent pas être conservés localement.',
    )
  })

  it('UC-APP-01-U11 — store sur IndexedDB : création par défaut, sauvegarde, relecture après « rechargement »', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    let tick = 0
    const now = () => `2026-07-12T10:00:0${tick++}.000Z`
    const store = createPortfolioStore(createIndexedDbAdapter(), { now, id: () => 'p-maya' })

    const created = await store.create()
    expect(created).toEqual({
      id: 'p-maya',
      titre: 'Portfolio sans titre',
      source: 'colle',
      texte: '',
      segments: [],
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })
    await store.save({ ...created, titre: 'Journal de Maya', texte: '## 2026-01-05\nAtelier.' })

    // Nouvel onglet : nouveau store, nouvel adaptateur, même base.
    const reopened = createPortfolioStore(createIndexedDbAdapter())
    const [record] = await reopened.list()
    expect(record).toMatchObject({
      id: 'p-maya',
      titre: 'Journal de Maya',
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:01.000Z',
    })
  })
})

describe('UC-APP-01 — import Google Docs (A2)', () => {
  it('UC-APP-01-U12 — extractGdocId reconnaît les formes d’URL usuelles et borne l’identifiant brut (20 à 80)', () => {
    expect(extractGdocId(`https://docs.google.com/document/u/1/d/${DOC_ID}/edit#heading=h.x`)).toBe(DOC_ID)
    expect(extractGdocId(`https://docs.google.com/open?id=${DOC_ID}&authuser=0`)).toBe(DOC_ID)
    expect(extractGdocId(`  ${DOC_ID}  `)).toBe(DOC_ID)
    expect(extractGdocId('a'.repeat(20))).toBe('a'.repeat(20))
    expect(extractGdocId('a'.repeat(19))).toBeNull()
    expect(extractGdocId('a'.repeat(81))).toBeNull()
    expect(extractGdocId('https://drive.google.com/drive/folders/abc')).toBeNull()
  })

  it('UC-APP-01-U13 — fetchGdocText : GET relatif, identifiant encodé, texte brut renvoyé tel quel', async () => {
    const fetchFn = vi.fn(async () => textResponse(200, '﻿## 2026-01-05\r\nTexte.'))
    const texte = await fetchGdocText(DOC_ID, { fetchFn, protocol: 'https:' })

    expect(texte).toBe('﻿## 2026-01-05\r\nTexte.')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(`api/gdoc-text?docId=${DOC_ID}`)
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' })
    expect(init.headers.Accept).toBe('text/plain, application/json')
  })

  it.each([
    [403, 'Document inaccessible'],
    [404, 'Document inaccessible'],
    [422, 'Identifiant de document Google Docs invalide.'],
    [429, 'Quota horaire atteint, réessayez plus tard.'],
    [502, 'L’import Google Docs a échoué (HTTP 502). Réessayez plus tard.'],
  ])('UC-APP-01-U14 — erreur JSON sans message (HTTP %i) : repli français « %s »', async (status, message) => {
    const fetchFn = async () => jsonResponse(status, {})
    await expect(fetchGdocText(DOC_ID, { fetchFn, protocol: 'https:' })).rejects.toThrow(message)
  })

  it('UC-APP-01-U15 — erreur non JSON (page HTML d’un hébergement statique) : API absente', async () => {
    const fetchFn = async () => textResponse(404, '<!doctype html><title>404</title>', 'text/html')
    await expect(fetchGdocText(DOC_ID, { fetchFn, protocol: 'https:' })).rejects.toThrow(
      GDOC_UNAVAILABLE_MESSAGE,
    )
  })
})

describe('UC-APP-01 — ajustement du découpage et éditeur (étapes 3 et 6)', () => {
  it('UC-APP-01-U16 — isValidIsoDate : date de journée stricte AAAA-MM-JJ, calendrier réel', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-1-5')).toBe(false)
    expect(isValidIsoDate('05/01/2026')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })

  it('UC-APP-01-U17 — PortfolioEditor isolé : compteurs, statut, onChange, plein écran quitté par Échap', () => {
    const onChange = vi.fn()
    const { container } = render(
      <PortfolioEditor
        value={'Lundi\tmatin :\n\n  atelier  photo '}
        onChange={onChange}
        statusText="Enregistré localement à 10:00:00"
      />,
    )
    expect(screen.getByTestId('editor-counter').textContent).toBe('5 mots · 32 caractères') // « : » isolé compte comme un mot
    expect(screen.getByRole('status').textContent).toBe('Enregistré localement à 10:00:00')

    fireEvent.change(screen.getByLabelText('Texte du portfolio'), { target: { value: 'Nouveau texte' } })
    expect(onChange).toHaveBeenCalledWith('Nouveau texte')

    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
    expect(container.querySelector('.portfolio-editor-fullscreen')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.portfolio-editor-fullscreen')).toBeNull()
  })
})

describe('UC-APP-01 — le portfolio surligné par Twin9 réimporté (S3-3, RG10)', () => {
  it('UC-APP-01-U23 — PortfolioView : un fichier, un texte collé ou écrit perd les marques de Twin9 et le tableau de ses traces avant d’être rangé et découpé ; l’import le dit ; un <mark> de la personne reste', async () => {
    const SURLIGNE =
      '## 2026-01-05\n\n<mark data-twin9-code="1.01" data-incertitude="faible" data-intensite="2.19">J’ai monté le capteur.</mark>\n\n' +
      '<!-- twin9-traces -->\n\n| Compétence | Passage |\n|---|---|\n| 1.01 | « J’ai monté le capteur. » |\n\n<!-- /twin9-traces -->\n\n' +
      '## 2026-01-06\n\nJ’ai <mark>lu</mark> les mesures.\n'
    const PROPRE = '## 2026-01-05\n\nJ’ai monté le capteur.\n\n## 2026-01-06\n\nJ’ai <mark>lu</mark> les mesures.\n'
    const store = createPortfolioStore(createMemoryAdapter())
    render(<PortfolioView store={store} today="2026-07-12" saveDelay={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau portfolio' }))
    const editor = await screen.findByLabelText('Texte du portfolio')

    // collé (ou écrit) dans l'éditeur
    fireEvent.change(editor, { target: { value: SURLIGNE } })
    await waitFor(async () => expect((await store.list())[0]?.texte).toBe(PROPRE))
    const [colle] = await store.list()
    expect(colle.segments.map((seg) => seg.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(JSON.stringify(colle)).not.toMatch(/data-twin9|data-incertitude|data-intensite|twin9-traces/)

    // un fichier : de même, et l'import le dit
    fireEvent.change(editor, { target: { value: '' } })
    const fichier = new File([SURLIGNE], 'portfolio-surligne.md', { type: 'text/markdown' })
    fichier.text = async () => SURLIGNE // jsdom n'implémente pas File.prototype.text()
    fireEvent.change(screen.getByLabelText('Importer un fichier .txt ou .md'), { target: { files: [fichier] } })
    expect((await screen.findByText(/Fichier « portfolio-surligne\.md » importé/)).textContent).toContain(
      'Ses surlignages et tableaux de traces de Twin9 ont été retirés : le texte analysé n’en porte jamais.',
    )
    await waitFor(async () => expect((await store.list())[0]?.texte).toBe(PROPRE))
  })
})
