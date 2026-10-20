// Merge côté client des documents jour d'un membre (décision M8) : la fusion
// des fixtures réelles produit un document cartographie-merge VALIDE au schéma
// et CONFORME au référentiel du run, avec les résumés locaux (pattern
// run-launcher) — sans aucun appel LLM. Tout référentiel (2026-10-20).
import { describe, expect, it } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { validateConformite } from '@engine/conformite.js'
import { buildMemberMerge, referentielDeLaFusion, uniqueDayDocuments, uniqueDayEntries } from './membre-merge.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

/** Cinq pôles lettrés, quatre capacités chacun (comme le fictif de T15). */
const LETTRES = ['A', 'B', 'C', 'D', 'E']
const LETTRE = {
  id: 'fictif-lettre',
  version: '1.0.0',
  label: 'Fictif lettré',
  poles: LETTRES.map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}` })),
  competences: LETTRES.flatMap((l, i) => [1, 2, 3, 4].map((n) => ({ code: `${l}${n}`, nom: `Capacité fictive ${l}${n}`, pole: i + 1 }))),
}

/** Une journée du référentiel lettré tirée de la fixture : pôle k de rang k, ses premiers codes, sans kairos. */
function journeeLettre(day) {
  return {
    ...day,
    referentiel: LETTRE.id,
    poles: day.poles.slice(0, 5).map((p, i) => ({
      ...p,
      competences: p.competences.map((c, j) => ({ ...c, code: `${LETTRES[i]}${j + 1}` })),
    })),
    kairos: null,
  }
}

describe('uniqueDayDocuments', () => {
  it('déduplique par date (dernier reçu) et trie chronologiquement', () => {
    const rejoue = { ...day05, note: 'extraction rejouée' }
    const docs = uniqueDayDocuments([
      { date: '2026-01-07', document: day07 },
      { date: '2026-01-05', document: day05 },
      { date: '2026-01-05', document: rejoue },
      { date: '2026-01-06', document: day06 },
      { date: null, document: day06 }, // entrée invalide ignorée
    ])
    expect(docs.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(docs[0].note).toBe('extraction rejouée')
  })

  it('uniqueDayEntries garde l’entrée entière (son run, son référentiel)', () => {
    const entries = uniqueDayEntries([
      { date: '2026-01-06', runId: 1, referentiel: { id: 'respire', version: '7.0.0' }, document: day06 },
      { date: '2026-01-06', runId: 2, referentiel: { id: 'respire', version: '7.1.0' }, document: day06 },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].runId).toBe(2)
  })
})

describe('referentielDeLaFusion', () => {
  it('la version figée par le run le plus récent ; à égalité, la dernière reçue ; sans run connu, la dernière', () => {
    const e = (runId, id, version) => ({ runId, referentiel: { id, version }, date: '2026-01-05', document: day05 })
    expect(referentielDeLaFusion([e(7, 'respire', '7.1.0'), e(3, 'respire', '7.0.0')])).toEqual({ id: 'respire', version: '7.1.0' })
    expect(referentielDeLaFusion([e(7, 'respire', '7.0.0'), e(7, 'fictif-lettre', '1.0.0')])).toEqual({ id: 'fictif-lettre', version: '1.0.0' })
    expect(referentielDeLaFusion([{ date: '2026-01-05', document: day05 }])).toEqual({ id: 'respire', version: null })
    expect(referentielDeLaFusion([])).toBeNull()
  })
})

describe('buildMemberMerge', () => {
  it('fusionne la fixture 3 jours en un document merge VALIDE au schéma et conforme à RESPIRE v7', () => {
    const { document, error } = buildMemberMerge([day05, day06, day07], referentiel, {
      journalId: 'membre-1',
      now: () => '2026-07-12T10:00:00.000Z',
    })
    expect(error).toBeNull()
    expect(document).not.toBeNull()

    const { valid, errors } = validateDocument('cartographie-merge', document)
    expect(errors ?? []).toEqual([])
    expect(valid).toBe(true)
    expect(validateConformite('cartographie-merge', document, referentiel).valid).toBe(true)
    expect(document).not.toHaveProperty('referentiel') // un document de RESPIRE ne nomme pas son référentiel

    // Période et provenance : merge déterministe calculé côté client.
    expect(document.periode.premiere).toBe('2026-01-05')
    expect(document.periode.derniere).toBe('2026-01-07')
    const json = JSON.stringify(document)
    expect(json).toContain('Résumé local') // narratifs locaux, pas de LLM
    expect(json).toContain('côté client')
  })

  it('un autre référentiel (cinq pôles lettrés) : la fusion le nomme et lui est conforme ; avec RESPIRE, ses journées ne fusionnent pas', () => {
    const jours = [day05, day06, day07].map(journeeLettre)
    const { document, error } = buildMemberMerge(jours, LETTRE, { now: () => '2026-07-12T10:00:00' })
    expect(error).toBeNull()
    expect(document.referentiel).toBe('fictif-lettre')
    expect(document.domains).toHaveLength(5)
    expect(validateConformite('cartographie-merge', document, LETTRE).valid).toBe(true)

    // Les journées lettrées lues avec RESPIRE : aucun de leurs codes n'est le sien.
    const melange = buildMemberMerge(jours, referentiel)
    expect(melange.document).toBeNull()
    expect(melange.error).toMatch(/^La cartographie fusionnée n’a pas pu être construite/)
  })

  it('fusion non constructible : erreur EXPLIQUÉE, jamais d’exception', () => {
    // Une seule journée creuse ne couvre pas les pôles du référentiel avec
    // compétence établie : buildMergeDocument échoue, l'erreur est restituée en français.
    const creux = {
      ...day05,
      poles: day05.poles.slice(0, 1),
    }
    const { document, error } = buildMemberMerge([creux], referentiel)
    expect(document).toBeNull()
    expect(error).toContain('dans chacun des pôles du référentiel')
    expect(error).not.toContain('7 pôles')
    expect(error).toContain('documents journaliers')
  })

  it('liste vide : message dédié', () => {
    const { document, error } = buildMemberMerge([], referentiel)
    expect(document).toBeNull()
    expect(error).toContain('Aucun document')
  })
})
