// Le convertisseur du YAML Humanome (S5, lot B), sur une fixture FICTIVE à la
// forme Humanome : deux pôles, trois capacités, facettes par 3 et par 4, un
// bloc `structure` faux, une relance absente. Aucun vrai référentiel n'entre
// dans le dépôt ; le document attendu (schemas/fixtures/referentiel-humanome-
// fictif*.json) est celui qu'écrit le script, et le test PHP
// ReferentielAmorcageTest y vérifie la même empreinte côté serveur.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import {
  ErreurConversion,
  NIVEAUX,
  PAGE_SOURCE,
  VERSION_CONVERTISSEUR,
  convertirHumanome,
  corpsDuHash,
} from './referentiel-humanome.js'
import { validateDocument } from './validation.js'
import { nomCourtReferentiel, codesExemples } from './referentiel.js'
import { POLE_PALETTE } from './pipeline/merge-document.js'
import { fichesDuReferentiel } from './twin6/fiches.js'

const racine = join(dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE = 'schemas/fixtures/referentiel-humanome-fictif.yaml'
const URL_FICTIVE = 'https://example.invalid/referentiel-humanome-fictif.yaml'
const octets = readFileSync(join(racine, FIXTURE))
const sha256 = (contenu) => createHash('sha256').update(contenu).digest('hex')
const lireYaml = () => YAML.parse(octets.toString('utf8'))
const attendu = (nom) => readFileSync(join(racine, 'schemas/fixtures', nom), 'utf8')
const options = (plus = {}) => ({
  fichier: 'referentiel-humanome-fictif.yaml',
  sha256: sha256(octets),
  url: URL_FICTIVE,
  hacher: sha256,
  ...plus,
})
const convertir = (yaml = lireYaml(), plus = {}) => convertirHumanome(yaml, options(plus))

/** Les erreurs d'une conversion refusée, chemin et message. */
function refus(yaml, plus = {}) {
  try {
    convertir(yaml, plus)
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurConversion)
    return e.erreurs
  }
  throw new Error('conversion acceptée')
}

