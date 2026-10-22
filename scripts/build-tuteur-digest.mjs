#!/usr/bin/env node
// Digest de documentation pour l'assistant tuteur (D9), et carte du site
// (sprint 11). Condense, à la build, la carte du site construite par
// scripts/lib/site-map.mjs : le plan du site par INTENTION (web/src/nav.js,
// toutes les familles, « Compte » compris, dans les deux modes d'affichage),
// les adresses hors menu (web/src/routes-catalogue.js), ce que fait chaque
// page (l'aide de chaque rubrique, web/src/help/registry.js) et les TITRES
// des chapitres des guides (content/formation/**). Le tuteur (proxy Haiku côté
// serveur) injecte ce digest dans son prompt système pour pointer chacun vers
// la bonne route — sans jamais exposer de contenu confidentiel (la
// bibliothèque ne lit qu'une liste blanche de sources ; aucun gabarit Twin9).
//
// Sorties : scripts/data/tuteur-digest.md et scripts/data/site-map.json
// (embarqués dans la release API par stage-api.sh, qui copie scripts/data/).
// Déterministes. SITE_URL (défaut https://humanome.xyz) fixe l'adresse que
// porte site-map.json.
//
// Usage : node scripts/build-tuteur-digest.mjs

import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSiteMap, loadSources, renderDigest, renderSiteMapJson, siteUrlFrom } from './lib/site-map.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const map = collectSiteMap(await loadSources(repoRoot), { siteUrl: siteUrlFrom(process.env) })
const out = renderDigest(map)
const json = renderSiteMapJson(map)
const outDir = join(repoRoot, 'scripts/data')
writeFileSync(join(outDir, 'tuteur-digest.md'), out, 'utf8')
writeFileSync(join(outDir, 'site-map.json'), json, 'utf8')
console.log(`wrote scripts/data/tuteur-digest.md (${out.length} caractères, ${map.guides.length} parcours)`)
console.log(`wrote scripts/data/site-map.json (${map.pages.length} routes, ${json.length} caractères)`)
