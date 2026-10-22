#!/usr/bin/env node
// Fichiers publics de la carte du site (sprint 11), lisibles par les IA et les
// robots, que le routage par fragment (ADR-009) rend aveugles à l'application :
// tout ce qu'ils voient est un index.html vide. Écrit dans web/public/, que Vite
// copie dans web/dist, puis deploy.mjs dans www/ :
//
//   llms.txt                      index au format llmstxt.org
//   llms-full.txt                 rubriques, mini-documentation, guides intégraux
//   guides/<parcours>/<slug>.md   chaque chapitre publié (PARCOURS_PUBLIES)
//   legal/confidentialite.md      la page de confidentialité
//   sitemap.xml                   des URL réelles seulement, jamais une route #/
//   robots.txt                    selon ROBOTS_POLICY
//
// Même bibliothèque que le digest de l'assistant (scripts/lib/site-map.mjs) :
// à commit égal, l'assistant et llms.txt disent la même chose. Déterministe ;
// rien n'est écrit si une source est incohérente. Les sorties sont gitignorées
// et régénérées à chaque build (prebuild de web/package.json).
//
// Environnement :
//   SITE_URL       adresse publique (défaut https://humanome.xyz), sans chemin
//   ROBOTS_POLICY  index (défaut : le site s'ouvre aux robots, sauf /api/)
//                  | noindex (site de test : rien n'est indexé, llms.txt compris)
//
// Usage : node scripts/build-site-map.mjs

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSiteMap, loadSources, publicFiles, robotsPolicyFrom, siteUrlFrom } from './lib/site-map.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webroot = join(repoRoot, 'web/public')

try {
  const policy = robotsPolicyFrom(process.env)
  const sources = await loadSources(repoRoot)
  const map = collectSiteMap(sources, { siteUrl: siteUrlFrom(process.env) })
  const files = publicFiles(map, sources.bodies, policy)

  // Les dossiers générés repartent de zéro : un chapitre retiré disparaît.
  rmSync(join(webroot, 'guides'), { recursive: true, force: true })
  rmSync(join(webroot, 'legal'), { recursive: true, force: true })
  for (const { path, content } of files) {
    mkdirSync(dirname(join(webroot, path)), { recursive: true })
    writeFileSync(join(webroot, path), content, 'utf8')
  }
  const markdown = files.filter(({ path }) => path.endsWith('.md')).length
  const size = (name) => files.find(({ path }) => path === name).content.length
  console.log(
    `wrote web/public : llms.txt (${size('llms.txt')} caractères), llms-full.txt (${size('llms-full.txt')} caractères), ` +
      `sitemap.xml, robots.txt (${policy}), ${markdown} fichiers .md — ${map.site.url}`,
  )
} catch (error) {
  console.error(`build-site-map : ${error.message}`)
  process.exit(1)
}
