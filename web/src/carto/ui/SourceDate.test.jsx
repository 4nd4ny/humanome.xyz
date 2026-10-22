// Sprint 4, T1 — une analyse rangée au 10 février porte une trace dont le
// passage est écrit sous l'en-tête du 3 février (S4.md §5). L'interface le dit
// désormais partout où elle montre la trace : modale du 10 (« passage du … »),
// volet du portfolio (« trace de l'analyse du … », « Ouvrir la journée
// analysée »), modale du 3 (« Aucune analyse n'est rangée à ce jour »).
//
// Ce fichier a d'abord été un test de CARACTÉRISATION, vert sur le code
// d'avant T1 : la modale du 3 disait « Pas d'analyse qui contribue pour ce
// jour. », la trace 1 de 6.08 ne disait que son rôle dans la modale du 10, et
// le volet ouvert sur le 3 ne mentionnait pas le 10. Ces assertions sont
// inversées ici : elles échouent sur le code d'avant T1.
//
// T2 (plus bas) : l'index dit la date du passage de chaque trace (`at`) ; la
// modale du 3 renvoie à l'analyse du 10, le gestionnaire le dit aussi, et un
// jeu rangé avant T2 le reçoit une fois, à son ouverture.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { DayModal, noContribution } from './DayModal.jsx'
import { SOURCE_LABELS, provenanceLabel } from './Manager.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { chooseVariant } from '../core/ops.js'
import { normalizeReferential } from '../core/referential.js'
import { resolveParams, sunGeometry } from '../core/formulas.js'
import { parseHash, subscribe } from '../../router.js'
import { JOUR_MULTI, PORTFOLIO_MULTI, indexDataset, miniReferential, multiReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-22T12:00:00.000Z'

async function importMulti() {
  const ds = createDataset({ datasetId: 'ds-multi', title: 'Multi', referential: multiReferential(), now: NOW })
  return importFiles(
    [
      { path: 'portfolio.md', text: PORTFOLIO_MULTI },
      { path: '2026-02-10.json', text: JSON.stringify(JOUR_MULTI) },
    ],
    ds,
    { now: NOW },
  )
}

async function storeMulti() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  await store.commit(await importMulti())
  return store
}

function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: multiReferential() }) }} />
}

async function mount(store) {
  render(<Harness store={store} />)
  await screen.findByRole('heading', { name: 'Cartographie' })
}

const reader = () => screen.queryByRole('region', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) / })
const marks = (root) => [...root.querySelectorAll('.carto-reader-text mark.carto-hl')]
const sector = (prefix) => document.querySelector(`[data-tile="sun"] .carto-sun [role="button"][aria-label^="${prefix}"]`)

