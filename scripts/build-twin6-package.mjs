#!/usr/bin/env node
// Build the PUBLIC « Cartographie ouverte Twin6 » prompt packages into single
// JSON manifests the engine loads (executerTwin6 templates: scanPole, kairos,
// fiches{1..7}): web/public/data/twin6/twin6-ouverte-<version>.json. Twin6 is
// open source (AGPL) — these packages are public, downloadable, and carry no
// secret (unlike the confidential Twin9 Golden Prompt). Deterministic: same
// inputs → byte-identical output.
//
// The templates come from scripts/data/twin6/ (twin6-gabarits.mjs, versioned
// since 2026-10-20 — UC-SYS-04 AN-2), the fiches P1..P7 from
// web/public/data/twin6/prompts/, regenerated from the corpus by
// generate-fiches.mjs. Two versions: 1.0.0, the deployed package, byte for
// byte; 1.1.0, whose templates read the referential in use (its name, its
// poles, its competences, the form of its codes) — the one #/twin6-ouverte
// serves. Rendered for RESPIRE v7, both give the same prompts.
//
// Their fiches are RESPIRE v7's seven, from the committed corpus: a run on
// another referential, or on a version of RESPIRE of another structure, keeps
// a package fiche only for a pole whose competences it names exactly and
// writes the others from the referential's document (engine/src/twin6/fiches.js,
// fichesPourTwin6, 2026-10-20). A run makes one call per pole, then the kairos
// (twin6CallsFor; RESPIRE v7: 8).
//
// Usage: node scripts/build-twin6-package.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gabaritsTwin6, TWIN6_VERSIONS } from './twin6-gabarits.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(repoRoot, 'web/public/data/twin6/prompts')

function read(name) {
  const p = join(srcDir, name)
  if (!existsSync(p)) throw new Error(`prompt manquant : ${p}`)
  return readFileSync(p, 'utf8')
}

const fiches = {}
for (let n = 1; n <= 7; n += 1) fiches[String(n)] = read(`P${n}.md`)

const DESCRIPTIONS = {
  '1.0.0':
    'Cartographie de compétences open source (protocole Aurora one-shot v2) : un ' +
    'scan par pôle RESPIRE (Greffier / Pédagogue adversarial / Rapporteur) puis une ' +
    'synthèse Kairos, sur le portfolio entier. Utilisable avec votre propre clé API ' +
    '(gratuit) ou avec nos crédits (+10 % de contribution au fonctionnement du site).',
  '1.1.0':
    'Cartographie de compétences open source (protocole Aurora one-shot v2) : un ' +
    'scan par pôle du référentiel choisi (Greffier / Pédagogue adversarial / Rapporteur) ' +
    'puis une synthèse Kairos, sur le portfolio entier. Utilisable avec votre propre clé ' +
    'API (gratuit) ou avec nos crédits (+10 % de contribution au fonctionnement du site).',
}

// Every version is built before any is written: a template that drifted
// (twin6-gabarits.mjs) leaves none half-written.
const pkgs = TWIN6_VERSIONS.map((version) => {
  const gabarits = gabaritsTwin6(repoRoot, version)
  return {
    schemaVersion: '1.0.0',
    id: 'twin6-ouverte',
    version,
    nom: 'Cartographie ouverte Twin6',
    description: DESCRIPTIONS[version],
    auteur: 'Harmonia Éducation — protocole Aurora (Twin6), open source',
    licence: 'AGPL-3.0-only',
    referentielCompatible: { id: 'respire', versionMin: '7.0.0' },
    modeleCibleDefaut: 'claude-sonnet-5',
    // Contrat moteur (executerTwin6) : gabarits PUBLICS injectés côté client.
    scanPole: gabarits.scanPole,
    kairos: gabarits.kairos,
    megaPrompt: gabarits.megaPrompt,
    fiches,
    metadata: version === '1.0.0'
      ? { genereLePar: 'scripts/build-twin6-package.mjs', moteur: 'humanome-engine@0.1.0 (twin6)', nbAppelsParRun: 8 }
      : { genereLePar: 'scripts/build-twin6-package.mjs', moteur: 'humanome-engine@0.1.0 (twin6)' },
  }
})

for (const pkg of pkgs) {
  const outPath = join(repoRoot, `web/public/data/twin6/twin6-ouverte-${pkg.version}.json`)
  const json = JSON.stringify(pkg, null, 2) + '\n'
  writeFileSync(outPath, json, 'utf8')
  console.log(`écrit ${outPath} (${Buffer.byteLength(json, 'utf8')} octets)`)
  console.log(`  scanPole ${pkg.scanPole.length} car., kairos ${pkg.kairos.length} car., 7 fiches`)
}
