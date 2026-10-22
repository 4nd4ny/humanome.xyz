// Carte du site (sprint 11) : une seule chaîne de génération, au build, sans
// PHP ni Python. Des sources versionnées, un JSON intermédiaire, des sorties :
//
//   web/src/routes-catalogue.js, router.js, nav.js, help/registry.js
//   content/formation/**.md, content/legal/confidentialite.md
//         │  loadSources (seules lectures, liste blanche SOURCES)
//         ▼  collectSiteMap (pur)
//   site-map.json ──► renderDigest (assistant tuteur), renderLlmsTxt,
//                     renderLlmsFull, renderGuideMarkdown, renderSitemap,
//                     renderRobots
//
// Les points d'entrée (scripts/build-tuteur-digest.mjs, scripts/build-site-map.mjs)
// passent la racine du dépôt : ce module ne déduit aucun chemin de son propre
// emplacement, n'écrit rien et n'a aucun effet à l'import. Toutes les sorties
// sont déterministes (ni date ni aléa) : identiques à l'octet à commit égal.
//
// Ce qui est publié est déjà public : les guides sont embarqués dans le bundle
// et lisibles sous #/guides, l'aide s'affiche sur chaque page. Les publier en
// fichiers statiques les rend seulement lisibles par les robots, qui ne voient
// d'une application à routage par fragment (ADR-009) qu'un index.html vide.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Adresse publique par défaut (SITE_URL la remplace). */
export const DEFAULT_SITE_URL = 'https://humanome.xyz'

/** Nom du site, en tête de llms.txt (indépendant de l'hôte). */
export const SITE_NAME = 'humanome.xyz'

/** Politiques de robots.txt (ROBOTS_POLICY) ; la première est le défaut. */
export const ROBOTS_POLICIES = ['index', 'noindex']

/**
 * Parcours publiés en Markdown et dans llms-full.txt, dans l'ordre du hub
 * #/guides (FORMATION_META.ordre). Par défaut, tous ceux déjà publics sous
 * #/guides (décision du 2026-10-22) ; en retirer un ici le retire des
 * fichiers publics, pas du digest de l'assistant (le hub reste public).
 */
export const PARCOURS_PUBLIES = [
  'visiteur',
  'apprenant',
  'employeur',
  'cartographe',
  'etablissement',
  'epistemiarque',
  'promptologue',
  'admin',
  'noesiologie',
]

/**
 * Liste blanche des sources : loadSources ne lit rien d'autre (aucun gabarit,
 * aucun secret). Un test exécute les générateurs dans un miroir qui ne
 * contient que ces fichiers.
 */
export const SOURCES = [
  'web/src/routes-catalogue.js',
  'web/src/router.js',
  'web/src/nav.js',
  'web/src/help/registry.js',
  'content/formation',
  'content/legal/confidentialite.md',
]

const PARCOURS_RE = /^[a-z]+$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * Sépare le front-matter minimal (clé: valeur, une par ligne) du corps.
 * @param {string} raw contenu d'un fichier Markdown
 * @returns {{meta: Record<string, string>, body: string}} corps sans le
 *   front-matter ni les lignes vides qui le suivent
 */
export function stripFrontMatter(raw) {
  const text = String(raw ?? '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  const meta = {}
  if (!match) return { meta, body: text }
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body: text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '') }
}

/**
 * Rend absolus les liens Markdown vers une route de l'application :
 * `](#/guides)` devient `](https://humanome.xyz/#/guides)`. Les autres liens
 * (http, https, relatifs, ancres de page) ne changent pas.
 * @param {string} md
 * @param {string} siteUrl adresse du site, sans barre finale
 * @returns {string}
 */
