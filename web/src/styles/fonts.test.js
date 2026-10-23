// Garde anti-régression des polices des trois interfaces (sprint 9 ; héritière
// de la garde D7 d'iA Writer Quattro). Vérifie l'auto-hébergement (aucune
// origine tierce, CSP font-src 'self'), chaque @font-face (fichier woff2
// présent et raisonnable, licence OFL de sa famille, font-display: swap,
// unicode-range), et les piles de chaque interface : même jeu de variables,
// familles déclarées, et aucune famille partagée entre deux interfaces (une
// interface ne télécharge que ses polices).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_INTERFACE, INTERFACES } from '../lib/theme.js'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '../..')
const css = readFileSync(join(here, 'global.css'), 'utf8')
const publicDir = join(web, 'public')

/** Familles de chaque interface (décision de Christian du 2026-10-23). */
const FAMILIES = {
  epistemiarque: ['Source Serif 4', 'Source Sans 3'],
  noesiologue: ['Fredoka', 'Nunito'],
  technomancien: ['Space Grotesk', 'JetBrains Mono'],
}

/** Variables typographiques que chaque interface déclare. */
const TYPE_VARS = [
  '--font-body',
  '--font-heading',
  '--font-mono',
  '--fw-strong',
  '--fw-heading',
  '--fs-xs',
  '--fs-sm',
  '--fs-base',
  '--fs-lg',
  '--fs-xl',
  '--fs-2xl',
  '--fs-3xl',
  '--lh-tight',
  '--lh-snug',
  '--lh-body',
  '--tracking-heading',
  '--tracking-body',
]

