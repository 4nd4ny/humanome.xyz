// humanome engine — providers: what an Anthropic model allows (2026-10-21).
// DOM-free ESM module (ADR-001).
//
// The output of one call (max_tokens): the model's maximum, never less —
// Christian, 2026-10-21 : « Ok pour lever le plafond des tokens de sortie (…)
// si le prompt est déjà passé et les tokens déjà dépensés, ne pas limiter sur
// la longueur de la sortie ». A cut answer is paid and lost; what bounds the
// spending is a reservation made before the call (the demo's dollar, the
// credits, on the server), never a ceiling on the answer.
//
// Synchronous Messages API, read on the models' pages on 2026-10-21: 128,000
// tokens for the models with a 1M-token window (Fable and Mythos 5.x, Opus 5.x
// and 4.6 to 4.8, Sonnet 5.x and 4.6, Haiku 5.5); 64,000 for Haiku 4.5, Sonnet
// 4.5 and Opus 4.5. A Claude model this table does not know gets 64,000,
// which every model of the current lines accepts.
//
// Mirrors api/src/Llm/ModelLimits.php.

/** The output of a Claude model the table does not know. */
export const SORTIE_PAR_DEFAUT = 64000

/** Model-id prefix -> max output tokens; the longest prefix wins. */
export const SORTIE_MAX_ANTHROPIC = Object.freeze({
  'claude-fable-5': 128000,
  'claude-mythos-5': 128000,
  'claude-opus-5': 128000,
  'claude-opus-4-8': 128000,
  'claude-opus-4-7': 128000,
  'claude-opus-4-6': 128000,
  'claude-opus-4-5': 64000,
  'claude-sonnet-5': 128000,
  'claude-sonnet-4-6': 128000,
  'claude-sonnet-4-5': 64000,
  'claude-haiku-5': 128000,
  'claude-haiku-4-5': 64000,
})

/**
 * The most output tokens one call to an Anthropic model may ask for.
 *
 * @param {string} model
 * @returns {number}
 */
export function sortieMaxAnthropic(model) {
  let best = null
  for (const [prefix, max] of Object.entries(SORTIE_MAX_ANTHROPIC)) {
    if (typeof model === 'string' && model.startsWith(prefix)) {
      if (best === null || prefix.length > best.prefix.length) best = { prefix, max }
    }
  }
  return best?.max ?? SORTIE_PAR_DEFAUT
}
