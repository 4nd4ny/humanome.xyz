// Archive export / import (P8.6, chantier C) — the RGPD portability pivot
// (ADR-006, cahier §6.1/§6.3): assembles a SELF-CONTAINED document conforming
// to schemas/archive-export.schema.json from the LOCAL stores (portfolios,
// cartographies) plus the current referentiel and those of the cartographies
// (2026-10-20: any referential, each cartography noting its own), validates it through the
// engine BEFORE any download, and restores an archive into the local stores
// (ids regenerated, duplicates skipped by content).
//
// Everything runs in the browser: the archive never transits through the
// server. The only network calls are read-only lookups (account identity,
// published referentiel, default prompt package) and they all degrade to
// a purely local, anonymous archive when the API is unreachable.
//
// Since 1.1.0 (cartography journal D-25, question 10: « tout sauvegarder »),
// the archive also carries every dataset of the cartography interface
// (#/cartographie, its own IndexedDB store) as a complete master v4 archive
// (schemas/competency-map-master.schema.json) — the public demo excepted as
// long as the person has added nothing to it. A dataset that does not match
// its schema is left out and reported, never blocking the rest of the export.
// Import restores them into that store: a dataset with the same id is
// completed (what is there wins, duplicates ignored), otherwise created;
// never on the server.
//
// Since 1.2.0 (Twin_v9's docs/plan-twin9-php.md, T10; ADR-011 §5), the
// archive also carries the account's Twin9 analyses, which live on the
// server: each run — the copy of its profile, its portfolio, its journal,
// its outputs — and the memory of its maps, as GET /api/twin9/mes-analyses gives
// them (`analysesTwin9`). Never imported back: a run is launched again.
//
// Since 1.3.0 (sprint 8), the account block also carries the RESPIRE roles
// the person declares (`account.declaredRoles`, GET /api/auth/me/declared-roles),
// apart from its habilitations (`account.roles`): a declaration opens no
// right. Left out when it cannot be read; never imported back.
//
// A portfolio restored from an archive loses the marks of Twin9's highlighted
// portfolio (S3-3, lib/twin9/marques.js), its segmentation's bounds moved with
// its text: no trace comes in through a file, the analysed text never has one.

import { validateDocument } from '@engine/validation.js'
import { apiFetch, fetchMe } from '../api/client.js'
import { frenchDate } from '../data/load.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import { chargerReferentielDuDocument, referenceDuDocument } from './referentiel-du-document.js'
import { createPortfolioStore } from './portfolio-store.js'
import { createCartoStore } from './carto-store.js'
import { createCartoStore as createInterfaceStore } from '../carto/core/store.js'
import { buildArchive as buildMasterArchive } from '../carto/core/archive.js'
import { retirerMarquesTwin9 } from './twin9/marques.js'
import { importFiles as importIntoInterface } from '../carto/core/import.js'
import { createDataset, isPristineDemo } from '../carto/core/model.js'

export const ARCHIVE_SCHEMA_VERSION = '1.3.0'

// Traceability fallbacks for cartographies saved without run metadata (e.g.
// a document imported by drag & drop): the archive schema REQUIRES the
// prompt-package couple, so a neutral marker keeps the archive valid without
// fabricating provenance. Mapped back to null on import.
export const UNKNOWN_ID = 'inconnu'
export const UNKNOWN_VERSION = '0.0.0'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Default browser download (Blob + <a download>). Injectable in tests. */
function browserDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Downloads any JSON-serialisable value as a pretty-printed .json file.
 * Shared by the archive export and the per-cartography « Télécharger le
 * JSON » action of CartographiesPanel.
 *
 * @param {string} filename
 * @param {unknown} data
 * @param {(filename: string, text: string) => void} [download] test seam
 */
export function downloadJson(filename, data, download = browserDownload) {
  download(filename, JSON.stringify(data, null, 2))
}

