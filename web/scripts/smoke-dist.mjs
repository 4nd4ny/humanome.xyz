// Smoke test of the BUILT bundle (dist/) under the file:// target (ADR-003,
// ADR-009): checks what INSTALL.md §4 promises of web/dist opened without a
// server.
//
// Static checks first, so that they are reported even if the bundle fails:
// the site map for AI and crawlers (sprint 11, prebuild build-site-map.mjs,
// copied from public/) is in dist/ and not empty; the entry is a relative
// classic script (type="module" is CORS-blocked on file://), deferred or
// placed after #root (the harness runs the bundle itself, after parsing).
//
// Then dist/index.html runs in jsdom at a file:// URL and the IIFE bundle is
// evaluated as built. Every network call is recorded with the phase in
// progress, then refused, as a browser refuses fetch on file:// (TypeError
// "Failed to fetch"):
//   1. bundle evaluation and home (#/): rendered, its CSS injected by the
//      bundle, no request;
//   2. public referential (#/referentiel): the embedded RESPIRE v7, no read
//      attempted (UC-VIS-02 A6);
//   3. historical day view (#/jour/<iso>): its file:// message, no request
//      (UC-VIS-01 E3);
//   4. cartography (#/cartographie): the import screen, no request; its demo
//      is read from the site (D-67), so « Explorer la démonstration » only
//      tries data/demo/… and says to import one's own files instead;
//   5. back to the home page, then « Ouvrir mes fichiers de cartographie »
//      with three versioned day fixtures: the interface opens and draws their
//      sun, without any request, through the store's IndexedDB adapter (the
//      one every browser takes; jsdom has no IndexedDB: fake-indexeddb, an
//      in-memory implementation of the API, stands in for it);
//   6. export space (#/cartographie/export) of these files: « Télécharger la
//      copie » reads its template next to index.html, so from a file it says
//      the copy is prepared on the site or a local server, and tries nothing.
// Last, once no request has come for a while, a global check: from the
// bundle's evaluation to the end, no request outside the demo phase (late
// reads and those between two steps included). Any jsdom error or
// console.error fails the run.
//
// Not exercised: the retired #/merge address (D-38). Its redirect calls
// history.replaceState, which jsdom 25 refuses for every file:// URL (it
// compares the two URL paths by reference); browsers accept it (a fragment
// change only). The redirect is covered by the router and App tests.
//
// Usage: npm run build && npm run test:dist
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(webRoot, 'dist')
const fixturesDir = join(webRoot, '..', 'schemas', 'fixtures')
const html = readFileSync(join(distDir, 'index.html'), 'utf8')

let failed = 0
function check(ok, label) {
  if (!ok) failed += 1
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`)
  return ok
}
function finish() {
  if (failed > 0) {
    console.error(`\nSmoke test dist/ : ${failed} échec(s)`)
    process.exit(1)
  }
  console.log('\nSmoke test dist/ : OK — le bundle s’ouvre depuis file://, sans serveur ni réseau')
  process.exit(0)
}

// ---- Static checks ---------------------------------------------------------

// Site map files (scripts/build-site-map.mjs): present, non-empty.
for (const name of ['llms.txt', 'llms-full.txt', 'sitemap.xml', 'robots.txt', 'legal/confidentialite.md']) {
  const path = join(distDir, name)
  const size = existsSync(path) ? statSync(path).size : 0
  check(size > 0, `carte du site : ${name} (${size} octets)`)
}

// The entry must be a relative classic script (vite.config.js: base './',
// classicScriptTags): a module script is CORS-blocked on file://, an absolute
// /assets/… path points to the root of the disk.
const moduleTag = html.match(/<script[^>]*type="module"[^>]*>/)
check(!moduleTag, `script d’entrée classique, pas de module${moduleTag ? ` (trouvé : ${moduleTag[0]})` : ''}`)
const scriptMatch = html.match(/<script[^>]*src="(\.\/[^"]+\.js)"[^>]*><\/script>/)
if (!check(Boolean(scriptMatch), 'script d’entrée en chemin relatif (./assets/…)')) finish()
// The bundle calls createRoot(document.getElementById('root')) as soon as it
// runs: a classic script in <head> must be deferred (classicScriptTags), or
// placed after #root, else the page stays blank (React error #299). Below,
// the harness evaluates the bundle itself once the whole document is parsed,
// so only this static check sees where and when a browser runs it. `async`
// does not count: it may run before #root is parsed.
const entryTag = scriptMatch[0]
const rootAt = html.search(/<div[^>]*\bid="root"/)
const deferred = /<script\b[^>]*\sdefer(?:[\s=>]|$)/.test(entryTag)
const afterRoot = rootAt >= 0 && scriptMatch.index > rootAt
check(deferred || afterRoot, `script d’entrée exécuté après l’analyse de #root (defer, ou placé après) : ${entryTag}`)
const bundle = readFileSync(join(distDir, scriptMatch[1]), 'utf8')

// ---- The bundle under file:// ----------------------------------------------

const pageErrors = []
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (error) => pageErrors.push(error.message))
virtualConsole.on('error', (...args) => pageErrors.push(args.map(String).join(' ')))

