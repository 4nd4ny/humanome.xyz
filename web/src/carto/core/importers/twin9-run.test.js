// Un run Twin9 du serveur dans l'interface (T9) : sa fusion donne les
// journées, chaque verdict reçoit son dossier — motif, prescription, traces
// avec leurs extraits — et la délibération complète va au niveau du run.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cleDeJure, configurationGardee, executionGardee, importTwin9Run, looksLikeTwin9Run } from './twin9-run.js'
import { importFiles, recognize } from '../import.js'
import { createCartoStore, createMemoryAdapter } from '../store.js'
import { buildArchive } from '../archive.js'
import { createDataset } from '../model.js'
import { provenanceLabel } from '../../ui/Manager.jsx'
import { assembleDay, splitArchive } from '../split.js'
import { validateDocument } from '@engine/validation.js'
// un run configuré tel que ses résultats le rendent à son propriétaire (P0-1) : valeurs inventées, prix compris
import exemple from '../../../../../schemas/fixtures/twin9-configuration-exemple.json'

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

  it('ouvre la carte incomplète d’un run arrêté avant sa fusion, et le dit (T10)', () => {
    const incomplet = { ...doc(), carto_evolutive: null, incomplete: true }
    incomplet.run = { ...incomplet.run, statut: 'echoue', retard: 'Budget atteint : carte incomplète' }
    expect(looksLikeTwin9Run(incomplet)).toBe(true)
    const r = importTwin9Run(incomplet)
    expect(r.variants.map((v) => v.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(r.narratives).toEqual([])
    expect(r.report.filter((x) => x.severity === 'warning')).toEqual([
      { severity: 'warning', code: 'twin9-incomplete', message: 'Carte incomplète : le run s’est arrêté avant sa fin (budget atteint)' },
    ])
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

  it('rend le référentiel du run, que la chaîne d’import donne au jeu (T17)', () => {
    const r = importTwin9Run(doc())
    expect(r.referential.poles.map((p) => p.num)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(r.referential.competences.map((c) => c.code)).toEqual(['1.01', '1.05'])
    expect(recognize([{ path: 'twin9-run-7.json', text: JSON.stringify(doc()) }]).referential).toEqual(r.referential)
  })

  it('lit un référentiel aux pôles lettrés : chacun y reçoit son numéro d’ordre, et la fusion se lit (T17)', () => {
    const d = doc()
    d.referentiel = {
      id: 'fictif-lettre',
      version: '1.0.0',
      label: 'Fictif lettré',
      poles: [
        { num: 'A', nom: 'A · Percevoir' },
        { num: 'B', nom: 'B · Agir' },
      ],
      competences: [
        { code: 'A1', nom: 'Capacité A1', pole: 'A' },
        { code: 'B1', nom: 'Capacité B1', pole: 'B' },
      ],
    }
    d.carto_evolutive.competences = { A1: { ...d.carto_evolutive.competences['1.01'], code: 'A1' } }
    d.carto_evolutive.histoires = { A1: 'Une histoire.' }
    for (const j of Object.values(d.journees)) j.verdicts = { A1: { ...j.verdicts['1.01'], code: 'A1', nom: 'Capacité A1' } }
    const r = importTwin9Run(d)
    expect(r.referential.poles.map((p) => [p.num, p.nom])).toEqual([
      [1, 'A · Percevoir'],
      [2, 'B · Agir'],
    ])
    expect(r.referential.competences.map((c) => [c.code, c.pole])).toEqual([
      ['A1', 1],
      ['B1', 2],
    ])
    expect(r.report.filter((x) => x.code === 'twin9-fusion-illisible')).toEqual([])
    expect(r.narratives.filter((n) => n.kind === 'competence-evolutive').map((n) => n.scope)).toEqual([{ code: 'A1' }])
    expect(r.variants.map((v) => v.summary.verdicts.map((x) => x.code))).toEqual([['A1'], ['A1']])
  })

  it('range la synthèse d’un pôle sous son numéro, pas sous le début d’un code (T17)', () => {
    // des codes que rien ne relie au numéro de leur pôle : « 21 » est au pôle 2
    const d = doc()
    d.referentiel = {
      id: 'fictif-codes',
      version: '1.0.0',
      label: 'Codes sans pôle',
      poles: [
        { num: 1, nom: 'Pôle un' },
        { num: 2, nom: 'Pôle deux' },
      ],
      competences: [
        { code: '11', nom: 'Compétence 11', pole: 1 },
        { code: '21', nom: 'Compétence 21', pole: 2 },
      ],
    }
    d.carto_evolutive.competences = { 21: { ...d.carto_evolutive.competences['1.01'], code: '21' } }
    d.carto_evolutive.histoires = { 21: 'Une histoire.' }
    d.carto_evolutive.rapports_poles = { 2: 'Le rapport du pôle deux.' }
    for (const j of Object.values(d.journees)) j.verdicts = { 21: { ...j.verdicts['1.01'], code: '21', nom: 'Compétence 21' } }
    const r = importTwin9Run(d)
    const poles = r.narratives.filter((n) => n.kind === 'pole-evolutif')
    expect(poles.map((n) => n.scope)).toEqual([{ pole: 1 }, { pole: 2 }])
    expect(poles[1].html).toContain('Le rapport du pôle deux.')
  })

  it('dit un référentiel du run illisible, et le jeu garde le sien', () => {
    const d = doc()
    d.referentiel = { poles: [{ num: 1, nom: 'Pôle un' }], competences: [{ code: 'A1', nom: 'Capacité', pole: 9 }] }
    const r = importTwin9Run(d)
    expect(r.referential).toBe(null)
    expect(r.report.find((x) => x.code === 'twin9-referentiel-illisible')).toMatchObject({ severity: 'warning' })
  })

  it('nomme un juré sans accent ni majuscule', () => {
    expect(cleDeJure('Pédagogue')).toBe('pedagogue')
    expect(cleDeJure('Ingénieur')).toBe('ingenieur')
  })
})

// P0-1 (docs/contrats.md §8.9) : le run porte sa configuration et son exécution. Le jeu, qui se partage et
// s'archive, n'en garde qu'une liste blanche — ni prix, ni coût, ni plafond, ni clé, ni l'admission.
describe('importTwin9Run : la configuration du run (P0-1)', () => {
  /** Ce que le jeu ne doit jamais garder d'un run : ce que paie son propriétaire, et comment ; ni le sel de son empreinte. */
  const INTERDITS = ['"prix"', '"grille"', '"remise_lots"', '"cle"', '"plafonds"', '"budget_usd"', '"cout_microusd"', '"jetons', '"execution_prevue"', '"algorithme"', '"versions"', '"reprises"', 'reserve_microusd', 'engagement_microusd', 'fedcba9876543210', '"sel"', exemple.run.configuration.sel]

  /** Le run de doc(), configuré, son attestation avec son admission, et une journée que seule la fusion donne. */
  const configure = () => {
    const d = doc()
    d.run = {
      ...d.run,
      attestation: {
        profil: { id: 3, nom: 'Direct', mode: 'complet' },
        admission: { journees: 3, total: 3, reserve_microusd: 123456, engagement_microusd: 654321 },
        gabarits: { jeu: 'jeu-exemple', versions: { 'exemple/etape': 2 }, empreinte: 'fedcba9876543210' },
      },
      configuration: structuredClone(exemple.run.configuration),
      execution: structuredClone(exemple.run.execution),
    }
    d.carto_evolutive.competences['1.01'].attestations.push({ jour_index: 2, journee: '2026-01-07', date: '2026-01-07', confiance: 0.6, score_preuves: 1, score_indices: 0 })
    return d
  }
  const sansConfiguration = () => {
    const d = configure()
    delete d.run.configuration
    delete d.run.execution
    return d
  }
  const conf = exemple.run.configuration

  it('dit, sur chaque journée, ses modèles, son jeu de gabarits et le renvoi à sa configuration — fusion comprise', () => {
    const r = importTwin9Run(configure(), { now: '2026-10-22T10:00:00Z' })
    expect(r.variants.map((v) => v.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    for (const v of r.variants) {
      expect(v.summary.provenance).toMatchObject({
        source: 'twin9',
        run: 'twin9:7',
        model: 'profond: claude-exemple-profond, rapide: claude-exemple-rapide, lecteurs: claude-exemple-rapide',
        prompt: 'gabarits jeu-exemple',
        configurationRef: 'twin9:7|configuration',
        configuration: { empreinte: 'ad519cee3a0b8405', fournisseurs: ['anthropic'], voies: ['lots'] },
      })
    }
    // le libellé de provenance de l'interface les dit
    expect(provenanceLabel(r.variants[0].summary)).toBe(
      'Twin9 (serveur) — twin9:7 — profond: claude-exemple-profond, rapide: claude-exemple-rapide, lecteurs: claude-exemple-rapide — gabarits jeu-exemple — run du 2026-10-19 — 1 verdicts',
    )
  })

  it('garde sa configuration et son exécution par liste blanche, sous « <run>|configuration », sans la compter comme une délibération', () => {
    const r = importTwin9Run(configure(), { now: '2026-10-22T10:00:00Z' })
    expect(r.runDetails.map((x) => x.key)).toEqual(['twin9:7|2026-01-05|1.01', 'twin9:7|configuration'])
    expect(r.report.find((x) => x.code === 'twin9-run').message).toBe('Run Twin9 7 : 3 journée(s), 1 délibération(s)')
    const meta = r.runDetails[1].value
    expect(meta).toEqual({
      kind: 'twin9-run-meta',
      run: 'twin9:7',
      configuration: {
        empreinte: 'ad519cee3a0b8405',
        fournisseurs: { anthropic: { libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' } },
        appels: conf.appels,
        referentiel: conf.referentiel,
        gabarits: { jeu: 'jeu-exemple' },
      },
      execution: {
        statut: 'termine',
        source: 'fige',
        partiel: false,
        passes: 12,
        appels: { total: 9, repondus: 8, pannes: 1, tronques: 1, refus: 0 },
        par_fournisseur: { anthropic: { appels: 9, pannes: 1, tronques: 1 } },
        par_voie: { lots: { appels: 9, pannes: 1, tronques: 1 } },
      },
    })
    // ni prix, ni coût, ni plafond, ni clé, ni l'admission de l'attestation, ni l'empreinte des gabarits, nulle part
    const texte = JSON.stringify(r)
    for (const interdit of INTERDITS) expect(texte, interdit).not.toContain(interdit)
  })

  it('ne recopie qu’un champ nommé, et seulement une valeur simple : une clé inconnue ou un objet glissé dans un réglage ne passent pas', () => {
    const c = structuredClone(conf)
    c.appels.etages.profond.secret = 'à ne pas garder'
    c.appels.etages.profond.modele = { cache: 'objet' }
    c.fournisseurs.anthropic.cle = 'sk-fictive'
    c.referentiel.fiches = ['fiche']
    c.gabarits.contenu = 'gabarit fictif'
    const garde = configurationGardee(c)
    expect(garde.appels.etages.profond).toEqual({ fournisseur: 'anthropic', voie: 'lots', budget_sortie: 4000, effort: 'medium', reflexion: 'adaptative' })
    expect(garde.fournisseurs.anthropic).toEqual({ libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' })
    expect(JSON.stringify(garde)).not.toMatch(/secret|cache|sk-fictive|fiche|gabarit fictif/)
    // un cartographe lié lit l'exécution sans coût : elle se garde de même
    expect(executionGardee({ ...exemple.run.execution, cout_microusd: undefined }).appels.total).toBe(9)
    expect([configurationGardee(null), configurationGardee(undefined), configurationGardee([]), executionGardee(null)]).toEqual([null, null, null, null])
  })

  it('sans configuration (un run d’avant P0-1, ou nulle), rien ne change : provenance, délibérations, rapport', () => {
    for (const d of [sansConfiguration(), { ...sansConfiguration(), run: { ...sansConfiguration().run, configuration: null, execution: null } }]) {
      const r = importTwin9Run(d, { now: '2026-10-22T10:00:00Z' })
      for (const v of r.variants.filter((x) => x.date !== '2026-01-07')) {
        expect(v.summary.provenance).toEqual({ source: 'twin9', run: 'twin9:7', files: ['twin9-run.json'], model: null, prompt: null, analysedAt: '2026-10-19 10:05:00', importedAt: '2026-10-22T10:00:00Z' })
      }
      // la journée de la fusion garde le libellé de la fusion du site
      expect(r.variants.find((x) => x.date === '2026-01-07').summary.provenance).toMatchObject({ source: 'twin9', run: 'twin9:7', model: null, prompt: 'Twin9 — run du serveur' })
      expect(r.runDetails.map((x) => x.key)).toEqual(['twin9:7|2026-01-05|1.01'])
    }
  })

  it('garde les mêmes variantes, identifiants et empreintes, avec ou sans configuration : la réimportation déduplique', () => {
    const avec = importTwin9Run(configure(), { now: '2026-10-22T10:00:00Z' })
    const sans = importTwin9Run(sansConfiguration(), { now: '2026-10-22T10:00:00Z' })
    const ids = (r) => r.variants.map((v) => [v.date, v.summary.id, v.summary.digest])
    expect(ids(avec)).toEqual(ids(sans))
    expect(ids(avec)).toHaveLength(3)
  })

  it('passe par la chaîne d’import et le magasin : le jeu exporté garde la configuration, jamais un prix, un coût ni la clé', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const base = createDataset({ datasetId: 'ds-twin9', title: 'Twin9 · mon-journal', referential: REFERENTIEL, now: '2026-10-22T10:00:00Z' })
    const result = await importFiles([{ path: 'twin9-run-7.json', text: JSON.stringify(configure()) }], base, { now: '2026-10-22T10:00:00Z' })
    expect(result.report.filter((x) => x.severity === 'blocking')).toEqual([])
    await store.commit(result)
    const archive = buildArchive(await store.exportAll('ds-twin9'), { now: '2026-10-22T10:00:00Z' })
    expect(archive.runDetails['twin9:7|configuration'].configuration.empreinte).toBe('ad519cee3a0b8405')
    const texte = JSON.stringify(archive)
    for (const interdit of INTERDITS) expect(texte, interdit).not.toContain(interdit)
  })
})

// Le bloc `stigmergie` d'une carte du jour (spec-stigmergie.md §9 de Twin_v9), aux valeurs inventées.
const STIGMERGIE = () => ({
  analyse: 3,
  run: '2026-10-23T10:00:00.a1b2c3',
  explorateurs: ['1.05'],
  lues: { '1.01': ['t-0a1b2c3d4e5f'] },
  depots: [{ code: '1.01', start: 0, end: 48, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', delta: 1.0, incertitude: 'faible', trace: 't-0a1b2c3d4e5f' }],
  rejets: [{ code: '1.05', facteur: 0.3, incertitude: 'écartée', statut: 'présence non établie', voie: 'tribunal' }],
  traces: [
    { id: 't-0a1b2c3d4e5f', code: '1.01', start: 0, end: 48, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', tau: 2.19, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 3, premier_run: '2026-10-21T10:00:00.f0f0f0', dernier_run: '2026-10-23T10:00:00.a1b2c3' },
    { id: 't-5f4e3d2c1b0a', code: '1.05', start: 60, end: 104, extrait: 'Je relie la pompe, la sonde et le réservoir.', tau: 0.147, incertitude: 'écartée', statut: { glisse: 'un objet' }, voie: 'tribunal', role: null, source: 'trace_probante', analyses: 1 },
    // illisibles : une nature inconnue, une intensité qui n'est pas un nombre, un extrait vide, sans code
    { id: 't-1', code: '1.01', extrait: 'un', tau: 1, incertitude: 'certaine' },
    { id: 't-2', code: '1.01', extrait: 'deux', tau: '1.2', incertitude: 'faible' },
    { id: 't-3', code: '1.01', extrait: '  ', tau: 1, incertitude: 'faible' },
    { id: 't-4', extrait: 'quatre', tau: 1, incertitude: 'faible' },
  ],
})

/** Le run du test, ses deux cartes du jour avec la stigmergie ; `extra` : ce que disent ses résultats. */
const avecStigmergie = (extra = {}) => {
  const d = doc()
  d.journees['2026-01-05'].stigmergie = STIGMERGIE()
  d.journees['2026-01-06'].stigmergie = { ...STIGMERGIE(), analyse: 2, run: '2026-10-22T10:00:00.d4d4d4' }
  return { ...d, ...extra }
}

describe('importTwin9Run : la stigmergie du greffier (S3-3)', () => {
  it('garde du bloc, par liste blanche, son rang, son run et ses traces lisibles, dans le détail de la journée ; l’index en dit le compte', () => {
    const r = importTwin9Run(avecStigmergie({ traces_conservees: { '2026-01-05': true, '2026-01-06': true } }), { now: '2026-10-23T10:00:00Z' })
    const [jour1] = r.variants
    expect(jour1.summary.stigmergie).toEqual({ analyse: 3, traces: 2, conservee: true })
    const bloc = jour1.detail.stigmergie
    expect(Object.keys(bloc)).toEqual(['analyse', 'run', 'conservee', 'traces'])
    expect([bloc.analyse, bloc.run, bloc.conservee]).toEqual([3, '2026-10-23T10:00:00.a1b2c3', true])
    expect(bloc.traces).toEqual([
      { id: 't-0a1b2c3d4e5f', code: '1.01', start: 0, end: 48, extrait: 'J’ai monté le capteur et vérifié chaque mesure.', tau: 2.19, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 3 },
      // une valeur qui n'est pas simple ne passe pas
      { id: 't-5f4e3d2c1b0a', code: '1.05', start: 60, end: 104, extrait: 'Je relie la pompe, la sonde et le réservoir.', tau: 0.147, incertitude: 'écartée', statut: null, voie: 'tribunal', role: null, source: 'trace_probante', analyses: 1 },
    ])
    // ni dépôts, ni rejets, ni traces lues, ni explorateurs, ni runs des traces
    const texte = JSON.stringify(bloc)
    for (const absent of ['depots', 'rejets', 'lues', 'explorateurs', 'premier_run', 'dernier_run', 'f0f0f0']) expect(texte, absent).not.toContain(absent)
    expect(r.report.filter((x) => x.code.startsWith('twin9-traces'))).toEqual([])
  })

  it('une journée en panne (son analyse n’est pas dans la mémoire de la carte) montre ses traces non conservées, et le rapport le dit', () => {
    const r = importTwin9Run(avecStigmergie({ traces_conservees: { '2026-01-05': false, '2026-01-06': true } }), { now: '2026-10-23T10:00:00Z' })
    const [jour1, jour2] = r.variants
    expect([jour1.summary.stigmergie.conservee, jour1.detail.stigmergie.conservee]).toEqual([false, false])
    expect(jour2.detail.stigmergie.conservee).toBe(true)
    expect(r.report.filter((x) => x.code.startsWith('twin9-traces'))).toEqual([
      expect.objectContaining({ severity: 'info', code: 'twin9-traces-non-conservees', date: '2026-01-05' }),
    ])
    expect(r.report.find((x) => x.code === 'twin9-traces-non-conservees').message).toContain('une panne n’est jamais un verdict')
  })

  it('sans signal, jamais conservées : la journée reprise de la mémoire, oui ; celle du run, non confirmée ; un signal faux l’emporte sur la mémoire', () => {
    const sans = importTwin9Run(avecStigmergie(), { now: '2026-10-23T10:00:00Z' })
    expect(sans.variants.map((v) => [v.date, v.detail.stigmergie.conservee])).toEqual([
      ['2026-01-05', null],
      ['2026-01-06', true],
    ])
    expect(sans.report.filter((x) => x.code.startsWith('twin9-traces')).map((x) => [x.code, x.date])).toEqual([['twin9-traces-non-confirmees', '2026-01-05']])
    for (const illisible of [null, [true, true], 'oui', { '2026-01-05': 'true' }]) {
      const r = importTwin9Run(avecStigmergie({ traces_conservees: illisible }), { now: '2026-10-23T10:00:00Z' })
      expect(r.variants[0].detail.stigmergie.conservee, JSON.stringify(illisible)).toBeNull()
    }
    const faux = importTwin9Run(avecStigmergie({ traces_conservees: { '2026-01-06': false } }), { now: '2026-10-23T10:00:00Z' })
    expect(faux.variants[1].detail.stigmergie.conservee).toBe(false)
  })

  it('les mêmes variantes, identifiants et empreintes avec ou sans le bloc ; sans lui, ni l’index ni le détail n’ont de clé « stigmergie »', () => {
    const avec = importTwin9Run(avecStigmergie({ traces_conservees: { '2026-01-05': true } }), { now: '2026-10-23T10:00:00Z' })
    const sans = importTwin9Run(doc(), { now: '2026-10-23T10:00:00Z' })
    const ids = (r) => r.variants.map((v) => [v.date, v.summary.id, v.summary.digest])
    expect(ids(avec)).toEqual(ids(sans))
    for (const v of sans.variants) {
      expect(v.summary).not.toHaveProperty('stigmergie')
      expect(v.detail).not.toHaveProperty('stigmergie')
    }
    // un bloc illisible (pas un objet) : comme sans
    const d = doc()
    d.journees['2026-01-05'].stigmergie = ['pas', 'un', 'objet']
    expect(importTwin9Run(d, { now: '2026-10-23T10:00:00Z' }).variants[0].summary).not.toHaveProperty('stigmergie')
  })

  it('passe par la chaîne d’import, le magasin et l’archive : conforme au schéma du master, et le jeu lu à la demande la remonte avec la journée', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const base = createDataset({ datasetId: 'ds-sg', title: 'Twin9 · mon-journal', referential: REFERENTIEL, now: '2026-10-23T10:00:00Z' })
    const run = avecStigmergie({ traces_conservees: { '2026-01-05': true, '2026-01-06': false } })
    const result = await importFiles([{ path: 'twin9-run-7.json', text: JSON.stringify(run) }], base, { now: '2026-10-23T10:00:00Z' })
    expect(result.report.filter((x) => x.severity === 'blocking')).toEqual([])
    await store.commit(result)
    const archive = buildArchive(await store.exportAll('ds-sg'), { now: '2026-10-23T10:00:00Z' })
    expect(validateDocument('competency-map-master', archive)).toEqual({ valid: true, errors: [] })
    const day = archive.days.find((d) => d.date === '2026-01-05')
    expect(day.variants[0].stigmergie).toEqual({ analyse: 3, traces: 2, conservee: true })
    const detail = archive.details['2026-01-05'].variants[day.variants[0].id].stigmergie
    expect(detail.traces.map((t) => [t.code, t.incertitude, t.tau])).toEqual([
      ['1.01', 'faible', 2.19],
      ['1.05', 'écartée', 0.147],
    ])
    // une trace forgée dans une archive (nature inconnue) est refusée par le schéma
    const forgee = JSON.parse(JSON.stringify(archive))
    forgee.details['2026-01-05'].variants[day.variants[0].id].stigmergie.traces[0].incertitude = 'certaine'
    expect(validateDocument('competency-map-master', forgee).valid).toBe(false)

    // lu à la demande (D-67) : le bloc va dans le fichier de la journée, et en revient
    const { index, files } = splitArchive(archive)
    const fichier = files.find((f) => f.path.endsWith('jours/2026-01-05.json'))
    expect(fichier.value.variants[day.variants[0].id].stigmergie).toEqual(detail)
    const remonte = assembleDay('2026-01-05', [day.variants[0].id], { day: fichier.value })
    expect(remonte.variants[day.variants[0].id].stigmergie).toEqual(detail)
    expect(index.days.find((d) => d.date === '2026-01-05').variants[0].stigmergie).toEqual({ analyse: 3, traces: 2, conservee: true })
  })
})

// C3 (sprint 4) : Twin9 range une seconde entrée du même jour sous `<date>_b`, avec la même `date`.
const POMPE = { piece: 1, extrait: 'Je relie la pompe, la sonde et le réservoir.', date: '2026-01-05', type: 'journal', role: 'indice' }
const deuxCartes = (b = {}) => {
  const d = doc()
  d.journees = {
    '2026-01-05': { journee: '2026-01-05', date: '2026-01-05', verdicts: { '1.01': verdict() } },
    '2026-01-05_b': { journee: '2026-01-05_b', date: '2026-01-05', verdicts: { '1.05': verdict({ code: '1.05', nom: 'Pensée systémique', jury: null, deliberation: {}, traces_probantes: [POMPE] }) }, ...b },
  }
  d.memoire = []
  return d
}

describe('importTwin9Run : deux cartes du même jour (C3, sprint 4)', () => {
  it('une journée, les compétences des deux cartes réunies, et un avertissement — aucune ne disparaît sans rien dire', () => {
    const r = importTwin9Run(deuxCartes(), { now: '2026-10-23T10:00:00Z' })
    const jour = r.variants.find((v) => v.date === '2026-01-05')
    expect(r.variants.filter((v) => v.date === '2026-01-05')).toHaveLength(1)
    expect(jour.summary.verdicts.map((v) => v.code)).toEqual(['1.01', '1.05'])
    expect(Object.values(jour.detail.verdicts['1.05'].traces).map((t) => t.extract)).toEqual([POMPE.extrait])
    expect(r.report).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'twin9-journee-dupliquee', date: '2026-01-05' }))
    expect(r.report.find((x) => x.code === 'twin9-journee-dupliquee').message).toBe('2026-01-05 : deux cartes du jour (2026-01-05, 2026-01-05_b) réunies en une journée — à code égal, le statut le plus fort l’emporte, leurs traces réunies')
  })

  it('à code égal, le statut le plus fort l’emporte avec son dossier ; les traces des deux sont réunies, sans doublon', () => {
    const d = deuxCartes()
    // la première établit 1.01, sur le capteur ; la seconde la renvoie au cartographe, sur le capteur et la pompe
    const capteur = verdict().traces_probantes[0]
    d.journees['2026-01-05_b'].verdicts = { '1.01': verdict({ statut: 'renvoi au cartographe', confiance: 0.3, jury: null, deliberation: {}, prescription: { pour_apprenant: 'Précise.' }, traces_probantes: [{ ...capteur }, POMPE] }) }
    const r = importTwin9Run(d, { now: '2026-10-23T10:00:00Z' })
    const jour = r.variants.find((v) => v.date === '2026-01-05')
    const v = jour.summary.verdicts.find((x) => x.code === '1.01')
    expect([v.status, v.confidence, v.proofs, v.hints]).toEqual(['established', 0.8, 1, 1])
    const det = jour.detail.verdicts['1.01']
    expect(det.prescription).toBe('Documente une deuxième situation.')
    expect(Object.values(det.traces).map((t) => t.extract)).toEqual([capteur.extrait, POMPE.extrait])
    // sa délibération, une seule, celle du verdict retenu
    expect(r.runDetails.filter((x) => x.key.startsWith('twin9:7|2026-01-05|')).map((x) => x.key)).toEqual(['twin9:7|2026-01-05|1.01'])
  })

  it('l’ordre des cartes dans les résultats ne change rien : la journée et son identifiant sont les mêmes', () => {
    const d = deuxCartes()
    const inverse = { ...d, journees: { '2026-01-05_b': d.journees['2026-01-05_b'], '2026-01-05': d.journees['2026-01-05'] } }
    const ids = (x) => importTwin9Run(x, { now: '2026-10-23T10:00:00Z' }).variants.map((v) => [v.date, v.summary.id])
    expect(ids(inverse)).toEqual(ids(d))
  })

  it('la stigmergie des deux cartes : leurs traces réunies ; conservées si les deux le sont, non si l’une ne l’est pas', () => {
    const d = deuxCartes({ stigmergie: { ...STIGMERGIE(), analyse: 1, run: '2026-10-23T10:00:00.b2b2b2', traces: [STIGMERGIE().traces[1]] } })
    d.journees['2026-01-05'].stigmergie = { ...STIGMERGIE(), traces: [STIGMERGIE().traces[0]] }
    const lire = (conservees) => importTwin9Run({ ...d, traces_conservees: conservees }, { now: '2026-10-23T10:00:00Z' }).variants.find((v) => v.date === '2026-01-05')
    const deux = lire({ '2026-01-05': true, '2026-01-05_b': true })
    expect(deux.detail.stigmergie.traces.map((t) => t.id)).toEqual(['t-0a1b2c3d4e5f', 't-5f4e3d2c1b0a'])
    expect(deux.summary.stigmergie).toEqual({ analyse: 3, traces: 2, conservee: true })
    expect(lire({ '2026-01-05': true, '2026-01-05_b': false }).detail.stigmergie.conservee).toBe(false)
    expect(lire({ '2026-01-05': true }).detail.stigmergie.conservee).toBeNull()
  })

  it('passe par la chaîne d’import : la trace dont le passage est d’un autre jour y porte `at` (T2)', async () => {
    const d = deuxCartes()
    d.journees['2026-01-05_b'].verdicts['1.05'].traces_probantes = [{ ...POMPE, date: '2026-01-03' }]
    const res = await importFiles([{ path: 'twin9-run-7.json', text: JSON.stringify(d) }], createDataset({ datasetId: 'ds-c3', title: 'Twin9', referential: REFERENTIEL, now: '2026-10-23T10:00:00Z' }), { now: '2026-10-23T10:00:00Z' })
    const jour = res.dataset.days.find((x) => x.date === '2026-01-05')
    expect(jour.variants).toHaveLength(1)
    expect(jour.variants[0].verdicts.find((v) => v.code === '1.05').traces).toEqual([expect.objectContaining({ role: 'indice', at: '2026-01-03' })])
  })
})

// C4 (sprint 4 ; D-68) : une compétence que le second ressort établit par faisceau d'indices de plusieurs
// journées, quand aucune carte du jour ne l'établit. Valeurs inventées.
const STATUT_FAISCEAU = 'établie par faisceau (second ressort)'
const RESERVOIR = { piece: 2, extrait: 'Le réservoir déborde quand la sonde se tait.', date: '2026-01-06', type: 'indice', role: 'indice corroboratif' }
const nonEtablie = { code: '1.05', nom: 'Pensée systémique', statut: 'présence non établie', etage: 'non-détectée', confiance: 0, score_preuves: 0, score_indices: 0, traces_probantes: [] }
const avecFaisceau = (faisceau = {}) => {
  const d = doc()
  d.carto_evolutive.competences['1.05'] = {
    code: '1.05',
    nom: 'Pensée systémique',
    pole: 1,
    statut_temporel: STATUT_FAISCEAU,
    attestations: [
      { jour_index: 0, journee: '2026-01-05', date: '2026-01-05', etage: 'faisceau', confiance: 0.6, score_preuves: 0, score_indices: 1 },
      { jour_index: 1, journee: '2026-01-06', date: '2026-01-06', etage: 'faisceau', confiance: 0.6, score_preuves: 0, score_indices: 1 },
    ],
    signaux: [],
    faisceau: {
      statut: 'présence établie',
      confiance: 0.6,
      motif: 'Deux indices concordants, sur deux journées.',
      prescription: { pour_apprenant: 'Relie la pompe et le réservoir dans un schéma.', pour_cartographe: 'Faisceau à confirmer en entretien.' },
      traces: [{ ...POMPE, type: 'indice', role: 'indice corroboratif' }, RESERVOIR],
      jury: { mode: 'faisceau', composition: ['Linguiste', 'Ingénieur'], positions_r1: { Linguiste: 'détection', Ingénieur: 'détection' }, positions_finales: { Linguiste: 'détection', Ingénieur: 'détection' }, consensus: true, dissidences: [] },
      gardien: null,
      dossier_cartographe: null,
      deliberation: {
        greffier_md: '# Dossier de faisceau — 1.05',
        arene: { accusation_md: 'Deux indices ne font pas une preuve.', defense_md: 'Ils se répondent.' },
        jures: { Linguiste: { r1_md: 'Le lien est explicite.', position_r1: 'détection', position_finale: 'détection' } },
        president_md: 'Le faisceau tient.',
      },
      ...faisceau,
    },
  }
  d.journees['2026-01-05'].verdicts['1.05'] = { ...nonEtablie }
  d.journees['2026-01-06'].verdicts['1.05'] = { ...nonEtablie }
  return d
}

describe('importTwin9Run : établie par faisceau, en seconde lecture (C4, sprint 4 ; D-68)', () => {
  it('le run rend une seconde lecture : la compétence, son statut, ses traces et leurs dates ; sa délibération à part', () => {
    const r = importTwin9Run(avecFaisceau(), { now: '2026-10-23T10:00:00Z' })
    expect(r.readings).toEqual([
      {
        id: 'twin9:7:second-ressort',
        source: 'twin9',
        journal: 'mon-journal',
        analysedAt: '2026-10-19',
        importedAt: '2026-10-23T10:00:00Z',
        codes: { '1.05': { status: 'established', rawStatus: STATUT_FAISCEAU, confidence: 0.6, proofs: 0, hints: 2, dates: ['2026-01-05', '2026-01-06'] } },
        poles: [],
      },
    ])
    const lecture = r.runDetails.find((x) => x.key === 'twin9:7:second-ressort|1.05').value
    expect(lecture.president).toEqual({ verdict_argumente: 'Deux indices concordants, sur deux journées.', prescription: 'Relie la pompe et le réservoir dans un schéma.' })
    expect(lecture.traces).toEqual([
      { pieceId: 1, role: 'indice', pieceType: 'indice', extract: POMPE.extrait, date: '2026-01-05' },
      { pieceId: 2, role: 'indice', pieceType: 'indice', extract: RESERVOIR.extrait, date: '2026-01-06' },
    ])
    expect(Object.keys(lecture.jury)).toEqual(['linguiste'])
    expect(lecture.deliberation.president.markdown).toBe('Le faisceau tient.')
    expect(lecture.notes).toEqual([{ titre: 'Pour le cartographe', markdown: 'Faisceau à confirmer en entretien.' }])
  })

  it('sans entrer dans le soleil : aucune journée — carte du jour ou fusion — ne la porte établie', () => {
    const d = avecFaisceau()
    delete d.journees['2026-01-06'] // une journée sans carte : la fusion la donne
    const r = importTwin9Run(d, { now: '2026-10-23T10:00:00Z' })
    expect(r.variants.map((v) => v.date)).toEqual(['2026-01-05', '2026-01-06'])
    for (const v of r.variants) expect(v.summary.verdicts.filter((x) => x.code === '1.05'), v.date).toEqual([])
  })

  it('un faisceau renvoyé au cartographe ou non retenu n’est pas une seconde lecture ; un run sans faisceau n’en a pas', () => {
    const renvoi = avecFaisceau({ statut: 'renvoi au cartographe' })
    renvoi.carto_evolutive.competences['1.05'].statut_temporel = 'renvoi au cartographe'
    renvoi.carto_evolutive.competences['1.05'].attestations = []
    expect(importTwin9Run(renvoi, { now: '2026-10-23T10:00:00Z' }).readings).toEqual([])
    expect(importTwin9Run(doc(), { now: '2026-10-23T10:00:00Z' }).readings).toEqual([])
  })

  it('passe par la chaîne d’import et l’archive : jointe en seconde lecture, le compte rendu le dit ; conforme au schéma ; réimportée, rien n’est doublé', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const base = createDataset({ datasetId: 'ds-c4', title: 'Twin9 · mon-journal', referential: REFERENTIEL, now: '2026-10-23T10:00:00Z' })
    const fichier = { path: 'twin9-run-7.json', text: JSON.stringify(avecFaisceau()) }
    const res = await importFiles([fichier], base, { now: '2026-10-23T10:00:00Z' })
    expect(res.dataset.readings.map((x) => x.id)).toEqual(['twin9:7:second-ressort'])
    expect(res.report).toContainEqual(
      expect.objectContaining({
        code: 'seconde-lecture',
        message: 'Second ressort du run Twin9 twin9:7 joint en seconde lecture (1 compétence établie par faisceau) : il se lit avec chaque compétence et ne change pas le soleil',
      }),
    )
    for (const day of res.dataset.days) for (const v of day.variants) expect(v.verdicts.map((x) => x.code)).not.toContain('1.05')
    await store.commit(res)
    const archive = buildArchive(await store.exportAll('ds-c4'), { now: '2026-10-23T10:00:00Z' })
    expect(validateDocument('competency-map-master', archive)).toEqual({ valid: true, errors: [] })
    expect(archive.readings[0].codes['1.05'].dates).toEqual(['2026-01-05', '2026-01-06'])
    expect(archive.runDetails['twin9:7:second-ressort|1.05'].traces).toHaveLength(2)
    // une date qui n'en est pas une, glissée dans une archive, est refusée par le schéma
    const forgee = JSON.parse(JSON.stringify(archive))
    forgee.readings[0].codes['1.05'].dates = ['5 janvier']
    expect(validateDocument('competency-map-master', forgee).valid).toBe(false)
    const encore = await importFiles([fichier], res.dataset, { now: '2026-10-23T11:00:00Z' })
    expect(encore.dataset.readings).toHaveLength(1)
    expect(encore.report).toContainEqual(expect.objectContaining({ code: 'doublon', message: 'Seconde lecture twin9:7:second-ressort déjà jointe — doublon ignoré' }))
  })
})

// Les sorties du scénario cloud de l'oracle (Twin_v9, dépôt privé : `TWIN_V9_DIR`, par défaut cloné à côté,
// ../Twin_v9) : sans lui, sauté.
const TWIN_V9_DIR = process.env.TWIN_V9_DIR || join(dirname(fileURLToPath(import.meta.url)), '../../../../../../Twin_v9')
const ORACLE = join(TWIN_V9_DIR, 'oracle/scenarios/02-cloud/outputs')
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

// Le scénario 12 de l'oracle (jury tiré au sort) : son second ressort établit 2.07 par faisceau, que
// toutes ses cartes du jour disent « présence non établie ». Lu dans `TWIN_V9_DIR`, jamais recopié.
const ORACLE_12 = join(TWIN_V9_DIR, 'oracle/scenarios/12-jury-random/outputs')
describe.skipIf(!existsSync(`${ORACLE_12}/carto_evolutive.json`))('importTwin9Run (oracle, un faisceau établi : C4)', () => {
  it('2.07 en seconde lecture, avec ses dates ; aucune journée ne la porte', () => {
    const carto = JSON.parse(readFileSync(`${ORACLE_12}/carto_evolutive.json`, 'utf8'))
    const journees = {}
    for (const jour of readdirSync(`${ORACLE_12}/journees`)) journees[jour] = JSON.parse(readFileSync(`${ORACLE_12}/journees/${jour}/carto_jour.json`, 'utf8'))
    const referentiel = { poles: REFERENTIEL.poles, competences: Object.values(carto.competences).map((c) => ({ code: c.code, nom: c.nom, pole: Number(c.pole) })) }
    const r = importTwin9Run({ kind: 'twin9-run', run: { id: 12, journal: 'PLANT-01' }, referentiel, carto_evolutive: carto, journees })
    const faisceaux = Object.values(carto.competences).filter((c) => c.statut_temporel === STATUT_FAISCEAU).map((c) => c.code)
    expect(faisceaux).toContain('2.07')
    expect(Object.keys(r.readings[0].codes)).toEqual(faisceaux)
    const dates = [...new Set(carto.competences['2.07'].faisceau.traces.map((t) => t.date))].sort()
    expect(r.readings[0].codes['2.07']).toMatchObject({ status: 'established', rawStatus: STATUT_FAISCEAU, dates })
    for (const v of r.variants) expect(v.summary.verdicts.map((x) => x.code), v.date).not.toContain('2.07')
    // son pôle a des compétences dans les journées : on le choisit, et son panneau nomme 2.07 (DetailPanel)
    const duPole = new Set(referentiel.competences.filter((c) => c.pole === 2).map((c) => c.code))
    expect(r.variants.some((v) => v.summary.verdicts.some((x) => duPole.has(x.code) && x.status === 'established'))).toBe(true)
  })
})
