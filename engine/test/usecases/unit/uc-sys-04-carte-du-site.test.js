// UC-SYS-04 — Construire les données et artefacts dérivés : la carte du site
// (sprint 11). Fiche : docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md
//
// Unitaires : les fonctions pures de scripts/lib/site-map.mjs, appelées
// directement, sur des entrées SYNTHÉTIQUES (U07, U08).
// Fonctionnels : scripts/build-site-map.mjs et scripts/build-tuteur-digest.mjs
// exécutés en SOUS-PROCESSUS, comme le prebuild du front et stage-api.sh les
// lancent, dans des MIROIRS TEMPORAIRES (os.tmpdir()) qui ne contiennent que
// la liste blanche des sources (SOURCES), les trois scripts et
// web/package.json (il déclare les modules ESM de web/src à Node) : la
// génération y réussit, donc elle ne lit rien d'autre (F17). Rien n'est écrit
// dans le dépôt. Aucun réseau, aucun LLM.
//
// Contraintes CI moteur : entrées VERSIONNÉES uniquement, lectures dans les
// it() seulement, écritures dans os.tmpdir() seulement. Les dossiers
// temporaires passent par realpathSync (macOS : /var/folders est un lien).
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  PARCOURS_PUBLIES,
  SOURCES,
  absolutizeChapterLinks,
  absolutizeHashLinks,
  collectSiteMap,
  demoteHeadings,
  publicFiles,
  renderDigest,
  renderGuideMarkdown,
  renderLlmsTxt,
  renderRobots,
  renderSitemap,
  robotsPolicyFrom,
  siteUrlFrom,
  stripFrontMatter,
} from '../../../../scripts/lib/site-map.mjs'
import { ROUTE_CATALOGUE } from '../../../../web/src/routes-catalogue.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 60_000

/** Ce que contient un miroir : la liste blanche, les scripts, le marqueur ESM. */
const SCRIPTS = ['scripts/lib/site-map.mjs', 'scripts/build-site-map.mjs', 'scripts/build-tuteur-digest.mjs']
const MIRROR_FILES = [...SOURCES, ...SCRIPTS, 'web/package.json']

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Un miroir neuf : seulement MIRROR_FILES, copiés depuis le dépôt. */
function mirror() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-04-carte-')))
  tempDirs.push(dir)
  for (const rel of MIRROR_FILES) cpSync(join(REPO, rel), join(dir, rel), { recursive: true })
  mkdirSync(join(dir, 'scripts/data'), { recursive: true })
  return dir
}