const dom = new JSDOM(html, {
  url: `${pathToFileURL(join(distDir, 'index.html')).href}#/`,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
})
const { window } = dom
const doc = window.document

// file:// reality: no network. Each attempt is recorded with the phase in
// progress (set before each step, and before the bundle is evaluated), then
// refused as a browser refuses it (jsdom's own XHR could read file: URLs:
// replaced too).
const DEMO_PHASE = 'démonstration'
let phase = 'évaluation du bundle et accueil'
const requests = []
const record = (url) => requests.push({ url: String(url), phase })
window.fetch = (input) => {
  record(input?.url ?? input)
  return Promise.reject(new window.TypeError('Failed to fetch'))
}
window.XMLHttpRequest = class {
  open(method, url) {
    record(url)
  }
  setRequestHeader() {}
  addEventListener() {}
  abort() {}
  send() {
    throw new window.DOMException('file:// : pas de réseau', 'NetworkError')
  }
}

// Standard APIs that every target browser has and jsdom 25 lacks (they are
// Node globals, which a jsdom window does not see). IndexedDB: without it,
// the cartography store (carto/core/store.js, defaultAdapter) would take its
// in-memory adapter, which no browser takes.
window.indexedDB = new IDBFactory()
window.IDBKeyRange = IDBKeyRange
window.TextEncoder ??= TextEncoder
window.TextDecoder ??= TextDecoder
window.structuredClone ??= structuredClone
window.Blob.prototype.arrayBuffer ??= function arrayBuffer() {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new window.FileReader()
    reader.onload = () => resolveRead(reader.result)
    reader.onerror = () => rejectRead(reader.error)
    reader.readAsArrayBuffer(this)
  })
}

