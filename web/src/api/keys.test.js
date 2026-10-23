// Clés API (cahier §4.5 ; ADR-013 §5) — exigence : « section Clés API dans
// #/compte : lister les clés gardées avant (fournisseur + date, JAMAIS la clé),
// les recopier dans ce navigateur (revealKey), les supprimer ; plus d'ajout :
// la clé reste dans le navigateur ». Ce fichier prouve le contrat HTTP du
// client fin web/src/api/keys.js avec /api/keys : chemins, méthodes, encodage
// du fournisseur et liste des fournisseurs.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as keys from './keys.js'
import { KEY_PROVIDERS, providerLabel, listKeys, revealKey, deleteKey } from './keys.js'
import { resetApiClient } from './client.js'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  }
}

/** 204 No Content (PUT et DELETE répondent sans corps). */
function noContent() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

beforeEach(() => resetApiClient())

describe('listKeys', () => {
  it('émet GET api/keys et retourne la liste [{provider, createdAt, avisPurgeAt}] telle quelle (jamais la clé)', async () => {
    const list = [
      { provider: 'anthropic', createdAt: '2026-07-15T10:00:00', avisPurgeAt: null },
      { provider: 'ollama', createdAt: '2026-07-14T09:00:00', avisPurgeAt: '2026-10-22T08:00:00' },
    ]
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse(list)
    })

    const out = await listKeys({ fetchFn })

    expect(calls[0].url).toBe('api/keys')
    expect(calls[0].init.method).toBe('GET')
    expect(out).toEqual(list)
    // Le contrat serveur ne porte JAMAIS de matériel de clé dans la liste.
    expect(Object.keys(out[0])).toEqual(['provider', 'createdAt', 'avisPurgeAt'])
  })
})

describe('storeKey', () => {
  it('n’existe plus (ADR-013) : aucune clé d’utilisateur ne part au serveur, PUT api/keys répond 410', () => {
    expect(keys.storeKey).toBeUndefined()
    expect(Object.keys(keys).sort()).toEqual(['KEY_PROVIDERS', 'deleteKey', 'listKeys', 'providerLabel', 'revealKey'])
  })
})

describe('revealKey', () => {
  it('émet GET api/keys/{provider} et retourne {apiKey} (révélation à la demande)', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ apiKey: 'sk-ant-secret-0123456789' })
    })

    const out = await revealKey('anthropic', { fetchFn })

    expect(calls[0].url).toBe('api/keys/anthropic')
    expect(calls[0].init.method).toBe('GET')
    expect(out).toEqual({ apiKey: 'sk-ant-secret-0123456789' })
  })

  it('passe le fournisseur par encodeURIComponent dans le chemin', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ apiKey: 'x' })
    })

    await revealKey('a/b', { fetchFn })

    expect(calls[0].url).toBe('api/keys/a%2Fb')
  })
})

describe('deleteKey', () => {
  it('émet DELETE api/keys/{provider}', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return noContent()
    })

    const out = await deleteKey('ollama', { fetchFn })

    expect(calls[0].url).toBe('api/keys/ollama')
    expect(calls[0].init.method).toBe('DELETE')
    expect(out).toBeNull() // 204 No Content
  })
})

describe('KEY_PROVIDERS', () => {
  it('propose exactement les 6 fournisseurs de l’exigence, sans « mock » ni Mistral AI (aucun parcours n’en emploie la clé), chacun avec le début d’une clé', () => {
    expect(KEY_PROVIDERS.map((p) => p.id)).toEqual([
      'anthropic',
      'openai',
      'google',
      'openrouter',
      'xai',
      'ollama',
    ])
    // un début de clé, jamais une clé entière : check-publiable n'y verrait rien
    for (const p of KEY_PROVIDERS) expect(p.exemple.length).toBeLessThan(30)
  })

  it('providerLabel donne le libellé lisible et retombe sur l’id pour un fournisseur inconnu', () => {
    expect(providerLabel('anthropic')).toBe('Anthropic (Claude)')
    expect(providerLabel('ollama')).toBe('Ollama (local)')
    expect(providerLabel('inconnu')).toBe('inconnu')
  })
})