describe('convertirHumanome', () => {
  it('écrit au niveau capacité le document attendu, valide au schéma', () => {
    const { document } = convertir()
    expect(`${JSON.stringify(document, null, 2)}\n`).toBe(attendu('referentiel-humanome-fictif.json'))
    expect(validateDocument('referentiel', document)).toEqual({ valid: true, errors: [] })
    expect(NIVEAUX[0]).toBe('capacité')
  })

  it('identité, libellé, niveaux, pôles et codes', () => {
    const { document } = convertir()
    expect([document.schemaVersion, document.kind, document.id, document.version, document.label])
      .toEqual(['2.1.0', 'referentiel', 'fictif-humanome', '2.0.0-proposition.1', 'Fictif V2'])
    // le nom que les prompts emploient, comme Referentiel::nomCourt du moteur
    expect(nomCourtReferentiel(document)).toBe('Fictif')
    expect(codesExemples(document)).toEqual(['A1', 'B1'])
    expect(document.niveaux).toEqual([
      { nom: 'capacité', motif: '[A-B][1-2]' },
      { nom: 'facette', motif: '[A-B][1-2]\\.[1-9]' },
    ])
    expect(document.poles).toEqual([
      { num: 1, nom: 'A · Observer le fictif', couleur: POLE_PALETTE[0], description: 'Ce que cherche le pôle fictif A.' },
      { num: 2, nom: 'B · Agir dans le fictif', couleur: POLE_PALETTE[1], description: 'Ce que cherche le pôle fictif B.' },
    ])
    expect(document.competences.map((c) => [c.code, c.pole, (c.elements ?? []).map((e) => e.code)])).toEqual([
      ['A1', 1, ['A1.1', 'A1.2', 'A1.3']],
      ['A2', 1, ['A2.1', 'A2.2', 'A2.3', 'A2.4']],
      ['B1', 2, ['B1.1', 'B1.2', 'B1.3']],
    ])
  })

  it('compose les descriptions des seules rubriques du YAML, dans un ordre fixe', () => {
    const { document } = convertir()
    const [a1, , b1] = document.competences
    expect(a1.description).toBe([
      'Définition fictive de A1.',
      '**Finalité** : Finalité fictive de A1.',
      '**Savoirs pratiques** : Savoirs fictifs de A1.',
      '**Participation avec l’IA** : Participation fictive de A1.',
      '**Frontière** : Frontière fictive de A1.',
      '**Limites** :\n\n- Limite fictive A1 a.\n- Limite fictive A1 b.',
      '**Situation** : Situation fictive de A1.',
      '**Relance** : Relance fictive de A1 ?',
      '**Ancrage obligatoire** : Ancrage fictif.',
    ].join('\n\n'))
    // B1 n'a pas de relance : rien n'est inventé à sa place
    expect(b1.description).not.toContain('Relance')
    expect(b1.description).toContain('**Situation** : Situation fictive de B1.')
    expect(a1.elements[0]).toEqual({
      code: 'A1.1',
      nom: 'Facette fictive A1.1',
      description: 'Description fictive de A1.1.\n\n**Manifestations** :\n\n- Manifestation fictive A1.1 a.\n- Manifestation fictive A1.1 b.\n\n**Faux positif** : Faux positif fictif de A1.1.',
    })
    // ce que le schéma ne représente pas reste hors du document
    const tout = JSON.stringify(document)
    for (const absent of ['Charte fictive', 'Un contrat fictif', 'Parcours fictif', 'fictif-pole-A.png', 'fictif.a1', 'Révision fictive', 'Z9', 'fixture_de_test']) {
      expect(tout).not.toContain(absent)
    }
  })

  it('dit sa provenance : titre, version, date, URL, fichier, sha256, convertisseur, licence', () => {
    const { document } = convertir()
    expect(document.source).toBe(
      `« Référentiel Fictif V2 » 2.0.0-proposition.1 du 2026-01-15, ${URL_FICTIVE}. `
      + `Converti depuis referentiel-humanome-fictif.yaml (sha256 ${sha256(octets)}) `
      + `par scripts/convertir-humanome.mjs ${VERSION_CONVERTISSEUR}, niveau capacité. Licence : CC-BY-SA Éditeur fictif.`,
    )
    // sans URL : la page qui publie l'Humanome
    expect(convertirHumanome(lireYaml()).document.source).toContain(`, ${PAGE_SOURCE}.`)
  })

  it('compte dans le contenu et avertit d’un en-tête `structure` qui le contredit, et des rubriques absentes', () => {
    expect(convertir().avertissements).toEqual([
      'referentiel.structure.competences annonce 2 capacités, le contenu en compte 3',
      'referentiel.structure.facettes annonce 9 facettes, le contenu en compte 10',
      'referentiel.structure.competences_par_pole annonce [1,1] capacités par pôle, le contenu en compte [2,1]',
      'referentiel.structure.facettes_par_pole annonce [4,5] facettes par pôle, le contenu en compte [7,3]',
      'referentiel.structure.reperes_de_manifestation annonce 12 manifestations, le contenu en compte 11',
      'rubrique « relance » absente : B1',
    ])
    const juste = lireYaml()
    juste.referentiel.structure = { poles: 2, competences: 3, facettes: 10, competences_par_pole: [2, 1], facettes_par_pole: [7, 3], reperes_de_manifestation: 11 }
    juste.dimensions[1].competences[0].relance = 'Relance fictive de B1 ?'
    expect(convertir(juste).avertissements).toEqual([])
    const sansLicence = lireYaml()
    delete sansLicence.referentiel.licence_source_declaree
    delete sansLicence.dimensions[0].orientation
    expect(convertir(sansLicence).avertissements.slice(-3)).toEqual([
      'rubrique « orientation » absente : A',
      'rubrique « relance » absente : B1',
      'referentiel.licence_source_declaree absente : la licence n’est pas dite dans `source`',
    ])
  })

  it('l’empreinte est celle de l’extracteur : sha256 du JSON compact {poles, competences}', () => {
    const { document } = convertir()
    // la formule de scripts/extract-referentiel.mjs, réécrite ici
    const corps = {
      poles: document.poles.map((p) => ({ num: p.num, nom: p.nom, couleur: p.couleur })),
      competences: document.competences.map((c) => ({ code: c.code, nom: c.nom, pole: c.pole })),
    }
    expect(document.contentHash).toBe(sha256(JSON.stringify(corps)))
    expect(corpsDuHash(document)).toBe(JSON.stringify(corps))
    // sans fonction de hachage, pas d'empreinte : le serveur la recalcule
    expect(convertirHumanome(lireYaml()).document).not.toHaveProperty('contentHash')
  })

  it('au niveau facette : les facettes deviennent les compétences, sous le pôle de leur capacité', () => {
    const { document } = convertir(lireYaml(), { niveau: 'facette' })
    expect(`${JSON.stringify(document, null, 2)}\n`).toBe(attendu('referentiel-humanome-fictif-facette.json'))
    expect(validateDocument('referentiel', document).valid).toBe(true)
    expect(document.niveaux).toEqual([{ nom: 'facette', motif: '[A-B][1-2]\\.[1-9]' }])
    expect(document.competences).toHaveLength(10)
    expect(document.competences.filter((c) => c.pole === 2).map((c) => c.code)).toEqual(['B1.1', 'B1.2', 'B1.3'])
    expect(document.competences.every((c) => !('elements' in c))).toBe(true)
    expect(() => convertir(lireYaml(), { niveau: 'pôle' })).toThrow(TypeError)
    // une capacité sans facette disparaîtrait à ce niveau : refusée
    const sansFacette = lireYaml()
    sansFacette.dimensions[1].competences[0].facettes = []
    expect(refus(sansFacette, { niveau: 'facette' }).map((e) => e.chemin)).toEqual(['dimensions[1].competences[0].facettes'])
    expect(convertir(sansFacette).avertissements).toContain('rubrique « facettes » absente : B1')
  })

  it('refuse ce que le schéma ou le moteur ne liraient pas, chaque erreur à son chemin', () => {
    const cas = [
      [(y) => { y.dimensions[0].competences[1].repere = 'B2' }, 'dimensions[0].competences[1].repere'],
      [(y) => { y.dimensions[0].competences[0].facettes[1].repere = 'A2.2' }, 'dimensions[0].competences[0].facettes[1].repere'],
      [(y) => { y.dimensions[0].competences[0].facettes[1].repere = 'A1.10' }, 'dimensions[0].competences[0].facettes[1].repere'],
      [(y) => { y.dimensions[1].repere = 'C' }, 'dimensions[1].repere'],
      [(y) => { delete y.dimensions[1].competences[0].facettes[2].repere }, 'dimensions[1].competences[0].facettes[2].repere'],
      [(y) => { y.dimensions[1].competences[0].facettes[2].repere = 'B1.1' }, 'dimensions[1].competences[0].facettes[2].repere'],
      [(y) => { delete y.referentiel.version }, 'referentiel.version'],
      [(y) => { y.referentiel.version = '2.0' }, 'referentiel.version'],
      [(y) => { y.referentiel.id = 'respire' }, 'referentiel.id'],
      [(y) => { y.referentiel.id = 'Fictif Humanome' }, 'referentiel.id'],
      [(y) => { delete y.referentiel.titre }, 'referentiel.titre'],
      [(y) => { delete y.dimensions[0].competences[0].titre }, 'dimensions[0].competences[0].titre'],
      [(y) => { y.dimensions[0].competences[0].limites = { une: 'carte' } }, 'dimensions[0].competences[0].limites'],
      [(y) => { y.dimensions[1].competences = [] }, 'dimensions[1].competences'],
      [(y) => { y.dimensions = [] }, 'dimensions'],
    ]
    for (const [abimer, chemin] of cas) {
      const yaml = lireYaml()
      abimer(yaml)
      expect(refus(yaml).map((e) => e.chemin), chemin).toContain(chemin)
    }
    expect(refus({ referentiel: { id: 'respire', version: '1.0.0', titre: 'X V1' }, dimensions: [] })[0].message)
      .toMatch(/RESPIRE v7/)
    expect(() => convertirHumanome({})).toThrow(ErreurConversion)
    expect(() => convertir(lireYaml(), { sha256: 'abc' })).toThrow(TypeError)
  })

  it('les fiches de scan écrites depuis le document montrent les facettes sous leur capacité', () => {
    const { document } = convertir()
    const fiches = fichesDuReferentiel(document)
    expect(Object.keys(fiches)).toEqual(['1', '2'])
    expect(fiches['1'].startsWith('# Pôle 1 — A · Observer le fictif\n\nCe que cherche le pôle fictif A.\n\n## A1 — Première capacité fictive\n\nDéfinition fictive de A1.')).toBe(true)
    expect(fiches['1']).toContain('\n\n### A1.1 — Facette fictive A1.1\n\nDescription fictive de A1.1.')
    expect(fiches['1']).toContain('**Ancrage obligatoire** : Ancrage fictif.')
    // aucun titre que n'ait mis la structure : les rubriques sont en gras, jamais en `#`
    const titres = fiches['1'].split('\n').filter((l) => l.startsWith('#'))
    expect(titres).toEqual([
      '# Pôle 1 — A · Observer le fictif',
      '## A1 — Première capacité fictive', '### A1.1 — Facette fictive A1.1', '### A1.2 — Facette fictive A1.2', '### A1.3 — Facette fictive A1.3',
      '## A2 — Deuxième capacité fictive', '### A2.1 — Facette fictive A2.1', '### A2.2 — Facette fictive A2.2', '### A2.3 — Facette fictive A2.3', '### A2.4 — Facette fictive A2.4',
    ])
  })
})

