// Un référentiel écrit en Markdown (S5, lot D, 2026-10-22) : le texte même des
// fiches de pôle que le moteur écrit depuis un document (engine/src/twin6/
// fiches.js, api/src/Twin9/ReferentielMoteur.php), lu en document du schéma
// `referentiel` pour l'atelier des épistémiarques (UC-EPI-05), et tout document
// publié écrit dans ce texte (« Exporter en Markdown »). Sans DOM ni paquet npm.
//
// Le format, ligne à ligne :
//   # Pôle N — Nom        un pôle, numéroté 1, 2, 3… dans l'ordre ; le texte qui suit le décrit
//   ## CODE — Nom         une compétence de ce pôle ; le texte qui suit la décrit
//   ### CODE — Nom        un élément plus fin de la compétence au-dessus, et ainsi de suite
//                         jusqu'à « ###### », sans sauter de niveau
//   ---                   entre deux fiches, facultatif (le moteur en met entre deux compétences)
// Le tiret cadratin « — » sépare le code du nom ; « – » et « - », plus faciles à
// taper, sont lus de même. Trois commentaires facultatifs gardent ce que les
// fiches ne disent pas, pour qu'un référentiel exporté revienne sans perte :
// « <!-- couleur : #rrggbb --> » sur la ligne qui suit le titre d'un pôle ;
// « <!-- source : … --> » et « <!-- niveaux : capacité, facette --> » avant le
// premier pôle, où tout autre commentaire est ignoré. L'identifiant, le libellé
// et la version ne sont pas dans le texte : la page les demande.
//
// Le texte se lit composé (NFC), comme il s'affiche : un « Pôle » décomposé
// (o suivi de U+0302, d'un copier-coller) est un « Pôle ». Une espace
// insécable (U+00A0, U+202F, celle d'un traitement de texte ou d'une page web)
// sépare les mots d'un titre comme une autre, comme le lit le moteur Twin9
// (Text::WS). Un caractère « \uFFFD » est celui d'un fichier qui n'est pas en
// UTF-8 (un « texte brut » Windows-1252) : le texte est refusé, pas importé
// avec des noms corrompus.
//
// Les titres se lisent comme en CommonMark : jusqu'à trois espaces devant les
// « # » (quatre font du code, donc du texte), et une suite finale de « # »
// précédée d'un blanc (« ## A1 — Nom ## ») n'est pas du nom.
//
// Dans une description, une ligne qui se lirait comme un titre (« # … ») ou un
// séparateur (« --- ») s'écrit précédée d'une barre oblique inverse (« \# … »),
// que la lecture retire ; un nom qui finit par « # » précédé d'un blanc
// (« Langage C # ») s'écrit « Langage C \# », dont la lecture retire la barre.
// L'aller-retour est exact pour tout texte.
//
// Le motif de chaque niveau se DÉDUIT de ses codes, le plus étroit compatible
// (deduireMotif) ; la page l'affiche et le laisse modifier. Le moteur ne s'en
// sert que pour valider les codes (S5 §4, lot D) : un motif étroit attrape une
// faute de frappe (A9 parmi A1…E4) sans rien changer au run.

import { fichesDuReferentiel } from '@engine/twin6/fiches.js'
import { validateDocument } from '@engine/validation.js'

/** La version du schéma `referentiel` des documents écrits ici. */
export const SCHEMA_VERSION = '2.1.0'

/** La provenance d'un texte qui ne dit pas la sienne (commentaire « source »). */
export const SOURCE_PAR_DEFAUT = 'Écrit en Markdown dans l’atelier des épistémiarques'

/** Les noms des niveaux d'un texte qui ne les dit pas (commentaire « niveaux »). */
const NOMS_PAR_DEFAUT = ['compétence', 'élément', 'sous-élément']

/** Le nom par défaut du niveau k (0 : celui qui tient lieu de compétence). */
export const nomParDefaut = (k) => NOMS_PAR_DEFAUT[k] ?? `niveau ${k + 1}`

const RESPIRE = 'respire'
/** Les clés des pôles de RESPIRE, que le jury de Twin9 reconnaît (Twin_v9, Referentiel::CLES). */
const CLES_RESPIRE = ['TETE', 'COEUR', 'MAIN', 'AME', 'RACINES', 'CITE', 'FLAMBEAU']

