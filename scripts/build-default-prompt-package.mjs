#!/usr/bin/env node
// Builds the DEFAULT prompt package « aurora-v3-reconstruit » from the REAL
// engine templates (P8.3 — the P10 workshop will edit packages like this one).
// Output: build/prompt-packages/aurora-v3-reconstruit-<version>.json for each
// version below, conforming to schemas/prompt-package.schema.json and validated
// through the engine's own ajv validators before ANY is written.
//
// Two versions (2026-10-20). 1.0.0, published and immutable, stays byte for
// byte what it was: its extraction templates spell RESPIRE v7 out (« RESPIRE »,
// « 7 pôles », the example codes « 1.01 » and « 4.02 »), so they cartograph
// RESPIRE at seven poles only (PromptRunner::referentielRefusal). 1.1.0's read
// the referential instead — {{referentiel_nom}}, {{nb_poles}},
// {{code_exemple_1}}, {{code_exemple_2}} — and serve every referential.
// Rendered for RESPIRE v7, both versions' prompts are identical byte for byte.
//
// Method: the engine builders are pure template functions — they are called
// with EXAMPLE variables (real respire-v7 referentiel, sentinel portfolio
// text, fixed dates), then every injected value is replaced by a documented
// {{placeholder}}. Each replacement is ASSERTED (the build fails if an
// expected substring is missing or a sentinel survives), so any change to the
// engine templates breaks this build instead of silently drifting.
//
// The output is fully deterministic (fixed dates, no Date.now()): re-running
// the script yields byte-identical JSON, which keeps the server import
// (scripts/import-prompt-packages.php, hash-idempotent) a no-op.
//
// Usage: node scripts/build-default-prompt-package.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ENGINE_VERSION,
  buildCompetencePrompt,
  buildExtractionPrompt,
  buildKairosExtractionPrompt,
  buildKairosPrompt,
  buildPolePrompt,
  codesExemples,
  formatDateFr as formatDateFrSlash,
  nomCourtReferentiel,
  validateDocument,
} from '../engine/src/index.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PACKAGE_ID = 'aurora-v3-reconstruit'

// Fixed publication dates (determinism — see header), oldest first: each
// version's changelog lists every version up to its own.
const VERSIONS = [
  {
    version: '1.0.0',
    date: '2026-07-12',
    readsReferentiel: false,
    changelog:
      'Première publication : gabarits extraits du moteur intégré (extraction recréée sans oracle '
      + '+ narratifs à parité oracle), orchestration déléguée au moteur embarqué.',
  },
  {
    version: '1.1.0',
    date: '2026-10-20',
    readsReferentiel: true,
    changelog:
      'Les gabarits d’extraction lisent le référentiel employé — son nom, son nombre de pôles, deux '
      + 'codes d’exemple (variables referentiel_nom, nb_poles, code_exemple_1, code_exemple_2) — au lieu '
      + 'd’écrire RESPIRE v7 en toutes lettres : ils servent tout référentiel. Pour RESPIRE v7, les '
      + 'prompts rendus sont identiques à l’octet à ceux de 1.0.0.',
  },
]

// --- Example variables -------------------------------------------------------

const referentiel = JSON.parse(
  readFileSync(join(repoRoot, 'web/public/data/referentiel/respire-v7.json'), 'utf8'),
)
const POLE_NUM = 1
const pole1 = referentiel.poles.find((p) => p.num === POLE_NUM)
const DATE_ISO = '2026-01-05'
const DATE_ISO_2 = '2026-03-27'
const PORTFOLIO_SENTINEL = 'TEXTE_INTEGRAL_DE_LA_FEUILLE_DU_JOUR'

// engine/src/pipeline/extract.js uses formatDateFr from narrative-prompts
// ('05/01/2026'). Recomputed here through the engine itself, never hardcoded.
const DATE_FR = formatDateFrSlash(DATE_ISO)
const DATE_FR_2 = formatDateFrSlash(DATE_ISO_2)

