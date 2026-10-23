// Twin9 — le portfolio tel que le moteur doit le recevoir (sprint 4, T0 ;
// journal de la cartographie D-73).
//
// Twin9 découpe le texte qu'on lui envoie à sa façon (Twin_v9,
// php/src/Portfolio.php) : un titre `##` ou `###` en début de ligne qui porte
// une date « JJ.MM.AA(AA) » ou « AAAA-MM-JJ » n'importe où ouvre une journée ;
// à moins de deux tels titres, une date seule sur sa ligne suivie d'un trait
// `___` (l'export de Google Docs) ; sinon il ne date rien. L'interface, elle,
// découpe par `segmentText` (engine/src/portfolio/segment.js) : « 1er.02.2026 »,
// « #### 30.01.2026 », « # 29.01.2026 », « **28.01.2026** », « ### Mardi 27
// janvier 2026 » y ouvrent une journée, pas chez Twin9 ; « ### Retour sur la
// séance du 26.01.2026 » en ouvre une chez Twin9, pas dans l'interface. Les
// traces d'un run tombaient alors dans une autre journée que celle de leur
// passage, ou dans une journée que l'interface n'a pas (étude du sprint 4,
// §4.1, cause C2) ; deux entrées du même jour devenaient `_b` (C3).
//
// `portfolioPourTwin9` rend le texte à envoyer pour que les journées de Twin9
// soient celles de l'interface, en touchant le moins possible : la mémoire de
// la carte reconnaît une journée à son texte, et une journée retouchée est
// instruite de nouveau (payée). Donc :
//   - le découpage est celui de la fiche du portfolio (ses `segments`, avec
//     les fusions, scissions et dates corrigées à la main dans la page
//     Portfolio) quand elle en a, sinon `segmentText` ; les passages d'une
//     même date sont réunis (comme `importers/portfolio.js`) : plus de `_b` ;
//   - un texte que Twin9 lit déjà en ces journées, chacune avec ce texte,
//     part tel quel, à l'octet (PLANT-01, un export Google Docs bien daté) ;
//   - sinon chaque journée garde son en-tête si Twin9 le lit à la même date
//     (sur sa première ligne non vide ; pour la première journée, après un
//     titre de document) et reçoit `### AAAA-MM-JJ` en tête sinon ; toute
//     autre ligne que Twin9 lirait comme un titre daté, même de la même date,
//     ou que l'interface lirait comme l'en-tête d'une autre journée, est
//     neutralisée par « — » (comme `keepInDay`, carto/core/portfolio-md.js) ;
//   - un texte que Twin9 lit en mode Google Docs (moins de deux titres datés,
//     des dates seules suivies d'un trait `___`) le reste : une journée qui
//     n'a pas sa date ainsi reçoit « JJ.MM.AAAA », une ligne vide et un
//     trait, jamais un titre daté (qui ferait changer Twin9 de mode, et
//     retoucherait toutes les journées) ; ce sont alors ces dates, au milieu
//     d'une journée, qui sont neutralisées ;
//   - les passages sans date passent en tête, leurs dates neutralisées :
//     Twin9 ne lit rien avant son premier titre daté, l'interface ne les
//     range dans aucune journée ;
//   - à moins de deux journées datées, le texte part tel quel : Twin9 ne date
//     rien à moins de deux titres, une retouche ne servirait à rien.
// `retouchees` dit les journées dont le texte, tel que Twin9 le lit, change
// (comparé à ce qu'il lisait du texte d'origine) : celles qui reçoivent un
// en-tête, et celles qui absorbaient un passage qu'elles rendent.
// `disparues` dit les journées que Twin9 lisait dans le texte d'origine et
// qu'il ne lit plus dans le texte envoyé (un `_b` réuni à sa date, un
// « Retour sur la séance du … » rendu à sa journée, une date corrigée à la
// main dans la fiche). La carte est additive (Twin_v9, php/src/Journees.php :
// une journée de sa mémoire absente du portfolio y reste) : lue par un run
// précédent, une telle journée reste dans la mémoire de la carte, et sa
// fusion la compte encore, avec le même passage dans la journée qui l'a
// reçu. La page de lancement le dit ; la retirer de la carte n'est pas fait.
//
// Copie documentée : les expressions de Portfolio.php (lignes 56 et 58 au
// commit a1d84bf de Twin_v9, en lecture seule ici) sont reproduites
// ci-dessous ; un test PHP (api/tests/Twin9/PortfolioPourTwin9Test.php)
// passe le texte rendu au `Portfolio` du vrai moteur et vérifie ses dates.
// Twin9 retire un BOM de tête, normalise les fins de ligne et la forme NFC
// avant de chercher : ces expressions ne portent que sur `#`, des chiffres,
// `.`, `-`, `_` et des blancs, que NFC ne change pas ; la forme NFC n'est donc
// pas appliquée (le texte envoyé n'est jamais renormalisé).
//
// Fonction pure, sans E/S.