/** ReferentielRepository::ID_PATTERN. */
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
/** Le semver du schéma `referentiel`. */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
/** Le code du schéma : 1 à 8 caractères ASCII, le premier lettre ou chiffre. */
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,7}$/
/** Un code que le moteur Twin9 refuse (ReferentielRepository::CHIFFRES_SEULS). */
const CHIFFRES_SEULS_RE = /^[0-9]+$/
const COULEUR_RE = /^#[0-9a-fA-F]{6}$/
/** Au-delà, le serveur répond 500 au lieu de 422 (UC-EPI-04 AN2) : refusé ici. */
const LIBELLE_MAX = 190
const VERSION_MAX = 32
/** La longueur d'un motif que le schéma accepte. */
const MOTIF_MAX = 100
/** Le motif de repli, quand les codes d'un niveau n'ont pas de forme commune courte. */
const MOTIF_LARGE = '[A-Za-z0-9._-]{1,8}'

// Les blancs d'un titre : tabulation ou espace, insécables comprises (\p{Zs}).
/** Un titre : jusqu'à trois espaces, 1 à 6 « # », puis un blanc ou la fin de la ligne. */
const TITRE_RE = /^ {0,3}(#{1,6})(?:[\t\p{Zs}]+(.*?))?[\t\p{Zs}]*$/u
/** La suite de « # » qui ferme un titre, précédée d'un blanc (ou tout le titre). */
const FERMETURE_RE = /(?:^|[\t\p{Zs}]+)#+$/u
/** Un nom qui finit par « # » précédé d'un blanc, échappé à l'écriture (« C \# ») ou à échapper (« C # »). */
const DIESES_FINAUX_ECHAPPES_RE = /(^|[\t\p{Zs}])\\(\\*#+)$/u
const DIESES_FINAUX_RE = /(^|[\t\p{Zs}])(\\*#+)$/u
const POLE_RE = /^P[ôo]le[\t\p{Zs}]+(\d+)[\t\p{Zs}]+[—–-][\t\p{Zs}]+(.+)$/iu
const NOEUD_RE = /^(\S+)[\t\p{Zs}]+[—–-][\t\p{Zs}]+(.+)$/u
const SEPARATEUR_RE = /^ {0,3}-{3,}[\t\p{Zs}]*$/u
/** Une ligne de description qui se lirait comme un titre ou un séparateur, échappée ou non. */
const ECHAPPABLE_RE = /^\\*(?: {0,3}#{1,6}(?:[\t\p{Zs}]|$)| {0,3}-{3,}[\t\p{Zs}]*$)/u
const ECHAPPEE_RE = /^\\+(?: {0,3}#{1,6}(?:[\t\p{Zs}]|$)| {0,3}-{3,}[\t\p{Zs}]*$)/u
/** Le caractère de remplacement d'un octet que le décodage UTF-8 n'a pas lu. */
const ILLISIBLE = '\uFFFD'
const COULEUR_COMMENTAIRE_RE = /^<!--\s*couleur\s*:\s*(.*?)\s*-->$/iu
const EN_TETE_RE = /^<!--\s*(source|niveaux)\s*:\s*([\s\S]*?)\s*-->$/iu

/** Une erreur d'écriture : un document que ce module ne sait pas écrire en Markdown. */
export class ErreurMarkdown extends Error {
  constructor(message) {
    super(message)
    this.name = 'ErreurMarkdown'
  }
}

/** Le texte sans BOM, ses fins de ligne en « \n », composé (NFC). */
const normaliser = (texte) =>
  String(texte ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')

const echapper = (description) =>
  description
    .split('\n')
    .map((ligne) => (ECHAPPABLE_RE.test(ligne) ? `\\${ligne}` : ligne))
    .join('\n')

const desechapper = (ligne) => (ECHAPPEE_RE.test(ligne) ? ligne.slice(1) : ligne)

/** Le texte d'une fiche, sans ses séparateurs ni ses lignes vides de fin, désechappé. */
function description(tampon) {
  const lignes = [...tampon]
  for (;;) {
    while (lignes.length > 0 && lignes[lignes.length - 1].trim() === '') lignes.pop()
    if (lignes.length > 0 && SEPARATEUR_RE.test(lignes[lignes.length - 1])) {
      lignes.pop()
      continue
    }
    break
  }
  return lignes.map(desechapper).join('\n').trim()
}

/**
 * La clé de jury d'un pôle, comme le moteur Twin9 la tire de son nom
 * (Twin_v9, Referentiel::cle) : son premier mot, sans accents, s'il est en
 * capitales ; null sinon.
 */
function cleDuPole(nom) {
  const mot = String(nom).trim().split(/\s+/u)[0] ?? ''
  const sansAccent = mot.replace(/Œ/g, 'OE').replace(/Æ/g, 'AE').normalize('NFD').replace(/\p{Mn}/gu, '')
  return /^[A-Z][A-Z0-9]*$/.test(sansAccent) ? sansAccent : null
}

/**
 * Lit le texte : ses pôles, ses compétences et leurs éléments, ce que disent
 * ses commentaires, et chaque erreur à sa ligne. Les niveaux y sont ceux des
 * titres rencontrés, leurs noms ceux du commentaire « niveaux » (sinon par
 * défaut), leurs motifs déduits des codes.
 *
 * @param {string} texte
 * @returns {{poles: Array<object>, competences: Array<object>, source: string|null,
 *   niveaux: Array<{nom: string, motif: string}>, codes: Array<Array<{code: string, ligne: number}>>,
 *   erreurs: Array<{ligne: number|null, message: string}>, lignesDesPoles: number[]}}
 */
export function analyserMarkdown(texte) {
  const lignes = normaliser(texte).split('\n')
  const erreurs = []
  const erreur = (ligne, message) => erreurs.push({ ligne, message })
  const poles = []
  const competences = []
  const lignesDesPoles = []
  const codes = [] // codes[k] : les codes du niveau k, avec leur ligne
  const vus = new Map() // code -> ligne
  let source = null
  let noms = null
  let ouvert = null // le pôle en cours : {objet, ligne, compte}, compte : ses titres « ## »
  let pile = [] // pile[k] : le dernier nœud du niveau k
  let refus = null // la profondeur du dernier titre refusé, tant que ses éléments le suivent
  let cible = null // ce que décrivent les lignes de texte : {objet, tampon, pole}
  let commentaire = null // un commentaire de l'en-tête sur plusieurs lignes : {debut, lignes}
  let texteAvant = false

  // un fichier qui n'est pas en UTF-8 : dit une fois, à sa première ligne touchée
  const illisibles = lignes.flatMap((ligne, i) => (ligne.includes(ILLISIBLE) ? [i + 1] : []))
  if (illisibles.length > 0) {
    const autres = illisibles.length - 1
    erreur(
      illisibles[0],
      `caractère illisible « ${ILLISIBLE} »${autres > 0 ? ` (ici et sur ${autres} autre${autres > 1 ? 's' : ''} ligne${autres > 1 ? 's' : ''})` : ''}`
        + ' : le texte n’est pas en UTF-8 ; réenregistrez le fichier en UTF-8',
    )
  }

  const clore = () => {
    if (cible === null) return
    const texteDecrit = description(cible.tampon)
    if (texteDecrit !== '') cible.objet.description = texteDecrit
    cible = null
  }
  const finirPole = () => {
    if (ouvert !== null && ouvert.compte === 0) {
      erreur(ouvert.ligne, `le pôle ${ouvert.objet.num} « ${ouvert.objet.nom} » n’a aucune compétence (« ## CODE — Nom »)`)
    }
  }
  const lireEnTete = (bloc, ligne) => {
    const joint = bloc.join('\n').trim()
    const fin = joint.indexOf('-->') + 3
    if (joint.slice(fin).trim() !== '' && !texteAvant) {
      erreur(ligne, 'texte avant le premier pôle (« # Pôle 1 — Nom » ouvre le premier)')
      texteAvant = true
    }
    const m = EN_TETE_RE.exec(joint.slice(0, fin))
    if (m === null) return // un commentaire libre : ignoré
    if (m[1].toLowerCase() === 'source') source = m[2]
    else noms = m[2].split(',').map((nom) => nom.trim()).filter((nom) => nom !== '')
  }

  for (let i = 0; i < lignes.length; i += 1) {
    const n = i + 1
    const ligne = lignes[i]
    if (commentaire !== null) {
      commentaire.lignes.push(ligne)
      if (ligne.includes('-->')) {
        lireEnTete(commentaire.lignes, n)
        commentaire = null
      }
      continue
    }
    const titre = TITRE_RE.exec(ligne)
    if (titre === null) {
      if (ouvert === null) {
        const t = ligne.trim()
        if (t === '') continue
        if (t.startsWith('<!--')) {
          if (t.includes('-->')) lireEnTete([t], n)
          else commentaire = { debut: n, lignes: [t] }
          continue
        }
        if (!texteAvant) erreur(n, 'texte avant le premier pôle (« # Pôle 1 — Nom » ouvre le premier)')
        texteAvant = true
        continue
      }
      if (cible === null) continue // le texte d'un titre refusé
      if (cible.pole && cible.tampon.every((l) => l.trim() === '') && /^<!--\s*couleur\s*:/iu.test(ligne.trim())) {
        const m = COULEUR_COMMENTAIRE_RE.exec(ligne.trim())
        if (m !== null && COULEUR_RE.test(m[1])) cible.objet.couleur = m[1]
        else erreur(n, `couleur illisible « ${ligne.trim()} » (attendu « <!-- couleur : #rrggbb --> »)`)
        continue
      }
      cible.tampon.push(ligne)
      continue
    }

    clore()
    const dieses = titre[1]
    // sans sa suite de « # » de fermeture ; un « # » final échappé (« C \# ») est du nom
    const contenu = (titre[2] ?? '').replace(FERMETURE_RE, '').replace(DIESES_FINAUX_ECHAPPES_RE, '$1$2')
    if (dieses.length === 1) {
      finirPole()
      const rang = poles.length + 1
      const m = POLE_RE.exec(contenu)
      if (m === null) {
        erreur(n, `titre de pôle mal formé « ${ligne.trim()} » (attendu « # Pôle ${rang} — Nom »)`)
      } else if (Number(m[1]) !== rang) {
        erreur(n, `pôle ${m[1]} : les pôles se numérotent 1, 2, 3… dans l’ordre, le pôle ${rang} est attendu ici`)
      }
      // même mal formé, le pôle s'ouvre : ses compétences ne sont pas dites « hors pôle »
      const objet = { num: rang, nom: (m?.[2] ?? contenu).trim() || '?', couleur: null }
      poles.push(objet)
      lignesDesPoles.push(n)
      ouvert = { objet, ligne: n, compte: 0 }
      pile = []
      refus = null
      cible = { objet, tampon: [], pole: true }
      continue
    }

    const profondeur = dieses.length - 2
    if (ouvert === null) {
      erreur(n, `« ${ligne.trim()} » avant le premier pôle (« # Pôle 1 — Nom » ouvre le premier)`)
      continue
    }
    if (profondeur === 0) ouvert.compte += 1 // même refusée, une compétence est écrite : le pôle n'est pas vide
    // sous un titre refusé, ses éléments plus fins le suivent sans autre erreur
    if (refus !== null && profondeur > refus) continue
    refus = profondeur
    if (profondeur > pile.length) {
      erreur(n, `niveau sauté : « ${dieses} » ici, « ${'#'.repeat(pile.length + 2)} » au plus`)
      continue
    }
    const m = NOEUD_RE.exec(contenu)
    if (m === null) {
      erreur(n, `titre mal formé « ${ligne.trim()} » (attendu « ${dieses} CODE — Nom »)`)
      continue
    }
    const code = m[1]
    if (!CODE_RE.test(code)) {
      erreur(n, `code invalide « ${code} » : 1 à 8 caractères, lettres sans accent (A à Z, a à z), chiffres, « . », « _ » ou « - », le premier lettre ou chiffre`)
      continue
    }
    // le moteur Twin9 refuse une compétence ainsi codée (Twin_v9, Referentiel::depuisBloc), et
    // tout niveau peut tenir lieu de compétence : refusé à tout niveau, comme le fait le serveur
    if (CHIFFRES_SEULS_RE.test(code)) {
      erreur(n, `code « ${code} » fait de chiffres seulement : l’analyse approfondie (Twin9) refuse un tel code ; ajoutez-y une lettre ou un point`)
      continue
    }
    if (vus.has(code)) {
      erreur(n, `code en double « ${code} » (déjà ligne ${vus.get(code)})`)
      continue
    }
    refus = null
    vus.set(code, n)
    const noeud = { code, nom: m[2].trim() }
    if (profondeur === 0) {
      noeud.pole = ouvert.objet.num
      competences.push(noeud)
    } else {
      const parent = pile[profondeur - 1]
      parent.elements = parent.elements ?? []
      parent.elements.push(noeud)
    }
    pile = pile.slice(0, profondeur)
    pile.push(noeud)
    codes[profondeur] = codes[profondeur] ?? []
    codes[profondeur].push({ code, ligne: n })
    cible = { objet: noeud, tampon: [], pole: false }
  }

  if (commentaire !== null) erreur(commentaire.debut, 'commentaire jamais refermé (« --> » manque)')
  clore()
  finirPole()
  if (poles.length === 0) erreur(null, 'aucun pôle : « # Pôle 1 — Nom » ouvre le premier')
  // dans l'ordre du texte (un pôle vide se voit au titre suivant), celles du texte entier à la fin
  erreurs.sort((a, b) => (a.ligne ?? Infinity) - (b.ligne ?? Infinity))

  const niveaux = codes.map((duNiveau, k) => ({
    nom: noms?.[k] ?? nomParDefaut(k),
    motif: deduireMotif(duNiveau.map((c) => c.code)),
  }))
  return { poles, competences, source, niveaux, codes, erreurs, lignesDesPoles }
}

/** La nature d'un caractère de code : lettre capitale, minuscule, chiffre, ou ce caractère même. */
const nature = (ch) => (/[A-Z]/.test(ch) ? 'A' : /[a-z]/.test(ch) ? 'a' : /[0-9]/.test(ch) ? '9' : `=${ch}`)

/** Un code en suites de caractères de même nature (« A1.10 » : A, 1, ., 10). */
function suites(code) {
  const out = []
  for (const ch of code) {
    const k = nature(ch)
    const derniere = out[out.length - 1]
    if (derniere !== undefined && derniere.k === k && !k.startsWith('=')) derniere.t += ch
    else out.push({ k, t: ch })
  }
  return out
}

const litteral = (ch) => (ch === '.' ? '\\.' : ch)

/**
 * La classe la plus étroite d'un ensemble de caractères d'une même nature :
 * le caractère seul, `\d` pour tous les chiffres, sinon ses plages (« [A-E] »,
 * « [1-4] », « [A-BD] »).
 */
function classe(caracteres) {
  const tries = [...caracteres].sort()
  if (tries.length === 1) return { base: litteral(tries[0]), litteral: true }
  if (tries.length === 10 && tries[0] === '0' && tries[9] === '9') return { base: '\\d', litteral: false }
  let corps = ''
  for (let i = 0; i < tries.length; ) {
    let j = i
    while (j + 1 < tries.length && tries[j + 1].charCodeAt(0) === tries[j].charCodeAt(0) + 1) j += 1
    corps += j > i ? `${tries[i]}-${tries[j]}` : tries[i]
    i = j + 1
  }
  return { base: `[${corps}]`, litteral: false }
}

/** Le motif des codes d'une même forme (mêmes natures dans le même ordre). */
function motifDeForme(liste) {
  const decoupes = liste.map(suites)
  const jetons = []
  for (let s = 0; s < decoupes[0].length; s += 1) {
    const textes = decoupes.map((d) => d[s].t)
    const longueurs = textes.map((t) => t.length)
    const min = Math.min(...longueurs)
    const max = Math.max(...longueurs)
    if (min === max) {
      // longueur fixe : position par position
      for (let p = 0; p < min; p += 1) jetons.push({ ...classe(new Set(textes.map((t) => t[p]))), min: 1, max: 1 })
    } else {
      jetons.push({ ...classe(new Set(textes.join(''))), litteral: false, min, max })
    }
  }
  // des classes identiques qui se suivent se comptent : « \d\d » s'écrit « \d{2} »
  const fusion = []
  for (const j of jetons) {
    const prec = fusion[fusion.length - 1]
    if (prec !== undefined && !j.litteral && !prec.litteral && prec.base === j.base) {
      prec.min += j.min
      prec.max += j.max
    } else fusion.push({ ...j })
  }
  return fusion
    .map((j) => (j.min === 1 && j.max === 1 ? j.base : j.min === j.max ? `${j.base}{${j.min}}` : `${j.base}{${j.min},${j.max}}`))
    .join('')
}

/**
 * Le motif le plus étroit que suivent tous les codes d'un niveau, dans une
 * forme qu'on lit d'un coup d'œil : position par position, le caractère que
 * tous les codes y partagent, sinon la plage des leurs (« A1 »…« E4 » donne
 * `[A-E][1-4]`, « 1.01 »…« 7.10 » `[1-7]\.[0-1]\d`) ; une suite de longueur
 * variable, la plage de ses caractères et ses longueurs (« A2 », « A10 » :
 * `A[0-2]{1,2}`) ; des codes de formes différentes, l'alternative de leurs
 * motifs. Au-delà de 100 caractères, la forme générale d'un code.
 *
 * @param {string[]} codes
 * @returns {string} un motif sans ancres, que chaque code suit en entier
 */
export function deduireMotif(codes) {
  const liste = [...new Set(codes.map(String))]
  if (liste.length === 0) return MOTIF_LARGE
  const formes = new Map()
  for (const code of liste) {
    const forme = suites(code).map((s) => s.k).join(' ')
    if (!formes.has(forme)) formes.set(forme, [])
    formes.get(forme).push(code)
  }
  const motifs = [...formes.values()].map(motifDeForme)
  const motif = motifs.length === 1 ? motifs[0] : `(?:${motifs.join('|')})`
  const regex = new RegExp(`^(?:${motif})$`)
  return motif.length <= MOTIF_MAX && liste.every((code) => regex.test(code)) ? motif : MOTIF_LARGE
}

/** Les erreurs d'un motif saisi : vide, trop long, illisible (comme ReferentielRepository::regexDuMotif). */
function regexDuMotif(motif) {
  if (motif === '') return { erreur: 'motif vide' }
  if (motif.length > MOTIF_MAX) return { erreur: `motif de plus de ${MOTIF_MAX} caractères` }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(motif) || motif.includes('(*')) return { erreur: `motif illisible : ${motif}` }
  try {
    new RegExp(motif) // eslint-disable-line no-new
    return { regex: new RegExp(`^(?:${motif})$`) }
  } catch {
    return { erreur: `motif illisible : ${motif}` }
  }
}

/**
 * Le document du schéma `referentiel` que décrivent le texte et les trois
 * champs de la page, avec chaque erreur qui empêcherait l'import : celles du
 * texte, à leur ligne ; celles des champs ; un code qui ne suit pas le motif
 * de son niveau ; enfin ce que le schéma refuserait. Les avertissements ne
 * l'empêchent pas. Sans `contentHash` : le serveur le calcule.
 *
 * @param {string} texte
 * @param {{id?: string, version?: string, label?: string,
 *   niveaux?: Array<{nom?: string, motif?: string}|undefined>}} [champs] `niveaux` : le nom
 *   ou le motif saisis pour le niveau k, en place de ceux du texte
 * @returns {{document: object|null, analyse: ReturnType<typeof analyserMarkdown>,
 *   niveaux: Array<{nom: string, motif: string}>, erreurs: Array<{ligne: number|null, message: string}>,
 *   avertissements: Array<{ligne: number|null, message: string}>}}
 */
export function referentielDepuisMarkdown(texte, champs = {}) {
  const analyse = analyserMarkdown(texte)
  const erreurs = [...analyse.erreurs]
  const avertissements = []
  const erreur = (message, ligne = null) => erreurs.push({ ligne, message })

  const id = String(champs.id ?? '').trim()
  const version = String(champs.version ?? '').trim()
  const label = String(champs.label ?? '').trim()
  if (id === '') erreur('Identifiant : requis')
  else if (id === RESPIRE) erreur('Identifiant : RESPIRE s’édite compétence par compétence dans son atelier, il ne s’importe pas')
  else if (!ID_RE.test(id)) erreur('Identifiant : minuscules, chiffres, « . », « _ » ou « - », le premier lettre ou chiffre, 64 caractères au plus')
  if (version === '') erreur('Version : requise')
  else if (!SEMVER_RE.test(version)) erreur('Version : un semver, par exemple 1.0.0')
  else if (version.length > VERSION_MAX) erreur(`Version : ${VERSION_MAX} caractères au plus`)
  if (label === '') erreur('Libellé : requis')
  else if (label.length > LIBELLE_MAX) erreur(`Libellé : ${LIBELLE_MAX} caractères au plus`)

  const saisis = Array.isArray(champs.niveaux) ? champs.niveaux : []
  const niveaux = analyse.niveaux.map((deduit, k) => ({
    nom: String(saisis[k]?.nom ?? deduit.nom).trim(),
    motif: String(saisis[k]?.motif ?? deduit.motif).trim(),
  }))
  niveaux.forEach((niveau, k) => {
    if (niveau.nom === '') erreur(`Niveau ${k + 1} : nom requis`)
    else if (niveaux.findIndex((autre) => autre.nom === niveau.nom) < k) erreur(`Niveau ${k + 1} : un autre niveau s’appelle déjà « ${niveau.nom} »`)
    const { regex, erreur: illisible } = regexDuMotif(niveau.motif)
    if (illisible !== undefined) {
      erreur(`Niveau ${k + 1} (« ${niveau.nom} ») : ${illisible}`)
      return
    }
    for (const { code, ligne } of analyse.codes[k]) {
      if (!regex.test(code)) erreur(`« ${code} » ne suit pas le motif ${niveau.motif} du niveau « ${niveau.nom} »`, ligne)
    }
  })

  // un pôle au nom d'un pôle de RESPIRE reçoit, dans Twin9, les jurés de ce pôle (S5, E5)
  const cles = analyse.poles.map((p) => cleDuPole(p.nom) ?? `P${p.num}`)
  if (new Set(cles).size === cles.length) {
    analyse.poles.forEach((pole, k) => {
      if (CLES_RESPIRE.includes(cles[k])) {
        avertissements.push({
          ligne: analyse.lignesDesPoles[k],
          message: `pôle ${pole.num} « ${pole.nom} » : son premier mot (${cles[k]}) est celui d’un pôle de RESPIRE ; `
            + 'l’analyse approfondie (Twin9) lui donnera les jurés de ce pôle de RESPIRE',
        })
      }
    })
  }

  const document = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'referentiel',
    id,
    version,
    label,
    source: analyse.source ?? SOURCE_PAR_DEFAUT,
    niveaux,
    poles: analyse.poles,
    competences: analyse.competences,
  }
  if (erreurs.length === 0) {
    // ce que le schéma refuserait encore ; l'empreinte, que le serveur calcule, n'est qu'une place
    const { valid, errors } = validateDocument('referentiel', { ...document, contentHash: '0'.repeat(64) })
    if (!valid) for (const e of errors) erreur(`${e.path} : ${e.message}`)
  }
  return { document: erreurs.length === 0 ? document : null, analyse, niveaux, erreurs, avertissements }
}

/** La profondeur d'éléments sous un nœud (0 : aucun). */
const profondeurDe = (noeud) =>
  Array.isArray(noeud.elements) && noeud.elements.length > 0 ? 1 + Math.max(...noeud.elements.map(profondeurDe)) : 0

/** Un nom qui se lirait avec des « # » de fermeture, échappé. */
const echapperNom = (nom) => String(nom).replace(DIESES_FINAUX_RE, '$1\\$2')

/** Le nœud (pôle, compétence, élément) : son nom, sa description et ceux de ses éléments échappés. */
function echappe(noeud) {
  const copie = { ...noeud }
  if (typeof noeud.nom === 'string') copie.nom = echapperNom(noeud.nom)
  if (typeof noeud.description === 'string') copie.description = echapper(noeud.description)
  if (Array.isArray(noeud.elements)) copie.elements = noeud.elements.map(echappe)
  return copie
}

/**
 * Un document du schéma `referentiel` en Markdown : la fiche de chaque pôle,
 * octet pour octet celle que le moteur écrit (fichesDuReferentiel), dans
 * l'ordre des pôles ; la couleur d'un pôle sous son titre ; la provenance et
 * les noms des niveaux (s'ils ne sont pas ceux par défaut) en tête. Relu par
 * referentielDepuisMarkdown avec les mêmes champs, il redonne le document.
 *
 * @param {object} document
 * @returns {string}
 * @throws {ErreurMarkdown} un élément plus fin que « ###### »
 */
export function referentielEnMarkdown(document) {
  const competences = Array.isArray(document?.competences) ? document.competences : []
  const poles = [...(Array.isArray(document?.poles) ? document.poles : [])].sort((a, b) => a.num - b.num)
  if (competences.some((c) => profondeurDe(c) > 4)) {
    throw new ErreurMarkdown('Ce référentiel a des éléments plus fins que « ###### » : le Markdown ne les écrit pas')
  }
  const fiches = fichesDuReferentiel({ poles: poles.map(echappe), competences: competences.map(echappe) })
  const tete = []
  if (typeof document.source === 'string' && document.source.trim() !== '') {
    tete.push(`<!-- source : ${document.source.trim().replace(/-->/g, '-- >')} -->`)
  }
  const noms = (Array.isArray(document.niveaux) ? document.niveaux : []).map((n) => String(n?.nom ?? ''))
  if (noms.some((nom, k) => nom !== nomParDefaut(k))) tete.push(`<!-- niveaux : ${noms.join(', ')} -->`)
  const corps = poles.map((pole) => {
    const fiche = fiches[String(pole.num)]
    return COULEUR_RE.test(pole.couleur ?? '') ? fiche.replace('\n', `\n<!-- couleur : ${pole.couleur} -->\n`) : fiche
  })
  return (tete.length > 0 ? `${tete.join('\n')}\n\n` : '') + corps.join('\n')
}

/**
 * Le modèle à télécharger : un référentiel fictif à deux pôles et deux
 * niveaux, avec ses commentaires facultatifs ; le premier commentaire, libre,
 * est ignoré à la lecture.
 */
export const MODELE_MARKDOWN = `<!--
Modèle de référentiel en Markdown (atelier des épistémiarques, humanome.xyz).
« # Pôle N — Nom » ouvre un pôle : les pôles se numérotent 1, 2, 3… dans l’ordre.
« ## CODE — Nom » ouvre une compétence du pôle ; « ### CODE — Nom », un élément
plus fin de la compétence au-dessus, et ainsi de suite, sans sauter de niveau.
Le texte sous un titre le décrit ; « --- » entre deux fiches est facultatif.
Un code a 1 à 8 caractères (lettres sans accent, chiffres, « . », « _ », « - »),
unique dans tout le référentiel, jamais fait de chiffres seulement (« 1 » ne va
pas, « A1 » ou « 1.01 » vont) ; la page déduit des codes le motif de chaque niveau.
Les commentaires « source », « niveaux » et « couleur » sont facultatifs.
Un pôle dont le premier mot est, en capitales, celui d’un pôle de RESPIRE
(TÊTE, CŒUR, MAIN, ÂME, RACINES, CITÉ, FLAMBEAU) reçoit dans l’analyse
approfondie les jurés de ce pôle de RESPIRE.
L’identifiant, le libellé et la version se saisissent dans la page.
Ce commentaire-ci est ignoré.
-->
<!-- source : D’où vient ce référentiel : ses auteurs, sa date, sa licence. -->
<!-- niveaux : capacité, facette -->

# Pôle 1 — A · Premier pôle
<!-- couleur : #2563eb -->

Ce que cherche le premier pôle.

## A1 — Première capacité

Ce que désigne la capacité A1.

### A1.1 — Première facette

Ce que désigne la facette A1.1.

### A1.2 — Deuxième facette

Ce que désigne la facette A1.2.

---

## A2 — Deuxième capacité

Ce que désigne la capacité A2.

### A2.1 — Une facette

Ce que désigne la facette A2.1.

# Pôle 2 — B · Second pôle
<!-- couleur : #10b981 -->

Ce que cherche le second pôle.

## B1 — Une capacité

Ce que désigne la capacité B1.

### B1.1 — Une facette

Ce que désigne la facette B1.1.
`

/** Le même référentiel fictif, en JSON du schéma (sans `contentHash`, que le serveur calcule). */
export const MODELE_JSON = `${JSON.stringify(
  referentielDepuisMarkdown(MODELE_MARKDOWN, { id: 'mon-referentiel', version: '1.0.0', label: 'Mon référentiel' }).document,
  null,
  2,
)}\n`
