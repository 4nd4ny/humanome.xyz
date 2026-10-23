// Interface ultime — importeur d'un run Twin9 du serveur (T9, plan du moteur
// PHP de Twin_v9, lot 2, « Lire les résultats »).
//
// La page du run (#/twin9/<id>) remet à l'interface un document
// `twin9-run` : le run (identifiant, journal, attestation), sa fusion
// (`carto_evolutive.json`), ses cartes du jour (`journees/<jour>/carto_jour.json`,
// celles que sa mémoire a reprises comprises) et le référentiel.
//
// Chaque carte du jour donne la journée : ses verdicts — établis, renvoyés au
// cartographe, et ceux que le tribunal a jugés —, chacun avec son dossier
// (`twin9Dossier`, adaptateur du moteur) : motif, prescription, traces
// probantes avec leurs extraits ; le jury et la délibération complète vont
// au niveau du run, comme pour un run AuroraCore. La fusion, par
// l'adaptateur du moteur (`twin9ToMergeDocument`) et l'importeur des fusions
// du site, donne les synthèses évolutives, et les journées dont la carte
// manque. Un run arrêté avant sa fin (T10 : son budget, sa durée, le crédit)
// n'apporte que ses journées finies, sans fusion peut-être : le rapport
// d'import dit sa carte incomplète.
//
// Son référentiel est celui du run (T17) : RESPIRE ou celui d'une autre
// structure, 5 pôles lettrés, 9 pôles… Le jeu neuf qui le reçoit l'adopte.
//
// Depuis P0-1 (docs/contrats.md §8.9), le run porte sa configuration et son
// exécution. Le jeu n'en garde qu'une LISTE BLANCHE, car il se partage et
// s'archive : l'empreinte, les fournisseurs avec leur voie et leur étiquette
// RGPD, les réglages de chaque appel, le référentiel, le nom du jeu de
// gabarits, et de l'exécution les seuls comptes d'appels — jamais un prix,
// un coût, un plafond, la clé ni l'admission de l'attestation. Ils vont sous
// la clé « <run>|configuration » des délibérations de run (qui ne la compte
// pas comme une délibération) ; chaque journée y renvoie
// (`provenance.configurationRef`) et dit ses modèles et son jeu de gabarits.
// Sans configuration (un run d'avant P0-1), rien ne change.
//
// Depuis S3-3 (sprint 3 ; spec-stigmergie.md §9 de Twin_v9), une carte du
// jour dont la stigmergie du greffier est activée porte un bloc
// `stigmergie` : le jeu en garde, par liste blanche, le rang de l'analyse, son
// run et ses traces (core/stigmergie.js), dans le détail de la journée et,
// résumé, dans son index. Ses traces ne sont dites conservées que si les
// résultats le disent (`traces_conservees`, par journée : l'analyse est au
// journal de la mémoire de la carte), ou pour une journée que la mémoire a
// reprise ; une journée en panne, dont l'analyse n'y entre pas, les montre
// non conservées, et sans signal elles ne sont jamais dites conservées. Ni
// l'identifiant ni l'empreinte d'une journée ne changent.
//
// Depuis le sprint 4 (C3 et C4 ; journal de la cartographie D-73) :
//   - deux cartes du jour de même date — Twin9 range une seconde entrée du
//     même jour sous `<date>_b` — font une journée : à code égal, le statut
//     le plus fort l'emporte avec son dossier, et leurs traces sont réunies ;
//     leurs traces de la stigmergie aussi. Un avertissement le dit
//     (`twin9-journee-dupliquee`) : avant, la seconde écrasait la première
//     sans rien dire. Depuis T0, un run lancé du site n'en a plus ;
//   - une compétence que le second ressort établit par faisceau d'indices de
//     plusieurs journées (« établie par faisceau (second ressort) »), quand
//     aucune carte du jour ne l'établit, entre en SECONDE LECTURE (`readings`,
//     D-68) : son verdict, ses traces et leurs dates, sa délibération sous
//     « <run>:second-ressort|<code> ». Elle se lit avec la compétence, sans
//     entrer dans le soleil : ni une carte du jour ni une journée que donne
//     la fusion (sans carte) ne la portent.