// Local twin of the (non-exported) referentielBloc() of extract.js — asserted
// against the generated prompt, so a drift in the engine fails the build.
function referentielBloc(ref, poleNum = null) {
  const poles = [...ref.poles].sort((a, b) => a.num - b.num)
  const lignes = []
  for (const pole of poles) {
    if (poleNum !== null && pole.num !== poleNum) continue
    lignes.push(`Pôle ${pole.num} — ${pole.nom}`)
    const comps = ref.competences
      .filter((c) => c.pole === pole.num)
      .sort((a, b) => (a.code < b.code ? -1 : 1))
    for (const c of comps) lignes.push(`  ${c.code} — ${c.nom}`)
  }
  return lignes.join('\n')
}

/** Replace an exact substring, asserting it occurs (at least once). */
function sub(text, from, to, { all = true } = {}) {
  if (!text.includes(from)) {
    throw new Error(`build-default-prompt-package: expected substring not found:\n--- ${from.slice(0, 120)}`)
  }
  return all ? text.replaceAll(from, to) : text.replace(from, to)
}

function assertClean(name, text, sentinels) {
  for (const sentinel of sentinels) {
    if (text.includes(sentinel)) {
      throw new Error(`build-default-prompt-package: sentinel "${sentinel}" survived in template "${name}"`)
    }
  }
}

// --- 1. Extraction d'un pôle (étage C) --------------------------------------

const comps1 = referentiel.competences
  .filter((c) => c.pole === POLE_NUM)
  .sort((a, b) => (a.code < b.code ? -1 : 1))
const codes1 = comps1.map((c) => c.code)

let extractionPole = buildExtractionPrompt({
  referentiel,
  poleNum: POLE_NUM,
  dayText: PORTFOLIO_SENTINEL,
  date: DATE_ISO,
})
extractionPole = sub(extractionPole, PORTFOLIO_SENTINEL, '{{portfolio_texte}}')
// The full competence list of the pole (also contains "Pôle 1 — nom"): first.
extractionPole = sub(extractionPole, referentielBloc(referentiel, POLE_NUM), '{{referentiel_pole_bloc}}')
extractionPole = sub(extractionPole, `# Pôle ${POLE_NUM} — ${pole1.nom}`, '# Pôle {{pole_num}} — {{pole_nom}}')
extractionPole = sub(extractionPole, `"poleNum": "${POLE_NUM}"`, '"poleNum": "{{pole_num}}"')
extractionPole = sub(extractionPole, `les ${codes1.length} codes\n${codes1.join(', ')}`, 'les {{nb_competences_pole}} codes\n{{codes_liste}}')
extractionPole = sub(extractionPole, `(= ${codes1.length})`, '(= {{nb_competences_pole}})')
extractionPole = sub(extractionPole, `"competencesTotales": ${codes1.length}`, '"competencesTotales": {{nb_competences_pole}}')
extractionPole = sub(extractionPole, `"code": "${codes1[0]}"`, '"code": "{{premier_code}}"')
extractionPole = sub(extractionPole, DATE_FR, '{{date_fr}}')
extractionPole = sub(extractionPole, DATE_ISO, '{{date_iso}}')
assertClean('extraction-pole', extractionPole, [PORTFOLIO_SENTINEL, DATE_ISO, pole1.nom])

// --- 2. Kairos transversal de la journée (étage C) ---------------------------

let kairosJour = buildKairosExtractionPrompt({
  referentiel,
  dayText: PORTFOLIO_SENTINEL,
  date: DATE_ISO,
})
kairosJour = sub(kairosJour, PORTFOLIO_SENTINEL, '{{portfolio_texte}}')
kairosJour = sub(kairosJour, referentielBloc(referentiel), '{{referentiel_bloc}}')
kairosJour = sub(kairosJour, `${referentiel.poles.length} pôles, ${referentiel.competences.length} compétences`, '{{nb_poles}} pôles, {{nb_competences}} compétences')
kairosJour = sub(kairosJour, DATE_FR, '{{date_fr}}')
kairosJour = sub(kairosJour, DATE_ISO, '{{date_iso}}')
assertClean('kairos', kairosJour, [PORTFOLIO_SENTINEL, DATE_ISO])

// --- 1–2 bis. Extraction templates that READ the referential (1.1.0) ---------
// The engine writes the example referential's name, pole count and example
// codes (referentiel.js); 1.1.0 turns them into variables. Each replacement is
// asserted, and none of these values may survive.

const NOM_REFERENTIEL = nomCourtReferentiel(referentiel)
const [CODE_EXEMPLE_1, CODE_EXEMPLE_2] = codesExemples(referentiel)

