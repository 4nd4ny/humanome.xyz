// humanome engine — ce que les prompts disent du référentiel qu'ils emploient
// (2026-10-20). DOM-free ESM (ADR-001). Jumeaux PHP : PromptRunner::referentielName
// et PromptRunner::exampleCodes (api/src/Worker/PromptRunner.php).
//
// Aucun parcours ne suppose plus la structure de RESPIRE v7 : le nombre de
// pôles, leurs numéros et les codes se lisent dans le document du référentiel.
// Deux règles de texte restent communes aux prompts, qui les rendent à l'octet
// pour RESPIRE v7 :
//  - le nom du référentiel : « RESPIRE » pour l'id « respire », quel que soit
//    son libellé ; sinon son libellé sans sa version finale (« Humanome V18 »
//    -> « Humanome », « Fictif v2.0.0-rc.1 » -> « Fictif »), à défaut son id —
//    comme Referentiel::nomCourt du moteur Twin9 (T16) ;
//  - les codes d'exemple : le premier code du référentiel, et le deuxième de son
//    quatrième pôle s'il existe, sinon son dernier code (RESPIRE v7 : 1.01, 4.02).

import { REFERENTIEL_PAR_DEFAUT } from './conformite.js'

const VERSION_FINALE_RE = /(?:^|\s+)[vV]\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?$/u

/** Les codes d'un pôle dans l'ordre des prompts (tri de chaînes, comme referentielBloc). */
function codesDuPole(referentiel, num) {
  return referentiel.competences
    .filter((c) => Number(c.pole) === num)
    .map((c) => String(c.code))
    .sort((a, b) => (a < b ? -1 : 1))
}

/**
 * Le nom du référentiel tel que le prompt le donne.
 *
 * @param {{id?: string, label?: string}} referentiel
 * @returns {string}
 */
export function nomCourtReferentiel(referentiel) {
  const id = typeof referentiel?.id === 'string' ? referentiel.id.trim() : ''
  if ((id === '' ? REFERENTIEL_PAR_DEFAUT : id) === REFERENTIEL_PAR_DEFAUT) return 'RESPIRE'
  const label = typeof referentiel.label === 'string' ? referentiel.label.trim().replace(VERSION_FINALE_RE, '').trim() : ''
  return label !== '' ? label : id
}

/**
 * Deux codes d'exemple pour les gabarits de sortie des prompts.
 *
 * @param {{poles: Array<{num}>, competences: Array<{code, pole}>}} referentiel
 * @returns {[string, string]}
 */
export function codesExemples(referentiel) {
  const nums = referentiel.poles.map((p) => Number(p.num)).sort((a, b) => a - b)
  const tous = nums.flatMap((num) => codesDuPole(referentiel, num))
  if (tous.length === 0) throw new TypeError('codesExemples : référentiel sans compétence')
  const quatrieme = nums.length >= 4 ? codesDuPole(referentiel, nums[3]) : []
  return [tous[0], quatrieme[1] ?? tous[tous.length - 1]]
}
