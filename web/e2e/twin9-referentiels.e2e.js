// Recette de T17 (plan du moteur PHP de Twin_v9, lot 4) : sur un même
// portfolio, RESPIRE et deux référentiels de test d'autres structures — cinq
// pôles lettrés (capacités A1 à E4), neuf pôles — traversent le moteur, la
// fusion et la cartographie sans rien partager : chaque carte a sa mémoire
// (journées, calques, faisceaux : twin9_memoire, par carte), chaque run la
// copie de son profil et son attestation ; les trois cartes s'affichent avec
// les noms de leurs pôles et coexistent dans la cartographie.
//
// Moteur factice (public) et Anthropic simulé, comme e2e/twin9-run.e2e.js :
//   TWIN_V9_DIR=$PWD/api/tests/fixtures/twin9-factice WORKER_PROVIDER=mock ANTHROPIC_API_KEY=sk-ant-simule
// (docs/tests-e2e.md, « T9 », « T17 »). Son tribunal juge la première
// compétence de chaque pôle du référentiel du run. Le jeu de gabarits du
// moteur factice et les deux référentiels de test (ceux des tests PHP,
// api/tests/UseCases/Support/ReferentielsFictifs.php) sont versés dans la
// base de développement le temps du scénario, puis retirés.
//
//   APPRENANTE : compte crédité, trois profils (RESPIRE, lettré, neuf
//   pôles) -> pour chacun, le même portfolio : l'aperçu dit ses deux
//   journées à instruire (aucune mémoire partagée), le run va au bout et
//   s'ouvre dans la cartographie, avec les noms de ses pôles -> les trois
//   jeux coexistent, chacun avec son référentiel -> trois cartes, trois
//   mémoires, trois attestations -> elle supprime son compte.
//
//   Le référentiel choisi au lancement (sprint 5, lot C ; S5 §7) : un autre
//   compte, sans créer de profil, prend le « Profil v9.8 » et choisit
//   « Fictif lettré » dans le menu « Référentiel » -> l'aperçu dit le
//   référentiel lu et ses deux journées, le lancement le porte. Le profil
//   v9.8 part par lots, qu'Anthropic simulé ne simule pas (une requête
//   partirait chez Anthropic) : son lancement est retenu par le scénario,
//   son corps vérifié. Puis un profil RESPIRE par la voie directe, le
//   référentiel lettré choisi au lancement : le run va au bout, sa carte est
//   celle du référentiel lettré (pôles A à E), son attestation le dit, le
//   profil enregistré reste sur RESPIRE.
//
// LOCAL UNIQUEMENT : npx playwright test e2e/twin9-referentiels.e2e.js

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const DEV_ENV = { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: 'humanome', DB_USER: 'humanome', DB_PASSWORD: 'humanome_dev' }

/** Requête SQL sur la base de DÉVELOPPEMENT, par le client mysql local (jamais ailleurs). */
function devSql(query) {
  return execFileSync('mysql', ['-h127.0.0.1', '-uhumanome', '-phumanome_dev', '--default-character-set=utf8mb4', 'humanome', '-N', '-e', query], { cwd: root, stdio: 'pipe' })
    .toString()
    .trim()
}

/** Les fiches de RESPIRE dans la base de DÉVELOPPEMENT (scripts/seed-competences.php, idempotent). */
function devFiches() {
  execFileSync('php', ['scripts/seed-competences.php'], { cwd: root, stdio: 'pipe', env: DEV_ENV })
}

const FICTIFS = "('fictif-lettre', 'fictif-neuf')"

/** Retire de la base de DÉVELOPPEMENT les deux référentiels de test. */
function retirerFictifs() {
  const versions = `SELECT id FROM referentiel_versions WHERE referentiel_id IN ${FICTIFS}`
  devSql(`DELETE FROM referentiel_votes WHERE version_id IN (${versions})`)
  devSql(`DELETE FROM referentiel_snapshot_competences WHERE snapshot_version_id IN (${versions})`)
  devSql(`DELETE FROM referentiel_versions WHERE referentiel_id IN ${FICTIFS}`)
}

