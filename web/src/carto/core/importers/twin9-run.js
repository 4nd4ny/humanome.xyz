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

import { twin9Dossier, twin9ToMergeDocument } from '@engine/twin9/mapper.js'
import { importSiteMerge } from './merge.js'
import { referentialErrors, toEmbeddedReferential } from '../referential.js'
import { canonicalJson, contentHash, normalizeConfidence, normalizeRole, normalizeStatus, stableId } from '../model.js'
import { splitExtract } from '../highlight.js'
import { isIsoDate } from '../dates.js'

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
  const provenance = { source: 'twin9', run: runId, files: [fileName], model: null, prompt: null, analysedAt: doc.run?.finished_at ?? null, importedAt: now }

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

  // La carte du jour de chaque date : son identifiant de journée est la date, ou elle la porte.
  const cartes = new Map()
  for (const [jour, carte] of Object.entries(doc.journees ?? {})) {
    const date = isIsoDate(carte?.date) ? carte.date : isIsoDate(jour) ? jour : null
    if (date) cartes.set(date, carte)
  }

  const variants = []
  const runDetails = []
  const dates = [...new Set([...fusion.variants.map((v) => v.date), ...cartes.keys()])].sort()
  for (const date of dates) {
    const carte = cartes.get(date)
    if (carte) {
      const variant = variantDuJour(carte, date, runId, provenance, runDetails)
      if (variant) variants.push(variant)
      continue
    }
    const v = fusion.variants.find((x) => x.date === date)
    v.summary.provenance = { ...v.summary.provenance, source: 'twin9', run: runId }
    variants.push(v)
    report.push({ severity: 'info', code: 'twin9-sans-carte-du-jour', message: `${date} : journée sans carte du jour, ses verdicts sans dossier`, date })
  }
  if (variants.length === 0) {
    report.push({ severity: 'blocking', code: 'twin9-illisible', message: `${fileName} : aucune journée datée dans ce run` })
  }
  report.push({ severity: 'info', code: 'twin9-run', message: `Run Twin9 ${doc.run?.id ?? ''} : ${variants.length} journée(s), ${runDetails.length} délibération(s)` })
  return { variants, narratives: fusion.narratives, runDetails, referential, report }
}

/**
 * Une journée d'un run : ses verdicts établis, renvoyés au cartographe, ou
 * jugés par le tribunal, chacun avec son dossier.
 */
function variantDuJour(carte, date, runId, provenance, runDetails) {
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
  return {
    date,
    summary: { id: variantId, digest, provenance, verdicts, anomalies: [] },
    detail: { verdicts: detailVerdicts, passages: [], poleReports: {}, audits: {}, kairos: null, kairosRaw: null, emergences: null, runId },
  }
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