/** Déclarations d'un bloc CSS (texte entre accolades), commentaires ôtés. */
function declarations(body) {
  const out = {}
  for (const part of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

/** Les @font-face réels de global.css (pas les mentions en commentaire). */
function fontFaces() {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => declarations(m[1]))
}

const unquote = (name) => name.trim().replace(/^['"]|['"]$/g, '')

/** Familles nommées par une pile (« 'A', B, serif » → ['A', 'B', 'serif']). */
const stack = (value) => value.split(',').map(unquote)

/** Bloc typographique d'une interface : html pour le défaut, html[data-interface=…] sinon. */
function typeBlock(id) {
  const selector = id === DEFAULT_INTERFACE ? 'html' : `html[data-interface='${id}']`
  const escaped = selector.replace(/[[\]]/g, '\\$&')
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
  const typed = blocks.map((m) => declarations(m[1])).filter((d) => '--font-body' in d)
  expect(typed, selector).toHaveLength(1)
  return typed[0]
}

/** Fichiers d'un dossier, récursivement. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

describe('polices des trois interfaces (sprint 9)', () => {
  it('chaque @font-face pointe vers un woff2 auto-hébergé présent (≤ 60 Ko), avec font-display: swap et une unicode-range ; chaque dossier de famille a sa licence OFL', () => {
    const faces = fontFaces()
    expect(faces.length).toBe(18)
    const dirs = new Set()
    for (const face of faces) {
      const label = `${face['font-family']} ${face['font-style']} ${face['font-weight']}`
      expect(face['font-display'], label).toBe('swap')
      expect(face['unicode-range'], label).toMatch(/^U\+[0-9A-F]/)
      expect(face['font-style'], label).toMatch(/^(normal|italic)$/)
      expect(face['font-weight'], label).toMatch(/^\d{3,4}( \d{3,4})?$/)
      const src = /^url\('(\/fonts\/([a-z0-9-]+)\/[a-z0-9-]+\.woff2)'\) format\('woff2'\)$/.exec(face.src)
      expect(src, `${label} : ${face.src}`).not.toBeNull()
      const file = join(publicDir, src[1])
      expect(existsSync(file), `manquant : ${src[1]}`).toBe(true)
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), src[1]).toBe('wOF2')
      expect(statSync(file).size, src[1]).toBeLessThan(60 * 1024)
      dirs.add(src[2])
    }
    for (const dir of dirs) {
      const license = readFileSync(join(publicDir, 'fonts', dir, 'OFL.txt'), 'utf8')
      expect(license, dir).toContain('SIL Open Font License, Version 1.1')
    }
  })

  it('les familles déclarées sont exactement celles des trois interfaces, chacune en latin-ext puis latin (un fichier par sous-ensemble)', () => {
    const faces = fontFaces()
    const declared = new Set(faces.map((face) => unquote(face['font-family'])))
    expect([...declared].sort()).toEqual(Object.values(FAMILIES).flat().sort())
    // Chaque couple (famille, style, graisse) existe en latin-ext PUIS en
    // latin : les deux plages partagent des diacritiques combinants, et le
    // navigateur essaie d'abord la dernière face déclarée ; dans l'autre
    // ordre, latin-ext se téléchargerait sur une page en français.
    const variants = new Map()
    for (const face of faces) {
      const key = `${unquote(face['font-family'])}|${face['font-style']}|${face['font-weight']}`
      const subset = /-latin-ext-/.test(face.src) ? 'latin-ext' : /-latin-/.test(face.src) ? 'latin' : 'autre'
      variants.set(key, [...(variants.get(key) ?? []), subset])
    }
    for (const [key, subsets] of variants) expect(subsets, key).toEqual(['latin-ext', 'latin'])
  })

  it('chaque interface déclare le même jeu de variables typographiques ; ses piles commencent par ses familles et ne nomment AUCUNE famille d’une autre interface', () => {
    expect(Object.keys(FAMILIES)).toEqual(INTERFACES)
    const declared = new Set(fontFaces().map((face) => unquote(face['font-family'])))
    for (const id of INTERFACES) {
      const block = typeBlock(id)
      expect(Object.keys(block).sort(), id).toEqual([...TYPE_VARS].sort())
      const named = ['--font-body', '--font-heading', '--font-mono'].flatMap((v) => stack(block[v]))
      // Le corps et les titres commencent par une famille auto-hébergée.
      for (const v of ['--font-body', '--font-heading']) {
        const first = stack(block[v])[0]
        expect(declared.has(first), `${id} ${v} : ${first}`).toBe(true)
        expect(FAMILIES[id], `${id} ${v}`).toContain(first)
      }
      // Toutes les familles de l'interface servent, et aucune autre famille
      // auto-hébergée n'est nommée (même en repli) : rien d'une autre
      // interface ne se télécharge.
      for (const family of FAMILIES[id]) expect(named, `${id} n'emploie pas ${family}`).toContain(family)
      const foreign = named.filter((family) => declared.has(family) && !FAMILIES[id].includes(family))
      expect(foreign, id).toEqual([])
      expect(named.join(','), id).not.toMatch(/Quattro/)
    }
  })

  it('le corps, les titres, les commandes et le code lisent les piles de l’interface', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = (selector) => {
      const m = new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`).exec(bare)
      expect(m, selector).not.toBeNull()
      return declarations(m[1])
    }
    expect(rule('body')).toMatchObject({
      'font-family': 'var(--font-body)',
      'font-size': 'var(--fs-base)',
      'line-height': 'var(--lh-body)',
    })
    expect(rule('h1,\\s*h2,\\s*h3')).toMatchObject({
      'font-family': 'var(--font-heading)',
      'font-weight': 'var(--fw-heading)',
    })
    expect(rule('button,\\s*input,\\s*select,\\s*textarea')).toMatchObject({ 'font-family': 'inherit' })
    expect(rule('code,\\s*kbd,\\s*samp,\\s*pre')).toMatchObject({ 'font-family': 'var(--font-mono)' })
    // Aucune pile de chasse fixe écrite en dur : JetBrains Mono doit servir.
    for (const file of walk(join(web, 'src')).filter((f) => f.endsWith('.css'))) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const literal = source.split('\n').filter((line) => /font-family:\s*ui-monospace/.test(line))
      expect(literal, relative(web, file)).toEqual([])
    }
  })

  it('aucune origine tierce de police, ni préchargement (CSS du site, index.html, copie autonome)', () => {
    const sources = [
      ...walk(join(web, 'src')).filter((f) => f.endsWith('.css')),
      join(web, 'index.html'),
      join(web, 'carto-viewer.html'),
    ]
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      const name = relative(web, file)
      expect(text, name).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny|@import\s+url/i)
      expect(text, name).not.toMatch(/rel=["']?preload["']?[^>]*as=["']?font/i)
    }
    for (const face of fontFaces()) expect(face.src).not.toMatch(/https?:|\/\//)
  })
})
