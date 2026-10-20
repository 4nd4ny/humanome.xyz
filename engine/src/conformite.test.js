import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateConformite, validateDocumentPourReferentiel } from './conformite.js'

// Fixtures publiques du dépôt (schemas/fixtures) : RESPIRE v7, trois journées
// et leur fusion. Les cas « RESPIRE en 6 pôles » dérivent d'elles.
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../schemas/fixtures')
const lire = (nom) => JSON.parse(readFileSync(join(fixtures, nom), 'utf8'))
const RESPIRE_V7 = lire('referentiel-respire-v7.json')
const JOUR = lire('cartographie-jour-2026-01-07.json') // avec son kairos
const FUSION = lire('cartographie-merge-3-jours.json')
const clone = (x) => structuredClone(x)

/** RESPIRE dans une version de 6 pôles : le 7e et ses compétences retirés. */
function respireSixPoles() {
  const ref = clone(RESPIRE_V7)
  ref.version = '8.0.0'
  ref.poles = ref.poles.filter((p) => p.num !== 7)
  ref.competences = ref.competences.filter((c) => c.pole !== 7)
  return ref
}

/** La journée sans son 7e pôle, son kairos ne reliant plus que des codes des 6 autres. */
function jourSixPoles() {
  const doc = clone(JOUR)
  doc.poles = doc.poles.filter((p) => p.poleNum !== '7')
  const garde = (codes) => codes.filter((c) => !String(c).startsWith('7.'))
  const e = doc.kairos?.emergencesCrossPoles
  if (e) {
    for (const x of e.connexionsTransversales ?? []) x.codesRelies = garde(x.codesRelies)
    for (const x of e.noeudsConceptuels ?? []) x.codesRelies = garde(x.codesRelies)
    for (const x of e.competencesOrphelines ?? []) x.enRelationAvecCodes = garde(x.enRelationAvecCodes)
  }
  return doc
}

const chemins = (r) => r.errors.map((e) => e.path)

