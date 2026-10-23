// Catalogue des cas d'utilisation (docs/cas-utilisation/README.md, « Identifiants
// de tests ») : un identifiant UC-…-Unn / UC-…-Fnn nomme UNE ligne de fiche.
// Deux lots menés en parallèle ont déjà donné le même numéro à deux tests
// différents (UC-APP-09-F31, A4 et E5, 2026-10-22) : la fiche les listait sur
// deux lignes, et les comptes du README ne voyaient qu'un test. Une ligne peut
// couvrir plusieurs `it(…)` d'un même fichier (une famille, sa colonne
// « Vérifie » les dit tous) ; deux lignes ne partagent jamais un identifiant.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FICHES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/cas-utilisation')

/** Les fiches : un fichier `UC-*.md` par cas, rangé par acteur. */
function fiches() {
  const out = []
  for (const actor of readdirSync(FICHES, { withFileTypes: true })) {
    if (!actor.isDirectory()) continue
    for (const name of readdirSync(join(FICHES, actor.name))) {
      if (/^UC-.*\.md$/.test(name)) out.push(join(actor.name, name))
    }
  }
  return out.sort()
}

/** Les lignes de tableau dont la première cellule est un identifiant de test : [identifiant, fiche:ligne]. */
function rows() {
  const out = []
  for (const fiche of fiches()) {
    readFileSync(join(FICHES, fiche), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const m = /^\|\s*(UC-[A-Z]+-\d+-[UF]\d+)\s*\|/.exec(line)
        if (m) out.push([m[1], `${fiche}:${i + 1}`])
      })
  }
  return out
}

describe('catalogue des cas d’utilisation', () => {
  it('les fiches listent leurs tests', () => {
    expect(fiches().length).toBeGreaterThanOrEqual(61)
    expect(rows().length).toBeGreaterThan(2000)
  })

  it('un identifiant de test ne nomme qu’une ligne de fiche', () => {
    const seen = new Map()
    for (const [id, where] of rows()) seen.set(id, [...(seen.get(id) ?? []), where])
    const twice = Object.fromEntries([...seen].filter(([, where]) => where.length > 1))
    expect(twice).toEqual({})
  })
})
