// La feuille du site (web/src/styles/global.css), lue sur disque et analysée
// par le CSSOM de jsdom, comme v3Rules() d'UC-APP-12 : Vitest n'injecte pas
// les CSS importées. Sert aux tests qui vérifient une règle (un conteneur qui
// défile) ou un contraste calculé sur les jetons des trois thèmes (clair,
// sombre du système, sombre choisi). jsdom ne calcule aucune mise en page :
// ces tests lisent les règles, ils ne mesurent rien.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/global.css')

/** Les trois contextes où global.css définit ses jetons de couleur. */
export const THEMES = [
  { name: 'clair', selector: ':root', media: null },
  { name: 'sombre (système)', selector: ":root:not([data-theme='light'])", media: '(prefers-color-scheme: dark)' },
  { name: 'sombre (choisi)', selector: ":root[data-theme='dark']", media: null },
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
 * Valeur d'une couleur dans un thème : `var(--x)` résolu sur les jetons de
 * ce thème (le sombre redéfinit ceux du clair), une couleur littérale telle
 * quelle.
 */
export function resolveColor(rules, value, theme) {
  const light = declOf(rules, ':root')
  const tokens = theme.selector === ':root' ? light : { ...light, ...declOf(rules, theme.selector, theme.media) }
  let current = value
  for (let depth = 0; depth < 5; depth++) {
    const match = /^var\((--[\w-]+)\)$/.exec(current)
    if (!match) return current
    if (!(match[1] in tokens)) throw new Error(`Jeton ${match[1]} absent du thème ${theme.name}`)
    current = tokens[match[1]]
  }
  throw new Error(`Jeton circulaire : ${value}`)
}