/** Polls `predicate` (React 18 renders asynchronously) until truthy or timeout. */
async function waitFor(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout
  for (;;) {
    let value = null
    try {
      value = predicate()
    } catch {
      value = null
    }
    if (value) return value
    if (Date.now() > deadline) return null
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
}

/** Hash navigation, as the app's own router.navigate() does. */
function go(hash) {
  window.location.hash = hash
}

/** Waits until no new request has come for `quiet` ms (late reads, at most `timeout`). */
async function settle(quiet = 300, timeout = 5000) {
  const deadline = Date.now() + timeout
  let count = requests.length
  let since = Date.now()
  while (Date.now() - since < quiet && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    if (requests.length !== count) {
      count = requests.length
      since = Date.now()
    }
  }
}

/** URLs of the requests attempted during phase `name`. */
const attemptedIn = (name) => requests.filter((r) => r.phase === name).map((r) => r.url)

/** Checks that no request was attempted during the current phase. */
function noRequest() {
  const attempted = attemptedIn(phase)
  check(attempted.length === 0, `aucune requête (${phase})${attempted.length ? ` : ${attempted.join(', ')}` : ''}`)
}

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

// 1. Bundle evaluation and home: requests emitted while the bundle runs count.
window.eval(bundle)
check(await waitFor(() => doc.querySelector('.home-title')), 'accueil rendu')
check(
  [...doc.querySelectorAll('a[href="#/cartographie"]')].some((a) => text(a) === 'Explorer la cartographie de démonstration'),
  'accueil : « Explorer la cartographie de démonstration » mène à #/cartographie',
)
check(doc.querySelector('input[type="file"][aria-label="Ouvrir mes fichiers de cartographie"]'), 'accueil : « Ouvrir mes fichiers de cartographie »')
check(doc.querySelector('style')?.textContent.includes('.app-header'), 'CSS injectée dans <style> par le bundle')
noRequest()

// 2. Public referential: the copy embedded in the bundle (RESPIRE v7: 7 poles,
// 61 competences, one permalink each).
phase = 'référentiel'
go('#/referentiel')
const permalinks = await waitFor(() => {
  const links = doc.querySelectorAll('a[href^="#/referentiel/"]')
  return links.length > 0 ? links : null
})
check(permalinks?.length === 61, `référentiel embarqué : ${permalinks?.length ?? 0} compétences (attendu 61)`)
noRequest()

// 3. Historical day view: not available from a file (relative fetch), it says so.
phase = 'vue journée'
go('#/jour/2026-01-05')
check(
  await waitFor(() => text(doc.querySelector('main')).includes('disponible sur le site en ligne ou via un serveur local')),
  'vue journée : message file://',
)
noRequest()

// 4. Cartography, empty: the import screen; the demo cannot be read from a file.
phase = 'cartographie'
go('#/cartographie')
check(await waitFor(() => doc.querySelector('section[aria-label="Importer des fichiers"]')), 'cartographie : écran d’import')
noRequest()
const demoButton = [...doc.querySelectorAll('button')].find((b) => text(b) === 'Explorer la démonstration')
if (check(Boolean(demoButton), 'cartographie : « Explorer la démonstration »')) {
  phase = DEMO_PHASE
  demoButton.click()
  check(
    await waitFor(() => text(doc.querySelector('.carto-error[role="alert"]')).includes('copie ouverte directement depuis le disque')),
    'démonstration : message « importez vos fichiers à la place »',
  )
  // Its reads may come after its message: wait for them before the next phase.
  await settle()
  const attempted = attemptedIn(DEMO_PHASE)
  check(
    attempted.length > 0 && attempted.every((url) => url.startsWith('data/demo/')),
    `démonstration : seules les lectures data/demo/… tentées (${attempted.join(', ') || 'aucune'})`,
  )
}

// 5. Home « Ouvrir mes fichiers de cartographie » with the three versioned day
// fixtures: the interface opens (#/cartographie) and draws their sun. The
// fixtures observe these 12 competences, in all 7 RESPIRE poles, over 3 days.
const FIXTURES = ['2026-01-05', '2026-01-06', '2026-01-07'].map((d) => `cartographie-jour-${d}.json`)
const CARTO_DB = 'humanome-carto-v4' // carto/core/store.js, DB_NAME
const EXPECTED_CODES = ['1.01', '1.03', '2.01', '2.02', '2.06', '3.04', '3.07', '4.05', '5.01', '5.03', '6.07', '7.01']
phase = 'retour à l’accueil'
go('#/')
const homeInput = await waitFor(() => doc.querySelector('input[type="file"][aria-label="Ouvrir mes fichiers de cartographie"]'))
noRequest()
phase = 'ouverture des fichiers'
if (check(Boolean(homeInput), 'accueil : sélecteur de fichiers')) {
  const files = FIXTURES.map((name) => new window.File([readFileSync(join(fixturesDir, name), 'utf8')], name, { type: 'application/json' }))
  Object.defineProperty(homeInput, 'files', { configurable: true, value: files })
  homeInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  const sectors = await waitFor(() => {
    const paths = doc.querySelectorAll('[data-tile="sun"] .carto-sun path[role="button"]')
    return paths.length > 0 ? [...paths].map((p) => p.getAttribute('aria-label') ?? '') : null
  })
  check(window.location.hash === '#/cartographie', `fichiers ouverts dans la cartographie (${window.location.hash})`)
  const poles = (sectors ?? []).filter((label) => label.startsWith('Pôle '))
  const codes = (sectors ?? []).filter((label) => /^\d\.\d\d /.test(label)).map((label) => label.slice(0, 4))
  check(poles.length === 7, `soleil : ${poles.length} pôles (attendu 7)`)
  check(
    codes.join(' ') === EXPECTED_CODES.join(' '),
    `soleil : ${codes.length} compétences des fixtures (attendu ${EXPECTED_CODES.length}${codes.join(' ') === EXPECTED_CODES.join(' ') ? '' : ` : ${EXPECTED_CODES.join(' ')} ; lu : ${codes.join(' ') || 'aucune'}`})`,
  )
  check(text(doc.querySelector('[data-tile="sun"] .carto-sun-center')).includes('3 j.'), 'soleil : 3 journées')
  const databases = (await window.indexedDB.databases()).map((d) => d.name)
  check(databases.includes(CARTO_DB), `stockage : base IndexedDB ${CARTO_DB} (${databases.join(', ') || 'aucune'})`)
  noRequest()

  // 6. Export space: the standalone copy's template (carto/viewer-template.html)
  // is read next to index.html, which a file cannot do: it says so.
  phase = 'export de la copie autonome'
  go('#/cartographie/export')
  const copyButton = await waitFor(() => [...doc.querySelectorAll('.carto-export button')].find((b) => text(b) === 'Télécharger la copie'))
  if (check(Boolean(copyButton), 'export : « Télécharger la copie »')) {
    copyButton.click()
    const alert = await waitFor(() => [...doc.querySelectorAll('.carto-export [role="alert"]')].map(text).find(Boolean))
    check(
      alert?.includes('se prépare sur le site en ligne ou via un serveur local'),
      `copie autonome : message « sur le site en ligne ou via un serveur local » (${alert ?? 'aucun message'})`,
    )
    noRequest()
  }
}

// Global: from the bundle's evaluation to the end, once no request has come
// for a while, nothing outside the demo phase (whose reads, all data/demo/…,
// are checked at step 4): a request between two steps, or after the last
// one, is attributed to the phase in progress and fails here.
phase = 'fin'
await settle()
const outside = requests.filter((r) => r.phase !== DEMO_PHASE)
check(
  outside.length === 0,
  `aucune requête hors la démonstration, de l’évaluation du bundle à la fin${outside.length ? ` : ${outside.map((r) => `${r.url} (${r.phase})`).join(', ')}` : ''}`,
)

check(pageErrors.length === 0, `aucune erreur de page${pageErrors.length ? ` : ${pageErrors.join(' | ').slice(0, 2000)}` : ''}`)
window.close()
finish()
