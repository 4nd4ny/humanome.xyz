// La feuille du site (web/src/styles/global.css), lue sur disque et analysée
// par le CSSOM de jsdom, comme v3Rules() d'UC-APP-12 : Vitest n'injecte pas
// les CSS importées. Sert aux tests qui vérifient une règle (un conteneur qui
// défile) ou un contraste calculé sur les jetons des trois thèmes (clair,
// sombre du système, sombre choisi) de chacune des trois interfaces du
// sprint 9 (épistémiarque, noèsiologue, technomancien), soit neuf contextes.
// Les autres feuilles de l'habillage (SITE_SHEETS) se lisent en texte
// (sheetRules) : couples texte et fond, anneaux de focus, bordures de champ.
// jsdom ne calcule aucune mise en page : ces tests lisent les règles, ils ne
// mesurent rien.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/global.css')

const DARK = '(prefers-color-scheme: dark)'
const SYSTEM_DARK = ":root:not([data-theme='light'])"
const CHOSEN_DARK = ":root[data-theme='dark']"

/**
 * Les neuf contextes où global.css définit ses jetons de couleur : trois
 * interfaces × (clair, sombre du système, sombre choisi). `layers` = les
 * règles qui s'appliquent par-dessus les règles `:root`, dans l'ordre de la
 * cascade (spécificité puis ordre) : l'épistémiarque vit sur :root, une autre
 * interface ajoute son clair puis son sombre. `block` = la règle propre au
 * contexte (celle qui porte les jetons --ds-* de l'interface).
 */
function contexts(interfaceName, label) {
  if (interfaceName === 'epistemiarque') {
    return [
      { name: `${label}, clair`, interface: interfaceName, theme: 'light', block: { selector: ':root', media: null }, layers: [] },
      {
        name: `${label}, sombre (système)`,
        interface: interfaceName,
        theme: 'dark-system',
        block: { selector: SYSTEM_DARK, media: DARK },
        layers: [{ selector: SYSTEM_DARK, media: DARK }],
      },
      {
        name: `${label}, sombre (choisi)`,
        interface: interfaceName,
        theme: 'dark-chosen',
        block: { selector: CHOSEN_DARK, media: null },
        layers: [{ selector: CHOSEN_DARK, media: null }],
      },
    ]
  }
  const light = { selector: `:root[data-interface='${interfaceName}']`, media: null }
  const systemDark = { selector: `:root[data-interface='${interfaceName}']:not([data-theme='light'])`, media: DARK }
  const chosenDark = { selector: `:root[data-interface='${interfaceName}'][data-theme='dark']`, media: null }
  return [
    { name: `${label}, clair`, interface: interfaceName, theme: 'light', block: light, layers: [light] },
    {
      name: `${label}, sombre (système)`,
      interface: interfaceName,
      theme: 'dark-system',
      block: systemDark,
      layers: [{ selector: SYSTEM_DARK, media: DARK }, light, systemDark],
    },
    {
      name: `${label}, sombre (choisi)`,
      interface: interfaceName,
      theme: 'dark-chosen',
      block: chosenDark,
      layers: [{ selector: CHOSEN_DARK, media: null }, light, chosenDark],
    },
  ]
}

export const THEMES = [
  ...contexts('epistemiarque', 'épistémiarque'),
  ...contexts('noesiologue', 'noèsiologue'),
  ...contexts('technomancien', 'technomancien'),
]

/**
 * Règles de global.css, feuille insérée le temps de la lecture (à l'appel,
 * jamais au niveau d'un describe).
 * @returns {Array<{media: string|null, selector: string, decl: Record<string, string>}>}
 */