/** Publie dans la base de DÉVELOPPEMENT les deux référentiels de test des tests PHP. */
function publierFictifs() {
  const php = `require 'api/vendor/autoload.php';
    use Humanome\\Db; use Humanome\\Referentiel\\ContentHash; use Humanome\\Referentiel\\ReferentielRepository;
    use Humanome\\Tests\\UseCases\\Support\\ReferentielsFictifs;
    foreach ([ReferentielsFictifs::lettre(), ReferentielsFictifs::neufPoles()] as $doc) {
      (new ReferentielRepository(Db::get()))->importPublishedDocument(['contentHash' => ContentHash::compute($doc)] + $doc, 'Recette T17 (e2e)');
    }`
  execFileSync('php', ['-r', php], { cwd: root, stdio: 'pipe', env: DEV_ENV })
}

const PASSWORD = 'mot-de-passe-e2e-t17'
const PORTFOLIO = "## 2026-01-05\nPremier jour : j'ai monté le capteur de CO2 et vérifié chaque mesure.\n## 2026-01-06\nDeuxième jour : j'ai lu les mesures avec Lena.\n"

// Le jeu du moteur factice (api/tests/fixtures/twin9-factice) : ses prompts portent l'identifiant de l'appel.
const GABARITS = {
  'factice/lecture': ['[appel:{$APPEL}] Lis la journée {$JOUR} en lecteur {$LECTEUR} :\n{$TEXTE}', ['APPEL', 'JOUR', 'LECTEUR', 'TEXTE']],
  'factice/etape': ['[appel:{$APPEL}] Étape {$ETAPE} de {$JOUR}, après : {$PRECEDENT}', ['APPEL', 'JOUR', 'ETAPE', 'PRECEDENT']],
  'factice/fusion': ['[appel:{$APPEL}] Fusionne :\n{$JOURS}', ['APPEL', 'JOURS']],
}

const sqlString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

// Les trois référentiels du scénario : leur profil, le titre du jeu ouvert, les noms de leurs pôles.
const LETTRES = ['A', 'B', 'C', 'D', 'E']
const CARTES = [
  {
    // la version d'installation (INSTALL.md §3), quelles que soient celles publiées depuis
    referentiel: 'respire',
    version: '7.0.0',
    profil: 'RESPIRE e2e',
    titre: 'Twin9 · journal-t17 · RESPIRE v7',
    poles: ['TETE — Penser & Comprendre', 'COEUR — Relier & Naviguer', 'MAIN — Créer & Incarner', 'AME — Discerner & Juger', 'RACINES — Évoluer & Résister', "CITE — Gouverner & S'ouvrir", 'FLAMBEAU — Transmettre & Piloter'],
    competence: '1.01 ',
  },
  {
    referentiel: 'fictif-lettre',
    version: '1.0.0',
    profil: 'Lettré e2e',
    titre: 'Twin9 · journal-t17 · Fictif lettré',
    poles: LETTRES.map((l) => `${l} · Pôle fictif ${l}`),
    competence: 'A1 Capacité fictive A1',
  },
  {
    referentiel: 'fictif-neuf',
    version: '1.0.0',
    profil: 'Neuf pôles e2e',
    titre: 'Twin9 · journal-t17 · Fictif à neuf pôles',
    poles: Array.from({ length: 9 }, (_, i) => `Pôle fictif ${i + 1}`),
    competence: '9.01 Compétence fictive 9.01',
  },
]

/** Appel d'API depuis la page (cookie de session + jeton CSRF lu sur api/auth/me). */
async function apiCall(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const me = await fetch('api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then((r) => r.json())
      const res = await fetch(`api/${path}`, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(me.csrfToken ? { 'X-CSRF-Token': me.csrfToken } : {}) },
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { method, path, body },
  )
}

