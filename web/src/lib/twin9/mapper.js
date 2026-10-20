// Twin9 → viewer (D12) — mappe `carto_evolutive.json` (sortie de l'analyse
// approfondie Twin9) vers le document `cartographie-merge` du viewer sunburst,
// en RÉUTILISANT le pipeline de merge par jour (mergeDays + buildMergeDocument),
// exactement comme l'adaptateur Twin6 (engine/src/twin6/mapper.js) — aucune logique
// d'agrégation, de quintiles, d'archétypes ou d'ipsatif dupliquée.
//
// Idée clé : chaque compétence de carto_evolutive porte des `attestations`
// datées ({jour_index, date, confiance, score_preuves, score_indices, …}) et
// des `signaux` ({jour_index, type: renvoi|minoritaire|instruite}). On
// reconstitue donc un instantané par JOURNÉE DATÉE : une compétence est
// « présence établie » sur la feuille F ssi une attestation la date de F, et
// « renvoi au cartographe » ssi un signal de type renvoi tombe ce jour-là
// (jour_index → date résolu via les attestations de TOUTES les compétences).
// Les scores par feuille (preuves, indices, confiance) viennent tels quels de
// l'attestation ; fréquences, niveaux, archétypes, ipsatif et HTML sont ensuite
// calculés par le code de merge déjà testé (parité octet sur le corpus réel).
//
// Limites assumées (jamais d'invention de données, cf. convention du dépôt) :
//   - un signal dont le jour_index ne correspond à AUCUNE date connue est
//     ignoré dans la reconstruction par feuille (il reste porté par le
//     narratif et par le statut temporel de carto_evolutive) ;
//   - pieces/traces/passages ne sont PAS reconstitués : le document merge
//     final n'en émet pas (cf. docs/contrats.md — recopie feuilles{} exclue).
//
// Le dossier d'une journée (T9) : `twin9Dossier`, plus bas, rend ce qu'un
// verdict de carte du jour porte pour qui relit le raisonnement (traces
// probantes, jury, délibération) ; l'interface de cartographie le joint à
// chaque verdict d'un run du serveur (carto/core/importers/twin9-run.js).
//
// Narratifs : carto_evolutive les porte déjà — `histoires[code]` (histoire
// d'apprentissage par compétence), `rapports_poles[num]` (rapport de pôle),
// kairos (synthèse). Aucun appel LLM supplémentaire.
//
// Ce fichier (D12) ne fait pas partie du périmètre de parité avec le Python :
// il CONSOMME la sortie du moteur Twin9, qui tourne sur le serveur (ADR-011) ;
// il a quitté le moteur du navigateur pour le front avec T11.
//
// Aucune E/S ici (convention du moteur, P5) : entrées pures → document pur.

import { mergeDays } from '@engine/pipeline/merge.js'
import { buildMergeDocument } from '@engine/pipeline/merge-document.js'

const STATUT_ETABLIE = 'présence établie'
const STATUT_RENVOI = 'renvoi au cartographe'

/** Entrée de compétence d'un document-jour (contrat cartographie-jour). */
function competenceEntry(code, verdict) {
  return { code, courtCircuit: false, pieces: [], tracesRetenues: [], pedagogue: {}, verdict }
}

/**
 * Mappe un `carto_evolutive.json` Twin9 vers un document `cartographie-merge`.
 *
 * @param {object} carto carto_evolutive.json déjà aplani en objet JSON
 *   (tel que le portent les résultats d'un run, GET /api/twin9/runs/{id}/resultats).
 * @param {{id?: string, competences: Array<{code:string, nom:string, pole:number}>,
 *   poles: Array<{num:number, nom:string}>}} referentiel même forme que pour
 *   l'adaptateur Twin6 (referentielPourMoteur / référentiel publié) ; un
 *   autre que RESPIRE (T17) nomme les documents qu'il fait (`referentiel`).
 * @param {object} [meta] { generatedAt, sourceProtocole, journalId } passé à
 *   buildMergeDocument (journalId défaut = carto.journal_id).
 * @returns {object} document `cartographie-merge` (schéma du viewer).
 * @throws {Error} message en français si aucune attestation datée (rien à
 *   placer sur la ligne de temps du sunburst).
 */
