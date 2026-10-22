// humanome engine — providers: OpenAI chat-completions adapter (cahier §5).
// DOM-free ESM module (ADR-001). Also the shared shape for the OpenAI-compatible
// providers (xAI, OpenRouter) which differ by base URL and by the stop values
// they document (stop.js: the format is the provider id).

import { classifyStop } from './stop.js'

export const OPENAI_BASE_URL = 'https://api.openai.com'

/**
 * Build an adapter for any OpenAI-compatible chat-completions endpoint.
 *
 * @param {string} defaultBaseUrl
 * @param {{format?: string}} [options] format: the stop table (stop.js)
 */
export function createOpenAiCompatibleAdapter(defaultBaseUrl, { format = 'openai' } = {}) {
  return {
    defaultBaseUrl,
    requiresApiKey: true,

    buildRequest({ baseUrl, apiKey }, { model, system, prompt, maxTokens, temperature }) {
      const messages = []
      if (system != null) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: prompt })
      const body = { model, messages, max_tokens: maxTokens }
      if (temperature !== undefined) body.temperature = temperature
      return {
        url: `${baseUrl}/v1/chat/completions`,
        headers: { authorization: `Bearer ${apiKey}` },
        body
      }
    },

    parseResponse(data, requestedModel) {
      const choice = data.choices?.[0]
      // A refusal has its own field (a string, never relayed: provider text).
      const refusal = typeof choice?.message?.refusal === 'string' && choice.message.refusal !== ''
      return {
        text: choice?.message?.content ?? '',
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0
        },
        model: data.model ?? requestedModel,
        ...classifyStop(format, choice?.finish_reason, { refusal })
      }
    }
  }
}

export const openaiAdapter = createOpenAiCompatibleAdapter(OPENAI_BASE_URL)
