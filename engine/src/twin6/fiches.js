// humanome engine — les fiches de pôle de Twin6 pour tout référentiel
// (2026-10-20). DOM-free ESM (ADR-001).
//
// Le paquet Twin6 public embarque les fiches de RESPIRE (P1..P7.md, tirées du
// corpus). Pour un autre référentiel, ou une version de RESPIRE d'une autre
// structure, la fiche d'un pôle s'écrit depuis le document du référentiel, comme
// le fait le moteur Twin9 (api/src/Twin9/ReferentielMoteur.php) : « # Pôle N —
// nom » puis sa description ; chaque compétence « ## CODE — nom », sa
// description, ses éléments plus fins un niveau plus bas ; les compétences
// dans l'ordre naturel de leurs codes (A2 avant A10), jointes par « --- ».

const TITRE_RE = /^## (\S+) — /gm

/** L'ordre naturel de deux codes : « A2 » avant « A10 », « 1.02 » avant « 1.10 ». */
const ordreNaturel = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })

function entete(pole) {
  const description = String(pole.description ?? '').trim()
  return `# Pôle ${Number(pole.num)} — ${String(pole.nom).trim()}\n${description === '' ? '' : `\n${description}\n`}`
}

function fiche(noeud, niveau = 2) {
  const description = String(noeud.description ?? '').trim()
  let texte = `${'#'.repeat(Math.min(6, niveau))} ${noeud.code} — ${String(noeud.nom).trim()}`
    + (description === '' ? '' : `\n\n${description}`)
  for (const element of noeud.elements ?? []) {
    texte += `\n\n${fiche(element, niveau + 1)}`
  }
  return texte
}

/**
 * La fiche de chaque pôle, écrite depuis le document du référentiel.
 *
 * @param {{poles: Array<{num, nom, description?}>, competences: Array<{code, nom, pole, description?, elements?}>}} referentiel
 * @returns {Record<string, string>} numéro du pôle -> sa fiche
 */
export function fichesDuReferentiel(referentiel) {
  const fiches = {}
  for (const pole of referentiel.poles) {
    const competences = referentiel.competences
      .filter((c) => Number(c.pole) === Number(pole.num))
      .sort((a, b) => ordreNaturel(a.code, b.code))
    fiches[String(pole.num)] = `${entete(pole).trimEnd()}\n\n${competences.map((c) => fiche(c).trim()).join('\n\n---\n\n')}\n`
  }
  return fiches
}

/** Les codes que nomment les titres « ## CODE — » d'une fiche. */
function codesDeLaFiche(texte) {
  return new Set([...String(texte).matchAll(TITRE_RE)].map((m) => m[1]))
}

/**
 * Les fiches qu'un run Twin6 donne à lire pour ce référentiel : celle du paquet
 * pour un pôle dont elle nomme exactement les compétences (RESPIRE v7 : les
 * P1..P7 du corpus, à l'identique), sinon celle écrite depuis le document.
 *
 * @param {object} referentiel le document du référentiel choisi
 * @param {Record<string, string>} [fichesDuPaquet] numéro du pôle -> fiche du paquet
 * @returns {Record<string, string>} numéro du pôle -> fiche
 */
export function fichesPourTwin6(referentiel, fichesDuPaquet = {}) {
  const ecrites = fichesDuReferentiel(referentiel)
  const fiches = {}
  for (const pole of referentiel.poles) {
    const num = String(pole.num)
    const duPaquet = fichesDuPaquet[num] ?? fichesDuPaquet[Number(num)]
    const codes = referentiel.competences.filter((c) => Number(c.pole) === Number(pole.num)).map((c) => String(c.code))
    const nommes = typeof duPaquet === 'string' ? codesDeLaFiche(duPaquet) : null
    fiches[num] = nommes !== null && nommes.size === codes.length && codes.every((c) => nommes.has(c))
      ? duPaquet
      : ecrites[num]
  }
  return fiches
}
