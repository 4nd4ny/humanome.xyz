import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fichesDuReferentiel, fichesPourTwin6 } from './fiches.js'

const racine = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (chemin) => JSON.parse(readFileSync(join(racine, chemin), 'utf8'))
const RESPIRE_V7 = lire('schemas/fixtures/referentiel-respire-v7.json')

/** Les P1..P7.md du paquet Twin6, comme les écrit scripts/generate-fiches.mjs (règle b). */
function fichesDuCorpus() {
  const corpus = lire('scripts/data/fiches-v7.json')
  const fiches = {}
  for (const num of Object.keys(corpus.poleHeaders)) {
    const codes = Object.keys(corpus.fiches).filter((c) => c.startsWith(`${num}.`)).sort()
    fiches[num] = `${corpus.poleHeaders[num]}${codes.map((c) => corpus.fiches[c]).join('\n\n')}\n`
  }
  return fiches
}

describe('fichesPourTwin6', () => {
  it('RESPIRE v7 lit les fiches de son paquet, à l’identique', () => {
    const paquet = fichesDuCorpus()
    expect(fichesPourTwin6(RESPIRE_V7, paquet)).toEqual(paquet)
  })

  it('une version de RESPIRE en 6 pôles garde les fiches du paquet de ses 6 pôles', () => {
    const six = structuredClone(RESPIRE_V7)
    six.poles = six.poles.filter((p) => p.num !== 7)
    six.competences = six.competences.filter((c) => c.pole !== 7)
    const paquet = fichesDuCorpus()
    const fiches = fichesPourTwin6(six, paquet)
    expect(Object.keys(fiches)).toEqual(['1', '2', '3', '4', '5', '6'])
    for (const num of Object.keys(fiches)) expect(fiches[num]).toBe(paquet[num])
  })

  it('un pôle dont les compétences changent lit sa fiche écrite depuis le document', () => {
    const autre = structuredClone(RESPIRE_V7)
    const deplacee = autre.competences.find((c) => c.code === '1.10')
    deplacee.pole = 2
    const paquet = fichesDuCorpus()
    const fiches = fichesPourTwin6(autre, paquet)
    expect(fiches['3']).toBe(paquet['3'])
    expect(fiches['1']).not.toBe(paquet['1'])
    expect(fiches['2']).toContain('## 1.10 — ')
    expect(fiches['2'].startsWith('# Pôle 2 — ')).toBe(true)
  })

  it('un autre référentiel lit ses fiches écrites depuis son document, compétences dans l’ordre naturel', () => {
    const lettre = {
      id: 'fictif-lettre',
      poles: [{ num: 1, nom: 'A · Percevoir', description: 'Ce que le pôle cherche.' }, { num: 2, nom: 'B · Agir' }],
      competences: [
        { code: 'A10', nom: 'Dixième', pole: 1 },
        { code: 'A2', nom: 'Deuxième', pole: 1, description: 'Sa définition.', elements: [{ code: 'A2a', nom: 'Une facette', description: 'Plus fine.' }] },
        { code: 'B1', nom: 'Premier', pole: 2 },
      ],
    }
    expect(fichesPourTwin6(lettre, fichesDuCorpus())).toEqual(fichesDuReferentiel(lettre))
    expect(fichesDuReferentiel(lettre)).toEqual({
      1: '# Pôle 1 — A · Percevoir\n\nCe que le pôle cherche.\n\n## A2 — Deuxième\n\nSa définition.\n\n### A2a — Une facette\n\nPlus fine.\n\n---\n\n## A10 — Dixième\n',
      2: '# Pôle 2 — B · Agir\n\n## B1 — Premier\n',
    })
  })
})
