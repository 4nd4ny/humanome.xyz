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

// Les menus lisent la base (S5, 2026-10-22) : l'API publique d'abord
// (GET api/referentiels, GET api/referentiels/{id}/versions/{semver}, versions
// publiées seulement), l'export statique en repli, RESPIRE embarqué en dernier.
describe('API d’abord, export statique en repli (S5)', () => {
  /** Réponse de l'API : api/client.js n'en lit le corps que s'il est déclaré JSON. */
  const apiResponse = (data, status = 200) => ({
    ...jsonResponse(data, status),
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  })
  const lettre = { id: 'fictif-lettre', version: '1.1.0', label: 'Fictif lettré', poles: [{ num: 1, nom: 'A', couleur: null }], competences: [{ code: 'A1', nom: 'Un', pole: 1 }] }
  // La base range les référentiels par identifiant : « fictif-* » avant RESPIRE.
  const catalogue = [
    { id: 'fictif-lettre', label: 'Fictif lettré', versions: ['1.1.0', '1.0.0'] },
    { id: 'fictif-neuf', label: 'Fictif à neuf pôles', versions: ['1.0.0'] },
    { id: 'respire', label: 'RESPIRE v7', versions: ['7.1.0', '7.0.0'] },
  ]
  /** Le réseau : `api` (url -> réponse) ; l'export statique de publishedIndex derrière. */
  const reseau = (api) => vi.fn(async (url) => {
    if (url in api) return api[url]
    if (url.startsWith('api/')) return apiResponse({ error: 'Unknown published version' }, 404)
    if (url === 'data/referentiel/index.json') return jsonResponse(publishedIndex)
    if (url === 'data/referentiel/respire-v8.0.0.json') return jsonResponse(publishedDoc)
    return jsonResponse({ error: 'absent' }, 404)
  })
  const statiques = (fetchFn) => fetchFn.mock.calls.map(([url]) => url).filter((url) => url.startsWith('data/'))

  it('liste les référentiels de la base, RESPIRE d’abord puis par libellé, sans lire l’export statique', async () => {
    const fetchFn = reseau({ 'api/referentiels': apiResponse(catalogue) })
    const liste = await listPublishedReferentiels({ fetchFn })
    expect(liste.map((r) => [r.id, r.label, r.versions.map((v) => v.semver)])).toEqual([
      ['respire', 'RESPIRE v7', ['7.1.0', '7.0.0']],
      ['fictif-neuf', 'Fictif à neuf pôles', ['1.0.0']],
      ['fictif-lettre', 'Fictif lettré', ['1.1.0', '1.0.0']],
    ])
    // la forme de l'index : une version porte le libellé de son référentiel, ni fichier ni date
    expect(liste[0].versions[1]).toEqual({ semver: '7.0.0', label: 'RESPIRE v7', fichier: null, publishedAt: null })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe('api/referentiels')
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'same-origin' })
  })

  it('porte la provenance de chaque référentiel (`source` de sa dernière version : S5, E1, E9) ; l’index statique n’en a pas', async () => {
    const source = '« Référentiel Fictif » 1.1.0, https://example.invalid/referentiel. Licence : CC-BY-SA Éditeur fictif.'
    const avecSource = [
      { ...catalogue[0], source },
      { ...catalogue[1], source: 42 },
      { ...catalogue[2], source: '' },
    ]
    const liste = await listPublishedReferentiels({ fetchFn: reseau({ 'api/referentiels': apiResponse(avecSource) }) })
    expect(liste.map((r) => [r.id, r.source])).toEqual([['respire', null], ['fictif-neuf', null], ['fictif-lettre', source]])
    const depuisIndex = await listPublishedReferentiels({ fetchFn: reseau({}) })
    expect(depuisIndex.map((r) => [r.id, r.source])).toEqual([['respire', null]])
  })

  it('écarte les entrées malformées ; une réponse vide, malformée ou en erreur retombe sur l’index statique', async () => {
    const melange = [
      ...catalogue.slice(0, 1),
      { id: 'FICTIF-MAJ', label: 'Casse', versions: ['1.0.0'] },
      { id: 'sans-version', label: 'Vide', versions: [] },
      { id: 'versions-illisibles', label: 'X', versions: [7, ''] },
      { id: 'sans-libelle', versions: ['1.0.0'] },
      null,
    ]
    const liste = await listPublishedReferentiels({ fetchFn: reseau({ 'api/referentiels': apiResponse(melange) }) })
    expect(liste.map((r) => [r.id, r.label])).toEqual([['fictif-lettre', 'Fictif lettré'], ['sans-libelle', 'sans-libelle']])

    const depuisIndex = [['respire', ['8.0.0', '7.0.0']]]
    for (const reponse of [
      apiResponse([]),
      apiResponse({ referentiels: catalogue }),
      apiResponse([{ id: 'FICTIF', label: 'X', versions: ['1.0.0'] }]),
      apiResponse({ error: 'Database not configured' }, 503),
      { ...jsonResponse(catalogue), headers: { get: () => 'text/html' } }, // hébergement statique sans API
    ]) {
      const fetchFn = reseau({ 'api/referentiels': reponse })
      const liste = await listPublishedReferentiels({ fetchFn })
      expect(liste.map((r) => [r.id, r.versions.map((v) => v.semver)])).toEqual(depuisIndex)
      expect(statiques(fetchFn)).toEqual(['data/referentiel/index.json'])
    }
    const panne = vi.fn(async (url) => (url === 'data/referentiel/index.json' ? jsonResponse(publishedIndex) : Promise.reject(new TypeError('down'))))
    expect((await listPublishedReferentiels({ fetchFn: panne })).map((r) => r.id)).toEqual(['respire'])
  })

  it('charge la version demandée depuis la base, sa dernière (catalogue) sans version ; l’export statique n’est pas lu', async () => {
    const fetchFn = reseau({
      'api/referentiels': apiResponse(catalogue),
      'api/referentiels/fictif-lettre/versions/1.1.0': apiResponse(lettre),
      'api/referentiels/respire/versions/7.1.0': apiResponse({ ...publishedDoc, id: 'respire', version: '7.1.0' }),
    })
    expect(await loadPublishedReferentiel({ id: 'fictif-lettre', version: '1.1.0', fetchFn })).toEqual({ doc: lettre, origin: 'published' })
    clearReferentielCache()
    expect((await loadPublishedReferentiel({ id: 'fictif-lettre', fetchFn })).doc).toEqual(lettre)
    expect((await loadPublishedReferentiel({ id: 'respire', fetchFn })).doc.version).toBe('7.1.0')
    expect(statiques(fetchFn)).toEqual([])
    // en cache par référentiel et version
    await loadPublishedReferentiel({ id: 'fictif-lettre', fetchFn })
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/referentiels/fictif-lettre/versions/1.1.0')).toHaveLength(2)
  })

  it('encode les segments du chemin', async () => {
    const pre = { ...lettre, id: 'fictif.pre', version: '18.0.0-proposition.1+meta' }
    const fetchFn = reseau({ 'api/referentiels/fictif.pre/versions/18.0.0-proposition.1%2Bmeta': apiResponse(pre) })
    expect((await loadPublishedReferentiel({ id: 'fictif.pre', version: '18.0.0-proposition.1+meta', fetchFn })).doc).toEqual(pre)
  })

  it('un document de l’API qui n’est pas celui demandé, une version inconnue ou une API absente → l’export statique, puis RESPIRE embarqué', async () => {
    const autreVersion = reseau({ 'api/referentiels/respire/versions/8.0.0': apiResponse({ ...publishedDoc, id: 'respire', version: '7.1.0' }) })
    expect(await loadPublishedReferentiel({ id: 'respire', version: '8.0.0', fetchFn: autreVersion })).toEqual({ doc: publishedDoc, origin: 'published' })
    expect(statiques(autreVersion)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-v8.0.0.json'])

    clearReferentielCache()
    const autreId = reseau({ 'api/referentiels/respire/versions/8.0.0': apiResponse({ ...lettre, version: '8.0.0' }) })
    expect((await loadPublishedReferentiel({ id: 'respire', version: '8.0.0', fetchFn: autreId })).doc).toEqual(publishedDoc)

    clearReferentielCache()
    const sansPoles = reseau({ 'api/referentiels/respire/versions/8.0.0': apiResponse({ id: 'respire', version: '8.0.0' }) })
    expect((await loadPublishedReferentiel({ id: 'respire', version: '8.0.0', fetchFn: sansPoles })).doc).toEqual(publishedDoc)

    clearReferentielCache()
    const inconnue = reseau({}) // 404 de l'API : l'index statique en repli
    expect((await loadPublishedReferentiel({ id: 'respire', version: '8.0.0', fetchFn: inconnue })).doc).toEqual(publishedDoc)

    clearReferentielCache()
    const rien = vi.fn().mockRejectedValue(new TypeError('network down'))
    expect((await loadPublishedReferentiel({ id: 'respire', version: '7.0.0', fetchFn: rien })).origin).toBe('bundled')
    await expect(loadPublishedReferentiel({ id: 'fictif-lettre', version: '1.1.0', fetchFn: rien })).rejects.toThrow('« fictif-lettre » 1.1.0')
    // un identifiant hors forme n'est pas demandé à l'API
    const horsForme = reseau({})
    await expect(loadPublishedReferentiel({ id: 'Fictif Lettre', fetchFn: horsForme })).rejects.toThrow('« Fictif Lettre »')
    expect(horsForme.mock.calls.some(([url]) => url.startsWith('api/'))).toBe(false)
  })

  it('sans identifiant, la page publique reste statique : aucune requête à l’API', async () => {
    const fetchFn = reseau({ 'api/referentiels': apiResponse(catalogue) })
    expect((await loadPublishedReferentiel({ fetchFn })).doc).toEqual(publishedDoc)
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-v8.0.0.json'])
  })

  it('depuis file://, ni l’API ni l’export ne sont tentés', async () => {
    const fetchFn = vi.fn()
    expect(await listPublishedReferentiels({ fetchFn, protocol: 'file:' })).toEqual([])
    expect((await loadPublishedReferentiel({ id: 'respire', fetchFn, protocol: 'file:' })).origin).toBe('bundled')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
