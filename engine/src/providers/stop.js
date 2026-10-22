// humanome engine — providers: why a generation stopped, one vocabulary for
// every provider (P0-3, 2026-10-22). DOM-free ESM module (ADR-001).
//
// Each provider says in its own words why it stopped (Anthropic stop_reason,
// OpenAI-compatible finish_reason, Gemini finishReason, Ollama done_reason).
// The engine reads one class instead:
//
//   end             the model finished its answer
//   max_tokens      the output budget ran out: the text is a fragment
//   context_window  the model's context window is full: a fragment too
//   refusal         the provider or the model refused to answer
//   other           anything else, including a value nobody verified
//   null            no stop reason given
//
// 'max_tokens' keeps its name: the guards of the engine test it as is.
//
// The tables mirror schemas/fixtures/arrets/arrets-fournisseurs.json exactly
// (stop.test.js checks both ways): only the raw values checked on the
// providers' official documentation on 2026-10-22 are in them. Ollama has
// none, so every Ollama stop is 'other' until one is checked. The PHP side
// will read the same fixture.

import { OutputTruncatedError } from './errors.js'

/** The normalized stop classes (null aside). */
export const STOP_CLASSES = Object.freeze(['end', 'max_tokens', 'context_window', 'refusal', 'other'])

/** Provider id -> raw stop value -> class. The format is the provider id. */
export const STOP_TABLES = Object.freeze({
  anthropic: Object.freeze({
    end_turn: 'end',
    stop_sequence: 'end',
    // The demo and the credits force a tool (api/src/Llm/AnthropicProvider.php):
    // a tool call is their normal end.
    tool_use: 'end',
    max_tokens: 'max_tokens',
    model_context_window_exceeded: 'context_window',
    refusal: 'refusal',
    pause_turn: 'other'
  }),
  openai: Object.freeze({
    stop: 'end',
    length: 'max_tokens',
    content_filter: 'refusal',
    tool_calls: 'other',
    function_call: 'other'
  }),
  xai: Object.freeze({
    stop: 'end',
    end_turn: 'end',
    length: 'max_tokens'
  }),
  openrouter: Object.freeze({
    stop: 'end',
    length: 'max_tokens',
    content_filter: 'refusal',
    tool_calls: 'other',
    error: 'other'
  }),
  // No JS adapter yet (the browser path to Mistral is not verified): the row
  // is here for the PHP callers of the multi-provider work.
  mistral: Object.freeze({
    stop: 'end',
    length: 'max_tokens',
    model_length: 'context_window',
    tool_calls: 'other',
    error: 'other'
  }),
  google: Object.freeze({
    STOP: 'end',
    MAX_TOKENS: 'max_tokens',
    // A non-streamed answer stops at a per-request cap and asks to be
    // continued: the text is a fragment, as with MAX_TOKENS.
    CONTINUATION: 'max_tokens',
    SAFETY: 'refusal',
    RECITATION: 'refusal',
    BLOCKLIST: 'refusal',
    PROHIBITED_CONTENT: 'refusal',
    SPII: 'refusal',
    IMAGE_SAFETY: 'refusal',
    IMAGE_PROHIBITED_CONTENT: 'refusal',
    IMAGE_RECITATION: 'refusal',
    FINISH_REASON_UNSPECIFIED: 'other',
    LANGUAGE: 'other',
    OTHER: 'other',
    MALFORMED_FUNCTION_CALL: 'other',
    IMAGE_OTHER: 'other',
    NO_IMAGE: 'other',
    UNEXPECTED_TOOL_CALL: 'other',
    TOO_MANY_TOOL_CALLS: 'other',
    MISSING_THOUGHT_SIGNATURE: 'other',
    MALFORMED_RESPONSE: 'other',
    ESCALATION: 'other',
    PUP_LIMITED_DISABLED: 'other'
  }),
  ollama: Object.freeze({})
})

/**
 * A raw value kept as it is: a short identifier. Anything else (a sentence, a
 * number, an object) is never stored nor exported — it becomes 'other', as the
 * PHP sanitizes twin9_appels.stop_reason.
 */
const RAW_STOP = /^[A-Za-z_]{1,32}$/

