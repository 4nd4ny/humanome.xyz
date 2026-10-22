// UC-VIS-05 — Interroger l'assistant tuteur : tests UNITAIRES (front + script de build).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-05-interroger-assistant-tuteur.md
//
// Code sollicité appelé directement : client askTuteur (défi partagé avec la
// démo, preuve de travail, POST api/tuteur sans rôle ni portfolio, avec la
// mémoire courte memoireCourte, sur les vecteurs communs avec le serveur), rendu
// texte simple des réponses (stripLightMarkdown), catalogue des routes de la
// carte du site (routes-catalogue.js), confronté au routeur, au `switch`
// d'App.jsx (lu comme texte), au menu des deux modes et à l'aide, et
// générateur du digest de documentation injecté dans la consigne du tuteur
// (scripts/build-tuteur-digest.mjs, qui délègue à scripts/lib/site-map.mjs),
// exécuté dans un répertoire miroir TEMPORAIRE pour ne jamais écrire dans le
// dépôt (le digest et site-map.json sont des fichiers générés, absents d'un
// checkout neuf).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { askTuteur, memoireCourte } from '../../../src/lib/tuteur.js'
import { stripLightMarkdown } from '../../../src/components/TuteurPanel.jsx'
import { FAMILIES, ROLE_LABELS, navGroups } from '../../../src/nav.js'
import { parseHash } from '../../../src/router.js'
import { AIDE_SANS_ROUTE, ROUTE_CATALOGUE } from '../../../src/routes-catalogue.js'
import { HELP_ENTRIES } from '../../../src/help/registry.js'
import { FORMATION_PARCOURS, listChapters } from '../../../src/views/espace/formation-content.js'

// Vitest s'exécute depuis web/ (import.meta.url n'est pas un file:// sous jsdom).
const repoRoot = resolve(process.cwd(), '..')
if (!existsSync(join(repoRoot, 'scripts', 'build-tuteur-digest.mjs'))) {
  throw new Error(`racine du dépôt introuvable depuis ${process.cwd()}`)
}

/** Exécute le vrai script dans un miroir temporaire ; renvoie le digest produit. */
function buildDigestInMirror() {
  const mirror = mkdtempSync(join(tmpdir(), 'uc-vis-05-digest-'))
  try {
    mkdirSync(join(mirror, 'scripts', 'data'), { recursive: true })
    // Le script et sa bibliothèque sont COPIÉS (ils écrivent à côté d'eux) ;
    // web/ et content/ ne sont que lus, par des liens.
    cpSync(join(repoRoot, 'scripts', 'build-tuteur-digest.mjs'), join(mirror, 'scripts', 'build-tuteur-digest.mjs'))
    cpSync(join(repoRoot, 'scripts', 'lib'), join(mirror, 'scripts', 'lib'), { recursive: true })
    symlinkSync(join(repoRoot, 'web'), join(mirror, 'web'), 'dir')
    symlinkSync(join(repoRoot, 'content'), join(mirror, 'content'), 'dir')
    const log = execFileSync(process.execPath, [join(mirror, 'scripts', 'build-tuteur-digest.mjs')], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    })
    return {
      log,
      digest: readFileSync(join(mirror, 'scripts', 'data', 'tuteur-digest.md'), 'utf8'),
      siteMap: JSON.parse(readFileSync(join(mirror, 'scripts', 'data', 'site-map.json'), 'utf8')),
    }
  } finally {
    rmSync(mirror, { recursive: true, force: true })
  }
}

