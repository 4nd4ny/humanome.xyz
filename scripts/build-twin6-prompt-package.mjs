#!/usr/bin/env node
// Builds the PUBLISHED prompt-packages « twin6-ouverte » from the SAME
// open-source corpus that feeds the public static packages — the templates of
// scripts/data/twin6/ (twin6-gabarits.mjs), the fiches P1..P7 regenerated into
// web/public/data/twin6/prompts/ — so a promptologue can FORK them in the
// workshop (P10) and work on a copy (plan v1.1, D1 / AD-D1).
//
// Two artifacts derive from ONE corpus, for each version:
//   - web/public/data/twin6/twin6-ouverte-<version>.json (build-twin6-package.mjs) —
//     the PUBLIC static package the #/twin6-ouverte page serves and downloads ;
//   - build/prompt-packages/twin6-ouverte-<version>.json (THIS script) — a
//     schemas/prompt-package.schema.json document imported PUBLISHED in base,
//     forkable in the atelier (same mechanism as aurora-v3-reconstruit).
// The scan-pole / kairos / fiche TEXTS are byte-identical between the two:
// same source corpus, no drift (proven by scripts/…/twin6-prompt-package test).
//
// Two versions (2026-10-20): 1.0.0, published and immutable, byte for byte
// what it was; 1.1.0, whose templates read the referential in use instead of
// spelling RESPIRE v7 out (twin6-gabarits.mjs, engine/src/twin6/variables.js).
// Rendered for RESPIRE v7, both give the same prompts.
//
// Execution is DELEGATED to the embedded engine (executerTwin6): the
// orchestration carries the « engine://…(twin6) » marker, so the run launcher
// and the promptologue banc d'essai recognize it and call executerTwin6 on the
// whole test portfolio (one scan-pole per pole of the referential — RESPIRE v7:
// 7 — + kairos -> cartographie-merge), exactly like the #/twin6-ouverte page —
// never the per-day aurora extractDay path. 1.0.0's texts are RESPIRE v7's
// (its seven fiches, its variables' descriptions) and stay byte-identical.
//
// The package is marked metadata.reserved: true — the source-unique pipeline
// owns « twin6-ouverte » ; a promptologue's fork must be RENAMED before it can
// be published (PromptPackageRepository::createDraft rename guard).
//
// Deterministic (fixed dates, no Date.now()): re-running yields byte-identical
// JSON, keeping the server import (hash-idempotent) a no-op.
//
// Usage: node scripts/build-twin6-prompt-package.mjs

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_VERSION, twin6, validateDocument } from '../engine/src/index.js'
import { gabaritsTwin6 } from './twin6-gabarits.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(repoRoot, 'web/public/data/twin6/prompts')
const referentiel = JSON.parse(
  readFileSync(join(repoRoot, 'web/public/data/referentiel/respire-v7.json'), 'utf8'),
)

const PACKAGE_ID = 'twin6-ouverte'

// Fixed publication dates (determinism — see header), oldest first: each
// version's changelog lists every version up to its own.
const VERSIONS = [
  {
    version: '1.0.0',
    date: '2026-07-16',
    readsReferentiel: false,
    changelog:
      'Première publication : import du protocole Twin6 open source (scan-pole, kairos, fiches '
      + 'P1..P7) depuis le corpus source unique, pour rendre le paquet forkable dans l\'atelier.',
  },
  {
    version: '1.1.0',
    date: '2026-10-20',
    readsReferentiel: true,
    changelog:
      'Les gabarits scan-pole et kairos lisent le référentiel employé — son nom, son nombre de pôles '
      + 'et de compétences, la forme de ses codes, quatre codes d’exemple (variables REFERENTIEL, '
      + 'NB_POLES, NB_COMPETENCES, FORMAT_CODE, PRECISION_FORMAT_CODE, CODES_EXEMPLE) — au lieu '
      + 'd’écrire RESPIRE v7 en toutes lettres : ils servent tout référentiel. Pour RESPIRE v7, les '
      + 'prompts rendus sont identiques à l’octet à ceux de 1.0.0.',
  },
]

function read(name) {
  const p = join(srcDir, name)
  if (!existsSync(p)) throw new Error(`prompt manquant : ${p}`)
  return readFileSync(p, 'utf8')
}

const fiches = {}
for (let n = 1; n <= 7; n += 1) fiches[String(n)] = read(`P${n}.md`)

/** Nom lisible d'un pôle (referentiel.poles[].nom) — pour l'éditeur. */
function poleNom(num) {
  return referentiel.poles.find((p) => p.num === num)?.nom ?? `Pôle ${num}`
}

// --- 1.1.0 : les variables par lesquelles les gabarits lisent le référentiel --

