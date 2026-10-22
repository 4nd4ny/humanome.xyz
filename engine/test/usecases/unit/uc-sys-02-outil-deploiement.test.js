// UC-SYS-02 — Déployer, migrer et importer : tests FONCTIONNELS de l'outil de
// déploiement (scripts/deploy/deploy.mjs), exécuté en SOUS-PROCESSUS.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-02-deployer-migrer.md
//
// deploy.mjs n'exporte rien et appelle main() dès son chargement : il est
// copié dans un dossier temporaire qui tient lieu de dépôt (le script résout
// .env.deploy, build/, web/ et api/deploy/webroot/ depuis son propre
// emplacement : rien n'est lu ni écrit dans le dépôt partagé). Aucun vrai FTP :
// un FAUX module `basic-ftp` (node_modules/ du dossier temporaire, là où le
// script le résout) journalise chaque appel et simule l'arborescence distante
// dans un fichier d'état JSON. Aucun site distant : SITE_URL pointe sur un
// serveur HTTP local (127.0.0.1, port éphémère) qui journalise les requêtes
// et répond ce que le test a scripté. Identifiants et jetons factices.
// stage-twin9.mjs (T18) est exécuté de même, sur un FAUX dépôt Twin_v9 (git
// local, sources fictives) : aucun moteur réel n'est lu. stage-api.sh aussi,
// copié dans un dossier temporaire, avec de faux node, composer et git devant
// le PATH, pour son contrôle final « pas de Python en production » (F26).
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 60_000
const MIGRATE_TOKEN = 'jeton-migrate-test'

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Faux `basic-ftp` : même API que la classe Client utilisée par deploy.mjs. */
const FAKE_BASIC_FTP = `// Faux module basic-ftp (test UC-SYS-02) : aucun réseau.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const LOG = process.env.FAKE_FTP_LOG
const STATE = process.env.FAKE_FTP_STATE
const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { files: {}, releases: [] })
const save = (state) => writeFileSync(STATE, JSON.stringify(state))
const record = (entry) => appendFileSync(LOG, JSON.stringify(entry) + '\\n')

async function readSource(source) {
  if (typeof source === 'string') return readFileSync(source, 'utf8')
  let text = ''
  for await (const chunk of source) text += chunk
  return text
}

export class Client {
  constructor(timeout) { record({ op: 'new', timeout }) }
  async access({ host, user, password, secure, secureOptions }) {
    record({ op: 'access', host, user, password, secure, secureOptions })
  }
  async cd(path) { record({ op: 'cd', path }) }
  async ensureDir(path) { record({ op: 'ensureDir', path }) }
  async uploadFrom(source, path) {
    const text = await readSource(source)
    record({ op: 'uploadFrom', path, text, source: typeof source === 'string' ? 'file' : 'stream' })
    const state = load()
    state.files[path] = text
    const release = /^app\\/releases\\/([^/]+)\\//.exec(path)
    if (release && !state.releases.includes(release[1])) state.releases.push(release[1])
    save(state)
  }
  async list(path) {
    record({ op: 'list', path })
    const state = load()
    if (state.listError) throw new Error(state.listError)
    if (path !== 'app/releases') return []
    return [
      ...state.releases.map((name) => ({ name, isDirectory: true })),
      ...(state.releaseFiles ?? []).map((name) => ({ name, isDirectory: false })),
    ]
  }
  async removeDir(path) {
    record({ op: 'removeDir', path })
    const state = load()
    state.releases = state.releases.filter((name) => 'app/releases/' + name !== path)
    save(state)
  }
  async remove(path) {
    record({ op: 'remove', path })
    const state = load()
    if ((state.removeFails ?? []).includes(path)) throw new Error('550 Permission denied (faux FTP)')
    delete state.files[path]
    save(state)
  }
  async downloadTo(sink, path) {
    record({ op: 'downloadTo', path })
    const state = load()
    if (!(path in state.files)) throw new Error('550 No such file (faux FTP)')
    await new Promise((resolve, reject) => sink.write(Buffer.from(state.files[path]), (e) => (e ? reject(e) : resolve())))
  }
  close() { record({ op: 'close' }) }
}
`

/** Contenu de .env.deploy (valeurs factices) ; `null` = ligne omise. */
function envDeploy(overrides = {}) {
  const values = {
    FTP_HOST: 'ftp.exemple.test',
    FTP_USER: 'deployeur-test',
    FTP_PASSWORD: 'mdp-factice-test',
    FTP_SECURE: 'false',
    ...overrides,
  }
  return ['# identifiants FACTICES (test)', ...Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n'
}

/**
 * « Dépôt » temporaire : scripts/deploy/deploy.mjs (copie octet à octet) + faux
 * basic-ftp. `env` : contenu de .env.deploy (absent si null) ; `files` :
 * {chemin relatif: contenu} ; `webroot` : copie de api/deploy/webroot/ ;
 * `remote` : état initial du faux FTP.
 */
function makeCheckout({ env = null, files = {}, webroot = false, remote = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'uc-sys-02-'))
  tempDirs.push(root)
  mkdirSync(join(root, 'scripts/deploy'), { recursive: true })
  cpSync(join(REPO, 'scripts/deploy/deploy.mjs'), join(root, 'scripts/deploy/deploy.mjs'))
  const fake = join(root, 'scripts/deploy/node_modules/basic-ftp')
  mkdirSync(fake, { recursive: true })
  writeFileSync(join(fake, 'package.json'), JSON.stringify({ name: 'basic-ftp', version: '0.0.0-test', type: 'module', main: 'index.js' }))
  writeFileSync(join(fake, 'index.js'), FAKE_BASIC_FTP)
  if (env !== null) writeFileSync(join(root, '.env.deploy'), env)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  if (webroot) cpSync(join(REPO, 'api/deploy/webroot'), join(root, 'api/deploy/webroot'), { recursive: true })
  const state = join(root, 'ftp-state.json')
  writeFileSync(state, JSON.stringify({ files: {}, releases: [], ...remote }))
  return { root, log: join(root, 'ftp-calls.jsonl'), state }
}