/** Inscription par l'UI #/compte, activation dans la base de développement, connexion. */
async function registerAccount(page, { displayName, email }) {
  await page.goto('/#/compte')
  await page.getByRole('button', { name: 'Inscription' }).click()
  await page.getByLabel('Nom affiché').fill(displayName)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Confirmez l’email').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: 'Activer votre compte' })).toBeVisible()
  devSql(`UPDATE users SET email_verified_at = NOW() WHERE email = '${email}'`)
  await page.getByRole('button', { name: 'Retour à la connexion' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
}

const sun = (page) => page.locator('[data-tile="sun"] .carto-sun')

/** Les noms des pôles du soleil affiché, dans l'ordre de leurs secteurs. */
async function nomsDesPoles(page) {
  const labels = await sun(page).locator('[role="button"][aria-label^="Pôle "]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  return labels.map((l) => /^Pôle (.+?) : /.exec(l)[1])
}

test.beforeAll(() => {
  devFiches()
  for (const [nom, [contenu, variables]] of Object.entries(GABARITS)) {
    devSql(
      `INSERT INTO twin9_protocole (name, content, variables) VALUES (${sqlString(nom)}, ${sqlString(contenu)}, '${JSON.stringify(variables)}') ` +
        'ON DUPLICATE KEY UPDATE content = VALUES(content), variables = VALUES(variables)',
    )
  }
  retirerFictifs() // ceux d'un passage interrompu
  publierFictifs()
})

test.afterAll(() => {
  devSql(`DELETE FROM twin9_protocole WHERE name LIKE 'factice/%'`)
  retirerFictifs()
})

// L'apprenante choisit un de ses profils : la liste n'est proposée qu'en mode expert (UC-VIS-06, UC-APP-10 A10),
// qu'elle a choisi dans ce navigateur.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('humanome-mode', 'expert'))
})

test('trois référentiels sur un même portfolio : trois cartes qui ne partagent rien et coexistent dans la cartographie', async ({ page }) => {
  const email = `e2e-t17-${Date.now()}@humanome.test`

  await test.step('compte crédité, un profil par référentiel', async () => {
    await registerAccount(page, { displayName: 'Lena (T17 e2e)', email })
    devSql(`INSERT INTO twin9_credits (user_id, balance_microusd) SELECT id, 100000000 FROM users WHERE email = '${email}'`)
    const config = await apiCall(page, 'GET', 'twin9/configuration')
    expect(config.status).toBe(200)
    for (const carte of CARTES) {
      const profil = { ...config.body.defaut, voie: 'directe', referentiel: { id: carte.referentiel, version: carte.version } }
      const cree = await apiCall(page, 'POST', 'twin9/profils', { nom: carte.profil, profil })
      expect(cree.status, JSON.stringify(cree.body)).toBe(201)
    }
  })

  for (const carte of CARTES) {
    await test.step(`${carte.referentiel} : le même portfolio, ses deux journées à instruire, sa carte avec les noms de ses pôles`, async () => {
      await page.goto('/#/twin9')
      await page.getByLabel('Profil', { exact: true }).selectOption({ label: carte.profil })
      await page.getByLabel('Fichier du portfolio').setInputFiles({ name: 'journal-t17.md', mimeType: 'text/markdown', buffer: Buffer.from(PORTFOLIO) })
      await page.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).check()
      // la carte de ce référentiel n'a rien en mémoire : celle d'un autre ne lui donne aucune journée
      await expect(page.getByRole('region', { name: 'Avant de lancer' })).toContainText('2 journées à instruire.')
      await page.getByRole('button', { name: 'Lancer l’analyse' }).click()
      await expect(page).toHaveURL(/#\/twin9\/\d+$/)
      await expect(page.getByRole('status')).toHaveText('Terminé', { timeout: 60_000 })

      await page.getByRole('button', { name: 'Ouvrir dans la cartographie' }).click()
      await expect(page).toHaveURL(/#\/cartographie/)
      await expect.poll(() => nomsDesPoles(page)).toEqual(carte.poles)
      await expect(sun(page).locator(`[role="button"][aria-label^="${carte.competence}"]`)).toHaveCount(1)
    })
  }

  await test.step('les trois jeux coexistent dans la cartographie, chacun avec son référentiel', async () => {
    // le panneau « Jeux de données », affiché par « Panneaux » (au départ, le soleil et le détail : D-53)
    await page.locator('.carto-panels-menu > summary').click()
    await page.getByRole('checkbox', { name: 'Jeux de données' }).check()
    await page.keyboard.press('Escape')
    const ouvrir = page.locator('[data-tile="datasets"]').getByRole('combobox', { name: /Ouvrir/ })
    const titres = await ouvrir.locator('option').allTextContents()
    for (const carte of CARTES) expect(titres).toContain(`${carte.titre} (2 j.)`)
    for (const carte of [CARTES[1], CARTES[0], CARTES[2]]) {
      await ouvrir.selectOption({ label: `${carte.titre} (2 j.)` })
      await expect.poll(() => nomsDesPoles(page)).toEqual(carte.poles)
    }
  })

  await test.step('rien de partagé : trois cartes, leurs mémoires à part, chaque run avec la copie de son profil', async () => {
    const id = devSql(`SELECT id FROM users WHERE email = '${email}'`)
    expect(devSql(`SELECT referentiel FROM twin9_cartes WHERE user_id = ${id} ORDER BY referentiel`).split('\n')).toEqual(['fictif-lettre', 'fictif-neuf', 'respire'])
    // chaque carte garde ses deux journées et ses faisceaux, sous sa propre clé
    expect(
      devSql(`SELECT c.referentiel, COUNT(*) FROM twin9_memoire m JOIN twin9_cartes c ON c.id = m.carte_id WHERE c.user_id = ${id} AND (m.cle LIKE 'journees/%' OR m.cle = 'faisceaux') GROUP BY c.referentiel ORDER BY c.referentiel`).split('\n'),
    ).toEqual(['fictif-lettre\t3', 'fictif-neuf\t3', 'respire\t3'])
    // un run par carte, son attestation avec le référentiel de son profil
    expect(
      devSql(`SELECT c.referentiel, r.attestation->>'$.referentiel.id', r.attestation->>'$.profil.nom' FROM twin9_runs r JOIN twin9_cartes c ON c.id = r.carte_id WHERE r.user_id = ${id} ORDER BY c.referentiel`).split('\n'),
    ).toEqual(['fictif-lettre\tfictif-lettre\tLettré e2e', 'fictif-neuf\tfictif-neuf\tNeuf pôles e2e', 'respire\trespire\tRESPIRE e2e'])
  })

  await test.step('supprimer son compte : il emporte ses runs et ses cartes', async () => {
    const id = devSql(`SELECT id FROM users WHERE email = '${email}'`)
    expect((await apiCall(page, 'DELETE', 'auth/account')).status).toBe(204)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_runs WHERE user_id = ${id}`))).toBe(0)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_cartes WHERE user_id = ${id}`))).toBe(0)
  })
})