export function twin9ToMergeDocument(carto, referentiel, meta = {}) {
  const competences = carto?.competences
  if (!competences || typeof competences !== 'object') {
    throw new Error('twin9ToMergeDocument : carto_evolutive.competences requis')
  }
  if (!referentiel?.competences || !referentiel?.poles) {
    throw new Error('twin9ToMergeDocument : referentiel { competences[], poles[] } requis')
  }

  const poleOf = new Map(referentiel.competences.map((c) => [c.code, Number(c.pole)]))

  // 1. jour_index → date ISO, depuis les attestations de TOUTES les compétences
  //    (seule source datée du document — il ne porte pas de tableau `journees`).
  /** @type {Map<number, string>} */
  const dateOfJour = new Map()
  for (const c of Object.values(competences)) {
    for (const a of c?.attestations ?? []) {
      if (typeof a?.jour_index === 'number' && typeof a?.date === 'string' && a.date !== '') {
        if (!dateOfJour.has(a.jour_index)) dateOfJour.set(a.jour_index, a.date)
      }
    }
  }
  const dates = [...new Set(dateOfJour.values())].sort()
  if (dates.length === 0) {
    throw new Error(
      'twin9ToMergeDocument : aucune attestation datée dans carto_evolutive — rien à projeter sur la ligne de temps',
    )
  }

  // 2. Présences et renvois par date : date → code → verdict.
  /** @type {Map<string, Map<string, object>>} */
  const parDate = new Map(dates.map((d) => [d, new Map()]))
  for (const [code, c] of Object.entries(competences)) {
    for (const a of c?.attestations ?? []) {
      const date = typeof a?.date === 'string' && a.date !== '' ? a.date : dateOfJour.get(a?.jour_index)
      const jour = parDate.get(date)
      if (!jour) continue
      jour.set(code, {
        statut: STATUT_ETABLIE,
        nombrePreuves: Number(a?.score_preuves) || 0,
        nombreIndices: Number(a?.score_indices) || 0,
        confiance: Number(a?.confiance) || 0,
        motif: '',
        prescription: '',
      })
    }
    for (const s of c?.signaux ?? []) {
      if (!String(s?.type ?? '').includes('renvoi')) continue
      const date = dateOfJour.get(s?.jour_index)
      const jour = date ? parDate.get(date) : null
      // Une attestation du même jour prime (établie > renvoi sur la feuille).
      if (jour && !jour.has(code)) {
        jour.set(code, {
          statut: STATUT_RENVOI,
          nombrePreuves: 0,
          nombreIndices: 0,
          confiance: 0,
          motif: '',
          prescription: '',
        })
      }
    }
  }

  // 3. Un document-jour par date ; le kairos (global, déjà à la forme
  //    jour-doc {kairos:{apprenant}, emergencesCrossPoles}) va au dernier.
  //    Un document d'un autre référentiel que RESPIRE le nomme (T17).
  const autre = typeof referentiel.id === 'string' && referentiel.id !== '' && referentiel.id !== 'respire' ? referentiel.id : null
  const dayDocs = dates.map((date, di) => {
    const jour = parDate.get(date)
    const doc = {
      ...(autre ? { referentiel: autre } : {}),
      date,
      poles: referentiel.poles.map((p) => ({
        poleNum: Number(p.num),
        passagesSaillants: [],
        competences: [...jour.entries()]
          .filter(([code]) => poleOf.get(code) === Number(p.num))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, verdict]) => competenceEntry(code, verdict)),
        rapport: {},
        auditPole: {},
      })),
    }
    if (carto.kairos && di === dates.length - 1) doc.kairos = carto.kairos
    return doc
  })

  // 4. Agrégation par le code de merge déjà testé.
  const agrege = mergeDays(dayDocs, referentiel)
  agrege.date_construction = meta.generatedAt ?? null

  // 5. Narratifs — défauts vides pour chaque entrée du référentiel, puis on
  //    injecte ceux que carto_evolutive porte déjà (markdown, tels quels).
  const narrativeTexts = { competences: {}, poles: {}, kairos: '' }
  for (const c of referentiel.competences) narrativeTexts.competences[c.code] = ''
  for (const p of referentiel.poles) narrativeTexts.poles[String(p.num)] = ''
  for (const [code, histoire] of Object.entries(carto.histoires ?? {})) {
    if (typeof histoire === 'string') narrativeTexts.competences[code] = histoire
  }
  for (const [num, rapport] of Object.entries(carto.rapports_poles ?? {})) {
    if (typeof rapport === 'string') narrativeTexts.poles[String(Number(num))] = rapport
  }
  narrativeTexts.kairos =
    carto.kairos?.kairos?.apprenant?.syntheseCompleteMarkdown ?? carto.kairos_evolutif ?? ''

  // 6. Document merge final — mêmes niveaux/archétypes/HTML que toute carto.
  return buildMergeDocument(agrege, narrativeTexts, {
    journalId: meta.journalId ?? carto.journal_id ?? null,
    sourceProtocole: meta.sourceProtocole ?? 'Twin9 — analyse approfondie (merge évolutif)',
    generatedAt: meta.generatedAt ?? null,
    ...(autre ? { referentiel: autre } : {}),
  })
}