const exemples = twin6.variablesTwin6(referentiel)
const vReferentiel = {
  nom: 'REFERENTIEL',
  description:
    "Nom du référentiel employé tel que le prompt le donne : « RESPIRE » pour l'identifiant respire, "
    + 'sinon son libellé sans version finale, à défaut son identifiant (nomCourtReferentiel du moteur).',
  exemple: exemples.REFERENTIEL,
}
const vNbPoles = {
  nom: 'NB_POLES',
  description: 'Nombre de pôles du référentiel employé : autant de scans de pôle, et de carto_pole pour le kairos.',
  exemple: exemples.NB_POLES,
}
const vNbCompetences = {
  nom: 'NB_COMPETENCES',
  description: 'Nombre de compétences du référentiel employé.',
  exemple: exemples.NB_COMPETENCES,
}
const vFormatCode = {
  nom: 'FORMAT_CODE',
  description:
    'Forme des codes du référentiel, comme le moteur Twin9 l’écrit (Referentiel::formatCode) : son premier '
    + 'code, la première suite de lettres ou de chiffres écrite X, les suivantes Y (« 1.01 » → X.YY, « A1 » → XY).',
  exemple: exemples.FORMAT_CODE,
}
const vPrecisionFormatCode = {
  nom: 'PRECISION_FORMAT_CODE',
  description:
    '« (point séparateur, deux chiffres) », précédé d’une espace, quand la forme des codes est X.YY (ou XX.YY) ; '
    + 'vide sinon.',
  exemple: exemples.PRECISION_FORMAT_CODE,
}
const vCodesExemple = {
  nom: 'CODES_EXEMPLE',
  description:
    'Quatre codes d’exemple : les deuxièmes codes des pôles 1 et 2, le cinquième du pôle 2 et le troisième '
    + 'du pôle 3 quand le référentiel les a tous, sinon ses quatre premiers codes (variablesTwin6 du moteur).',
  exemple: exemples.CODES_EXEMPLE,
}

// --- prompts[] : scan-pole, kairos, mega-prompt, 7 fiches (tous éditables) ---

function promptsDe({ version, readsReferentiel }) {
  const gabarits = gabaritsTwin6(repoRoot, version)
  return [
    {
      role: 'twin6-scan-pole',
      nom: 'Scan d’un pôle (Greffier / Pédagogue adversarial / Rapporteur)',
      texte: gabarits.scanPole,
      variables: [
        {
          nom: 'POLE',
          description: readsReferentiel
            ? 'Numéro du pôle instruit (un scan par pôle du référentiel employé), injecté en lieu et place de '
              + '${POLE}. La fiche du pôle (P${POLE}.md) et le portfolio entier sont attachés en entrée par le moteur.'
            : 'Numéro du pôle RESPIRE instruit (1..7), injecté en lieu et place de ${POLE}. '
              + 'La fiche du pôle (P${POLE}.md) et le portfolio entier sont attachés en entrée par le moteur.',
          exemple: '1',
        },
        ...(readsReferentiel ? [vReferentiel, vNbPoles, vFormatCode, vPrecisionFormatCode, vCodesExemple] : []),
      ],
    },
    {
      role: 'twin6-kairos',
      nom: 'Synthèse Kairos finale (transversale)',
      texte: gabarits.kairos,
      variables: [
        {
          nom: 'cartos_pole',
          description: readsReferentiel
            ? 'Les carto_pole produits par le scan-pole, un par pôle du référentiel (étiquetés carto_P<n>), sont '
              + 'attachés en entrée par le moteur, suivis du portfolio original. Aucun placeholder dédié dans le gabarit.'
            : 'Les 7 carto_pole produits par le scan-pole (étiquetés carto_P1..P7) sont attachés en entrée '
              + 'par le moteur, suivis du portfolio original. Aucun placeholder dédié dans le gabarit.',
          exemple: '## carto_P1\n```json\n{ "poleNum": 1, … }\n```',
        },
        ...(readsReferentiel ? [vNbPoles, vNbCompetences, vFormatCode, vPrecisionFormatCode] : []),
      ],
    },
    {
      role: 'twin6-mega-prompt',
      nom: readsReferentiel
        ? 'Méga-prompt (protocole manuel sur RESPIRE v7, non exécuté)'
        : 'Méga-prompt (vue d’ensemble du protocole, non exécuté)',
      texte: gabarits.megaPrompt,
      variables: [],
    },
    ...[1, 2, 3, 4, 5, 6, 7].map((num) => ({
      role: `twin6-fiche-${num}`,
      nom: `Fiche des compétences — Pôle ${num} : ${poleNom(num)}`,
      texte: fiches[String(num)],
      variables: [],
    })),
  ]
}

// --- code.orchestration : marqueur engine://…(twin6), délégué au moteur ------

