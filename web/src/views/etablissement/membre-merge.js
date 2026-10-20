// Merge CÔTÉ CLIENT des documents jour d'un membre (décision M8, ADR-005) :
// le worker serveur n'exécute que l'extraction LLM ; la fusion déterministe
// (parité oracle, P5) reste au moteur JS et se calcule ICI, au moment de
// l'affichage par l'établissement — même motif que run-launcher.executeRun
// (mergeDays + buildMergeDocument avec narratifs LOCAUX, sans appel LLM).
//
// Tout référentiel (2026-10-20) : la fusion se fait avec la version du
// référentiel que le run a figée, et son document se valide contre elle —
// le schéma, puis la conformité (ses pôles, ses codes ; un autre référentiel
// que RESPIRE est nommé, T17).

import { mergeDays } from '@engine/pipeline/merge.js'
import { buildMergeDocument } from '@engine/pipeline/merge-document.js'
import { REFERENTIEL_PAR_DEFAUT, validateDocumentPourReferentiel } from '@engine/conformite.js'
import { buildLocalNarratives } from '../../lib/run-launcher.js'

/**
 * Déduplique les entrées jour par date (garde la dernière reçue) et les trie —
 * mergeDays exige des dates uniques ; un membre peut appartenir à plusieurs
 * cohortes du même établissement avec des extractions rejouées.
 *
 * @template {{date: string, document: object}} E
 * @param {E[]} entries
 * @returns {E[]} entrées à document, dates uniques, triées
 */
export function uniqueDayEntries(entries) {
  const byDate = new Map()
  for (const entry of entries ?? []) {
    if (entry?.document && typeof entry.date === 'string') {
      byDate.set(entry.date, entry)
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, entry]) => entry)
}

/**
 * Les documents jour dédupliqués (uniqueDayEntries), seuls.
 *
 * @param {Array<{date: string, document: object}>} entries
 * @returns {object[]} documents cartographie-jour, dates uniques, triés
 */
export function uniqueDayDocuments(entries) {
  return uniqueDayEntries(entries).map((entry) => entry.document)
}

/**
 * Le référentiel de la fusion : la version que le run le plus récent a figée
 * (identifiant de run le plus haut ; à égalité, la dernière entrée reçue).
 *
 * @param {Array<{runId?: number|null, referentiel?: {id: string, version: string|null}}>} entries
 * @returns {{id: string, version: string|null}|null} null sans entrée
 */
export function referentielDeLaFusion(entries) {
  let retenue = null
  for (const entry of entries ?? []) {
    if (retenue === null || (entry?.runId ?? -1) >= (retenue.runId ?? -1)) retenue = entry
  }
  if (retenue === null) return null
  return { id: retenue.referentiel?.id ?? REFERENTIEL_PAR_DEFAUT, version: retenue.referentiel?.version ?? null }
}

/**
 * Construit la cartographie-merge d'un membre à partir de ses documents jour.
 * Échec NON destructif : le moteur rend un domaine par pôle du référentiel et
 * le schéma exige de chacun au moins une compétence établie — un portfolio
 * court peut rendre la fusion non constructible ; les documents jour restent
 * alors consultables un à un.
 *
 * @param {object[]} dayDocs documents cartographie-jour (dates uniques)
 * @param {object} referentiel document de la version du référentiel du run
 * @param {{journalId?: string, now?: () => string}} [options]
 * @returns {{document: object|null, error: string|null}}
 */
export function buildMemberMerge(dayDocs, referentiel, options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  if (!Array.isArray(dayDocs) || dayDocs.length === 0) {
    return { document: null, error: 'Aucun document jour à fusionner.' }
  }
  try {
    const merged = mergeDays(dayDocs, referentiel)
    const stamp = String(now()).slice(0, 19) // schéma : AAAA-MM-JJThh:mm:ss
    const id = typeof referentiel?.id === 'string' && referentiel.id !== '' ? referentiel.id : REFERENTIEL_PAR_DEFAUT
    const document = buildMergeDocument(
      { ...merged, date_construction: stamp },
      buildLocalNarratives(merged),
      {
        journalId: options.journalId ?? 'cohorte',
        sourceProtocole:
          'Extraction de masse M8 — merge déterministe calculé côté client (moteur JS)',
        generatedAt: stamp,
        ...(id !== REFERENTIEL_PAR_DEFAUT ? { referentiel: id } : {}),
      },
    )
    const { valid, errors } = validateDocumentPourReferentiel('cartographie-merge', document, referentiel)
    if (!valid) {
      const detail = errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join(' ; ')
      throw new Error(`${errors.length} erreur(s) de validation : ${detail}`)
    }
    return { document, error: null }
  } catch (err) {
    return {
      document: null,
      error:
        'La cartographie fusionnée n’a pas pu être construite : le format exige au moins ' +
        'une compétence établie dans chacun des pôles du référentiel sur la période. Les documents ' +
        'journaliers restent consultables individuellement. Détail technique : ' +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}
