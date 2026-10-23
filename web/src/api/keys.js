// Clés API gardées sur le serveur avant l'ADR-013 — client fin du module /api/keys.
//
// Depuis l'ADR-013 (§5), les clés d'un utilisateur restent dans son navigateur
// (localStorage 'humanome-keys', lib/run-launcher.js) : humanome n'en garde
// plus aucune, et PUT /api/keys répond 410 — d'où l'absence d'« enregistrer ».
// Ce qui reste sert la page du compte, qui montre les clés gardées avant,
// « à supprimer », jusqu'à leur purge : la liste (jamais la clé), la
// révélation à leur seul propriétaire (no-store) pour les recopier dans ce
// navigateur avant de les supprimer, et la suppression. Aucun lancement ne
// lit plus une clé gardée.

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

/** GET api/keys — [{provider, createdAt, avisPurgeAt}] des clés gardées avant l'ADR-013 (JAMAIS la clé). */
export function listKeys(options) {
  return apiFetch('keys', options)
}

/** GET api/keys/{provider} — {apiKey} déchiffrée (propriétaire seul, no-store), pour la recopier dans ce navigateur. */
export function revealKey(provider, options) {
  return apiFetch(`keys/${e(provider)}`, options)
}

/** DELETE api/keys/{provider} — suppression réelle. 204. */
export function deleteKey(provider, options) {
  return apiFetch(`keys/${e(provider)}`, { ...options, method: 'DELETE' })
}
