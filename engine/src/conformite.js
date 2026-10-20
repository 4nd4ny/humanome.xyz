// humanome engine — conformité d'une cartographie au référentiel qu'elle
// cartographie (2026-10-20, docs/contrats.md §11). DOM-free ESM (ADR-001) ;
// jumeau PHP : api/src/Referentiel/Conformite.php.
//
// Les schémas n'imposent plus de structure (ni « RESPIRE = 7 pôles », ni codes
// « P.NN ») : un document est conforme à la VERSION de référentiel qu'il
// cartographie, que le contexte connaît (le run, le job de masse, la
// cartographie stockée, le choix de l'utilisateur). Le garde-fou demeure : une
// journée ou une fusion à qui il manque un pôle de sa version — un modèle qui
// l'a perdu en route — est refusée, comme un code que la version ne connaît pas.

import { validateDocument } from './validation.js'

/** Identifiant du référentiel d'un document qui n'en nomme pas (T17). */
export const REFERENTIEL_PAR_DEFAUT = 'respire'

/**
 * La conformité d'un document au référentiel qu'il cartographie.
 *
 * Journée : exactement les pôles du référentiel (ou de son périmètre déclaré,
 * `perimetre.partiel`), chacun une fois ; des codes du référentiel, chacun dans
 * son pôle (et dans le périmètre s'il en liste les compétences) ; un kairos qui
 * ne relie que des codes du référentiel. Fusion : un domaine par pôle du
 * référentiel, chacun une fois, des codes de ce pôle ; un profil ipsatif indexé
 * par ses pôles. Le document qui nomme un autre référentiel que celui-ci
 * (absent : RESPIRE) n'est pas conforme.
 *
 * Le marqueur `perimetre` est celui du document : seul un appelant qui l'a
 * posé lui-même (extractDay, le banc) peut s'y fier ; un document venu d'un
 * code tiers se valide sans lui, contre le référentiel restreint.
 *
 * @param {'cartographie-jour'|'cartographie-merge'} kind
 * @param {object} document un document déjà valide à son schéma
 * @param {{id?: string, poles: Array<{num: number|string}>, competences: Array<{code: string, pole: number|string}>}} referentiel
 * @returns {{ valid: boolean, errors: Array<{ path: string, keyword: string, message: string }> }}
 */