const texte = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entier = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

/**
 * Le dossier d'une compétence pour une journée (T9) : ce que le verdict d'une
 * carte du jour Twin9 (`journees/<jour>/carto_jour.json`, `verdicts[code]`)
 * porte pour qui relit le raisonnement — statut, confiance, preuves et
 * indices, motif, prescriptions, traces probantes (extraits datés), jury
 * (composition, positions des deux tours, consensus, dissidences) et
 * délibération complète (pièces du greffier, accusation, défense, réplique,
 * briefing, chaque juré, relance, gardiens, président). Fonction pure : rien
 * n'est inventé, un champ absent reste nul.
 *
 * @param {object} verdict verdicts[code] d'une carte du jour
 * @returns {object} le dossier, en noms neutres (camelCase)
 */
export function twin9Dossier(verdict) {
  const v = verdict && typeof verdict === 'object' ? verdict : {}
  const d = v.deliberation && typeof v.deliberation === 'object' ? v.deliberation : {}
  const arene = d.arene && typeof d.arene === 'object' ? d.arene : {}
  const gardiens = d.gardiens && typeof d.gardiens === 'object' ? d.gardiens : {}
  const jury = v.jury && typeof v.jury === 'object' ? v.jury : null
  const positions = (p) => (p && typeof p === 'object' ? { ...p } : {})
  return {
    code: texte(v.code),
    nom: texte(v.nom),
    statut: texte(v.statut),
    confiance: typeof v.confiance === 'number' ? v.confiance : null,
    preuves: entier(v.score_preuves),
    indices: entier(v.score_indices),
    etage: texte(v.etage),
    motif: texte(v.motif_regle) ?? texte(v.dossier_cartographe?.motif) ?? texte(v.leger?.resolution),
    prescription: texte(v.prescription?.pour_apprenant),
    prescriptionCartographe: texte(v.prescription?.pour_cartographe),
    traces: (Array.isArray(v.traces_probantes) ? v.traces_probantes : []).map((t) => ({
      piece: t?.piece ?? null,
      extrait: typeof t?.extrait === 'string' ? t.extrait : '',
      date: texte(t?.date),
      type: texte(t?.type),
      role: texte(t?.role),
    })),
    jury: jury
      ? {
          mode: texte(jury.mode),
          composition: Array.isArray(jury.composition) ? [...jury.composition] : [],
          positionsR1: positions(jury.positions_r1),
          positionsFinales: positions(jury.positions_finales),
          consensus: typeof jury.consensus === 'boolean' ? jury.consensus : null,
          dissidences: Array.isArray(jury.dissidences) ? [...jury.dissidences] : [],
          secondTour: jury.second_tour === true,
          piegesNommes: Array.isArray(jury.pieges_nommes) ? [...jury.pieges_nommes] : [],
        }
      : null,
    jures: Object.entries(d.jures && typeof d.jures === 'object' ? d.jures : {}).map(([nom, j]) => ({
      nom,
      tour1: texte(j?.r1_md),
      tour2: texte(j?.r2_md),
      positionTour1: texte(j?.position_r1),
      positionFinale: texte(j?.position_finale),
      piege: texte(j?.piege),
    })),
    greffier: texte(d.greffier_md),
    accusation: texte(arene.accusation_md),
    defense: texte(arene.defense_md),
    replique: texte(arene.replique_md),
    briefing: texte(arene.briefing_md),
    relance: texte(d.relance_md),
    gardienSupport: texte(gardiens.support_md),
    gardienRaisonnement: texte(gardiens.raisonnement_md),
    president: texte(d.president_md),
    dossierCartographe: v.dossier_cartographe && typeof v.dossier_cartographe === 'object' ? { ...v.dossier_cartographe } : null,
  }
}