const CLASS_SET = new Set(STOP_CLASSES)

/**
 * The normalized stop of a generation.
 *
 * Idempotent on the classes: a value the server already normalized (the
 * relay, api/src/Worker/OpenAiCompatibleProvider.php) keeps its class. A value
 * the table does not know is 'other'; an absent one ('' included) is null.
 *
 * @param {string} format the provider id ('anthropic', 'openai', 'xai',
 *   'openrouter', 'mistral', 'google', 'ollama'); any other knows the classes only
 * @param {unknown} raw the provider's value
 * @param {{refusal?: boolean}} [extra] refusal: true when the provider signals
 *   a refusal elsewhere (OpenAI message.refusal, Gemini promptFeedback.blockReason);
 *   it wins over the raw value
 * @returns {{stopReason: ?string, stopReasonRaw: ?string, truncated: boolean}}
 */
export function classifyStop(format, raw, { refusal = false } = {}) {
  let stopReason
  let stopReasonRaw
  if (raw === undefined || raw === null || raw === '') {
    stopReason = null
    stopReasonRaw = null
  } else if (typeof raw !== 'string' || !RAW_STOP.test(raw)) {
    stopReason = 'other'
    stopReasonRaw = 'other'
  } else {
    const table = Object.hasOwn(STOP_TABLES, format) ? STOP_TABLES[format] : null
    stopReasonRaw = raw
    if (table && Object.hasOwn(table, raw)) stopReason = table[raw]
    else stopReason = CLASS_SET.has(raw) ? raw : 'other'
  }
  if (refusal) stopReason = 'refusal'
  return {
    stopReason,
    stopReasonRaw,
    truncated: stopReason === 'max_tokens' || stopReason === 'context_window'
  }
}

/** @returns {boolean} true when the error (not its causes) is a cut generation */
export function isOutputTruncated(err) {
  return err instanceof OutputTruncatedError || err?.code === 'sortie_tronquee'
}

/**
 * Whether a complete() result is a cut generation — `truncated`, or, for a
 * provider injected by its caller (tests, wrappers) that only reports a
 * stopReason, 'max_tokens' or 'context_window'.
 */
export function isTruncatedResult(res) {
  return res?.truncated ?? (res?.stopReason === 'max_tokens' || res?.stopReason === 'context_window')
}

/** The French, content-free message of a cut generation. */
export function truncationMessage({ provider, model, stopReason, maxTokens }) {
  const who = `${provider ?? 'fournisseur'}/${model ?? '?'}`
  return stopReason === 'context_window'
    ? `réponse tronquée : fenêtre de contexte du modèle pleine — ${who}`
    : `réponse tronquée : budget de sortie atteint (max_tokens = ${maxTokens ?? '?'}) — ${who}`
}

/**
 * The OutputTruncatedError of a cut result.
 *
 * @param {{text?: string, usage?: object, model?: string, stopReason?: string,
 *   stopReasonRaw?: string}} res
 * @param {{provider?: ?string, maxTokens?: ?number, message?: string, cause?: unknown}} [context]
 */
export function truncationError(res, { provider = null, maxTokens = null, message, cause } = {}) {
  const stopReason = res?.stopReason === 'context_window' ? 'context_window' : 'max_tokens'
  const model = res?.model ?? null
  return new OutputTruncatedError(message ?? truncationMessage({ provider, model, stopReason, maxTokens }), {
    provider,
    model,
    stopReason,
    stopReasonRaw: res?.stopReasonRaw ?? null,
    usage: res?.usage ?? null,
    maxTokens,
    fragment: typeof res?.text === 'string' ? res.text : '',
    cause
  })
}

/**
 * The result itself, or an OutputTruncatedError when it is cut and the caller
 * did not ask for the fragment (allowTruncated: true).
 *
 * @param {object} res a complete() result
 * @param {{provider?: ?string, maxTokens?: ?number, allowTruncated?: boolean}} context
 */
export function throwIfTruncated(res, { provider = null, maxTokens = null, allowTruncated = false } = {}) {
  if (res?.truncated && allowTruncated !== true) throw truncationError(res, { provider, maxTokens })
  return res
}
