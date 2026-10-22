// Sprint 4, T2 — une analyse qui couvre plusieurs journées du portfolio le dit
// dans l'index : chaque trace dont le passage est écrit un autre jour porte sa
// date (`at`). Ainsi, sans lire aucun détail (D-67), la journée du passage
// renvoie à l'analyse qui l'a relevé : anomalies, heatmap, modale du jour.
// Le champ est facultatif ; un jeu, une archive ou un index d'avant le
// reçoivent de leurs détails (import d'une archive, découpage, passe unique
// du magasin).
import { describe, expect, it } from 'vitest'
import { importFiles } from './import.js'
import { buildArchive, importArchive } from './archive.js'
import { splitArchive } from './split.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import {
  PASSAGE_DATES,
  coveredDates,
  createDataset,
  dayAnomalies,
  passageAt,
  passageCoverage,
  pendingAnomalyCount,
  todoCount,
  upgradeDataset,
  variantWithPassageDates,
  withPassageDates,
} from './model.js'
import { chooseVariant } from './ops.js'
import { buildHeatmap } from './heatmap.js'
import { normalizeReferential } from './referential.js'
import { cellLabel } from '../ui/Heatmap.jsx'
import { importV3Master } from './importers/v3-master.js'
import { JOUR_MULTI, PORTFOLIO_MULTI, multiReferential } from '../test/fixtures.js'

const NOW = '2026-10-22T12:00:00.000Z'
const LATER = '2026-10-23T08:00:00.000Z'

const files = () => [
  { path: 'portfolio.md', text: PORTFOLIO_MULTI },
  { path: '2026-02-10.json', text: JSON.stringify(JOUR_MULTI) },
]
const empty = (id = 'ds-multi') => createDataset({ datasetId: id, title: 'Multi', referential: multiReferential(), now: NOW })
const importMulti = (ds = empty()) => importFiles(files(), ds, { now: NOW })
const day = (ds, date) => ds.days.find((d) => d.date === date)
const traces608 = (ds) => day(ds, '2026-02-10').variants[0].verdicts.find((v) => v.code === '6.08').traces

/** L'index tel qu'un import d'avant T2 le rangeait : aucune trace ne porte `at`. */
function withoutAt(ds) {
  const out = structuredClone(ds)
  for (const d of out.days) for (const v of d.variants) for (const verdict of v.verdicts) for (const t of verdict.traces) delete t.at
  delete out.passageDates
  return out
}
const hasAt = (ds) => ds.days.some((d) => d.variants.some((v) => v.verdicts.some((x) => x.traces.some((t) => 'at' in t))))

/**
 * Un run Twin9 fictif (S4 §5, T2) : sa carte du 10 février retient une preuve
 * dont la pièce est datée du 3 (`date` de la trace, lue par le greffier) et un
 * indice du 10. Son importeur ne garde que `{id, role}` dans l'index ; la date
 * est dans le détail (`sourceDate`).
 */
const twin9Run = () => ({
  kind: 'twin9-run',
  run: { id: 9, journal: 'multi', finished_at: '2026-10-19 10:05:00' },
  referentiel: { poles: [{ num: 6, nom: 'MONDE — Habiter' }], competences: [{ code: '6.08', nom: 'Soin des lieux', pole: 6 }] },
  carto_evolutive: {
    journal_id: 'multi',
    competences: { '6.08': { code: '6.08', attestations: [{ jour_index: 0, journee: '2026-02-10', date: '2026-02-10', confiance: 0.8, score_preuves: 1, score_indices: 1 }], signaux: [] } },
    histoires: {},
    rapports_poles: {},
    kairos_evolutif: '',
  },
  journees: {
    '2026-02-10': {
      journee: '2026-02-10',
      date: '2026-02-10',
      verdicts: {
        '6.08': {
          code: '6.08',
          nom: 'Soin des lieux',
          statut: 'présence établie',
          score_preuves: 1,
          score_indices: 1,
          confiance: 0.8,
          etage: 'tribunal',
          traces_probantes: [
            { piece: 1, extrait: 'Le chat du voisin a ouvert la porte du jardin.', date: '2026-02-03', type: 'journal', role: 'preuve' },
            { piece: 2, extrait: 'Nous avons rangé la salle ensemble.', date: '2026-02-10', type: 'journal', role: 'indice' },
          ],
        },
      },
    },
  },
  memoire: [],
})