/** `node scripts/deploy/deploy.mjs <args>` (asynchrone : le site local tourne dans CE processus). */
function deploy(checkout, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(checkout.root, 'scripts/deploy/deploy.mjs'), ...args], {
      cwd: checkout.root,
      env: { PATH: process.env.PATH ?? '', NO_PROXY: '127.0.0.1,localhost', FAKE_FTP_LOG: checkout.log, FAKE_FTP_STATE: checkout.state, ...extraEnv },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

/** Appels reçus par le faux client FTP, dans l'ordre. */
function ftpCalls(checkout) {
  if (!existsSync(checkout.log)) return []
  return readFileSync(checkout.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
}
const remoteState = (checkout) => JSON.parse(readFileSync(checkout.state, 'utf8'))
const uploads = (checkout) => ftpCalls(checkout).filter((c) => c.op === 'uploadFrom')

/**
 * Site distant simulé. `respond(req)` → [status, corps] ; chaque requête est
 * journalisée avec le nombre d'appels FTP déjà faits à cet instant.
 */
async function withSite(checkout, respond, run) {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const entry = {
        method: req.method,
        url: req.url,
        token: req.headers['x-migrate-token'] ?? null,
        body,
        ftpCallsBefore: ftpCalls(checkout).length,
      }
      requests.push(entry)
      const [status, text] = respond(entry)
      res.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
      res.end(text)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(`http://127.0.0.1:${server.address().port}`, requests)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const RELEASES = ['20260901-120000-v1', '20260915-080000-v2', '20260928-090000-v3']

describe('UC-SYS-02 — outil de déploiement deploy.mjs (sous-processus, faux FTP, site local)', () => {
  it('UC-SYS-02-F19 — E12 : cible inconnue → code 2 avant toute lecture de .env.deploy ; .env.deploy absent ou incomplet → code 1 ; build/api-release ou web/dist absent → code 1 ; jamais de connexion FTP', async () => {
    // Cible inconnue (ou absente) : code 2, même sans .env.deploy.
    const bare = makeCheckout()
    for (const [args, name] of [[['bogus'], 'bogus'], [[], 'undefined']]) {
      const unknown = await deploy(bare, args)
      expect(unknown.status).toBe(2)
      expect(unknown.stderr).toBe(`Unknown target "${name}". Available: static, api\n`)
      expect(unknown.stdout).toBe('')
    }

    // .env.deploy absent : chaque cible échoue (ENOENT), code 1.
    for (const target of ['static', 'api', 'rollback', 'releases']) {
      const missing = await deploy(bare, [target])
      expect(missing.status, target).toBe(1)
      expect(missing.stderr, target).toMatch(/^deploy failed: ENOENT: no such file or directory, open '.*\.env\.deploy'\n$/)
    }
    expect(ftpCalls(bare)).toEqual([])

    // .env.deploy incomplet : FTP_HOST, FTP_USER, FTP_PASSWORD exigés (ligne
    // commentée ou valeur vide = absente), contrôlés dans cet ordre.
    const incomplete = [
      [envDeploy({ FTP_HOST: null }).replace('# identifiants', '# FTP_HOST=ftp.commentaire.test\n# identifiants'), 'FTP_HOST'],
      [envDeploy({ FTP_USER: '' }), 'FTP_USER'],
      [envDeploy({ FTP_PASSWORD: null }), 'FTP_PASSWORD'],
    ]
    for (const [env, key] of incomplete) {
      const checkout = makeCheckout({ env, files: { 'web/dist/index.html': '<!doctype html>' } })
      const result = await deploy(checkout, ['static'])
      expect(result.status, key).toBe(1)
      expect(result.stderr, key).toBe(`deploy failed: ${key} missing in .env.deploy\n`)
      expect(ftpCalls(checkout), key).toEqual([])
    }

    // Artefacts locaux absents : code 1, aucun client FTP créé.
    const unbuilt = makeCheckout({ env: envDeploy() })
    const api = await deploy(unbuilt, ['api'])
    expect(api.status).toBe(1)
    expect(api.stderr).toBe('deploy failed: build/api-release missing — run scripts/deploy/stage-api.sh first\n')
    const front = await deploy(unbuilt, ['static'])
    expect(front.status).toBe(1)
    expect(front.stderr).toBe('deploy failed: Missing local dir: web/dist (build first?)\n')
    expect(ftpCalls(unbuilt)).toEqual([])
  }, TIMEOUT)

  it('UC-SYS-02-F20 — A6, AN-5 : rollback réécrit current.txt vers l’avant-dernière release PAR NOM sans lire current.txt (active = la plus ancienne → pointée sur une plus récente ; second rollback identique) ; santé seulement affichée (503 → code 0) ; moins de 2 releases → code 1 ; releases marque la release pointée', async () => {
    const checkout = makeCheckout({
      remote: {
        files: { 'app/current.txt': `releases/${RELEASES[0]}\n` },
        releases: [RELEASES[2], RELEASES[0], RELEASES[1]], // ordre de listage quelconque
        releaseFiles: ['zzz-notes.txt'], // fichier : ignoré
      },
    })
    await withSite(checkout, () => [503, '{"status":"error","message":"Release entry point missing"}'], async (base, requests) => {
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base }))

      // COMPORTEMENT ACTUEL (AN-5) : l'active est la plus ancienne (A), et
      // pourtant current.txt est réécrit vers B, plus récente — jamais lu.
      const first = await deploy(checkout, ['rollback'])
      expect(first.stderr).toBe('')
      expect(first.status).toBe(0) // santé en 503 : seulement affichée
      expect(first.stdout).toBe(
        `rolled back: current.txt -> releases/${RELEASES[1]}\n`
        + 'health after rollback: HTTP 503 {"status":"error","message":"Release entry point missing"}\n',
      )
      expect(ftpCalls(checkout)).toEqual([
        { op: 'new', timeout: 30000 },
        { op: 'access', host: 'ftp.exemple.test', user: 'deployeur-test', password: 'mdp-factice-test', secure: false, secureOptions: { rejectUnauthorized: true } },
        { op: 'cd', path: '/' },
        { op: 'list', path: 'app/releases' },
        { op: 'uploadFrom', path: 'app/current.txt', text: `releases/${RELEASES[1]}\n`, source: 'stream' },
        { op: 'close' },
      ])
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/health'])
      expect(requests[0].ftpCallsBefore).toBe(6) // sondage après la fermeture FTP

      // Second rollback : même cible (ne recule pas d'un cran).
      const second = await deploy(checkout, ['rollback'])
      expect(second.status).toBe(0)
      expect(uploads(checkout).map((u) => u.text)).toEqual([`releases/${RELEASES[1]}\n`, `releases/${RELEASES[1]}\n`])

      // `releases` : liste triée, `*` sur la release pointée.
      const listed = await deploy(checkout, ['releases'])
      expect(listed.status).toBe(0)
      expect(listed.stdout).toBe(
        `current: releases/${RELEASES[1]}\n    ${RELEASES[0]}\n  * ${RELEASES[1]}\n    ${RELEASES[2]}\n`,
      )
      expect(ftpCalls(checkout).at(-2)).toEqual({ op: 'downloadTo', path: 'app/current.txt' })
    })

    // Pointeur illisible : « (none) ». FTPS demandé dès que FTP_SECURE ≠ "false".
    const unpointed = makeCheckout({ env: envDeploy({ FTP_SECURE: null }), remote: { releases: [RELEASES[0]] } })
    const none = await deploy(unpointed, ['releases'])
    expect(none.status).toBe(0)
    expect(none.stdout).toBe(`current: (none)\n    ${RELEASES[0]}\n`)
    expect(ftpCalls(unpointed)[1]).toMatchObject({ op: 'access', secure: true, secureOptions: { rejectUnauthorized: true } })

    // Moins de 2 releases (listage en échec = 0) : code 1, pointeur intact, aucun sondage.
    for (const remote of [{ releases: [RELEASES[0]] }, { listError: '550 Permission denied (faux FTP)' }]) {
      const lone = makeCheckout({ env: envDeploy(), remote })
      const result = await deploy(lone, ['rollback'])
      expect(result.status).toBe(1)
      expect(result.stderr).toBe(`deploy failed: need >= 2 releases to roll back, found ${remote.releases?.length ?? 0}\n`)
      expect(uploads(lone)).toEqual([])
      expect(ftpCalls(lone).at(-1)).toEqual({ op: 'close' })
    }
  }, TIMEOUT)

  it('UC-SYS-02-F21 — Nominal étapes 3 à 9 (RG6) : release téléversée sous un nom assaini, front-controller, PUIS current.txt, la session FTP fermée ; migrate AUSSITÔT, puis l’élagage à 3 (une seconde session), puis la suite distante (référentiel présent seulement, seed, paquets .json, santé) ; migrate en échec → arrêt, pointeur basculé, rien d’élagué ; seed en échec (E11) → arrêt, pointeur déjà basculé ; sans MIGRATE_TOKEN → élagage et santé seuls ; santé sans "ok" → code 1', async () => {
    const files = {
      'build/api-release/VERSION': 'v1.4.0-2-gabc123/dirty\n',
      'build/api-release/public/index.php': '<?php // release factice (test)\n',
      'build/api-release/src/App.php': '<?php // source factice (test)\n',
      // Seule la 7.1.0 est présente sur le poste : la 7.0.0 est sautée en silence.
      'web/public/data/referentiel/respire-v7.1.0.json': '{"id":"respire","version":"7.1.0","test":true}',
      'build/prompt-packages/a-paquet.json': '{"id":"paquet-a","test":true}',
      'build/prompt-packages/b-paquet.json': '{"id":"paquet-b","test":true}',
      'build/prompt-packages/LISEZMOI.txt': 'ignoré (test)',
    }
    // Noms antérieurs à toute horloge plausible : la nouvelle release trie en dernier.
    const older = ['20200101-000000-v0', '20200201-000000-v0']
    const active = '20200301-000000-v0'
    const checkout = makeCheckout({ files, webroot: true, remote: { files: { 'app/current.txt': `releases/${active}\n` }, releases: [...older, active] } })
    const replies = {
      'POST /api/admin/migrate': [200, '{"applied":[],"skipped":27}'],
      'POST /api/admin/import-referentiel': [200, '{"status":"unchanged"}'],
      'POST /api/admin/seed-competences': [200, '{"poles":7,"imported":0}'],
      'POST /api/admin/import-prompt-package': [200, '{"status":"unchanged"}'],
      // Le smoke ne regarde ni `db` ni les migrations : `"ok"` suffit.
      'GET /api/health': [200, '{"status":"ok","version":"test","db":"error"}'],
    }
    await withSite(checkout, (r) => replies[`${r.method} ${r.url}`], async (base, requests) => {
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base, MIGRATE_TOKEN }))
      const result = await deploy(checkout, ['api'])
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(result.stdout.trimEnd().split('\n').at(-1)).toBe('api deploy done')

      const release = uploads(checkout)[0].path.split('/')[2]
      expect(release).toMatch(/^\d{8}-\d{6}-v1\.4\.0-2-gabc123_dirty$/) // « / » assaini
      expect(`releases/${release}`).toMatch(/^releases\/[A-Za-z0-9._-]+$/) // motif du front-controller
      expect(uploads(checkout).map((u) => u.path)).toEqual([
        `app/releases/${release}/VERSION`,
        `app/releases/${release}/public/index.php`,
        `app/releases/${release}/src/App.php`,
        'www/api/.htaccess',
        'www/api/index.php',
        'app/current.txt', // pointeur écrit APRÈS la release et le front-controller
      ])
      expect(uploads(checkout).at(-1)).toMatchObject({ text: `releases/${release}\n`, source: 'stream' })
      // Le pointeur écrit, la session se ferme ; l'élagage vient dans une seconde session, APRÈS la migration :
      // 4 releases → les 3 plus récentes gardées (ordre des noms).
      const ops = ftpCalls(checkout)
      const pointeur = ops.findIndex((c) => c.path === 'app/current.txt')
      expect(ops.slice(pointeur + 1).map((c) => c.op)).toEqual(['close', 'new', 'access', 'cd', 'list', 'removeDir', 'cd', 'close'])
      expect(ops.slice(pointeur + 5)).toEqual([
        { op: 'list', path: 'app/releases' },
        { op: 'removeDir', path: `app/releases/${older[0]}` },
        { op: 'cd', path: '/' },
        { op: 'close' },
      ])
      expect(remoteState(checkout).releases.sort()).toEqual([older[1], active, release])

      // Séquence distante, jeton en en-tête, jamais pendant une session FTP (RG6) : la migration dès le pointeur
      // basculé — la nouvelle release ne tourne sur l'ancien schéma que le temps de cette requête —, le reste après
      // l'élagage.
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
        'POST /api/admin/migrate',
        'POST /api/admin/import-referentiel',
        'POST /api/admin/seed-competences',
        'POST /api/admin/import-prompt-package',
        'POST /api/admin/import-prompt-package',
        'GET /api/health',
      ])
      expect(requests[0].ftpCallsBefore).toBe(pointeur + 2)
      expect(requests.slice(1).every((r) => r.ftpCallsBefore === ops.length)).toBe(true)
      expect(requests.slice(0, -1).every((r) => r.token === MIGRATE_TOKEN)).toBe(true)
      expect(requests.at(-1).token).toBeNull()
      expect(requests[1].body).toBe(files['web/public/data/referentiel/respire-v7.1.0.json'])
      expect(requests.slice(3, 5).map((r) => r.body).sort()).toEqual([files['build/prompt-packages/a-paquet.json'], files['build/prompt-packages/b-paquet.json']])

      // Migration en échec : arrêt aussitôt, le pointeur DÉJÀ basculé, rien d'élagué (les releases précédentes
      // restent pour un retour arrière), ni import ni santé.
      replies['POST /api/admin/migrate'] = [500, '{"error":"Migration failed, see server log"}']
      requests.length = 0
      const avantMigration = ftpCalls(checkout).length
      const nonMigre = await deploy(checkout, ['api'])
      expect(nonMigre.status).toBe(1)
      expect(nonMigre.stderr).toBe('deploy failed: migration endpoint failed\n')
      expect(requests.map((r) => r.url)).toEqual(['/api/admin/migrate'])
      const opsNonMigre = ftpCalls(checkout).slice(avantMigration)
      expect(opsNonMigre.at(-1)).toEqual({ op: 'close' })
      expect(opsNonMigre.filter((c) => c.op === 'list' || c.op === 'removeDir')).toEqual([])
      expect(opsNonMigre.filter((c) => c.op === 'uploadFrom').at(-1).path).toBe('app/current.txt')
      replies['POST /api/admin/migrate'] = [200, '{"applied":[],"skipped":27}']

      // Seed en échec (E11) : arrêt avant paquets et santé ; le pointeur a DÉJÀ
      // basculé sur la nouvelle release. (Jusqu'au 2026-10-20, c'était le
      // garde-fou des fiches, generate-fiches, parti avec la copie qu'il gardait.)
      replies['POST /api/admin/seed-competences'] = [500, '{"error":"Seed failed: Gate de parité ÉCHOUÉ (test)"}']
      requests.length = 0
      const blocked = await deploy(checkout, ['api'])
      expect(blocked.status).toBe(1)
      expect(blocked.stderr).toBe('deploy failed: competence seed failed\n')
      expect(requests.map((r) => r.url)).toEqual(['/api/admin/migrate', '/api/admin/import-referentiel', '/api/admin/seed-competences'])
      expect(requests[1].ftpCallsBefore).toBe(ftpCalls(checkout).length) // FTP terminé (élagage compris) avant le refus
      const newest = uploads(checkout).at(-1)
      expect(newest.path).toBe('app/current.txt')
      expect(newest.text).toMatch(/^releases\/\d{8}-\d{6}-v1\.4\.0-2-gabc123_dirty\n$/)
      expect(remoteState(checkout).files['app/current.txt']).toBe(newest.text)

      // Sans MIGRATE_TOKEN : étapes 4 à 8 sautées sur un avertissement, l'élagage et la santé seuls.
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base }))
      requests.length = 0
      const avantSansJeton = ftpCalls(checkout).length
      const skipped = await deploy(checkout, ['api'])
      expect(skipped.status).toBe(0)
      expect(skipped.stderr).toBe('MIGRATE_TOKEN not set in .env.deploy — skipping remote migrations\n')
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/health'])
      // l'élagage passe (ce qu'il ôte dépend des noms des releases : à la seconde près, deux déploiements n'en font qu'une)
      const sansJeton = ftpCalls(checkout).slice(avantSansJeton).map((c) => c.op)
      const apresPointeur = sansJeton.slice(sansJeton.lastIndexOf('uploadFrom') + 1)
      expect(apresPointeur.slice(0, 5)).toEqual(['close', 'new', 'access', 'cd', 'list'])
      expect(apresPointeur.at(-1)).toBe('close')

      // Smoke : 200 sans la chaîne "ok" → code 1.
      replies['GET /api/health'] = [200, '{"status":"degraded"}']
      const unhealthy = await deploy(checkout, ['api'])
      expect(unhealthy.status).toBe(1)
      expect(unhealthy.stderr).toContain('deploy failed: health smoke failed\n')
    })
  }, TIMEOUT)

  it('UC-SYS-02-F22 — Nominal étape 1 : synchro static par manifeste — seuls les fichiers modifiés partent, seuls les fichiers de l’ancien manifeste disparus sont supprimés (échec = avertissement), manifeste écrit en dernier ; --dry-run ne transfère rien ; manifeste absent ou illisible → envoi complet sans suppression', async () => {
    const dist = {
      'web/dist/index.html': '<!doctype html><title>test</title>',
      'web/dist/assets/app-123.js': 'console.log("test")',
      'web/dist/.DS_Store': 'ignoré',
    }
    const sha = (text) => createHash('sha256').update(text).digest('hex')
    const previous = {
      'www/index.html': sha(dist['web/dist/index.html']), // inchangé
      'www/assets/app-000.js': 'ancien-hash', // disparu localement
      'www/assets/verrouille.css': 'ancien-hash', // disparu, suppression refusée
    }
    const checkout = makeCheckout({
      env: envDeploy(),
      files: dist,
      remote: {
        files: { 'www/.deploy-manifest.json': JSON.stringify(previous), 'www/robots.txt': 'hors manifeste' },
        removeFails: ['www/assets/verrouille.css'],
      },
    })

    // --dry-run : liste, aucun transfert, aucune suppression.
    const dry = await deploy(checkout, ['static', '--dry-run'])
    expect(dry.status).toBe(0)
    expect(dry.stdout).toBe(
      'local files: 2\nchanged: 1, to delete: 2\n  upload www/assets/app-123.js\n  delete www/assets/app-000.js\n  delete www/assets/verrouille.css\n',
    )
    expect(ftpCalls(checkout).filter((c) => ['uploadFrom', 'remove', 'ensureDir'].includes(c.op))).toEqual([])

    const real = await deploy(checkout, ['static'])
    expect(real.status).toBe(0)
    expect(real.stderr).toBe('  could not delete www/assets/verrouille.css: 550 Permission denied (faux FTP)\n')
    const ops = ftpCalls(checkout).slice(ftpCalls(checkout).findLastIndex((c) => c.op === 'new'))
    expect(ops.filter((c) => c.op !== 'access').map((c) => `${c.op} ${c.path ?? ''}`.trim())).toEqual([
      'new',
      'cd /',
      'downloadTo www/.deploy-manifest.json',
      'ensureDir /www/assets',
      'cd /',
      'uploadFrom www/assets/app-123.js',
      'remove www/assets/app-000.js',
      'remove www/assets/verrouille.css',
      'ensureDir /www',
      'cd /',
      'uploadFrom www/.deploy-manifest.json', // en dernier
      'close',
    ])
    const manifest = JSON.parse(remoteState(checkout).files['www/.deploy-manifest.json'])
    expect(manifest).toEqual({
      'www/index.html': sha(dist['web/dist/index.html']),
      'www/assets/app-123.js': sha(dist['web/dist/assets/app-123.js']),
    })
    expect(remoteState(checkout).files['www/robots.txt']).toBe('hors manifeste') // jamais supprimé
    expect(real.stdout).toContain('manifest written (2 entries) — deploy done')

    // Manifeste illisible puis absent : envoi complet, aucune suppression.
    for (const files of [{ 'www/.deploy-manifest.json': '{pas du json', 'www/assets/app-000.js': 'x' }, {}]) {
      const fresh = makeCheckout({ env: envDeploy(), files: dist, remote: { files } })
      const full = await deploy(fresh, ['static'])
      expect(full.status).toBe(0)
      expect(full.stdout).toContain('changed: 2, to delete: 0')
      expect(uploads(fresh).map((u) => u.path)).toEqual(['www/assets/app-123.js', 'www/index.html', 'www/.deploy-manifest.json'])
      expect(ftpCalls(fresh).some((c) => c.op === 'remove')).toBe(false)
    }
  }, TIMEOUT)
})