import { twin9Dossier, twin9ToMergeDocument } from '../../../lib/twin9/mapper.js'
import { importSiteMerge } from './merge.js'
import { referentialErrors, toEmbeddedReferential } from '../referential.js'
import { canonicalJson, contentHash, normalizeConfidence, normalizeRole, normalizeStatus, stableId } from '../model.js'
import { splitExtract } from '../highlight.js'
import { isIsoDate } from '../dates.js'
import { resumeStigmergie, stigmergieGardee } from '../stigmergie.js'

/** Le document est-il un run Twin9 du serveur ? Arrêté avant sa fusion (T10), il n'a que ses journées. */
export function looksLikeTwin9Run(doc) {
  const objet = (x) => Boolean(x && typeof x === 'object')
  return Boolean(objet(doc) && doc.kind === 'twin9-run' && (objet(doc.carto_evolutive) || objet(doc.journees)))
}

/** Clé d'un juré dans l'interface : son nom, en minuscules sans accents (« Pédagogue » → « pedagogue »). */
export function cleDeJure(nom) {
  return String(nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const md = (texte) => (typeof texte === 'string' && texte.trim() !== '' ? { markdown: texte, preamble: '' } : null)

const estObjet = (x) => Boolean(x && typeof x === 'object' && !Array.isArray(x))
const texteOuNull = (x) => (typeof x === 'string' ? x : null)
const entier = (x) => (Number.isInteger(x) ? x : 0)

/** Les champs nommés d'un objet, et seulement eux, quand leur valeur est simple (texte, nombre, booléen, null). */
function choisir(source, champs) {
  const out = {}
  for (const champ of champs) {
    const v = source?.[champ]
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[champ] = v
  }
  return out
}

/** Une table par nom (fournisseurs, réglages, comptes) : chaque entrée réduite à ses champs nommés. */
function table(source, champs) {
  if (!estObjet(source)) return {}
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, v]) => estObjet(v))
      .map(([k, v]) => [k, choisir(v, champs)]),
  )
}

/** Le statut temporel d'une compétence que le second ressort établit (Twin_v9, Fusion::STATUT_FAISCEAU). */
export const STATUT_FAISCEAU = 'établie par faisceau (second ressort)'

/** Ce avec quoi part un appel (CallSettings::pour(), docs/contrats.md §8.9). */
const CHAMPS_REGLAGE = ['fournisseur', 'voie', 'modele', 'budget_sortie', 'effort', 'reflexion']
const CHAMPS_COMPTE = ['appels', 'pannes', 'tronques']

/**
 * La configuration d'un run telle que le jeu la garde (P0-1, critique de la
 * PR A) : une liste blanche, champ par champ — l'empreinte, les fournisseurs
 * (libellé, étiquette RGPD, voie), les réglages de chaque appel, le
 * référentiel et le nom du jeu de gabarits. Jamais `prix`,
 * `execution_prevue` (la clé, les plafonds), `profil`, `moteur`,
 * `algorithme` ni les versions des gabarits.
 * @param {unknown} configuration `run.configuration` des résultats
 * @returns {object | null} null sans configuration (un run d'avant P0-1)
 */
export function configurationGardee(configuration) {
  if (!estObjet(configuration)) return null
  const appels = estObjet(configuration.appels) ? configuration.appels : {}
  return {
    empreinte: texteOuNull(configuration.empreinte),
    fournisseurs: table(configuration.fournisseurs, ['libelle', 'rgpd', 'voie']),
    appels: {
      etages: table(appels.etages, CHAMPS_REGLAGE),
      etapes: table(appels.etapes, CHAMPS_REGLAGE),
      second_ressort: table(appels.second_ressort, CHAMPS_REGLAGE),
      lecteurs: table(appels.lecteurs, CHAMPS_REGLAGE),
      defaut: estObjet(appels.defaut) ? choisir(appels.defaut, CHAMPS_REGLAGE) : null,
    },
    referentiel: estObjet(configuration.referentiel) ? choisir(configuration.referentiel, ['id', 'version', 'label', 'empreinte']) : null,
    gabarits: { jeu: texteOuNull(configuration.gabarits?.jeu) },
  }
}