describe('importeurs : la date du passage dans l’index', () => {
  it('document-jour : la preuve écrite le 3 porte at, l’indice du 10 n’a pas le champ', async () => {
    const { dataset } = await importMulti()
    const [proof, hint] = traces608(dataset)
    expect(proof).toMatchObject({ role: 'preuve', at: '2026-02-03' })
    expect('at' in hint).toBe(false)
    expect(coveredDates(day(dataset, '2026-02-10').variants[0])).toEqual(new Set(['2026-02-03']))
  })

  it('l’identifiant de la variante ne dépend pas de l’index : une archive d’avant T2 réimportée n’est que doublons', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const res = await importMulti()
    await store.commit(res)
    const exported = await store.exportAll('ds-multi')
    const old = buildArchive({ ...exported, dataset: withoutAt(exported.dataset) }, { now: LATER })
    const again = await importFiles([{ path: 'archive.json', text: JSON.stringify(old) }], res.dataset, { now: LATER })
    expect(again.counts.variantsAdded).toBe(0)
    expect(again.counts.duplicates).toBe(1)
  })

  it('master V3 : la feuille du passage, quand ce n’est pas la journée', () => {
    const master = {
      kind: 'competency-map-master',
      schemaVersion: '3.0.0',
      days: [{ id: 'd1', effectiveDate: '2026-02-10', activeVariantId: 'a', provenance: [{ variantId: 'a' }] }],
      sources: { dayVariants: [{ id: 'a', run: 'r1', effectiveDate: '2026-02-10' }] },
      observations: [{ id: 'o1', variantId: 'a', dayId: 'd1', rawCode: '6.08', normalizedStatus: 'established', verdictConfidence: 0.8 }],
      evidenceLinks: [
        { id: 'l1', observationId: 'o1', passageId: 'p1', evidentialRole: 'preuve' },
        { id: 'l2', observationId: 'o1', passageId: 'p2', evidentialRole: 'indice' },
      ],
      passages: [
        { id: 'p1', verbatim: 'Le chat du voisin a ouvert la porte du jardin.', feuille: '2026-02-03' },
        { id: 'p2', verbatim: 'Nous avons rangé la salle ensemble.', feuille: '2026-02-10' },
      ],
    }
    const [v] = importV3Master(master, { now: NOW }).variants
    expect(v.summary.verdicts[0].traces.map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    expect(Object.values(v.detail.verdicts['6.08'].traces).map((t) => t.sourceDate)).toEqual(['2026-02-03', '2026-02-10'])
  })

  // L'import écrit `at` depuis le détail, quel que soit l'importeur : dans un
  // jeu déjà passé (`passageDates`), la passe du magasin ne se refait pas, et
  // le jeu affiché juste après l'import (« Ouvrir dans l'interface ») n'est
  // pas relu par elle.
  it('run Twin9 : la preuve écrite le 3 porte at dès l’import, dans un jeu neuf comme dans un jeu déjà passé', async () => {
    const run = () => ({ path: 'twin9-run-9.json', text: JSON.stringify(twin9Run()) })
    const fresh = await importFiles([run()], empty('ds-twin9'), { now: NOW })
    expect(traces608(fresh.dataset).map((t) => t.at ?? null)).toEqual(['2026-02-03', null])

    const store = createCartoStore({ adapter: createMemoryAdapter() })
    await store.commit(await importFiles([{ path: 'portfolio.md', text: PORTFOLIO_MULTI }], empty(), { now: NOW }))
    const passed = await store.addPassageDates('ds-multi')
    expect(passed.passageDates).toBe(PASSAGE_DATES)
    const res = await importFiles([run()], passed, { now: LATER })
    expect(traces608(res.dataset).map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    await store.commit(res)
    const reopened = await store.addPassageDates('ds-multi')
    expect(traces608(reopened).map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    // La journée du 3 renvoie à l'analyse Twin9 du 10.
    const coverage = passageCoverage(reopened)
    expect(dayAnomalies(day(reopened, '2026-02-03'), { portfolioImported: true, coverage })).toContainEqual({ severity: 'info', code: 'couverte-par', message: 'Passages relevés par l’analyse du 10 févr.' })
  })

  it('passageAt : rien quand la date est la journée ou illisible (pas même at: undefined)', () => {
    expect(passageAt('2026-02-03', '2026-02-10')).toEqual({ at: '2026-02-03' })
    expect(passageAt('2026-02-10', '2026-02-10')).toEqual({})
    expect(passageAt(null, '2026-02-10')).toEqual({})
    expect(passageAt('3.02.2026', '2026-02-10')).toEqual({})
  })
})

describe('couverture et anomalies', () => {
  it('le 10 : « analyse-multi-journees » ; le 3 : « couverte-par » — des informations, jamais à traiter', async () => {
    const { dataset } = await importMulti()
    const coverage = passageCoverage(dataset)
    expect([...coverage.keys()]).toEqual(['2026-02-03'])
    expect(coverage.get('2026-02-03')).toEqual([{ date: '2026-02-10', variantId: day(dataset, '2026-02-10').variants[0].id, codes: [{ code: '6.08', proofs: 1, hints: 0 }] }])

    const at10 = dayAnomalies(day(dataset, '2026-02-10'), { portfolioImported: true, coverage })
    expect(at10).toContainEqual({ severity: 'info', code: 'analyse-multi-journees', message: 'Analyse du 10 févr. : 1 trace de passages écrits d’autres jours (passages du 3 févr.)' })
    const at3 = dayAnomalies(day(dataset, '2026-02-03'), { portfolioImported: true, coverage })
    expect(at3).toContainEqual({ severity: 'info', code: 'couverte-par', message: 'Passages relevés par l’analyse du 10 févr.' })
    // Sans la couverture (appel d'avant T2), la journée ne dit rien de plus.
    expect(dayAnomalies(day(dataset, '2026-02-03'), { portfolioImported: true }).map((a) => a.code)).toEqual(['sans-analyse'])
    expect(pendingAnomalyCount(dataset)).toBe(0)
    expect(todoCount(dataset)).toBe(0)
  })

  it('plusieurs journées, plusieurs analyses : le message les compte et les nomme', () => {
    const v = { verdicts: [{ code: '6.08', status: 'established', traces: [{ id: 'a', role: 'preuve', at: '2026-02-01' }, { id: 'b', role: 'indice', at: '2026-02-09' }, { id: 'c', role: 'indice', at: '2026-02-09' }] }] }
    const [a] = dayAnomalies({ date: '2026-02-10', variants: [v], variantChoice: 'auto', portfolio: null })
    expect(a.message).toBe('Analyse du 10 févr. : 3 traces de passages écrits d’autres jours (2 journées, du 1er févr. au 9 févr.)')
    const coverage = new Map([['2026-02-03', [{ date: '2026-02-10', codes: [] }, { date: '2026-02-17', codes: [] }]]])
    const covered = dayAnomalies({ date: '2026-02-03', variants: [], variantChoice: 'auto', portfolio: { chars: 10 } }, { coverage })
    expect(covered.find((x) => x.code === 'couverte-par').message).toBe('Passages relevés par les analyses du 10 févr. et du 17 févr.')
    // L'année d'une autre année seulement.
    const [y] = dayAnomalies({ date: '2026-01-02', variants: [{ verdicts: [{ code: '1', status: 'established', traces: [{ id: 'x', role: 'preuve', at: '2025-12-30' }] }] }], variantChoice: 'auto', portfolio: null })
    expect(y.message).toBe('Analyse du 2 janv. : 1 trace de passages écrits d’autres jours (passages du 30 déc. 2025)')
  })

  it('seule la variante qui contribue relève, et seulement ce que les calculs retiennent', async () => {
    let { dataset } = await importMulti()
    dataset = chooseVariant(dataset, '2026-02-10', null, { now: NOW })
    expect(passageCoverage(dataset).size).toBe(0)
    const ds = structuredClone((await importMulti()).dataset)
    day(ds, '2026-02-10').variants[0].verdicts[0].courtCircuit = true
    expect(passageCoverage(ds).size).toBe(0)
  })

  // Les deux côtés du chemin comptent les mêmes traces (D-72) : le 10 ne dit
  // pas « couvre » ce que le 3 ne dit pas « relevé ».
  it('court-circuit ou présence non établie : ni « analyse-multi-journees » au 10, ni « couverte-par » au 3', async () => {
    const changes = { courtCircuit: (v) => (v.courtCircuit = true), not_established: (v) => (v.status = 'not_established') }
    for (const [name, change] of Object.entries(changes)) {
      const ds = structuredClone((await importMulti()).dataset)
      const v10 = day(ds, '2026-02-10').variants[0]
      change(v10.verdicts[0])
      const coverage = passageCoverage(ds)
      expect(coverage.size, name).toBe(0)
      expect(coveredDates(v10).size, name).toBe(0)
      expect(dayAnomalies(day(ds, '2026-02-10'), { portfolioImported: true, coverage }).map((a) => a.code), name).not.toContain('analyse-multi-journees')
      expect(dayAnomalies(day(ds, '2026-02-03'), { portfolioImported: true, coverage }).map((a) => a.code), name).toEqual(['sans-analyse'])
    }
  })

  it('heatmap : la case du 3 dit l’analyse qui a relevé ses passages', async () => {
    const { dataset } = await importMulti()
    const ref = normalizeReferential(multiReferential())
    const { cells, mode } = buildHeatmap(dataset, { ref, period: { from: '2026-02-01', to: '2026-02-28' } })
    expect(cells.get('2026-02-03').coveredBy).toEqual(['2026-02-10'])
    expect(cells.get('2026-02-10').coveredBy).toEqual([])
    expect(cellLabel('2026-02-03', cells.get('2026-02-03'), { mode, t: null, observed: false })).toMatch(/sans analyse, passages relevés par l’analyse du 10 févr\., cochée$/)
  })
})

describe('jeux, archives et index d’avant T2', () => {
  it('withPassageDates : rempli depuis les détails, idempotent, le même objet quand rien ne change', async () => {
    const res = await importMulti()
    const details = (date) => res.detailPatches.get(date)
    const old = withoutAt(res.dataset)
    const filled = withPassageDates(old, details)
    expect(traces608(filled).map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    expect(withPassageDates(filled, details)).toBe(filled)
    expect(withPassageDates(res.dataset, details)).toBe(res.dataset)
    // Un détail absent : la trace garde ce qu'elle a.
    expect(withPassageDates(res.dataset, () => null)).toBe(res.dataset)
    // Un `at` faux (même date que la journée dans le détail) est retiré.
    const vid = day(res.dataset, '2026-02-10').variants[0].id
    const detail = structuredClone(details('2026-02-10').variants[vid])
    for (const t of Object.values(detail.verdicts['6.08'].traces)) t.sourceDate = '2026-02-10'
    const v = variantWithPassageDates(day(res.dataset, '2026-02-10').variants[0], detail, '2026-02-10')
    expect(v.verdicts[0].traces.some((t) => 'at' in t)).toBe(false)
  })

  it('upgradeDataset garde at et est idempotent', async () => {
    const { dataset } = await importMulti()
    const once = upgradeDataset(dataset)
    expect(upgradeDataset(once)).toEqual(once)
    expect(traces608(once)[0].at).toBe('2026-02-03')
  })

  it('une archive d’avant T2 : at lu dans ses détails à l’import', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    await store.commit(await importMulti())
    const exported = await store.exportAll('ds-multi')
    const old = buildArchive({ ...exported, dataset: withoutAt(exported.dataset) }, { now: LATER })
    expect(hasAt(old)).toBe(false)
    const [v10] = importArchive(old).variants.filter((v) => v.date === '2026-02-10')
    expect(v10.summary.verdicts[0].traces.map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    const res = await importFiles([{ path: 'archive.json', text: JSON.stringify(old) }], empty('ds-new'), { now: LATER })
    expect(traces608(res.dataset)[0].at).toBe('2026-02-03')
  })

  it('découpage : l’index porte at, même d’une archive qui ne l’avait pas ; l’aller-retour le garde', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    await store.commit(await importMulti())
    const exported = await store.exportAll('ds-multi')
    const fresh = buildArchive(exported, { now: LATER })
    const old = buildArchive({ ...exported, dataset: withoutAt(exported.dataset) }, { now: LATER })
    const a = splitArchive(fresh)
    const b = splitArchive(old)
    expect(traces608(a.index)[0].at).toBe('2026-02-03')
    // Même index, mêmes fichiers, même version : at vient des détails.
    expect(b.index).toEqual(a.index)
    // L'index lu à la demande (aucun détail ici) garde at tel quel.
    const remote = importArchive(a.index).variants.find((v) => v.date === '2026-02-10')
    expect(remote.detail).toBeNull()
    expect(remote.summary.verdicts[0].traces[0].at).toBe('2026-02-03')
  })

  it('magasin : une passe unique à l’ouverture, dans une transaction ; jamais sur un jeu lu à la demande', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const res = await importMulti()
    await store.commit(res)
    await store.saveDataset(withoutAt(res.dataset)) // rangé par une version d'avant T2
    expect(hasAt(await store.loadDataset('ds-multi'))).toBe(false)

    const opened = await store.addPassageDates('ds-multi')
    expect(opened.passageDates).toBe(PASSAGE_DATES)
    expect(traces608(opened).map((t) => t.at ?? null)).toEqual(['2026-02-03', null])
    expect(await store.loadDataset('ds-multi')).toEqual(opened)
    // Passée : rien ne se relit ni ne s'écrit (une trace retouchée à la main le reste).
    const touched = structuredClone(opened)
    delete traces608(touched)[0].at
    await store.saveDataset(touched)
    expect(await store.addPassageDates('ds-multi')).toEqual(touched)
    expect(await store.addPassageDates('absent')).toBeNull()

    // Un jeu lu à la demande : ses détails sont sur le site, il reste tel quel.
    const remote = { ...withoutAt(res.dataset), datasetId: 'ds-remote', remote: { version: 'v-000000000000', base: 'v-000000000000/', days: {}, portfolio: {}, codes: {}, poles: {}, runs: {} } }
    await store.saveDataset(remote)
    expect(await store.addPassageDates('ds-remote')).toEqual(remote)
  })
})
