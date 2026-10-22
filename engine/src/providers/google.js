// humanome engine — providers: Google Gemini generateContent adapter (cahier §5).
// DOM-free ESM module (ADR-001). The API key travels in the x-goog-api-key
// header — never as a ?key= URL parameter (P5: no key in URLs/logs).

import { classifyStop } from './stop.js'

export const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com'

export const googleAdapter = {
  defaultBaseUrl: GOOGLE_BASE_URL,
  requiresApiKey: true,

  buildRequest({ baseUrl, apiKey }, { model, system, prompt, maxTokens, temperature }) {
    const generationConfig = { maxOutputTokens: maxTokens }
    if (temperature !== undefined) generationConfig.temperature = temperature
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    }
    if (system != null) body.systemInstruction = { parts: [{ text: system }] }
    return {
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body
    }
  },

  parseResponse(data, requestedModel) {
    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    // A blocked prompt has no candidate, only promptFeedback.blockReason.
    const blockReason = data.promptFeedback?.blockReason
    const blocked = typeof blockReason === 'string' && blockReason !== ''
    const usage = data.usageMetadata
    return {
      // Thought summaries (thought: true) are not the answer.
      text: parts
        .filter((part) => part?.thought !== true)
        .map((part) => part?.text ?? '')
        .join(''),
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        // Billed output = answer + thinking (usageMetadata.thoughtsTokenCount).
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0)
      },
      model: data.modelVersion ?? requestedModel,
      ...(blocked
        ? classifyStop('google', blockReason, { refusal: true })
        : classifyStop('google', candidate?.finishReason))
    }
  }
}