/**
 * L'exécution d'un run telle que le jeu la garde : ses comptes d'appels
 * (pannes, sorties tronquées, refus), par fournisseur et par voie, et ses
 * passes — jamais un coût, des jetons, les budgets de ses reprises.
 * @param {unknown} execution `run.execution` des résultats
 * @returns {object | null}
 */
export function executionGardee(execution) {
  if (!estObjet(execution)) return null
  return {
    statut: texteOuNull(execution.statut),
    source: texteOuNull(execution.source),
    partiel: execution.partiel === true,
    passes: entier(execution.passes),
    appels: choisir(execution.appels, ['total', 'repondus', 'pannes', 'tronques', 'refus']),
    par_fournisseur: table(execution.par_fournisseur, CHAMPS_COMPTE),
    par_voie: table(execution.par_voie, CHAMPS_COMPTE),
  }
}

/** Les modèles d'un run, par étage : « profond: m, rapide: m, lecteurs: m » (le fournisseur devant un modèle tiers). */
function modelesDuRun(etages) {
  const parts = []
  for (const etage of ['profond', 'rapide', 'lecteurs']) {
    const r = etages[etage]
    if (typeof r?.modele !== 'string') continue
    const fournisseur = typeof r.fournisseur === 'string' && r.fournisseur !== 'anthropic' ? `${r.fournisseur}:` : ''
    parts.push(`${etage}: ${fournisseur}${r.modele}`)
  }
  return parts.length > 0 ? parts.join(', ') : null
}

/** Ce que chaque journée d'un run configuré dit de lui : ses modèles, son jeu de gabarits, le renvoi à sa configuration. */
function provenanceDeConfiguration(conf, cle) {
  const voies = new Set()
  for (const f of Object.values(conf.fournisseurs)) {
    if (f.voie === 'mixte') ['directe', 'lots'].forEach((v) => voies.add(v))
    else if (typeof f.voie === 'string') voies.add(f.voie)
  }
  return {
    model: modelesDuRun(conf.appels.etages),
    prompt: conf.gabarits.jeu ? `gabarits ${conf.gabarits.jeu}` : null,
    configurationRef: cle,
    configuration: { empreinte: conf.empreinte, fournisseurs: Object.keys(conf.fournisseurs).sort(), voies: [...voies].sort() },
  }
}

/**
 * @param {object} doc document twin9-run
 * @param {{fileName?: string, now?: string}} [opts]
 * @returns {{variants: Array<object>, narratives: Array<object>, runDetails: Array<{key: string, value: object}>,
 *   referential: object | null, report: Array<object>}}
 */