describe('scripts/convertir-humanome.mjs', () => {
  const SCRIPT = join(racine, 'scripts/convertir-humanome.mjs')
  const lancer = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: racine, encoding: 'utf8' })

  it('écrit le document attendu, avec ses avertissements ; relancé, ne change rien ; refuse d’écraser une version venue d’un autre fichier', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'convertir-humanome-'))
    try {
      const sortie = join(dossier, 'fictif-humanome-v2.0.0-proposition.1.json')
      const premier = lancer([FIXTURE, '--out', dossier, '--url', URL_FICTIVE])
      expect(premier.status, premier.stderr).toBe(0)
      expect(readFileSync(sortie, 'utf8')).toBe(attendu('referentiel-humanome-fictif.json'))
      expect(premier.stderr).toContain('avertissement : referentiel.structure.facettes annonce 9 facettes, le contenu en compte 10')
      expect(premier.stdout).toContain('Fictif V2 (fictif-humanome 2.0.0-proposition.1) : 2 pôles, 3 compétences au niveau capacité, 10 éléments')

      const second = lancer([FIXTURE, '--out', dossier, '--url', URL_FICTIVE])
      expect(second.status).toBe(0)
      expect(second.stdout).toContain('déjà à jour')

      const facette = lancer([FIXTURE, '--out', dossier, '--url', URL_FICTIVE, '--niveau', 'facette'])
      expect(facette.status, facette.stderr).toBe(0)
      expect(readFileSync(join(dossier, 'fictif-humanome-v2.0.0-proposition.1-facette.json'), 'utf8'))
        .toBe(attendu('referentiel-humanome-fictif-facette.json'))

      // même version, converti d'un autre fichier : refusé, rien d'écrasé
      const autre = JSON.parse(readFileSync(sortie, 'utf8'))
      autre.source = autre.source.replace(/sha256 [0-9a-f]{64}/, `sha256 ${'0'.repeat(64)}`)
      writeFileSync(sortie, JSON.stringify(autre))
      const refuse = lancer([FIXTURE, '--out', dossier, '--url', URL_FICTIVE])
      expect(refuse.status).toBe(1)
      expect(refuse.stderr).toContain('Une version est immuable')
      expect(readFileSync(sortie, 'utf8')).toBe(JSON.stringify(autre))
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  })

  it('refuse un YAML illisible, un YAML refusé, un niveau inconnu, sans rien écrire', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'convertir-humanome-'))
    try {
      const illisible = join(dossier, 'illisible.yaml')
      writeFileSync(illisible, 'referentiel: [\n')
      expect(lancer([illisible, '--out', dossier]).stderr).toContain('YAML illisible')
      const respire = join(dossier, 'respire.yaml')
      writeFileSync(respire, octets.toString('utf8').replace('id: fictif-humanome', 'id: respire'))
      const r = lancer([respire, '--out', dossier])
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('referentiel.id')
      expect(lancer([FIXTURE, '--out', dossier, '--niveau', 'pôle']).status).toBe(1)
      expect(lancer([]).status).toBe(1)
      expect(readFileSync(illisible, 'utf8')).toBe('referentiel: [\n')
      expect(readdirSync(dossier).sort()).toEqual(['illisible.yaml', 'respire.yaml'])
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  })
})
