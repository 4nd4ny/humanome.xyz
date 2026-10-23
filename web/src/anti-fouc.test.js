// Traçabilité — exigence « refonte ergonomie/navigation », point 9 (thème
// sombre, anti-FOUC), et sprint 9 (trois interfaces) : web/index.html
// embarque un <script> inline qui pose data-interface (toujours) et
// data-theme (si un choix est stocké) depuis localStorage AVANT le premier
// paint (avant le bundle). Il partage les clés 'humanome-theme' et
// 'humanome-interface', et la liste des interfaces, avec lib/theme.js : une
// divergence de clé ou de liste, la suppression du script au refactor du
// <head>, ou une valeur non filtrée casseraient silencieusement le premier
// paint. Ce test lit le HTML réel et EXÉCUTE le script inline contre des
// doublures.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INTERFACE, INTERFACES, INTERFACE_KEY, THEME_KEY } from './lib/theme.js'

// vitest s'exécute depuis web/ (racine du projet front) ; import.meta.url est
// réécrit par vite en jsdom, on résout donc depuis le cwd.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const themeSource = readFileSync(resolve(process.cwd(), 'src/lib/theme.js'), 'utf8')

/** Corps du premier <script> inline (sans attribut src) du document. */
function inlineScript() {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  return match?.[1] ?? ''
}

/** Jeton CSP du script en ligne, tel que la CSP doit l'autoriser. */
function scriptToken() {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  expect(inline, 'un seul script en ligne : chacun exige son hash dans la CSP').toHaveLength(1)
  return `'sha256-${createHash('sha256').update(inline[0][1], 'utf8').digest('base64')}'`
}

/**
 * Exécute le script anti-FOUC avec un localStorage et un document factices.
 * Le stockage répond CLÉ PAR CLÉ (`stored` : {clé: valeur}) : un stockage
 * qui rendrait la même valeur pour toute clé masquerait une clé confondue.
 * @returns {Record<string, string>} les attributs posés sur <html>
 */
function runInlineScript(stored = {}, { getItemThrows = false } = {}) {
  const attributes = {}
  const setAttribute = vi.fn((name, value) => {
    attributes[name] = value
  })
  const fakeLocalStorage = {
    getItem: (key) => {
      if (getItemThrows) throw new Error('stockage indisponible')
      return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null
    },
  }
  const fakeDocument = { documentElement: { setAttribute } }
  // Les identifiants globaux du script sont capturés par les paramètres.
  new Function('localStorage', 'document', inlineScript())(fakeLocalStorage, fakeDocument)
  return attributes
}