/** Lance un script du miroir avec un environnement EXPLICITE (rien d'hérité). */
function run(dir, script, env = {}) {
  const result = spawnSync(process.execPath, [join(dir, script)], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** Tous les fichiers d'un dossier (chemins relatifs, triés). */
function listFiles(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((rel) => statSync(join(root, rel)).isFile())
    .sort()
}

/** Les sorties d'un miroir : web/public et scripts/data, chemin → contenu. */
function outputs(dir) {
  const out = {}
  for (const base of ['web/public', 'scripts/data']) {
    for (const rel of listFiles(join(dir, base))) out[`${base}/${rel}`] = readFileSync(join(dir, base, rel), 'utf8')
  }
  return out
}

let generatedCache = null
/** Un miroir généré une fois (réutilisé par F18 et F19), avec ses sorties. */
function generated() {
  if (generatedCache) return generatedCache
  const dir = mirror()
  const site = run(dir, 'scripts/build-site-map.mjs')
  const digest = run(dir, 'scripts/build-tuteur-digest.mjs')
  expect(site.status, site.stderr).toBe(0)
  expect(digest.status, digest.stderr).toBe(0)
  generatedCache = { dir, files: outputs(dir) }
  return generatedCache
}

// --- Entrées synthétiques pour les fonctions pures --------------------------

/** Un routeur minimal à la manière de router.js. */
function fakeParseHash(hash) {
  const path = String(hash).replace(/^#/, '').split('?')[0]
  if (path === '/' || path === '') return { name: 'home' }
  if (path === '/page') return { name: 'page' }
  if (path === '/espace' || path.startsWith('/espace/')) return { name: 'espace' }
  if (/^\/jour\/\d{4}-\d{2}-\d{2}$/.test(path)) return { name: 'day' }
  if (path === '/vieux') return { name: 'redirect' }
  return { name: 'not-found' }
}

function fakeSources(overrides = {}) {
  const families = ({ roles = [], authenticated = roles.length > 0 } = {}) => {
    const groups = [
      {
        id: 'decouvrir',
        label: 'Découvrir',
        intent: 'Comprendre',
        audience: 'Tous',
        items: [
          { href: '#/', label: 'Accueil', route: 'home' },
          { href: '#/page', label: 'Page', route: 'page', badge: 'gratuit', hint: 'sans compte' },
        ],
      },
    ]
    if (roles.includes('apprenant')) {
      groups.push({
        id: 'mien',
        label: 'Le mien',
        intent: 'Construire',
        audience: 'Apprenant',
        roles: ['apprenant'],
        items: [{ href: '#/espace', label: 'Mon espace', route: 'espace', expert: true }],
      })
    }
    groups.push({
      id: 'compte',
      label: authenticated ? 'Mon compte' : 'Compte',
      intent: 'Moi',
      audience: 'Tous',
      items: authenticated ? [{ href: '#/', label: 'Profil', route: 'home' }] : [{ href: '#/', label: 'Entrer', route: 'home' }],
    })
    return groups
  }
  const raw = (titre, chapitre, body) => `---\nparcours: p\nchapitre: ${chapitre}\ntitre: "${titre}"\n---\n\n${body}\n`
  return {
    catalogue: [
      { name: 'day', exemple: '#/jour/2026-03-15', modele: '#/jour/AAAA-MM-JJ', aide: 'day', public: true },
      { name: 'espace', exemple: '#/espace', variantes: ['#/espace/x'], aide: 'espace', public: false },
      { name: 'home', exemple: '#/', aide: 'home', public: true },
      { name: 'page', exemple: '#/page', aide: 'page', public: true },
      { name: 'redirect', exemple: '#/vieux', aide: null, public: false, interne: true },
    ],
    aideSansRoute: ['persona'],
    parseHash: fakeParseHash,
    navGroups: families,
    roleLabels: { apprenant: 'apprenant' },
    helpEntries: {
      home: { titre: 'Accueil fictif', intro: 'Résumé fictif du site.', points: ['Point A'] },
      page: { titre: 'Page fictive', intro: 'Ce que fait la page.', points: [] },
      espace: { titre: 'Espace fictif', intro: 'Un espace.', points: ['Point E'] },
      day: { titre: 'Journée fictive', intro: 'Une journée.' },
      persona: { titre: 'Persona fictif', intro: 'Sans page.', points: [] },
    },
    formation: [
      {
        parcours: 'zeta',
        meta: { titre: 'Parcours hors liste' },
        chapitres: [{ slug: '01-z', source: 'content/formation/zeta/01-z.md', meta: { titre: 'Z', chapitre: '1' } }],
      },
      {
        parcours: 'visiteur',
        meta: { titre: 'Guide fictif' },
        chapitres: [
          { slug: '02-b', source: 'content/formation/visiteur/02-b.md', meta: { titre: 'Deux', chapitre: '2' } },
          { slug: '01-a', source: 'content/formation/visiteur/01-a.md', meta: { titre: 'Un [crochets]', chapitre: '1' } },
        ],
      },
    ],
    legal: [{ cle: 'confidentialite', source: 'content/legal/confidentialite.md', meta: { titre: 'Confidentialité fictive', maj: '2026-07-12' } }],
    bodies: {
      'content/formation/visiteur/01-a.md': raw('Un', 1, '# Un\n\nVoir [le hub](#/guides) et [la suite](02-b.md).'),
      'content/formation/visiteur/02-b.md': raw('Deux', 2, '# Deux\n\nTexte.'),
      'content/formation/zeta/01-z.md': raw('Z', 1, '# Z'),
      'content/legal/confidentialite.md': '---\ntitre: Confidentialité fictive\nmaj: 2026-07-12\n---\n\n# Confidentialité\n\n[Accueil](#/).\n',
    },
    ...overrides,
  }
}

describe('UC-SYS-04 — carte du site : fonctions pures (scripts/lib/site-map.mjs)', () => {
  it('UC-SYS-04-U07 — stripFrontMatter, absolutizeHashLinks, absolutizeChapterLinks, demoteHeadings, SITE_URL et ROBOTS_POLICY lus et validés', () => {
    expect(stripFrontMatter('---\ntitre: "L\'outil"\nchapitre: 2\n---\n\n\n# T\n\ncorps\n')).toEqual({
      meta: { titre: 'L\'outil', chapitre: '2' },
      body: '# T\n\ncorps\n',
    })
    expect(stripFrontMatter('# Sans front-matter\n')).toEqual({ meta: {}, body: '# Sans front-matter\n' })

    // Un lien relatif vers une route devient absolu ; http(s), ancres et
    // fichiers relatifs ne changent pas.
    const site = 'https://exemple.test'
    expect(absolutizeHashLinks('Voir [le hub](#/guides) et [ici](#/compte "titre").', site)).toBe(
      'Voir [le hub](https://exemple.test/#/guides) et [ici](https://exemple.test/#/compte "titre").',
    )
    const unchanged = '[a](https://x.test/#/guides) [b](http://y.test) [c](#ancre) [d](02-b.md) `#/essayer`'
    expect(absolutizeHashLinks(unchanged, site)).toBe(unchanged)
    expect(absolutizeChapterLinks('[s](02-b.md) [t](./03-c.md#fin) [u](index.md) [v](https://x.test/01-a.md)', `${site}/guides/p`)).toBe(
      '[s](https://exemple.test/guides/p/02-b.md) [t](https://exemple.test/guides/p/03-c.md#fin) [u](index.md) [v](https://x.test/01-a.md)',
    )

    // Titres abaissés, plafonnés à 6, jamais dans un bloc de code.
    expect(demoteHeadings('# A\n## B\n##### C\n#pas-un-titre\n```\n# code\n```\n~~~\n## code\n~~~\n### D', 2)).toBe(
      '### A\n#### B\n###### C\n#pas-un-titre\n```\n# code\n```\n~~~\n## code\n~~~\n##### D',
    )

    expect(siteUrlFrom({})).toBe('https://humanome.xyz')
    expect(siteUrlFrom({ SITE_URL: ' https://test.humanome.xyz/ ' })).toBe('https://test.humanome.xyz')
    expect(siteUrlFrom({ SITE_URL: 'http://localhost:5173' })).toBe('http://localhost:5173')
    for (const bad of ['humanome.xyz', 'https://humanome.xyz/sous/chemin', 'javascript:alert(1)']) {
      expect(() => siteUrlFrom({ SITE_URL: bad }), bad).toThrow(/SITE_URL invalide/)
    }
    expect(robotsPolicyFrom({})).toBe('index')
    expect(robotsPolicyFrom({ ROBOTS_POLICY: 'noindex' })).toBe('noindex')
    expect(() => robotsPolicyFrom({ ROBOTS_POLICY: 'tout' })).toThrow('ROBOTS_POLICY invalide : « tout » (attendu : index ou noindex)')
  })

  it('UC-SYS-04-U08 — collectSiteMap et rendus sur une carte synthétique : ordre du menu, familles fusionnées des deux sessions, catalogue incohérent refusé, modèles et routes internes jamais en lien, sitemap sans route #/, robots selon la politique', () => {
    const map = collectSiteMap(fakeSources(), { siteUrl: 'https://exemple.test' })

    // Ordre du menu d'abord (home, page, espace), puis du catalogue (day, redirect).
    expect(map.pages.map((p) => p.route)).toEqual(['home', 'page', 'espace', 'day', 'redirect'])
    const espace = map.pages.find((p) => p.route === 'espace')
    expect(espace).toMatchObject({ href: '#/espace', navLabel: 'Mon espace', audience: ['Apprenant'], expert: true, public: false })
    expect(map.pages.find((p) => p.route === 'day')).toMatchObject({ href: '#/jour/AAAA-MM-JJ', modele: true, dansMenu: false, points: [] })
    expect(map.pages.find((p) => p.route === 'page')).toMatchObject({ badges: ['gratuit'], hint: 'sans compte', navLabel: 'Page' })
    // Le libellé du visiteur passe d'abord pour une page publique.
    expect(map.pages.find((p) => p.route === 'home').navLabel).toBe('Accueil')
    // « Compte » : les items des deux sessions, marqués.
    const compte = map.familles.find((f) => f.id === 'compte')
    expect(compte.label).toBe('Mon compte')
    expect(compte.items.map((i) => [i.label, i.connecte, i.visiteur])).toEqual([
      ['Profil', true, false],
      ['Entrer', false, true],
    ])
    // Parcours de la liste d'abord, chapitres par numéro ; les autres sont au
    // digest mais pas publiés.
    expect(map.guides.map((g) => [g.parcours, g.publie])).toEqual([
      ['visiteur', true],
      ['zeta', false],
    ])
    expect(map.guides[0].chapitres.map((c) => [c.slug, c.ordre, c.fichier])).toEqual([
      ['01-a', 1, '/guides/visiteur/01-a.md'],
      ['02-b', 2, '/guides/visiteur/02-b.md'],
    ])
    expect(map.legal).toEqual([
      {
        cle: 'confidentialite',
        titre: 'Confidentialité fictive',
        maj: '2026-07-12',
        href: '#/confidentialite',
        fichier: '/legal/confidentialite.md',
        source: 'content/legal/confidentialite.md',
      },
    ])
    // Aucun corps de chapitre dans la carte (elle part dans la release API).
    expect(JSON.stringify(map)).not.toContain('Texte.')

    // Un catalogue que le routeur contredit, ou qui nomme une aide absente : refusé.
    const broken = fakeSources()
    broken.catalogue = [...broken.catalogue, { name: 'page2', exemple: '#/page', aide: 'page', public: true }]
    expect(() => collectSiteMap(broken)).toThrow('catalogue des routes : #/page se résout vers « page », pas « page2 »')
    const noHelp = fakeSources()
    noHelp.catalogue = noHelp.catalogue.map((e) => (e.name === 'page' ? { ...e, aide: 'absente' } : e))
    expect(() => collectSiteMap(noHelp)).toThrow('catalogue des routes : aide « absente » absente du registre')

    // llms.txt : ni modèle (#/jour/AAAA-MM-JJ), ni route interne, ni parcours non publié.
    const llms = renderLlmsTxt(map)
    expect(llms.startsWith('# humanome.xyz\n\n> Résumé fictif du site.\n')).toBe(true)
    expect(llms).toContain('- [Page](https://exemple.test/#/page): gratuit, sans compte. Ce que fait la page.')
    expect(llms).toContain('- [Mon espace](https://exemple.test/#/espace): pour : Apprenant. Un espace.')
    expect(llms).toContain('- [Guide fictif — Un \\[crochets\\]](https://exemple.test/guides/visiteur/01-a.md)')
    expect(llms).toContain('- [Confidentialité fictive](https://exemple.test/legal/confidentialite.md): mise à jour du 2026-07-12')
    expect(llms).not.toContain('AAAA')
    expect(llms).not.toContain('#/vieux')
    expect(llms).not.toContain('zeta')

    // Digest : menu marqué, adresses hors menu (modèle compris), aide, titres seulement.
    const digest = renderDigest(map)
    expect(digest).toContain('- Profil : `#/` (connecté)')
    expect(digest).toContain('- Entrer : `#/` (sans compte)')
    expect(digest).toContain('- Mon espace : `#/espace` (mode expert)')
    expect(digest).toContain('- `#/espace/x` : Espace fictif — espace « x »')
    expect(digest).toContain('- `#/jour/AAAA-MM-JJ` : Journée fictive (modèle : AAAA-MM-JJ est une date)')
    expect(digest).toContain('### Persona fictif (profil de l’accueil, sans page propre)')
    expect(digest).toContain('- Z (`#/guides/zeta/01-z`)')
    expect(digest).not.toContain('Texte.')

    // Un chapitre publié : sans front-matter, liens vers l'application absolus, source.
    expect(renderGuideMarkdown(map, map.guides[0].chapitres[0], fakeSources().bodies['content/formation/visiteur/01-a.md'])).toBe(
      '# Un\n\nVoir [le hub](https://exemple.test/#/guides) et [la suite](02-b.md).\n\n---\n\nSource : https://exemple.test/#/guides/visiteur/01-a\n',
    )

    // sitemap.xml : des URL réelles, jamais de fragment ; lastmod seulement depuis maj.
    expect(renderSitemap(map)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://exemple.test/</loc></url>',
        '  <url><loc>https://exemple.test/llms.txt</loc></url>',
        '  <url><loc>https://exemple.test/llms-full.txt</loc></url>',
        '  <url><loc>https://exemple.test/guides/visiteur/01-a.md</loc></url>',
        '  <url><loc>https://exemple.test/guides/visiteur/02-b.md</loc></url>',
        '  <url><loc>https://exemple.test/legal/confidentialite.md</loc><lastmod>2026-07-12</lastmod></url>',
        '</urlset>',
        '',
      ].join('\n'),
    )

    // robots.txt : les deux politiques, et rien d'autre.
    expect(renderRobots(map, 'index')).toBe(
      '# humanome.xyz — généré par scripts/build-site-map.mjs (ROBOTS_POLICY=index)\n' +
        'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://exemple.test/sitemap.xml\n',
    )
    expect(renderRobots(map, 'noindex')).toBe(
      '# humanome.xyz — généré par scripts/build-site-map.mjs (ROBOTS_POLICY=noindex)\nUser-agent: *\nDisallow: /\n',
    )
    expect(() => renderRobots(map, 'tout')).toThrow('politique de robots inconnue : tout')

    // Les fichiers publics : les quatre fichiers racine, puis les .md publiés.
    expect(publicFiles(map, fakeSources().bodies, 'index').map((f) => f.path)).toEqual([
      'llms.txt',
      'llms-full.txt',
      'sitemap.xml',
      'robots.txt',
      'guides/visiteur/01-a.md',
      'guides/visiteur/02-b.md',
      'legal/confidentialite.md',
    ])
  })
})

describe('UC-SYS-04 — carte du site : générateurs en sous-processus (miroirs limités à la liste blanche)', () => {
  it('UC-SYS-04-F17 — Nominal (6, 8) et E1 : build-site-map et build-tuteur-digest dans deux miroirs limités aux sources de la liste blanche → sorties identiques à l’octet, journaux exacts ; SITE_URL et ROBOTS_POLICY=noindex appliqués ; un chapitre périmé disparaît ; politique ou adresse invalide → code 1, rien d’écrit', () => {
    const first = mirror()
    const second = mirror()
    // Le miroir ne contient que la liste blanche, les scripts et le marqueur ESM.
    const sourceFiles = listFiles(first)
    for (const rel of sourceFiles) {
      expect(MIRROR_FILES.some((allowed) => rel === allowed || rel.startsWith(`${allowed}/`)), rel).toBe(true)
    }

    // Un chapitre retiré des sources, encore présent dans le dossier généré.
    mkdirSync(join(first, 'web/public/guides/ancien'), { recursive: true })
    writeFileSync(join(first, 'web/public/guides/ancien/01-perime.md'), '# Périmé\n')

    for (const dir of [first, second]) {
      const site = run(dir, 'scripts/build-site-map.mjs')
      expect(site.stderr).toBe('')
      expect(site.status).toBe(0)
      expect(site.stdout).toMatch(
        /^wrote web\/public : llms\.txt \(\d+ caractères\), llms-full\.txt \(\d+ caractères\), sitemap\.xml, robots\.txt \(index\), \d+ fichiers \.md — https:\/\/humanome\.xyz\n$/,
      )
      const digest = run(dir, 'scripts/build-tuteur-digest.mjs')
      expect(digest.stderr).toBe('')
      expect(digest.status).toBe(0)
      expect(digest.stdout).toMatch(
        /^wrote scripts\/data\/tuteur-digest\.md \(\d+ caractères, 9 parcours\)\nwrote scripts\/data\/site-map\.json \(\d+ routes, \d+ caractères\)\n$/,
      )
    }
    expect(existsSync(join(first, 'web/public/guides/ancien'))).toBe(false)
    const a = outputs(first)
    const b = outputs(second)
    expect(Object.keys(a)).toEqual(Object.keys(b))
    for (const path of Object.keys(a)) expect(a[path], path).toBe(b[path])
    expect(Object.keys(a).filter((p) => !p.includes('/guides/'))).toEqual([
      'web/public/legal/confidentialite.md',
      'web/public/llms-full.txt',
      'web/public/llms.txt',
      'web/public/robots.txt',
      'web/public/sitemap.xml',
      'scripts/data/site-map.json',
      'scripts/data/tuteur-digest.md',
    ])
    expect(a['web/public/robots.txt']).toContain('Allow: /\nDisallow: /api/\n')

    // Site de test : son adresse partout, et rien n'est indexé.
    const test = mirror()
    const testRun = run(test, 'scripts/build-site-map.mjs', { SITE_URL: 'https://test.exemple.test/', ROBOTS_POLICY: 'noindex' })
    expect(testRun.status, testRun.stderr).toBe(0)
    const robots = readFileSync(join(test, 'web/public/robots.txt'), 'utf8')
    expect(robots).toBe('# humanome.xyz — généré par scripts/build-site-map.mjs (ROBOTS_POLICY=noindex)\nUser-agent: *\nDisallow: /\n')
    expect(readFileSync(join(test, 'web/public/sitemap.xml'), 'utf8')).toContain('<loc>https://test.exemple.test/llms.txt</loc>')
    expect(readFileSync(join(test, 'web/public/llms.txt'), 'utf8')).not.toContain('https://humanome.xyz')

    // Politique inconnue ou adresse invalide : code 1, message, rien d'écrit.
    for (const [env, message] of [
      [{ ROBOTS_POLICY: 'tout' }, 'build-site-map : ROBOTS_POLICY invalide : « tout » (attendu : index ou noindex)\n'],
      [{ SITE_URL: 'humanome.xyz' }, 'build-site-map : SITE_URL invalide : « humanome.xyz » (attendu : https://hôte, sans chemin)\n'],
    ]) {
      const dir = mirror()
      const refused = run(dir, 'scripts/build-site-map.mjs', env)
      expect(refused.status).toBe(1)
      expect(refused.stdout).toBe('')
      expect(refused.stderr).toBe(message)
      expect(listFiles(join(dir, 'web/public'))).toEqual([])
    }
  }, TIMEOUT)

  it('UC-SYS-04-F18 — Nominal (7) : llms.txt au format llmstxt.org (titre, citation, au moins trois sections, items « - [titre](https://…) », liens locaux vers des fichiers générés, moins de 50 Ko) ; sitemap.xml = les fichiers publiés ; index.html ne pointe que vers eux ; tous les parcours du hub publiés ; chaque route du catalogue dans site-map.json', () => {
    const { dir, files } = generated()
    const llms = files['web/public/llms.txt']
    const lines = llms.split('\n')
    expect(lines[0]).toBe('# humanome.xyz')
    expect(lines.some((line) => /^> \S/.test(line))).toBe(true)
    expect(lines.filter((line) => line.startsWith('## ')).length).toBeGreaterThanOrEqual(3)
    expect(lines).toContain('## Optional')
    const items = lines.filter((line) => line.startsWith('- '))
    expect(items.length).toBeGreaterThan(40)
    for (const item of items) expect(item).toMatch(/^- \[(?:[^\]\\]|\\.)+\]\(https:\/\/humanome\.xyz\/[^)\s]*\)(?:: \S.*)?$/)
    expect(Buffer.byteLength(llms, 'utf8')).toBeLessThan(50 * 1024)

    // Chaque lien local (hors route #/) désigne un fichier généré.
    const generatedPaths = new Set(Object.keys(files).filter((p) => p.startsWith('web/public/')).map((p) => p.slice('web/public'.length)))
    const local = [...llms.matchAll(/\]\(https:\/\/humanome\.xyz(\/[^)#\s]+)\)/g)].map((m) => m[1])
    expect(local.length).toBeGreaterThan(40)
    for (const path of local) expect(generatedPaths.has(path), path).toBe(true)

    // sitemap.xml : la racine, puis exactement les fichiers publics lisibles.
    const locs = [...files['web/public/sitemap.xml'].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs[0]).toBe('https://humanome.xyz/')
    for (const loc of locs) expect(loc).not.toContain('#')
    expect(new Set(locs.slice(1).map((loc) => loc.replace('https://humanome.xyz', '')))).toEqual(
      new Set([...generatedPaths].filter((p) => /\.(md|txt)$/.test(p) && p !== '/robots.txt')),
    )

    // index.html : le lien « alternate » et ceux du <noscript> mènent à des fichiers générés.
    const html = readFileSync(join(REPO, 'web/index.html'), 'utf8')
    expect(html).toContain('<link rel="alternate" type="text/plain" href="/llms.txt" title="Résumé du site pour les IA" />')
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? ''
    const hrefs = [...noscript.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThanOrEqual(2)
    for (const href of hrefs) expect(generatedPaths.has(href), href).toBe(true)
    expect(noscript).not.toContain('<script')

    // Décision du 2026-10-22 : les parcours publiés sont ceux du hub #/guides, tous.
    const parcoursDirs = readdirSync(join(REPO, 'content/formation'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    expect([...PARCOURS_PUBLIES].sort()).toEqual(parcoursDirs)
    for (const parcours of parcoursDirs) {
      const chapters = readdirSync(join(REPO, 'content/formation', parcours)).filter((f) => f.endsWith('.md') && f !== 'index.md')
      for (const file of chapters) expect(generatedPaths.has(`/guides/${parcours}/${file}`), `${parcours}/${file}`).toBe(true)
    }

    // site-map.json : chaque route du catalogue, par son nom (le lot A le lira côté PHP).
    const map = JSON.parse(files['scripts/data/site-map.json'])
    expect(map.pages.map((p) => p.route).sort()).toEqual(ROUTE_CATALOGUE.map((e) => e.name).sort())
    for (const page of map.pages.filter((p) => !p.interne)) {
      expect(page.titre, page.route).toBeTruthy()
      expect(page.href.startsWith('#/'), page.route).toBe(true)
    }
    expect(readFileSync(join(dir, 'scripts/data/site-map.json'), 'utf8').endsWith('}\n')).toBe(true)
  }, TIMEOUT)

  it('UC-SYS-04-F19 — Garde de publication des sorties (9) : aucun fichier généré (public, digest, site-map.json) ne porte de clé Anthropic, de chemin local absolu, d’identifiant d’hébergement OVH, de variable de gabarit ni de chemin de gabarit Twin9 ; le digest ne recopie le corps d’aucun chapitre', () => {
    const { files } = generated()
    // Les motifs de scripts/check-publiable.mjs (qu'on n'importe pas : il
    // s'exécute à l'import), repris ici ; les littéraux OVH sont concaténés
    // pour que ce fichier, suivi par git, ne se signale pas lui-même.
    const forbidden = [
      { id: 'cle-anthropic', re: /sk-ant-/ },
      { id: 'chemin-local', re: /\/Users\/[A-Za-z0-9]/ },
      { id: 'ovh-hote', re: new RegExp('harmong' + '927') },
      { id: 'ovh-cluster', re: new RegExp('cluster' + '129') },
      { id: 'gabarit', re: /\{\{|\{\$[A-Z_]+\}/ },
      { id: 'chemin-gabarit-twin9', re: /golden-twin9|twin9-oracles|golden-prompt\// },
    ]
    expect(Object.keys(files).length).toBeGreaterThan(40)
    for (const [path, content] of Object.entries(files)) {
      for (const { id, re } of forbidden) expect(re.test(content), `${id} dans ${path}`).toBe(false)
    }

    // Titres seulement dans le digest : la première longue ligne de chaque chapitre n'y est pas.
    const digest = files['scripts/data/tuteur-digest.md']
    const chapters = Object.keys(files).filter((p) => p.startsWith('web/public/guides/'))
    expect(chapters.length).toBeGreaterThan(40)
    for (const path of chapters) {
      const line = files[path].split('\n').find((l) => l.length > 80 && !l.startsWith('#'))
      if (line) expect(digest.includes(line), path).toBe(false)
    }
    expect(Buffer.byteLength(files['scripts/data/site-map.json'], 'utf8')).toBeLessThan(200 * 1024)
  }, TIMEOUT)
})
