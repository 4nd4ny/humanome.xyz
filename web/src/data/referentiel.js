// Public referentiel loading (P4.4). Consultation is STATIC by design: the
// published versions live as plain JSON under data/referentiel/, exported by
// api/src/Referentiel/StaticExporter.php — index.json is an ARRAY of
// {referentielId, semver, label, publishedAt, fichier}, newest version first
// per referentiel. No PHP call at consultation time. When the fetch is
// impossible (file://, offline copy), the bundled RESPIRE v7 import
// (data/load.js) is the fallback so the page always renders.
//
// Any published referential, not RESPIRE's alone (2026-10-20): a flow loads the
// one it is given — `{ id, version }` — and lists them to offer a choice
// (listPublishedReferentiels, components/ReferentielChoice.jsx).
import { getReferentiel } from './load.js'

/** Filenames accepted from index.json (no path traversal, same directory). */
const SAFE_FILE_RE = /^[A-Za-z0-9._-]+\.json$/

/** The platform's referential, the default one (and the bundled one). */
const RESPIRE = 'respire'

let cache = null
/** @type {Map<string, {doc: object, origin: 'published' | 'bundled'}>} `${id}@${version}` -> result */
const parReferentiel = new Map()

/** Empties the module cache (used by tests). */
export function clearReferentielCache() {
  cache = null
  parReferentiel.clear()
}

/**
 * Loads a published referentiel version. Without an `id`: the latest
 * published RESPIRE, falling back to the bundled one — never rejects, the
 * fallback is part of the contract. With an `id` (and a `version`, else its
 * latest): that version from index.json; RESPIRE falls back to the bundled
 * one when it is that version (or no version is asked), any other rejects
 * with a French message.
 *
 * @param {{id?: string, version?: string, fetchFn?: typeof fetch, protocol?: string}} [options] fetchFn, protocol: test seams
 * @returns {Promise<{doc: object, origin: 'published' | 'bundled'}>}
 */
export async function loadPublishedReferentiel(options = {}) {
  const { id, version } = options
  if (!id) {
    if (cache !== null) return cache
    cache = await fetchLatest(options).catch(() => ({ doc: getReferentiel(), origin: 'bundled' }))
    return cache
  }
  const cle = `${id}@${version ?? ''}`
  if (parReferentiel.has(cle)) return parReferentiel.get(cle)
  const result = await fetchVersion(options, id, version).catch((err) => {
    const bundled = getReferentiel()
    if (id === RESPIRE && (!version || version === bundled.version)) return { doc: bundled, origin: 'bundled' }
    throw new Error(`Le référentiel « ${id} »${version ? ` ${version}` : ''} n'a pas pu être chargé`, { cause: err })
  })
  parReferentiel.set(cle, result)
  return result
}

/**
 * The published referentials, from index.json: each with its versions, newest
 * first, RESPIRE first and the others by label. Empty when the index cannot be
 * read (file://, offline copy): only the bundled RESPIRE is then at hand.
 *
 * @param {{fetchFn?: typeof fetch, protocol?: string}} [options] test seams
 * @returns {Promise<Array<{id: string, label: string, versions: Array<{semver: string, label: string, fichier: string, publishedAt: string|null}>}>>}
 */
export async function listPublishedReferentiels(options = {}) {
  let index
  try {
    index = await fetchIndex(options)
  } catch {
    return []
  }
  const parId = new Map()
  for (const e of index) {
    if (typeof e?.referentielId !== 'string' || typeof e?.fichier !== 'string' || !SAFE_FILE_RE.test(e.fichier)) continue
    if (!parId.has(e.referentielId)) parId.set(e.referentielId, [])
    parId.get(e.referentielId).push({
      semver: String(e.semver ?? ''),
      label: String(e.label ?? e.referentielId),
      fichier: e.fichier,
      publishedAt: e.publishedAt ?? null,
    })
  }
  return [...parId.entries()]
    .map(([id, versions]) => ({ id, label: versions[0].label, versions }))
    .sort((a, b) => (a.id === RESPIRE ? -1 : b.id === RESPIRE ? 1 : a.label.localeCompare(b.label, 'fr')))
}

function fetcher(options) {
  const protocol = options.protocol ?? globalThis.location?.protocol
  if (protocol === 'file:') throw new Error('fetch unavailable on file://')
  const doFetch = options.fetchFn ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) throw new Error('fetch unavailable')
  return doFetch
}

/** @returns {Promise<Array<object>>} index.json, non-empty @throws on any anomaly */
async function fetchIndex(options) {
  const index = await fetchJson(fetcher(options), 'data/referentiel/index.json')
  if (!Array.isArray(index) || index.length === 0) {
    throw new Error('referentiel index: empty or invalid')
  }
  return index
}

/** @returns {Promise<{doc: object, origin: 'published'}>} @throws on any anomaly */
async function fetchEntry(options, entry) {
  const file = entry?.fichier
  if (typeof file !== 'string' || !SAFE_FILE_RE.test(file)) {
    throw new Error('referentiel index: invalid "fichier" entry')
  }
  const doc = await fetchJson(fetcher(options), `data/referentiel/${file}`)
  if (!Array.isArray(doc?.poles) || !Array.isArray(doc?.competences)) {
    throw new Error('referentiel: unexpected document shape')
  }
  return { doc, origin: 'published' }
}

/** @returns {Promise<{doc: object, origin: 'published'}>} @throws on any anomaly */
async function fetchLatest(options) {
  const index = await fetchIndex(options)
  // Newest first (StaticExporter). RESPIRE is the platform's referentiel:
  // prefer it should several referentiels ever be published side by side.
  return fetchEntry(options, index.find((e) => e?.referentielId === RESPIRE) ?? index[0])
}

/** @returns {Promise<{doc: object, origin: 'published'}>} @throws on any anomaly, an unknown id or version */
async function fetchVersion(options, id, version) {
  const index = await fetchIndex(options)
  const entry = index.find((e) => e?.referentielId === id && (!version || e?.semver === version))
  if (!entry) throw new Error(`referentiel index: no ${id} ${version ?? ''}`)
  return fetchEntry(options, entry)
}

/** @throws {Error} on network failure, non-2xx or invalid JSON */
async function fetchJson(doFetch, url) {
  const response = await doFetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${url}`)
  return response.json()
}
