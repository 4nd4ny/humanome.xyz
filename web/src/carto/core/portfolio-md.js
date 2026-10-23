// Interface ultime — le portfolio exporté en Markdown (décision du
// 2026-10-14, question 20 : un chemin du carnet du dialogue vers le
// portfolio). Le texte de chaque journée, dans l'ordre des dates, suivi des
// dialogues que la personne y a versés : un fichier à relire, à transmettre
// à qui lit son portfolio, à réimporter, ou à faire analyser lors de
// l'évaluation suivante.
//
// Contrat : redécoupé par le module Portfolio du site (`segmentText`, le même
// découpage qu'à l'import), le fichier redonne les mêmes journées, chacune
// avec son texte et ses dialogues. Chaque journée s'ouvre sur son en-tête de
// date : celle dont le texte ne commence pas par le sien (passage rattaché à
// la main dans le gestionnaire, titre du document) reçoit `## AAAA-MM-JJ`.
// Une ligne qui y ouvrirait une autre journée — une date seule sur sa ligne —
// est précédée d'un tiret « — » ; c'est fréquent quand le portfolio vient de
// feuilles séparées (AuroraCore : une feuille par journée, datée par son nom
// de fichier). Les traits (`---`, `***`…) restent tels quels : après l'en-tête
// d'une journée, ils ne coupent plus rien (journal carto D-55).
// Les passages restés sans date viennent en tête du fichier, chacun après un
// trait `***` : avant la première journée, un trait coupe encore, et ils
// restent sans date ; leurs propres traits y deviennent le même trait espacé
// (`- - -`…), qui s'affiche pareil sans rien couper, et leurs dates seules sur
// leur ligne sont précédées d'un « — ».
//
// Le « portfolio surligné » (sprint 3, lot S3-3 ; spec-stigmergie.md §9 de
// Twin_v9) est le même fichier, où chaque passage d'une trace conservée de la
// stigmergie du greffier est entouré d'un
// <mark data-twin9-code="…" data-incertitude="…" data-intensite="…">, ligne par
// ligne (jamais un <mark> qui enjambe deux paragraphes), et où chaque journée
// qui en a se termine par le tableau de ses traces, entre
// `<!-- twin9-traces -->` et `<!-- /twin9-traces -->`. L'intensité n'y est
// que si elle se montre (mode expert, cartographe). Produit dans le
// navigateur, jamais analysé : réimporté, il perd ses marques et son tableau
// (lib/twin9/marques.js) et redonne, à l'octet, le portfolio sans marques.

import { segmentText } from '@engine/portfolio/segment.js'
import { isIsoDate } from './dates.js'
import { reflectionIsoDay, versedDialogueMarkdown } from './dialogue.js'
import { INCERTITUDES, TAU_MAX, formatIntensite, tracesConserveesDuJour } from './stigmergie.js'

const NO_DATE = '0000-00-00'

/**
 * Ce que le découpage du portfolio lirait sur cette ligne, entre deux lignes
 * de texte, avant toute journée : `undefined` si elle ne coupe rien ; sinon la
 * date de la journée qu'elle ouvrirait (`null` pour un séparateur ou une date
 * sans année).
 * @param {string} line
 * @returns {string | null | undefined}
 */
export function boundaryDate(line) {
  const segs = segmentText(`texte\n${line}\ntexte\n`, { today: NO_DATE })
  return segs.length < 2 ? undefined : segs[1].date
}

/**
 * La ligne ouvrirait-elle une journée au milieu d'une autre ? Une date, oui ;
 * un trait, non (D-55). L'en-tête de départ est une date sans année : jamais
 * fusionnée avec la ligne essayée.
 */
function opensDayWithin(line) {
  return segmentText(`## Lundi 1 janvier\ntexte\n${line}\ntexte\n`, { today: NO_DATE }).length > 1
}

/**
 * Le texte s'ouvre-t-il sur l'en-tête de sa journée, et reste-t-il, redécoupé,
 * entièrement dans cette journée ? (Un préambule — le titre du document —
 * passerait sinon à la journée précédente du fichier.)
 */
function opensAndStaysInDay(text, date) {
  const first = text.split('\n').find((l) => l.trim() !== '')
  if (first === undefined || boundaryDate(first) !== date) return false
  const segs = segmentText(`${text}\n`, { today: NO_DATE })
  return segs.length > 0 && segs.every((s) => s.date === date)
}