describe('UC-VIS-05 — client du tuteur', () => {
  it('UC-VIS-05-U05 — askTuteur : défi de la démo, preuve résolue, POST tuteur {question, rubrique, historique, challenge, nonce, website: ""} — ni rôle ni portfolio ; du fil de l’onglet, seule la mémoire courte part', async () => {
    const fetchChallengeFn = vi.fn().mockResolvedValue({ challenge: 'v1.1.aa.bb', difficultyBits: 8, expiresAt: 1 })
    const solvePowFn = vi.fn().mockResolvedValue({ nonce: '417', attempts: 418 })
    const apiFetchFn = vi.fn().mockResolvedValue({ text: 'Ouvrez #/essayer.', model: 'claude-haiku-5-5', usage: {} })

    const answer = await askTuteur({ question: 'Par où commencer ?', rubrique: 'home' }, { apiFetchFn, fetchChallengeFn, solvePowFn })

    expect(answer).toEqual({ text: 'Ouvrez #/essayer.', model: 'claude-haiku-5-5' })
    expect(solvePowFn).toHaveBeenCalledWith({ challenge: 'v1.1.aa.bb', difficultyBits: 8, signal: undefined })
    const [path, init] = apiFetchFn.mock.calls[0]
    expect(path).toBe('tuteur')
    expect(init.method).toBe('POST')
    expect(init.body).toEqual({ question: 'Par où commencer ?', rubrique: 'home', historique: [], challenge: 'v1.1.aa.bb', nonce: '417', website: '' })
    // Le fil de l'onglet : trois échanges et une question restée sans réponse ;
    // seuls les deux derniers échanges partent.
    const fil = [
      { role: 'user', text: 'Q1 ?' },
      { role: 'assistant', text: 'R1.' },
      { role: 'user', text: 'Q2 ?' },
      { role: 'assistant', text: 'R2.' },
      { role: 'user', text: 'Q3 ?' },
      { role: 'assistant', text: 'R3.' },
      { role: 'user', text: 'Question sans réponse ?' },
    ]
    await askTuteur({ question: 'Et ensuite ?', rubrique: 'guides', historique: fil }, { apiFetchFn, fetchChallengeFn, solvePowFn })
    expect(apiFetchFn.mock.calls[1][1].body.historique).toEqual(fil.slice(2, 6))
    expect(Object.keys(apiFetchFn.mock.calls[1][1].body).sort()).toEqual(['challenge', 'historique', 'nonce', 'question', 'rubrique', 'website'])
    // Réponse sans texte exploitable : chaîne vide (le panneau affiche un repli).
    apiFetchFn.mockResolvedValueOnce({ text: null })
    expect((await askTuteur({ question: 'x' }, { apiFetchFn, fetchChallengeFn, solvePowFn })).text).toBe('')
  })

  it('UC-VIS-05-U16 — memoireCourte (lot C) : seules des paires question → réponse de texte, les 2 dernières, 750 caractères par message (points de code), 1 500 en tout ; rôle system, question sans réponse et toute autre forme écartés — mêmes vecteurs que le serveur (U15), qui ne coupe donc jamais ce que le panneau envoie', () => {
    const { vecteurs } = JSON.parse(readFileSync(join(repoRoot, 'api', 'tests', 'fixtures', 'tuteur', 'memoire-courte.json'), 'utf8'))
    const texte = (t) => (Array.isArray(t) ? t.map(([morceau, fois]) => morceau.repeat(fois)).join('') : t)
    const deplier = (h) => (Array.isArray(h) ? h.map((m) => (m && typeof m === 'object' && 'text' in m ? { ...m, text: texte(m.text) } : m)) : h)
    expect(vecteurs.length).toBeGreaterThanOrEqual(10)
    for (const { nom, historique, attendu } of vecteurs) {
      expect(memoireCourte(deplier(historique)), nom).toEqual(attendu.map((m) => ({ role: m.role, text: texte(m.text) })))
    }
    // Idempotente : ce qu'elle rend repasse tel quel (le serveur relit la même chose).
    const long = [{ role: 'user', text: 'é'.repeat(900) }, { role: 'assistant', text: '😀'.repeat(800) }]
    const once = memoireCourte(long)
    expect(memoireCourte(once)).toEqual(once)
    expect([...once[1].text]).toHaveLength(750)
  })

  it('UC-VIS-05-U06 — stripLightMarkdown : gras et code retirés, listes et routes conservées (texte simple, pas de HTML)', () => {
    expect(stripLightMarkdown('Ouvrez **Essayer** via `#/essayer` puis __Guides__.')).toBe('Ouvrez Essayer via #/essayer puis Guides.')
    expect(stripLightMarkdown('- point 1\n* point 2')).toBe('- point 1\n* point 2')
    expect(stripLightMarkdown('<b>pas interprété</b>')).toBe('<b>pas interprété</b>')
  })
})

