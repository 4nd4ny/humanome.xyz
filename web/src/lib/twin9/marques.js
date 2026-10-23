// Les marques du « portfolio surligné » de Twin9, retirées à l'import (sprint
// 3, lot S3-3 ; docs/twin9/spec-stigmergie.md §9 de Twin_v9).
//
// Le portfolio surligné (carto/core/portfolio-md.js) entoure chaque passage
// d'une trace de la stigmergie d'un <mark data-twin9-code="…"
// data-incertitude="…" data-intensite="…">, et range sous chaque journée le
// tableau de ses traces, entre deux commentaires `<!-- twin9-traces -->` et
// `<!-- /twin9-traces -->`. Ces marques ne vont JAMAIS dans le texte analysé :
// son empreinte changerait (les calques, les journées et les traces de la
// carte avec elle), les lecteurs les liraient, et un fichier forgerait des
// traces que seule la mémoire de la carte, sur le serveur, peut porter.
//
// Chaque import de portfolio passe donc par ici (l'import de l'interface, la
// page « Mon portfolio », la restauration d'une archive) : un élément qui
// porte un attribut `data-twin9-*`, `data-incertitude` ou `data-intensite`
// perd ses balises d'ouverture et de fermeture et garde son texte ; le
// tableau des traces part en entier, avec les lignes blanches qui le
// précèdent (un commentaire d'ouverture ou de fermeture seul reste). Le portfolio surligné réimporté redonne ainsi, à l'octet, le
// portfolio exporté sans marques. Le reste du texte, un <mark> écrit par la
// personne compris, ne change pas. Des fonctions pures.

/** Un attribut qui fait d'un élément une marque de Twin9 (nom insensible à la casse). */
const ATTRIBUT_TWIN9 = /^data-(?:twin9-[^\s"'>/=]*|incertitude|intensite)$/i

/** Une balise HTML : fermeture, nom, attributs (valeurs entre guillemets, apostrophes, ou nues), auto-fermeture. */
const BALISE = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g

/** Un attribut d'une balise : son nom. */
const NOM_ATTRIBUT = /([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g

/**
 * Le tableau des traces d'une journée, et les blancs qui le précèdent : de son
 * ouverture à sa fermeture, sans autre ouverture ni fermeture entre elles.
 * Une ouverture sans fermeture (un portfolio surligné retouché à la main)
 * reste alors dans le texte, et ne s'apparie jamais à la fermeture du tableau
 * d'une journée suivante, ce qui retirerait tout le texte d'entre eux.
 */
const TABLEAU = /\s*<!--\s*twin9-traces\s*-->(?:(?!<!--\s*\/?twin9-traces\s*-->)[\s\S])*<!--\s*\/twin9-traces\s*-->/gi

/** Ce qui annonce une marque, pour ne rien parcourir d'un texte qui n'en a pas. */
const INDICE = /data-(?:twin9-|incertitude|intensite)|twin9-traces/i

/** Les éléments sans contenu : leur balise seule part. */
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** La balise porte-t-elle un attribut de Twin9 ? */
function estMarque(attributs) {
  for (const m of attributs.matchAll(NOM_ATTRIBUT)) {
    if (ATTRIBUT_TWIN9.test(m[1])) return true
  }
  return false
}

/**
 * Les plages du texte à retirer : le tableau des traces de chaque journée, et
 * les balises de chaque marque (ouverture et fermeture, la fermeture
 * appariée par son nom, en comptant les éléments de même nom qu'elle
 * enferme : un <mark> de la personne dans une marque garde les siennes).
 * @param {string} texte
 * @returns {Array<[number, number]>} plages [début, fin), triées, disjointes
 */
export function plagesTwin9(texte) {
  const s = String(texte ?? '')
  if (!INDICE.test(s)) return []
  const plages = []
  const tableaux = []
  for (const m of s.matchAll(TABLEAU)) tableaux.push([m.index, m.index + m[0].length])
  plages.push(...tableaux)
  const dansTableau = (i) => tableaux.some(([a, b]) => i >= a && i < b)

  // par nom de balise : les marques ouvertes, chacune avec les éléments de même nom ouverts en elle
  const ouvertes = new Map()
  for (const m of s.matchAll(BALISE)) {
    if (dansTableau(m.index)) continue
    const [brut, fermeture, nomBrut, attributs, auto] = m
    const nom = nomBrut.toLowerCase()
    const plage = [m.index, m.index + brut.length]
    const pile = ouvertes.get(nom)
    if (fermeture) {
      const haut = pile?.[pile.length - 1]
      if (!haut) continue
      if (haut.dedans > 0) haut.dedans--
      else {
        plages.push(plage)
        pile.pop()
      }
      continue
    }
    if (estMarque(attributs)) {
      plages.push(plage)
      if (!auto && !VIDES.has(nom)) {
        if (!ouvertes.has(nom)) ouvertes.set(nom, [])
        ouvertes.get(nom).push({ dedans: 0 })
      }
    } else if (pile?.length && !auto && !VIDES.has(nom)) {
      pile[pile.length - 1].dedans++
    }
  }
  plages.sort((a, b) => a[0] - b[0])
  // une balise dont un attribut enfermerait un commentaire de tableau : les plages se réunissent
  const disjointes = []
  for (const p of plages) {
    const der = disjointes[disjointes.length - 1]
    if (der && p[0] < der[1]) der[1] = Math.max(der[1], p[1])
    else disjointes.push([p[0], p[1]])
  }
  return disjointes
}

/**
 * Le texte sans les marques de Twin9, et où chaque position du texte d'origine
 * tombe dans le nouveau (une position dans une plage retirée tombe à son
 * début) : une archive y ramène les bornes de ses journées.
 * @param {string} texte
 * @returns {{texte: string, retire: boolean, position: (i: number) => number}}
 */
export function retirerMarquesTwin9(texte) {
  const s = String(texte ?? '')
  const plages = plagesTwin9(s)
  if (plages.length === 0) return { texte: s, retire: false, position: (i) => i }
  let out = ''
  let curseur = 0
  for (const [a, b] of plages) {
    out += s.slice(curseur, a)
    curseur = b
  }
  out += s.slice(curseur)
  const position = (i) => {
    let retires = 0
    for (const [a, b] of plages) {
      if (i <= a) break
      retires += Math.min(i, b) - a
    }
    return i - retires
  }
  return { texte: out, retire: true, position }
}

/**
 * Le texte sans les marques de Twin9.
 * @param {string} texte
 * @returns {string}
 */
export function sansMarquesTwin9(texte) {
  return retirerMarquesTwin9(texte).texte
}
