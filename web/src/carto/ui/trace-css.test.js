// S3-3 — le surlignage des traces de la stigmergie de Twin9 (carto.css) garde
// le signal « partiel » : un seul bout du passage retrouvé à cet endroit se lit
// en orange et souligné en pointillé, quelle que soit la nature de la trace
// (les légendes du lecteur de portfolio le disent ainsi). La cascade est
// calculée ici sur la feuille de style elle-même, règle par règle (sélecteurs
// de classes, `:not()` compris, spécificité puis ordre) : jsdom ne calcule pas
// la spécificité de `:not()`.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { traceClass } from './highlight-dom.js'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'carto.css'), 'utf8')

/** Les règles de premier niveau (hors @media) : sélecteurs et déclarations, dans l'ordre. */
function regles(source) {
  const texte = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let i = 0
  while (i < texte.length) {
    const ouvre = texte.indexOf('{', i)
    if (ouvre < 0) break
    const tete = texte.slice(i, ouvre).trim()
    // le bloc, accolades imbriquées comprises (@media)
    let profondeur = 1
    let j = ouvre + 1
    while (j < texte.length && profondeur > 0) {
      if (texte[j] === '{') profondeur++
      else if (texte[j] === '}') profondeur--
      j++
    }
    if (!tete.startsWith('@')) {
      const declarations = new Map()
      for (const d of texte.slice(ouvre + 1, j - 1).split(';')) {
        const k = d.indexOf(':')
        if (k > 0) declarations.set(d.slice(0, k).trim(), d.slice(k + 1).trim())
      }
      out.push({ selecteurs: tete.split(',').map((s) => s.trim()), declarations })
    }
    i = j
  }
  return out
}

/** Un sélecteur composé de classes (`.a.b:not(.c)`) : ses classes requises, exclues, sa spécificité ; null sinon. */
function compose(selecteur) {
  if (!/^(?:\.[\w-]+|:not\(\.[\w-]+\))+$/.test(selecteur)) return null
  const requises = [...selecteur.replace(/:not\(\.[\w-]+\)/g, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1])
  const exclues = [...selecteur.matchAll(/:not\(\.([\w-]+)\)/g)].map((m) => m[1])
  return { requises, exclues, specificite: requises.length + exclues.length }
}

const REGLES = regles(css)

/** La valeur d'une propriété pour une marque de ces classes : la règle de plus haute spécificité, puis la dernière. */
function style(classes, propriete) {
  const ensemble = new Set(classes.split(/\s+/).filter(Boolean))
  let gagnante = null
  REGLES.forEach((r, ordre) => {
    if (!r.declarations.has(propriete)) return
    for (const s of r.selecteurs) {
      const c = compose(s)
      if (!c || !c.requises.every((x) => ensemble.has(x)) || c.exclues.some((x) => ensemble.has(x))) continue
      if (!gagnante || c.specificite > gagnante.specificite || (c.specificite === gagnante.specificite && ordre >= gagnante.ordre)) {
        gagnante = { specificite: c.specificite, ordre, valeur: r.declarations.get(propriete) }
      }
    }
  })
  return gagnante?.valeur ?? null
}

/** Les classes d'une marque, comme wrapRanges les pose (highlight-dom.js). */
const marque = (etat, incertitude) => `carto-hl carto-hl--${etat}${traceClass(incertitude)}`

/** La teinte (en degrés) d'une couleur « #rrggbb ». */
function teinte(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const NATURES = ['faible', 'moyenne', 'forte', 'écartée']
const ORANGE = /--carto-hl-partial:\s*(#[0-9a-f]{6})/i.exec(css)[1]

describe('le surlignage des traces de la stigmergie (carto.css, S3-3)', () => {
  it('un bout seul d’une trace reste orange et souligné en pointillé, quelle que soit sa nature', () => {
    expect(style(marque('partial'), 'background')).toBe('var(--carto-hl-partial)')
    for (const n of NATURES) {
      expect(style(marque('partial', n), 'background'), n).toBe('var(--carto-hl-partial)')
      expect(style(marque('partial', n), 'text-decoration'), n).toMatch(/underline/)
      expect(style(marque('partial', n), 'text-decoration'), n).toMatch(/dotted/)
    }
    // « écartée » garde aussi son trait barré
    expect(style(marque('partial', 'écartée'), 'text-decoration')).toMatch(/line-through/)
    // le trait propre à chaque nature reste, sous le pointillé du partiel
    for (const n of ['faible', 'moyenne', 'forte']) expect(style(marque('partial', n), 'border-bottom'), n).toMatch(/^2px /)
  })

  it('un passage retrouvé en entier prend la couleur de sa nature ; approché, le cadre sans fond', () => {
    const fonds = NATURES.map((n) => style(marque('complete', n), 'background'))
    for (const f of fonds) expect(f).toMatch(/^#[0-9a-f]{6}$/i)
    expect(new Set(fonds).size).toBe(4)
    expect(style(marque('complete', 'écartée'), 'text-decoration')).toMatch(/line-through/)
    for (const n of NATURES) expect(style(marque('approx', n), 'background'), n).toBe('transparent')
  })

  it('aucune nature ne se confond avec l’orange du partiel : sa teinte s’en écarte d’au moins 15°, comme le jaune du surlignage', () => {
    const ecart = (a, b) => Math.min(Math.abs(teinte(a) - teinte(b)), 360 - Math.abs(teinte(a) - teinte(b)))
    for (const n of ['faible', 'moyenne', 'forte']) {
      const fond = style(marque('complete', n), 'background')
      expect(ecart(fond, ORANGE), `${n} : ${fond}`).toBeGreaterThanOrEqual(15)
    }
    // le gris de « écartée » n'a pas de teinte à confondre ; il n'est pas l'orange
    expect(style(marque('complete', 'écartée'), 'background').toLowerCase()).not.toBe(ORANGE.toLowerCase())
  })
})