export function globalCssRules() {
  const style = document.createElement('style')
  style.textContent = readFileSync(CSS, 'utf8')
  document.head.appendChild(style)
  try {
    const out = []
    const walk = (rules, media) => {
      for (const rule of rules) {
        if (rule.media && rule.cssRules) walk(rule.cssRules, rule.media.mediaText)
        else if (rule.selectorText) {
          const decl = {}
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            decl[prop] = rule.style.getPropertyValue(prop).trim()
          }
          out.push({ media, selector: rule.selectorText.replace(/\s+/g, ' ').trim(), decl })
        }
      }
    }
    walk(style.sheet.cssRules, null)
    return out
  } finally {
    style.remove()
  }
}

/**
 * Déclarations d'un sélecteur, fusionnées dans l'ordre de la feuille. Un
 * sélecteur groupé (« .a, .b ») compte pour chacun de ses membres.
 */
export function declOf(rules, selector, media = null) {
  const found = rules.filter(
    (r) => r.media === media && r.selector.split(',').map((part) => part.trim()).includes(selector),
  )
  if (found.length === 0) throw new Error(`Règle absente de global.css : ${media ? `@media ${media} ` : ''}${selector}`)
  return Object.assign({}, ...found.map((r) => r.decl))
}

/**
 * Jetons en vigueur dans un contexte de THEMES : les règles `:root`, puis ses
 * couches dans l'ordre de la cascade.
 */
export function tokensOf(rules, theme) {
  return Object.assign({}, declOf(rules, ':root'), ...theme.layers.map((layer) => declOf(rules, layer.selector, layer.media)))
}

/**
 * Valeur d'une couleur dans un thème : `var(--x)` résolu sur les jetons de
 * ce thème (le sombre redéfinit ceux du clair, l'interface ceux du défaut),
 * une couleur littérale telle quelle. `var(--x, repli)` prend le repli quand
 * le jeton n'existe pas. `extra` : jetons posés par-dessus (ceux d'un
 * conteneur, comme `.carto-app`).
 */
export function resolveColor(rules, value, theme, extra = {}) {
  const tokens = { ...tokensOf(rules, theme), ...extra }
  let current = value
  for (let depth = 0; depth < 5; depth++) {
    const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(current)
    if (!match) return current
    if (match[1] in tokens) current = tokens[match[1]]
    else if (match[2] !== undefined) current = match[2].trim()
    else throw new Error(`Jeton ${match[1]} absent du thème ${theme.name}`)
  }
  throw new Error(`Jeton circulaire : ${value}`)
}

/**
 * Règles terminales d'une feuille (texte), avec leur @media éventuel :
 * commentaires ôtés, blocs imbriqués parcourus. Lecture du texte, sans
 * CSSOM : jsdom ne sait pas analyser color-mix(). Un @supports est traversé
 * (ses règles s'appliquent là où il est vrai) ; les autres @-règles
 * (@font-face, @keyframes…) sont ignorées.
 * @returns {Array<{media: string|null, selector: string, decl: Record<string, string>}>}
 */
export function leafRules(source, media = null) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) out.push(...leafRules(body, head.slice(6).trim()))
    else if (head.startsWith('@supports')) out.push(...leafRules(body, media))
    else if (!head.startsWith('@')) {
      const decl = {}
      for (const part of body.split(';')) {
        const at = part.indexOf(':')
        if (at > 0) decl[part.slice(0, at).trim()] = part.slice(at + 1).trim()
      }
      out.push({ media, selector: head.replace(/\s+/g, ' '), decl })
    }
    i = j
  }
  return out
}

/**
 * Les feuilles de l'habillage du site (chemins depuis web/) : celles dont
 * les couleurs d'interface passent par les jetons de global.css.
 */
export const SITE_SHEETS = [
  'src/styles/global.css',
  'src/styles/configuration.css',
  'src/styles/markdown.css',
  'src/styles/twin9.css',
  'src/styles/twin9-credit.css',
  'src/styles/timeline.css',
  'src/carto/ui/carto.css',
]

/** Règles terminales d'une feuille du site (chemin depuis web/). */
export function sheetRules(sheet) {
  return leafRules(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', sheet), 'utf8'))
}