export function importTwin9Run(doc, { fileName = 'twin9-run.json', now = new Date().toISOString() } = {}) {
  const report = []
  const erreurs = doc.referentiel ? referentialErrors(doc.referentiel) : []
  const referential = doc.referentiel && erreurs.length === 0 ? toEmbeddedReferential(doc.referentiel) : null
  if (erreurs.length > 0) {
    report.push({ severity: 'warning', code: 'twin9-referentiel-illisible', message: `Référentiel du run illisible (${erreurs.slice(0, 3).join(' ; ')}) : le jeu garde le sien` })
  }
  const runId = `twin9:${doc.run?.id ?? doc.carto_evolutive?.journal_id ?? 'run'}`
  // sa configuration (P0-1), par liste blanche : ses journées disent ses modèles et son jeu de gabarits
  const configuration = configurationGardee(doc.run?.configuration)
  const configurationRef = `${runId}|configuration`
  const trace = configuration ? provenanceDeConfiguration(configuration, configurationRef) : null
  const provenance = {
    source: 'twin9',
    run: runId,
    files: [fileName],
    model: trace?.model ?? null,
    prompt: trace?.prompt ?? null,
    analysedAt: doc.run?.finished_at ?? null,
    importedAt: now,
    ...(trace ? { configurationRef, configuration: trace.configuration } : {}),
  }

  // Un run arrêté avant sa fin (T10 : son budget, sa durée, le crédit) : sa carte le dit.
  if (doc.incomplete) {
    const raison = doc.run?.retard ? ` (${String(doc.run.retard).replace(/ : carte incomplète$/, '').toLowerCase()})` : ''
    report.push({ severity: 'warning', code: 'twin9-incomplete', message: `Carte incomplète : le run s’est arrêté avant sa fin${raison}` })
  }

  // La fusion : les synthèses évolutives, et les journées dont la carte manque.
  let fusion = { variants: [], narratives: [] }
  if (doc.carto_evolutive) {
    try {
      // le référentiel embarqué, ses pôles numérotés (un pôle lettré y a reçu son numéro d’ordre)
      const merge = twin9ToMergeDocument(doc.carto_evolutive, referential ?? doc.referentiel, {
        generatedAt: doc.run?.finished_at ?? null,
        journalId: doc.run?.journal ?? doc.carto_evolutive?.journal_id ?? null,
        sourceProtocole: 'Twin9 — run du serveur',
      })
      // les domaines de la fusion sont les pôles du référentiel, dans l'ordre de leurs numéros
      const poleNums = referential ? referential.poles.map((p) => p.num).sort((a, b) => a - b) : null
      fusion = importSiteMerge(merge, { fileName, now, poleNums })
    } catch (err) {
      report.push({ severity: 'warning', code: 'twin9-fusion-illisible', message: `${fileName} : ${err.message}` })
    }
  }

  // La carte du jour de chaque date : son identifiant de journée est la date, ou elle la porte. Deux cartes
  // de même date (`<date>_b`, C3), dans l'ordre de leurs identifiants, sont réunies en une journée.
  const parDate = new Map()
  for (const jour of Object.keys(doc.journees ?? {}).sort()) {
    const carte = doc.journees[jour]
    const date = isIsoDate(carte?.date) ? carte.date : isIsoDate(jour) ? jour : null
    if (!date) continue
    if (!parDate.has(date)) parDate.set(date, [])
    parDate.get(date).push({ carte, jour })
  }
  // Ses traces de la stigmergie sont-elles conservées ? Ce que disent les résultats, par journée ; une journée
  // que la mémoire a reprise, oui (seule une journée sans panne y entre) ; sinon, rien ne le dit (null).
  const conservees = estObjet(doc.traces_conservees) ? doc.traces_conservees : {}
  const reprises = new Set(Array.isArray(doc.memoire) ? doc.memoire : [])
  const conservation = (jour) => (typeof conservees[jour] === 'boolean' ? conservees[jour] : reprises.has(jour) ? true : null)
  const cartes = new Map()
  for (const [date, lues] of parDate) {
    const stigmergie = stigmergieReunie(lues.map(({ carte, jour }) => stigmergieGardee(carte?.stigmergie, conservation(jour))))
    cartes.set(date, { carte: lues.length === 1 ? lues[0].carte : cartesReunies(lues.map((l) => l.carte)), stigmergie })
    if (lues.length > 1) {
      const n = lues.length === 2 ? 'deux' : String(lues.length)
      const message = `${date} : ${n} cartes du jour (${lues.map((l) => l.jour).join(', ')}) réunies en une journée — à code égal, le statut le plus fort l’emporte, leurs traces réunies`
      report.push({ severity: 'warning', code: 'twin9-journee-dupliquee', message, date })
    }
  }

  // Le second ressort (C4) : les compétences établies par faisceau, en seconde lecture, leurs délibérations à part.
  const finiLe = typeof doc.run?.finished_at === 'string' && isIsoDate(doc.run.finished_at.slice(0, 10)) ? doc.run.finished_at.slice(0, 10) : null
  const ressort = secondRessort(doc.carto_evolutive, { runId, journal: doc.run?.journal ?? doc.carto_evolutive?.journal_id ?? null, analysedAt: finiLe, now })
  const parFaisceau = new Set(ressort.readings.flatMap((r) => Object.keys(r.codes)))

  const variants = []
  const runDetails = []
  const dates = [...new Set([...fusion.variants.map((v) => v.date), ...cartes.keys()])].sort()
  for (const date of dates) {
    const lue = cartes.get(date)
    if (lue) {
      const { stigmergie } = lue
      const variant = variantDuJour(lue.carte, date, runId, provenance, runDetails, stigmergie)
      if (variant) variants.push(variant)
      if (variant && stigmergie?.traces.length > 0 && stigmergie.conservee === false) {
        const message = `${date} : traces de la stigmergie non conservées — l’analyse de cette journée n’est pas dans la mémoire de la carte (un appel en panne n’y dépose rien : une panne n’est jamais un verdict)`
        report.push({ severity: 'info', code: 'twin9-traces-non-conservees', message, date })
      } else if (variant && stigmergie?.traces.length > 0 && stigmergie.conservee === null) {
        const message = `${date} : traces de la stigmergie non confirmées — rien ne dit qu’elles sont dans la mémoire de la carte`
        report.push({ severity: 'info', code: 'twin9-traces-non-confirmees', message, date })
      }
      continue
    }
    const v = fusion.variants.find((x) => x.date === date)
    // une compétence établie par faisceau n'est d'aucune journée : elle se lit en seconde lecture (C4)
    const verdicts = v.summary.verdicts.filter((x) => !parFaisceau.has(x.code))
    if (verdicts.length === 0) continue
    v.summary.verdicts = verdicts
    v.detail.verdicts = Object.fromEntries(Object.entries(v.detail.verdicts).filter(([code]) => !parFaisceau.has(code)))
    v.summary.provenance = { ...v.summary.provenance, source: 'twin9', run: runId, ...(trace ?? {}) }
    variants.push(v)
    report.push({ severity: 'info', code: 'twin9-sans-carte-du-jour', message: `${date} : journée sans carte du jour, ses verdicts sans dossier`, date })
  }
  runDetails.push(...ressort.runDetails)
  if (variants.length === 0) {
    report.push({ severity: 'blocking', code: 'twin9-illisible', message: `${fileName} : aucune journée datée dans ce run` })
  }
  report.push({ severity: 'info', code: 'twin9-run', message: `Run Twin9 ${doc.run?.id ?? ''} : ${variants.length} journée(s), ${runDetails.length} délibération(s)` })
  // après le compte des délibérations, dont elle n'est pas
  if (configuration && variants.length > 0) {
    runDetails.push({
      key: configurationRef,
      value: { kind: 'twin9-run-meta', run: runId, configuration, execution: executionGardee(doc.run?.execution) },
    })
  }
  return { variants, narratives: fusion.narratives, runDetails, readings: ressort.readings, referential, report }
}