/** account block from the session, or null (anonymous archive) on any failure. */
async function defaultGetAccount(fetchFn) {
  try {
    const { user } = await fetchMe(fetchFn ? { fetchFn } : undefined)
    if (!user) return null
    const account = { roles: Array.isArray(user.roles) ? user.roles : [] }
    if (typeof user.email === 'string' && user.email !== '') account.email = user.email
    if (typeof user.displayName === 'string' && user.displayName !== '') {
      account.displayName = user.displayName
    }
    const declaredRoles = await defaultGetDeclaredRoles(fetchFn)
    if (declaredRoles) account.declaredRoles = declaredRoles
    return account
  } catch {
    return null
  }
}

/**
 * The RESPIRE roles the account declares (1.3.0, sprint 8), apart from its
 * habilitations; null when they cannot be read (an older API, the network).
 */
async function defaultGetDeclaredRoles(fetchFn) {
  try {
    const data = await apiFetch('auth/me/declared-roles', fetchFn ? { fetchFn } : undefined)
    if (!Array.isArray(data?.roles) || typeof data.foundingCircle !== 'boolean') return null
    return {
      roles: data.roles.filter((role) => typeof role === 'string' && role !== ''),
      foundingCircle: data.foundingCircle,
    }
  } catch {
    return null
  }
}

