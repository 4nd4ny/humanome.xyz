// Les variables par lesquelles les gabarits Twin6 1.1.0 lisent le référentiel
// (2026-10-20) : leurs valeurs pour RESPIRE v7 et pour un référentiel d'une
// autre structure, et l'identité à l'octet avec 1.0.0 une fois rendues pour
// RESPIRE v7 — sur les gabarits versionnés (scripts/data/twin6).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatCodeTwin6, rendreGabaritTwin6, variablesTwin6 } from './variables.js'
import { gabaritsTwin6 } from '../../../scripts/twin6-gabarits.mjs'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const respire = JSON.parse(readFileSync(`${REPO}schemas/fixtures/referentiel-respire-v7.json`, 'utf8'))

/** Cinq pôles lettrés de quatre compétences, A1 à E4 (comme la DoD de T15). */
const lettres = {
  id: 'humanome',
  label: 'Humanome V18',
  poles: [1, 2, 3, 4, 5].map((num) => ({ num, nom: `Pôle ${num}` })),
  // dans le désordre : les codes se rangent dans leur ordre naturel
  competences: [1, 2, 3, 4, 5].flatMap((num) => [4, 3, 2, 1].map((i) => ({ code: `${'ABCDE'[num - 1]}${i}`, pole: num }))),
}

describe('variablesTwin6', () => {
  it('RESPIRE v7 : le nom, 7 pôles, 61 compétences, X.YY et les codes d’exemple qu’écrivent les gabarits 1.0.0', () => {
    expect(variablesTwin6(respire)).toEqual({
      REFERENTIEL: 'RESPIRE',
      NB_POLES: '7',
      NB_COMPETENCES: '61',
      FORMAT_CODE: 'X.YY',
      PRECISION_FORMAT_CODE: ' (point séparateur, deux chiffres)',
      CODES_EXEMPLE: '1.02, 2.02, 2.05 et 3.03',
    })
  })

  it('cinq pôles lettrés : le libellé sans sa version, XY sans précision, ses quatre premiers codes faute d’un cinquième code au pôle 2', () => {
    expect(variablesTwin6(lettres)).toEqual({
      REFERENTIEL: 'Humanome',
      NB_POLES: '5',
      NB_COMPETENCES: '20',
      FORMAT_CODE: 'XY',
      PRECISION_FORMAT_CODE: '',
      CODES_EXEMPLE: 'A1, A2, A3 et A4',
    })
  })

  it('les codes d’exemple suivent l’ordre naturel (A2 avant A10) ; un référentiel de deux codes en donne deux', () => {
    const naturel = {
      id: 'naturel',
      poles: [{ num: 1 }, { num: 2 }, { num: 3 }],
      competences: ['A10', 'A2', 'A1', 'B1', 'B10', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3'].map((code) => ({ code, pole: 'ABC'.indexOf(code[0]) + 1 })),
    }
    expect(variablesTwin6(naturel).CODES_EXEMPLE).toBe('A2, B2, B10 et C3')
    const deux = { id: 'deux', poles: [{ num: 1 }], competences: [{ code: 'Z1', pole: 1 }, { code: 'Z2', pole: 1 }] }
    expect(variablesTwin6(deux).CODES_EXEMPLE).toBe('Z1 et Z2')
  })

  it('la forme des codes, comme Referentiel::formatCode du moteur Twin9', () => {
    expect(['1.01', 'A1', 'A10', '12.03', 'AB-3'].map(formatCodeTwin6)).toEqual(['X.YY', 'XY', 'XYY', 'XX.YY', 'XX-Y'])
    const dixPoles = { id: 'dix', poles: [{ num: 10 }], competences: [{ code: '10.01', pole: 10 }] }
    expect(variablesTwin6(dixPoles)).toMatchObject({ FORMAT_CODE: 'XX.YY', PRECISION_FORMAT_CODE: ' (point séparateur, deux chiffres)' })
  })
})

describe('rendreGabaritTwin6', () => {
  it('rend les variables nommées, laisse ${POLE} et les autres, et garde un « $ » d’une valeur tel quel', () => {
    const texte = 'Pôle ${POLE} de ${REFERENTIEL} (${NB_POLES}), ${INCONNUE}.'
    expect(rendreGabaritTwin6(texte, { REFERENTIEL: 'A$&B', NB_POLES: '5' })).toBe('Pôle ${POLE} de A$&B (5), ${INCONNUE}.')
  })

  it('rend en une passe : une valeur qui écrit une variable n’est pas relue', () => {
    expect(rendreGabaritTwin6('${REFERENTIEL} (${NB_POLES})', { REFERENTIEL: 'Mon ${NB_POLES}', NB_POLES: '5' })).toBe('Mon ${NB_POLES} (5)')
  })
})

describe('gabarits versionnés (scripts/data/twin6)', () => {
  const v100 = gabaritsTwin6(REPO, '1.0.0')
  const v110 = gabaritsTwin6(REPO, '1.1.0')

  it('rendus pour RESPIRE v7, les gabarits 1.1.0 redonnent ceux de 1.0.0 à l’octet ; le méga-prompt est le même', () => {
    const variables = variablesTwin6(respire)
    expect(v110.scanPole).not.toBe(v100.scanPole)
    expect(rendreGabaritTwin6(v110.scanPole, variables)).toBe(v100.scanPole)
    expect(v110.kairos).not.toBe(v100.kairos)
    expect(rendreGabaritTwin6(v110.kairos, variables)).toBe(v100.kairos)
    expect(v110.megaPrompt).toBe(v100.megaPrompt)
  })

  it('rendus pour cinq pôles lettrés, ils disent ce référentiel-là, sans rien de RESPIRE v7 ni variable restante (hors ${POLE})', () => {
    const variables = variablesTwin6(lettres)
    const scan = rendreGabaritTwin6(v110.scanPole, variables)
    const kairos = rendreGabaritTwin6(v110.kairos, variables)
    expect(scan).toContain("Le numéro d'un des 5 pôles du **référentiel Humanome** `${POLE}`")
    expect(scan).toContain('- **Codes** : format `XY` strict.')
    expect(scan).toContain('si le pid 7 apparaît dans A1, A2, A3 et A4,')
    expect(kairos).toContain('> 5 fichiers JSON `carto_P[1..5]` cartographiant')
    expect(kairos).toContain('(les 20 verdicts avec leurs scores bruts, les 5 rapports pôle)')
    expect(kairos).toContain('[<"XY">]')
    for (const texte of [scan, kairos]) {
      expect(texte).not.toMatch(/RESPIRE|X\.YY|\b61\b|\b7 pôles/)
      expect(texte.replaceAll('${POLE}', '')).not.toContain('${')
    }
  })
})