let extractionPoleLisante = sub(extractionPole, `pôle du référentiel ${NOM_REFERENTIEL},`, 'pôle du référentiel {{referentiel_nom}},')
assertClean('extraction-pole (1.1.0)', extractionPoleLisante, [NOM_REFERENTIEL])

let kairosJourLisant = sub(kairosJour, `Les ${referentiel.poles.length} pôles de la feuille du jour`, 'Les {{nb_poles}} pôles de la feuille du jour')
kairosJourLisant = sub(kairosJourLisant, `# Référentiel ${NOM_REFERENTIEL} (`, '# Référentiel {{referentiel_nom}} (')
kairosJourLisant = sub(kairosJourLisant, `"${CODE_EXEMPLE_1}"`, '"{{code_exemple_1}}"')
kairosJourLisant = sub(kairosJourLisant, `"${CODE_EXEMPLE_2}"`, '"{{code_exemple_2}}"')
assertClean('kairos (1.1.0)', kairosJourLisant, [NOM_REFERENTIEL, `"${CODE_EXEMPLE_1}"`, `"${CODE_EXEMPLE_2}"`])

// --- 3..5. Gabarits narratifs du merge (étage B1) ----------------------------
// Built with sentinel aggregates and EMPTY per-sheet data sections: the data
// blocks are per-sheet repetitions injected by the engine — represented by a
// single trailing placeholder each.

const periode = {
  premiere: DATE_ISO,
  derniere: DATE_ISO_2,
  nb_feuilles: '__NB_FEUILLES__',
  feuilles_chronologiques: ['__DATES_ISO__'],
}

let narratifCompetence = buildCompetencePrompt(
  {
    code: '__CODE__',
    nom: '__NOM__',
    pole: '__POLE_NUM__',
    nb_feuilles_etablies: '__NB_ETABLIES__',
    statut_final: '__STATUT_FINAL__',
    cumul_preuves: '__CUMUL_PREUVES__',
    cumul_indices: '__CUMUL_INDICES__',
    confiance_moyenne: 0.13,
    score: 7.77,
    presence_par_feuille: [],
  },
  '__POLE_NOM__',
  periode,
) + '{{presences_par_feuille}}'
narratifCompetence = sub(narratifCompetence, '__CODE__', '{{competence_code}}')
narratifCompetence = sub(narratifCompetence, '__NOM__', '{{competence_nom}}')
narratifCompetence = sub(narratifCompetence, 'Pôle __POLE_NUM__ — __POLE_NOM__', 'Pôle {{pole_num}} — {{pole_nom}}')
narratifCompetence = sub(narratifCompetence, DATE_FR, '{{periode_debut_fr}}')
narratifCompetence = sub(narratifCompetence, DATE_FR_2, '{{periode_fin_fr}}')
narratifCompetence = sub(narratifCompetence, '__NB_FEUILLES__', '{{nb_feuilles}}')
narratifCompetence = sub(narratifCompetence, '__NB_ETABLIES__', '{{nb_feuilles_etablies}}')
narratifCompetence = sub(narratifCompetence, '__STATUT_FINAL__', '{{statut_final}}')
narratifCompetence = sub(narratifCompetence, '__CUMUL_PREUVES__', '{{cumul_preuves}}')
narratifCompetence = sub(narratifCompetence, '__CUMUL_INDICES__', '{{cumul_indices}}')
narratifCompetence = sub(narratifCompetence, '0.13', '{{confiance_moyenne}}')
narratifCompetence = sub(narratifCompetence, '7.77', '{{score_cumule}}')
assertClean('narratif-competence', narratifCompetence, ['__'])

let narratifPole = buildPolePrompt(
  { pole_num: '__POLE_NUM__', pole_nom: '__POLE_NOM__', rapports_par_feuille: [] },
  periode,
) + '{{rapports_par_feuille}}'
narratifPole = sub(narratifPole, '__POLE_NUM__', '{{pole_num}}')
narratifPole = sub(narratifPole, '__POLE_NOM__', '{{pole_nom}}')
narratifPole = sub(narratifPole, DATE_FR, '{{periode_debut_fr}}')
narratifPole = sub(narratifPole, DATE_FR_2, '{{periode_fin_fr}}')
narratifPole = sub(narratifPole, '__NB_FEUILLES__', '{{nb_feuilles}}')
narratifPole = sub(narratifPole, '__DATES_ISO__', '{{dates_iso}}')
assertClean('narratif-pole', narratifPole, ['__'])

