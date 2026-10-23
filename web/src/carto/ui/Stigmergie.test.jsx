// S3-3 — les traces de la stigmergie du greffier de Twin9 dans l'interface :
// un run ouvert dans la cartographie montre, dans la modale du jour, les
// traces de son analyse, chacune selon sa nature (l'incertitude calculée par
// la procédure) ; « Ouvrir dans le portfolio » surligne son passage de la
// marque de sa nature. L'intensité ne se lit qu'en mode expert et pour le
// cartographe, jamais comme une note ; une journée en panne ne montre pas ses
// traces comme conservées. L'export propose alors le portfolio surligné.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { sansMarquesTwin9 } from '../../lib/twin9/marques.js'
import { miniReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-23T12:00:00.000Z'
const PORTFOLIO = '## 2026-01-05\n\nJ’ai monté le capteur et vérifié chaque mesure.\n\nJe relie la pompe, la sonde et le réservoir.\n'

const verdict = {
  code: '1.01',
  nom: 'Pensée critique',
  statut: 'présence établie',
  score_preuves: 1,
  score_indices: 0,
  confiance: 0.8,
  etage: 'tribunal',
  traces_probantes: [{ piece: 1, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', date: '2026-01-05', type: 'journal', role: 'preuve' }],
}

/** Un run du serveur, sa journée avec la stigmergie ; `conservee` : ce que disent ses résultats. */
const run = (conservee) => ({
  kind: 'twin9-run',
  run: { id: 7, journal: 'mon-journal', finished_at: '2026-10-23 10:05:00' },
  referentiel: miniReferential(),
  carto_evolutive: null,
  journees: {
    '2026-01-05': {
      journee: '2026-01-05',
      date: '2026-01-05',
      verdicts: { '1.01': verdict },
      stigmergie: {
        analyse: 2,
        run: '2026-10-23T10:00:00.a1b2c3',
        explorateurs: [],
        lues: {},
        depots: [],
        rejets: [],
        traces: [
          { id: 't-0a1b2c3d4e5f', code: '1.01', start: 15, end: 63, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', tau: 2.19, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 2 },
          { id: 't-5f4e3d2c1b0a', code: '2.01', start: 65, end: 110, extrait: 'Je relie la pompe, la sonde et le réservoir.', tau: 0.147, incertitude: 'écartée', statut: 'présence non établie', voie: 'tribunal', role: null, source: 'trace_probante', analyses: 1 },
        ],
      },
    },
  },
  memoire: [],
  ...(conservee === undefined ? {} : { traces_conservees: { '2026-01-05': conservee } }),
})

async function storeWith(conservee) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const base = createDataset({ datasetId: 'ds-sg', title: 'Twin9 · mon-journal', referential: miniReferential(), now: NOW })
  const files = [
    { path: 'portfolio.md', text: PORTFOLIO },
    { path: 'twin9-run-7.json', text: JSON.stringify(run(conservee)) },
  ]
  await store.commit(await importFiles(files, base, { now: NOW }))
  return store
}

function Harness({ store, session }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} session={session} />
}

/** La modale du 5 janvier, et sa section des traces une fois lues. */
async function openDay(store, session) {
  window.location.hash = '#/cartographie/jour/2026-01-05'
  render(<Harness store={store} session={session} />)
  const dialog = await screen.findByRole('dialog', { name: /5 janvier 2026/ })
  const section = await within(dialog).findByRole('region', { name: /^Traces de la stigmergie/ })
  await waitFor(() => expect(within(section).queryByText('Chargement…')).toBeNull())
  return { dialog, section }
}

const reader = () => screen.findByRole('region', { name: /5 janvier 2026/, hidden: false })
const readerMarks = () => [...document.querySelectorAll('.carto-reader-text mark.carto-hl')]

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const EXPERT = { roles: ['apprenant'], expert: true }
const SIMPLE = { roles: ['apprenant'], expert: false }

describe('les traces de la stigmergie dans la modale du jour (S3-3)', () => {
  it('chaque trace, dans l’ordre du référentiel, avec sa nature en mots et sa marque, son dernier verdict et ce qu’en fait le greffier suivant ; en mode expert, son intensité — jamais « score »', async () => {
    const { section } = await openDay(await storeWith(true), EXPERT)
    expect(within(section).getByRole('heading', { name: 'Traces de la stigmergie (2)' })).toBeTruthy()
    expect(section.textContent).toContain('Conservées dans la mémoire de la carte')
    expect(section.textContent).toContain('à l’analyse n° 2 de cette journée')
    const items = [...section.querySelectorAll('.carto-sg-list > li')]
    expect(items.map((li) => li.querySelector('.carto-sg-what').textContent)).toEqual([
      '1.01 Pensée critique · incertitude faible · intensité 2,19 sur 3, déposée par 2 analyses',
      '2.01 Écoute · écartée · intensité 0,15 sur 3, déposée par 1 analyse',
    ])
    expect(items[0].querySelector('mark').className).toBe('carto-hl carto-hl--complete carto-hl--trace carto-hl--trace-faible')
    expect(items[1].querySelector('mark').className).toBe('carto-hl carto-hl--complete carto-hl--trace carto-hl--trace-ecartee')
    expect(items[0].textContent).toContain('Dernier verdict : présence établie, tribunal (preuve décisive) — le greffier la reverse comme pièce si le passage porte toujours la compétence.')
    expect(items[1].textContent).toContain('déjà instruite et non retenue')
    // la légende dit chaque nature en mots, à côté de sa marque
    expect([...section.querySelectorAll('.carto-sg-legend mark')].map((m) => m.textContent)).toEqual(['incertitude faible', 'incertitude moyenne', 'incertitude forte', 'écartée'])
    expect(section.textContent).not.toMatch(/score/i)
  })

  it('« Ouvrir dans le portfolio » surligne le passage de la marque de sa nature, et le dit ; l’intensité suit le mode', async () => {
    const { section } = await openDay(await storeWith(true), EXPERT)
    fireEvent.click(within(section).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })[0])
    const panel = await reader()
    await waitFor(() => expect(readerMarks().length).toBeGreaterThan(0))
    // le passage, comme tout extrait retrouvé (core/highlight.js : sa ponctuation finale hors du surlignage)
    expect(readerMarks().map((m) => m.textContent).join('')).toMatch(/^J’ai monté le capteur et vérifié chaque mesure\.?$/)
    for (const m of readerMarks()) expect(m.classList.contains('carto-hl--trace-faible')).toBe(true)
    const note = [...panel.querySelectorAll('.carto-reader-note')].find((p) => p.textContent.startsWith('Trace de la stigmergie'))
    expect(note.textContent).toBe('Trace de la stigmergie, surlignée selon sa nature : incertitude faible, calculée par la procédure ; intensité 2,19 sur 3.')
    expect(panel.textContent).toContain('Trace 1.01 · incertitude faible')
    expect(panel.textContent).not.toMatch(/score/i)
  })

  it('en mode simple, ni dans la modale ni dans le volet, l’intensité ne se lit ; pour un cartographe, si ; sans session, jamais', async () => {
    for (const [session, visible] of [
      [SIMPLE, false],
      [{ roles: ['cartographe'], expert: false }, true],
      [null, false],
    ]) {
      const { section } = await openDay(await storeWith(true), session)
      expect(section.textContent.includes('intensité'), JSON.stringify(session)).toBe(visible)
      fireEvent.click(within(section).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })[0])
      const panel = await reader()
      await waitFor(() => expect(readerMarks().length).toBeGreaterThan(0))
      expect(panel.textContent.includes('intensité'), JSON.stringify(session)).toBe(visible)
      expect(section.textContent).toContain('incertitude faible')
      cleanup()
    }
  })

  it('une journée en panne : ses traces dites non conservées, dans la modale et dans le volet ; sans signal, non confirmées', async () => {
    const { section } = await openDay(await storeWith(false), EXPERT)
    const warning = section.querySelector('.carto-sg-warning')
    expect(warning.textContent).toContain('Non conservées')
    expect(warning.textContent).toContain('une panne n’est jamais un verdict')
    expect(section.textContent).not.toContain('Conservées dans la mémoire de la carte')
    fireEvent.click(within(section).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })[1])
    const panel = await reader()
    await waitFor(() => expect(readerMarks().length).toBeGreaterThan(0))
    for (const m of readerMarks()) expect(m.classList.contains('carto-hl--trace-ecartee')).toBe(true)
    expect(panel.textContent).toContain('Non conservée dans la mémoire de la carte : elle ne guide pas l’analyse suivante.')
    cleanup()

    const sans = await openDay(await storeWith(undefined), EXPERT)
    expect(sans.section.querySelector('.carto-sg-warning').textContent).toContain('Non confirmées')
  })
})