describe('index.html — script anti-FOUC', () => {
  it('est présent AVANT le module principal (premier paint) et lit les clés humanome-theme et humanome-interface', () => {
    expect(inlineScript()).not.toBe('')
    expect(inlineScript()).toContain('humanome-theme')
    expect(inlineScript()).toContain('humanome-interface')
    const scriptIndex = html.indexOf('<script>')
    const moduleIndex = html.indexOf('src="/src/main.jsx"')
    expect(scriptIndex).toBeGreaterThan(-1)
    expect(moduleIndex).toBeGreaterThan(-1)
    expect(scriptIndex).toBeLessThan(moduleIndex)
  })

  it('utilise les MÊMES clés localStorage que lib/theme.js (STORAGE_KEY, INTERFACE_STORAGE_KEY)', () => {
    const themeKey = themeSource.match(/const STORAGE_KEY = '([^']+)'/)
    const interfaceKey = themeSource.match(/const INTERFACE_STORAGE_KEY = '([^']+)'/)
    expect(themeKey).not.toBeNull()
    expect(interfaceKey).not.toBeNull()
    expect([themeKey[1], interfaceKey[1]]).toEqual([THEME_KEY, INTERFACE_KEY])
    expect(inlineScript()).toContain(`'${THEME_KEY}'`)
    expect(inlineScript()).toContain(`'${INTERFACE_KEY}'`)
  })

  it('déclare la double palette au navigateur (meta color-scheme light dark)', () => {
    expect(html).toMatch(/<meta name="color-scheme" content="light dark"\s*\/?>/)
  })

  it("choix stocké 'dark' ou 'light' -> data-theme posé avant le premier paint", () => {
    expect(runInlineScript({ [THEME_KEY]: 'dark' })['data-theme']).toBe('dark')
    expect(runInlineScript({ [THEME_KEY]: 'light' })['data-theme']).toBe('light')
  })

  it('thème inconnu ou absent -> pas de data-theme (le suivi du système est préservé)', () => {
    expect(runInlineScript({ [THEME_KEY]: 'bleu-canard' })).not.toHaveProperty('data-theme')
    expect(runInlineScript({})).not.toHaveProperty('data-theme')
  })

  it('accepte EXACTEMENT les interfaces de lib/theme.js : chacune stockée est posée telle quelle', () => {
    for (const name of INTERFACES) {
      expect(runInlineScript({ [INTERFACE_KEY]: name })['data-interface'], name).toBe(name)
    }
    // La liste du script est celle de lib/theme.js, dans le même ordre (son
    // premier élément est le défaut).
    const list = inlineScript().match(/var I = \[([^\]]*)\]/)
    expect(list).not.toBeNull()
    expect(list[1].split(',').map((item) => item.trim().replace(/^'|'$/g, ''))).toEqual([...INTERFACES])
  })

  it('interface absente ou inconnue -> le défaut (épistémiarque) est posé, toujours', () => {
    expect(DEFAULT_INTERFACE).toBe('epistemiarque')
    expect(runInlineScript({})['data-interface']).toBe(DEFAULT_INTERFACE)
    for (const unknown of ['bleu-canard', 'Noesiologue', 'technomacien', '', 'dark']) {
      expect(runInlineScript({ [INTERFACE_KEY]: unknown })['data-interface'], unknown).toBe(DEFAULT_INTERFACE)
    }
  })

  it('interface et thème sont indépendants : chacun lit sa clé', () => {
    expect(runInlineScript({ [INTERFACE_KEY]: 'technomancien', [THEME_KEY]: 'dark' })).toEqual({
      'data-interface': 'technomancien',
      'data-theme': 'dark',
    })
    // Une valeur de thème rangée sous la clé d'interface n'est pas un thème.
    expect(runInlineScript({ [INTERFACE_KEY]: 'dark' })).toEqual({ 'data-interface': DEFAULT_INTERFACE })
  })

  it('la CSP de production autorise ce script par son hash (sinon il est refusé en ligne et le thème arrive avec le bundle)', () => {
    // Journal carto, question 30 : refusé par la CSP de web/public/.htaccess
    // depuis qu'elle existe, sans qu'aucun test ne le voie (ni vitest ni le
    // dev-server n'appliquent cette CSP). Vite recopie ce script tel quel dans
    // dist/index.html : le hash de la source est celui servi en ligne.
    const token = scriptToken()
    const htaccess = readFileSync(resolve(process.cwd(), 'public/.htaccess'), 'utf8')
    const csp = htaccess.match(/Header always set Content-Security-Policy\s+"([^"]+)"/)?.[1] ?? ''
    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? ''
    expect(
      scriptSrc.split(/\s+/).includes(token),
      `Le script anti-FOUC a changé : remplacez son hash dans script-src (web/public/.htaccess) et dans docs/securite-checklist.md par ${token}.`,
    ).toBe(true)
  })

  it('la checklist de sécurité et le commentaire du .htaccess citent le hash en vigueur', () => {
    const token = scriptToken()
    const checklist = readFileSync(resolve(process.cwd(), '../docs/securite-checklist.md'), 'utf8')
    expect(checklist, `docs/securite-checklist.md doit citer ${token}`).toContain(token)
    const htaccess = readFileSync(resolve(process.cwd(), 'public/.htaccess'), 'utf8')
    const comments = htaccess
      .split('\n')
      .filter((line) => line.trim().startsWith('#'))
      .join('\n')
    expect(comments, `le commentaire de la CSP (web/public/.htaccess) doit citer ${token}`).toContain(token)
  })

  it('localStorage qui jette (mode privé) -> pas de crash : le défaut est posé, pas de thème', () => {
    let attributes
    expect(() => {
      attributes = runInlineScript({}, { getItemThrows: true })
    }).not.toThrow()
    expect(attributes).toEqual({ 'data-interface': DEFAULT_INTERFACE })
  })
})