describe('UC-VIS-05 — digest de documentation du tuteur', () => {
  it('UC-VIS-05-U07 — build-tuteur-digest : toutes les routes du plan du site (famille « Compte » des deux sessions et items du mode expert compris), les adresses hors menu, l’aide de chaque page et tous les chapitres des guides, déterministe, titres seulement (RG4) ; site-map.json écrit à côté', () => {
    const first = buildDigestInMirror()
    const second = buildDigestInMirror()
    expect(second.digest).toBe(first.digest) // déterministe
    expect(second.siteMap).toEqual(first.siteMap)
    expect(first.log).toMatch(/^wrote scripts\/data\/tuteur-digest\.md \(\d+ caractères, 9 parcours\)\n/)
    expect(first.log.split('\n')[1]).toMatch(/^wrote scripts\/data\/site-map\.json \(\d+ routes, \d+ caractères\)$/)

    const { digest } = first
    expect(digest.startsWith('# Digest de navigation humanome.xyz (pour l’assistant tuteur)')).toBe(true)
    for (const family of FAMILIES) {
      for (const item of family.items) expect(digest).toContain(`\`${item.href}\``)
    }
    for (const parcours of FORMATION_PARCOURS) {
      expect(digest).toContain(`\`#/guides/${parcours}\``)
      for (const chapter of listChapters(parcours)) {
        expect(digest).toContain(`\`#/guides/${parcours}/${chapter.slug}\``)
      }
    }
    expect(digest).toContain('epistemiarque = épistémiarque')
    // La famille « Compte » (navGroups), absente de FAMILIES : les deux sessions.
    expect(digest).toContain('- Se connecter : `#/compte` (sans compte)')
    expect(digest).toContain('- Profil et rôles : `#/compte` (connecté)')
    expect(digest).toContain('- Crédit et factures : `#/compte/credit` (connecté)')
    expect(digest).toContain('- Confidentialité : `#/confidentialite` — RGPD')
    // Les items du mode expert sont listés, et marqués (le mode n'est pas un droit).
    expect(digest).toMatch(/^- Mes profils Twin9 : `#\/configuration` .*\(mode expert\)$/m)
    // Hors menu : les espaces de la cartographie et les modèles d'adresse.
    expect(digest).toContain('## Autres adresses (hors menu)')
    expect(digest).toContain('`#/cartographie/comparaison`')
    expect(digest).toContain('`#/jour/AAAA-MM-JJ`')
    expect(digest).toContain('`#/partage/<jeton reçu>`')
    expect(digest).not.toContain('#/activer')
    // Ce que fait chaque page : titre, adresse, résumé et points de l'aide.
    expect(digest).toContain(`### ${HELP_ENTRIES.configuration.titre} (\`#/configuration\`)\n${HELP_ENTRIES.configuration.intro}`)
    expect(digest).toContain(`- ${HELP_ENTRIES.account.points[0]}`)
    expect(digest).toContain(HELP_ENTRIES.employeur.intro)
    // Titres seulement : aucun corps de chapitre n'est recopié dans la consigne.
    const body = listChapters('visiteur')[0].raw.split('\n').find((line) => line.length > 80 && !line.startsWith('#'))
    expect(digest).not.toContain(body)
    expect(JSON.stringify(first.siteMap)).not.toContain(body)
    // site-map.json : une page par route du catalogue, par son nom de route.
    expect(first.siteMap.pages.map((page) => page.route)).toEqual(
      expect.arrayContaining(ROUTE_CATALOGUE.map((entry) => entry.name)),
    )
    expect(first.siteMap.pages.find((page) => page.route === 'account')).toMatchObject({
      href: '#/compte',
      titre: HELP_ENTRIES.account.titre,
      navLabel: 'Se connecter',
      variantes: ['#/compte/credit'],
    })
  })

  it('UC-VIS-05-U13 — bornes du digest : moins de 40 000 caractères (environ 12 000 tokens, le plafond du coût d’une question)', () => {
    const { digest } = buildDigestInMirror()
    expect(digest.length).toBeLessThan(40_000)
    // Plancher : l'aide de toutes les pages y est bien (garde contre un digest vidé).
    const help = Object.values(HELP_ENTRIES).reduce((n, e) => n + e.intro.length, 0)
    expect(digest.length).toBeGreaterThan(help)
  })
})