/**
 * Neutralise chaque ligne qui ouvrirait une autre journée que `date` (« — »
 * devant) ; sans `date`, toute ligne qui ouvrirait une journée. Le texte
 * envoyé à Twin9 s'en sert aussi (lib/twin9/portfolio-pour-twin9.js).
 */
export function keepInDay(text, date) {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' || !opensDayWithin(line) || boundaryDate(line) === date ? line : `— ${line}`))
    .join('\n')
}

const SEPARATOR_RE = /^(\s{0,3})([-=*_])\2{2,}\s*$/u

/**
 * Le même trait, espacé (« - - - », « * * * », « _ _ _ » ; « * * * » pour
 * « === ») : il s'affiche pareil et ne coupe rien ; `null` si la ligne n'est
 * pas un séparateur.
 */
function spacedRule(line) {
  const sep = line.match(SEPARATOR_RE)
  return sep ? `${sep[1]}${sep[2] === '=' ? '* * *' : `${sep[2]} ${sep[2]} ${sep[2]}`}` : null
}

/**
 * Un passage sans date, placé avant toute journée : chaque ligne qui y
 * couperait est neutralisée — un séparateur devient le même trait espacé,
 * une date seule est précédée d'un « — ».
 */
function keepUndated(text) {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '' || boundaryDate(line) === undefined) return line
      const spaced = spacedRule(line)
      return spaced !== null && boundaryDate(spaced) === undefined ? spaced : `— ${line}`
    })
    .join('\n')
}

/**
 * Le dialogue tel que l'export d'avant D-55 l'écrivait (traits espacés) : un
 * portfolio exporté alors, puis réimporté, le porte sous cette forme.
 */
const legacyBlock = (block) => block.split('\n').map((line) => spacedRule(line) ?? line).join('\n')

/** Le bloc d'une journée : son texte, ouvert par son en-tête, qui ne coupe rien. */
function dayBlock(text, date) {
  if (opensAndStaysInDay(text, date)) return text
  const first = text.split('\n').find((l) => l.trim() !== '')
  const body = keepInDay(text, date)
  return first !== undefined && boundaryDate(first) === date ? body : `## ${date}\n\n${body}`
}

/**
 * Les blocs du portfolio exporté : chaque journée (son texte ouvert par son
 * en-tête, puis ses dialogues versés), et les passages sans date.
 * @param {{dataset: object, details?: Record<string, object>}} exported
 * @param {(date: string, block: string) => string} [decorate] ce que devient le texte d'une journée
 * @param {(date: string) => string | null} [after] ce qui ferme une journée (après ses dialogues)
 */
function portfolioBlocks(exported, decorate = (date, block) => block, after = () => null) {
  const ds = exported.dataset
  const details = exported.details ?? {}
  const textOf = (date) => String(details[date]?.portfolio?.text ?? '').replace(/\s+$/u, '')

  const versed = new Map()
  for (const r of ds.reflections ?? []) {
    if (!r?.versedAt) continue
    const day = reflectionIsoDay(r.at)
    if (!day) continue
    if (!versed.has(day)) versed.set(day, [])
    versed.get(day).push(r)
  }

  const written = Object.keys(details).filter((d) => isIsoDate(d) && textOf(d).trim() !== '')
  const dates = [...new Set([...written, ...versed.keys()])].sort()
  const blocks = []
  let dialogues = 0
  let days = 0
  for (const date of dates) {
    const text = textOf(date)
    const parts = []
    if (text.trim() !== '') parts.push(decorate(date, dayBlock(text, date)))
    const mine = (versed.get(date) ?? [])
      .slice()
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map((r) => keepInDay(versedDialogueMarkdown(r).trim(), date))
      .filter(Boolean)
    // Un portfolio déjà exporté puis réimporté (avec les analyses de
    // l'évaluation suivante) porte le dialogue dans le texte de sa journée :
    // il n'est pas ajouté une seconde fois.
    const fresh = mine.filter((block) => !text.includes(block) && !text.includes(legacyBlock(block)))
    if (parts.length === 0 && fresh.length === 0) continue
    if (parts.length === 0) parts.push(`## ${date}`)
    for (const block of fresh) parts.push(block)
    const closing = text.trim() !== '' ? after(date) : null
    if (closing) parts.push(closing)
    dialogues += mine.length
    days++
    blocks.push(parts.join('\n\n'))
  }
  const undated = (ds.portfolio?.undated ?? []).map((u) => String(u?.text ?? '').trim()).filter(Boolean)
  // En tête : avant la première journée, un trait coupe encore (D-55).
  blocks.unshift(...undated.map((u) => `***\n\n${keepUndated(u)}`))
  return { text: blocks.length ? `${blocks.join('\n\n')}\n` : '', days, dialogues, undated: undated.length }
}

