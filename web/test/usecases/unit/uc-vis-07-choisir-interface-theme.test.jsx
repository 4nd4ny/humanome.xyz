// UC-VIS-07 — Choisir son interface et son thème : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-07-choisir-interface-theme.md
//
// Code sollicité appelé directement : lecture, résolution et écriture de
// l'interface et du choix de thème (lib/theme.js), script anti-FOUC
// d'index.html (exécuté contre des doublures), jetons des trois interfaces
// dans global.css (lus par le CSSOM de jsdom : jeux de jetons, copies
// sombres, alias, couleurs de données, contrastes WCAG dans les neuf
// contextes), les règles des feuilles du site qui les emploient (couples
// texte et fond, encres héritées d'une règle de base, anneaux de focus,
// bordures des champs, zone du diagramme, mesurés dans les neuf contextes :
// lot S9-3 et correctifs de relecture) et les deux listes du sélecteur
// (DisplaySelects). jsdom n'applique pas les styles : les contrastes sont
// calculés sur les règles, pas mesurés à l'écran.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  DEFAULT_INTERFACE,
  DisplayContext,
  INTERFACES,
  INTERFACE_KEY,
  INTERFACE_LABELS,
  THEME_KEY,
  applyInterface,
  applyThemeChoice,
  resolvedInterface,
  storedInterface,
  themeChoice,
} from '../../../src/lib/theme.js'
import DisplaySelects from '../../../src/components/DisplaySelects.jsx'
import { contrast } from '../../../src/carto/ui/colors.js'
import { SITE_SHEETS, THEMES, declOf, globalCssRules, jsxClasses, resolveColor, sheetRules, tokensOf } from '../support/global-css.js'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(resolve(here, '../../../index.html'), 'utf8')

/** Exécute le script anti-FOUC d'index.html ; rend les attributs posés sur <html>. */
function runAntiFouc(stored, { throws = false } = {}) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  const attributes = {}
  const storage = {
    getItem(key) {
      if (throws) throw new DOMException('refusé', 'SecurityError')
      return key in stored ? stored[key] : null
    },
  }
  const doc = { documentElement: { setAttribute: (name, value) => (attributes[name] = value) } }
  new Function('localStorage', 'document', script)(storage, doc)
  return attributes
}

/** Jetons --ds-* (et color-scheme) d'une règle. */
function dsDecl(decl) {
  return Object.fromEntries(Object.entries(decl).filter(([prop]) => prop.startsWith('--ds-') || prop === 'color-scheme'))
}

const DATA_TOKENS = [
  '--fam-decouvrir',
  '--fam-cartographie',
  '--fam-encadrer',
  '--fam-piloter',
  '--fam-evoluer',
  '--fam-administrer',
  '--fam-compte',
  '--mon-s1',
  '--mon-s2',
  '--mon-s3',
  '--mon-bad',
  '--mon-good',
  '--viz-surface',
  '--viz-ink',
  '--viz-ink-soft',
  '--gratuit-fg',
  '--gratuit-bg',
  '--premium-fg',
  '--premium-bg',
]

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-interface')
  document.documentElement.removeAttribute('data-theme')
})

describe('UC-VIS-07 — règles de lecture et d’écriture (lib/theme.js)', () => {
  it('UC-VIS-07-U01 — trois interfaces, épistémiarque par défaut ; la valeur stockée connue prime, une valeur inconnue ou un stockage illisible ramènent au défaut ; une interface inconnue est refusée sans rien écrire (RG2, A3, E1)', () => {
    expect(INTERFACE_KEY).toBe('humanome-interface')
    expect(INTERFACES).toEqual(['epistemiarque', 'noesiologue', 'technomancien'])
    expect(DEFAULT_INTERFACE).toBe('epistemiarque')
    expect(INTERFACES.map((id) => INTERFACE_LABELS[id])).toEqual(['Épistémiarque', 'Noèsiologue', 'Technomancien'])

    expect(resolvedInterface()).toBe('epistemiarque')
    localStorage.setItem(INTERFACE_KEY, 'technomancien')
    expect(resolvedInterface()).toBe('technomancien')
    for (const unknown of ['technomacien', 'Noèsiologue', 'dark', '']) {
      localStorage.setItem(INTERFACE_KEY, unknown)
      expect(storedInterface(), unknown).toBeNull()
      expect(resolvedInterface(), unknown).toBe('epistemiarque')
    }

    applyInterface('noesiologue')
    expect(document.documentElement.getAttribute('data-interface')).toBe('noesiologue')
    expect(localStorage.getItem(INTERFACE_KEY)).toBe('noesiologue')
    expect(() => applyInterface('technomacien')).toThrow(TypeError)
    expect(localStorage.getItem(INTERFACE_KEY)).toBe('noesiologue')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError')
    })
    expect(resolvedInterface()).toBe('epistemiarque')
  })

  it('UC-VIS-07-U02 — thème : « Système » sans choix stocké ; Clair et Sombre posent un choix explicite, « Système » retire l’attribut et la clé ; l’interface et le thème ont chacun leur clé (RG3)', () => {
    expect(THEME_KEY).toBe('humanome-theme')
    expect(themeChoice()).toBe('system')
    applyThemeChoice('dark')
    expect(themeChoice()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    applyInterface('technomancien')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    applyThemeChoice('system')
    expect(themeChoice()).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(localStorage.getItem(INTERFACE_KEY)).toBe('technomancien')
    expect(() => applyThemeChoice('sepia')).toThrow(TypeError)
  })
})

