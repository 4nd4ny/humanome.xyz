// Clés API personnelles (cahier §4.5, ADR-004) — client fin du module /api/keys.
//
// Stockage serveur OPT-IN et chiffré (libsodium, clé maître hors webroot) : le
// profil conserve la clé API privée de l'utilisateur pour lancer les
// cartographies « clé perso » (Twin6) sans la ressaisir. La clé n'est jamais
// renvoyée par la liste ; seul son propriétaire authentifié peut la révéler
// (GET /api/keys/{provider}, réponse no-store) pour un usage côté navigateur.

import { apiFetch } from './client.js'

const e = encodeURIComponent

/**
 * Fournisseurs LLM proposés dans l'interface (« mock » exclu — usage test) :
 * ceux de l'assistant de cartographie. Pas Mistral AI, fournisseur des appels
 * Twin9 (ADR-012) : aucun parcours n'emploie sa clé (Twin9 l'appelle avec la
 * clé de l'instance, l'assistant n'a pas d'adaptateur), et une clé sans
 * usage ne se collecte pas (minimisation). `exemple` : le début d'une clé,
 * pour le champ de saisie (jamais une clé entière).
 */
export const KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', exemple: 'ex. sk-ant-…' },
  { id: 'openai', label: 'OpenAI (GPT)', exemple: 'ex. sk-…' },
  { id: 'google', label: 'Google (Gemini)', exemple: 'ex. AIza…' },
  { id: 'openrouter', label: 'OpenRouter', exemple: 'ex. sk-or-…' },
  { id: 'xai', label: 'xAI (Grok)', exemple: 'ex. xai-…' },
  { id: 'ollama', label: 'Ollama (local)', exemple: 'facultative en local' },
]

/** @param {string} id @returns {string} libellé lisible du fournisseur */
export function providerLabel(id) {
  return KEY_PROVIDERS.find((p) => p.id === id)?.label ?? id
}

/** GET api/keys — [{provider, createdAt}] (JAMAIS la clé). */
export function listKeys(options) {
  return apiFetch('keys', options)
}

/** PUT api/keys — stocke la clé (chiffrée côté serveur). 204. */
export function storeKey({ provider, apiKey }, options) {
  return apiFetch('keys', { ...options, method: 'PUT', body: { provider, apiKey } })
}

/** GET api/keys/{provider} — {apiKey} déchiffrée (propriétaire seul, no-store). */
export function revealKey(provider, options) {
  return apiFetch(`keys/${e(provider)}`, options)
}

/** DELETE api/keys/{provider} — suppression réelle. 204. */
export function deleteKey(provider, options) {
  return apiFetch(`keys/${e(provider)}`, { ...options, method: 'DELETE' })
}