/** Liste des traces (de la modale ou du panneau), extraits chargés. */
async function traceSection(root) {
  const section = await within(root).findByRole('region', { name: 'Traces de la compétence' })
  await waitFor(() => expect(within(section).queryAllByText('Chargement de l’extrait…')).toHaveLength(0))
  return section
}

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('sprint 4 — une analyse qui couvre plusieurs journées du portfolio (T1)', () => {
  it('le jeu a le 3 (portfolio seul) et le 10 (une analyse) ; la preuve de 6.08 garde la date de son passage', async () => {
    const { dataset, detailPatches } = await importMulti()
    const byDate = new Map(dataset.days.map((d) => [d.date, d]))
    expect([...byDate.keys()]).toEqual(['2026-02-03', '2026-02-10'])
    expect(byDate.get('2026-02-03').variants).toHaveLength(0)
    expect(byDate.get('2026-02-03').portfolio.chars).toBeGreaterThan(0)
    expect(byDate.get('2026-02-10').variants).toHaveLength(1)
    const variant = byDate.get('2026-02-10').variants[0]
    const traces = detailPatches.get('2026-02-10').variants[variant.id].verdicts['6.08'].traces
    expect(Object.values(traces).map((t) => [t.role, t.sourceDate])).toEqual([
      ['preuve', '2026-02-03'],
      ['indice', '2026-02-10'],
    ])
  })

  it('modale du 3 : « Aucune analyse n’est rangée à ce jour », et non plus « Pas d’analyse qui contribue »', async () => {
    window.location.hash = '#/cartographie/jour/2026-02-03'
    await mount(await storeMulti())
    const dialog = await screen.findByRole('dialog', { name: /3 février 2026/ })
    expect(within(dialog).getByText('Aucune analyse n’est rangée à ce jour.')).toBeTruthy()
    expect(within(dialog).queryByText(/Pas d’analyse qui contribue/)).toBeNull()
    const facts = [...dialog.querySelectorAll('.carto-day-facts div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])
    expect(facts).toContainEqual(['Analyse', 'aucune'])
  })

  it('modale du 10 : la preuve dit « passage du mar. 3 févr. » et ouvre ce jour ; l’indice, du 10, ne redit pas sa date (D-66)', async () => {
    window.location.hash = '#/cartographie/jour/2026-02-10?focus=6.08'
    await mount(await storeMulti())
    const dialog = await screen.findByRole('dialog', { name: /10 février 2026/ })
    const traces = await traceSection(dialog)
    expect([...traces.querySelectorAll('.carto-trace-meta')].map((m) => m.textContent)).toEqual(['passage du mar. 3 févr.preuve', 'indice'])
    const passage = within(traces).getByRole('button', { name: 'passage du mar. 3 févr.' })
    expect(passage.getAttribute('title')).toBe('Ouvrir la cartographie du 3 février 2026')
    fireEvent.click(passage)
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie/jour/2026-02-03?focus=6.08'))
    await screen.findByRole('dialog', { name: /3 février 2026/ })
  })

  it('depuis la modale du 10, la preuve s’ouvre sur le 3 et le volet dit « trace de l’analyse du 10 février 2026 »', async () => {
    window.location.hash = '#/cartographie/jour/2026-02-10?focus=6.08'
    await mount(await storeMulti())
    const dialog = await screen.findByRole('dialog', { name: /10 février 2026/ })
    const open = within(await traceSection(dialog)).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })
    expect(open).toHaveLength(2)
    fireEvent.click(open[0])
    const r = await screen.findByRole('region', { name: 'mardi 3 février 2026' })
    await waitFor(() => expect(marks(r).length).toBeGreaterThan(0))
    expect(marks(r).map((m) => m.textContent).join('')).toBe('Le chat du voisin a ouvert la porte du jardin')
    expect(r.querySelector('.carto-reader-sub').textContent).toBe('trace 1 sur 2, preuve, trace de l’analyse du 10 février 2026')
    // Lu par les lecteurs d'écran aussi.
    expect(within(r).getByRole('status').textContent).toBe('Trace 1 sur 2, mardi 3 février 2026 : Passage surligné. Trace de l’analyse du 10 février 2026.')
    expect(within(r).getByRole('button', { name: 'Ouvrir la journée analysée' })).toBeTruthy()

    // L'indice, dont le passage est du 10 : le volet montre la journée analysée, rien à dire.
    fireEvent.click(within(r).getByRole('button', { name: 'Trace suivante' }))
    const r2 = await screen.findByRole('region', { name: 'mardi 10 février 2026' })
    await waitFor(() => expect(marks(r2).length).toBeGreaterThan(0))
    expect(r2.querySelector('.carto-reader-sub').textContent).toBe('trace 2 sur 2, indice')
    expect(within(r2).queryByRole('button', { name: 'Ouvrir la journée analysée' })).toBeNull()
    expect(within(r2).getByRole('status').textContent).toBe('Trace 2 sur 2, mardi 10 février 2026 : Passage surligné.')
  })

  it('panneau de 6.08 : « Ouvrir la journée analysée » ferme le volet et ouvre la modale du 10 sur 6.08', async () => {
    await mount(await storeMulti())
    fireEvent.click(sector('6.08 '))
    const detail = document.querySelector('[data-tile="detail"]')
    const open = within(await traceSection(detail)).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })
    fireEvent.click(open[0])
    const r = await screen.findByRole('region', { name: 'mardi 3 février 2026' })
    await waitFor(() => expect(marks(r).length).toBeGreaterThan(0))
    fireEvent.click(within(r).getByRole('button', { name: 'Ouvrir la journée analysée' }))
    await waitFor(() => expect(reader()).toBeNull())
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie/jour/2026-02-10?focus=6.08'))
    const dialog = await screen.findByRole('dialog', { name: /10 février 2026/ })
    expect(dialog.querySelector('.carto-pole.is-focus .carto-code').textContent).toBe('6.08')
  })
})