function orchestrationDe({ readsReferentiel }) {
  return `// engine://humanome-engine@${ENGINE_VERSION} (twin6)\n`
    + '// Paquet « Cartographie ouverte Twin6 » : l\'orchestration est exécutée par\n'
    + `// le moteur intégré (engine/src/twin6, version ${ENGINE_VERSION}) — executerTwin6()\n`
    + (readsReferentiel
      ? '// enchaîne un appel twin6-scan-pole par pôle du référentiel employé (fiche +\n'
        + '// portfolio attachés ; RESPIRE v7 : 7) puis 1 appel twin6-kairos, et mappe la\n'
        + '// sortie vers une cartographie-merge (mapper.js). Les gabarits scan-pole et\n'
        + '// kairos ci-dessus sont les textes que ce moteur instancie, variables du\n'
        + '// référentiel rendues ; les fiches P1..P7, celles de RESPIRE v7, servent les\n'
        + '// pôles qu\'elles décrivent, les autres s\'écrivent depuis le référentiel. Le banc\n'
        + '// d\'essai promptologue et la page #/twin6-ouverte suivent ce même chemin\n'
        + '// (jamais l\'extraction aurora).\n'
      : '// enchaîne 7 appels twin6-scan-pole (un par pôle, fiche + portfolio attachés)\n'
        + '// puis 1 appel twin6-kairos, et mappe la sortie vers une cartographie-merge\n'
        + '// (mapper.js). Les gabarits ci-dessus (scan-pole, kairos, fiches P1..P7) sont\n'
        + '// les textes EXACTS que ce moteur instancie. Le banc d\'essai promptologue et\n'
        + '// la page #/twin6-ouverte suivent ce même chemin (jamais l\'extraction aurora).\n')
    + `export const engineRef = 'engine://humanome-engine@${ENGINE_VERSION} (twin6)'\n`
}

function buildDoc(entry, changelog) {
  const { version, date, readsReferentiel } = entry
  return {
    schemaVersion: '1.0.0',
    kind: 'prompt-package',
    id: PACKAGE_ID,
    version,
    auteur: 'Harmonia Éducation — protocole Aurora (Twin6), open source',
    description: readsReferentiel
      ? 'Cartographie de compétences open source (protocole Aurora one-shot v2, Twin6) : un scan par '
        + 'pôle du référentiel employé (Greffier / Pédagogue adversarial / Rapporteur) puis une synthèse '
        + 'Kairos, sur le portfolio entier (un appel LLM par pôle, plus la synthèse : 8 pour RESPIRE v7). '
        + 'Paquet PUBLIÉ et forkable dans l\'atelier promptologue — la page publique #/twin6-ouverte sert le '
        + 'paquet statique équivalent.'
      : 'Cartographie de compétences open source (protocole Aurora one-shot v2, Twin6) : un scan par '
        + 'pôle RESPIRE (Greffier / Pédagogue adversarial / Rapporteur) puis une synthèse Kairos, sur '
        + 'le portfolio entier (8 appels LLM). Paquet PUBLIÉ et forkable dans l\'atelier promptologue — '
        + 'la page publique #/twin6-ouverte continue de servir le paquet statique équivalent.',
    modeleCible: 'claude-sonnet-5',
    referentielCompatible: { id: 'respire', versionMin: '7.0.0' },
    changelog,
    prompts: promptsDe(entry),
    code: {
      orchestration: orchestrationDe(entry),
      entrypoint: 'executerTwin6',
    },
    metadata: {
      creeLe: `${date}T00:00:00Z`,
      publieLe: `${date}T00:00:00Z`,
      licence: 'AGPL-3.0-only',
      // Réservé au pipeline source-unique : un fork de promptologue DOIT être
      // renommé avant publication (PromptPackageRepository::createDraft).
      reserved: true,
      genereLePar: 'scripts/build-twin6-prompt-package.mjs',
      moteur: `humanome-engine@${ENGINE_VERSION} (twin6)`,
    },
  }
}

const docs = VERSIONS.map((entry, i) => buildDoc(
  entry,
  VERSIONS.slice(0, i + 1).map((v) => ({ version: v.version, date: v.date, description: v.changelog })),
))

/**
 * Le document prompt-package « twin6-ouverte » d'une version (déterministe).
 * Exporté pour le test de byte-identité (les textes scan-pole/kairos/fiches ===
 * paquet statique de la même version).
 * @param {string} [version] 1.0.0 par défaut
 * @returns {object}
 */
export function buildTwin6PromptPackageDoc(version = '1.0.0') {
  const doc = docs.find((d) => d.version === version)
  if (!doc) throw new Error(`twin6-ouverte : version inconnue ${version}`)
  return doc
}

// --- CLI: validate through the engine's own validators, then write ----------

function main() {
  for (const doc of docs) {
    const result = validateDocument('prompt-package', doc)
    if (!result.valid) {
      console.error(`Generated Twin6 package ${doc.version} fails schemas/prompt-package.schema.json:`)
      for (const err of result.errors ?? []) console.error(' -', JSON.stringify(err))
      process.exit(1)
    }
  }

  const outDir = join(repoRoot, 'build', 'prompt-packages')
  mkdirSync(outDir, { recursive: true })
  for (const doc of docs) {
    const outFile = join(outDir, `${PACKAGE_ID}-${doc.version}.json`)
    writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n')
    console.log(
      `wrote ${outFile.replace(repoRoot + '/', '')} `
      + `(${doc.prompts.length} prompts : scan-pole + kairos + mega + 7 fiches, engine ${ENGINE_VERSION})`,
    )
  }
}

// Exécuté en CLI (pas à l'import par un test).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
