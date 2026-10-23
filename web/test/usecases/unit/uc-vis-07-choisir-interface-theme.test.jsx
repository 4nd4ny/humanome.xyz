// UC-VIS-07 — Choisir son interface et son thème : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-07-choisir-interface-theme.md
//
// Code sollicité appelé directement : lecture, résolution et écriture de
// l'interface et du choix de thème (lib/theme.js), script anti-FOUC
// d'index.html (exécuté contre des doublures), jetons des trois interfaces
// dans global.css (lus par le CSSOM de jsdom : jeux de jetons, copies
// sombres, alias, couleurs de données, contrastes WCAG dans les neuf
// contextes) et les deux listes du sélecteur (DisplaySelects). jsdom
// n'applique pas les styles : rien n'est mesuré à l'écran.
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
import { THEMES, declOf, globalCssRules, resolveColor, tokensOf } from '../support/global-css.js'

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
    const sheets = [
      'src/styles/global.css',
      'src/styles/configuration.css',
      'src/styles/markdown.css',
      'src/styles/twin9.css',
      'src/styles/twin9-credit.css',
      'src/styles/timeline.css',
      'src/carto/ui/carto.css',
    ]
    const failures = []
    let onAccent = 0
    for (const sheet of sheets) {
      const source = readFileSync(resolve(here, '../../..', sheet), 'utf8')
      for (const rule of leafRules(source)) {
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

/**
 * Règles terminales d'une feuille (texte), avec leur @media éventuel :
 * commentaires ôtés, blocs imbriqués parcourus. Lecture du texte, sans CSSOM :
 * jsdom ne sait pas analyser color-mix().
 * @returns {Array<{media: string|null, selector: string, decl: Record<string, string>}>}
 */
function leafRules(source, media = null) {
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
  })
})