import { segmentText } from '@engine/portfolio/segment.js'
import { isIsoDate } from '../../carto/core/dates.js'
import { keepInDay } from '../../carto/core/portfolio-md.js'

/** La date que l'interface donne à un texte sans en-tête : « aucune » (comme `importers/portfolio.js`). */
const SANS_DATE = '0000-00-00'

/** Text::WS de Twin9 (php/src/Py/Text.php) : les blancs de Python, `\n` compris. */
const WS = '\\t\\n\\x0b\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'

// En PHP, avec /u, `\d` est tout chiffre décimal (\p{Nd}) ; `.` est tout sauf
// `\n` ; `^` et `$` (avec /m) bordent une ligne à `\n` seulement — en
// JavaScript, `m` couperait aussi à `\r`, U+2028 et U+2029 : d'où
// `(?<![^\n])` (début de ligne) et `(?![^\n])` (fin de ligne), sans `m`.
const D = '\\p{Nd}'

/** Portfolio.php:56 — `'/^#{2,3}[' . Text::WS . ']+.*?(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})/mu'`. */
const TITRE_DATE = new RegExp(`(?<![^\\n])#{2,3}[${WS}]+[^\\n]*?(${D}{1,2}\\.${D}{1,2}\\.${D}{2,4}|${D}{4}-${D}{2}-${D}{2})`, 'gu')

/** Portfolio.php:58 — `'/^(\d{1,2}\.\d{1,2}\.\d{4})[ \t]*$(?=\r?\n(?:[ \t]*\r?\n)*_{3,}[ \t]*$)/mu'` (export Google Docs). */
const DATE_GDOCS = new RegExp(`(?<![^\\n])(${D}{1,2}\\.${D}{1,2}\\.${D}{4})[ \\t]*(?=\\r?\\n(?:[ \\t]*\\r?\\n)*_{3,}[ \\t]*(?![^\\n]))`, 'gu')

const ND = /^\p{Nd}$/u
const BLANCS_AUX_BORDS = new RegExp(`^[${WS}]+|[${WS}]+$`, 'gu')

/** Text::strip : les blancs de Python retirés aux deux bords. */
const strip = (texte) => texte.replace(BLANCS_AUX_BORDS, '')

/** La valeur d'un chiffre décimal de toute écriture : les chiffres Nd vont par dix, de 0 à 9, à la suite. */
function valeurDuChiffre(c) {
  const cp = c.codePointAt(0)
  let debut = cp
  while (debut > 0 && ND.test(String.fromCodePoint(debut - 1))) debut--
  return (cp - debut) % 10
}

const entier = (chiffres) => [...chiffres].reduce((n, c) => n * 10 + valeurDuChiffre(c), 0)
const deux = (n, l = 2) => String(n).padStart(l, '0')

/** Portfolio::iso : « JJ.MM.AA(AA) » → « AAAA-MM-JJ » (une année sur 2 ou 3 chiffres est 2000 + n) ; autre chose, tel quel. */
function iso(brut) {
  const m = new RegExp(`^(${D}{1,2})\\.(${D}{1,2})\\.(${D}{2,4})$`, 'u').exec(brut)
  if (!m) return brut
  const annee = entier(m[3]) + ([...m[3]].length === 4 ? 0 : 2000)
  return `${deux(annee, 4)}-${deux(entier(m[2]))}-${deux(entier(m[1]))}`
}

/** Les titres datés que Twin9 lit (Portfolio.php:56) : début (en unités de code) et date. */
function titresDates(texte) {
  return [...texte.matchAll(TITRE_DATE)].map((m) => ({ debut: m.index, date: iso(m[1]) }))
}

/** Les dates Google Docs que Twin9 lit à défaut de titres (Portfolio.php:58) : début et date. */
function datesGoogleDocs(texte) {
  return [...texte.matchAll(DATE_GDOCS)].map((m) => ({ debut: m.index, date: iso(m[1]) }))
}

