// humanome engine — le référentiel Humanome (le YAML que publie
// https://respire.school/referentiel) converti en document du schéma
// `referentiel` 2.1.0 (S5, lot B). DOM-free ESM (ADR-001) : le module reçoit
// le YAML déjà lu (un objet) et ne lit, n'écrit ni ne hache rien de lui-même ;
// le script scripts/convertir-humanome.mjs lit le fichier, le parse (paquet
// `yaml`) et fournit la fonction de hachage.
//
// Règles (docs/referentiel-humanome.md) :
//  - id et version tels que le YAML les déclare (`referentiel.id`,
//    `referentiel.version`), jamais `respire` ; libellé « <nom> V<majeure> »
//    tiré du titre (« Référentiel Humanome V18 » -> « Humanome V18 », que les
//    prompts abrègent en « Humanome ») ;
//  - pôles `dimensions[]`, lettrés A, B, C… sans trou, au rang de leur lettre :
//    nom « A · titre », description = orientation, couleur de la palette fixe
//    par rang de la cartographie (POLE_PALETTE, merge-document.js) ;
//  - niveau « capacité » par défaut : les capacités (A1…) sont les compétences,
//    leurs facettes (A1.1…) leurs éléments, que les fiches de scan montrent
//    sous elles ; niveau « facette » en option : les facettes sont les
//    compétences, sous le pôle de leur capacité (ReferentielRepository::auNiveau) ;
//  - descriptions en Markdown, composées des seules rubriques du YAML, dans un
//    ordre fixe, sans rien ajouter : jamais un titre `#` (les fiches et
//    l'import Markdown lisent les titres comme la structure) ;
//  - décomptes faits dans le contenu ; un écart avec `referentiel.structure`,
//    une rubrique attendue absente sont des avertissements, pas des refus.

import { poleColor } from './pipeline/merge-document.js'

/** Version du convertisseur, écrite dans `source` : une règle qui change la change. */
export const VERSION_CONVERTISSEUR = '1.0.0'

/** La page qui publie le référentiel (vérifiée le 2026-10-22) ; l'URL du fichier se donne à part. */
export const PAGE_SOURCE = 'https://respire.school/referentiel'

/** Les deux niveaux de l'Humanome, du plus large au plus fin. */
export const NIVEAUX = Object.freeze(['capacité', 'facette'])

const SCHEMA_VERSION = '2.1.0'

// Mêmes formes que le schéma (version) et que ReferentielRepository::ID_PATTERN (id)
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SHA256_RE = /^[0-9a-f]{64}$/
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Les rubriques d'une capacité versées dans sa description, dans cet ordre (après la définition). */
const RUBRIQUES_CAPACITE = [
  ['finalite', 'Finalité'],
  ['savoirs_pratiques', 'Savoirs pratiques'],
  ['participation_avec_ia', 'Participation avec l’IA'],
  ['frontiere', 'Frontière'],
  ['limites', 'Limites'],
  ['situation', 'Situation'],
  ['relance', 'Relance'],
  ['ancrage_obligatoire', 'Ancrage obligatoire'],
]

/** Celles d'une facette, après sa description. */
const RUBRIQUES_FACETTE = [
  ['manifestations', 'Manifestations'],
  ['faux_positif', 'Faux positif'],
]

/** Le décompte que `referentiel.structure` annonce, rubrique par rubrique. */
const STRUCTURE = [
  ['poles', 'pôles'],
  ['competences', 'capacités'],
  ['facettes', 'facettes'],
  ['competences_par_pole', 'capacités par pôle'],
  ['facettes_par_pole', 'facettes par pôle'],
  ['reperes_de_manifestation', 'manifestations'],
]

