#!/usr/bin/env node
// Régénère, À TRAVERS LE MOTEUR, les goldens de parité PHP ↔ moteur du paquet
// par défaut 1.1.0 sur un autre référentiel que RESPIRE (2026-10-20) :
// DefaultPackageParityTest.php vérifie que PromptRunner, instanciant les
// gabarits de aurora-v3-reconstruit 1.1.0, rend ces octets exacts.
//
// Entrées : fictif-lettre.json (= ReferentielsFictifs::lettre(), le test le
// vérifie) et le texte de journée des goldens de masse (../MasseGolden/day-text.txt).
//
// Usage : node api/tests/DefaultPackageGolden/regenerer.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExtractionPrompt, buildKairosExtractionPrompt } from '../../../engine/src/index.js'

const ici = dirname(fileURLToPath(import.meta.url))
const referentiel = JSON.parse(readFileSync(join(ici, 'fictif-lettre.json'), 'utf8'))
const dayText = readFileSync(join(ici, '../MasseGolden/day-text.txt'), 'utf8')
const date = '2026-01-06'

writeFileSync(
  join(ici, 'fictif-lettre-pole-4.golden.txt'),
  buildExtractionPrompt({ referentiel, poleNum: 4, dayText: dayText.trim(), date }),
)
writeFileSync(
  join(ici, 'fictif-lettre-kairos.golden.txt'),
  buildKairosExtractionPrompt({ referentiel, dayText: dayText.trim(), date }),
)
console.log('goldens fictif-lettre régénérés (pôle 4, kairos)')
