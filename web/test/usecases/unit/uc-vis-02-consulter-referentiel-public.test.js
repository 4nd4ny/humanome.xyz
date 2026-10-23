// UC-VIS-02 — Consulter le référentiel public : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
//
// Code sollicité appelé directement : routes #/referentiel[/<code>][?id=<id>]
// et permaliens (S5, lot E : tout référentiel publié), chargeur de l'export
// STATIQUE (produit par api/src/Referentiel/StaticExporter.php : index.json +
// un fichier par version) avec ses gardes et son repli sur le référentiel
// embarqué — le repli de la page, qui lit la base par l'API d'abord
// (`loadPublishedReferentiel({ id })`, src/data/referentiel.test.js).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash, referentielHash } from '../../../src/router.js'
import {
  API_TIMEOUT_MS,
  CATALOGUE_TTL_MS,
  clearReferentielCache,
  listPublishedReferentiels,
  loadPublishedReferentiel,
} from '../../../src/data/referentiel.js'
import respire from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { jsonResponse } from '../support/vis.js'

afterEach(() => clearReferentielCache())

const v710 = { ...respire, version: '7.1.0', label: 'RESPIRE v7.1.0' }

/** Index au format EXACT de StaticExporter (plusieurs référentiels, plus récent d'abord). */
const staticIndex = [
  { referentielId: 'autre', semver: '1.0.0', label: 'Autre', publishedAt: '2026-07-20T10:00:00', fichier: 'autre-v1.0.0.json' },
  { referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.0.json' },
  { referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', publishedAt: '2026-07-01T09:00:00', fichier: 'respire-v7.0.0.json' },
]

describe('UC-VIS-02 — routes et permaliens', () => {
  it('UC-VIS-02-U08 — #/referentiel et #/referentiel/<code> ; referentielHash encode le code ; chemin plus profond → introuvable', () => {
    expect(parseHash('#/referentiel')).toEqual({ name: 'referentiel', code: null })
    expect(parseHash('#/referentiel/1.01')).toEqual({ name: 'referentiel', code: '1.01' })
    expect(parseHash('#/referentiel/9.99')).toEqual({ name: 'referentiel', code: '9.99' }) // validé par la vue
    expect(parseHash('#/referentiel/1.01/extra').name).toBe('not-found')
    expect(referentielHash()).toBe('#/referentiel')
    expect(referentielHash('7.03')).toBe('#/referentiel/7.03')
    expect(parseHash(referentielHash('a b'))).toEqual({ name: 'referentiel', code: 'a b' })
  })

  it('UC-VIS-02-U12 — lien profond ?id=<id> vers un autre référentiel publié (S5, lot E) ; RESPIRE, le défaut, sans identifiant', () => {
    expect(parseHash('#/referentiel?id=fictif-humanome')).toEqual({ name: 'referentiel', code: null, referentiel: 'fictif-humanome' })
    expect(parseHash('#/referentiel/A1?id=fictif-humanome')).toEqual({ name: 'referentiel', code: 'A1', referentiel: 'fictif-humanome' })
    expect(parseHash('#/referentiel/A1.2?id=humanome&x=1')).toEqual({ name: 'referentiel', code: 'A1.2', referentiel: 'humanome' })
    // RESPIRE, un identifiant vide ou un autre paramètre : la page par défaut, sans clé `referentiel`
    expect(parseHash('#/referentiel?id=respire')).toEqual({ name: 'referentiel', code: null })
    expect(parseHash('#/referentiel/1.01?id=')).toEqual({ name: 'referentiel', code: '1.01' })
    expect(parseHash('#/referentiel?focus=1.01')).toEqual({ name: 'referentiel', code: null })
    // un identifiant quelconque passe tel quel : la vue dit celui qu'elle ne peut charger (UC-VIS-02-F21)
    expect(parseHash('#/referentiel?id=..%2Fx')).toEqual({ name: 'referentiel', code: null, referentiel: '../x' })
    expect(referentielHash(null, 'fictif-humanome')).toBe('#/referentiel?id=fictif-humanome')
    expect(referentielHash('A1', 'fictif-humanome')).toBe('#/referentiel/A1?id=fictif-humanome')
    expect(referentielHash('7.03', 'respire')).toBe('#/referentiel/7.03')
    expect(referentielHash(null, null)).toBe('#/referentiel')
    expect(referentielHash('a b', 'x y')).toBe('#/referentiel/a%20b?id=x%20y')
    expect(parseHash(referentielHash('a b', 'x y'))).toEqual({ name: 'referentiel', code: 'a b', referentiel: 'x y' })
  })

  // ANOMALIE AN1 de la fiche — test qui FIGE le comportement ACTUEL :
  // parseHash applique decodeURIComponent au segment du permalien sans
  // try/catch ; un pourcentage mal formé lève une URIError, et comme App
  // calcule sa route initiale avec parseHash (sans frontière d'erreur), toute
  // l'application plante au premier rendu. À inverser après correction.
  it('UC-VIS-02-U11 — [comportement actuel, anomalie AN1] permalien au pourcentage mal formé → parseHash lève URIError', () => {
    for (const hash of ['#/referentiel/%', '#/referentiel/100%', '#/referentiel/%E9']) {
      expect(() => parseHash(hash)).toThrow(URIError)
    }
    expect(parseHash('#/referentiel/%C3%A9')).toEqual({ name: 'referentiel', code: 'é' }) // bien encodé : lu
  })
})

describe('UC-VIS-02 — chargement de l’export statique publié', () => {
  it('UC-VIS-02-U09 — lit index.json, préfère le référentiel « respire », puis la version indiquée (plus récente)', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === 'data/referentiel/index.json') return jsonResponse(200, staticIndex)
      if (url === 'data/referentiel/respire-v7.1.0.json') return jsonResponse(200, v710)
      return jsonResponse(404, {})
    })
    const result = await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(result.origin).toBe('published')
    expect(result.doc.version).toBe('7.1.0')
    expect(fetchFn.mock.calls.map(([u]) => u)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-v7.1.0.json'])
    // Un seul chargement par session (cache module).
    await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // Sans entrée « respire » : la PREMIÈRE entrée de l'index est retenue.
    clearReferentielCache()
    const autre = { ...respire, id: 'autre', version: '1.0.0', label: 'Autre' }
    const onlyOther = vi.fn(async (url) =>
      url === 'data/referentiel/index.json'
        ? jsonResponse(200, [staticIndex[0]])
        : url === 'data/referentiel/autre-v1.0.0.json' ? jsonResponse(200, autre) : jsonResponse(404, {}),
    )
    const other = await loadPublishedReferentiel({ fetchFn: onlyOther, protocol: 'https:' })
    expect(other).toMatchObject({ origin: 'published', doc: { id: 'autre', version: '1.0.0' } })
  })

  it.each([
    ['index vide', () => jsonResponse(200, []), null],
    ['index illisible (HTTP 500)', () => jsonResponse(500, {}), null],
    ['document de forme inattendue', () => jsonResponse(200, staticIndex.slice(1)), () => jsonResponse(200, { version: '7.1.0' })],
    ['version absente (404)', () => jsonResponse(200, staticIndex.slice(1)), () => jsonResponse(404, {})],
  ])('UC-VIS-02-U10 — %s → repli silencieux sur le référentiel embarqué (jamais de rejet)', async (_, index, doc) => {
    const fetchFn = vi.fn(async (url) => (url === 'data/referentiel/index.json' ? index() : doc()))
    const result = await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(result.origin).toBe('bundled')
    expect(result.doc.version).toBe('7.0.0')
    expect(result.doc.competences).toHaveLength(61)
  })

  it('UC-VIS-02-U18 — file://, nom de fichier dangereux ou index au JSON invalide → repli embarqué (A6)', async () => {
    // file:// : aucune lecture tentée.
    const neverCalled = vi.fn()
    expect((await loadPublishedReferentiel({ fetchFn: neverCalled, protocol: 'file:' })).origin).toBe('bundled')
    expect(neverCalled).not.toHaveBeenCalled()

    // Garde SAFE_FILE_RE : un fichier hors du dossier n'est jamais lu.
    clearReferentielCache()
    const traversal = vi.fn(async (url) =>
      url === 'data/referentiel/index.json'
        ? jsonResponse(200, [{ ...staticIndex[1], fichier: '../../etc/passwd.json' }])
        : jsonResponse(200, v710),
    )
    expect((await loadPublishedReferentiel({ fetchFn: traversal, protocol: 'https:' })).origin).toBe('bundled')
    expect(traversal).toHaveBeenCalledTimes(1)

    // Index illisible : réponse 200 dont le JSON ne se parse pas.
    clearReferentielCache()
    const garbled = vi.fn(async () => ({ ...jsonResponse(200, null), json: async () => { throw new SyntaxError('Unexpected token') } }))
    const fallback = await loadPublishedReferentiel({ fetchFn: garbled, protocol: 'https:' })
    expect(fallback.origin).toBe('bundled')
    expect(fallback.doc.version).toBe('7.0.0')
  })
})

