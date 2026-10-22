#!/usr/bin/env node
// Convertit le YAML du référentiel Humanome (celui que publie
// https://respire.school/referentiel, « humanome_v18.yaml ») en document du
// schéma `referentiel` 2.1.0, prêt pour l'amorçage
// (scripts/amorcer-referentiel.php) ou pour l'atelier des épistémiarques
// (S5, lot B ; règles : engine/src/referentiel-humanome.js et
// docs/referentiel-humanome.md).
//
// Usage :
//   node scripts/convertir-humanome.mjs <fichier.yaml>
//        [--out <dossier>]            défaut : build/referentiels (gitignoré, jamais déployé)
//        [--niveau capacité|facette]  défaut : capacité (20 compétences, facettes en éléments)
//        [--url <url du fichier>]     défaut : la page https://respire.school/referentiel
//
// Écrit <id>-v<version>.json (<id>-v<version>-facette.json au niveau
// facette), avec son contentHash, calculé comme ContentHash::compute (PHP).
// Une version est immuable : un fichier de même nom converti d'un autre YAML
// (autre sha256 dans `source`) n'est pas écrasé — il faut une nouvelle
// version dans le YAML. Aucun vrai référentiel n'entre dans le dépôt : ni le
// YAML ni le JSON converti ne se committent (la fixture des tests est fictive).
//
// Sortie 0 (écrit, ou déjà à jour), 1 (refus, avec la raison).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ErreurConversion, convertirHumanome } from '../engine/src/referentiel-humanome.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Le paquet `yaml` est une devDependency du moteur : on le résout depuis
// engine/, d'où que le script soit lancé (comme ajv dans build-validators.mjs).
const engineRequire = createRequire(resolve(repoRoot, 'engine/package.json'))
const YAML = engineRequire('yaml')

const sha256 = (contenu) => createHash('sha256').update(contenu).digest('hex')
const shaDeSource = (document) => /\(sha256 ([0-9a-f]{64})\)/.exec(String(document?.source ?? ''))?.[1] ?? null

function echouer(message) {
  console.error(message)
  process.exit(1)
}

let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', default: join(repoRoot, 'build/referentiels') },
      niveau: { type: 'string', default: 'capacité' },
      url: { type: 'string' },
    },
  })
} catch (e) {
  echouer(e.message)
}
const [entree] = args.positionals
if (args.positionals.length !== 1) {
  echouer('Usage : node scripts/convertir-humanome.mjs <fichier.yaml> [--out <dossier>] [--niveau capacité|facette] [--url <url>]')
}
const niveau = args.values.niveau === 'capacite' ? 'capacité' : args.values.niveau
if (niveau !== 'capacité' && niveau !== 'facette') echouer(`Niveau inconnu : « ${niveau} » (capacité ou facette)`)

const octets = readFileSync(resolve(entree))
let yaml
try {
  yaml = YAML.parse(octets.toString('utf8'), { uniqueKeys: true, maxAliasCount: 100 })
} catch (e) {
  echouer(`YAML illisible : ${e.message}`)
}

let resultat
try {
  resultat = convertirHumanome(yaml, {
    // le nom seul, jamais un chemin du poste ; macOS peut le rendre décomposé
    fichier: basename(entree).normalize('NFC'),
    sha256: sha256(octets),
    ...(args.values.url ? { url: args.values.url } : {}),
    niveau,
    hacher: sha256,
  })
} catch (e) {
  echouer(e instanceof ErreurConversion ? e.message : `Conversion impossible : ${e.message}`)
}
const { document, avertissements } = resultat
for (const a of avertissements) console.warn(`avertissement : ${a}`)

const sortie = join(
  resolve(args.values.out),
  `${document.id}-v${document.version}${niveau === 'facette' ? '-facette' : ''}.json`,
)
const json = `${JSON.stringify(document, null, 2)}\n`
if (existsSync(sortie)) {
  const present = readFileSync(sortie, 'utf8')
  if (present === json) {
    console.log(`déjà à jour : ${sortie}`)
    process.exit(0)
  }
  let ancien = null
  try {
    ancien = JSON.parse(present)
  } catch {
    // illisible : réécrit
  }
  const avant = shaDeSource(ancien)
  if (avant !== null && avant !== shaDeSource(document)) {
    echouer(`Refusé : ${sortie} vient d'un autre fichier (sha256 ${avant}) pour la même version ${document.version}. `
      + 'Une version est immuable : donnez une nouvelle version au YAML, ou écrivez ailleurs (--out).')
  }
  console.warn(`réécrit (même fichier source, autre conversion) : ${sortie}`)
}
mkdirSync(dirname(sortie), { recursive: true })
writeFileSync(sortie, json)
const elements = document.competences.reduce((n, c) => n + (c.elements?.length ?? 0), 0)
console.log(
  `${document.label} (${document.id} ${document.version}) : ${document.poles.length} pôles, `
  + `${document.competences.length} compétences au niveau ${niveau}`
  + `${elements > 0 ? `, ${elements} éléments` : ''} -> ${sortie} (contentHash ${document.contentHash.slice(0, 12)})`,
)