/** Noms de route que router.js peut rendre (lus dans son texte). */
function routerNames() {
  const source = readFileSync(join(repoRoot, 'web/src/router.js'), 'utf8')
  return new Set([...source.matchAll(/name: '([a-z0-9-]+)'/g)].map((m) => m[1]))
}

/** Les `case '<nom>':` du switch de rendu d'App.jsx. */
function appCases() {
  const source = readFileSync(join(repoRoot, 'web/src/App.jsx'), 'utf8')
  const start = source.indexOf('switch (route.name) {')
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('\n  }\n', start)
  const body = source.slice(start, end)
  return { body, cases: new Set([...body.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1])) }
}

const CATALOGUE_NAMES = ROUTE_CATALOGUE.map((entry) => entry.name)

/** Toutes les sessions qui changent le menu : visiteur, chaque rôle, tous les rôles, dans les deux modes. */
function allMenus() {
  const roles = Object.keys(ROLE_LABELS)
  const sessions = [{ roles: [] }, ...roles.map((role) => ({ roles: [role] })), { roles }]
  return sessions.flatMap((session) => [true, false].map((expert) => ({ ...session, expert, groups: navGroups({ ...session, expert }) })))
}

/** Adresses #/… d'un texte (Markdown ou aide), ponctuation finale retirée. */
function hashLinks(text) {
  return [...String(text).matchAll(/#\/[^\s)\]`'"*,;»|]*/g)].map((m) => m[0].replace(/[.:!?]+$/, ''))
}

/** Anciennes adresses documentées par le guide du visiteur (redirigées vers #/cartographie). */
const ANCIENNES_ADRESSES = ['#/cartographie-v3', '#/merge']
/** Modèles écrits dans les guides qui ne se résolvent pas tels quels, avec un exemple concret. */
const MODELES = [
  { modele: '#/jour/<date>', exemple: '#/jour/2026-03-15', name: 'day' },
  { modele: '#/partage/<jeton>', exemple: '#/partage/AAAAAAAAAA', name: 'share' },
]

describe('UC-VIS-05 — catalogue des routes (carte du site de l’assistant)', () => {
  it('UC-VIS-05-U08 — catalogue face au routeur : une ligne par nom de route de router.js (sauf not-found), noms uniques, chaque exemple, variante et exemple de modèle se résout vers son nom', () => {
    expect(new Set(CATALOGUE_NAMES).size).toBe(CATALOGUE_NAMES.length)
    const names = routerNames()
    expect(names.has('not-found')).toBe(true)
    names.delete('not-found')
    expect(new Set(CATALOGUE_NAMES)).toEqual(names)
    for (const entry of ROUTE_CATALOGUE) {
      expect(parseHash(entry.exemple).name, entry.exemple).toBe(entry.name)
      for (const hash of entry.variantes ?? []) expect(parseHash(hash).name, hash).toBe(entry.name)
      for (const { modele, exemple } of entry.modeles ?? []) {
        expect(parseHash(exemple).name, exemple).toBe(entry.name)
        expect(modele.startsWith('#/'), modele).toBe(true)
      }
      if (entry.modele) expect(entry.modele, entry.name).not.toBe(entry.exemple)
    }
  })

  it('UC-VIS-05-U09 — catalogue face à App.jsx : chaque `case` du switch de rendu est au catalogue (not-found à part), et chaque route du catalogue y a son cas ou tombe sur l’accueil (home)', () => {
    const { body, cases } = appCases()
    expect(cases.has('not-found')).toBe(true)
    cases.delete('not-found')
    for (const name of cases) expect(CATALOGUE_NAMES, name).toContain(name)
    for (const name of CATALOGUE_NAMES) {
      if (name === 'home') expect(cases.has('home')).toBe(false)
      else expect(cases.has(name), name).toBe(true)
    }
    expect(body).toMatch(/default:\s*\n\s*view = <HomeView /)
  })

  it('UC-VIS-05-U10 — catalogue face à l’aide : chaque route non interne a son entrée (titre et résumé), une route interne n’en a pas ; chaque entrée de l’aide est une route du catalogue ou un profil sans route (employeur)', () => {
    for (const entry of ROUTE_CATALOGUE) {
      if (entry.interne) {
        expect(entry.aide, entry.name).toBeNull()
        continue
      }
      expect(HELP_ENTRIES[entry.aide], entry.name).toBeDefined()
      expect(HELP_ENTRIES[entry.aide].titre).not.toBe('')
      expect(HELP_ENTRIES[entry.aide].intro).not.toBe('')
    }
    const aides = new Set(ROUTE_CATALOGUE.map((entry) => entry.aide).filter(Boolean))
    for (const key of Object.keys(HELP_ENTRIES)) {
      expect(aides.has(key) || AIDE_SANS_ROUTE.includes(key), key).toBe(true)
    }
    for (const key of AIDE_SANS_ROUTE) {
      expect(HELP_ENTRIES[key], key).toBeDefined()
      expect(CATALOGUE_NAMES, key).not.toContain(key)
    }
  })

  it('UC-VIS-05-U11 — menu face au catalogue : pour le visiteur, chaque rôle et tous les rôles, en mode simple comme en mode expert, chaque lien se résout vers une route du catalogue (ni not-found ni redirect) cohérente avec son `route` ; le menu d’un visiteur ne mène qu’à des routes publiques', () => {
    const menus = allMenus()
    expect(menus).toHaveLength(2 * (Object.keys(ROLE_LABELS).length + 2))
    const publics = new Set(ROUTE_CATALOGUE.filter((entry) => entry.public).map((entry) => entry.name))
    for (const { roles, expert, groups } of menus) {
      for (const group of groups) {
        for (const item of group.items) {
          const where = `${roles.join('+') || 'visiteur'}/${expert ? 'expert' : 'simple'} ${item.href}`
          const name = parseHash(item.href).name
          expect(CATALOGUE_NAMES, where).toContain(name)
          expect(['not-found', 'redirect'], where).not.toContain(name)
          if (item.route) expect(item.route, where).toBe(name)
          if (roles.length === 0) expect(publics.has(name), where).toBe(true)
        }
      }
    }
    // Le mode simple ne retire que des items `expert` (jamais une famille).
    const all = navGroups({ roles: Object.keys(ROLE_LABELS) })
    const simple = navGroups({ roles: Object.keys(ROLE_LABELS), expert: false })
    expect(simple.map((g) => g.id)).toEqual(all.map((g) => g.id))
  })

  it('UC-VIS-05-U12 — liens des contenus : chaque #/… des guides (content/formation), de la page de confidentialité et de l’aide se résout vers une route réelle ; exceptions déclarées : deux anciennes adresses documentées (redirigées) et deux modèles à compléter, qui se résolvent une fois complétés', () => {
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name))
        else if (entry.name.endsWith('.md')) files.push(join(dir, entry.name))
      }
    }
    walk(join(repoRoot, 'content'))
    expect(files.length).toBeGreaterThan(50)
    const links = files.flatMap((file) => hashLinks(readFileSync(file, 'utf8')).map((hash) => ({ hash, where: file.slice(repoRoot.length + 1) })))
    for (const [key, entry] of Object.entries(HELP_ENTRIES)) {
      for (const text of [entry.intro, ...(entry.points ?? [])]) {
        for (const hash of hashLinks(text)) links.push({ hash, where: `aide ${key}` })
      }
    }
    expect(links.length).toBeGreaterThan(100)

    const exceptions = new Set()
    for (const { hash, where } of links) {
      const name = parseHash(hash).name
      if (ANCIENNES_ADRESSES.includes(hash)) {
        expect(name, `${where} ${hash}`).toBe('redirect')
        exceptions.add(hash)
        continue
      }
      const modele = MODELES.find((m) => m.modele === hash)
      if (modele) {
        expect(name, `${where} ${hash}`).toBe('not-found')
        exceptions.add(hash)
        continue
      }
      expect(CATALOGUE_NAMES, `${where} ${hash}`).toContain(name)
      expect(['not-found', 'redirect'], `${where} ${hash}`).not.toContain(name)
    }
    // Les exceptions déclarées existent toutes (la liste ne vieillit pas en silence).
    expect([...exceptions].sort()).toEqual([...ANCIENNES_ADRESSES, ...MODELES.map((m) => m.modele)].sort())
    for (const { exemple, name } of MODELES) expect(parseHash(exemple).name).toBe(name)
  })
})
