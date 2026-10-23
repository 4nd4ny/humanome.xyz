// S3-3 — les traces de la stigmergie de Twin9 dans l'interface : ce que le jeu
// en garde, quelles traces sont l'état gardé d'une journée, et qui en voit
// l'intensité (mode expert, cartographe ; jamais par défaut).
import { describe, expect, it } from 'vitest'
import { INCERTITUDES, TAU_MAX, formatIntensite, hasConservedTraces, intensitesVisibles, resumeStigmergie, stigmergieGardee, tracesConserveesDuJour } from './stigmergie.js'

const trace = { id: 't-1', code: '1.01', start: 0, end: 10, extrait: 'Un passage.', tau: 1.7, incertitude: 'faible' }

describe('stigmergieGardee', () => {
  it('le rang, le run, la conservation dite (vrai, faux, sinon nul), et les seules traces lisibles', () => {
    const bloc = { analyse: 2, run: 'r2', traces: [trace, { ...trace, tau: Infinity }, { ...trace, incertitude: 'nulle' }], depots: [{}] }
    expect(stigmergieGardee(bloc, true)).toEqual({
      analyse: 2,
      run: 'r2',
      conservee: true,
      traces: [{ ...trace, statut: null, voie: null, role: null, source: null, analyses: null }],
    })
    expect(stigmergieGardee(bloc, false).conservee).toBe(false)
    for (const signal of [null, undefined, 'true', 1]) expect(stigmergieGardee(bloc, signal).conservee).toBeNull()
    expect(stigmergieGardee({ analyse: '2', run: 3, traces: 'x' }, true)).toEqual({ analyse: null, run: null, conservee: true, traces: [] })
    for (const absent of [null, undefined, [], 'bloc']) expect(stigmergieGardee(absent, true)).toBeNull()
    expect(resumeStigmergie(stigmergieGardee(bloc, false))).toEqual({ analyse: 2, traces: 1, conservee: false })
  })

  it('quatre natures, de la plus sûre à l’écartée, chacune avec ce qu’en fait le greffier suivant ; une intensité de 0 à 3', () => {
    expect(Object.keys(INCERTITUDES)).toEqual(['faible', 'moyenne', 'forte', 'écartée'])
    expect(INCERTITUDES['écartée'].slug).toBe('ecartee')
    for (const n of Object.values(INCERTITUDES)) expect(`${n.label} ${n.consigne}`).not.toMatch(/score|note/i)
    expect(TAU_MAX).toBe(3)
    expect(formatIntensite(1.147)).toBe('1,15')
    expect(formatIntensite(3)).toBe('3,00')
  })
})

describe('tracesConserveesDuJour', () => {
  const bloc = (conservee, analyse, n = 1) => ({ analyse, conservee, traces: Array.from({ length: n }, () => trace) })
  const jour = (active, ...ids) => ({ date: '2026-01-05', activeVariantId: active, variants: ids.map((id) => ({ id })) })

  it('celles de l’analyse qui compte, si elles sont conservées ; sinon celles de l’analyse conservée de plus haut rang ; jamais des non conservées', () => {
    const detail = { variants: { a: { stigmergie: bloc(true, 2) }, b: { stigmergie: bloc(true, 4) }, c: { stigmergie: bloc(false, 5) }, d: { stigmergie: bloc(null, 6) } } }
    expect(tracesConserveesDuJour(jour('a', 'a', 'b', 'c'), detail).variantId).toBe('a')
    expect(tracesConserveesDuJour(jour('c', 'a', 'b', 'c', 'd'), detail).variantId).toBe('b')
    expect(tracesConserveesDuJour(jour('c', 'c', 'd'), detail)).toBeNull()
    expect(tracesConserveesDuJour(jour('a', 'a'), { variants: { a: { stigmergie: bloc(true, 1, 0) } } })).toBeNull()
    expect(tracesConserveesDuJour(undefined, detail)).toBeNull()
    expect(tracesConserveesDuJour(jour('a', 'a'), null)).toBeNull()
  })

  it('l’index dit, sans lire les détails, si le jeu a des traces conservées à surligner', () => {
    const ds = (stigmergie) => ({ days: [{ date: '2026-01-05', variants: [{ id: 'a', ...(stigmergie ? { stigmergie } : {}) }] }] })
    expect(hasConservedTraces(ds({ analyse: 1, traces: 2, conservee: true }))).toBe(true)
    expect(hasConservedTraces(ds({ analyse: 1, traces: 2, conservee: false }))).toBe(false)
    expect(hasConservedTraces(ds({ analyse: 1, traces: 0, conservee: true }))).toBe(false)
    expect(hasConservedTraces(ds(null))).toBe(false)
    expect(hasConservedTraces(null)).toBe(false)
  })
})

describe('intensitesVisibles (décision Q6 du sprint 3)', () => {
  it('en mode expert et pour le cartographe ; jamais en mode simple d’un autre rôle, sans session, ni dans une copie autonome', () => {
    expect(intensitesVisibles({ roles: ['apprenant'], expert: true })).toBe(true)
    expect(intensitesVisibles({ roles: ['cartographe'], expert: false })).toBe(true)
    expect(intensitesVisibles({ roles: ['apprenant'], expert: false })).toBe(false)
    expect(intensitesVisibles({ roles: [] })).toBe(false)
    expect(intensitesVisibles(null)).toBe(false)
    expect(intensitesVisibles(undefined)).toBe(false)
    expect(intensitesVisibles({ roles: ['cartographe'], expert: true }, { viewer: true })).toBe(false)
  })
})