/** Default published prompt package via the API, or [] when unreachable. */
async function defaultGetPromptPackages(fetchFn) {
  const options = fetchFn ? { fetchFn } : undefined
  try {
    const list = await apiFetch('prompt-packages', options)
    if (!Array.isArray(list) || list.length === 0) return []
    const { id, version } = list[0] ?? {}
    if (typeof id !== 'string' || typeof version !== 'string') return []
    const doc = await apiFetch(
      `prompt-packages/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
      options,
    )
    return doc && doc.kind === 'prompt-package' ? [doc] : []
  } catch {
    return []
  }
}

/**
 * The learner's OWN mass cartographies produced by an establishment cohort
 * (RGPD accès/portabilité, art. 15/20). They live server-side, not in the
 * local carto-store, so the one-click export would miss them without this.
 * Read-only; [] for anonymous users or on any failure.
 */
async function defaultGetMassDocuments(fetchFn) {
  const options = fetchFn ? { fetchFn } : undefined
  try {
    const { documents } = await apiFetch('mes-documents-masse', options)
    return Array.isArray(documents) ? documents : []
  } catch {
    return []
  }
}

/**
 * The account's Twin9 analyses on the server (1.2.0, ADR-011 §5): its runs
 * and the memory of their maps, read-only. Nothing for a visitor, an account
 * without runs, an instance without the route, a static copy or a browser
 * offline, as for the mass documents; a server error is reported, never
 * blocking the rest of the export.
 * @returns {Promise<{data: object | null, error: string | null}>}
 */
async function defaultGetTwin9(fetchFn) {
  try {
    const data = await apiFetch('twin9/mes-analyses', fetchFn ? { fetchFn } : undefined)
    const vide = !data || ((data.runs ?? []).length === 0 && (data.cartes ?? []).length === 0)
    return { data: vide ? null : data, error: null }
  } catch (error) {
    return { data: null, error: Number(error?.status) >= 500 ? String(error.message) : null }
  }
}

/** Maps a /mes-documents-masse entry to the archive `cartographies[]` shape. */
function toArchiveMassCartography(entry, exportedAt) {
  return {
    id: `masse-${entry.runId}-${entry.jobId}`,
    type: 'jour',
    document: entry.document,
    promptPackageId: entry.promptPackage?.id ?? UNKNOWN_ID,
    promptPackageVersion: entry.promptPackage?.version ?? UNKNOWN_VERSION,
    referentielId: entry.referentiel?.id ?? UNKNOWN_ID,
    referentielVersion: entry.referentiel?.version ?? UNKNOWN_VERSION,
    // runMeta n'accepte que {modele, dateRun, tokens?, coutEstime?} (schéma,
    // additionalProperties false) : la provenance cohorte tient dans « modele »
    // faute d'exposer le modèle exact de l'établissement à l'apprenant.
    runMeta: {
      modele: `cartographie de masse — cohorte « ${entry.cohorte ?? '?'} »`,
      dateRun: exportedAt,
    },
  }
}

/**
 * The public demo as loaded, untouched: it reloads from the site. As soon as
 * the person puts something of their own in it (an import, an answer to the
 * jury, a notebook dialogue, a set, a marker, a note), it is their data and
 * leaves with the archive. Defined with the dataset model (the interface
 * also uses it to refresh an untouched demo, journal D-57).
 */
export { isPristineDemo }

/**
 * Every dataset of the cartography interface as a complete master v4 archive
 * (portfolio text, notebook and learner state included: « tout sauvegarder »).
 * Each one is checked against its schema: one that does not match is left
 * out (and reported) rather than blocking the whole export.
 * @returns {Promise<{list: object[], excluded: Array<{title: string, errors: number}>}>}
 */
async function interfaceDatasets(store, exportedAt) {
  const list = []
  const excluded = []
  for (const { datasetId } of await store.listDatasets()) {
    // An untouched demo reloads from the site: it does not leave, and nothing
    // is read for it (read on demand, its files would be downloaded — D-67).
    const dataset = (await store.loadDataset?.(datasetId)) ?? null
    if (dataset && isPristineDemo(dataset)) continue
    let exported
    try {
      exported = await store.exportAll(datasetId)
    } catch {
      // A dataset read on demand whose files cannot be fetched (offline):
      // left out and named, the rest of the archive leaves.
      excluded.push({ title: String(dataset?.title ?? datasetId), errors: 0 })
      continue
    }
    if (!exported || isPristineDemo(exported.dataset)) continue
    const master = buildMasterArchive(exported, { includePortfolio: true, now: exportedAt })
    const { valid, errors } = validateDocument('competency-map-master', master)
    if (valid) list.push(master)
    else excluded.push({ title: String(master.title ?? datasetId), errors: errors.length })
  }
  return { list, excluded }
}

/** Maps a portfolio-store record to the archive `portfolios[]` shape. */
function toArchivePortfolio(record) {
  const segmentation = (record.segments ?? [])
    .filter(
      (s) =>
        s &&
        ISO_DATE_RE.test(String(s.date)) &&
        Number.isInteger(s.debut) &&
        Number.isInteger(s.fin) &&
        s.debut >= 0 &&
        s.fin >= s.debut,
    )
    .map((s) => ({ date: s.date, debut: s.debut, fin: s.fin }))
  return {
    id: record.id,
    titre: record.titre ?? 'Portfolio sans titre',
    source: ['colle', 'gdocs', 'fichier'].includes(record.source) ? record.source : 'colle',
    texte: record.texte ?? '',
    segmentation,
  }
}

/** runMeta restricted to the schema keys (never invents counters). */
function toArchiveRunMeta(runMeta, fallbackDate) {
  const meta = {
    modele:
      typeof runMeta?.modele === 'string' && runMeta.modele !== '' ? runMeta.modele : UNKNOWN_ID,
    dateRun:
      typeof runMeta?.dateRun === 'string' && runMeta.dateRun !== ''
        ? runMeta.dateRun
        : fallbackDate,
  }
  if (runMeta?.tokens && typeof runMeta.tokens === 'object') {
    const tokens = {}
    for (const key of ['entree', 'sortie', 'total']) {
      if (Number.isInteger(runMeta.tokens[key]) && runMeta.tokens[key] >= 0) {
        tokens[key] = runMeta.tokens[key]
      }
    }
    if (Object.keys(tokens).length > 0) meta.tokens = tokens
  }
  if (typeof runMeta?.coutEstime === 'number' && runMeta.coutEstime >= 0) {
    meta.coutEstime = runMeta.coutEstime
  }
  return meta
}

/**
 * Maps a carto-store entry to the archive `cartographies[]` shape. Its
 * referential is the one the entry noted; else the one its document names
 * (2026-10-20), at the most recent published version its document conforms
 * to (chargerReferentielDuDocument, the review's rule) — never RESPIRE's for a
 * document of another referential; unknown when none could be loaded.
 */
function toArchiveCartography(entry, referentiels, fallbackDate) {
  const noted = typeof entry.referentiel?.id === 'string' ? entry.referentiel : null
  const loaded = noted ? null : referentiels.get(entry.id) ?? null
  return {
    id: entry.id,
    type: entry.type === 'merge' ? 'merge' : 'jour',
    document: entry.document,
    promptPackageId: entry.promptPackage?.id ?? UNKNOWN_ID,
    promptPackageVersion: entry.promptPackage?.version ?? UNKNOWN_VERSION,
    referentielId: noted?.id ?? loaded?.id ?? UNKNOWN_ID,
    referentielVersion: noted ? (noted.version ?? UNKNOWN_VERSION) : (loaded?.version ?? UNKNOWN_VERSION),
    runMeta: toArchiveRunMeta(entry.runMeta, entry.updatedAt ?? fallbackDate),
  }
}

/**
 * The referentials the archive carries (self-contained, 2026-10-20): the
 * current RESPIRE, as before, and the one of each exported cartography that
 * can be loaded — a read-only lookup that degrades to leaving it out.
 *
 * @returns {Promise<{docs: object[], byEntry: Map<string, object>}>} byEntry:
 *   for an entry without a noted version, the document its own document reads
 */
async function archiveReferentiels(entries, respire, getReferentiel) {
  const docs = []
  const keys = new Set()
  const byEntry = new Map()
  const keep = (doc) => {
    if (!doc) return
    const key = `${doc.id}@${doc.version}`
    if (!keys.has(key)) {
      keys.add(key)
      docs.push(doc)
    }
  }
  keep(respire)
  const noted = new Map()
  for (const entry of entries) {
    const ref = referenceDuDocument(entry.document, entry.referentiel ?? null)
    if (ref.version !== null) {
      noted.set(`${ref.id}@${ref.version}`, ref)
    } else {
      // No noted version: the most recent published one its document conforms to.
      const doc = await chargerReferentielDuDocument(entry.document, { getReferentiel }).catch(() => null)
      keep(doc)
      if (doc) byEntry.set(entry.id, doc)
    }
  }
  for (const ref of noted.values()) {
    keep(await chargerReferentielDuDocument(null, { connu: ref, getReferentiel }).catch(() => null))
  }
  return { docs, byEntry }
}

/**
 * Assembles, validates and downloads the complete local archive.
 *
 * @param {{
 *   cartoStore?: ReturnType<typeof createCartoStore>,
 *   portfolioStore?: ReturnType<typeof createPortfolioStore>,
 *   interfaceStore?: ReturnType<typeof createInterfaceStore>,
 *   getAccount?: () => Promise<object | null>,
 *   getReferentiel?: () => Promise<{doc: object}>,
 *   getPromptPackages?: () => Promise<object[]>,
 *   getTwin9?: () => Promise<{data: object | null, error: string | null}>,
 *   download?: (filename: string, text: string) => void,
 *   now?: () => Date,
 *   fetchFn?: typeof fetch,
 * }} [options] every dependency is injectable (tests, chantier B)
 * @returns {Promise<{archive: object, filename: string,
 *   counts: {portfolios: number, cartographies: number, jeux: number, jeuxError: string | null,
 *     jeuxExclus: string[], analysesTwin9: number, twin9Error: string | null}}>} (jeuxExclus: titles of
 *   datasets left out, not matching their schema; analysesTwin9: the Twin9 runs carried)
 * @throws {Error} French message; `error.validationErrors` carries the ajv
 *   errors if the assembled archive does not match its schema (never
 *   downloads an invalid archive).
 */
export async function exportArchive(options = {}) {
  const cartoStore = options.cartoStore ?? createCartoStore()
  const portfolioStore = options.portfolioStore ?? createPortfolioStore()
  const interfaceStore = options.interfaceStore ?? createInterfaceStore()
  const getAccount = options.getAccount ?? (() => defaultGetAccount(options.fetchFn))
  const getReferentiel = options.getReferentiel ?? loadPublishedReferentiel
  const getPromptPackages =
    options.getPromptPackages ?? (() => defaultGetPromptPackages(options.fetchFn))
  const download = options.download ?? browserDownload
  const nowDate = (options.now ?? (() => new Date()))()
  const exportedAt = nowDate.toISOString()

  const getMassDocuments =
    options.getMassDocuments ?? (() => defaultGetMassDocuments(options.fetchFn))
  const getTwin9 = options.getTwin9 ?? (() => defaultGetTwin9(options.fetchFn))

  const [account, portfolios, entries, referentiel, promptPackages, massDocuments, twin9, jeux] =
    await Promise.all([
      getAccount(),
      portfolioStore.list(),
      cartoStore.listCartographies(),
      getReferentiel(),
      getPromptPackages(),
      getMassDocuments(),
      getTwin9(),
      // Un stockage de l'interface illisible n'empêche pas l'export (portabilité,
      // RGPD) : il est signalé dans le compte rendu (counts.jeuxError).
      interfaceDatasets(interfaceStore, exportedAt).then(
        ({ list, excluded }) => ({ list, excluded, error: null }),
        (error) => ({ list: [], excluded: [], error }),
      ),
    ])
  const referentielDoc = referentiel?.doc ?? referentiel ?? null
  const exported = entries.filter((entry) => entry.document != null)
  const referentiels = await archiveReferentiels(exported, referentielDoc, getReferentiel)

  const archive = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    kind: 'archive-export',
    exportedAt,
    account,
    portfolios: portfolios.map(toArchivePortfolio),
    referentiels: referentiels.docs,
    promptPackages,
    cartographies: [
      ...exported.map((entry) => toArchiveCartography(entry, referentiels.byEntry, exportedAt)),
      // Cartographies de masse produites par un établissement (art. 15/20).
      ...massDocuments
        .filter((entry) => entry.document != null)
        .map((entry) => toArchiveMassCartography(entry, exportedAt)),
    ],
    // Interface de cartographie (1.1.0) : chaque jeu, archive complète.
    jeuxCartographie: jeux.list,
    // Analyses approfondies Twin9, sur le serveur (1.2.0) : runs et mémoire de leurs cartes.
    ...(twin9.data ? { analysesTwin9: twin9.data } : {}),
    audit: [],
  }

  const { valid, errors } = validateDocument('archive-export', archive)
  if (!valid) {
    const error = new Error(
      `L’archive assemblée n’est pas conforme au schéma archive-export (${errors.length} ` +
        `erreur${errors.length > 1 ? 's' : ''}) : export annulé, rien n’a été téléchargé.`,
    )
    error.validationErrors = errors
    throw error
  }

  const filename = `humanome-export-${exportedAt.slice(0, 10)}.json`
  download(filename, JSON.stringify(archive, null, 2))
  return {
    archive,
    filename,
    counts: {
      portfolios: archive.portfolios.length,
      cartographies: archive.cartographies.length,
      jeux: archive.jeuxCartographie.length,
      jeuxError: jeux.error ? String(jeux.error.message ?? jeux.error) : null,
      jeuxExclus: jeux.excluded.map((x) => x.title),
      analysesTwin9: twin9.data?.runs?.length ?? 0,
      twin9Error: twin9.error,
    },
  }
}

/** Derives a French display title for an imported cartography. */
function importedTitre(item) {
  const doc = item.document ?? {}
  if (item.type === 'jour' && ISO_DATE_RE.test(String(doc.date))) {
    return `Journée du ${frenchDate(doc.date)}`
  }
  if (item.type === 'merge' && doc.periode?.premiere && doc.periode?.derniere) {
    return `Parcours du ${frenchDate(doc.periode.premiere)} au ${frenchDate(doc.periode.derniere)}`
  }
  return item.type === 'merge' ? 'Cartographie merge importée' : 'Cartographie importée'
}

/**
 * Validates an archive file and restores portfolios + cartographies into the
 * LOCAL stores. Ids are regenerated; duplicates are skipped by CONTENT
 * (portfolio: same full text; cartography: same document), so importing the
 * same archive twice restores nothing the second time.
 *
 * @param {File | Blob | string} source archive file (or its text, in tests)
 * @param {{
 *   cartoStore?: ReturnType<typeof createCartoStore>,
 *   portfolioStore?: ReturnType<typeof createPortfolioStore>,
 *   interfaceStore?: ReturnType<typeof createInterfaceStore>,
 * }} [options]
 * @returns {Promise<{portfolios: number, cartographies: number, jeux: number, jeuxError?: string}>}
 *   restored counts (jeux: datasets of the cartography interface created or
 *   completed; jeuxError: their store could not be written — the rest is restored)
 * @throws {Error} French message (invalid JSON, wrong kind, schema errors)
 */
export async function importArchive(source, options = {}) {
  const cartoStore = options.cartoStore ?? createCartoStore()
  const portfolioStore = options.portfolioStore ?? createPortfolioStore()
  const interfaceStore = options.interfaceStore ?? createInterfaceStore()

  const text = typeof source === 'string' ? source : await source.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Ce fichier n’est pas un JSON valide.')
  }
  if (!data || typeof data !== 'object' || data.kind !== 'archive-export') {
    throw new Error(
      'Document non reconnu : une archive humanome doit porter « kind: archive-export » ' +
        '(export produit par « Exporter toutes mes données »).',
    )
  }
  const { valid, errors } = validateDocument('archive-export', data)
  if (!valid) {
    const error = new Error(
      `Archive non conforme au schéma archive-export (${errors.length} ` +
        `erreur${errors.length > 1 ? 's' : ''}) : rien n’a été importé.`,
    )
    error.validationErrors = errors
    throw error
  }

  // Portfolios: dedupe by full text (existing store + within the archive).
  const existingPortfolios = await portfolioStore.list()
  const knownTexts = new Set(existingPortfolios.map((p) => p.texte))
  let restoredPortfolios = 0
  for (const portfolio of data.portfolios) {
    const nettoye = retirerMarquesTwin9(portfolio.texte)
    const texte = nettoye.texte
    if (knownTexts.has(texte)) continue
    knownTexts.add(texte)
    await portfolioStore.create({
      titre: portfolio.titre,
      source: portfolio.source,
      texte,
      segments: portfolio.segmentation.map((s) => {
        const debut = nettoye.position(s.debut)
        const fin = nettoye.position(s.fin)
        return { date: s.date, texte: texte.slice(debut, fin), debut, fin }
      }),
    })
    restoredPortfolios += 1
  }

  // Cartographies: dedupe by document content.
  const existingEntries = await cartoStore.listCartographies()
  const knownDocuments = new Set(existingEntries.map((entry) => JSON.stringify(entry.document)))
  let restoredCartographies = 0
  for (const item of data.cartographies) {
    const key = JSON.stringify(item.document)
    if (knownDocuments.has(key)) continue
    knownDocuments.add(key)
    await cartoStore.saveCartography({
      type: item.type,
      titre: importedTitre(item),
      visibility: 'privee', // the server copy / visibility is never imported: opt-in only (§6.2)
      document: item.document,
      promptPackage:
        item.promptPackageId === UNKNOWN_ID
          ? null
          : { id: item.promptPackageId, version: item.promptPackageVersion },
      referentiel:
        item.referentielId === UNKNOWN_ID
          ? null
          : { id: item.referentielId, version: item.referentielVersion },
      runMeta: item.runMeta ?? null,
      serverId: null,
    })
    restoredCartographies += 1
  }

  // Interface de cartographie (archive 1.1.0) : la chaîne d'import de
  // l'interface elle-même. Un jeu de même identifiant est complété (ce qui
  // est déjà là gagne, doublons ignorés), sinon il est créé.
  let restoredJeux = 0
  const result = { portfolios: restoredPortfolios, cartographies: restoredCartographies, jeux: 0 }
  if (!(data.jeuxCartographie ?? []).length) return result
  try {
    const knownDatasets = new Set((await interfaceStore.listDatasets()).map((d) => d.datasetId))
    for (const master of data.jeuxCartographie) {
      const existing = knownDatasets.has(master.datasetId) ? await interfaceStore.loadDataset(master.datasetId) : null
      const base =
        existing ?? createDataset({ datasetId: master.datasetId, title: master.title, referential: master.referential, now: master.createdAt })
      const res = await importIntoInterface([{ path: `${master.datasetId}.json`, text: JSON.stringify(master) }], base)
      const added =
        res.counts.daysAdded + res.counts.variantsAdded + res.counts.portfolioDays > 0 || res.report.some((r) => r.code === 'etat-restaure')
      if (existing && !added) continue
      await interfaceStore.commit(res)
      knownDatasets.add(master.datasetId)
      restoredJeux += 1
    }
  } catch (error) {
    result.jeuxError = String(error?.message ?? error)
  }
  result.jeux = restoredJeux
  return result
}
