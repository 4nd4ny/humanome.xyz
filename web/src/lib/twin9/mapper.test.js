// Adaptateur Twin9 → cartographie-merge (D12). Fixtures : la VRAIE sortie du
// moteur sur un portfolio (carto_evolutive du scénario cloud de l'oracle de
// Twin_v9, tirée de la v9.8) + un référentiel minimal aux 7 pôles de RESPIRE v7,
// des référentiels d'autres structures (T17, 2026-10-20), et des cas
// construits pour les règles fines (renvoi daté, signal non daté ignoré,
// priorité attestation > renvoi, absence d'attestation datée → erreur).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { twin9ToMergeDocument } from './mapper.js'
import { validateDocument } from '@engine/validation.js'
import { validateDocumentPourReferentiel } from '@engine/conformite.js'
import { POLE_PALETTE } from '@engine/pipeline/merge-document.js'

// L'oracle vit dans le dépôt privé 4nd4ny/Twin_v9 : `TWIN_V9_DIR`, par défaut
// cloné à côté de celui-ci (../Twin_v9), comme pour la suite PHP ; sans lui
// (clone neuf, CI), les cas réels se sautent.
const TWIN_V9_DIR = process.env.TWIN_V9_DIR || join(dirname(fileURLToPath(import.meta.url)), '../../../../../Twin_v9')
const ORACLE_PATH = join(TWIN_V9_DIR, 'oracle/scenarios/02-cloud/outputs/carto_evolutive.json')
const oraclePresent = existsSync(ORACLE_PATH)
const CARTO = oraclePresent ? JSON.parse(readFileSync(ORACLE_PATH, 'utf8')) : null

// Un référentiel minimal aux 7 pôles de RESPIRE.
const REFERENTIEL = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [
    { code: '1.01', nom: 'Analyse critique', pole: 1 },
    { code: '1.03', nom: 'Synthèse écrite', pole: 1 },
    { code: '1.05', nom: 'Vérification des sources', pole: 1 },
    { code: '4.03', nom: 'Position éthique', pole: 4 },
    { code: '4.07', nom: 'Discernement', pole: 4 },
  ],
}

describe.skipIf(!oraclePresent)('twin9ToMergeDocument (sortie réelle du moteur)', () => {
  // Le corps d'un describe sauté est tout de même évalué à la collecte.
  // Le référentiel du run : les compétences que porte sa carte, aux 7 pôles de RESPIRE.
  const referentiel = oraclePresent
    ? {
        poles: REFERENTIEL.poles,
        competences: Object.values(CARTO.competences).map((c) => ({ code: c.code, nom: c.nom, pole: Number(c.pole) })),
      }
    : null
  const doc = oraclePresent ? twin9ToMergeDocument(CARTO, referentiel, { generatedAt: '2026-04-01T12:00:00' }) : null

  it('est strictement conforme au schéma', () => {
    const res = validateDocument('cartographie-merge', doc)
    expect(res.errors ?? []).toEqual([])
    expect(res.valid).toBe(true)
  })

  it('projette les attestations datées en feuilles chronologiques', () => {
    // Les dates viennent des attestations de la carte (aucune inventée).
    const datesAttendues = new Set()
    for (const c of Object.values(CARTO.competences)) {
      for (const a of c.attestations ?? []) if (a.date) datesAttendues.add(a.date)
    }
    expect(doc.feuilles.map((f) => f.date)).toEqual([...datesAttendues].sort())
    expect(doc.periode.nbFeuilles).toBe(datesAttendues.size)
  })

  it('reporte les scores d’attestation tels quels sur la feuille', () => {
    // 1.01 : sa première attestation.
    const att = CARTO.competences['1.01'].attestations[0]
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    const c101 = tete.competences.find((c) => c.code === '1.01')
    const feuille = c101.parFeuille.find((e) => e.date === att.date)
    expect(feuille.preuves).toBe(att.score_preuves)
    expect(feuille.indices).toBe(att.score_indices)
    expect(feuille.confiance).toBe(att.confiance)
  })

  it('injecte les narratifs de carto_evolutive (histoires, rapports de pôle, kairos)', () => {
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    const c101 = tete.competences.find((c) => c.code === '1.01')
    // L'histoire d'apprentissage de la carte se retrouve dans le feedback HTML
    // (fragments sans apostrophe : le HTML échappe ' en &#x27;).
    expect(c101.feedback).toContain('de façon isolée')
    expect(tete.rapport_html).toContain('Évolution du pôle 1')
    expect(doc.narratifs.kairosHtml.length).toBeGreaterThan(0)
  })

  it('la provenance dit Twin9 et reprend le journal_id', () => {
    expect(doc.source.protocole).toContain('Twin9')
    expect(doc.source.journalId).toBe(CARTO.journal_id)
  })
})

