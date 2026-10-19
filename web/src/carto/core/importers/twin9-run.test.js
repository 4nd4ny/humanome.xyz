// Un run Twin9 du serveur dans l'interface (T9) : sa fusion donne les
// journées, chaque verdict reçoit son dossier — motif, prescription, traces
// avec leurs extraits — et la délibération complète va au niveau du run.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cleDeJure, importTwin9Run, looksLikeTwin9Run } from './twin9-run.js'
import { recognize } from '../import.js'

const REFERENTIEL = {
  poles: [1, 2, 3, 4, 5, 6, 7].map((num) => ({ num, nom: `Pôle ${num}` })),
  competences: [
    { code: '1.01', nom: 'Analyse', pole: 1 },
    { code: '1.05', nom: 'Pensée systémique', pole: 1 },
  ],
}

const verdict = (extra = {}) => ({
  code: '1.01',
  nom: 'Analyse',
  statut: 'présence établie',
  score_preuves: 1,
  score_indices: 0,
  confiance: 0.8,
  etage: 'tribunal',
  traces_probantes: [{ piece: 1, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', date: '2026-01-05', type: 'journal', role: 'preuve' }],
  prescription: { pour_apprenant: 'Documente une deuxième situation.', pour_cartographe: 'À relire en entretien.' },
  jury: { mode: 'socle4+1', composition: ['Linguiste', 'Ingénieur'], positions_r1: { Linguiste: 'détection', Ingénieur: 'abstention' }, positions_finales: { Linguiste: 'détection', Ingénieur: 'détection' }, consensus: true, dissidences: [] },
  deliberation: {
    greffier_md: '## Pièce 1\nJ’ai monté le capteur.',
    arene: { accusation_md: 'L’accusation doute.', defense_md: 'La défense cite la pièce 1.', replique_md: null, briefing_md: 'Briefing neutre.' },
    jures: {
      Linguiste: { r1_md: 'Le lexique est précis.', r2_md: null, position_r1: 'détection', position_finale: 'détection', pieces: [1], piege: null },
      Ingénieur: { r1_md: 'Rien à dire.', r2_md: 'Finalement, oui.', position_r1: 'abstention', position_finale: 'détection', pieces: [], piege: 'biais de confirmation' },
    },
    relance_md: null,
    gardiens: { support_md: 'Support conforme.', raisonnement_md: null },
    president_md: 'Le président retient la présence.',
  },
  ...extra,
})

const doc = () => ({
  kind: 'twin9-run',
  run: { id: 7, journal: 'mon-journal', finished_at: '2026-10-19 10:05:00' },
  referentiel: REFERENTIEL,
  carto_evolutive: {
    journal_id: 'mon-journal',
    competences: {
      '1.01': {
        code: '1.01',
        attestations: [
          { jour_index: 0, journee: '2026-01-05', date: '2026-01-05', confiance: 0.8, score_preuves: 1, score_indices: 0 },
          { jour_index: 1, journee: '2026-01-06', date: '2026-01-06', confiance: 0.7, score_preuves: 1, score_indices: 0 },
        ],
        signaux: [],
      },
    },
    histoires: { '1.01': 'Une histoire.' },
    rapports_poles: { 1: 'Un rapport.' },
    kairos_evolutif: 'Un kairos.',
  },
  journees: {
    '2026-01-05': { journee: '2026-01-05', date: '2026-01-05', verdicts: { '1.01': verdict() } },
    // une journée reprise de la mémoire : sa carte, sans jury
    '2026-01-06': { journee: '2026-01-06', date: '2026-01-06', verdicts: { '1.01': verdict({ jury: null, deliberation: {}, traces_probantes: [] }) } },
  },
  memoire: ['2026-01-06'],
})

describe('importTwin9Run (T9)', () => {
  it('reconnaît un run du serveur', () => {
    expect(looksLikeTwin9Run(doc())).toBe(true)
    expect(looksLikeTwin9Run({ kind: 'cartographie-merge', domains: [] })).toBe(false)
  })

  it('joint à chaque verdict son dossier, et la délibération au niveau du run', () => {
    const r = importTwin9Run(doc(), { now: '2026-10-19T10:00:00Z' })
    expect(r.variants.map((v) => v.date)).toEqual(['2026-01-05', '2026-01-06'])
    const [jour1, jour2] = r.variants
    expect(jour1.summary.provenance).toMatchObject({ source: 'twin9', run: 'twin9:7' })

    const v = jour1.summary.verdicts.find((x) => x.code === '1.01')
    expect([v.status, v.proofs, v.hints]).toEqual(['established', 1, 0])
    const d = jour1.detail.verdicts['1.01']
    expect(d.prescription).toBe('Documente une deuxième situation.')
    expect(Object.values(d.traces)[0]).toMatchObject({ role: 'preuve', extract: 'J’ai monté le capteur et vérifié chaque mesure.', resolved: true, sourceDate: '2026-01-05' })
    expect(d.runRef).toBe('twin9:7|2026-01-05|1.01')

    expect(r.runDetails.map((x) => x.key)).toEqual(['twin9:7|2026-01-05|1.01'])
    const run = r.runDetails[0].value
    expect(Object.keys(run.jury)).toEqual(['linguiste', 'ingenieur'])
    expect(run.jury.ingenieur).toEqual({ label: 'Ingénieur', position: 'détection', synthese: 'Finalement, oui.' })
    expect(run.deliberation.ingenieur.markdown).toContain('**Piège nommé** : biais de confirmation')
    expect(run.deliberation.president.markdown).toBe('Le président retient la présence.')
    expect(Object.keys(run.debate)).toEqual(['accusation', 'defense', 'briefing', 'gardien_support'])
    expect(run.pieces).toEqual([{ date: '2026-01-05', name: 'Pièces du greffier', text: '## Pièce 1\nJ’ai monté le capteur.' }])
    expect(run.notes).toEqual([{ titre: 'Pour le cartographe', markdown: 'À relire en entretien.' }])
    expect(d.runScope).toBe('journee')

    // la journée reprise de la mémoire : son dossier, sans délibération
    expect(jour2.detail.verdicts['1.01'].runRef).toBeUndefined()
    expect(jour2.detail.verdicts['1.01'].prescription).toBe('Documente une deuxième situation.')
    expect([...new Set(r.narratives.map((n) => n.kind))].sort()).toEqual(['competence-evolutive', 'kairos-evolutif', 'pole-evolutif'])
  })

  it('passe par la chaîne d’import de l’interface', () => {
    const res = recognize([{ path: 'twin9-run-7.json', text: JSON.stringify(doc()) }], { now: '2026-10-19T10:00:00Z' })
    expect(res.variants).toHaveLength(2)
    expect(res.runDetails).toHaveLength(1)
    expect(res.report.filter((x) => x.severity === 'blocking')).toEqual([])
  })

  it('tient ses journées de ses cartes du jour, même quand sa fusion ne se lit pas', () => {
    const r = importTwin9Run({ ...doc(), carto_evolutive: { competences: {} } })
    expect(r.report[0]).toMatchObject({ severity: 'warning', code: 'twin9-fusion-illisible' })
    expect(r.variants.map((v) => v.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(r.narratives).toEqual([])
  })

  it('met en quarantaine un run sans journée datée', () => {
    const r = importTwin9Run({ ...doc(), carto_evolutive: { competences: {} }, journees: {} })
    expect(r.report.find((x) => x.severity === 'blocking')).toMatchObject({ code: 'twin9-illisible' })
  })

  it('garde d’une journée ses verdicts établis, renvoyés ou jugés, pas les autres', () => {
    const d = doc()
    d.journees['2026-01-05'].verdicts['1.05'] = verdict({ code: '1.05', statut: 'renvoi au cartographe', traces_probantes: [], score_preuves: 0 })
    d.journees['2026-01-05'].verdicts['2.01'] = { code: '2.01', statut: 'présence non établie', confiance: 0.1 }
    const [jour1] = importTwin9Run(d).variants
    expect(jour1.summary.verdicts.map((v) => [v.code, v.status])).toEqual([['1.01', 'established'], ['1.05', 'needs_review']])
    expect(jour1.detail.verdicts['1.05'].runRef).toBe('twin9:7|2026-01-05|1.05')
  })

  it('nomme un juré sans accent ni majuscule', () => {
    expect(cleDeJure('Pédagogue')).toBe('pedagogue')
    expect(cleDeJure('Ingénieur')).toBe('ingenieur')
  })
})

// Les sorties du scénario cloud de l'oracle (Twin_v9, dépôt privé, cloné à côté) : sans lui, sauté.
const ORACLE = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../Twin_v9/oracle/scenarios/02-cloud/outputs')
const oraclePresent = existsSync(`${ORACLE}/carto_evolutive.json`)

describe.skipIf(!oraclePresent)('importTwin9Run (sorties réelles de l’oracle)', () => {
  it('donne à chaque journée ses dossiers, et ses délibérations aux verdicts jugés', () => {
    const journees = {}
    for (const jour of readdirSync(`${ORACLE}/journees`)) {
      journees[jour] = JSON.parse(readFileSync(`${ORACLE}/journees/${jour}/carto_jour.json`, 'utf8'))
    }
    const competences = Object.values(JSON.parse(readFileSync(`${ORACLE}/carto_evolutive.json`, 'utf8')).competences)
    const referentiel = {
      poles: REFERENTIEL.poles,
      competences: competences.map((c) => ({ code: c.code, nom: c.nom, pole: Number(c.pole) })),
    }
    const r = importTwin9Run({
      kind: 'twin9-run',
      run: { id: 1, journal: 'PLANT-01' },
      referentiel,
      carto_evolutive: JSON.parse(readFileSync(`${ORACLE}/carto_evolutive.json`, 'utf8')),
      journees,
    })
    expect(r.variants.length).toBe(10)
    expect(r.report.filter((x) => x.severity === 'blocking')).toEqual([])
    expect(r.runDetails.length).toBeGreaterThan(0)
    const jure = r.runDetails.find((x) => Object.keys(x.value.jury).length === 6)
    expect(jure).toBeTruthy()
    expect(Object.values(jure.value.jury).every((j) => typeof j.position === 'string')).toBe(true)
  })
})
