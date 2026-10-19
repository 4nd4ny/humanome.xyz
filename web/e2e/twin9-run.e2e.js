// Scénario bout-en-bout de l'analyse approfondie sur le serveur (DoD T9, plan
// du moteur PHP de Twin_v9, lot 2) : un run lancé depuis le front va au bout,
// se suit, se reprend et s'ouvre dans la cartographie, délibérations comprises.
//
// Moteur factice (public) et Anthropic simulé : l'API locale est lancée avec
//   TWIN_V9_DIR=$PWD/api/tests/fixtures/twin9-factice WORKER_PROVIDER=mock ANTHROPIC_API_KEY=sk-ant-simule
// (docs/tests-e2e.md, « T9 »). Le jeu de gabarits du moteur factice est
// versé dans la base de développement le temps du scénario, puis retiré.
//
//   APPRENANTE : compte, crédité -> un profil par la voie directe -> #/twin9 :
//   son portfolio en fichier, son accord ; la page dit les journées à
//   instruire et le coût estimé (T10) ; « Lancer l'analyse » -> la page du
//   run : ses tours retenus, elle l'annule, puis le reprend -> il va au bout
//   -> « Ouvrir dans la cartographie » : le run s'ouvre dans un nouveau jeu,
//   la compétence jugée montre son jury -> elle supprime son compte, qui
//   emporte ses runs.
//
// LOCAL UNIQUEMENT : npx playwright test e2e/twin9-run.e2e.js

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** Requête SQL sur la base de DÉVELOPPEMENT, par le client mysql local (jamais ailleurs). */
function devSql(query) {
  return execFileSync('mysql', ['-h127.0.0.1', '-uhumanome', '-phumanome_dev', 'humanome', '-N', '-e', query], { cwd: root, stdio: 'pipe' }).toString().trim()
}

const PASSWORD = 'mot-de-passe-e2e-twin9'
const PORTFOLIO = "## 2026-01-05\nPremier jour : j'ai monté le capteur de CO2 et vérifié chaque mesure.\n## 2026-01-06\nDeuxième jour : j'ai lu les mesures avec Lena.\n"

// Le jeu du moteur factice (api/tests/fixtures/twin9-factice) : ses prompts portent l'identifiant de l'appel.
const GABARITS = {
  'factice/lecture': ['[appel:{$APPEL}] Lis la journée {$JOUR} en lecteur {$LECTEUR} :\n{$TEXTE}', ['APPEL', 'JOUR', 'LECTEUR', 'TEXTE']],
  'factice/etape': ['[appel:{$APPEL}] Étape {$ETAPE} de {$JOUR}, après : {$PRECEDENT}', ['APPEL', 'JOUR', 'ETAPE', 'PRECEDENT']],
  'factice/fusion': ['[appel:{$APPEL}] Fusionne :\n{$JOURS}', ['APPEL', 'JOURS']],
}

const sqlString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

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

test.beforeAll(() => {
  for (const [nom, [contenu, variables]] of Object.entries(GABARITS)) {
    devSql(
      `INSERT INTO twin9_protocole (name, content, variables) VALUES (${sqlString(nom)}, ${sqlString(contenu)}, '${JSON.stringify(variables)}') ` +
        'ON DUPLICATE KEY UPDATE content = VALUES(content), variables = VALUES(variables)',
    )
  }
})

test.afterAll(() => {
  devSql(`DELETE FROM twin9_protocole WHERE name LIKE 'factice/%'`)
})