/** L'index tel qu'une version d'avant T2 le rangeait : aucune trace ne porte `at`. */
function withoutAt(ds) {
  const out = structuredClone(ds)
  for (const d of out.days) for (const v of d.variants) for (const verdict of v.verdicts) for (const t of verdict.traces) delete t.at
  return out
}

describe('sprint 4 — la journée du passage renvoie à l’analyse qui l’a relevé (T2)', () => {
  const covered = (dialog) => within(dialog).queryByRole('region', { name: /^Relevé par l’analyse du / })

  it('modale du 3 : « Relevé par l’analyse du 10 février », 6.08 et sa preuve ; le lien ouvre le 10 sur 6.08', async () => {
    window.location.hash = '#/cartographie/jour/2026-02-03'
    await mount(await storeMulti())
    const dialog = await screen.findByRole('dialog', { name: /3 février 2026/ })
    // La journée n'a toujours pas d'analyse à elle (T3 n'est pas fait) : le message reste.
    expect(within(dialog).getByText('Aucune analyse n’est rangée à ce jour.')).toBeTruthy()
    const section = covered(dialog)
    expect(section).toBeTruthy()
    expect(within(section).getByRole('heading').textContent).toBe('Relevé par l’analyse du 10 février')
    expect(section.textContent).toContain('leurs traces comptent dans la cartographie du 10 février, pas dans celle de ce jour')
    expect([...section.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['6.08 Soin des lieux · 1 preuve, 0 indice'])
    const link = within(section).getByRole('button', { name: '6.08 Soin des lieux' })
    expect(link.getAttribute('title')).toBe('Ouvrir la cartographie du 10 février 2026 sur 6.08')
    fireEvent.click(link)
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie/jour/2026-02-10?focus=6.08'))
    const ten = await screen.findByRole('dialog', { name: /10 février 2026/ })
    expect(ten.querySelector('.carto-pole.is-focus .carto-code').textContent).toBe('6.08')
    // Le 10 a son analyse : pas de section.
    expect(covered(ten)).toBeNull()
  })

  it('gestionnaire : le 3 « relevée le 10 févr. », le 10 « couvre 1 autre journée », sans point d’anomalie', async () => {
    await mount(await storeMulti())
    const rows = [...document.querySelectorAll('.carto-day-list li.carto-day')]
    const row = (date) => rows.find((li) => li.querySelector('.carto-day-date').textContent === date)
    const three = row('mar. 3 févr. 2026').querySelector('.carto-day-ind')
    expect(within(three).getByText('relevée le 10 févr.').getAttribute('title')).toBe('Passages relevés par l’analyse du 10 févr.')
    expect(within(three).queryByText('!')).toBeNull()
    const ten = row('mar. 10 févr. 2026').querySelector('.carto-day-ind')
    expect(within(ten).getByText('couvre 1 autre journée').getAttribute('title')).toBe('Analyse du 10 févr. : 1 trace de passages écrits d’autres jours (passages du 3 févr.)')
    expect(document.querySelector('.carto-dot')).toBeNull()
  })

  it('gestionnaire : une trace que les calculs ne retiennent pas (présence non établie) ne fait ni « couvre » ni « relevée »', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const res = await importMulti()
    await store.commit(res)
    const ds = structuredClone(res.dataset)
    ds.days.find((d) => d.date === '2026-02-10').variants[0].verdicts[0].status = 'not_established'
    await store.saveDataset(ds)
    await mount(store)
    const rows = [...document.querySelectorAll('.carto-day-list li.carto-day')]
    const row = (date) => rows.find((li) => li.querySelector('.carto-day-date').textContent === date)
    expect(row('mar. 10 févr. 2026').querySelector('.carto-day-ind').textContent).not.toMatch(/couvre/)
    expect(row('mar. 3 févr. 2026').querySelector('.carto-day-ind').textContent).not.toMatch(/relevée/)
  })

  it('un jeu rangé avant T2 reçoit at à son ouverture, une fois : la modale du 3 renvoie au 10', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const res = await importMulti()
    await store.commit(res)
    await store.saveDataset(withoutAt(res.dataset))
    window.location.hash = '#/cartographie/jour/2026-02-03'
    await mount(store)
    const dialog = await screen.findByRole('dialog', { name: /3 février 2026/ })
    await waitFor(() => expect(covered(dialog)).toBeTruthy())
    const stored = await store.loadDataset('ds-multi')
    expect(stored.passageDates).toBe(1)
    expect(stored.days.find((d) => d.date === '2026-02-10').variants[0].verdicts[0].traces[0].at).toBe('2026-02-03')
  })

  it('sans lien à suivre (DayModal seul), les compétences sont nommées sans bouton', async () => {
    const { dataset } = await importMulti()
    const params = resolveParams({})
    render(<DayModal dataset={dataset} refl={normalizeReferential(multiReferential())} params={params} geometry={sunGeometry(params)} activeDates={['2026-02-03', '2026-02-10']} date="2026-02-03" onClose={() => {}} onNavigate={() => {}} />)
    const section = within(screen.getByRole('dialog')).getByRole('region', { name: 'Relevé par l’analyse du 10 février' })
    expect(within(section).queryAllByRole('button')).toHaveLength(0)
    expect(section.querySelector('li').textContent).toBe('6.08 Soin des lieux · 1 preuve, 0 indice')
  })
})