describe('twin9ToMergeDocument (règles fines)', () => {
  const base = () => ({
    journal_id: 'test',
    histoires: {},
    rapports_poles: {},
    competences: {
      1.01: undefined, // remplacé ci-dessous (clé numérique piège évitée)
    },
  })

  it('un signal de renvoi daté produit un renvoi sur la feuille', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.9, score_preuves: 2, score_indices: 1 },
        ],
        signaux: [],
      },
      '1.03': {
        attestations: [],
        // renvoi le même jour (jour_index 0 → 2026-01-05 via l'attestation de 1.01)
        signaux: [{ jour_index: 0, type: 'renvoi' }],
      },
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    // 1.03 n'est jamais établie → non rendue dans domains (contrat merge),
    // mais le renvoi compte dans parFeuille du pôle.
    expect(tete.parFeuille[0].renvois).toBe(1)
    expect(tete.competences.map((c) => c.code)).toEqual(['1.01'])
  })

  it('une attestation prime sur un renvoi du même jour', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.8, score_preuves: 1, score_indices: 0 },
        ],
        signaux: [{ jour_index: 0, type: 'renvoi' }],
      },
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    expect(tete.parFeuille[0].etablies).toBe(1)
    expect(tete.parFeuille[0].renvois).toBe(0)
  })

  it('un signal dont le jour n’est pas datable est ignoré (jamais de date inventée)', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.8, score_preuves: 1, score_indices: 0 },
        ],
        signaux: [],
      },
      '1.03': { attestations: [], signaux: [{ jour_index: 7, type: 'renvoi' }] }, // jour 7 inconnu
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    expect(doc.feuilles).toHaveLength(1)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    expect(tete.parFeuille[0].renvois).toBe(0)
  })

  it('échoue en français sans attestation datée', () => {
    const carto = base()
    carto.competences = {
      '1.01': { attestations: [], signaux: [{ jour_index: 0, type: 'renvoi' }] },
    }
    expect(() => twin9ToMergeDocument(carto, REFERENTIEL)).toThrow(/aucune attestation datée/)
  })

  it('échoue en français sans référentiel utilisable', () => {
    expect(() => twin9ToMergeDocument({ competences: {} }, null)).toThrow(/referentiel/)
  })
})