describe('UC-VIS-02 — la base par l’API, dans un délai (S5, lot E)', () => {
  /** Ce que rend la promesse dans la seconde, sinon « en attente ». */
  const dansLaSeconde = (promesse) =>
    Promise.race([promesse, new Promise((resolve) => setTimeout(() => resolve('en attente'), 1000))])

  it('UC-VIS-02-U15 — une API qui ne répond pas : passé le délai, sa requête est abandonnée et l’export statique répond, au chargeur comme au menu', async () => {
    const fetchFn = vi.fn((url) => {
      if (url.startsWith('api/')) return new Promise(() => {}) // ni réponse ni refus : PHP-FPM saturé, MySQL bloqué
      if (url === 'data/referentiel/index.json') return Promise.resolve(jsonResponse(200, staticIndex))
      if (url === 'data/referentiel/respire-v7.1.0.json') return Promise.resolve(jsonResponse(200, v710))
      return Promise.resolve(jsonResponse(404, {}))
    })
    const options = { fetchFn, protocol: 'https:', timeoutMs: 30 }
    expect(await dansLaSeconde(loadPublishedReferentiel({ id: 'respire', ...options }))).toEqual({ doc: v710, origin: 'published' })
    // la requête de l'API est abandonnée, pas laissée pendante
    const [, init] = fetchFn.mock.calls.find(([url]) => url === 'api/referentiels')
    expect(init.signal.aborted).toBe(true)
    const liste = await dansLaSeconde(listPublishedReferentiels(options))
    expect(liste.map((r) => [r.id, r.versions.map((v) => v.semver)])).toEqual([['respire', ['7.1.0', '7.0.0']], ['autre', ['1.0.0']]])
    // le délai par défaut : quelques secondes
    expect(API_TIMEOUT_MS).toBe(5000)
  })

  it('UC-VIS-02-U21 — la page charge un référentiel puis liste le menu : le catalogue de la base n’est demandé qu’une fois ; un échec ne se garde pas, un catalogue ancien se relit', async () => {
    let panne = false
    const fetchFn = vi.fn(async (url) => {
      if (url === 'api/referentiels') {
        return panne ? jsonResponse(503, { error: 'Database not configured' }) : jsonResponse(200, [{ id: 'respire', label: 'RESPIRE v7.1.0', versions: ['7.1.0'] }])
      }
      if (url === 'api/referentiels/respire/versions/7.1.0') return jsonResponse(200, v710)
      return jsonResponse(404, {})
    })
    const appels = () => fetchFn.mock.calls.filter(([url]) => url === 'api/referentiels').length
    expect((await loadPublishedReferentiel({ id: 'respire', fetchFn, protocol: 'https:' })).doc).toEqual(v710)
    expect((await listPublishedReferentiels({ fetchFn, protocol: 'https:' })).map((r) => r.id)).toEqual(['respire'])
    expect(appels()).toBe(1)

    // un catalogue plus ancien que sa durée se relit (une version publiée entre-temps se voit)
    const debut = Date.now()
    const maintenant = vi.spyOn(Date, 'now').mockReturnValue(debut + CATALOGUE_TTL_MS + 1)
    panne = true
    expect(await listPublishedReferentiels({ fetchFn, protocol: 'https:' })).toEqual([]) // ni base ni index
    expect(appels()).toBe(2)
    // l'échec n'est pas gardé : la lecture suivante redemande
    panne = false
    expect((await listPublishedReferentiels({ fetchFn, protocol: 'https:' })).map((r) => r.id)).toEqual(['respire'])
    expect(appels()).toBe(3)
    maintenant.mockRestore()
  })
})
