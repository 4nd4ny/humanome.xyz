// Catalogue des cas d'utilisation (docs/cas-utilisation/README.md, « Identifiants
// de tests ») : un identifiant UC-…-Unn / UC-…-Fnn nomme UN test et UNE ligne
// de fiche ; un test paramétré (`it.each`) compte pour un. Deux lots menés en
// parallèle ont déjà donné le même numéro à deux tests différents
// (UC-APP-09-F31, A4 et E5, 2026-10-22), et des lots ont réparti un même
// identifiant sur plusieurs `it(…)` : la fiche ne les distinguait plus, et les
// comptes du README ne voyaient qu'un test.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const FICHES = join(ROOT, 'docs/cas-utilisation')

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

/** Les dossiers où vivent les tests, et ce qui en est un. */
const TEST_DIRS = ['web/src', 'web/test', 'web/e2e', 'engine/src', 'engine/test', 'api/tests']
const TEST_FILE = /(\.(test|spec)\.(js|jsx|mjs|ts)|\.e2e\.js|Test\.php)$/
const SKIP_DIR = new Set(['node_modules', 'vendor', 'dist', 'coverage'])

function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) testFiles(join(dir, entry.name), out)
    } else if (TEST_FILE.test(entry.name)) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/**
 * Les déclarations de tests qui portent un identifiant en tête de libellé :
 * `it('UC-…')`, `test('UC-…')` (et leurs `.skip`, `.only`…), l'appel qui suit
 * un `it.each([…])('UC-…')`, et l'attribut PHP `#[TestDox('UC-…')]`. Un
 * identifiant seulement cité (commentaire, renvoi dans un autre libellé)
 * n'est pas une déclaration. [identifiant, fichier:ligne].
 */
const DECLARATION =
  /(?:\b(?:it|test)(?:\.(?:skip|only|todo|concurrent|fails))*\s*\(|\)\s*\(|\bTestDox\()\s*['"`](UC-[A-Z]+-\d+-[UF]\d+)\b/g

function declarations() {
  const out = []
  for (const dir of TEST_DIRS) {
    for (const file of testFiles(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(DECLARATION)) {
        const line = text.slice(0, m.index).split('\n').length
        out.push([m[1], `${relative(ROOT, file)}:${line}`])
      }
    }
  }
  return out
}

/** Les identifiants vus plus d'une fois, avec leurs emplacements. */
function twice(pairs) {
  const seen = new Map()
  for (const [id, where] of pairs) seen.set(id, [...(seen.get(id) ?? []), where])
  return Object.fromEntries([...seen].filter(([, where]) => where.length > 1))
}

describe('catalogue des cas d’utilisation', () => {
  it('les fiches listent leurs tests, les fichiers de tests les déclarent', () => {
    expect(fiches().length).toBeGreaterThanOrEqual(61)
    expect(rows().length).toBeGreaterThan(2000)
    expect(declarations().length).toBeGreaterThan(2000)
  })

  it('un identifiant de test ne nomme qu’une ligne de fiche', () => {
    expect(twice(rows())).toEqual({})
  })

  it('un identifiant de test n’est déclaré que par un test, dans un seul fichier (un it.each compte pour un)', () => {
    expect(twice(declarations())).toEqual({})
  })

  it('le relevé des déclarations voit chaque forme : it, test, it.each(…)(…), TestDox, sur plusieurs lignes', () => {
    // Un cas fictif, « UC-AAA-01 », assemblé ici pour que ce fichier n'en déclare aucun.
    const uc = (n) => `UC-AAA-01-${n}`
    const sample = [
      `it('${uc('U01')} — a', () => {})`,
      `it.skip(\n  '${uc('U02')} — b', () => {})`,
      `it.each([\n  [1],\n])('${uc('U03')} — %s', () => {})`,
      `test(\`${uc('F01')} — c\`, () => {})`,
      `#[TestDox('${uc('F02')} — d')]`,
      `// renvoi : ${uc('U09')}, it('voir ${uc('U08')}')`,
    ].join('\n')
    expect([...sample.matchAll(DECLARATION)].map((m) => m[1])).toEqual(['U01', 'U02', 'U03', 'F01', 'F02'].map(uc))
  })
})