describe('twin9ToMergeDocument (tout référentiel, T17)', () => {
  /** Une fusion qui atteste, deux jours, la première compétence de chaque pôle. */
  function fusion(referentiel) {
    const attestations = ['2026-01-05', '2026-01-06'].map((date, i) => ({ jour_index: i, date, confiance: 0.8, score_preuves: 1, score_indices: 0 }))
    const competences = {}
    for (const p of referentiel.poles) {
      const c = referentiel.competences.find((x) => x.pole === p.num)
      competences[c.code] = { attestations, signaux: [] }
    }
    return { journal_id: 'test', histoires: {}, rapports_poles: { 1: 'Rapport du premier pôle.' }, competences }
  }

  it('cinq pôles lettrés : un domaine par pôle, à son nom et à la couleur de son rang ; le schéma l’accepte, et la conformité à son référentiel', () => {
    const lettres = ['A', 'B', 'C', 'D', 'E']
    const referentiel = {
      id: 'fictif-lettre',
      poles: lettres.map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}` })),
      competences: lettres.flatMap((l, i) => [1, 2].map((k) => ({ code: `${l}${k}`, nom: `Capacité fictive ${l}${k}`, pole: i + 1 }))),
    }
    const doc = twin9ToMergeDocument(fusion(referentiel), referentiel, { generatedAt: '2026-01-07T12:00:00' })
    expect(doc.domains.map((d) => [d.id, d.color, d.competences.map((c) => c.code)])).toEqual(
      lettres.map((l, i) => [`${l} · Pôle fictif ${l}`, POLE_PALETTE[i], [`${l}1`]]),
    )
    expect(Object.keys(doc.profilIpsatif)).toEqual(['1', '2', '3', '4', '5'])
    expect(doc.domains[0].rapport_html).toContain('Rapport du premier pôle.')
    // il nomme son référentiel, sans quoi il se lirait comme un document de RESPIRE
    expect(doc.referentiel).toBe('fictif-lettre')
    expect(validateDocument('cartographie-merge', doc).errors).toEqual([])
    expect(validateDocumentPourReferentiel('cartographie-merge', doc, referentiel).errors).toEqual([])
    // Sans son nom, le schéma l'accepte (il n'impose plus de structure, 2026-10-20) ;
    // c'est la conformité à son référentiel qui le refuse : il se dirait de RESPIRE.
    const { referentiel: _nom, ...sansNom } = doc
    expect(validateDocument('cartographie-merge', sansNom).valid).toBe(true)
    expect(validateDocumentPourReferentiel('cartographie-merge', sansNom, referentiel).errors.map((e) => e.path)).toEqual(['/referentiel'])
  })

  it('neuf pôles : neuf domaines, les deux derniers aux couleurs qui prolongent celles de RESPIRE ; le schéma l’accepte', () => {
    const referentiel = {
      id: 'fictif-neuf',
      poles: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, nom: `Pôle fictif ${i + 1}` })),
      competences: Array.from({ length: 9 }, (_, i) => ({ code: `${i + 1}.01`, nom: `Compétence fictive ${i + 1}.01`, pole: i + 1 })),
    }
    const doc = twin9ToMergeDocument(fusion(referentiel), referentiel, { generatedAt: '2026-01-07T12:00:00' })
    expect(doc.domains.map((d) => d.color)).toEqual(POLE_PALETTE.slice(0, 9))
    expect(doc.domains[8].competences.map((c) => c.code)).toEqual(['9.01'])
    expect(Object.keys(doc.profilIpsatif)).toHaveLength(9)
    expect(doc.referentiel).toBe('fictif-neuf')
    expect(validateDocument('cartographie-merge', doc).errors).toEqual([])
  })

  it('RESPIRE ne nomme pas son référentiel : sa fusion reste celle d’avant T17', () => {
    const respire = {
      id: 'respire',
      poles: REFERENTIEL.poles,
      competences: REFERENTIEL.poles.map((p) => ({ code: `${p.num}.01`, nom: `Compétence ${p.num}.01`, pole: p.num })),
    }
    const doc = twin9ToMergeDocument(fusion(respire), respire, { generatedAt: '2026-01-07T12:00:00' })
    expect('referentiel' in doc).toBe(false)
    expect(doc.domains.map((d) => d.color)).toEqual(POLE_PALETTE.slice(0, 7))
    expect(validateDocument('cartographie-merge', doc).errors).toEqual([])
  })

  it('une version de RESPIRE à six pôles : six domaines, aucun nom de référentiel, conforme à sa version (2026-10-20)', () => {
    const six = {
      id: 'respire',
      poles: REFERENTIEL.poles.filter((p) => p.num !== 7),
      competences: REFERENTIEL.poles.filter((p) => p.num !== 7).map((p) => ({ code: `${p.num}.01`, nom: `Compétence ${p.num}.01`, pole: p.num })),
    }
    const doc = twin9ToMergeDocument(fusion(six), six, { generatedAt: '2026-01-07T12:00:00' })
    expect('referentiel' in doc).toBe(false)
    expect(doc.domains).toHaveLength(6)
    expect(Object.keys(doc.profilIpsatif)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(validateDocumentPourReferentiel('cartographie-merge', doc, six).errors).toEqual([])
  })
})

describe('twin9Dossier (T9)', async () => {
  const { twin9Dossier } = await import('./mapper.js')

  it('rend le dossier d’un verdict jugé : traces, jury, délibération complète', () => {
    const d = twin9Dossier({
      code: '1.05',
      nom: 'Pensée systémique',
      statut: 'renvoi au cartographe',
      score_preuves: '2',
      score_indices: 1,
      confiance: 0.5,
      etage: 'tribunal',
      motif_regle: 'détection et contestation subsistent',
      traces_probantes: [{ piece: 1, extrait: 'Un extrait.', date: '2026-03-02', type: 'journal', role: 'preuve' }],
      prescription: { pour_apprenant: 'Documente.', pour_cartographe: 'À explorer.' },
      jury: { mode: 'socle4+1', composition: ['Linguiste'], positions_r1: { Linguiste: 'détection' }, positions_finales: { Linguiste: 'détection' }, consensus: false, dissidences: ['x'], second_tour: true, pieges_nommes: [] },
      deliberation: {
        greffier_md: 'Pièces.',
        arene: { accusation_md: 'Accuse.', defense_md: 'Défend.', replique_md: '', briefing_md: 'Brief.' },
        jures: { Linguiste: { r1_md: 'Tour 1.', r2_md: 'Tour 2.', position_r1: 'détection', position_finale: 'détection', piege: null } },
        relance_md: 'Relance.',
        gardiens: { support_md: 'Support.', raisonnement_md: null },
        president_md: 'Président.',
      },
    })
    expect(d).toMatchObject({
      code: '1.05',
      statut: 'renvoi au cartographe',
      preuves: 2,
      indices: 1,
      motif: 'détection et contestation subsistent',
      prescription: 'Documente.',
      prescriptionCartographe: 'À explorer.',
      greffier: 'Pièces.',
      accusation: 'Accuse.',
      replique: null,
      briefing: 'Brief.',
      relance: 'Relance.',
      gardienSupport: 'Support.',
      gardienRaisonnement: null,
      president: 'Président.',
    })
    expect(d.traces).toEqual([{ piece: 1, extrait: 'Un extrait.', date: '2026-03-02', type: 'journal', role: 'preuve' }])
    expect(d.jury).toMatchObject({ mode: 'socle4+1', consensus: false, secondTour: true, positionsFinales: { Linguiste: 'détection' } })
    expect(d.jures).toEqual([{ nom: 'Linguiste', tour1: 'Tour 1.', tour2: 'Tour 2.', positionTour1: 'détection', positionFinale: 'détection', piege: null }])
  })

  it('n’invente rien d’un verdict léger : sans jury, sans délibération', () => {
    const d = twin9Dossier({ code: '1.01', statut: 'présence établie', confiance: 0.76, score_preuves: 1, leger: { resolution: 'Deux lectures concordent.' } })
    expect([d.jury, d.president, d.jures, d.traces, d.motif]).toEqual([null, null, [], [], 'Deux lectures concordent.'])
  })
})
