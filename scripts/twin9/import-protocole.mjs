#!/usr/bin/env node
// Import the CONFIDENTIAL Twin_v9 templates into the platform database
// (ADR-010: the templates live in `twin9_protocole`, never in the repo).
//
// Reads TWIN_V9_DIR (default: ../Twin_v9 next to the repo root, gitignored)
//   php/protocole/**/*.md -> {"lourd/20-greffier": "<content>", ...}: the v9.8's
//                         templates as the PHP engine reads them, the referential
//                         as variables and without the pole files, whose fiches
//                         come from the base (T16); the import replaces the set
//   protocole/tagger/  -> RESPIRE v7's structure (pole and competence names,
//                         the poles' accented names), which /meta serves the
//                         open cartography (Twin6): P1..P7.md read by the
//                         platform's port of the v9.8's parse_pole
//                         (web/src/lib/twin9/referentiel.js), no Python since
//                         2026-10-21
// and POSTs {files, referentiel} to {BASE_URL}/api/admin/twin9/import with the
// X-Migrate-Token from .env.deploy (or the MIGRATE_TOKEN env var).
//
// The templates of ONE commit, the release's (T18, « en version figée ») :
// TWIN_V9_DIR must be the root of a git checkout without uncommitted changes in
// php/protocole and protocole/tagger, untracked files included; when a release
// is staged (build/api-release/Twin_v9/COMMIT, stage-api.sh), it must embed
// that very commit — else code 1, nothing sent. The commit is printed. It no
// longer sends config.json's protocol settings nor the pole fiches
// (2026-10-20): they served the browser's engine (T11), and the server runs
// take theirs from their profile (T12) and from the base (T16).
//
// Usage:
//   node scripts/twin9/import-protocole.mjs                       # production (SITE_URL)
//   node scripts/twin9/import-protocole.mjs --base-url http://localhost:8080
//   node scripts/twin9/import-protocole.mjs --dry-run             # list files, no POST
//
// SECRECY: this script never prints template content — names and sizes only.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePole } from '../../web/src/lib/twin9/referentiel.js'
import { cleanCommit } from '../deploy/twin9-checkout.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(argv) {
  const args = { baseUrl: null, dryRun: false }
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--base-url') args.baseUrl = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return args
}

/** .env.deploy loader (pattern scripts/deploy/deploy.mjs); optional in dev. */
function loadEnvDeploy() {
  const path = join(repoRoot, '.env.deploy')
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2]
  }
  return env
}

/**
 * RESPIRE v7's structure from the v9.8's pole files, as its load_referentiel
 * reads them: P1..P7.md of protocole/tagger, universal newlines, each through
 * parse_pole (ported, parsePole), codes unique across poles. Keeps the
 * non-secret structure only: pole num and accented name, competence code and
 * name — never a fiche.
 *
 * @returns {{num: number, nom: string, competences: {code: string, nom: string}[]}[]}
 */
function referentielDuTagger(twinDir) {
  const dir = join(twinDir, 'protocole', 'tagger')
  const codes = new Set()
  const poles = []
  for (let n = 1; n <= 7; n += 1) {
    const path = join(dir, `P${n}.md`)
    const pole = parsePole(readFileSync(path, 'utf8').replace(/\r\n?/g, '\n'), n, path)
    for (const c of pole.competences) {
      if (codes.has(c.code)) throw new Error(`Code dupliqué dans le référentiel : ${c.code}`)
      codes.add(c.code)
    }
    poles.push({ num: n, nom: pole.nom, competences: pole.competences.map(({ code, nom }) => ({ code, nom })) })
  }
  return poles
}

function walkMarkdownFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdownFiles(full, base))
    else if (entry.name.endsWith('.md')) out.push(relative(base, full))
  }
  return out.sort()
}

async function main() {
  const args = parseArgs(process.argv)
  const env = loadEnvDeploy()

  const twinDir = process.env.TWIN_V9_DIR ?? resolve(repoRoot, '../Twin_v9')
  const protocoleDir = join(twinDir, 'php', 'protocole')
  if (!statSync(protocoleDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Twin_v9 php/protocole directory not found: ${protocoleDir} (set TWIN_V9_DIR; Twin_v9 after T16)`)
  }

  // php/protocole/**/*.md -> {'lourd/20-greffier': content}
  const files = {}
  for (const rel of walkMarkdownFiles(protocoleDir)) {
    const name = rel.split(sep).join('/').replace(/\.md$/, '')
    files[name] = readFileSync(join(protocoleDir, rel), 'utf8')
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`No .md template found under ${protocoleDir}`)
  }

  // One commit, the release's: the engine production runs and its templates.
  const commit = cleanCommit(twinDir, ['php/protocole', 'protocole/tagger'])
  const staged = join(repoRoot, 'build', 'api-release', 'Twin_v9', 'COMMIT')
  if (existsSync(staged)) {
    const embedded = readFileSync(staged, 'utf8').trim()
    if (embedded !== commit) {
      throw new Error(
        `the staged release embeds Twin_v9 ${embedded}, ${twinDir} is at ${commit}: these templates are not ` +
          `its engine's — check out ${embedded}, or stage and deploy again (stage-api.sh, deploy.mjs api)`,
      )
    }
  } else {
    console.warn('no staged release (build/api-release): the commit is not compared with the engine deployed')
  }

  // Non-secret referentiel STRUCTURE (pole num/nom + competence code/nom)
  // that /meta serves the open cartography, read from the v9.8's pole files;
  // best-effort with a clear warning if they are missing or unreadable (the
  // server keeps its previous structure).
  let referentiel
  try {
    referentiel = referentielDuTagger(twinDir)
  } catch (e) {
    console.warn(`referentiel NOT extracted (protocole/tagger): ${e.message} — server keeps its current one`)
  }

  console.log(`Twin_v9 dir: ${twinDir}`)
  console.log(`Twin_v9 commit: ${commit}`)
  for (const [name, content] of Object.entries(files)) {
    console.log(`  ${name} (${Buffer.byteLength(content, 'utf8')} bytes)`)
  }
  console.log(referentiel ? `referentiel: ${referentiel.length} pôles` : 'referentiel absent')

  if (args.dryRun) {
    console.log('dry-run: nothing sent')
    return
  }

  const baseUrl = args.baseUrl ?? env.SITE_URL ?? 'https://humanome.xyz'
  const token = process.env.MIGRATE_TOKEN ?? env.MIGRATE_TOKEN
  if (!token) throw new Error('MIGRATE_TOKEN missing (.env.deploy or environment)')

  const res = await fetch(`${baseUrl}/api/admin/twin9/import`, {
    method: 'POST',
    headers: { 'X-Migrate-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files,
      ...(referentiel ? { referentiel } : {}),
    }),
  })
  const body = await res.text()
  console.log(`import: HTTP ${res.status} ${body.slice(0, 300)}`)
  if (!res.ok) throw new Error('twin9 import failed')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
