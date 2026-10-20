// The Twin6 protocol templates (« Cartographie ouverte »), versioned under
// scripts/data/twin6/ since 2026-10-20 (UC-SYS-04 AN-2): the ONE source of
// both « twin6-ouverte » packages, the static one (build-twin6-package.mjs)
// and the published one (build-twin6-prompt-package.mjs). Their pole fiches
// P1..P7 are regenerated from the corpus (generate-fiches.mjs).
//
// 1.0.0: the deployed texts, byte for byte (rebuilt from them, the deployed
// static package is identical to the byte). 1.1.0: the same texts, where they
// spell RESPIRE v7 out (its name, its 7 poles, its 61 competences, the X.YY
// form of its codes, four example codes) turned into the variables through
// which the engine reads the referential in use (engine/src/twin6/variables.js:
// ${REFERENTIEL}, ${NB_POLES}, ${NB_COMPETENCES}, ${FORMAT_CODE},
// ${PRECISION_FORMAT_CODE}, ${CODES_EXEMPLE}). Rendered for RESPIRE v7, the
// 1.1.0 templates give the 1.0.0 ones back, byte for byte. Each replacement
// is ASSERTED: an expected text that is missing, or a RESPIRE v7 value that
// survives, stops the build. The mega-prompt, which the engine never runs (a
// manual RESPIRE v7 protocol over P1..P7), is the same in both versions.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Where the templates live, from the repository root. */
export const TWIN6_GABARITS_DIR = 'scripts/data/twin6'

/** The versions the builders write, oldest first. */
export const TWIN6_VERSIONS = ['1.0.0', '1.1.0']

/** Replace an exact substring, asserting it occurs `fois` times. */
function sub(nom, text, from, to, fois = 1) {
  const vu = text.split(from).length - 1
  if (vu !== fois) {
    throw new Error(`twin6-gabarits: « ${from.slice(0, 80)} » found ${vu} time(s) in ${nom}, expected ${fois}`)
  }
  return text.replaceAll(from, () => to)
}

function assertClean(nom, text, survivants) {
  for (const s of survivants) {
    if (text.includes(s)) throw new Error(`twin6-gabarits: « ${s} » survived in ${nom} (1.1.0)`)
  }
}

const FORMAT_X_YY = '- **Codes** : format `X.YY` strict (point séparateur, deux chiffres).'
const FORMAT_LISANT = '- **Codes** : format `${FORMAT_CODE}` strict${PRECISION_FORMAT_CODE}.'

/** 1.1.0's scan-pole, from 1.0.0's. */
function scanPoleLisant(texte) {
  const nom = '1-scan-pole.md'
  let t = sub(nom, texte, "Le numéro d'un des 7 pôles du **référentiel RESPIRE** `${POLE}`",
    "Le numéro d'un des ${NB_POLES} pôles du **référentiel ${REFERENTIEL}** `${POLE}`")
  t = sub(nom, t, 'code:           <"X.YY">,', 'code:           <"${FORMAT_CODE}">,')
  t = sub(nom, t, FORMAT_X_YY, FORMAT_LISANT)
  t = sub(nom, t, 'si le pid 7 apparaît dans 1.02, 2.02, 2.05 et 3.03,', 'si le pid 7 apparaît dans ${CODES_EXEMPLE},')
  assertClean(nom, t, ['RESPIRE', 'X.YY', '7 pôles', '1.02', '3.03'])
  return t
}

/** 1.1.0's kairos, from 1.0.0's. */
function kairosLisant(texte) {
  const nom = '2-kairos-final.md'
  let t = sub(nom, texte, '> 7 fichiers JSON `carto_P[1..7]` cartographiant',
    '> ${NB_POLES} fichiers JSON `carto_P[1..${NB_POLES}]` cartographiant')
  t = sub(nom, t, FORMAT_X_YY, FORMAT_LISANT)
  t = sub(nom, t, "`carto_P[1..7].json` remplie jusqu'ici (les 61 verdicts avec leurs scores bruts, les 7 rapports pôle)",
    "`carto_P[1..${NB_POLES}].json` remplie jusqu'ici (les ${NB_COMPETENCES} verdicts avec leurs scores bruts, les ${NB_POLES} rapports pôle)")
  t = sub(nom, t, 'Le portrait intègre les 7 pôles sans les énumérer', 'Le portrait intègre les ${NB_POLES} pôles sans les énumérer')
  t = sub(nom, t, 'sur la convergence des 7 rapports pôle,', 'sur la convergence des ${NB_POLES} rapports pôle,')
  t = sub(nom, t, 'à travers les 7 pôles (combien', 'à travers les ${NB_POLES} pôles (combien')
  t = sub(nom, t, 'absentes du référentiel des 61.', 'absentes du référentiel des ${NB_COMPETENCES}.')
  t = sub(nom, t, '**aucune** des 61 compétences.', '**aucune** des ${NB_COMPETENCES} compétences.')
  t = sub(nom, t, '[<"X.YY">]', '[<"${FORMAT_CODE}">]', 3)
  t = sub(nom, t, 'vérifier explicitement contre les 61.', 'vérifier explicitement contre les ${NB_COMPETENCES}.')
  assertClean(nom, t, ['RESPIRE', 'X.YY', ' 61', '7 pôles', '[1..7]', '7 rapports', '7 fichiers'])
  return t
}

/**
 * The templates of one version of « twin6-ouverte ».
 *
 * @param {string} repoRoot
 * @param {'1.0.0'|'1.1.0'} version
 * @returns {{scanPole: string, kairos: string, megaPrompt: string}}
 */
export function gabaritsTwin6(repoRoot, version) {
  if (!TWIN6_VERSIONS.includes(version)) throw new Error(`twin6-gabarits: unknown version ${version}`)
  const lire = (name) => readFileSync(join(repoRoot, TWIN6_GABARITS_DIR, name), 'utf8')
  const scanPole = lire('1-scan-pole.md')
  const kairos = lire('2-kairos-final.md')
  const megaPrompt = lire('0-mega-prompt.md')
  return version === '1.0.0'
    ? { scanPole, kairos, megaPrompt }
    : { scanPole: scanPoleLisant(scanPole), kairos: kairosLisant(kairos), megaPrompt }
}