describe('UC-VIS-07 — premier rendu (script anti-FOUC d’index.html)', () => {
  it('UC-VIS-07-U03 — l’interface est TOUJOURS posée avant le premier rendu : la choisie, sinon le défaut (rien de stocké, valeur inconnue, stockage illisible) ; le thème seulement s’il a été choisi (étape 6, A3, E1)', () => {
    for (const id of INTERFACES) expect(runAntiFouc({ [INTERFACE_KEY]: id })['data-interface']).toBe(id)
    expect(runAntiFouc({})).toEqual({ 'data-interface': 'epistemiarque' })
    expect(runAntiFouc({ [INTERFACE_KEY]: 'bleu-canard', [THEME_KEY]: 'sepia' })).toEqual({ 'data-interface': 'epistemiarque' })
    expect(runAntiFouc({}, { throws: true })).toEqual({ 'data-interface': 'epistemiarque' })
    expect(runAntiFouc({ [INTERFACE_KEY]: 'noesiologue', [THEME_KEY]: 'dark' })).toEqual({
      'data-interface': 'noesiologue',
      'data-theme': 'dark',
    })
  })
})

describe('UC-VIS-07 — jetons des trois interfaces (global.css)', () => {
  it('UC-VIS-07-U04 — chacun des neuf contextes déclare le MÊME jeu de jetons --ds-* (aucune valeur de l’épistémiarque ne fuit), et les deux copies sombres d’une interface (système, choisi) sont identiques (RG4)', () => {
    const rules = globalCssRules()
    const blocks = THEMES.map((theme) => ({ theme, decl: dsDecl(declOf(rules, theme.block.selector, theme.block.media)) }))
    expect(blocks).toHaveLength(9)
    const reference = Object.keys(blocks[0].decl).sort()
    expect(reference.length).toBeGreaterThan(25)
    for (const { theme, decl } of blocks) {
      expect(Object.keys(decl).sort(), theme.name).toEqual(reference)
      expect(decl['color-scheme'], theme.name).toBe(theme.theme === 'light' ? 'light' : 'dark')
    }
    for (const id of INTERFACES) {
      const [system, chosen] = blocks.filter((b) => b.theme.interface === id && b.theme.theme !== 'light')
      expect(chosen.decl, id).toEqual(system.decl)
    }
    // Les trois interfaces sont bien distinctes (fond et accent, en clair et en sombre).
    for (const theme of ['light', 'dark-chosen']) {
      const of = (prop) => new Set(blocks.filter((b) => b.theme.theme === theme).map((b) => b.decl[prop]))
      expect(of('--ds-bg').size, theme).toBe(3)
      expect(of('--ds-accent').size, theme).toBe(3)
    }
  })

  it('UC-VIS-07-U05 — les variables historiques du site sont des alias des jetons (aucune n’est redéfinie par une interface) ; les couleurs de DONNÉES (familles, monitoring, visualisation, badges) ne dépendent pas de l’interface (RG5)', () => {
    const rules = globalCssRules()
    const root = declOf(rules, ':root')
    for (const [alias, token] of Object.entries({
      '--ink': '--ds-text',
      '--ink-soft': '--ds-text-soft',
      '--ink-faint': '--ds-text-faint',
      '--muted': '--ds-text-soft',
      '--paper': '--ds-bg',
      '--card': '--ds-surface',
      '--surface-2': '--ds-surface-2',
      '--line': '--ds-line',
      '--line-strong': '--ds-line-strong',
      '--accent': '--ds-accent',
      '--accent-strong': '--ds-accent-strong',
      '--accent-solid': '--ds-accent-solid',
      '--accent-solid-hover': '--ds-accent-solid-hover',
      '--on-accent': '--ds-on-accent',
      '--focus': '--ds-focus',
      '--danger': '--ds-danger',
      '--danger-bg': '--ds-danger-bg',
      '--ok': '--ds-success',
      '--ok-bg-strong': '--ds-success-bg-strong',
      '--warn': '--ds-warning',
      '--warn-bg-strong': '--ds-warning-bg-strong',
      '--info-bg': '--ds-info-bg',
      '--overlay': '--ds-overlay',
    })) {
      expect(root[alias], alias).toBe(`var(${token})`)
    }
    for (const theme of THEMES) {
      const block = declOf(rules, theme.block.selector, theme.block.media)
      const nonToken = Object.keys(block).filter((prop) => !prop.startsWith('--ds-') && prop !== 'color-scheme')
      if (theme.interface !== 'epistemiarque') expect(nonToken, theme.name).toEqual([])
    }
    for (const mode of ['light', 'dark-system', 'dark-chosen']) {
      const contexts = THEMES.filter((t) => t.theme === mode)
      const values = contexts.map((t) => DATA_TOKENS.map((prop) => tokensOf(rules, t)[prop]))
      expect(values[1], mode).toEqual(values[0])
      expect(values[2], mode).toEqual(values[0])
      expect(values[0].every(Boolean), mode).toBe(true)
    }
  })

  it('UC-VIS-07-U06 — contrastes WCAG dans les neuf contextes : texte courant, doux et discret, accent et états >= 4,5:1 sur leurs fonds ; texte sur l’aplat d’accent (et son survol) >= 4,5:1 ; bordure de commande, anneau de focus et aplat d’accent >= 3:1 (RG4)', () => {
    const rules = globalCssRules()
    const text = [
      ['--ink', ['--paper', '--card', '--surface-2', '--info-bg']],
      ['--ink-soft', ['--paper', '--card', '--surface-2']],
      ['--ink-faint', ['--paper', '--card', '--surface-2']],
      ['--accent', ['--paper', '--card', '--surface-2', '--info-bg']],
      ['--accent-strong', ['--paper', '--card']],
      ['--on-accent', ['--accent-solid', '--accent-solid-hover']],
      ['--danger', ['--card', '--danger-bg']],
      ['--danger-strong', ['--card', '--danger-bg']],
      ['--ok', ['--card', '--ok-bg', '--ok-bg-strong']],
      ['--warn', ['--card', '--warn-bg', '--warn-bg-strong']],
      ['--warn-strong', ['--warn-bg', '--warn-bg-strong']],
    ]
    const graphic = [
      ['--line-strong', ['--paper', '--card']],
      ['--focus', ['--paper', '--card']],
      ['--accent-solid', ['--paper', '--card']],
    ]
    const failures = []
    for (const theme of THEMES) {
      const color = (prop) => resolveColor(rules, `var(${prop})`, theme)
      for (const [pairs, min] of [
        [text, 4.5],
        [graphic, 3],
      ]) {
        for (const [fg, backgrounds] of pairs) {
          for (const bg of backgrounds) {
            const ratio = contrast(color(fg), color(bg))
            if (!(ratio >= min)) failures.push(`${theme.name} : ${fg} ${color(fg)} sur ${bg} ${color(bg)} = ${ratio.toFixed(2)} < ${min}`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('UC-VIS-07-U08 — aucun texte blanc écrit en dur : sur l’aplat d’accent, l’encre est --on-accent (sombre quand l’aplat s’éclaircit en sombre) ; timeline.css et twin9-credit.css n’ont plus de couleur littérale (RG4)', () => {
    const failures = []
    let onAccent = 0
    for (const sheet of SITE_SHEETS) {
      for (const rule of sheetRules(sheet)) {
        if (rule.media?.includes('print')) continue // le papier reste blanc, à dessein
        const where = `${sheet} ${rule.selector}`
        if (/^(#fff|#ffffff|white)$/i.test(rule.decl.color ?? '')) failures.push(`${where} : color ${rule.decl.color}`)
        const fill = rule.decl.background ?? rule.decl['background-color']
        if (/^var\(--accent-solid(-hover)?\)$/.test(fill ?? '') && 'color' in rule.decl) {
          onAccent++
          if (rule.decl.color !== 'var(--on-accent)') failures.push(`${where} : ${rule.decl.color} sur ${fill}`)
        }
      }
    }
    expect(failures).toEqual([])
    expect(onAccent).toBeGreaterThanOrEqual(15) // boutons pleins, puces pressées, onglets, bulles…
    for (const sheet of ['src/styles/timeline.css', 'src/styles/twin9-credit.css']) {
      const source = readFileSync(resolve(here, '../../..', sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(|:\s*(white|black)\b/gi), sheet).toBeNull()
    }
  })
})

/** Une couleur : un jeton (avec un repli éventuel) ou un littéral hexadécimal. */
const SINGLE_COLOR = /^(var\(--[\w-]+(\s*,\s*(var\(--[\w-]+\)|#[0-9a-f]{3,8}))?\)|#[0-9a-f]{3,8})$/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Variables posées par élément, pas par l'interface : couleurs calculées et
 * pôles de la cartographie (--c, --pole-*), familles (--fam), comparaison,
 * surlignages, tuiles V3. Ce sont des couleurs de DONNÉES (RG5) : leurs
 * encres sont choisies à la volée (carto/ui/colors.js, labelInk).
 */
const ELEMENT_VARS = /var\(--(c|c-dark|c-ink|c-ink-dark|pole-[\w-]+|fam|fn-color|cmp-[ab]|v3-[\w-]+|carto-hl[\w-]*)[,)]/

/** Première couleur d'une valeur (« 2px solid var(--focus) » → « var(--focus) »). */
const colorIn = (value) => /var\(--[\w-]+(?:\s*,\s*[^)]*\)?)?\)|#[0-9a-f]{3,8}\b/i.exec(value ?? '')?.[0] ?? null

/**
 * Jetons qu'un conteneur de carto.css pose par-dessus ceux du site, dans un
 * contexte : la surface de visualisation de l'interface de cartographie
 * (blanche en clair, sombre avec le site, D-60), ou la feuille imprimable,
 * du papier clair dans les deux thèmes.
 */
function cartoLayer(cartoRules, theme, selector) {
  const custom = (sel, media = null) =>
    Object.fromEntries(
      cartoRules
        .filter((r) => r.media === media && r.selector === sel)
        .flatMap((r) => Object.entries(r.decl))
        .filter(([prop]) => prop.startsWith('--')),
    )
  if (/\.carto-print-(sheet|page|cover)\b/.test(selector)) return custom('.carto-print-sheet')
  const base = { ...custom('.carto-app'), ...custom('.carto-app, .carto-print-sheet') }
  if (theme.theme === 'light') return base
  const dark =
    theme.theme === 'dark-chosen'
      ? custom(":root[data-theme='dark'] .carto-app", 'screen')
      : custom(":root:not([data-theme='light']) .carto-app", 'screen and (prefers-color-scheme: dark)')
  if (!dark['--viz-surface']) throw new Error(`Surface sombre de la cartographie introuvable (${theme.name})`)
  return { ...base, ...dark }
}

/** Grand texte WCAG : 24 px, ou 18,66 px en gras (700), à 16 px le rem. */
function isLargeText(decl) {
  const size = decl['font-size'] ?? ''
  if (/^var\(--fs-(2xl|3xl)\)$/.test(size)) return true // >= 1,5rem dans les trois interfaces
  const match = /^([\d.]+)(rem|px)$/.exec(size)
  if (!match) return false
  const px = Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
  const bold = Number(decl['font-weight']) >= 700 || decl['font-weight'] === 'bold'
  return px >= 24 || (bold && px >= 18.66)
}

/** États d'un même élément : pseudo-classes d'état et attributs d'état. */
const STATE = /:(?:hover|focus-visible|focus-within|focus|active|disabled|checked|not\((?:[^()]|\([^()]*\))*\))|\[(?:aria|data)-[^\]]*\]/g

/** Indice où commence le dernier composé d'un sélecteur (l'élément visé). */
function subjectStart(part) {
  let depth = 0
  let start = 0
  for (let i = 0; i < part.length; i++) {
    const ch = part[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1
  }
  return start
}

/**
 * Règles de base d'un état ou d'un modificateur, de la plus proche à la plus
 * lointaine, sur l'élément visé (dernier composé) : le sélecteur sans ses
 * états (« .x:hover », « .x[aria-pressed='true'] », « .x.is-focus » → « .x »),
 * puis sans son modificateur BEM (« .x--y » → « .x »). Un pseudo-élément est
 * un autre élément : aucune base.
 */
function baseSelectors(part) {
  if (part.includes('::')) return []
  const at = subjectStart(part)
  const [head, subject] = [part.slice(0, at), part.slice(at)]
  const plain = subject.replace(STATE, '').replace(/\.is-[\w-]+/g, '')
  const bem = plain.replace(/\.([\w-]+?)--[\w-]+/g, '.$1')
  return [...new Set([plain, bem])].filter((s) => s && s !== subject).map((s) => head + s)
}

/**
 * Les règles des feuilles du site rangées par membre de sélecteur (« .a, .b »
 * compte pour .a et pour .b), dans l'ordre des feuilles : la cascade d'un même
 * élément, lue à plat. Impression et copies :root[…] exclues.
 */
function siteIndex() {
  const index = new Map()
  for (const sheet of SITE_SHEETS) {
    for (const rule of sheetRules(sheet)) {
      if (rule.media?.includes('print') || rule.selector.startsWith(':root')) continue
      for (const part of rule.selector.split(',').map((p) => p.trim())) {
        if (!index.has(part)) index.set(part, [])
        index.get(part).push({ sheet, media: rule.media, decl: rule.decl })
      }
    }
  }
  return index
}

/**
 * Une propriété telle que la cascade la donne à un sélecteur de base : sa
 * dernière déclaration, hors @media ou dans le même @media que la règle lue.
 */
function declaredOn(index, selector, prop, media) {
  const found = (index.get(selector) ?? []).filter((r) => (r.media === null || r.media === media) && prop in r.decl)
  return found.length ? found[found.length - 1].decl[prop] : undefined
}

/**
 * L'encre d'un élément dont la règle ne pose que le fond : celle de la plus
 * proche de ses règles de base qui en déclare une (`undefined` sinon : un
 * remplissage sans texte, piste d'interrupteur ou barre de progression).
 */
function inheritedInk(index, part, media) {
  for (const base of baseSelectors(part)) {
    const color = declaredOn(index, base, 'color', media)
    if (color !== undefined) return { base, color }
  }
  return undefined
}

describe('UC-VIS-07 — contrastes en usage : les règles des feuilles du site, mesurées dans les neuf contextes (sprint 9, lot S9-3)', () => {
  it('UC-VIS-07-U09 — chaque règle qui pose un texte sur un fond atteint 4,5:1, 3:1 pour un grand texte, dans les trois interfaces en clair, en sombre du système et en sombre choisi : couleur et fond dans la même règle, ou fond seul d’un état ou d’un modificateur (:hover, [aria-pressed], .is-*, .x--y) sous l’encre de sa règle de base ; un modificateur garde son fond au survol de sa base ; les couleurs de données posées par élément sont hors de l’interface (RG4, RG5)', () => {
    const rules = globalCssRules()
    const cartoRules = sheetRules('src/carto/ui/carto.css')
    const index = siteIndex()
    const failures = []
    let measured = 0
    let inherited = 0
    const measure = (sheet, selector, decl, fg, bg) => {
      // Aucune règle d'aujourd'hui ne pose un grand texte sur son fond : toutes visent 4,5:1.
      const min = isLargeText(decl) ? 3 : 4.5
      for (const theme of THEMES) {
        const extra = sheet.includes('carto') ? cartoLayer(cartoRules, theme, selector) : {}
        const [ink, surface] = [fg, bg].map((value) => resolveColor(rules, value, theme, extra))
        const where = `${sheet} ${selector}, ${theme.name}`
        if (!HEX.test(ink) || !HEX.test(surface)) failures.push(`${where} : couleur non mesurable ${ink} / ${surface}`)
        else if (!(contrast(ink, surface) >= min))
          failures.push(`${where} : ${fg} ${ink} sur ${bg} ${surface} = ${contrast(ink, surface).toFixed(2)} < ${min}`)
      }
    }
    for (const sheet of SITE_SHEETS) {
      for (const rule of sheetRules(sheet)) {
        // Impression : du papier ; :root[…] : copies par thème des couleurs de données.
        if (rule.media?.includes('print') || rule.selector.startsWith(':root')) continue
        const fg = rule.decl.color
        const bg = rule.decl['background-color'] ?? rule.decl.background
        if (!SINGLE_COLOR.test(bg ?? '') || ELEMENT_VARS.test(bg)) continue // dégradés, color-mix, transparent…
        if (fg !== undefined) {
          if (!SINGLE_COLOR.test(fg) || ELEMENT_VARS.test(fg)) continue
          measured++
          measure(sheet, rule.selector, rule.decl, fg, bg)
          continue
        }
        // Fond seul : l'encre vient de la règle de base du même élément
        // (.carto-btn--danger sous l'encre de .carto-btn, un :hover sous celle
        // de sa règle) ; sans encre de base, un remplissage sans texte.
        for (const part of rule.selector.split(',').map((p) => p.trim())) {
          const base = inheritedInk(index, part, rule.media)
          if (!base || !SINGLE_COLOR.test(base.color) || ELEMENT_VARS.test(base.color)) continue
          inherited++
          measure(sheet, `${part} (encre de ${base.base})`, rule.decl, base.color, bg)
        }
      }
    }
    // Un modificateur qui change le fond de sa base (« .x--y ») et dont la base
    // a un fond de survol : son propre survol, sinon « .x:hover » l'emporte
    // (même spécificité, ou plus haute) et lui rend le fond de la base.
    for (const [part, entries] of index) {
      const subject = part.slice(subjectStart(part))
      if (!/\.[\w-]+?--[\w-]+/.test(subject) || /[:[]/.test(subject)) continue
      if (!entries.some((r) => 'background' in r.decl || 'background-color' in r.decl)) continue
      const baseHover = `${baseSelectors(part).at(-1)}:hover`
      const hasBg = (sel) => (index.get(sel) ?? []).some((r) => 'background' in r.decl || 'background-color' in r.decl)
      if (hasBg(baseHover) && !hasBg(`${part}:hover`)) failures.push(`${part} : pas de fond au survol, ${baseHover} lui rend le sien`)
    }
    expect(failures).toEqual([])
    expect(measured).toBeGreaterThanOrEqual(140) // boutons, onglets, puces, bandeaux, champs, badges… (144 aux correctifs du sprint 9)
    expect(inherited).toBeGreaterThanOrEqual(12) // survols, modificateurs, états pressés… (14 aux correctifs du sprint 9)
  })

  it('UC-VIS-07-U10 — anneau de focus : chaque règle :focus des feuilles du site, et l’élément actif d’un composite porté par une classe (.is-focus), trace l’anneau de l’interface (--focus), ou l’encre de la visualisation (--viz-ink) sur sa surface claire ; l’anneau atteint 3:1 sur tout fond où il peut tomber (fond, carte, surface secondaire, encart d’information, surface de la cartographie) dans les neuf contextes ; la feuille imprimable et la zone du diagramme, claires dans les deux thèmes, posent leur propre anneau (RG4)', () => {
    const rules = globalCssRules()
    const cartoRules = sheetRules('src/carto/ui/carto.css')
    const failures = []
    const rings = []
    for (const sheet of SITE_SHEETS) {
      for (const rule of sheetRules(sheet)) {
        // :focus, ou l'élément actif d'un composite porté par une classe
        // (.is-focus : la case de la heatmap que désigne aria-activedescendant).
        if (rule.media?.includes('print') || !/:focus(?!-within)|\.is-focus\b/.test(rule.selector)) continue
        const where = `${sheet} ${rule.selector}`
        for (const prop of ['outline', 'outline-color', 'stroke', 'box-shadow']) {
          const value = rule.decl[prop]
          if (value === undefined || /^(none|0)$/.test(value)) continue
          const color = colorIn(value)
          if (color === 'var(--focus)' || color === 'var(--viz-ink)') rings.push({ sheet, selector: rule.selector, color })
          else failures.push(`${where} : ${prop} ${value} (attendu var(--focus), ou var(--viz-ink) sur la visualisation)`)
        }
      }
    }
    for (const { sheet, selector, color } of rings) {
      const surfaces = color === 'var(--focus)' ? ['--paper', '--card', '--surface-2', '--info-bg'] : ['--viz-surface']
      if (sheet.includes('carto') && color === 'var(--focus)') surfaces.push('--viz-surface')
      for (const theme of THEMES) {
        const extra = sheet.includes('carto') ? cartoLayer(cartoRules, theme, selector) : {}
        const ring = resolveColor(rules, color, theme, extra)
        for (const surface of surfaces) {
          const under = resolveColor(rules, `var(${surface})`, theme, extra)
          const where = `${sheet} ${selector}, ${theme.name} : ${color} ${ring} sur ${surface} ${under}`
          if (!HEX.test(ring) || !HEX.test(under)) failures.push(`${where} : non mesurable`)
          else if (!(contrast(ring, under) >= 3)) failures.push(`${where} = ${contrast(ring, under).toFixed(2)} < 3`)
        }
      }
    }
    expect(failures).toEqual([])
    expect(rings.length).toBeGreaterThanOrEqual(13) // 13 au lot S9-3, 14 avec la case active de la heatmap
    // Le motif commun : liens, boutons, résumés, éléments focalisables et champs.
    const base = declOf(rules, 'button:focus-visible')
    expect(base.outline).toBe('2px solid var(--focus)')
    for (const field of ['input:focus-visible', 'select:focus-visible', 'textarea:focus-visible']) {
      expect(declOf(rules, field), field).toEqual(base)
    }
    // Surfaces claires dans les deux thèmes : la zone du diagramme prend l'encre
    // de la visualisation, la feuille imprimable un anneau fixe, lisible sur son papier.
    expect(declOf(rules, '.diagram-zone')['--focus']).toBe('var(--viz-ink)')
    const sheet = cartoRules.find((r) => r.media === null && r.selector === '.carto-print-sheet').decl
    for (const paper of [sheet['--paper'], sheet['--card'], sheet['--surface-2']]) {
      expect(contrast(sheet['--focus'], paper), `${sheet['--focus']} sur ${paper}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('UC-VIS-07-U11 — commandes : la bordure de chaque champ (input, select, textarea, visé par sa balise ou par une classe que le JSX lui pose) est --line-strong, ou la couleur d’état d’un champ invalide, ou, posé sur la surface claire de la visualisation (lecteur de timeline), son encre douce ; jamais le filet décoratif --line ni un mélange ; elle atteint 3:1 sur le fond, la carte et la surface secondaire (la surface de la visualisation pour le lecteur) dans les neuf contextes (RG4)', () => {
    const rules = globalCssRules()
    const FIELD = /(^|[\s>+~(,])(input|select|textarea)(?![\w-])|\.[\w-]*-(input|textarea)(?![\w-])/
    // Les classes que le JSX pose sur un champ : une règle qui ne vise le
    // champ que par elle (.timeline-speed, .epi-comp-desc) est aussi lue.
    const classes = [...jsxClasses(/^(input|select|textarea)$/).keys()]
    expect(classes).toContain('timeline-speed')
    const BY_CLASS = new RegExp(`\\.(${classes.join('|')})(?![\\w-])`)
    const failures = []
    let fields = 0
    const deliberate = []
    const onViz = []
    for (const sheet of SITE_SHEETS) {
      for (const rule of sheetRules(sheet)) {
        if (rule.media?.includes('print') || !(FIELD.test(rule.selector) || BY_CLASS.test(rule.selector))) continue
        if ('clip' in rule.decl || 'clip-path' in rule.decl) continue // masqué à l'écran (champ de fichier sous son libellé)
        for (const prop of ['border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left']) {
          const value = rule.decl[prop]
          if (value === undefined) continue
          const where = `${sheet} ${rule.selector} : ${prop} ${value}`
          if (/^(0|none)$/.test(value) || (!/color-mix\(/.test(value) && /\btransparent\b/.test(value))) {
            deliberate.push(where) // champ sans cadre à dessein (éditeur plein cadre, titre éditable au repos)
            continue
          }
          fields++
          const color = colorIn(value)
          const invalid = /aria-invalid|:invalid/.test(rule.selector) && color === 'var(--danger)'
          // Le lecteur de timeline vit sur la surface claire de la visualisation (timeline.css).
          const viz = sheet === 'src/styles/timeline.css' && color === 'var(--viz-ink-soft)'
          if (viz) onViz.push(where)
          if (/color-mix\(/.test(value) || (color !== 'var(--line-strong)' && !invalid && !viz)) failures.push(where)
        }
      }
    }
    expect(failures).toEqual([])
    expect(fields).toBeGreaterThanOrEqual(37) // 36 au lot S9-3, 39 aux correctifs du sprint 9
    expect(deliberate.length).toBeLessThanOrEqual(2) // l'éditeur du portfolio, le titre éditable de la cartographie
    expect(onViz).toHaveLength(1) // la liste « Vitesse de lecture » du lecteur
    for (const theme of THEMES) {
      const [ink, surface] = ['var(--viz-ink-soft)', 'var(--viz-surface)'].map((v) => resolveColor(rules, v, theme))
      expect(contrast(ink, surface), `${theme.name} : --viz-ink-soft sur --viz-surface`).toBeGreaterThanOrEqual(3)
    }
    for (const theme of THEMES) {
      for (const [border, surfaces] of [
        ['--line-strong', ['--paper', '--card', '--surface-2']],
        ['--danger', ['--paper', '--card']],
      ]) {
        const line = resolveColor(rules, `var(${border})`, theme)
        for (const surface of surfaces) {
          const under = resolveColor(rules, `var(${surface})`, theme)
          expect(contrast(line, under), `${theme.name} : ${border} ${line} sur ${surface} ${under}`).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('UC-VIS-07-U12 — zone du diagramme (soleil, heatmap, lecteur de timeline), claire dans les deux thèmes : chaque couleur d’interface qu’une règle y trace (texte, trait, remplissage, filet, anneau) atteint 4,5:1 pour un texte, 3:1 sinon, sur --viz-surface dans les neuf contextes ; un mélange (color-mix) n’y lit que les encres de la visualisation (RG4, RG7)', () => {
    const rules = globalCssRules()
    // Les jetons que la zone pose sur ses descendants (--focus = l'encre de la visualisation).
    const zone = Object.fromEntries(Object.entries(declOf(rules, '.diagram-zone')).filter(([prop]) => prop.startsWith('--')))
    const INSIDE = /(^|\s)\.(sunburst|heatmap|timeline-|hover-overlay|diagram-placeholder)/
    const PROPS = ['color', 'fill', 'stroke', 'outline', 'outline-color', 'background', 'background-color', 'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'box-shadow', 'accent-color']
    const failures = []
    let traced = 0
    for (const sheet of ['src/styles/global.css', 'src/styles/timeline.css']) {
      for (const rule of sheetRules(sheet)) {
        if (rule.media?.includes('print')) continue
        const parts = rule.selector.split(',').map((p) => p.trim())
        if (!parts.some((part) => INSIDE.test(part))) continue
        for (const prop of PROPS) {
          const value = rule.decl[prop]
          if (value === undefined) continue
          const where = `${sheet} ${rule.selector} : ${prop} ${value}`
          const vars = [...value.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1])
          if (vars.length === 0 || ELEMENT_VARS.test(value)) continue // littéral (liseré blanc entre secteurs), données
          const color = colorIn(value)
          if (/color-mix\(/.test(value) || !SINGLE_COLOR.test(color ?? '')) {
            const foreign = vars.filter((name) => !name.startsWith('viz-'))
            if (foreign.length) failures.push(`${where} : mélange d'un jeton d'interface (${foreign.join(', ')})`)
            continue
          }
          if (color === 'var(--viz-surface)') continue // la surface elle-même (fond d'une commande du lecteur)
          traced++
          const min = prop === 'color' ? 4.5 : 3
          for (const theme of THEMES) {
            const [ink, surface] = [color, 'var(--viz-surface)'].map((v) => resolveColor(rules, v, theme, zone))
            if (!HEX.test(ink) || !HEX.test(surface)) failures.push(`${where}, ${theme.name} : non mesurable ${ink} / ${surface}`)
            else if (!(contrast(ink, surface) >= min))
              failures.push(`${where}, ${theme.name} : ${ink} sur --viz-surface ${surface} = ${contrast(ink, surface).toFixed(2)} < ${min}`)
          }
        }
      }
    }
    expect(failures).toEqual([])
    expect(traced).toBeGreaterThanOrEqual(14) // textes, liserés, filets et anneaux (16 aux correctifs du sprint 9)
  })
})

describe('UC-VIS-07 — le sélecteur (DisplaySelects)', () => {
  it('UC-VIS-07-U07 — deux listes nommées « Interface » (les trois filières, dans l’ordre) et « Thème » (Système, Clair, Sombre), au choix du contexte ; changer de valeur appelle le réglage, rien d’autre (étapes 2 à 4)', () => {
    const display = {
      interfaceName: 'technomancien',
      setInterface: vi.fn(),
      themeChoice: 'system',
      setThemeChoice: vi.fn(),
    }
    render(
      <DisplayContext.Provider value={display}>
        <DisplaySelects idPrefix="essai" hint="précision" />
      </DisplayContext.Provider>,
    )
    const iface = screen.getByRole('combobox', { name: 'Interface' })
    const theme = screen.getByRole('combobox', { name: 'Thème' })
    expect([...iface.options].map((o) => [o.value, o.textContent])).toEqual([
      ['epistemiarque', 'Épistémiarque'],
      ['noesiologue', 'Noèsiologue'],
      ['technomancien', 'Technomancien'],
    ])
    expect([...theme.options].map((o) => [o.value, o.textContent])).toEqual([
      ['system', 'Système'],
      ['light', 'Clair'],
      ['dark', 'Sombre'],
    ])
    expect(iface.value).toBe('technomancien')
    expect(theme.value).toBe('system')
    expect(iface.getAttribute('aria-describedby')).toBe('essai-display-hint')
    expect(document.getElementById('essai-display-hint').textContent).toBe('précision')
    expect(screen.queryByRole('group')).toBeNull()

    fireEvent.change(iface, { target: { value: 'noesiologue' } })
    expect(display.setInterface).toHaveBeenCalledWith('noesiologue')
    fireEvent.change(theme, { target: { value: 'dark' } })
    expect(display.setThemeChoice).toHaveBeenCalledWith('dark')
    expect(display.setInterface).toHaveBeenCalledTimes(1)
    expect(localStorage.length).toBe(0)

    // Dans la ligne « Affichage » de #/compte, le dd coupe partout (overflow-wrap:
    // anywhere, pour les longues adresses) : l'intitulé ne se coupe jamais au milieu
    // du mot (« Interfac / e » à 375 px, vu sur les captures du lot S9-3).
    expect(declOf(globalCssRules(), '.display-select-label')['overflow-wrap']).toBe('normal')
  })
})