describe('UC-SYS-02 — le moteur Twin9 dans la release (T18)', () => {
  it('UC-SYS-02-F24 — T18 : une release qui embarque le moteur (Twin_v9/COMMIT) part sous app/releases, hors du webroot ; la santé doit le dire chargé, zlib compris — sinon code 1 : la release en ligne, le commit, les causes à vérifier (TWIN_V9_DIR, zlib), le retour arrière facultatif ; chargé : le commit embarqué, la suite (ses gabarits, du même commit), puis « api deploy done »', async () => {
    const commit = 'ab12'.repeat(10)
    const checkout = makeCheckout({
      webroot: true,
      files: {
        'build/api-release/VERSION': 'v1.5.0\n',
        'build/api-release/public/index.php': '<?php // release factice (test)\n',
        'build/api-release/Twin_v9/COMMIT': `${commit}\n`,
        'build/api-release/Twin_v9/php/src/Plateforme.php': '<?php // moteur FICTIF (test)\n',
      },
    })
    const replies = { 'GET /api/health': [200, '{"status":"ok","version":"test","db":"ok"}'] }
    await withSite(checkout, (r) => replies[`${r.method} ${r.url}`] ?? [404, '{}'], async (base) => {
      // Sans MIGRATE_TOKEN : la santé seule, ce qui suffit à ce contrôle.
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base }))
      const avertissement = 'MIGRATE_TOKEN not set in .env.deploy — skipping remote migrations\n'
      // La release en ligne : celle vers laquelle current.txt vient de pointer.
      const refus = (run, twin9) =>
        `deploy failed: Twin9 off on the server (health twin9: ${twin9}): ` +
        `release ${/current\.txt -> releases\/(\S+)/.exec(run.stdout)[1]} is live, ` +
        `migrations and imports done, without the engine it embeds (${commit}). Check ~/app/shared/.env ` +
        "(TWIN_V9_DIR must not be set: it would win over that engine) and PHP's zlib extension; " +
        'the previous release, if need be: node scripts/deploy/deploy.mjs rollback\n'

      // Une santé d'avant T18 ne dit rien de Twin9 : refusé.
      const muette = await deploy(checkout, ['api'])
      expect(muette.status).toBe(1)
      expect(muette.stderr).toBe(avertissement + refus(muette, 'null'))
      const release = uploads(checkout)[0].path.split('/')[2]
      const envoyes = uploads(checkout).map((u) => u.path)
      expect(envoyes).toContain(`app/releases/${release}/Twin_v9/COMMIT`)
      expect(envoyes).toContain(`app/releases/${release}/Twin_v9/php/src/Plateforme.php`)
      expect(envoyes.filter((path) => path.startsWith('www/'))).toEqual(['www/api/.htaccess', 'www/api/index.php'])

      // Le moteur chargé, mais sans zlib : refusé ; zlib sans le moteur : refusé.
      for (const twin9 of ['{"moteur":true,"zlib":false}', '{"moteur":false,"zlib":true}']) {
        replies['GET /api/health'] = [200, `{"status":"ok","version":"test","db":"ok","twin9":${twin9}}`]
        const refuse = await deploy(checkout, ['api'])
        expect(refuse.status).toBe(1)
        expect(refuse.stderr).toBe(avertissement + refus(refuse, twin9))
      }

      replies['GET /api/health'] = [200, '{"status":"ok","version":"test","db":"ok","twin9":{"moteur":true,"zlib":true}}']
      const charge = await deploy(checkout, ['api'])
      expect(charge.status).toBe(0)
      expect(charge.stdout.trimEnd().split('\n').slice(-3)).toEqual([
        `Twin9 engine loaded, zlib present; the release embeds Twin_v9 ${commit}`,
        `next: its templates, from Twin_v9 at ${commit} — node scripts/twin9/import-protocole.mjs (TWIN_V9_DIR)`,
        'api deploy done',
      ])
    })
  }, TIMEOUT)

  it('UC-SYS-02-F25 — T18 : stage-twin9.mjs copie le php/src du commit d’un dépôt Twin_v9 propre, et ce commit, dans <release>/Twin_v9 — ni tests, ni gabarits, ni fichier ignoré ; refuse, sans rien copier : moteur ou gabarits absents, dossier hors git ou DANS un dépôt sans en être la racine, changement non commité ou fichier non suivi dans php/src ou php/protocole (quel que soit status.showUntrackedFiles) ; un changement ailleurs passe', () => {
    const twin = mkdtempSync(join(tmpdir(), 'uc-sys-02-twin-'))
    tempDirs.push(twin)
    const ecrire = (rel, texte) => {
      mkdirSync(dirname(join(twin, rel)), { recursive: true })
      writeFileSync(join(twin, rel), texte)
    }
    // Un faux Twin_v9 : moteur, gabarits, tests et le reste — tous FICTIFS ; et,
    // pour le cas imbriqué, un sous-dossier qui a lui aussi php/src et php/protocole.
    ecrire('php/src/Plateforme.php', '<?php // moteur FICTIF (test)\n')
    ecrire('php/src/Run/Passe.php', '<?php // sous-dossier FICTIF (test)\n')
    ecrire('php/protocole/lourd/20-greffier.md', 'Gabarit FICTIF.\n')
    ecrire('php/tests/PlateformeTest.php', '<?php // test FICTIF\n')
    ecrire('oracle/README.md', 'Oracle FICTIF.\n')
    ecrire('imbrique/php/src/Plateforme.php', '<?php // moteur FICTIF imbriqué\n')
    ecrire('imbrique/php/protocole/x.md', 'Gabarit FICTIF imbriqué.\n')
    ecrire('.gitignore', '.DS_Store\n')
    // La configuration git du poste (signature, hooks) n'a pas voix ici.
    const git = (...args) =>
      execFileSync('git', ['-C', twin, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      }).trim()
    git('init', '-q')
    git('add', '-A')
    git('commit', '-q', '-m', 'Moteur FICTIF')
    const sha = git('rev-parse', 'HEAD')

    const stage = (twinDir, args) => {
      const dir = mkdtempSync(join(tmpdir(), 'uc-sys-02-stage-'))
      tempDirs.push(dir)
      const run = spawnSync(process.execPath, [join(REPO, 'scripts/deploy/stage-twin9.mjs'), ...(args ?? [dir])], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', TWIN_V9_DIR: twinDir },
      })
      return { dir, status: run.status, stdout: run.stdout, stderr: run.stderr }
    }
    const fichiers = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : [])
    const releaseAttendue = [
      'Twin_v9',
      'Twin_v9/COMMIT',
      'Twin_v9/php',
      'Twin_v9/php/src',
      'Twin_v9/php/src/Plateforme.php',
      'Twin_v9/php/src/Run',
      'Twin_v9/php/src/Run/Passe.php',
    ]

    const ok = stage(twin)
    expect(ok.stderr).toBe('')
    expect(ok.status).toBe(0)
    expect(ok.stdout).toBe(`Twin9 engine ${sha} staged in ${join(ok.dir, 'Twin_v9')} (2 files, 0 KB)\n`)
    expect(fichiers(ok.dir)).toEqual(releaseAttendue)
    expect(readFileSync(join(ok.dir, 'Twin_v9/COMMIT'), 'utf8')).toBe(`${sha}\n`)
    expect(readFileSync(join(ok.dir, 'Twin_v9/php/src/Run/Passe.php'), 'utf8')).toBe('<?php // sous-dossier FICTIF (test)\n')

    // Un changement hors de php/src et de php/protocole ne change rien au moteur : il passe.
    ecrire('oracle/README.md', 'Oracle FICTIF modifié.\n')
    expect(stage(twin).status).toBe(0)
    // Un fichier ignoré dans php/src (git ne le signale pas) ne part pas : la copie est celle du commit.
    ecrire('php/src/.DS_Store', 'bruit du Finder')
    const ignore = stage(twin)
    expect(ignore.status).toBe(0)
    expect(fichiers(ignore.dir)).toEqual(releaseAttendue)

    const refuse = (run, debut) => {
      expect(run.status).toBe(1)
      expect(run.stdout).toBe('')
      expect(run.stderr.startsWith(`stage-twin9: ${debut}`), run.stderr).toBe(true)
      expect(fichiers(run.dir)).toEqual([]) // rien de copié
    }
    // Moteur modifié sans commit : le commit ne décrirait pas ce que la release embarque.
    ecrire('php/src/Plateforme.php', '<?php // moteur FICTIF modifié\n')
    refuse(stage(twin), `uncommitted changes in ${twin} (php/src, php/protocole)`)
    git('checkout', '--', 'php/src/Plateforme.php')
    // Gabarit non suivi : l'import l'enverrait, le commit ne le dit pas — même quand
    // la configuration du dépôt masque les fichiers non suivis.
    git('config', 'status.showUntrackedFiles', 'no')
    ecrire('php/protocole/lourd/99-nouveau.md', 'Gabarit FICTIF non suivi.\n')
    refuse(stage(twin), `uncommitted changes in ${twin} (php/src, php/protocole)`)
    rmSync(join(twin, 'php/protocole/lourd/99-nouveau.md'))
    expect(stage(twin).status).toBe(0)
    // Un dossier DANS un dépôt git sans en être la racine (le faux moteur de la
    // plateforme, api/tests/fixtures/twin9-factice) : git y répondrait le commit d'un autre.
    refuse(stage(join(twin, 'imbrique')), `${join(twin, 'imbrique')} is not the root of its git checkout`)

    // Moteur absent (dossier vide) ; gabarits absents ; dossier hors git ; argument manquant.
    const vide = mkdtempSync(join(tmpdir(), 'uc-sys-02-vide-'))
    tempDirs.push(vide)
    refuse(stage(vide), `Twin9 engine not found in ${join(vide, 'php/src')} (set TWIN_V9_DIR)`)
    cpSync(join(twin, 'php/src'), join(vide, 'php/src'), { recursive: true })
    refuse(stage(vide), `Twin9 templates not found in ${join(vide, 'php/protocole')}`)
    cpSync(join(twin, 'php/protocole'), join(vide, 'php/protocole'), { recursive: true })
    refuse(stage(vide), `${vide} is not a git checkout`)
    const sansArgument = stage(twin, [])
    expect(sansArgument.status).toBe(1)
    expect(sansArgument.stderr).toBe('stage-twin9: usage: node scripts/deploy/stage-twin9.mjs <stage dir>\n')
  }, TIMEOUT)
})