/** Le rang d'un statut : établi, puis renvoyé, puis non établi. */
const FORCE = { established: 3, needs_review: 2, not_established: 1, unknown: 0 }
const force = (v) => FORCE[normalizeStatus(v?.statut)] ?? 0
const confiance = (v) => normalizeConfidence(v?.confiance) ?? -1

/** Les traces probantes de deux verdicts, celles du premier d'abord, sans en redire une (même extrait, date et rôle). */
function tracesReunies(a, b) {
  const vues = new Set()
  return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter((t) => {
    const cle = JSON.stringify([t?.extrait ?? '', t?.date ?? null, t?.role ?? null])
    return !vues.has(cle) && vues.add(cle)
  })
}

/**
 * Deux cartes du jour de même date (C3), réunies : chaque compétence de l'une
 * ou de l'autre ; à code égal, le verdict au statut le plus fort (à statut
 * égal, la plus forte confiance, puis la première carte) l'emporte avec son
 * dossier, et reçoit les traces de l'autre.
 */
function cartesReunies(cartes) {
  const verdicts = {}
  for (const carte of cartes) {
    for (const [code, v] of Object.entries(carte?.verdicts ?? {})) {
      const deja = verdicts[code]
      if (deja === undefined) {
        verdicts[code] = v
        continue
      }
      const fort = force(v) > force(deja) || (force(v) === force(deja) && confiance(v) > confiance(deja)) ? v : deja
      const faible = fort === v ? deja : v
      verdicts[code] = { ...fort, traces_probantes: tracesReunies(fort?.traces_probantes, faible?.traces_probantes) }
    }
  }
  return { ...cartes[0], verdicts }
}

/**
 * Les traces de la stigmergie de cartes réunies (C3) : celles de toutes, sans
 * en redire une ; le rang de l'analyse la plus avancée, et son run ;
 * conservées si toutes le sont, non conservées si l'une ne l'est pas, sinon
 * rien ne le dit.
 */
