#!/usr/bin/env node
// DEV TOOL — validates a JSONL stream of mass_jobs documents THROUGH THE
// ENGINE (ajv, the same code the browser runs): the cartographie-jour schema,
// then the conformity to the referential version the run maps (2026-10-20 —
// the schema no longer fixes a structure: its poles, each once, its codes).
// Used by scripts/dev/dod-p11.sh as the operational proof that every document
// produced by the worker is valid.
//
// argv[2] (optional): the referential document of the run (JSON file) —
// default: RESPIRE v7 (schemas/fixtures/referentiel-respire-v7.json), the
// version dod-p11.sh runs on.
// stdin: one JSON document per line (JSONL produced by the PHP dump in
// dod-p11.sh — PDO returns the JSON column verbatim, one line per document)
// stdout: `<valid>/<total> documents valides au schéma cartographie-jour et conformes au référentiel <id>`
// exit 0 when all valid, 1 otherwise (first errors printed on stderr).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateDocumentPourReferentiel } from '../../engine/src/conformite.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const referentiel = JSON.parse(readFileSync(
  process.argv[2] ?? join(root, 'schemas', 'fixtures', 'referentiel-respire-v7.json'),
  'utf8',
))

// utf8 decoding must span chunk boundaries (a multibyte character split
// across two chunks would otherwise be corrupted and break enum values)
process.stdin.setEncoding('utf8')
let input = ''
for await (const chunk of process.stdin) input += chunk

const lines = input.split('\n').map((l) => l.trim()).filter((l) => l !== '')
let valid = 0
let shown = 0
for (const line of lines) {
  let document
  try {
    document = JSON.parse(line)
  } catch (err) {
    if (shown++ < 3) process.stderr.write(`ligne illisible: ${err.message}\n`)
    continue
  }
  const result = validateDocumentPourReferentiel('cartographie-jour', document, referentiel)
  if (result.valid) {
    valid += 1
  } else if (shown++ < 3) {
    process.stderr.write(`document ${document?.date ?? '?'} invalide: ${JSON.stringify(result.errors?.slice(0, 2))}\n`)
  }
}

process.stdout.write(`${valid}/${lines.length} documents valides au schéma cartographie-jour et conformes au référentiel ${referentiel.id}\n`)
process.exit(valid === lines.length && lines.length > 0 ? 0 : 1)