describe('sprint 4 — trois messages pour une journée qui ne contribue pas (C7)', () => {
  const params = resolveParams({})
  const props = (ds) => ({ dataset: ds, refl: normalizeReferential(miniReferential()), params, geometry: sunGeometry(params), activeDates: ds.days.map((d) => d.date), onClose: () => {}, onNavigate: () => {} })

  /** Une journée à deux analyses, en attente d'arbitrage. */
  function pendingDataset() {
    const ds = indexDataset([{ date: '2026-01-01', verdicts: [{ code: '1.01' }] }])
    const day = ds.days[0]
    day.variants.push({ ...day.variants[0], id: 'v-autre' })
    day.activeVariantId = null
    day.variantChoice = 'pending'
    return ds
  }

  it('journée à arbitrer : le nombre d’analyses et le Gestionnaire, pas « aucune analyse »', () => {
    render(<DayModal {...props(pendingDataset())} date="2026-01-01" />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('2 analyses : choisissez celle qui compte dans le Gestionnaire.')).toBeTruthy()
    expect(within(dialog).getByText('2 analyses à arbitrer')).toBeTruthy()
    expect(within(dialog).queryByText(/Aucune analyse/)).toBeNull()
  })

  it('journée mise à examiner', () => {
    const ds = chooseVariant(indexDataset([{ date: '2026-01-01', verdicts: [{ code: '1.01' }] }]), '2026-01-01', null)
    render(<DayModal {...props(ds)} date="2026-01-01" />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Journée mise à examiner : elle ne compte pas.')).toBeTruthy()
    expect(within(dialog).getByText('mise « à examiner »')).toBeTruthy()
  })

  it('journée sans analyse, et le cas d’une seule analyse sans choix', () => {
    expect(noContribution({ variants: [] }).message).toBe('Aucune analyse n’est rangée à ce jour.')
    expect(noContribution(undefined).fact).toBe('aucune')
    expect(noContribution({ variants: [{ id: 'v' }], variantChoice: 'pending' }).message).toBe('L’analyse de ce jour ne compte pas : choisissez-la dans le Gestionnaire.')
  })

  it('une journée qui contribue n’affiche aucun de ces messages', () => {
    const ds = indexDataset([{ date: '2026-01-01', verdicts: [{ code: '1.01' }] }])
    render(<DayModal {...props(ds)} date="2026-01-01" />)
    expect(screen.queryByText(/Aucune analyse|analyses :|mise à examiner/)).toBeNull()
  })
})

describe('sprint 4 — libellés de provenance (C10, C11)', () => {
  it('« run du X » : la date du run, pas celle de la journée ; Twin9 nommé', () => {
    const v = { verdicts: [{}, {}], provenance: { source: 'twin9', run: 'twin9:7', analysedAt: '2026-02-11T08:00:00Z' } }
    expect(provenanceLabel(v)).toBe('Twin9 — twin9:7 — run du 2026-02-11 — 2 verdicts')
    expect(SOURCE_LABELS.twin9).toBe('Twin9')
  })
})