function stigmergieReunie(gardees) {
  const blocs = gardees.filter(Boolean)
  if (blocs.length < 2) return blocs[0] ?? null
  const premiere = [...blocs].sort((a, b) => (b.analyse ?? -1) - (a.analyse ?? -1))[0]
  const etats = blocs.map((b) => b.conservee)
  const vues = new Set()
  return {
    analyse: premiere.analyse,
    run: premiere.run,
    conservee: etats.includes(false) ? false : etats.every((x) => x === true) ? true : null,
    traces: blocs.flatMap((b) => b.traces).filter((t) => !vues.has(t.id) && vues.add(t.id)),
  }
}

/**
 * Le second ressort d'un run (C4, sprint 4 ; journal de la cartographie D-68,
 * D-73) : les compétences qu'il établit par faisceau, une seconde lecture du
 * run. Par compétence, son verdict (statut, statut du moteur, confiance,
 * preuves et indices) et les dates de ses traces ; sa délibération, sous
 * « <lecture>|<code> » : la décision du président (motif et prescription),
 * le jury, le débat, les pièces du greffier, la note au cartographe, et ses
 * traces à la forme que lit la seconde lecture (`{pieceId, role, pieceType,
 * extract, date}`).
 * @returns {{readings: object[], runDetails: Array<{key: string, value: object}>}}
 */
function secondRessort(carto, { runId, journal, analysedAt, now }) {
  const id = `${runId}:second-ressort`
  const codes = {}
  const details = []
  for (const code of Object.keys(estObjet(carto?.competences) ? carto.competences : {}).sort()) {
    const c = carto.competences[code]
    if (c?.statut_temporel !== STATUT_FAISCEAU || !estObjet(c.faisceau)) continue
    const f = c.faisceau
    const dossier = twin9Dossier({
      code,
      nom: c.nom,
      statut: f.statut,
      confiance: f.confiance,
      etage: 'faisceau',
      motif_regle: f.motif,
      prescription: f.prescription,
      traces_probantes: f.traces,
      jury: f.jury,
      deliberation: f.deliberation,
      dossier_cartographe: f.dossier_cartographe,
    })
    const traces = dossier.traces.map((t) => ({ pieceId: t.piece, role: normalizeRole(t.role).role, pieceType: t.type, extract: t.extrait, date: isIsoDate(t.date) ? t.date : null }))
    const dates = [...new Set(traces.map((t) => t.date).filter(Boolean))].sort()
    const preuves = traces.filter((t) => t.role === 'preuve').length
    codes[code] = { status: normalizeStatus(dossier.statut), rawStatus: STATUT_FAISCEAU, confidence: normalizeConfidence(dossier.confiance), proofs: preuves, hints: traces.length - preuves, dates }
    details.push({
      key: `${id}|${code}`,
      value: { ...runDetail(dossier, dates[0] ?? null), president: { verdict_argumente: dossier.motif, prescription: dossier.prescription }, traces },
    })
  }
  if (details.length === 0) return { readings: [], runDetails: [] }
  return { readings: [{ id, source: 'twin9', journal, analysedAt, importedAt: now, codes, poles: [] }], runDetails: details }
}

/**
 * Une journée d'un run : ses verdicts établis, renvoyés au cartographe, ou
 * jugés par le tribunal, chacun avec son dossier ; et les traces de la
 * stigmergie de son analyse (`stigmergieGardee`), résumées dans l'index.
 */
