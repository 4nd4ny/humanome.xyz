// Les clés API de l'utilisateur, dans CE navigateur (localStorage
// 'humanome-keys', table fournisseur -> clé) — ADR-004, ADR-013.
//
// Depuis l'ADR-013 (règle R1 de Christian), c'est le seul endroit où humanome
// laisse la clé d'un utilisateur : elle ne part que vers le fournisseur
// choisi, jamais vers le serveur, qui n'en garde plus aucune (seule une école
// y garde la sienne, pour ses élèves). L'assistant de run, la cartographie
// ouverte et la page du compte (« Recopier dans ce navigateur, puis
// supprimer ») lisent et écrivent la même table. Module sans dépendance, que
// ces pages chargent sans le moteur.

export const KEYS_STORAGE_KEY = 'humanome-keys'

function keysStorage(storage) {
  return storage ?? globalThis.localStorage ?? null
}

/** @returns {Record<string, string>} table provider -> clé (localStorage) */
export function readLocalKeys(storage) {
  const s = keysStorage(storage)
  if (!s) return {}
  try {
    const data = JSON.parse(s.getItem(KEYS_STORAGE_KEY) ?? '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** @returns {string} clé locale du fournisseur ('' si absente) */
export function getLocalKey(provider, storage) {
  const value = readLocalKeys(storage)[provider]
  return typeof value === 'string' ? value : ''
}

/** Mémorise (ou efface avec '') la clé locale d'un fournisseur. */
export function setLocalKey(provider, apiKey, storage) {
  const s = keysStorage(storage)
  if (!s) return
  const keys = readLocalKeys(storage)
  if (apiKey) keys[provider] = apiKey
  else delete keys[provider]
  try {
    s.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    /* stockage indisponible : la clé reste en mémoire de session */
  }
}

/**
 * Ce que dit l'interface partout où l'on saisit une clé (ADR-013 §5, règle R1
 * de Christian) : elle reste dans le navigateur.
 */
export const KEY_STAYS_IN_BROWSER =
  'Votre clé reste dans ce navigateur : humanome ne la garde jamais sur ses serveurs. Seule une école peut y ' +
  'garder la sienne, pour ses élèves.'
