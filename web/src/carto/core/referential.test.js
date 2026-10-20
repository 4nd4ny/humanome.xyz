// Tout référentiel, pas seulement RESPIRE (T17) : un pôle lettré reçoit son
// numéro d'ordre ; un pôle sans couleur, celle de son rang ; couleurs et
// marques vont jusqu'à douze pôles, puis reprennent au début.
import { describe, expect, it } from 'vitest'
import { POLE_PALETTE } from '@engine/pipeline/merge-document.js'
import { normalizeReferential, referentialErrors, toEmbeddedReferential } from './referential.js'

const RESPIRE_COLORS = ['#2563eb', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316']

/** Un référentiel fictif de n pôles numérotés, deux compétences chacun, sans couleur. */
function numerote(n) {
  const poles = Array.from({ length: n }, (_, i) => ({ num: i + 1, nom: `Pôle fictif ${i + 1}`, couleur: null }))
  const competences = poles.flatMap((p) => [1, 2].map((k) => ({ code: `${p.num}.0${k}`, nom: `Compétence fictive ${p.num}.0${k}`, pole: p.num })))
  return { id: `fictif-${n}`, version: '1.0.0', label: `Fictif à ${n} pôles`, poles, competences }
}

/** Cinq pôles lettrés A à E, dont le numéro est la lettre ; leurs compétences les nomment par elle. */
function lettre() {
  const poles = ['A', 'B', 'C', 'D', 'E'].map((l) => ({ num: l, nom: `Pôle fictif ${l}`, couleur: null }))
  const competences = poles.flatMap((p) => [1, 2].map((k) => ({ code: `${p.num}${k}`, nom: `Capacité fictive ${p.num}${k}`, pole: p.num })))
  return { id: 'fictif-lettre', version: '1.0.0', label: 'Fictif lettré', poles, competences }
}

describe('le référentiel de la cartographie, quel qu’il soit (T17)', () => {
  it('donne à un pôle lettré son numéro d’ordre, et ses compétences le suivent par sa lettre', () => {
    expect(referentialErrors(lettre())).toEqual([])
    const emb = toEmbeddedReferential(lettre())
    expect(emb.poles.map((p) => [p.num, p.nom])).toEqual([
      [1, 'Pôle fictif A'],
      [2, 'Pôle fictif B'],
      [3, 'Pôle fictif C'],
      [4, 'Pôle fictif D'],
      [5, 'Pôle fictif E'],
    ])
    expect(emb.competences.slice(0, 3).map((c) => [c.code, c.pole])).toEqual([
      ['A1', 1],
      ['A2', 1],
      ['B1', 2],
    ])
    const ref = normalizeReferential(lettre())
    expect(ref.codesByPole.get(5)).toEqual(['E1', 'E2'])
    expect(ref.poleByNum.get(1).name).toBe('Pôle fictif A')
  })

  it('garde ses numéros à un référentiel numéroté, et ses couleurs à RESPIRE', () => {
    const respire = numerote(7)
    respire.poles.forEach((p, i) => (p.couleur = RESPIRE_COLORS[i]))
    respire.poles[2].num = '3' // un numéro écrit en chaîne reste le sien
    expect(normalizeReferential(respire).poles.map((p) => [p.num, p.color])).toEqual(RESPIRE_COLORS.map((c, i) => [i + 1, c]))
  })

  it('refuse un pôle sans numéro ni lettre, une lettre en double, une compétence d’un pôle inconnu', () => {
    const sansNumero = lettre()
    delete sansNumero.poles[0].num
    expect(referentialErrors(sansNumero)).toContain('pôle sans numéro entier ni lettre (undefined)')
    const double = lettre()
    double.poles[1].num = 'A'
    expect(referentialErrors(double)).toContain('pôle A dupliqué')
    const orpheline = lettre()
    orpheline.competences[0].pole = 'Z'
    expect(referentialErrors(orpheline)).toContain('compétence A1 : pôle Z inconnu')
  })

  it('colore un pôle sans couleur à son rang : les sept de RESPIRE, puis cinq autres, toutes distinctes', () => {
    const neuf = normalizeReferential(numerote(9))
    expect(neuf.poles.map((p) => p.color)).toEqual(POLE_PALETTE.slice(0, 9))
    expect(POLE_PALETTE.slice(0, 7)).toEqual(RESPIRE_COLORS)
    expect(new Set(POLE_PALETTE).size).toBe(12)
    // une couleur déclarée reste la sienne
    const declaree = numerote(9)
    declaree.poles[8].couleur = '#123456'
    expect(normalizeReferential(declaree).poles[8].color).toBe('#123456')
  })

  it('donne à chacun de douze pôles un symbole et un motif à lui ; au-delà, ils reprennent au début', () => {
    const treize = normalizeReferential(numerote(13)).poles
    const douze = treize.slice(0, 12)
    expect(new Set(douze.map((p) => p.symbol)).size).toBe(12)
    expect(new Set(douze.map((p) => p.pattern)).size).toBe(12)
    expect(new Set(douze.map((p) => p.color)).size).toBe(12)
    expect([treize[12].symbol, treize[12].pattern, treize[12].color]).toEqual([treize[0].symbol, treize[0].pattern, treize[0].color])
  })
})