let narratifKairos = buildKairosPrompt({ kairos_par_feuille: [] }, periode)
  + '{{kairos_par_feuille}}'
narratifKairos = sub(narratifKairos, DATE_FR, '{{periode_debut_fr}}')
narratifKairos = sub(narratifKairos, DATE_FR_2, '{{periode_fin_fr}}')
narratifKairos = sub(narratifKairos, '__NB_FEUILLES__', '{{nb_feuilles}}')
narratifKairos = sub(narratifKairos, '__DATES_ISO__', '{{dates_iso}}')
assertClean('narratif-kairos', narratifKairos, ['__'])

// --- Shared variable documentation -------------------------------------------

const vPortfolio = {
  nom: 'portfolio_texte',
  description: "Texte intégral de la feuille de portfolio du jour (segment journalier produit par la segmentation P7), injecté tel quel entre les balises <portfolio>.",
  exemple: "Première semaine de la nouvelle année à l'Astrolabe…",
}
const vDateIso = {
  nom: 'date_iso',
  description: 'Date ISO (AAAA-MM-JJ) de la feuille cartographiée.',
  exemple: '2026-01-05',
}
const vDateFr = {
  nom: 'date_fr',
  description: 'La même date au format français JJ/MM/AAAA (formatDateFr du moteur).',
  exemple: '05/01/2026',
}
const vPoleNum = {
  nom: 'pole_num',
  description: 'Numéro du pôle instruit (referentiel.poles[].num).',
  exemple: '1',
}
const vPoleNom = {
  nom: 'pole_nom',
  description: 'Nom complet du pôle (referentiel.poles[].nom).',
  exemple: pole1.nom,
}
const vPeriodeDebut = {
  nom: 'periode_debut_fr',
  description: 'Première date de la période cartographiée, JJ/MM/AAAA (merge periode.premiere).',
  exemple: '05/01/2026',
}
const vPeriodeFin = {
  nom: 'periode_fin_fr',
  description: 'Dernière date de la période cartographiée, JJ/MM/AAAA (merge periode.derniere).',
  exemple: '27/03/2026',
}
const vNbFeuilles = {
  nom: 'nb_feuilles',
  description: 'Nombre de feuilles cartographiées sur la période (merge periode.nb_feuilles).',
  exemple: '30',
}
const vDatesIso = {
  nom: 'dates_iso',
  description: 'Dates ISO des feuilles, chronologiques, séparées par « , » (merge periode.feuilles_chronologiques).',
  exemple: '2026-01-05, 2026-01-06, 2026-03-27',
}
// 1.1.0: the variables through which the extraction templates read the referential.
const vReferentielNom = {
  nom: 'referentiel_nom',
  description:
    "Nom du référentiel tel que le prompt le donne : « RESPIRE » pour l'identifiant respire, sinon son "
    + "libellé sans version finale, à défaut son identifiant (nomCourtReferentiel du moteur, "
    + 'PromptRunner::referentielName du serveur).',
  exemple: NOM_REFERENTIEL,
}
const vCodeExemple1 = {
  nom: 'code_exemple_1',
  description: 'Premier code du référentiel — exemple du gabarit JSON de sortie (codesExemples du moteur).',
  exemple: CODE_EXEMPLE_1,
}
const vCodeExemple2 = {
  nom: 'code_exemple_2',
  description:
    'Deuxième code du quatrième pôle du référentiel s’il existe, sinon son dernier code — exemple du '
    + 'gabarit JSON de sortie (codesExemples du moteur).',
  exemple: CODE_EXEMPLE_2,
}

// --- Assemble each version ---------------------------------------------------