describe('validateConformite — journée', () => {
  it('une journée de RESPIRE v7 est conforme à RESPIRE v7', () => {
    expect(validateDocumentPourReferentiel('cartographie-jour', JOUR, RESPIRE_V7)).toEqual({ valid: true, errors: [] })
  })

  it('le garde-fou demeure : à une journée de RESPIRE v7 qui a perdu un pôle, il manque ce pôle', () => {
    const doc = clone(JOUR)
    doc.poles = doc.poles.slice(0, 6)
    const r = validateDocumentPourReferentiel('cartographie-jour', doc, RESPIRE_V7)
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual([{ path: '/poles', keyword: 'referentiel', message: 'il manque le pôle 7 du référentiel' }])
  })

  it('une version de RESPIRE en 6 pôles : sa journée de 6 pôles est conforme, une journée de 7 ne l’est pas', () => {
    const six = respireSixPoles()
    expect(validateDocumentPourReferentiel('cartographie-jour', jourSixPoles(), six)).toEqual({ valid: true, errors: [] })
    const r = validateConformite('cartographie-jour', JOUR, six)
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toEqual({ path: '/poles/6/poleNum', keyword: 'referentiel', message: 'le pôle 7 n\'est pas un pôle du référentiel' })
  })

  it('un code inconnu, un code d’un autre pôle, un pôle en double sont nommés', () => {
    const doc = clone(JOUR)
    doc.poles[0].competences[0].code = '9.99'
    doc.poles[1].competences[0].code = '1.01'
    doc.poles.push(clone(doc.poles[2]))
    const r = validateConformite('cartographie-jour', doc, RESPIRE_V7)
    expect(r.errors.map((e) => [e.path, e.message])).toEqual([
      ['/poles/0/competences/0/code', 'le code 9.99 n\'est pas une compétence du référentiel'],
      ['/poles/1/competences/0/code', 'la compétence 1.01 est du pôle 1, pas du pôle 2'],
      ['/poles/7/poleNum', 'le pôle 3 figure deux fois'],
    ])
  })

  it('un kairos qui relie un code inconnu est nommé à son chemin', () => {
    const doc = clone(JOUR)
    doc.kairos.emergencesCrossPoles.connexionsTransversales[0].codesRelies.push('8.01')
    const i = doc.kairos.emergencesCrossPoles.connexionsTransversales[0].codesRelies.length - 1
    const r = validateConformite('cartographie-jour', doc, RESPIRE_V7)
    expect(chemins(r)).toEqual([`/kairos/emergencesCrossPoles/connexionsTransversales/0/codesRelies/${i}`])
  })

  it('un périmètre partiel : ses pôles seulement, ses compétences seulement, des pôles du référentiel', () => {
    const doc = clone(JOUR)
    const pole3 = doc.poles.find((p) => p.poleNum === '3')
    const codes3 = pole3.competences.map((c) => c.code)
    doc.poles = [pole3]
    doc.kairos = null
    doc.perimetre = { partiel: true, poles: [3], competences: RESPIRE_V7.competences.filter((c) => c.pole === 3).map((c) => c.code) }
    expect(validateConformite('cartographie-jour', doc, RESPIRE_V7)).toEqual({ valid: true, errors: [] })

    doc.perimetre = { partiel: true, poles: [3, 12], competences: codes3.slice(1) }
    const r = validateConformite('cartographie-jour', doc, RESPIRE_V7)
    expect(r.errors.map((e) => [e.path, e.message])).toEqual([
      ['/perimetre/poles/1', 'le pôle 12 du périmètre n\'est pas un pôle du référentiel'],
      ['/poles/0/competences/0/code', `la compétence ${codes3[0]} est hors du périmètre`],
    ])

    doc.perimetre = { partiel: true, poles: [4] }
    expect(validateConformite('cartographie-jour', doc, RESPIRE_V7).errors.map((e) => e.message)).toEqual([
      'le pôle 3 est hors du périmètre',
      'il manque le pôle 4 du référentiel',
    ])
  })

  it('le document nomme son référentiel : absent, c’est RESPIRE', () => {
    const autre = { id: 'fictif-lettre', poles: [{ num: 1 }], competences: [{ code: 'A1', pole: 1 }] }
    const doc = { schemaVersion: '1.0.0', kind: 'cartographie-jour', date: '2026-01-05', poles: [], kairos: null }
    expect(validateConformite('cartographie-jour', doc, autre).errors[0])
      .toEqual({ path: '/referentiel', keyword: 'referentiel', message: 'le document cartographie le référentiel « respire », pas « fictif-lettre »' })
    const nomme = { ...clone(JOUR), referentiel: 'fictif-lettre' }
    expect(validateConformite('cartographie-jour', nomme, RESPIRE_V7).errors[0].message)
      .toBe('le document cartographie le référentiel « fictif-lettre », pas « respire »')
  })

  it('le schéma d’abord : un document invalide au schéma ne passe pas à la conformité', () => {
    const r = validateDocumentPourReferentiel('cartographie-jour', { kind: 'cartographie-jour' }, RESPIRE_V7)
    expect(r.valid).toBe(false)
    expect(r.errors.every((e) => e.keyword !== 'referentiel')).toBe(true)
  })

  it('le marqueur de périmètre d’une journée partielle échappe au schéma, pas à la conformité', () => {
    const pole3 = clone(JOUR).poles.find((p) => p.poleNum === '3')
    const partiel = { ...clone(JOUR), poles: [pole3], kairos: null, perimetre: { partiel: true, poles: [3] } }
    expect(validateDocumentPourReferentiel('cartographie-jour', partiel, RESPIRE_V7)).toEqual({ valid: true, errors: [] })
    const { perimetre: _marqueur, ...sansMarqueur } = partiel
    expect(validateDocumentPourReferentiel('cartographie-jour', sansMarqueur, RESPIRE_V7).errors.map((e) => e.message))
      .toEqual(['il manque les pôles 1, 2, 4, 5, 6, 7 du référentiel'])
    const horsPerimetre = { ...partiel, perimetre: { partiel: true, poles: [2] } }
    expect(validateDocumentPourReferentiel('cartographie-jour', horsPerimetre, RESPIRE_V7).errors.map((e) => e.message))
      .toEqual(['le pôle 3 est hors du périmètre', 'il manque le pôle 2 du référentiel'])
  })

  it('exige un référentiel lisible et un type connu', () => {
    expect(() => validateConformite('cartographie-jour', JOUR, { poles: [] })).toThrow(/référentiel/)
    expect(() => validateConformite('referentiel', JOUR, RESPIRE_V7)).toThrow(/non pris en charge/)
  })
})

