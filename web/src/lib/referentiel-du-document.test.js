import { describe, it, expect, vi } from 'vitest'
import { chargerReferentielDuDocument, referenceDuDocument } from './referentiel-du-document.js'

const respire = { id: 'respire', version: '7.0.0', poles: [], competences: [] }
const lettre = { id: 'fictif-lettre', version: '1.0.0', poles: [], competences: [] }

describe('referenceDuDocument', () => {
  it('ce que le contexte connaît, sinon le référentiel que nomme le document, RESPIRE sinon', () => {
    expect(referenceDuDocument({ referentiel: 'fictif-lettre' }, { id: 'respire', version: '7.1.0' })).toEqual({ id: 'respire', version: '7.1.0' })
    expect(referenceDuDocument({ referentiel: 'fictif-lettre' })).toEqual({ id: 'fictif-lettre', version: null })
    expect(referenceDuDocument({ kind: 'cartographie-jour' })).toEqual({ id: 'respire', version: null })
    expect(referenceDuDocument(null, { id: '', version: '1.0.0' })).toEqual({ id: 'respire', version: null })
  })
})

describe('chargerReferentielDuDocument', () => {
  it('RESPIRE sans version : le chargeur sans argument (dernière publiée, copie embarquée en repli)', async () => {
    const getReferentiel = vi.fn(async () => ({ doc: respire }))
    expect(await chargerReferentielDuDocument({ kind: 'cartographie-jour' }, { getReferentiel })).toBe(respire)
    expect(getReferentiel).toHaveBeenCalledWith()
  })

  it('la version connue ; introuvable, la dernière publiée du même référentiel', async () => {
    const getReferentiel = vi.fn(async (options) => {
      if (options?.version === '1.0.0') return { doc: lettre }
      if (options?.version) throw new Error('absente')
      return { doc: { ...lettre, version: '2.0.0' } }
    })
    expect(await chargerReferentielDuDocument({}, { connu: { id: 'fictif-lettre', version: '1.0.0' }, getReferentiel })).toBe(lettre)
    expect((await chargerReferentielDuDocument({}, { connu: { id: 'fictif-lettre', version: '9.9.9' }, getReferentiel })).version).toBe('2.0.0')
    expect(getReferentiel).toHaveBeenLastCalledWith({ id: 'fictif-lettre' })
  })

  it('sans version connue : la plus récente version publiée à laquelle le document est conforme, à défaut la dernière', async () => {
    const pole = (num) => ({ num, nom: `P${num}` })
    const v7 = { id: 'respire', version: '7.0.0', poles: [1, 2, 3].map(pole), competences: [1, 2, 3].map((p) => ({ code: `${p}.01`, pole: p })) }
    const v8 = { id: 'respire', version: '8.0.0', poles: [1, 2].map(pole), competences: [1, 2].map((p) => ({ code: `${p}.01`, pole: p })) }
    const versions = { '7.0.0': v7, '8.0.0': v8 }
    const getReferentiel = vi.fn(async (options) => ({ doc: options?.version ? versions[options.version] : v8 }))
    const listReferentiels = vi.fn(async () => [{ id: 'respire', label: 'RESPIRE', versions: [{ semver: '8.0.0' }, { semver: '7.0.0' }] }])
    const jour = (nums) => ({ kind: 'cartographie-jour', poles: nums.map((n) => ({ poleNum: String(n), competences: [{ code: `${n}.01` }] })), kairos: null })
    // Une journée à trois pôles se lit avec la v7, non avec la v8 qui a paru depuis.
    expect(await chargerReferentielDuDocument(jour([1, 2, 3]), { getReferentiel, listReferentiels })).toBe(v7)
    // Une journée de la v8 se lit avec elle.
    expect(await chargerReferentielDuDocument(jour([1, 2]), { getReferentiel, listReferentiels })).toBe(v8)
    // Conforme à aucune version : la dernière publiée ; sans index, la dernière aussi.
    expect(await chargerReferentielDuDocument(jour([1]), { getReferentiel, listReferentiels })).toBe(v8)
    expect(await chargerReferentielDuDocument(jour([1, 2, 3]), { getReferentiel, listReferentiels: async () => [] })).toBe(v8)
  })

  it('un autre référentiel introuvable rejette : jamais lu avec RESPIRE', async () => {
    const getReferentiel = vi.fn(async (options) => {
      if (options?.id) throw new Error('Le référentiel « fictif-lettre » n’a pas pu être chargé')
      return { doc: respire }
    })
    await expect(chargerReferentielDuDocument({ referentiel: 'fictif-lettre' }, { getReferentiel })).rejects.toThrow(/fictif-lettre/)
  })
})
