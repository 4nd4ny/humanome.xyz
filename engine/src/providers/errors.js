// humanome engine — providers: typed error (docs/plan-portage-moteur.md, cahier §5).
// DOM-free ESM module (ADR-001).

/**
 * Typed error raised by every provider transport.
 *
 * @property {number} status HTTP status of the failed response (0 for network errors)
 * @property {boolean} retryable true for 429 / 5xx / network errors
 * @property {?string} provider provider name ('anthropic', 'openai', …)
 * @property {number} [retryAfterMs] delay requested by a Retry-After header, if any
 */
export class ProviderError extends Error {
  constructor(message, { status = 0, retryable = false, provider = null, cause } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.retryable = retryable
    this.provider = provider
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * A provider answered (HTTP 200) but the generation was cut: the output
 * budget (max_tokens) or the model's context window ran out. The call is paid
 * and its text is a fragment, so complete() raises instead of handing it on —
 * unless the caller passes allowTruncated: true. Never retryable: a second
 * call would most likely be cut, and paid, again. Raised outside withRetry.
 *
 * status is 200, not 0: the demo wrapper (web/src/lib/demo-llm.js) takes an
 * error without an HTTP status for a transient one and calls again.
 *
 * The fragment is kept in a NON-enumerable property, so that it never reaches
 * a JSON export nor a log (CLAUDE.md, RGPD principle 5); the message never
 * carries any content either.
 *
 * @property {'sortie_tronquee'} code
 * @property {?string} model the model that answered
 * @property {'max_tokens'|'context_window'} stopReason normalized stop class
 * @property {?string} stopReasonRaw the provider's value
 * @property {'sortie'|'contexte'} limit which limit cut the answer (not named
 *   `cause`: that is the standard Error chain, walked by the callers)
 * @property {{inputTokens: number, outputTokens: number}} usage what the call cost
 * @property {?number} maxTokens the output budget asked for
 * @property {number} textLength length of the fragment
 * @property {string} fragment the cut text (non-enumerable)
 */
export class OutputTruncatedError extends ProviderError {
  constructor(
    message,
    {
      provider = null,
      model = null,
      stopReason = 'max_tokens',
      stopReasonRaw = null,
      usage = null,
      maxTokens = null,
      fragment = '',
      cause
    } = {}
  ) {
    super(message, { status: 200, retryable: false, provider, cause })
    this.name = 'OutputTruncatedError'
    this.code = 'sortie_tronquee'
    this.model = model
    this.stopReason = stopReason === 'context_window' ? 'context_window' : 'max_tokens'
    this.stopReasonRaw = stopReasonRaw
    this.limit = this.stopReason === 'context_window' ? 'contexte' : 'sortie'
    this.usage = {
      inputTokens: Number(usage?.inputTokens) || 0,
      outputTokens: Number(usage?.outputTokens) || 0
    }
    this.maxTokens = maxTokens ?? null
    const text = typeof fragment === 'string' ? fragment : ''
    this.textLength = text.length
    Object.defineProperty(this, 'fragment', { value: text, enumerable: false, configurable: true })
  }
}
