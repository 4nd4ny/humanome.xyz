#!/usr/bin/env node
// DEV TOOL — machine runner in --once mode with the engine MOCK provider
// injected (P11 operational DoD, scripts/dev/dod-p11.sh step "runner Node").
//
// Exercises the REAL runner library (scripts/runner-node/runner.mjs: argument
// parsing, X-Worker-Token client, reservation loop, engine extractDay, result
// posting) against a REAL local API — only the LLM transport is replaced by
// the deterministic engine mock, answering from the cartographie-jour
// fixtures exactly like the server-side WORKER_PROVIDER=mock (api MockProvider):
// the requested pole is read in the prompt, kairos at its marker, the fixture
// day picked by the ISO date embedded in the prompt. Any referential
// (2026-10-20): for another one than RESPIRE v7, the fixture's answer carries
// the codes the prompt asks for, as api/src/Llm/MockProvider.php does.
//
// Usage:
//   node scripts/dev/runner-once-mock.mjs --api http://localhost:8080 --token <worker_token> [--limit 5]
//
// Never use against production: it would post FIXTURE documents to real jobs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createLogger, createRunner, parseArgs } from '../runner-node/runner.mjs'
import { createMockProvider } from '../../engine/src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURE_DAYS = ['2026-01-05', '2026-01-06', '2026-01-07']
const fixtures = new Map(FIXTURE_DAYS.map((day) => [
  day,
  JSON.parse(readFileSync(join(root, 'schemas', 'fixtures', `cartographie-jour-${day}.json`), 'utf8')),
]))

/** Where a kairos links codes (as the conformity reads them). */
const KAIROS_LISTS = [
  ['connexionsTransversales', 'codesRelies'],
  ['noeudsConceptuels', 'codesRelies'],
  ['competencesOrphelines', 'enRelationAvecCodes'],
]

/** Same selection logic as api/src/Llm/MockProvider.php (fixtureDocument). */
function fixtureFor(prompt) {
  const day = FIXTURE_DAYS.find((candidate) => prompt.includes(candidate)) ?? FIXTURE_DAYS[0]
  return fixtures.get(day)
}

/** The codes the extraction prompt orders (« les N codes … dans cet ordre »), or null. */
function requestedCodes(prompt) {
  const match = prompt.match(/contenir les \d+ codes\s+([\s\S]+?) dans cet ordre/)
  const codes = match ? match[1].split(',').map((c) => c.trim()).filter((c) => c !== '') : []
  return codes.length > 0 ? codes : null
}

/** The codes of the kairos prompt's referential block, or null. */
function referentielCodes(prompt) {
  const block = prompt.match(/^# Référentiel[^\n]*\n([\s\S]*?)(?=^# |$(?![\s\S]))/m)
  const codes = block ? [...block[1].matchAll(/^ {2}(\S+) — /gm)].map((m) => m[1]) : []
  return codes.length > 0 ? [...new Set(codes)] : null
}

function kairosCodes(kairos) {
  const codes = []
  for (const [liste, champ] of KAIROS_LISTS) {
    for (const entree of kairos?.emergencesCrossPoles?.[liste] ?? []) {
      for (const code of entree?.[champ] ?? []) codes.push(String(code))
    }
  }
  return [...new Set(codes)]
}

/** The fixture kairos, its i-th distinct code replaced by the i-th of the list (cycling). */
function withCodes(kairos, codes) {
  const map = new Map(kairosCodes(kairos).map((code, i) => [code, codes[i % codes.length]]))
  const copy = structuredClone(kairos)
  for (const [liste, champ] of KAIROS_LISTS) {
    for (const entree of copy.emergencesCrossPoles?.[liste] ?? []) {
      if (Array.isArray(entree?.[champ])) entree[champ] = entree[champ].map((c) => map.get(String(c)) ?? String(c))
    }
  }
  return copy
}

/** The requested pole: the fixture's for RESPIRE v7, else the fixture's with the prompt's codes. */
function poleAnswer(prompt, doc) {
  const match = prompt.match(/"poleNum":\s*"?(\d+)"?/) ?? prompt.match(/P[ôo]le\s+(\d+)\b/)
  if (!match) return null
  const num = match[1]
  const own = doc.poles.find((p) => String(p.poleNum) === num)
  const codes = requestedCodes(prompt)
  if (codes === null) return own ?? null
  const pole = own ?? doc.poles[Math.max(0, Number(num) - 1) % doc.poles.length]
  if (String(pole.poleNum) === num && pole.competences.every((c) => codes.includes(String(c.code)))) return pole
  return {
    ...pole,
    poleNum: num,
    competences: pole.competences.slice(0, codes.length).map((c, i) => ({ ...c, code: codes[i] })),
  }
}

/** Mock answers: kairos FIRST (its prompt embeds the referentiel bloc with
 *  « Pôle n — » markers), then the requested pole. */
function extractionResponses({ prompt }) {
  const doc = fixtureFor(prompt)
  if (prompt.includes('SYNTHÈSE KAIROS') || prompt.includes('kairos.apprenant')) {
    const codes = referentielCodes(prompt)
    const known = new Set(codes ?? [])
    const kairos = doc.kairos !== null && codes !== null && kairosCodes(doc.kairos).some((c) => !known.has(c))
      ? withCodes(doc.kairos, codes)
      : doc.kairos
    return JSON.stringify(kairos)
  }
  const pole = poleAnswer(prompt, doc)
  return pole === null ? 'réponse mock : aucun marqueur de pôle détecté' : JSON.stringify(pole)
}

// Exported for the tests; the CLI runs only when this file is the entry point.
export { extractionResponses }

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  // The CLI options go through the REAL parseArgs; provider/model are dummies
  // (resolveProviderConfig must succeed) — createProviderFn below ignores them.
  const options = parseArgs(
    [...process.argv.slice(2), '--provider', 'ollama', '--model', 'mock-local'],
    process.env,
  )
  if (options.help) {
    process.stderr.write('voir l\'en-tête de scripts/dev/runner-once-mock.mjs\n')
    process.exit(0)
  }

  const runner = createRunner({
    options,
    createProviderFn: () => createMockProvider({ responses: extractionResponses }),
    log: createLogger(),
  })

  const stats = await runner.runOnce()
  process.stdout.write(JSON.stringify(stats) + '\n')
  process.exit(stats.errors > 0 && stats.ok === 0 ? 1 : 0)
}
