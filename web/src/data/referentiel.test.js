import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearReferentielCache, listPublishedReferentiels, loadPublishedReferentiel } from './referentiel.js'

afterEach(() => {
  clearReferentielCache()
})

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

const publishedDoc = {
  version: '8.0.0',
  label: 'RESPIRE v8',
  poles: [{ num: 1, nom: 'TETE', couleur: '#123456' }],
  competences: [{ code: '1.01', nom: 'Test', pole: 1 }],
}

// Forme canonique produite par api/src/Referentiel/StaticExporter.php :
// tableau {referentielId, semver, label, publishedAt, fichier}, plus récent d'abord.
const publishedIndex = [
  {
    referentielId: 'respire',
    semver: '8.0.0',
    label: 'RESPIRE v8',
    publishedAt: '2026-07-12T00:00:00',
    fichier: 'respire-v8.0.0.json',
  },
  {
    referentielId: 'respire',
    semver: '7.0.0',
    label: 'RESPIRE v7',
    publishedAt: '2026-07-01T00:00:00',
    fichier: 'respire-v7.0.0.json',
  },
]

describe('loadPublishedReferentiel', () => {
  it('charge index.json puis la dernière version publiée', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === 'data/referentiel/index.json') return jsonResponse(publishedIndex)
      if (url === 'data/referentiel/respire-v8.0.0.json') return jsonResponse(publishedDoc)
      throw new Error(`unexpected url ${url}`)
    })

    const { doc, origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('published')
    expect(doc.version).toBe('8.0.0')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('met le résultat en cache (un seul chargement par session)', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'data/referentiel/index.json' ? jsonResponse(publishedIndex) : jsonResponse(publishedDoc),
    )
    await loadPublishedReferentiel({ fetchFn })
    await loadPublishedReferentiel({ fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2) // index + version, une seule fois
  })

  it('retombe sur le référentiel embarqué si le fetch échoue (copie statique)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('network down'))
    const { doc, origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('bundled')
    expect(doc.version).toBe('7.0.0') // RESPIRE v7 embarqué par data/load.js
    expect(doc.competences).toHaveLength(61)
  })

  it('ne tente aucun fetch depuis file:// et sert la version embarquée', async () => {
    const fetchFn = vi.fn()
    const { origin } = await loadPublishedReferentiel({ fetchFn, protocol: 'file:' })
    expect(origin).toBe('bundled')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejette un nom de fichier hors répertoire (index corrompu) -> embarqué', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([{ referentielId: 'respire', fichier: '../../etc/passwd.json' }]),
    )
    const { origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('bundled')
    expect(fetchFn).toHaveBeenCalledTimes(1) // l'index seulement, jamais le fichier
  })
})

// Tout référentiel publié, pas seulement RESPIRE (2026-10-20) : un parcours
// charge celui qu'on lui donne, et les liste pour en offrir le choix.
describe('loadPublishedReferentiel({ id, version }) et listPublishedReferentiels', () => {
  const lettre = { id: 'fictif-lettre', version: '1.0.0', label: 'Fictif lettré', poles: [{ num: 1, nom: 'A', couleur: null }], competences: [{ code: 'A1', nom: 'Un', pole: 1 }] }
  const index = [
    ...publishedIndex,
    { referentielId: 'fictif-neuf', semver: '1.0.0', label: 'Fictif à neuf pôles', publishedAt: null, fichier: 'fictif-neuf-v1.0.0.json' },
    { referentielId: 'fictif-lettre', semver: '1.0.0', label: 'Fictif lettré', publishedAt: null, fichier: 'fictif-lettre-v1.0.0.json' },
    { referentielId: 'fictif-lettre', semver: '0.9.0', label: 'Fictif lettré (essai)', publishedAt: null, fichier: '../hors.json' },
  ]
  const servi = (docs) => vi.fn(async (url) => {
    if (url === 'data/referentiel/index.json') return jsonResponse(index)
    const nom = url.replace('data/referentiel/', '')
    if (docs[nom]) return jsonResponse(docs[nom])
    return jsonResponse({ error: 'absent' }, 404)
  })

  it('charge la version demandée d’un référentiel, sa dernière sans version', async () => {
    const fetchFn = servi({ 'fictif-lettre-v1.0.0.json': lettre, 'respire-v7.0.0.json': { ...publishedDoc, version: '7.0.0' } })
    expect((await loadPublishedReferentiel({ id: 'fictif-lettre', fetchFn })).doc).toEqual(lettre)
    expect((await loadPublishedReferentiel({ id: 'respire', version: '7.0.0', fetchFn })).doc.version).toBe('7.0.0')
    // en cache par référentiel et version
    await loadPublishedReferentiel({ id: 'fictif-lettre', fetchFn })
    expect(fetchFn.mock.calls.filter(([url]) => url.includes('fictif-lettre-v1.0.0'))).toHaveLength(1)
  })

  it('un référentiel ou une version inconnus rejettent, RESPIRE retombe sur l’embarqué', async () => {
    const fetchFn = servi({})
    await expect(loadPublishedReferentiel({ id: 'inconnu', fetchFn })).rejects.toThrow('Le référentiel « inconnu » n\'a pas pu être chargé')
    await expect(loadPublishedReferentiel({ id: 'respire', version: '9.9.9', fetchFn })).rejects.toThrow('« respire » 9.9.9')
    const panne = vi.fn().mockRejectedValue(new TypeError('network down'))
    expect((await loadPublishedReferentiel({ id: 'respire', fetchFn: panne })).origin).toBe('bundled')
    expect((await loadPublishedReferentiel({ id: 'respire', version: '7.0.0', fetchFn: panne })).origin).toBe('bundled')
  })

  it('liste les référentiels publiés, RESPIRE d’abord, chacun avec ses versions ; vide sans index', async () => {
    const liste = await listPublishedReferentiels({ fetchFn: servi({}) })
    expect(liste.map((r) => [r.id, r.label, r.versions.map((v) => v.semver)])).toEqual([
      ['respire', 'RESPIRE v8', ['8.0.0', '7.0.0']],
      ['fictif-neuf', 'Fictif à neuf pôles', ['1.0.0']],
      ['fictif-lettre', 'Fictif lettré', ['1.0.0']], // la 0.9.0, hors répertoire, est écartée
    ])
    expect(await listPublishedReferentiels({ fetchFn: vi.fn().mockRejectedValue(new TypeError('down')) })).toEqual([])
    expect(await listPublishedReferentiels({ fetchFn: vi.fn(), protocol: 'file:' })).toEqual([])
  })
})