export function absolutizeHashLinks(md, siteUrl) {
  return String(md).replace(/\]\(#\//g, `](${siteUrl}/#/`)
}

/**
 * Rend absolus les liens d'un chapitre vers un autre chapitre du même parcours
 * (`](02-….md)`), pour un texte lu hors de son dossier (llms-full.txt).
 * @param {string} md
 * @param {string} baseUrl adresse du dossier publié du parcours
 * @returns {string}
 */
export function absolutizeChapterLinks(md, baseUrl) {
  return String(md).replace(/\]\((?:\.\/)?([0-9][0-9a-z-]*\.md)((?:#[^)\s]*)?)\)/g, `](${baseUrl}/$1$2)`)
}

/**
 * Abaisse les titres ATX d'un texte Markdown (`# T` devient `### T` pour
 * `levels` = 2, sans dépasser le niveau 6), hors des blocs de code délimités :
 * un chapitre se range ainsi sous les sections de llms-full.txt.
 * @param {string} md
 * @param {number} levels
 * @returns {string}
 */
export function demoteHeadings(md, levels) {
  let fence = null
  return String(md)
    .split('\n')
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (marker) {
        if (fence === null) fence = marker[1][0]
        else if (marker[1][0] === fence) fence = null
        return line
      }
      if (fence !== null) return line
      const heading = /^(#{1,6})([ \t]|$)/.exec(line)
      if (!heading) return line
      const depth = Math.min(6, heading[1].length + levels)
      return `${'#'.repeat(depth)}${line.slice(heading[1].length)}`
    })
    .join('\n')
}

/**
 * Adresse du site lue dans l'environnement (SITE_URL), sans barre finale.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function siteUrlFrom(env) {
  const raw = (env.SITE_URL ?? '').trim()
  if (raw === '') return DEFAULT_SITE_URL
  const url = raw.replace(/\/+$/, '')
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(url)) {
    throw new Error(`SITE_URL invalide : « ${raw} » (attendu : https://hôte, sans chemin)`)
  }
  return url
}

/**
 * Politique de robots.txt lue dans l'environnement (ROBOTS_POLICY).
 * @param {Record<string, string | undefined>} env
 * @returns {'index' | 'noindex'}
 */
export function robotsPolicyFrom(env) {
  const raw = (env.ROBOTS_POLICY ?? '').trim()
  if (raw === '') return ROBOTS_POLICIES[0]
  if (!ROBOTS_POLICIES.includes(raw)) {
    throw new Error(`ROBOTS_POLICY invalide : « ${raw} » (attendu : ${ROBOTS_POLICIES.join(' ou ')})`)
  }
  return /** @type {'index' | 'noindex'} */ (raw)
}

/**
 * Lit les sources de la carte, et elles seules (SOURCES). C'est la seule
 * fonction de ce module qui touche au disque.
 * @param {string} repoRoot racine du dépôt (ou d'un miroir)
 * @returns {Promise<object>} entrées de collectSiteMap
 */
export async function loadSources(repoRoot) {
  const load = (rel) => import(pathToFileURL(join(repoRoot, rel)).href)
  const [catalogue, router, nav, help] = await Promise.all(SOURCES.slice(0, 4).map(load))
  const bodies = {}
  const read = (rel) => {
    const raw = readFileSync(join(repoRoot, rel), 'utf8')
    bodies[rel] = raw
    return raw
  }

  const formationDir = join(repoRoot, 'content/formation')
  const formation = readdirSync(formationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((parcours) => {
      if (!PARCOURS_RE.test(parcours)) throw new Error(`nom de parcours inattendu : ${parcours}`)
      const files = readdirSync(join(formationDir, parcours))
        .filter((file) => file.endsWith('.md'))
        .sort()
      const index = files.includes('index.md')
        ? stripFrontMatter(readFileSync(join(formationDir, parcours, 'index.md'), 'utf8')).meta
        : {}
      const chapitres = files
        .filter((file) => file !== 'index.md')
        .map((file) => {
          const slug = file.replace(/\.md$/, '')
          if (!SLUG_RE.test(slug)) throw new Error(`nom de chapitre inattendu : ${parcours}/${file}`)
          const source = `content/formation/${parcours}/${file}`
          return { slug, source, meta: stripFrontMatter(read(source)).meta }
        })
      return { parcours, meta: index, chapitres }
    })

  const legalSource = 'content/legal/confidentialite.md'
  const legal = [{ cle: 'confidentialite', source: legalSource, meta: stripFrontMatter(read(legalSource)).meta }]

  return {
    catalogue: catalogue.ROUTE_CATALOGUE,
    aideSansRoute: catalogue.AIDE_SANS_ROUTE,
    parseHash: router.parseHash,
    navGroups: nav.navGroups,
    roleLabels: nav.ROLE_LABELS,
    helpEntries: help.HELP_ENTRIES,
    formation,
    legal,
    bodies,
  }
}

/**
 * Refuse un catalogue que le routeur contredit : chaque adresse concrète doit
 * se résoudre vers le nom de sa ligne, chaque nom être unique.
 * @param {Array<object>} catalogue ROUTE_CATALOGUE
 * @param {(hash: string) => {name: string}} parseHash
 */
export function checkCatalogue(catalogue, parseHash) {
  const names = new Set()
  for (const entry of catalogue) {
    if (names.has(entry.name)) throw new Error(`catalogue des routes : « ${entry.name} » en double`)
    names.add(entry.name)
    const concrete = [entry.exemple, ...(entry.variantes ?? []), ...(entry.modeles ?? []).map((m) => m.exemple)]
    for (const hash of concrete) {
      const resolved = parseHash(hash).name
      if (resolved !== entry.name) {
        throw new Error(`catalogue des routes : ${hash} se résout vers « ${resolved} », pas « ${entry.name} »`)
      }
    }
  }
}

const itemKey = (item) => `${item.href}\u0000${item.label}`

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Public d'un item : ses propres rôles quand il en restreint (un seul suffit
 * pour `roles`, tous sont requis pour `allRoles`), sinon celui de sa famille.
 */
function itemAudience(family, item, roleLabels) {
  const label = (role) => roleLabels[role] ?? role
  if (item.allRoles) return capitalize(item.allRoles.map(label).join(' et '))
  if (item.roles) return capitalize(item.roles.map(label).join(' ou '))
  return family.audience
}

/**
 * Familles du menu, toutes sessions confondues : celles d'un compte qui a tous
 * les rôles, en mode expert (tous les items), puis celles d'un visiteur, dont
 * la famille « Compte » ajoute « Se connecter ». Le mode d'affichage n'est
 * jamais un droit : les items `expert` sont listés, et marqués.
 */
function mergeFamilies(navGroups, roleLabels) {
  const full = navGroups({ roles: Object.keys(roleLabels), authenticated: true, expert: true })
  const visitor = navGroups({ roles: [], authenticated: false, expert: true })
  const visitorKeys = new Map(visitor.map((family) => [family.id, new Set(family.items.map(itemKey))]))
  const fullKeys = new Map(full.map((family) => [family.id, new Set(family.items.map(itemKey))]))
  const order = [...full.map((family) => family.id), ...visitor.map((family) => family.id)]
  const ids = order.filter((id, index) => order.indexOf(id) === index)
  return ids.map((id) => {
    const base = full.find((family) => family.id === id) ?? visitor.find((family) => family.id === id)
    const others = visitor.find((family) => family.id === id)
    const items = [...base.items]
    for (const item of others?.items ?? []) {
      if (!items.some((known) => itemKey(known) === itemKey(item))) items.push(item)
    }
    return {
      id,
      label: base.label,
      intent: base.intent,
      audience: base.audience,
      roles: base.roles ?? null,
      items: items.map((item) => ({
        href: item.href,
        label: item.label,
        route: item.route ?? null,
        section: item.section ?? null,
        badge: item.badge ?? null,
        hint: item.hint ?? null,
        roles: item.roles ?? null,
        allRoles: item.allRoles ?? null,
        expert: Boolean(item.expert),
        visiteur: visitorKeys.get(id)?.has(itemKey(item)) ?? false,
        connecte: fullKeys.get(id)?.has(itemKey(item)) ?? false,
      })),
    }
  })
}

/**
 * Construit la carte du site (le contenu de site-map.json) : sans corps de
 * chapitre ni date, triée dans l'ordre du menu, puis du catalogue, puis des
 * chapitres.
 * @param {object} sources résultat de loadSources (ou équivalent)
 * @param {{siteUrl?: string}} [options]
 * @returns {object}
 */
export function collectSiteMap(sources, { siteUrl = DEFAULT_SITE_URL } = {}) {
  const { catalogue, aideSansRoute, parseHash, navGroups, roleLabels, helpEntries, formation, legal } = sources
  checkCatalogue(catalogue, parseHash)
  for (const entry of catalogue) {
    if (entry.aide && !helpEntries[entry.aide]) {
      throw new Error(`catalogue des routes : aide « ${entry.aide} » absente du registre`)
    }
  }

  const familles = mergeFamilies(navGroups, roleLabels)
  const menuItems = familles.flatMap((family) => family.items.map((item) => ({ family, item })))
  const menuOrder = (name) => {
    const index = menuItems.findIndex(({ item }) => item.route === name)
    return index === -1 ? menuItems.length : index
  }
  const ordered = catalogue
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => menuOrder(a.entry.name) - menuOrder(b.entry.name) || a.index - b.index)
    .map(({ entry }) => entry)

  const pages = ordered.map((entry) => {
    const href = entry.modele ?? entry.exemple
    const help = entry.aide ? helpEntries[entry.aide] : null
    const ofRoute = menuItems.filter(({ item }) => item.route === entry.name)
    // Le libellé du menu pour l'adresse même de la page ; celui du visiteur
    // d'abord pour une page publique (« Se connecter » plutôt que « Profil »).
    const same = ofRoute.filter(({ item }) => item.href === href)
    const preferred = entry.public ? [...same.filter(({ item }) => item.visiteur), ...same] : same
    const first = preferred[0]?.item ?? null
    const distinct = (values) => values.filter((value, index) => value && values.indexOf(value) === index)
    return {
      route: entry.name,
      href,
      modele: Boolean(entry.modele),
      variantes: [...(entry.variantes ?? [])],
      modeles: (entry.modeles ?? []).map((m) => m.modele),
      titre: help?.titre ?? null,
      resume: help?.intro ?? null,
      points: [...(help?.points ?? [])],
      navLabel: first?.label ?? null,
      hint: first?.hint ?? null,
      badges: distinct(same.map(({ item }) => item.badge)),
      audience: distinct(ofRoute.map(({ family, item }) => itemAudience(family, item, roleLabels))),
      familles: distinct(ofRoute.map(({ family }) => family.id)),
      dansMenu: ofRoute.length > 0,
      expert: ofRoute.length > 0 && ofRoute.every(({ item }) => item.expert),
      public: Boolean(entry.public),
      interne: Boolean(entry.interne),
    }
  })

  const rank = (parcours) => {
    const index = PARCOURS_PUBLIES.indexOf(parcours)
    return index === -1 ? PARCOURS_PUBLIES.length : index
  }
  const guides = [...formation]
    .sort((a, b) => rank(a.parcours) - rank(b.parcours) || (a.parcours < b.parcours ? -1 : a.parcours > b.parcours ? 1 : 0))
    .map(({ parcours, meta, chapitres }) => {
      const publie = PARCOURS_PUBLIES.includes(parcours)
      return {
        parcours,
        titre: meta.titre || parcours,
        href: `#/guides/${parcours}`,
        publie,
        chapitres: chapitres
          .map(({ slug, source, meta: chapterMeta }) => ({
            slug,
            titre: chapterMeta.titre || slug,
            ordre: Number(chapterMeta.chapitre ?? 0) || 0,
            href: `#/guides/${parcours}/${slug}`,
            fichier: publie ? `/guides/${parcours}/${slug}.md` : null,
            source,
          }))
          .sort((a, b) => a.ordre - b.ordre || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
      }
    })

  return {
    version: 1,
    site: { url: siteUrl, titre: SITE_NAME, resume: helpEntries.home?.intro ?? '' },
    familles,
    pages,
    aideSansRoute: aideSansRoute.map((cle) => ({
      cle,
      titre: helpEntries[cle]?.titre ?? cle,
      resume: helpEntries[cle]?.intro ?? '',
      points: [...(helpEntries[cle]?.points ?? [])],
    })),
    guides,
    legal: legal.map(({ cle, source, meta }) => ({
      cle,
      titre: meta.titre || cle,
      maj: /^\d{4}-\d{2}-\d{2}$/.test(meta.maj ?? '') ? meta.maj : null,
      href: `#/${cle}`,
      fichier: `/legal/${cle}.md`,
      source,
    })),
    roles: { ...roleLabels },
  }
}

/** @returns {string} site-map.json, indenté, terminé par un saut de ligne */
export function renderSiteMapJson(map) {
  return `${JSON.stringify(map, null, 2)}\n`
}

/** Pages publiées : ni interne, ni sans aide. */
const publishedPages = (map) => map.pages.filter((page) => !page.interne && page.titre)

/** Adresses que le menu ne montre pas (espaces, modèles, racines sans item). */
function addressesOutsideMenu(map) {
  const menuHrefs = new Set(map.familles.flatMap((family) => family.items.map((item) => item.href)))
  const out = []
  for (const page of publishedPages(map)) {
    if (!menuHrefs.has(page.href)) out.push({ href: page.href, page, modele: page.modele })
    for (const href of page.variantes) if (!menuHrefs.has(href)) out.push({ href, page, modele: false })
    for (const href of page.modeles) out.push({ href, page, modele: true })
  }
  return out
}

/**
 * Le digest de navigation injecté dans la consigne de l'assistant tuteur :
 * le menu (toutes familles, « Compte » compris), les adresses hors menu, ce
 * que fait chaque page (titre, résumé et points de l'aide), les titres des
 * chapitres des guides — jamais leur corps — et les libellés des rôles.
 * @param {object} map résultat de collectSiteMap
 * @returns {string}
 */
export function renderDigest(map) {
  const lines = []
  lines.push('# Digest de navigation humanome.xyz (pour l’assistant tuteur)')
  lines.push('')
  lines.push('## Ce que chaque profil peut faire, et par où passer (routes #/…)')
  lines.push('')
  lines.push(
    'Les liens marqués « mode expert » ne sont listés au menu qu’en mode expert (réglage au bas du menu) ; ' +
      'leur adresse reste valide en mode simple. Le mode est un réglage d’affichage, jamais un droit.',
  )
  lines.push('')
  for (const family of map.familles) {
    const audience = family.audience ? ` — pour : ${family.audience}` : ''
    lines.push(`### ${family.label} (${family.intent})${audience}`)
    for (const item of family.items) {
      const badge = item.badge ? ` [${item.badge}]` : ''
      const hint = item.hint ? ` — ${item.hint}` : ''
      const notes = []
      if (!family.roles && item.connecte && !item.visiteur) notes.push('connecté')
      if (!family.roles && item.visiteur && !item.connecte) notes.push('sans compte')
      if (item.expert) notes.push('mode expert')
      const note = notes.length > 0 ? ` (${notes.join(', ')})` : ''
      lines.push(`- ${item.label} : \`${item.href}\`${badge}${hint}${note}`)
    }
    lines.push('')
  }

  lines.push('## Autres adresses (hors menu)')
  lines.push('')
  for (const { href, page, modele } of addressesOutsideMenu(map)) {
    const space = href.startsWith(`${page.href}/`) && !modele ? ` — espace « ${href.slice(page.href.length + 1)} »` : ''
    const note = !modele
      ? ''
      : href.includes('AAAA-MM-JJ')
        ? ' (modèle : AAAA-MM-JJ est une date)'
        : ' (modèle : la partie entre <…> est à compléter)'
    lines.push(`- \`${href}\` : ${page.titre}${space}${note}`)
  }
  lines.push('')

  lines.push('## Ce que fait chaque page (aide de chaque rubrique)')
  lines.push('')
  for (const page of publishedPages(map)) {
    lines.push(`### ${page.titre} (\`${page.href}\`)`)
    lines.push(page.resume)
    for (const point of page.points) lines.push(`- ${point}`)
    lines.push('')
  }
  for (const entry of map.aideSansRoute) {
    lines.push(`### ${entry.titre} (profil de l’accueil, sans page propre)`)
    lines.push(entry.resume)
    for (const point of entry.points) lines.push(`- ${point}`)
    lines.push('')
  }

  lines.push('## Manuels de formation par profil (hub public #/guides)')
  lines.push('')
  for (const guide of map.guides) {
    lines.push(`### ${guide.titre} (\`${guide.href}\`)`)
    for (const chapter of guide.chapitres) lines.push(`- ${chapter.titre} (\`${chapter.href}\`)`)
    lines.push('')
  }

  lines.push('## Libellés des rôles')
  lines.push(
    Object.entries(map.roles)
      .map(([key, label]) => `${key} = ${label}`)
      .join(' · '),
  )
  lines.push('')
  return lines.join('\n')
}

/** Titre de lien Markdown sûr (crochets et sauts de ligne neutralisés). */
const linkText = (text) => String(text).replace(/\s+/g, ' ').replace(/([[\]])/g, '\\$1')

/** Note d'un item de llms.txt : badge et indice, audience, résumé. */
function pageNote(page) {
  const head = [...page.badges, page.hint].filter(Boolean).join(', ')
  const audience = !page.public && page.audience.length > 0 ? `pour : ${page.audience.join(' · ')}` : ''
  return [head, audience, page.resume].filter(Boolean).join('. ')
}

const PRESENTATION =
  'humanome.xyz est une application d’une seule page : ses rubriques ont des adresses en #/…, affichées par un ' +
  'navigateur qui exécute JavaScript. Les guides ci-dessous existent aussi en Markdown brut, et la documentation ' +
  'intégrale tient dans un seul fichier.'

/**
 * /llms.txt au format llmstxt.org : un titre, un résumé en citation, des
 * sections de liens, une section « Optional ».
 * @param {object} map résultat de collectSiteMap
 * @returns {string}
 */
export function renderLlmsTxt(map) {
  const url = map.site.url
  const lines = [`# ${map.site.titre}`, '', `> ${map.site.resume}`, '', PRESENTATION, '']
  const linkable = publishedPages(map).filter((page) => !page.modele)
  const section = (title, pages) => {
    lines.push(`## ${title}`, '')
    for (const page of pages) {
      lines.push(`- [${linkText(page.navLabel ?? page.titre)}](${url}/${page.href}): ${pageNote(page)}`)
    }
    lines.push('')
  }
  section('Rubriques ouvertes à tous', linkable.filter((page) => page.public))
  section('Espaces avec un compte ou un rôle', linkable.filter((page) => !page.public))

  lines.push('## Guides par profil (Markdown)', '')
  for (const guide of map.guides.filter((g) => g.publie)) {
    for (const chapter of guide.chapitres) {
      lines.push(`- [${linkText(`${guide.titre} — ${chapter.titre}`)}](${url}${chapter.fichier})`)
    }
  }
  lines.push('')

  lines.push('## Données et confidentialité', '')
  for (const doc of map.legal) {
    const maj = doc.maj ? `: mise à jour du ${doc.maj}` : ''
    lines.push(`- [${linkText(doc.titre)}](${url}${doc.fichier})${maj}`)
  }
  lines.push('')

  lines.push('## Optional', '')
  lines.push(
    `- [Documentation intégrale](${url}/llms-full.txt): rubriques, mini-documentation et guides en un seul fichier`,
  )
  lines.push('')
  return lines.join('\n')
}

/**
 * Un chapitre publié en Markdown : corps sans front-matter, liens vers
 * l'application rendus absolus, puis sa source dans l'application.
 * @param {object} map résultat de collectSiteMap
 * @param {{href: string}} entry chapitre (ou document légal) de la carte
 * @param {string} raw contenu du fichier source
 * @returns {string}
 */
export function renderGuideMarkdown(map, entry, raw) {
  const body = absolutizeHashLinks(stripFrontMatter(raw).body, map.site.url).trimEnd()
  return `${body}\n\n---\n\nSource : ${map.site.url}/${entry.href}\n`
}

/**
 * /llms-full.txt : le résumé, chaque page (résumé et points de l'aide), chaque
 * chapitre publié (corps intégral, liens absolus), puis la confidentialité.
 * @param {object} map résultat de collectSiteMap
 * @param {Record<string, string>} bodies contenu des sources, par chemin
 * @returns {string}
 */
export function renderLlmsFull(map, bodies) {
  const url = map.site.url
  const lines = [`# ${map.site.titre} — documentation intégrale`, '', `> ${map.site.resume}`, '', PRESENTATION, '']
  lines.push(`Index : ${url}/llms.txt`, '')

  lines.push('## Rubriques du site', '')
  for (const page of publishedPages(map)) {
    lines.push(`### ${page.titre}`, '')
    lines.push(`${page.modele ? 'Adresse (modèle à compléter)' : 'Adresse'} : ${url}/${page.href}`)
    const others = page.variantes.map((href) => `${url}/${href}`)
    if (others.length > 0) lines.push(`Autres adresses : ${others.join(', ')}`)
    if (page.modeles.length > 0) lines.push(`Modèles à compléter : ${page.modeles.map((href) => `${url}/${href}`).join(', ')}`)
    const tags = [...page.badges, page.expert ? 'listée au menu en mode expert' : null].filter(Boolean)
    if (page.audience.length > 0) lines.push(`Pour : ${page.audience.join(' · ')}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`)
    lines.push('', page.resume)
    if (page.points.length > 0) lines.push('', ...page.points.map((point) => `- ${point}`))
    lines.push('')
  }
  for (const entry of map.aideSansRoute) {
    lines.push(`### ${entry.titre}`, '', 'Profil des tuiles de l’accueil, sans page propre.', '', entry.resume)
    if (entry.points.length > 0) lines.push('', ...entry.points.map((point) => `- ${point}`))
    lines.push('')
  }

  lines.push('## Guides par profil', '')
  for (const guide of map.guides.filter((g) => g.publie)) {
    lines.push(`### ${guide.titre}`, '', `Hub : ${url}/${guide.href}`, '')
    const folder = `${url}/guides/${guide.parcours}`
    for (const chapter of guide.chapitres) {
      const body = demoteHeadings(
        absolutizeChapterLinks(absolutizeHashLinks(stripFrontMatter(bodies[chapter.source]).body, url), folder),
        3,
      )
      lines.push('---', '', `Source : ${url}/${chapter.href} — Markdown : ${url}${chapter.fichier}`, '', body.trimEnd(), '')
    }
  }

  lines.push('## Données et confidentialité', '')
  for (const doc of map.legal) {
    const maj = doc.maj ? ` — mise à jour du ${doc.maj}` : ''
    lines.push(`Source : ${url}/${doc.href}${maj}`, '')
    lines.push(demoteHeadings(absolutizeHashLinks(stripFrontMatter(bodies[doc.source]).body, url), 2).trimEnd(), '')
  }
  return lines.join('\n')
}

const xmlEscape = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/**
 * /sitemap.xml : des URL réelles seulement (la racine, llms.txt,
 * llms-full.txt, les .md publiés) — jamais une route #/…, que les robots
 * confondent avec la racine. `lastmod` seulement depuis un front-matter `maj:`.
 * @param {object} map résultat de collectSiteMap
 * @returns {string}
 */
export function renderSitemap(map) {
  const url = map.site.url
  const entries = [
    { loc: `${url}/` },
    { loc: `${url}/llms.txt` },
    { loc: `${url}/llms-full.txt` },
    ...map.guides.filter((g) => g.publie).flatMap((g) => g.chapitres.map((c) => ({ loc: `${url}${c.fichier}` }))),
    ...map.legal.map((doc) => ({ loc: `${url}${doc.fichier}`, lastmod: doc.maj })),
  ]
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  for (const { loc, lastmod } of entries) {
    lines.push(`  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

/**
 * /robots.txt selon la politique : `index` ouvre tout le site sauf l'API et
 * annonce le sitemap ; `noindex` (site de test) ferme tout, llms.txt compris.
 * @param {object} map résultat de collectSiteMap
 * @param {'index' | 'noindex'} policy
 * @returns {string}
 */
export function renderRobots(map, policy) {
  if (!ROBOTS_POLICIES.includes(policy)) throw new Error(`politique de robots inconnue : ${policy}`)
  const head = `# ${map.site.titre} — généré par scripts/build-site-map.mjs (ROBOTS_POLICY=${policy})`
  if (policy === 'noindex') return `${head}\nUser-agent: *\nDisallow: /\n`
  return `${head}\nUser-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${map.site.url}/sitemap.xml\n`
}

/**
 * Tous les fichiers publics, chemins relatifs au webroot (web/public).
 * @param {object} map résultat de collectSiteMap
 * @param {Record<string, string>} bodies contenu des sources, par chemin
 * @param {'index' | 'noindex'} policy
 * @returns {Array<{path: string, content: string}>}
 */
export function publicFiles(map, bodies, policy) {
  const files = [
    { path: 'llms.txt', content: renderLlmsTxt(map) },
    { path: 'llms-full.txt', content: renderLlmsFull(map, bodies) },
    { path: 'sitemap.xml', content: renderSitemap(map) },
    { path: 'robots.txt', content: renderRobots(map, policy) },
  ]
  for (const guide of map.guides.filter((g) => g.publie)) {
    for (const chapter of guide.chapitres) {
      files.push({ path: chapter.fichier.slice(1), content: renderGuideMarkdown(map, chapter, bodies[chapter.source]) })
    }
  }
  for (const doc of map.legal) {
    files.push({ path: doc.fichier.slice(1), content: renderGuideMarkdown(map, doc, bodies[doc.source]) })
  }
  return files
}