/** Un YAML refusé : chaque erreur porte son chemin dans le YAML. */
export class ErreurConversion extends Error {
  /** @param {Array<{chemin: string, message: string}>} erreurs */
  constructor(erreurs) {
    super(`Conversion refusée :\n${erreurs.map((e) => `  ${e.chemin} : ${e.message}`).join('\n')}`)
    this.name = 'ErreurConversion'
    this.erreurs = erreurs
  }
}

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const texte = (v) => (typeof v === 'string' ? v.trim() : '')
/** Ordre des unités de code, celui de strcmp (ContentHash::normalize). */
const parCode = (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

/**
 * Une rubrique en Markdown : « **Libellé** : texte », ou le libellé puis une
 * liste pour une rubrique-liste. null si la rubrique est absente ou vide ;
 * une valeur d'une autre forme est une erreur.
 */
function rubrique(valeur, libelle, chemin, erreurs) {
  if (valeur === undefined || valeur === null) return null
  if (typeof valeur === 'string') {
    return valeur.trim() === '' ? null : `**${libelle}** : ${valeur.trim()}`
  }
  if (Array.isArray(valeur) && valeur.every((v) => typeof v === 'string')) {
    const items = valeur.map((v) => v.trim()).filter((v) => v !== '')
    return items.length === 0 ? null : `**${libelle}** :\n\n${items.map((v) => `- ${v}`).join('\n')}`
  }
  erreurs.push({ chemin, message: 'rubrique illisible (ni texte ni liste de textes)' })
  return null
}

/** Le texte d'ouverture puis les rubriques présentes ; les absentes notées dans `manques`. */
function composer(noeud, ouverture, rubriques, chemin, code, manques, erreurs) {
  const parties = []
  const premier = texte(noeud[ouverture])
  if (premier === '') (manques[ouverture] ??= []).push(code)
  else parties.push(premier)
  for (const [cle, libelle] of rubriques) {
    const partie = rubrique(noeud[cle], libelle, `${chemin}.${cle}`, erreurs)
    if (partie === null) (manques[cle] ??= []).push(code)
    else parties.push(partie)
  }
  return parties.join('\n\n')
}

/** `[A-E]` pour les lettres de A à E ; `A` pour une seule. */
const plage = (premier, dernier) => (premier === dernier ? premier : `[${premier}-${dernier}]`)

/**
 * La chaîne que hache le `contentHash` : pôles {num, nom, couleur} triés par
 * numéro, compétences {code, nom, pole} triées par code, JSON compact —
 * octet pour octet celle de ContentHash::compute (PHP) et de
 * scripts/extract-referentiel.mjs.
 *
 * @param {{poles: Array<object>, competences: Array<object>}} document
 * @returns {string}
 */
export function corpsDuHash(document) {
  const poles = document.poles
    .map((p) => ({ num: p.num, nom: p.nom, couleur: p.couleur }))
    .sort((a, b) => a.num - b.num)
  const competences = document.competences
    .map((c) => ({ code: c.code, nom: c.nom, pole: c.pole }))
    .sort(parCode)
  return JSON.stringify({ poles, competences })
}

/**
 * Le référentiel Humanome converti en document du schéma `referentiel`.
 *
 * @param {object} yaml le YAML lu (`referentiel`, `dimensions`…)
 * @param {object} [options]
 * @param {string} [options.fichier] le nom du fichier converti (sans chemin), écrit dans `source`
 * @param {string} [options.sha256] l'empreinte du fichier converti, écrite dans `source`
 * @param {string} [options.url] d'où vient le fichier (défaut : la page qui le publie)
 * @param {'capacité'|'facette'} [options.niveau] le niveau qui tient lieu de compétence
 * @param {(texte: string) => string} [options.hacher] sha256 hexadécimal d'un texte ;
 *   sans lui, pas de `contentHash` (le serveur le recalcule à l'import)
 * @returns {{document: object, avertissements: string[]}}
 * @throws {ErreurConversion} un YAML que le schéma ou le moteur ne liraient pas
 */
export function convertirHumanome(yaml, { fichier, sha256, url = PAGE_SOURCE, niveau = NIVEAUX[0], hacher } = {}) {
  if (!NIVEAUX.includes(niveau)) {
    throw new TypeError(`Niveau inconnu : « ${niveau} » (${NIVEAUX.join(' ou ')})`)
  }
  if (sha256 !== undefined && !SHA256_RE.test(sha256)) {
    throw new TypeError('sha256 : 64 caractères hexadécimaux minuscules')
  }
  const erreurs = []
  const avertissements = []
  const r = estObjet(yaml?.referentiel) ? yaml.referentiel : null
  if (r === null) throw new ErreurConversion([{ chemin: 'referentiel', message: 'bloc absent' }])

  // --- identité
  const id = texte(r.id)
  if (id === 'respire') {
    erreurs.push({ chemin: 'referentiel.id', message: '« respire » est RESPIRE v7, le référentiel de la plateforme : l’Humanome garde son identifiant' })
  } else if (!ID_RE.test(id)) {
    erreurs.push({ chemin: 'referentiel.id', message: 'absent ou invalide (minuscules, chiffres, « . », « _ », « - », 64 caractères au plus)' })
  }
  const version = typeof r.version === 'string' ? r.version.trim() : String(r.version ?? '')
  if (!SEMVER_RE.test(version)) {
    erreurs.push({ chemin: 'referentiel.version', message: 'absente ou hors semver' })
  }
  const titre = texte(r.titre)
  const nom = titre.replace(/^référentiel\s+/iu, '').replace(/\s+V\d+$/u, '').trim()
  if (nom === '') erreurs.push({ chemin: 'referentiel.titre', message: 'absent' })
  const label = `${nom} V${version.split('.')[0]}`

  // --- pôles, capacités, facettes
  const dimensions = Array.isArray(yaml.dimensions) ? yaml.dimensions : []
  if (dimensions.length === 0) erreurs.push({ chemin: 'dimensions', message: 'aucun pôle' })
  if (dimensions.length > LETTRES.length) erreurs.push({ chemin: 'dimensions', message: `plus de ${LETTRES.length} pôles` })
  const manques = {}
  const poles = []
  const capacites = []
  const vus = new Set()
  const decompte = { poles: 0, competences: 0, facettes: 0, competences_par_pole: [], facettes_par_pole: [], reperes_de_manifestation: 0 }
  let rangMax = 1

  dimensions.forEach((d, i) => {
    const chemin = `dimensions[${i}]`
    if (!estObjet(d)) {
      erreurs.push({ chemin, message: 'pôle illisible' })
      return
    }
    const lettre = LETTRES[i]
    const num = i + 1
    if (texte(d.repere) !== lettre) {
      erreurs.push({ chemin: `${chemin}.repere`, message: `les pôles se suivent de A sans trou : « ${lettre} » attendu, « ${texte(d.repere)} » trouvé` })
    }
    const titrePole = texte(d.titre)
    if (titrePole === '') erreurs.push({ chemin: `${chemin}.titre`, message: 'absent' })
    const pole = { num, nom: `${lettre} · ${titrePole}`, couleur: poleColor(num) }
    const orientation = texte(d.orientation)
    if (orientation === '') (manques.orientation ??= []).push(lettre)
    else pole.description = orientation
    poles.push(pole)
    decompte.poles += 1

    const listeCapacites = Array.isArray(d.competences) ? d.competences : []
    if (listeCapacites.length === 0) erreurs.push({ chemin: `${chemin}.competences`, message: 'aucune capacité' })
    let facettesDuPole = 0
    listeCapacites.forEach((c, j) => {
      const cheminC = `${chemin}.competences[${j}]`
      if (!estObjet(c)) {
        erreurs.push({ chemin: cheminC, message: 'capacité illisible' })
        return
      }
      const code = texte(c.repere)
      const m = /^([A-Z])([1-9])$/.exec(code)
      if (m === null || m[1] !== lettre) {
        erreurs.push({ chemin: `${cheminC}.repere`, message: `« ${code} » : une lettre du pôle (${lettre}) puis un chiffre de 1 à 9` })
      } else {
        rangMax = Math.max(rangMax, Number(m[2]))
      }
      if (vus.has(code)) erreurs.push({ chemin: `${cheminC}.repere`, message: `« ${code} » en double` })
      vus.add(code)
      const nomCapacite = texte(c.titre)
      if (nomCapacite === '') erreurs.push({ chemin: `${cheminC}.titre`, message: 'absent' })
      const capacite = {
        code,
        nom: nomCapacite,
        pole: num,
        description: composer(c, 'definition', RUBRIQUES_CAPACITE, cheminC, code, manques, erreurs),
      }

      const listeFacettes = Array.isArray(c.facettes) ? c.facettes : []
      if (listeFacettes.length === 0) {
        if (niveau === 'facette') erreurs.push({ chemin: `${cheminC}.facettes`, message: `${code} n’a pas de facette : au niveau facette, elle disparaîtrait` })
        else (manques.facettes ??= []).push(code)
      }
      const elements = []
      listeFacettes.forEach((f, k) => {
        const cheminF = `${cheminC}.facettes[${k}]`
        if (!estObjet(f)) {
          erreurs.push({ chemin: cheminF, message: 'facette illisible' })
          return
        }
        const codeF = texte(f.repere)
        if (codeF === '') {
          erreurs.push({ chemin: `${cheminF}.repere`, message: 'facette sans repère' })
        } else if (!/^[A-Z][1-9]\.[1-9]$/.test(codeF) || !codeF.startsWith(`${code}.`)) {
          erreurs.push({ chemin: `${cheminF}.repere`, message: `« ${codeF} » : le repère de sa capacité (${code}), un point, un chiffre de 1 à 9` })
        }
        if (codeF !== '' && vus.has(codeF)) erreurs.push({ chemin: `${cheminF}.repere`, message: `« ${codeF} » en double` })
        vus.add(codeF)
        const nomFacette = texte(f.titre)
        if (nomFacette === '') erreurs.push({ chemin: `${cheminF}.titre`, message: 'absent' })
        const element = { code: codeF, nom: nomFacette }
        const description = composer(f, 'description', RUBRIQUES_FACETTE, cheminF, codeF, manques, erreurs)
        if (description !== '') element.description = description
        elements.push(element)
        decompte.reperes_de_manifestation += Array.isArray(f.manifestations) ? f.manifestations.length : 0
      })
      if (capacite.description === '') delete capacite.description
      if (elements.length > 0) capacite.elements = elements
      capacites.push(capacite)
      facettesDuPole += elements.length
    })
    decompte.competences += listeCapacites.length
    decompte.facettes += facettesDuPole
    decompte.competences_par_pole.push(listeCapacites.length)
    decompte.facettes_par_pole.push(facettesDuPole)
  })
  if (erreurs.length > 0) throw new ErreurConversion(erreurs)

  // --- niveaux : motifs déduits des codes, puis vérifiés sur eux
  const lettres = plage('A', LETTRES[poles.length - 1])
  const motifCapacite = `${lettres}${plage('1', String(rangMax))}`
  const motifFacette = `${motifCapacite}\\.[1-9]`
  const suit = (motif, code) => new RegExp(`^(?:${motif})$`).test(code)
  for (const c of capacites) {
    if (!suit(motifCapacite, c.code)) erreurs.push({ chemin: c.code, message: `ne suit pas le motif ${motifCapacite}` })
    for (const f of c.elements ?? []) {
      if (!suit(motifFacette, f.code)) erreurs.push({ chemin: f.code, message: `ne suit pas le motif ${motifFacette}` })
    }
  }
  if (erreurs.length > 0) throw new ErreurConversion(erreurs)

  // --- avertissements : l'en-tête qui ne dit pas le contenu, les rubriques absentes
  const structure = estObjet(r.structure) ? r.structure : null
  if (structure !== null) {
    for (const [cle, libelle] of STRUCTURE) {
      if (!(cle in structure)) continue
      const annonce = JSON.stringify(structure[cle])
      const compte = JSON.stringify(decompte[cle])
      if (annonce !== compte) {
        avertissements.push(`referentiel.structure.${cle} annonce ${annonce} ${libelle}, le contenu en compte ${compte}`)
      }
    }
  }
  for (const [cle, codes] of Object.entries(manques)) {
    avertissements.push(`rubrique « ${cle} » absente : ${codes.join(', ')}`)
  }
  const licence = texte(r.licence_source_declaree)
  if (licence === '') avertissements.push('referentiel.licence_source_declaree absente : la licence n’est pas dite dans `source`')

  // --- le niveau qui tient lieu de compétence
  let competences
  let niveaux
  if (niveau === 'facette') {
    competences = capacites.flatMap((c) => (c.elements ?? []).map((f) => ({ ...f, pole: c.pole })))
      .map(({ code, nom: n, pole, description }) => (description === undefined ? { code, nom: n, pole } : { code, nom: n, pole, description }))
    niveaux = [{ nom: 'facette', motif: motifFacette }]
  } else {
    competences = capacites
    niveaux = [{ nom: 'capacité', motif: motifCapacite }, { nom: 'facette', motif: motifFacette }]
  }
  competences.sort(parCode)

  const date = typeof r.date === 'string' ? r.date.trim() : ''
  const provenance = [
    `« ${titre} » ${version}${date === '' ? '' : ` du ${date}`}, ${url}.`,
    `Converti${fichier ? ` depuis ${fichier}` : ''}${sha256 ? ` (sha256 ${sha256})` : ''}`
      + ` par scripts/convertir-humanome.mjs ${VERSION_CONVERTISSEUR}, niveau ${niveau}.`,
  ]
  if (licence !== '') provenance.push(`Licence : ${licence}.`)

  const document = { schemaVersion: SCHEMA_VERSION, kind: 'referentiel', id, version, label }
  if (typeof hacher === 'function') document.contentHash = hacher(corpsDuHash({ poles, competences }))
  Object.assign(document, { source: provenance.join(' '), niveaux, poles, competences })
  return { document, avertissements }
}
