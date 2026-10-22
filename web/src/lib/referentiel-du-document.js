// Le référentiel d'une cartographie, pour la lire (2026-10-20) : la version
// que son contexte connaît — la cartographie stockée, l'entrée locale, la
// relecture : { id, version } —, sinon, parmi les versions publiées du
// référentiel que nomme son document (RESPIRE pour un document qui n'en nomme
// pas, T17), la plus récente à laquelle il est conforme, à défaut la dernière —
// la règle de la relecture (api/src/Cartographe/ReviewReferentiel.php) : une
// journée de RESPIRE v7 reste lue avec la v7 quand une version d'une autre
// structure paraît. Plus jamais RESPIRE supposé pour un document d'un autre
// référentiel.
//
// Lecture seule : les versions publiées viennent de la base (API publique,
// S5), à défaut de l'index statique. Une version connue mais introuvable (ni
// l'une ni l'autre ne l'ont, copie hors ligne) cède la place à la dernière
// version publiée du même référentiel ; RESPIRE retombe enfin sur sa copie
// embarquée (loadPublishedReferentiel sans id ne rejette jamais). Un autre
// référentiel introuvable rejette : la vue le dit plutôt que de le lire avec
// RESPIRE.

import { REFERENTIEL_PAR_DEFAUT, validateConformite } from '@engine/conformite.js'
import { listPublishedReferentiels, loadPublishedReferentiel } from '../data/referentiel.js'

/**
 * La référence du référentiel d'un document.
 *
 * @param {object | null | undefined} document cartographie (jour, merge…)
 * @param {{id?: string, version?: string | null} | null} [connu] ce que le contexte en sait
 * @returns {{id: string, version: string | null}}
 */
export function referenceDuDocument(document, connu = null) {
  if (typeof connu?.id === 'string' && connu.id !== '') {
    return { id: connu.id, version: typeof connu.version === 'string' && connu.version !== '' ? connu.version : null }
  }
  const nomme = document?.referentiel
  return { id: typeof nomme === 'string' && nomme !== '' ? nomme : REFERENTIEL_PAR_DEFAUT, version: null }
}

/**
 * Charge le document du référentiel d'une cartographie.
 *
 * @param {object | null | undefined} document
 * @param {{connu?: {id?: string, version?: string | null} | null,
 *   getReferentiel?: typeof loadPublishedReferentiel,
 *   listReferentiels?: typeof listPublishedReferentiels}} [options] coutures de test
 * @returns {Promise<object>} le document du référentiel
 * @throws {Error} message français : un référentiel autre que RESPIRE introuvable
 */
export async function chargerReferentielDuDocument(
  document,
  { connu = null, getReferentiel = loadPublishedReferentiel, listReferentiels = listPublishedReferentiels } = {},
) {
  const { id, version } = referenceDuDocument(document, connu)
  const docDe = (loaded) => loaded?.doc ?? loaded ?? null
  if (version !== null) {
    try {
      const exact = docDe(await getReferentiel({ id, version }))
      if (exact) return exact
    } catch {
      // la version connue est introuvable : la dernière publiée, ci-dessous
    }
  } else if (document?.kind === 'cartographie-jour' || document?.kind === 'cartographie-merge') {
    // Sans version connue : la plus récente version publiée à laquelle le
    // document est conforme (les versions publiées, de la plus récente à la
    // plus ancienne).
    const publie = (await listReferentiels().catch(() => [])).find((r) => r.id === id)
    for (const { semver } of publie?.versions ?? []) {
      try {
        const candidat = docDe(await getReferentiel({ id, version: semver }))
        if (candidat && validateConformite(document.kind, document, candidat).valid) return candidat
      } catch {
        // version illisible : la suivante
      }
    }
  }
  const dernier = docDe(id === REFERENTIEL_PAR_DEFAUT ? await getReferentiel() : await getReferentiel({ id }))
  if (!dernier) throw new Error(`Le référentiel « ${id} » n'a pas pu être chargé`)
  return dernier
}