describe('le portfolio surligné dans l’export (S3-3)', () => {
  let downloads
  beforeEach(() => {
    downloads = []
    URL.createObjectURL = vi.fn((blob) => {
      downloads.push({ blob })
      return `blob:test/${downloads.length}`
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      const d = downloads.find((x) => `blob:test/${downloads.indexOf(x) + 1}` === this.href)
      if (d) d.name = this.download
    })
  })
  const readBlob = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsText(blob)
    })
  const openExport = async (store, session) => {
    window.location.hash = '#/cartographie/export'
    render(<Harness store={store} session={session} />)
    return screen.findByRole('region', { name: 'Exporter' })
  }

  it('des traces conservées : le fichier marque leurs passages selon leur nature, l’intensité seulement en mode expert ; réimporté, le portfolio sans marques', async () => {
    for (const [session, intensite] of [
      [EXPERT, true],
      [SIMPLE, false],
    ]) {
      const page = await openExport(await storeWith(true), session)
      fireEvent.click(within(page).getByRole('button', { name: 'Télécharger le portfolio surligné (.md)' }))
      await waitFor(() => expect(downloads.at(-1)?.name).toBeTruthy())
      const d = downloads.at(-1)
      expect(d.name).toMatch(/^cartographie-portfolio-surligne-\d{4}-\d{2}-\d{2}\.md$/)
      expect(d.blob.type).toBe('text/markdown')
      const text = await readBlob(d.blob)
      expect(text).toContain(
        `<mark data-twin9-code="1.01" data-incertitude="faible"${intensite ? ' data-intensite="2.19"' : ''}>J’ai monté le capteur et vérifié chaque mesure.</mark>`,
      )
      expect(text).toContain('data-incertitude="écartée"')
      expect(text.includes('Intensité (sur 3)')).toBe(intensite)
      expect(text).not.toMatch(/score/i)
      expect(sansMarquesTwin9(text)).not.toMatch(/data-twin9|data-incertitude|data-intensite|twin9-traces/)
      expect((await within(page).findByRole('status')).textContent).toMatch(/portfolio-surligne-.*téléchargé : 1 journée, 2 traces\./)
      // le portfolio ordinaire, lui, ne change pas
      fireEvent.click(within(page).getByRole('button', { name: 'Télécharger le portfolio (.md)' }))
      await waitFor(() => expect(downloads.at(-1)?.name).toMatch(/^cartographie-portfolio-\d/))
      expect(sansMarquesTwin9(text)).toBe(await readBlob(downloads.at(-1).blob))
      cleanup()
    }
  })

  it('des traces non conservées (une journée en panne) : pas de portfolio surligné', async () => {
    const page = await openExport(await storeWith(false), EXPERT)
    expect(within(page).getByRole('button', { name: 'Télécharger le portfolio (.md)' })).toBeTruthy()
    expect(within(page).queryByRole('button', { name: 'Télécharger le portfolio surligné (.md)' })).toBeNull()
  })
})
