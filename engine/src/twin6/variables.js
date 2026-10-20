// humanome engine — les variables par lesquelles les gabarits Twin6 lisent le
// référentiel employé (twin6-ouverte 1.1.0, 2026-10-20). DOM-free ESM (ADR-001).
//
// Les gabarits 1.0.0 écrivent RESPIRE v7 en toutes lettres : son nom, ses
// 7 pôles, ses 61 compétences, la forme X.YY de ses codes et quatre codes
// d'exemple. Ceux de 1.1.0 portent à leur place des variables `${NOM}` que le
// moteur rend depuis le document du référentiel (executerTwin6) ; rendues pour
// RESPIRE v7, elles redonnent le texte de 1.0.0 à l'octet. Un gabarit sans ces
// variables (1.0.0) passe inchangé.
//
//   ${REFERENTIEL}            le nom que les prompts donnent au référentiel
//                             (nomCourtReferentiel : « RESPIRE » pour l'id respire)
//   ${NB_POLES}               son nombre de pôles
//   ${NB_COMPETENCES}         son nombre de compétences
//   ${FORMAT_CODE}            la forme de ses codes, comme le moteur Twin9 l'écrit
//                             (Referentiel::formatCode, T16) : son premier code, sa
//                             première suite de lettres ou de chiffres écrite X, les
//                             suivantes Y, le reste gardé — « 1.01 » donne X.YY, « A1 » XY
//   ${PRECISION_FORMAT_CODE}  « (point séparateur, deux chiffres) », précédé d'une
//                             espace, quand cette forme est X.YY (ou XX.YY) ; vide sinon
//   ${CODES_EXEMPLE}          quatre codes d'exemple : les 2e codes des pôles 1 et 2,
//                             le 5e du pôle 2 et le 3e du pôle 3 (RESPIRE v7 : « 1.02,
//                             2.02, 2.05 et 3.03 ») quand le référentiel les a tous, sinon
//                             ses quatre premiers codes ; pôles dans l'ordre de leurs
//                             numéros, codes dans leur ordre naturel (A2 avant A10)

import { nomCourtReferentiel } from '../referentiel.js'

/** L'ordre naturel de deux codes : « A2 » avant « A10 », « 1.02 » avant « 1.10 ». */
const ordreNaturel = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })

/** Les codes de chaque pôle, pôles dans l'ordre de leurs numéros, codes dans leur ordre naturel. */
function codesParPole(referentiel) {
  return [...referentiel.poles]
    .map((p) => Number(p.num))
    .sort((a, b) => a - b)
    .map((num) => referentiel.competences
      .filter((c) => Number(c.pole) === num)
      .map((c) => String(c.code))
      .sort(ordreNaturel))
}

/**
 * La forme des codes du référentiel (Referentiel::formatCode du moteur Twin9).
 *
 * @param {string} code le premier code du référentiel
 * @returns {string}
 */
export function formatCodeTwin6(code) {
  let premier = true
  return String(code).split(/([A-Za-z]+|[0-9]+)/).filter((m) => m !== '').map((morceau) => {
    if (!/^[A-Za-z0-9]/.test(morceau)) return morceau
    const forme = (premier ? 'X' : 'Y').repeat(morceau.length)
    premier = false
    return forme
  }).join('')
}

/** « a, b, c et d » ; « a et b » ; « a ». */
function enumerer(codes) {
  return codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} et ${codes[codes.length - 1]}`
}

/**
 * Les variables d'un gabarit Twin6 pour ce référentiel.
 *
 * @param {{id?: string, label?: string, poles: Array<{num}>, competences: Array<{code, pole}>}} referentiel
 * @returns {Record<string, string>}
 */
export function variablesTwin6(referentiel) {
  if (!Array.isArray(referentiel?.poles) || !Array.isArray(referentiel?.competences)) {
    throw new TypeError('variablesTwin6 : référentiel { poles[], competences[] } requis')
  }
  const parPole = codesParPole(referentiel)
  const tous = parPole.flat()
  // Un référentiel sans compétence (qu'aucun schéma ne publie) n'a ni forme ni exemple.
  const formatCode = tous.length === 0 ? '' : formatCodeTwin6(tous[0])
  const places = [parPole[0]?.[1], parPole[1]?.[1], parPole[1]?.[4], parPole[2]?.[2]]
  return {
    REFERENTIEL: nomCourtReferentiel(referentiel),
    NB_POLES: String(referentiel.poles.length),
    NB_COMPETENCES: String(referentiel.competences.length),
    FORMAT_CODE: formatCode,
    PRECISION_FORMAT_CODE: /^X+\.YY$/.test(formatCode) ? ' (point séparateur, deux chiffres)' : '',
    CODES_EXEMPLE: enumerer(places.every((c) => c !== undefined) ? places : tous.slice(0, 4)),
  }
}

/**
 * Rend les variables `${NOM}` d'un gabarit, en une passe ; ce qu'elles ne nomment
 * pas (`${POLE}`, rendu pôle par pôle) reste en place.
 *
 * @param {string} texte
 * @param {Record<string, string>} variables
 * @returns {string}
 */
export function rendreGabaritTwin6(texte, variables) {
  // Une seule passe, par fonction : la valeur d'une variable n'est jamais relue
  // (un libellé qui écrirait « ${NB_POLES} » reste tel quel), et un « $ » de la
  // valeur (« $& »…) reste un « $ ».
  return texte.replace(/\$\{([A-Z_]+)\}/g, (motif, nom) => (Object.hasOwn(variables, nom) ? variables[nom] : motif))
}