describe('UC-SYS-02 — stage-api.sh : pas de Python en production', () => {
  it('UC-SYS-02-F26 — E13 : stage-api.sh (copie jetable, Node, Composer et git simulés) refuse une release qui contient un .py ou un .pyc — des sources, du moteur Twin9 ou d’un paquet Composer : vérifié après composer install, code 1, les fichiers nommés, la release supprimée (deploy.mjs api n’a rien à téléverser) ; sans Python, la release est préparée', () => {
    const root = mkdtempSync(join(tmpdir(), 'uc-sys-02-stage-api-'))
    tempDirs.push(root)
    const ecrire = (rel, texte, mode = 0o644) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      writeFileSync(join(root, rel), texte, { mode })
    }
    // Le script, octet pour octet, et ce qu'il copie : tout FICTIF.
    ecrire('scripts/deploy/stage-api.sh', readFileSync(join(REPO, 'scripts/deploy/stage-api.sh'), 'utf8'), 0o755)
    ecrire('api/src/Noyau.php', '<?php // source FICTIVE (test)\n')
    ecrire('api/public/index.php', '<?php // front FICTIF (test)\n')
    ecrire('api/composer.json', '{}\n')
    ecrire('api/composer.lock', '{}\n')
    ecrire('schemas/exemple.schema.json', '{}\n')
    ecrire('schemas/twin9-protocole-contrat.json', '{}\n')
    // Faux node, composer et git, devant le PATH : rien n'est construit, rien
    // n'est téléchargé. node ne fait que poser le moteur (FICTIF) quand
    // stage-twin9.mjs est appelé, plus FAKE_TWIN_PY s'il est donné ; composer
    // pose vendor/autoload.php, plus FAKE_VENDOR_PYC ; git échoue (VERSION « unknown »).
    ecrire('fake-bin/node', [
      '#!/bin/sh',
      'echo "node ${1##*/}" >> "$FAKE_LOG"',
      'case "$1" in */stage-twin9.mjs)',
      '  mkdir -p "$2/Twin_v9/php/src"',
      '  echo "<?php // moteur FICTIF" > "$2/Twin_v9/php/src/Plateforme.php"',
      '  if [ -n "$FAKE_TWIN_PY" ]; then echo "# FICTIF" > "$2/Twin_v9/$FAKE_TWIN_PY"; fi ;;',
      'esac',
      '',
    ].join('\n'), 0o755)
    ecrire('fake-bin/composer', [
      '#!/bin/sh',
      'echo "composer $1" >> "$FAKE_LOG"',
      'for a in "$@"; do case "$a" in --working-dir=*) dir="${a#--working-dir=}" ;; esac; done',
      'mkdir -p "$dir/vendor" && echo "<?php // autoload FICTIF" > "$dir/vendor/autoload.php"',
      'if [ -n "$FAKE_VENDOR_PYC" ]; then mkdir -p "$(dirname "$dir/vendor/$FAKE_VENDOR_PYC")" && echo x > "$dir/vendor/$FAKE_VENDOR_PYC"; fi',
      '',
    ].join('\n'), 0o755)
    ecrire('fake-bin/git', '#!/bin/sh\nexit 1\n', 0o755)

    const release = join(root, 'build/api-release')
    const log = join(root, 'fake-calls.log')
    const stageApi = (extraEnv = {}) => {
      rmSync(log, { force: true })
      const run = spawnSync('bash', [join(root, 'scripts/deploy/stage-api.sh')], {
        encoding: 'utf8',
        env: { PATH: `${join(root, 'fake-bin')}:${process.env.PATH ?? ''}`, FAKE_LOG: log, ...extraEnv },
      })
      return { status: run.status, stdout: run.stdout, stderr: run.stderr, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] }
    }
    const appels = [
      'node stage-twin9.mjs',
      'node build-tuteur-digest.mjs',
      'node build-default-prompt-package.mjs',
      'node generate-fiches.mjs',
      'node build-twin6-prompt-package.mjs',
      'composer install',
    ]
    const refus = (run, fichiers) => {
      expect(run.status).toBe(1)
      expect(run.stdout).toBe('')
      expect(run.stderr).toBe(`stage failed: Python in the release (no Python in production), release removed:\n${fichiers.join('\n')}\n`)
      expect(run.calls).toEqual(appels) // composer install fait : le contrôle vient en dernier
      expect(existsSync(release)).toBe(false)
    }

    // Sans Python : la release est préparée, rien n'est refusé.
    const ok = stageApi()
    expect(ok.stderr).toBe('')
    expect(ok.status).toBe(0)
    expect(ok.calls).toEqual(appels)
    expect(ok.stdout).toBe(`staged release unknown in ${release} (9 files)\n`)
    const fichiers = readdirSync(release, { recursive: true }).map(String).filter((p) => statSync(join(release, p)).isFile())
    expect(fichiers.sort()).toEqual([
      'Twin_v9/php/src/Plateforme.php',
      'VERSION',
      'composer.json',
      'composer.lock',
      'public/index.php',
      'schemas/exemple.schema.json',
      'schemas/twin9-protocole-contrat.json',
      'src/Noyau.php',
      'vendor/autoload.php',
    ])
    expect(readFileSync(join(release, 'VERSION'), 'utf8')).toBe('unknown\n')

    // Un .py des sources et un .pyc d'un paquet Composer (posé PAR composer
    // install) : les deux nommés, triés, chemins relatifs à la release.
    ecrire('api/src/outil.py', '# FICTIF\n')
    refus(stageApi({ FAKE_VENDOR_PYC: 'paquet/__pycache__/outil.cpython-313.pyc' }), [
      'src/outil.py',
      'vendor/paquet/__pycache__/outil.cpython-313.pyc',
    ])
    rmSync(join(root, 'api/src/outil.py'))
    // Un .py venu avec le moteur Twin9.
    refus(stageApi({ FAKE_TWIN_PY: 'twin9.py' }), ['Twin_v9/twin9.py'])
    // Le Python retiré, la release se prépare de nouveau.
    expect(stageApi().status).toBe(0)
    expect(existsSync(join(release, 'VERSION'))).toBe(true)
  }, TIMEOUT)
})
