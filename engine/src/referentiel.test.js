import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nomCourtReferentiel, codesExemples } from './referentiel.js'

const racine = join(dirname(fileURLToPath(import.meta.url)), '../..')
const RESPIRE_V7 = JSON.parse(readFileSync(join(racine, 'schemas/fixtures/referentiel-respire-v7.json'), 'utf8'))

describe('nomCourtReferentiel', () => {
  it('RESPIRE se nomme RESPIRE, quel que soit son libellé', () => {
    expect(nomCourtReferentiel(RESPIRE_V7)).toBe('RESPIRE')
    expect(nomCourtReferentiel({ id: 'respire', label: 'RESPIRE v8 (six pôles)' })).toBe('RESPIRE')
  })

  it('un autre référentiel : son libellé sans sa version finale, à défaut son id', () => {
    expect(nomCourtReferentiel({ id: 'humanome', label: 'Humanome V18' })).toBe('Humanome')
    expect(nomCourtReferentiel({ id: 'fictif', label: 'Fictif v2.0.0-rc.1' })).toBe('Fictif')
    expect(nomCourtReferentiel({ id: 'fictif-neuf', label: 'Fictif à neuf pôles' })).toBe('Fictif à neuf pôles')
    expect(nomCourtReferentiel({ id: 'fictif-lettre', label: 'v2' })).toBe('fictif-lettre')
    expect(nomCourtReferentiel({ id: 'fictif-lettre' })).toBe('fictif-lettre')
  })
})

describe('codesExemples', () => {
  it('RESPIRE v7 : 1.01 et 4.02, les codes d’hier', () => {
    expect(codesExemples(RESPIRE_V7)).toEqual(['1.01', '4.02'])
  })

  it('le deuxième code du quatrième pôle, sinon le dernier code', () => {
    const lettre = {
      poles: [1, 2, 3, 4, 5].map((num) => ({ num })),
      competences: ['A', 'B', 'C', 'D', 'E'].flatMap((l, i) => [1, 2].map((n) => ({ code: `${l}${n}`, pole: i + 1 }))),
    }
    expect(codesExemples(lettre)).toEqual(['A1', 'D2'])
    const trois = { poles: [{ num: 3 }, { num: 1 }], competences: [{ code: 'Z9', pole: 3 }, { code: 'X1', pole: 1 }] }
    expect(codesExemples(trois)).toEqual(['X1', 'Z9'])
  })
})