/**
 * Le portfolio en Markdown, avec les dialogues versés.
 * @param {{dataset: object, details?: Record<string, object>}} exported ce que le magasin exporte (`exportAll`)
 * @returns {{text: string, days: number, dialogues: number, undated: number}}
 */
export function buildPortfolioMarkdown(exported) {
  return portfolioBlocks(exported)
}

// ---- Le portfolio surligné (S3-3) -------------------------------------------------------------

/** Une valeur d'attribut HTML, échappée. */
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Le texte d'une case du tableau : une ligne, sans HTML ni barre verticale qui la couperaient. */
const cell = (v) =>
  String(v ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')

/** Ce qui ouvre une ligne de Markdown sans être du texte (titre, citation, puce, numéro), laissé hors du <mark>. */
const LINE_MARKERS = /^(?:[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+))*/u

/**
 * Où l'extrait d'une trace se lit dans le texte : tel quel, sinon aux blancs
 * près (un saut de ligne pour une espace) ; null s'il n'y est pas.
 * @returns {[number, number] | null}
 */
export function locateExtractInText(text, extract) {
  const want = String(extract ?? '').trim()
  if (!want) return null
  const exact = text.indexOf(want)
  if (exact >= 0) return [exact, exact + want.length]
  // Aux blancs près : chaque suite de blancs du texte compte pour une espace.
  let norm = ''
  const map = []
  for (let i = 0; i < text.length; i++) {
    if (/\s/u.test(text[i])) {
      if (norm.endsWith(' ')) continue
      norm += ' '
    } else norm += text[i]
    map.push(i)
  }
  const target = want.replace(/\s+/gu, ' ')
  const at = norm.indexOf(target)
  if (at < 0) return null
  return [map[at], map[at + target.length - 1] + 1]
}

/**
 * Les morceaux d'une plage à envelopper, ligne par ligne : sans les blancs de
 * leurs bords, ni le marqueur qui ouvre une ligne de Markdown, ni une ligne
 * qui couperait le portfolio (en-tête de date, trait).
 * @returns {Array<[number, number]>}
 */
function lineSlices(text, [from, to]) {
  const out = []
  let lineStart = text.lastIndexOf('\n', from - 1) + 1
  while (lineStart < to) {
    let lineEnd = text.indexOf('\n', lineStart)
    if (lineEnd < 0) lineEnd = text.length
    const line = text.slice(lineStart, lineEnd)
    if (line.trim() !== '' && boundaryDate(line) === undefined) {
      let a = Math.max(from, lineStart + (line.match(LINE_MARKERS)?.[0].length ?? 0))
      let b = Math.min(to, lineEnd)
      while (a < b && /\s/u.test(text[a])) a++
      while (b > a && /\s/u.test(text[b - 1])) b--
      if (b > a) out.push([a, b])
    }
    lineStart = lineEnd + 1
  }
  return out
}

/**
 * Le portfolio surligné en Markdown : le portfolio exporté (buildPortfolioMarkdown),
 * chaque passage d'une trace conservée de la stigmergie entouré de sa marque,
 * chaque journée qui en a fermée par le tableau de ses traces. Les traces
 * d'une journée sont celles de son analyse active, ou de l'analyse conservée
 * de plus haut rang (`tracesConserveesDuJour`) ; une trace non conservée n'y
 * est jamais. Un passage introuvable tel quel, ou qui chevauche celui d'une
 * autre trace, reste dans le tableau, sans marque.
 * @param {{dataset: object, details?: Record<string, object>}} exported ce que le magasin exporte (`exportAll`)
 * @param {{intensites?: boolean, refl?: {compByCode?: Map<string, {name?: string, order?: number}>}}} [opts]
 *   intensites : l'intensité de chaque trace (data-intensite, colonne du tableau), si elle se montre (core/stigmergie.js)
 * @returns {{text: string, days: number, dialogues: number, undated: number, traces: number, marked: number}}
 */
export function buildHighlightedPortfolioMarkdown(exported, { intensites = false, refl = null } = {}) {
  const ds = exported.dataset
  const details = exported.details ?? {}
  const order = (code) => refl?.compByCode?.get(code)?.order ?? 999
  const rows = new Map() // date → lignes du tableau
  let traces = 0
  let marked = 0

  const decorate = (date, block) => {
    const day = (ds.days ?? []).find((d) => d.date === date)
    const chosen = tracesConserveesDuJour(day, details[date])
    if (!chosen) return block
    const list = [...chosen.bloc.traces].sort((a, b) => order(a.code) - order(b.code) || (a.start ?? 0) - (b.start ?? 0))
    // les plages de chaque trace, dans l'ordre du texte ; une trace qui en chevauche une autre n'a pas de marque
    const found = list.map((t) => ({ t, at: locateExtractInText(block, t.extrait) }))
    const taken = []
    for (const f of [...found].sort((a, b) => (a.at?.[0] ?? Infinity) - (b.at?.[0] ?? Infinity))) {
      if (!f.at) continue
      const over = taken.find((x) => f.at[0] < x.at[1] && x.at[0] < f.at[1])
      if (over) f.overlaps = over.t.code
      else taken.push(f)
    }
    const inserts = [] // [position, texte]
    for (const f of taken) {
      const nature = INCERTITUDES[f.t.incertitude]
      const open = `<mark data-twin9-code="${attr(f.t.code)}" data-incertitude="${attr(f.t.incertitude)}"${
        intensites ? ` data-intensite="${attr(Math.round(f.t.tau * 1000) / 1000)}"` : ''
      }>`
      const slices = lineSlices(block, f.at)
      if (slices.length === 0 || !nature) {
        f.at = null
        continue
      }
      for (const [a, b] of slices) inserts.push([a, open], [b, '</mark>'])
      marked++
    }
    // de la fin vers le début ; à même position (deux traces bout à bout), l'ouverture d'abord : la fermeture
    // de la précédente, insérée après elle, la précède dans le texte
    inserts.sort((x, y) => y[0] - x[0] || (x[1] === '</mark>' ? 1 : -1) - (y[1] === '</mark>' ? 1 : -1))
    let out = block
    for (const [at, txt] of inserts) out = out.slice(0, at) + txt + out.slice(at)
    traces += list.length
    rows.set(date, {
      analyse: chosen.bloc.analyse,
      lines: found.map((f) => {
        const meta = refl?.compByCode?.get(f.t.code)
        const note = f.overlaps ? ` (non surligné : dans le passage de ${cell(f.overlaps)})` : !f.at ? ' (non surligné : introuvable tel quel dans ce texte)' : ''
        return [
          cell(`${f.t.code}${meta?.name ? ` ${meta.name}` : ''}`),
          cell(INCERTITUDES[f.t.incertitude].label),
          ...(intensites ? [cell(formatIntensite(f.t.tau))] : []),
          `« ${cell(f.t.extrait)} »${note}`,
        ]
      }),
    })
    return out
  }

  const after = (date) => {
    const r = rows.get(date)
    if (!r) return null
    const head = ['Compétence', 'Nature de la trace', ...(intensites ? [`Intensité (sur ${TAU_MAX})`] : []), 'Passage']
    const table = [head, head.map(() => '---'), ...r.lines].map((cells) => `| ${cells.join(' | ')} |`).join('\n')
    const caption = `**Traces de la stigmergie (Twin9)** — analyse${r.analyse ? ` n° ${r.analyse}` : ''} de cette journée ; leur incertitude est calculée par la procédure, et le greffier de l’analyse suivante les relira.`
    return keepInDay(`<!-- twin9-traces -->\n\n${caption}\n\n${table}\n\n<!-- /twin9-traces -->`, date)
  }

  const out = portfolioBlocks(exported, decorate, after)
  return { ...out, traces, marked }
}

/** Y a-t-il quelque chose à exporter (texte du portfolio ou dialogue versé) ? */
export function hasPortfolioToExport(dataset) {
  return (
    (dataset.days ?? []).some((d) => d?.portfolio && d.portfolio.chars > 0) ||
    (dataset.reflections ?? []).some((r) => r?.versedAt) ||
    (dataset.portfolio?.undated ?? []).length > 0
  )
}