/**
 * Les deux façons dont Twin9 date ses journées : ce qu'il y lit, et l'en-tête
 * qu'une journée y reçoit quand il ne lit pas le sien.
 */
const MODES = {
  titres: { lire: titresDates, enTete: (date) => `### ${date}\n\n` },
  'google-docs': { lire: datesGoogleDocs, enTete: (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}\n\n________________\n\n` },
}

/** Ce que Twin9 lit d'un texte : son mode (`null` s'il ne date rien) et ses journées, à leurs débuts. */
function lecture(raw) {
  for (const mode of ['titres', 'google-docs']) {
    const marques = MODES[mode].lire(raw)
    if (marques.length >= 2) return { mode, marques }
  }
  return { mode: null, marques: [] }
}

/**
 * Les journées datées que Twin9 lit dans un texte (`Portfolio::split`, ses
 * deux premiers modes) : chacune son identifiant (la date, `_b`, `_c` pour
 * une seconde entrée du même jour), sa date et son texte, du titre au titre
 * suivant, sans les blancs des bords. `null` quand il ne date rien (moins de
 * deux titres datés et moins de deux dates Google Docs : il découpe alors aux
 * titres sans date, ou pas du tout).
 * @param {string} texte
 * @returns {Array<{id: string, date: string, texte: string}> | null}
 */
export function journeesLuesParTwin9(texte) {
  const raw = String(texte ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const { mode, marques } = lecture(raw)
  if (mode === null) return null
  const vues = new Map()
  return marques.map(({ debut, date }, k) => {
    const n = vues.get(date)
    vues.set(date, n === undefined ? 0 : n + 1)
    const id = n === undefined ? date : `${date}_${String.fromCharCode(98 + n)}`
    return { id, date, texte: strip(raw.slice(debut, marques[k + 1]?.debut ?? raw.length)) }
  })
}

/** Les lignes d'avant un titre ne sont-elles qu'un titre de document (lignes vides ou titres) ? */
const titreDeDocument = (avant) => avant.split('\n').every((l) => l.trim() === '' || /^\s{0,3}#{1,6}\s/.test(l))

/** Le début de la première ligne non vide. */
function debutPremiereLigne(texte) {
  const m = /[^\s]/u.exec(texte)
  return m ? texte.lastIndexOf('\n', m.index) + 1 : -1
}

/** « — » devant la ligne qui commence à `debut`. */
const neutraliser = (texte, debut) => `${texte.slice(0, debut)}— ${texte.slice(debut)}`

/**
 * Le bloc d'une journée, dans le mode où Twin9 lira le texte : son en-tête,
 * gardé s'il le lit à cette date, ajouté sinon ; toute autre ligne qu'il y
 * lirait comme une journée, ou que l'interface lirait comme l'en-tête d'une
 * autre journée, neutralisée.
 */
function blocDeLaJournee(texte, date, premier, mode) {
  const { lire, enTete } = MODES[mode]
  let bloc = keepInDay(texte, date)
  const [tete] = lire(bloc)
  const garde =
    tete !== undefined &&
    tete.date === date &&
    (tete.debut === debutPremiereLigne(bloc) || (premier && titreDeDocument(bloc.slice(0, tete.debut))))
  if (!garde) bloc = `${enTete(date)}${bloc}`
  // l'en-tête qui ouvre la journée : le sien, ou celui qu'elle vient de recevoir (au début du bloc)
  const gardee = garde ? tete.debut : 0
  // Neutraliser un titre peut en découvrir un autre (« ## » seul, suivi d'une ligne datée) : jusqu'à n'en plus trouver.
  for (;;) {
    const autres = lire(bloc).filter((t) => t.debut !== gardee)
    if (autres.length === 0) break
    for (const t of autres.reverse()) bloc = neutraliser(bloc, t.debut)
  }
  return bloc
}

/** Un passage sans date, en tête : rien n'y ouvre de journée, ni chez Twin9 ni dans l'interface. */
function blocSansDate(texte, mode) {
  let bloc = keepInDay(texte, undefined)
  for (;;) {
    const marques = MODES[mode].lire(bloc)
    if (marques.length === 0) break
    for (const t of marques.reverse()) bloc = neutraliser(bloc, t.debut)
  }
  return bloc
}

/**
 * Les segments de la fiche du portfolio, s'ils sont ceux de ce texte : dans
 * l'ordre, chacun pris tel quel dans le texte, rien que des blancs entre eux.
 * Sinon (fiche d'avant, marques retirées depuis, texte d'un fichier), null.
 */
function segmentsDuTexte(segments, texte) {
  if (!Array.isArray(segments) || segments.length === 0) return null
  let fin = 0
  for (const s of segments) {
    if (!s || typeof s.texte !== 'string' || !(s.date === null || s.date === undefined || typeof s.date === 'string')) return null
    const debut = texte.indexOf(s.texte, fin)
    if (debut < 0 || texte.slice(fin, debut).trim() !== '') return null
    fin = debut + s.texte.length
  }
  return texte.slice(fin).trim() === '' ? segments : null
}

const sansBlancsFinaux = (texte) => texte.replace(/\s+$/u, '')

/**
 * Le texte à envoyer à Twin9 pour que ses journées soient celles de l'interface.
 * @param {string} texte le portfolio (sans les marques d'un portfolio surligné : `sansMarquesTwin9`)
 * @param {{segments?: Array<{date: string | null, texte: string}>}} [options] le découpage de sa fiche
 *   (portfolio-store) ; à défaut, ou s'il n'est pas celui de ce texte, `segmentText`
 * @returns {{texte: string, retouchees: string[], sansDate: number, disparues: string[]}} le texte à envoyer ;
 *   les journées dont le texte, tel que Twin9 le lit, change (AAAA-MM-JJ, dans l'ordre) ; les passages sans date,
 *   que Twin9 ne lit pas ; les journées que Twin9 lisait dans le texte d'origine et qu'il ne lit plus dans le texte
 *   envoyé (ses identifiants, « AAAA-MM-JJ » ou « AAAA-MM-JJ_b », dans l'ordre)
 */
export function portfolioPourTwin9(texte, { segments } = {}) {
  const brut = typeof texte === 'string' ? texte : ''
  const intact = { texte: brut, retouchees: [], sansDate: 0, disparues: [] }
  const source = brut.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const decoupage = (source === brut ? segmentsDuTexte(segments, brut) : null) ?? segmentText(source, { today: SANS_DATE })

  // Les journées de l'interface, une par date, dans l'ordre du texte ; les passages sans date.
  const journees = new Map()
  const passagesSansDate = []
  for (const s of decoupage) {
    const t = s.texte.replace(/\r\n?/g, '\n')
    if (t.trim() === '') continue
    if (!isIsoDate(s.date) || s.date === SANS_DATE) passagesSansDate.push(t)
    else if (journees.has(s.date)) journees.set(s.date, `${sansBlancsFinaux(journees.get(s.date))}\n\n${t}`)
    else journees.set(s.date, t)
  }
  if (journees.size < 2) return intact
  const sansDate = passagesSansDate.length

  // Twin9 lit-il déjà ces journées, chacune avec ce texte ? Alors rien ne change.
  const avant = journeesLuesParTwin9(source)
  const lues = new Map((avant ?? []).map((f) => [f.id, f.texte]))
  const dates = [...journees.keys()]
  const dejaPareil =
    avant !== null &&
    avant.length === journees.size &&
    dates.every((date, i) => {
      const lu = lues.get(date)
      if (lu === undefined) return false
      const ici = strip(journees.get(date))
      return ici === lu || (i === 0 && ici.endsWith(lu) && titreDeDocument(ici.slice(0, ici.length - lu.length)))
    })
  if (dejaPareil) return { ...intact, sansDate }

  // Le mode où Twin9 lisait le texte : ses titres datés, ou des dates Google Docs, qu'on garde ; s'il ne datait rien, ses titres.
  const mode = lecture(source).mode ?? 'titres'
  const blocs = [
    ...passagesSansDate.map((t) => blocSansDate(t, mode)),
    ...dates.map((date, i) => blocDeLaJournee(journees.get(date), date, i === 0, mode)),
  ]
  const sortie = `${blocs.map(sansBlancsFinaux).join('\n\n')}\n`
  const apres = journeesLuesParTwin9(sortie) ?? []
  const retouchees = apres.filter((f) => lues.get(f.id) !== f.texte).map((f) => f.date).sort()
  if (retouchees.length === 0 && apres.length === lues.size) return { ...intact, sansDate }
  const luesApres = new Set(apres.map((f) => f.id))
  const disparues = [...lues.keys()].filter((id) => !luesApres.has(id)).sort()
  return { texte: sortie, retouchees, sansDate, disparues }
}