function buildDoc({ version, date, readsReferentiel }, changelog) {
  const extraction = readsReferentiel ? extractionPoleLisante : extractionPole
  const kairos = readsReferentiel ? kairosJourLisant : kairosJour
  return {
    schemaVersion: '1.0.0',
    kind: 'prompt-package',
    id: PACKAGE_ID,
    version,
    auteur: 'Harmonia Éducation — moteur humanome (rétro-conception du protocole Aurora v3)',
    description:
      "Paquet de prompts par défaut de la plateforme : les gabarits RÉELS du moteur humanome "
      + `(engine ${ENGINE_VERSION}, P5), rétro-conçus depuis le corpus Aurora v3. Étage C — extraction `
      + "journalière (un prompt par pôle + synthèse kairos transversale, sortie JSON stricte au schéma "
      + "cartographie-jour) ; étage B1 — gabarits narratifs du merge (histoire d'apprentissage par "
      + "compétence, synthèse évolutive par pôle, synthèse Kairos évolutive), à parité byte-à-byte avec "
      + "les 69 prompts de l'oracle (docs/rapport-parite-moteur.md). Couvre les deux types de "
      + "cartographie : jour (extraction) et merge (narratifs sur les agrégats numériques de l'étage A)."
      + (readsReferentiel
        ? " Les gabarits d'extraction lisent le référentiel employé (son nom, ses pôles, ses codes) : "
          + 'ils servent tout référentiel.'
        : ''),
    modeleCible: 'claude-sonnet-5',
    referentielCompatible: { id: 'respire', versionMin: '7.0.0' },
    changelog,
    prompts: [
      {
        role: 'extraction-pole',
        nom: "Extraction journalière d'un pôle (Greffier / Pédagogue / Rapporteur)",
        texte: extraction,
        variables: [
          vDateFr, vDateIso, vPortfolio, vPoleNum, vPoleNom,
          {
            nom: 'referentiel_pole_bloc',
            description: "Bloc « Pôle N — nom » suivi des lignes «   code — nom » des compétences du pôle, construit depuis le référentiel (referentielBloc du moteur).",
            exemple: `Pôle 1 — ${pole1.nom}\n  ${comps1[0].code} — ${comps1[0].nom}`,
          },
          {
            nom: 'nb_competences_pole',
            description: 'Nombre de compétences du pôle instruit.',
            exemple: String(codes1.length),
          },
          {
            nom: 'codes_liste',
            description: 'Codes des compétences du pôle, triés, séparés par « , » — l’ordre imposé de la sortie.',
            exemple: codes1.join(', '),
          },
          {
            nom: 'premier_code',
            description: 'Premier code de la liste (exemple du gabarit JSON de sortie).',
            exemple: codes1[0],
          },
          ...(readsReferentiel ? [vReferentielNom] : []),
        ],
      },
      {
        role: 'kairos',
        nom: 'Synthèse kairos transversale de la journée',
        texte: kairos,
        variables: [
          vDateFr, vDateIso, vPortfolio,
          {
            nom: 'nb_poles',
            description: 'Nombre de pôles du référentiel.',
            exemple: String(referentiel.poles.length),
          },
          {
            nom: 'nb_competences',
            description: 'Nombre total de compétences du référentiel.',
            exemple: String(referentiel.competences.length),
          },
          {
            nom: 'referentiel_bloc',
            description: 'Référentiel complet en lignes « Pôle N — nom » / «   code — nom » (referentielBloc du moteur, tous pôles).',
            exemple: `Pôle 1 — ${pole1.nom}\n  ${comps1[0].code} — ${comps1[0].nom}\n…`,
          },
          ...(readsReferentiel ? [vReferentielNom, vCodeExemple1, vCodeExemple2] : []),
        ],
      },
      {
        role: 'narratif-competence',
        nom: "Histoire d'apprentissage par compétence (merge)",
        texte: narratifCompetence,
        variables: [
          { nom: 'competence_code', description: 'Code de la compétence (agrégat par_competence du merge).', exemple: comps1[0].code },
          { nom: 'competence_nom', description: 'Nom de la compétence.', exemple: comps1[0].nom },
          vPoleNum, vPoleNom, vPeriodeDebut, vPeriodeFin, vNbFeuilles,
          { nom: 'nb_feuilles_etablies', description: 'Nombre de feuilles ayant établi la compétence (agrégat).', exemple: '4' },
          { nom: 'statut_final', description: 'Statut final cumulé de la compétence après merge.', exemple: 'présence établie' },
          { nom: 'cumul_preuves', description: 'Cumul des preuves décisives sur la période.', exemple: '3' },
          { nom: 'cumul_indices', description: 'Cumul des indices corroboratifs sur la période.', exemple: '5' },
          { nom: 'confiance_moyenne', description: 'Confiance moyenne, formatée à 2 décimales (formatFixed2 du moteur).', exemple: '0.72' },
          { nom: 'score_cumule', description: 'Score cumulé de la compétence, formaté à 2 décimales.', exemple: '4.35' },
          {
            nom: 'presences_par_feuille',
            description: "Blocs par feuille (ordre chronologique) : « ## Feuille du JJ/MM/AAAA (date ISO : AAAA-MM-JJ) » puis statut, preuves/indices/confiance/score, motif, prescription et traces retenues — ou la seule ligne de statut court-circuit. Générés par buildCompetencePrompt du moteur.",
            exemple: '## Feuille du 05/01/2026 (date ISO : 2026-01-05)\n\n- **Statut** : présence établie\n…',
          },
        ],
      },
      {
        role: 'narratif-pole',
        nom: "Synthèse évolutive d'un pôle (merge)",
        texte: narratifPole,
        variables: [
          vPoleNum, vPoleNom, vPeriodeDebut, vPeriodeFin, vNbFeuilles, vDatesIso,
          {
            nom: 'rapports_par_feuille',
            description: 'Blocs par feuille (ordre chronologique) : titre « ## Feuille du … » puis le rapportCompletMarkdown du pôle pour cette feuille, séparés par « --- ». Générés par buildPolePrompt du moteur.',
            exemple: '## Feuille du 05/01/2026 (date ISO : 2026-01-05)\n\n[rapport du pôle]\n\n---\n',
          },
        ],
      },
      {
        role: 'narratif-kairos',
        nom: 'Synthèse Kairos évolutive (merge)',
        texte: narratifKairos,
        variables: [
          vPeriodeDebut, vPeriodeFin, vNbFeuilles, vDatesIso,
          {
            nom: 'kairos_par_feuille',
            description: 'Blocs par feuille (ordre chronologique) : titre « ## Feuille du … » puis la syntheseCompleteMarkdown du kairos de cette feuille, séparés par « --- ». Générés par buildKairosPrompt du moteur.',
            exemple: '## Feuille du 05/01/2026 (date ISO : 2026-01-05)\n\n[synthèse kairos]\n\n---\n',
          },
        ],
      },
    ],
    code: {
      // The default package delegates orchestration to the EMBEDDED engine: the
      // run launcher recognizes the engine:// reference and calls extractDay /
      // mergeDays / buildNarrativePrompts directly (same templates as above).
      // A real editable orchestration module + Web Worker sandbox arrive in P10.
      orchestration:
        `// engine://humanome-engine@${ENGINE_VERSION}\n`
        + '// Paquet par défaut : l\'orchestration est exécutée par le moteur intégré\n'
        + `// (engine/src, version ${ENGINE_VERSION}) — extractDay() pour une cartographie\n`
        + (readsReferentiel
          ? '// « jour » (un appel extraction-pole par pôle du référentiel + 1 appel\n'
            + '// kairos), mergeDays() puis\n'
          : '// « jour » (7 appels extraction-pole + 1 appel kairos), mergeDays() puis\n')
        + '// buildNarrativePrompts() pour une cartographie « merge ». Les gabarits\n'
        + '// ci-dessus sont les textes EXACTS que ce moteur instancie. Un module\n'
        + '// d\'orchestration éditable, exécuté en sandbox Web Worker, arrive en P10.\n'
        + 'export const engineRef = \'engine://humanome-engine@' + ENGINE_VERSION + '\'\n',
      entrypoint: 'extractDay',
    },
    metadata: {
      creeLe: `${date}T00:00:00Z`,
      publieLe: `${date}T00:00:00Z`,
      licence: 'AGPL-3.0-only',
      genereLePar: 'scripts/build-default-prompt-package.mjs',
      moteur: `humanome-engine@${ENGINE_VERSION}`,
    },
  }
}

const docs = VERSIONS.map((entry, i) => buildDoc(
  entry,
  VERSIONS.slice(0, i + 1).map((v) => ({ version: v.version, date: v.date, description: v.changelog })),
))

// --- Validate every version through the engine's own validators, then write --

for (const doc of docs) {
  const result = validateDocument('prompt-package', doc)
  if (!result.valid) {
    console.error(`Generated package ${doc.version} fails schemas/prompt-package.schema.json:`)
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
    + `(${doc.prompts.length} prompts, engine ${ENGINE_VERSION})`,
  )
}