describe('validateConformite — fusion', () => {
  it('la fusion de RESPIRE v7 est conforme ; une fusion qui a perdu des pôles ne l’est pas', () => {
    expect(validateDocumentPourReferentiel('cartographie-merge', FUSION, RESPIRE_V7)).toEqual({ valid: true, errors: [] })
    const partielle = clone(FUSION)
    partielle.domains = partielle.domains.slice(0, 5)
    expect(validateConformite('cartographie-merge', partielle, RESPIRE_V7).errors.map((e) => [e.path, e.message]))
      .toEqual([['/domains', 'il manque les pôles 6, 7 du référentiel']])
  })

  it('un domaine qui mêle deux pôles, deux domaines d’un même pôle, un pôle de profil inconnu sont nommés', () => {
    const doc = clone(FUSION)
    doc.domains[0].competences.push({ ...clone(doc.domains[1].competences[0]) })
    doc.domains.push(clone(doc.domains[2]))
    doc.profilIpsatif['9'] = clone(doc.profilIpsatif['1'])
    const r = validateConformite('cartographie-merge', doc, RESPIRE_V7)
    const code = doc.domains[1].competences[0].code
    expect(r.errors.map((e) => [e.path, e.message])).toEqual([
      [`/domains/0/competences/${doc.domains[0].competences.length - 1}/code`, `la compétence ${code} est du pôle 2, pas du pôle 1 de ce domaine`],
      ['/domains/7', 'le pôle 3 figure dans deux domaines'],
      ['/domains', '8 domaines pour 7 pôles dans le référentiel'],
      ['/profilIpsatif/9', 'le pôle 9 n\'est pas un pôle du référentiel'],
    ])
  })

  it('les cas hors schéma se lisent comme en PHP : numéros non canoniques, codes numériques, listes qui n’en sont pas', () => {
    const ref = {
      id: 'fictif',
      poles: [{ num: 1 }, { num: 2 }],
      competences: [{ code: '101', pole: 1 }, { code: 'B1', pole: 2 }],
    }
    const jour = {
      referentiel: 'fictif',
      poles: [
        { poleNum: '1abc', competences: [{ code: '101' }] },
        { poleNum: 1.5, competences: [] },
        { poleNum: '1', competences: [{ code: 101 }, { code: null }] },
      ],
      kairos: { emergencesCrossPoles: { connexionsTransversales: { 0: { codesRelies: ['X9'] } } } },
    }
    expect(validateConformite('cartographie-jour', jour, ref).errors.map((e) => [e.path, e.message])).toEqual([
      ['/poles/0/poleNum', "le pôle 1abc n'est pas un pôle du référentiel"],
      ['/poles/1/poleNum', "le pôle 1.5 n'est pas un pôle du référentiel"],
      ['/poles/2/competences/1/code', "le code null n'est pas une compétence du référentiel"],
      ['/poles', 'il manque le pôle 2 du référentiel'],
    ])
    const partiel = { referentiel: 'fictif', poles: [], kairos: null, perimetre: { partiel: true, poles: ['1abc', 1.5, [2]], competences: ['B1'] } }
    expect(validateConformite('cartographie-jour', partiel, ref).errors.map((e) => [e.path, e.message])).toEqual([
      ['/perimetre/poles/0', "le pôle 1abc du périmètre n'est pas un pôle du référentiel"],
      ['/perimetre/poles/1', "le pôle 1.5 du périmètre n'est pas un pôle du référentiel"],
      ['/perimetre/poles/2', "le pôle [2] du périmètre n'est pas un pôle du référentiel"],
    ])
    const competencesSeules = { referentiel: 'fictif', poles: [{ poleNum: '2', competences: [{ code: 'B1' }] }], kairos: null, perimetre: { partiel: true, competences: ['B1'] } }
    expect(validateConformite('cartographie-jour', competencesSeules, ref).errors.map((e) => e.message))
      .toEqual(['il manque le pôle 1 du référentiel'])
    const fusion = {
      referentiel: 'fictif',
      domains: [{ competences: [{ code: '101' }] }, { competences: [{ code: 'B1' }] }],
      profilIpsatif: { '01': { competences: [] }, 2: { competences: [{ code: 'B1' }] } },
    }
    expect(validateConformite('cartographie-merge', fusion, ref).errors.map((e) => [e.path, e.message]))
      .toEqual([['/profilIpsatif/01', "le pôle 01 n'est pas un pôle du référentiel"]])
  })

  it('la fusion de RESPIRE v7 n’est pas conforme à une version de RESPIRE en 6 pôles', () => {
    const r = validateConformite('cartographie-merge', FUSION, respireSixPoles())
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.message === 'le pôle 7 n\'est pas un pôle du référentiel')).toBe(true)
  })
})