export function validateConformite(kind, document, referentiel) {
  if (!Array.isArray(referentiel?.poles) || !Array.isArray(referentiel?.competences)) {
    throw new Error('validateConformite : référentiel { poles[], competences[] } requis')
  }
  const errors = []
  const add = (path, message) => errors.push({ path, keyword: 'referentiel', message })
  const ref = indexer(referentiel)
  identite(document, referentiel, add)
  if (kind === 'cartographie-jour') {
    journee(document, ref, add)
  } else if (kind === 'cartographie-merge') {
    fusion(document, ref, add)
  } else {
    throw new Error(`validateConformite : type « ${kind} » non pris en charge`)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Le schéma, puis — s'il passe — la conformité au référentiel. Le marqueur
 * `perimetre` d'une journée partielle (extractDay, banc d'essai) n'est pas du
 * schéma (additionalProperties false) : le schéma se vérifie sans lui, la
 * conformité le lit (ses pôles, ses compétences).
 *
 * @param {'cartographie-jour'|'cartographie-merge'} kind
 * @param {unknown} document
 * @param {object} referentiel
 * @returns {{ valid: boolean, errors: Array<{ path: string, keyword: string, message: string }> }}
 */
export function validateDocumentPourReferentiel(kind, document, referentiel) {
  let pourLeSchema = document
  if (kind === 'cartographie-jour' && document && typeof document === 'object' && 'perimetre' in document) {
    const { perimetre: _marqueur, ...sansMarqueur } = document
    pourLeSchema = sansMarqueur
  }
  const schema = validateDocument(kind, pourLeSchema)
  if (!schema.valid) return schema
  return validateConformite(kind, document, referentiel)
}

/** Une liste, ou rien : ce qui n'est pas un tableau ne se parcourt pas. */
const liste = (valeur) => (Array.isArray(valeur) ? valeur : [])

/** Un numéro de pôle : un entier positif, ou sa chaîne canonique (« 3 ») ; null sinon. */
function numero(valeur) {
  if (typeof valeur === 'number') return Number.isInteger(valeur) && valeur > 0 ? valeur : null
  return typeof valeur === 'string' && /^[1-9][0-9]*$/.test(valeur) ? Number(valeur) : null
}

/** Une valeur dans un message ou une clé de code, comme la rend PHP (Conformite::texte). */
function texte(valeur) {
  if (valeur === null || valeur === undefined) return 'null'
  if (typeof valeur === 'boolean') return valeur ? '1' : ''
  if (typeof valeur === 'number' || typeof valeur === 'string') return String(valeur)
  return JSON.stringify(valeur) ?? ''
}

function indexer(referentiel) {
  const poles = new Set()
  for (const p of referentiel.poles) {
    const num = numero(p?.num)
    if (num !== null) poles.add(num)
  }
  const poleDuCode = new Map()
  for (const c of referentiel.competences) {
    poleDuCode.set(texte(c?.code), numero(c?.pole))
  }
  return { poles, poleDuCode }
}

function identite(document, referentiel, add) {
  if (typeof referentiel.id !== 'string' || referentiel.id === '') return
  const nomme = typeof document?.referentiel === 'string' && document.referentiel !== ''
    ? document.referentiel
    : REFERENTIEL_PAR_DEFAUT
  if (nomme !== referentiel.id) {
    add('/referentiel', `le document cartographie le référentiel « ${nomme} », pas « ${referentiel.id} »`)
  }
}

function journee(document, ref, add) {
  const perimetre = document?.perimetre
  const partiel = perimetre?.partiel === true
  let attendus = ref.poles
  if (partiel && Array.isArray(perimetre.poles)) {
    attendus = new Set()
    perimetre.poles.forEach((valeur, i) => {
      const num = numero(valeur)
      if (num === null || !ref.poles.has(num)) {
        add(`/perimetre/poles/${i}`, `le pôle ${texte(valeur)} du périmètre n'est pas un pôle du référentiel`)
      } else {
        attendus.add(num)
      }
    })
  }
  const competencesDuPerimetre = partiel && Array.isArray(perimetre.competences)
    ? new Set(perimetre.competences.map(texte))
    : null

  const vus = new Set()
  liste(document?.poles).forEach((pole, i) => {
    const num = numero(pole?.poleNum)
    if (num === null || !ref.poles.has(num)) {
      add(`/poles/${i}/poleNum`, `le pôle ${texte(pole?.poleNum)} n'est pas un pôle du référentiel`)
    } else if (!attendus.has(num)) {
      add(`/poles/${i}/poleNum`, `le pôle ${num} est hors du périmètre`)
    } else if (vus.has(num)) {
      add(`/poles/${i}/poleNum`, `le pôle ${num} figure deux fois`)
    }
    if (num !== null) vus.add(num)
    liste(pole?.competences).forEach((c, j) => {
      const path = `/poles/${i}/competences/${j}/code`
      codeDuPole(c?.code, num, path, ref, add)
      const code = texte(c?.code)
      if (competencesDuPerimetre !== null && ref.poleDuCode.has(code) && !competencesDuPerimetre.has(code)) {
        add(path, `la compétence ${code} est hors du périmètre`)
      }
    })
  })
  manquants(attendus, vus, '/poles', add)

  const emergences = document?.kairos?.emergencesCrossPoles
  if (emergences && typeof emergences === 'object' && !Array.isArray(emergences)) {
    const listes = [
      ['connexionsTransversales', 'codesRelies'],
      ['noeudsConceptuels', 'codesRelies'],
      ['competencesOrphelines', 'enRelationAvecCodes'],
    ]
    for (const [nom, champ] of listes) {
      liste(emergences[nom]).forEach((entree, i) => {
        liste(entree?.[champ]).forEach((code, j) => {
          if (!ref.poleDuCode.has(texte(code))) {
            add(`/kairos/emergencesCrossPoles/${nom}/${i}/${champ}/${j}`,
              `le code ${texte(code)} n'est pas une compétence du référentiel`)
          }
        })
      })
    }
  }
}

function fusion(document, ref, add) {
  const domaines = liste(document?.domains)
  const vus = new Set()
  domaines.forEach((domaine, i) => {
    let poleDuDomaine = null
    liste(domaine?.competences).forEach((c, j) => {
      const code = texte(c?.code)
      const path = `/domains/${i}/competences/${j}/code`
      const pole = ref.poleDuCode.get(code)
      if (pole === undefined) {
        add(path, `le code ${code} n'est pas une compétence du référentiel`)
      } else if (poleDuDomaine === null) {
        poleDuDomaine = pole
      } else if (pole !== poleDuDomaine) {
        add(path, `la compétence ${code} est du pôle ${texte(pole)}, pas du pôle ${texte(poleDuDomaine)} de ce domaine`)
      }
    })
    if (poleDuDomaine !== null) {
      if (vus.has(poleDuDomaine)) {
        add(`/domains/${i}`, `le pôle ${texte(poleDuDomaine)} figure dans deux domaines`)
      }
      vus.add(poleDuDomaine)
    }
  })
  manquants(ref.poles, vus, '/domains', add)
  if (domaines.length > ref.poles.size) {
    add('/domains', `${domaines.length} domaines pour ${ref.poles.size} pôles dans le référentiel`)
  }

  const profil = document?.profilIpsatif
  if (profil && typeof profil === 'object' && !Array.isArray(profil)) {
    for (const [cle, entree] of Object.entries(profil)) {
      const num = numero(cle)
      if (num === null || !ref.poles.has(num)) {
        add(`/profilIpsatif/${cle}`, `le pôle ${cle} n'est pas un pôle du référentiel`)
        continue
      }
      liste(entree?.competences).forEach((c, j) => {
        codeDuPole(c?.code, num, `/profilIpsatif/${cle}/competences/${j}/code`, ref, add)
      })
    }
  }
}

/** « il manque le pôle N du référentiel » : les pôles attendus que le document n'a pas. */
function manquants(attendus, vus, path, add) {
  const absents = [...attendus].filter((num) => !vus.has(num)).sort((a, b) => a - b)
  if (absents.length > 0) {
    add(path, `il manque ${absents.length > 1 ? 'les pôles' : 'le pôle'} ${absents.join(', ')} du référentiel`)
  }
}

function codeDuPole(valeur, num, path, ref, add) {
  const code = texte(valeur)
  const pole = ref.poleDuCode.get(code)
  if (pole === undefined) {
    add(path, `le code ${code} n'est pas une compétence du référentiel`)
  } else if (num !== null && pole !== num) {
    add(path, `la compétence ${code} est du pôle ${texte(pole)}, pas du pôle ${num}`)
  }
}
