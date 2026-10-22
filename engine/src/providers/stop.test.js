import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  classifyStop,
  isOutputTruncated,
  isTruncatedResult,
  throwIfTruncated,
  truncationError,
  STOP_CLASSES,
  STOP_TABLES
} from './stop.js'
import { OutputTruncatedError, ProviderError } from './errors.js'

// La table partagée JS/PHP (schemas/fixtures/arrets/) : seules les valeurs
// vérifiées sur les documentations officielles y figurent.
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../schemas/fixtures/arrets/arrets-fournisseurs.json', import.meta.url), 'utf8')
)

describe('classifyStop — table partagée schemas/fixtures/arrets/arrets-fournisseurs.json', () => {
  it('les classes de la fixture sont celles du code (null en plus)', () => {
    expect(FIXTURE.classes).toEqual([...STOP_CLASSES, null])
  })

  it.each(FIXTURE.arrets)('$format « $brut » → $classe', ({ format, brut, classe }) => {
    expect(classifyStop(format, brut)).toEqual({
      stopReason: classe,
      stopReasonRaw: brut,
      truncated: classe === 'max_tokens' || classe === 'context_window'
    })
  })

  it.each(FIXTURE.cas_limites)('cas limite : $format « $brut » → $classe', ({ format, brut, classe }) => {
    const result = classifyStop(format, brut)
    expect(result.stopReason).toBe(classe)
    expect(result.stopReasonRaw).toBe(brut === '' ? null : brut)
  })

  it('le code ne contient AUCUNE valeur absente de la fixture, et réciproquement', () => {
    const fromCode = Object.entries(STOP_TABLES)
      .flatMap(([format, table]) => Object.entries(table).map(([brut, classe]) => `${format}|${brut}|${classe}`))
      .sort()
    const fromFixture = FIXTURE.arrets.map(({ format, brut, classe }) => `${format}|${brut}|${classe}`).sort()
    expect(fromCode).toEqual(fromFixture)
  })

  it('une ligne par couple (format, brut) dans la fixture', () => {
    const keys = FIXTURE.arrets.map(({ format, brut }) => `${format}|${brut}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('Ollama : aucune valeur vérifiée, tout arrêt vaut other', () => {
    expect(STOP_TABLES.ollama).toEqual({})
    expect(FIXTURE.arrets.some((row) => row.format === 'ollama')).toBe(false)
  })
})

describe('classifyStop — règles', () => {
  it('idempotente sur les classes, quel que soit le format', () => {
    for (const format of [...Object.keys(STOP_TABLES), 'mock', 'inconnu']) {
      for (const classe of STOP_CLASSES) {
        expect(classifyStop(format, classe).stopReason).toBe(classe)
      }
    }
  })

  it('absente (undefined, null, chaîne vide) → null, non tronquée', () => {
    for (const raw of [undefined, null, '']) {
      expect(classifyStop('anthropic', raw)).toEqual({ stopReason: null, stopReasonRaw: null, truncated: false })
    }
  })

  it('valeur brute assainie : seul un identifiant court est gardé, le reste vaut other', () => {
    for (const raw of ['fin de réponse', 'x'.repeat(33), 'end-turn', 42, { a: 1 }, ['stop']]) {
      expect(classifyStop('anthropic', raw)).toEqual({ stopReason: 'other', stopReasonRaw: 'other', truncated: false })
    }
    expect(classifyStop('anthropic', 'x'.repeat(32)).stopReasonRaw).toBe('x'.repeat(32))
  })

  it('les clés héritées d’Object ne sont ni des formats ni des valeurs', () => {
    expect(classifyStop('anthropic', 'constructor').stopReason).toBe('other')
    expect(classifyStop('constructor', 'toString').stopReason).toBe('other')
    expect(classifyStop('__proto__', 'end').stopReason).toBe('end')
  })

  it('extra.refusal l’emporte sur la valeur brute (OpenAI message.refusal, Gemini blockReason)', () => {
    expect(classifyStop('openai', 'stop', { refusal: true })).toEqual({
      stopReason: 'refusal',
      stopReasonRaw: 'stop',
      truncated: false
    })
    expect(classifyStop('google', 'BLOCK_REASON_UNSPECIFIED', { refusal: true }).stopReason).toBe('refusal')
    expect(classifyStop('openai', null, { refusal: true })).toEqual({
      stopReason: 'refusal',
      stopReasonRaw: null,
      truncated: false
    })
  })

  it('tronquée ⇔ max_tokens ou context_window', () => {
    expect(classifyStop('anthropic', 'max_tokens').truncated).toBe(true)
    expect(classifyStop('anthropic', 'model_context_window_exceeded').truncated).toBe(true)
    expect(classifyStop('mistral', 'model_length').truncated).toBe(true)
    expect(classifyStop('anthropic', 'refusal').truncated).toBe(false)
    expect(classifyStop('anthropic', 'pause_turn').truncated).toBe(false)
  })
})

describe('OutputTruncatedError et ses aides', () => {
  const cut = {
    text: '{"secret": "contenu du portfolio',
    usage: { inputTokens: 10, outputTokens: 500 },
    model: 'claude-x',
    stopReason: 'max_tokens',
    stopReasonRaw: 'max_tokens',
    truncated: true
  }

  it('throwIfTruncated : lève hors allowTruncated, rend le résultat sinon', () => {
    expect(() => throwIfTruncated(cut, { provider: 'anthropic', maxTokens: 500 })).toThrow(OutputTruncatedError)
    expect(throwIfTruncated(cut, { provider: 'anthropic', allowTruncated: true })).toBe(cut)
    const ok = { ...cut, truncated: false, stopReason: 'end' }
    expect(throwIfTruncated(ok, { provider: 'anthropic' })).toBe(ok)
  })

  it('l’erreur : statut 200, non relançable, usage, fragment non énumérable, message sans contenu', () => {
    const err = truncationError(cut, { provider: 'anthropic', maxTokens: 500 })
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({
      name: 'OutputTruncatedError',
      code: 'sortie_tronquee',
      status: 200,
      retryable: false,
      provider: 'anthropic',
      model: 'claude-x',
      stopReason: 'max_tokens',
      stopReasonRaw: 'max_tokens',
      limit: 'sortie',
      usage: { inputTokens: 10, outputTokens: 500 },
      maxTokens: 500,
      textLength: cut.text.length
    })
    expect(err.message).toBe('réponse tronquée : budget de sortie atteint (max_tokens = 500) — anthropic/claude-x')
    expect(err.fragment).toBe(cut.text)
    expect(Object.keys(err)).not.toContain('fragment')
    expect(JSON.stringify(err)).not.toContain('secret')
    // `cause` reste la chaîne standard des erreurs, jamais la limite atteinte.
    expect(err.cause).toBeUndefined()
  })

  it('isOutputTruncated : la classe ou le code ; isTruncatedResult : truncated, ou stopReason d’un fournisseur injecté', () => {
    expect(isOutputTruncated(truncationError(cut))).toBe(true)
    expect(isOutputTruncated({ code: 'sortie_tronquee' })).toBe(true)
    expect(isOutputTruncated(new ProviderError('x'))).toBe(false)
    expect(isOutputTruncated(null)).toBe(false)
    expect(isTruncatedResult({ truncated: true })).toBe(true)
    expect(isTruncatedResult({ truncated: false, stopReason: 'max_tokens' })).toBe(false)
    expect(isTruncatedResult({ stopReason: 'max_tokens' })).toBe(true)
    expect(isTruncatedResult({ stopReason: 'context_window' })).toBe(true)
    expect(isTruncatedResult({ stopReason: 'end_turn' })).toBe(false)
  })
})