test('analyse approfondie : lancée depuis le front, suivie, reprise, ouverte dans la cartographie', async ({ page }) => {
  const email = `e2e-twin9-${Date.now()}@humanome.test`

  await test.step('compte et profil par la voie directe', async () => {
    await registerAccount(page, { displayName: 'Lena (Twin9 e2e)', email })
    // la clé de l'instance paie sur son crédit (T10)
    devSql(`INSERT INTO twin9_credits (user_id, balance_microusd) SELECT id, 100000000 FROM users WHERE email = '${email}'`)
    const config = await apiCall(page, 'GET', 'twin9/configuration')
    expect(config.status).toBe(200)
    const profil = { ...config.body.defaut, voie: 'directe' }
    const cree = await apiCall(page, 'POST', 'twin9/profils', { nom: 'Direct e2e', profil })
    expect(cree.status).toBe(201)
  })

  // Les tours de la page sont retenus le temps d'annuler puis de reprendre.
  let tours = false
  await page.route('**/api/twin9/runs/avancer', (route) =>
    tours ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ avance: false, locked: true }) }),
  )

  await test.step('lancer : profil, portfolio en fichier, accord', async () => {
    await page.goto('/#/twin9')
    await page.getByLabel('Profil', { exact: true }).selectOption({ label: 'Direct e2e' })
    await page.getByLabel('Fichier du portfolio').setInputFiles({ name: 'journal-e2e.md', mimeType: 'text/markdown', buffer: Buffer.from(PORTFOLIO) })
    const lancer = page.getByRole('button', { name: 'Lancer l’analyse' })
    await expect(lancer).toBeDisabled()
    await page.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).check()
    const avant = page.getByRole('region', { name: 'Avant de lancer' })
    await expect(avant).toContainText('2 journées à instruire.')
    await expect(avant).toContainText(/Coût estimé : \d+,\d\d \$ · durée estimée : /)
    await lancer.click()
    await expect(page).toHaveURL(/#\/twin9\/\d+$/)
    await expect(page.getByRole('status')).toHaveText(/^En cours/)
  })

  await test.step('annuler, puis reprendre', async () => {
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('status')).toHaveText('Annulé')
    await page.getByRole('button', { name: 'Reprendre' }).click()
    await expect(page.getByRole('status')).toHaveText(/^En cours/)
  })

  await test.step('la page le fait avancer jusqu’au bout', async () => {
    tours = true
    await expect(page.getByRole('status')).toHaveText('Terminé', { timeout: 60_000 })
    await expect(page.getByText(/2 journées finies · fusion faite/)).toBeVisible()
  })

  await test.step('ouvrir dans la cartographie, délibérations comprises', async () => {
    await page.getByRole('button', { name: 'Ouvrir dans la cartographie' }).click()
    await expect(page).toHaveURL(/#\/cartographie/)
    await expect(page.getByRole('heading', { name: 'Cartographie', level: 1 })).toBeVisible()
    const secteur = page.locator('[data-tile="sun"] .carto-sun [role="button"][aria-label^="1.01 "]')
    await expect(secteur).toHaveCount(1)
    await secteur.focus()
    await page.keyboard.press('Enter')
    // la compétence que le tribunal factice a jugée : dans sa dernière journée, ouverte, sa délibération
    await expect(page.getByRole('region', { name: 'Traces de la compétence' }).getByText('Deuxième jour : j\'ai lu les mesures avec Lena.')).toBeVisible()
    await page.locator('details.carto-jury-wrap > summary:visible', { hasText: 'Délibération du jury' }).first().click()
    const jury = page.getByRole('region', { name: 'Réflexions des membres du jury' }).first()
    await expect(jury).toBeVisible()
    await expect(jury.locator('summary').first()).toHaveText('Lecteur — présence')
  })

  await test.step('supprimer son compte : il emporte ses runs', async () => {
    const id = devSql(`SELECT id FROM users WHERE email = '${email}'`)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_runs WHERE user_id = ${id}`))).toBe(1)
    expect((await apiCall(page, 'DELETE', 'auth/account')).status).toBe(204)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_runs WHERE user_id = ${id}`))).toBe(0)
    expect(Number(devSql(`SELECT COUNT(*) FROM twin9_cartes WHERE user_id = ${id}`))).toBe(0)
  })
})