function variantDuJour(carte, date, runId, provenance, runDetails, stigmergie = null) {
  const entrees = Object.entries(carte.verdicts ?? {})
    .map(([code, brut]) => [code, twin9Dossier(brut)])
    .filter(([, d]) => normalizeStatus(d.statut) !== 'not_established' || d.jury !== null || d.president !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (entrees.length === 0) return null
  const digest = contentHash(canonicalJson(entrees.map(([c, d]) => [c, d.statut, d.confiance, d.traces])))
  const variantId = stableId('v', [date, 'twin9', runId, digest])

  const verdicts = []
  const detailVerdicts = {}
  for (const [code, dossier] of entrees) {
    const status = normalizeStatus(dossier.statut)
    // Les traces probantes et leurs extraits ; à défaut, les compteurs du verdict.
    const traces = dossier.traces.length > 0
      ? dossier.traces.map((t, i) => ({ id: `${variantId}:${code}:t${i}`, role: normalizeRole(t.role).role, t }))
      : [...Array(dossier.preuves).fill('preuve'), ...Array(dossier.indices).fill('indice')].map((role, i) => ({ id: `${variantId}:${code}:c${i}`, role, t: null }))
    verdicts.push({
      code,
      status,
      rawStatus: dossier.statut,
      courtCircuit: false,
      confidence: normalizeConfidence(dossier.confiance),
      proofs: traces.filter((t) => t.role === 'preuve').length,
      hints: traces.filter((t) => t.role !== 'preuve').length,
      traces: traces.map(({ id, role }) => ({ id, role })),
    })
    const detail = {
      motif: dossier.motif,
      prescription: dossier.prescription,
      pedagogue: null,
      jury: null,
      president: null,
      pieces: [],
      traces: Object.fromEntries(
        traces.map(({ id, role, t }) => {
          const extract = t?.extrait ?? ''
          const anchors = splitExtract(extract)
          return [id, { role, rawRole: t?.role ?? null, pieceType: t?.type ?? null, pieceId: t?.piece ?? null, pid: null, extract, start: anchors.start, end: anchors.end, context: '', author: null, sourceDate: isIsoDate(t?.date) ? t.date : date, resolved: Boolean(extract), synthetic: t === null }]
        }),
      ),
    }
    if (dossier.jury !== null || dossier.president !== null || dossier.jures.length > 0) {
      // la délibération d'une journée, lue dans sa journée (et non pour tout le journal, comme AuroraCore)
      detail.runRef = `${runId}|${date}|${code}`
      detail.runScope = 'journee'
      runDetails.push({ key: detail.runRef, value: runDetail(dossier, date) })
    }
    detailVerdicts[code] = detail
  }
  const summary = { id: variantId, digest, provenance, verdicts, anomalies: [] }
  const detail = { verdicts: detailVerdicts, passages: [], poleReports: {}, audits: {}, kairos: null, kairosRaw: null, emergences: null, runId }
  if (stigmergie) {
    summary.stigmergie = resumeStigmergie(stigmergie)
    detail.stigmergie = stigmergie
  }
  return { date, summary, detail }
}

/** Le jury et la délibération d'un verdict, à la forme que lit l'interface (Jury.jsx). */
function runDetail(dossier, date) {
  const jury = {}
  const deliberation = {}
  for (const j of dossier.jures) {
    const k = cleDeJure(j.nom)
    jury[k] = { label: j.nom, position: j.positionFinale ?? j.positionTour1, synthese: j.tour2 ?? j.tour1 ?? '' }
    const texte = [j.tour1 ? `### Premier tour\n\n${j.tour1}` : null, j.tour2 ? `### Second tour\n\n${j.tour2}` : null, j.piege ? `**Piège nommé** : ${j.piege}` : null]
      .filter(Boolean)
      .join('\n\n')
    if (texte) deliberation[k] = { markdown: texte, preamble: '' }
  }
  if (dossier.president) deliberation.president = md(dossier.president)
  const debate = {}
  for (const [k, texte] of [
    ['accusation', dossier.accusation],
    ['defense', dossier.defense],
    ['replique', dossier.replique],
    ['briefing', dossier.briefing],
    ['relance', dossier.relance],
    ['gardien_support', dossier.gardienSupport],
    ['gardien_raisonnement', dossier.gardienRaisonnement],
  ]) {
    if (md(texte)) debate[k] = md(texte)
  }
  return {
    code: dossier.code,
    name: dossier.nom,
    status: normalizeStatus(dossier.statut),
    rawStatus: dossier.statut,
    confidence: normalizeConfidence(dossier.confiance),
    scores: { proofs: dossier.preuves, hints: dossier.indices, score: null },
    jury,
    // le motif et la prescription de la journée se lisent avec son verdict ; le président, dans sa délibération
    president: null,
    deliberation,
    debate,
    pieces: dossier.greffier ? [{ date, name: 'Pièces du greffier', text: dossier.greffier }] : [],
    notes: dossier.prescriptionCartographe ? [{ titre: 'Pour le cartographe', markdown: dossier.prescriptionCartographe }] : [],
    traces: dossier.traces,
  }
}