test('le référentiel choisi au lancement : le profil v9.8 sur le référentiel lettré, sans créer de profil (S5, lot C)', async ({ page }) => {
  const email = `e2e-lotc-${Date.now()}@humanome.test`
  const lettre = CARTES[1]
  const fichier = { name: 'journal-lotc.md', mimeType: 'text/markdown', buffer: Buffer.from(PORTFOLIO) }

  await test.step('compte crédité, aucun profil', async () => {
    await registerAccount(page, { displayName: 'Lena (lot C e2e)', email })
    devSql(`INSERT INTO twin9_credits (user_id, balance_microusd) SELECT id, 100000000 FROM users WHERE email = '${email}'`)
  })

  await test.step('« Profil v9.8 », « Fictif lettré » choisi au lancement : l’aperçu le lit, le lancement le porte', async () => {
    await page.goto('/#/twin9')
    await expect(page.getByLabel('Profil', { exact: true })).toHaveValue('')
    const menu = page.getByLabel('Référentiel', { exact: true })
    // le référentiel du profil n'est proposé qu'une fois, « Celui du profil » (la base de développement peut en publier d'autres)
    await expect(menu.locator('option').first()).toHaveText('Celui du profil (RESPIRE v7)')
    const options = await menu.locator('option').allTextContents()
    expect(options).toEqual(expect.arrayContaining(['Fictif lettré', 'Fictif à neuf pôles']))
    expect(options).not.toContain('RESPIRE v7')
    await menu.selectOption({ label: 'Fictif lettré' })
    await page.getByLabel('Fichier du portfolio').setInputFiles(fichier)
    await page.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).check()
    const avant = page.getByRole('region', { name: 'Avant de lancer' })
    await expect(avant).toContainText('Référentiel lu : Fictif lettré, version 1.0.0.')
    await expect(avant).toContainText('2 journées à instruire.')
    // le profil v9.8 part par lots : retenu ici, pour qu'aucune requête ne parte chez Anthropic
    let corps = null
    await page.route('**/api/twin9/runs', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      corps = route.request().postDataJSON()
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Lancement retenu par le scénario' }) })
    })
    await page.getByRole('button', { name: 'Lancer l’analyse' }).click()
    await expect.poll(() => corps).not.toBeNull()
    expect(corps.profil).toBeNull()
    expect(corps.referentiel).toEqual({ id: 'fictif-lettre', version: null })
    expect(corps.portfolio.nom).toBe('journal-lotc.md')
    await page.unroute('**/api/twin9/runs')
    const id = devSql(`SELECT id FROM users WHERE email = '${email}'`)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_runs WHERE user_id = ${id}`))).toBe(0)
  })

  await test.step('un profil RESPIRE par la voie directe, le référentiel lettré choisi au lancement : sa carte, ses pôles A à E', async () => {
    const config = await apiCall(page, 'GET', 'twin9/configuration')
    expect(config.status).toBe(200)
    const profil = { ...config.body.defaut, voie: 'directe', referentiel: { id: 'respire', version: '7.0.0' } }
    expect((await apiCall(page, 'POST', 'twin9/profils', { nom: 'RESPIRE direct e2e', profil })).status).toBe(201)
    await page.goto('/#/twin9')
    await page.getByLabel('Profil', { exact: true }).selectOption({ label: 'RESPIRE direct e2e' })
    await page.getByLabel('Référentiel', { exact: true }).selectOption({ label: 'Fictif lettré' })
    await page.getByLabel('Fichier du portfolio').setInputFiles(fichier)
    await page.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).check()
    const avant = page.getByRole('region', { name: 'Avant de lancer' })
    await expect(avant).toContainText('Référentiel lu : Fictif lettré, version 1.0.0.')
    await expect(avant).toContainText('2 journées à instruire.')
    await page.getByRole('button', { name: 'Lancer l’analyse' }).click()
    await expect(page).toHaveURL(/#\/twin9\/\d+$/)
    await expect(page.getByRole('status')).toHaveText('Terminé', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Ouvrir dans la cartographie' }).click()
    await expect(page).toHaveURL(/#\/cartographie/)
    await expect.poll(() => nomsDesPoles(page)).toEqual(lettre.poles)
    await expect(sun(page).locator(`[role="button"][aria-label^="${lettre.competence}"]`)).toHaveCount(1)
  })

  await test.step('la carte et l’attestation du run sont du référentiel lettré ; le profil enregistré reste sur RESPIRE', async () => {
    const id = devSql(`SELECT id FROM users WHERE email = '${email}'`)
    expect(devSql(`SELECT referentiel FROM twin9_cartes WHERE user_id = ${id}`)).toBe('fictif-lettre')
    expect(devSql(`SELECT r.attestation->>'$.referentiel.id' FROM twin9_runs r WHERE r.user_id = ${id}`)).toBe('fictif-lettre')
    expect(devSql(`SELECT profil->>'$.referentiel.id' FROM twin9_profils WHERE user_id = ${id}`)).toBe('respire')
    expect((await apiCall(page, 'DELETE', 'auth/account')).status).toBe(204)
  })
})
