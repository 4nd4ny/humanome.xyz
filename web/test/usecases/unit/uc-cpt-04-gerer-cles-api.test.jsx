// UC-CPT-04 — Gérer ses clés API : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
//
// Code sollicité appelé directement : les clés dans CE navigateur
// (lib/local-keys.js : localStorage 'humanome-keys', seul endroit où vit la
// clé d'un utilisateur depuis l'ADR-013, réexporté par run-launcher), la fin
// de la synchronisation avec le serveur (plus de syncKeyToServer,
// fetchKeyFromServer ni storeKey), listes de fournisseurs (interface de
// profil, assistant de run, coffre serveur — liste PHP lue dans le fichier
// versionné), le client /api/keys (keys.js) et la section de profil
// ApiKeysSection rendue seule avec ses coutures deps.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApiKeysSection from '../../../src/views/account/ApiKeysSection.jsx'
import { ApiError, login, resetApiClient } from '../../../src/api/client.js'
import * as launcher from '../../../src/lib/run-launcher.js'
import * as localKeys from '../../../src/lib/local-keys.js'
import { KEYS_STORAGE_KEY, PROVIDERS, getLocalKey, readLocalKeys, setLocalKey } from '../../../src/lib/run-launcher.js'
import * as keysApi from '../../../src/api/keys.js'
import { KEY_PROVIDERS, deleteKey, listKeys, providerLabel, revealKey } from '../../../src/api/keys.js'
import { jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Stockage façon localStorage, en mémoire. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: vi.fn((k, v) => map.set(k, String(v))),
    removeItem: (k) => map.delete(k),
  }
}

/** KeyVault::PROVIDERS, lu dans le fichier PHP versionné (appelé dans un it()). */
function serverProviders() {
  const here = dirname(fileURLToPath(import.meta.url))
  const php = readFileSync(resolve(here, '../../../../api/src/Keys/KeyVault.php'), 'utf8')
  const block = /PROVIDERS\s*=\s*\[([^\]]*)\]/.exec(php)
  if (!block) throw new Error('KeyVault::PROVIDERS introuvable')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('UC-CPT-04 — clés locales (défaut ADR-004)', () => {
  it('UC-CPT-04-U08 — setLocalKey / getLocalKey : table fournisseur → clé sous « humanome-keys », effacement par chaîne vide', () => {
    const storage = memoryStorage()
    expect(KEYS_STORAGE_KEY).toBe('humanome-keys')
    expect(getLocalKey('anthropic', storage)).toBe('')

    setLocalKey('anthropic', 'sk-ant-local', storage)
    setLocalKey('openai', 'sk-openai-local', storage)
    expect(JSON.parse(storage.map.get('humanome-keys'))).toEqual({ anthropic: 'sk-ant-local', openai: 'sk-openai-local' })
    expect(getLocalKey('anthropic', storage)).toBe('sk-ant-local')

    setLocalKey('anthropic', '', storage)
    expect(readLocalKeys(storage)).toEqual({ openai: 'sk-openai-local' })
  })

  it('UC-CPT-04-U09 — stockage corrompu ou plein : lecture vide, écriture silencieuse (la clé reste utilisable en mémoire)', () => {
    const corrupted = memoryStorage({ 'humanome-keys': '{pas du json' })
    expect(readLocalKeys(corrupted)).toEqual({})
    expect(getLocalKey('anthropic', corrupted)).toBe('')
    expect(readLocalKeys(memoryStorage({ 'humanome-keys': '42' }))).toEqual({})

    const full = memoryStorage()
    full.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => setLocalKey('anthropic', 'sk-x', full)).not.toThrow()
    expect(getLocalKey('anthropic', { getItem: () => JSON.stringify({ anthropic: 42 }) })).toBe('')
  })
})

describe('UC-CPT-04 — la clé reste dans le navigateur (ADR-013)', () => {
  it('UC-CPT-04-U10 — plus aucune synchronisation avec le serveur : ni syncKeyToServer ni fetchKeyFromServer (run-launcher), ni storeKey (keys.js) ; le message que montrent les pages', () => {
    expect(launcher.syncKeyToServer).toBeUndefined()
    expect(launcher.fetchKeyFromServer).toBeUndefined()
    expect(keysApi.storeKey).toBeUndefined()
    expect(localKeys.KEY_STAYS_IN_BROWSER).toBe(
      'Votre clé reste dans ce navigateur : humanome ne la garde jamais sur ses serveurs. Seule une école peut y ' +
        'garder la sienne, pour ses élèves.',
    )
  })

  it('UC-CPT-04-U11 — local-keys.js, sans dépendance (la page du compte et la cartographie ouverte le chargent sans le moteur), est la table que réexporte run-launcher', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(resolve(here, '../../../src/lib/local-keys.js'), 'utf8')
    expect(source).not.toMatch(/^import /m)
    for (const nom of ['KEYS_STORAGE_KEY', 'KEY_STAYS_IN_BROWSER', 'getLocalKey', 'readLocalKeys', 'setLocalKey']) {
      expect(launcher[nom]).toBe(localKeys[nom])
    }
  })
})

describe('UC-CPT-04 — fournisseurs', () => {
  it('UC-CPT-04-U12 — profil et assistant proposent les mêmes six fournisseurs, tous acceptés par le coffre serveur (KeyVault.php lu) ; ni le profil ni le coffre ne prennent une clé Mistral AI, qu’aucun parcours n’emploie', () => {
    const profileIds = KEY_PROVIDERS.map((p) => p.id)
    const wizardIds = PROVIDERS.map((p) => p.id)
    const vault = serverProviders()
    expect(vault).toContain('mock')
    expect([...profileIds].sort()).toEqual([...wizardIds].sort())
    expect(profileIds).toHaveLength(6)
    expect(vault).not.toContain('mistral')
    for (const id of profileIds) expect(vault).toContain(id)
    expect(profileIds).not.toContain('mock')
    // Ollama tourne en local : aucune clé à gérer dans l'assistant.
    expect(PROVIDERS.filter((p) => !p.requiresKey).map((p) => p.id)).toEqual(['ollama'])
    expect(providerLabel('xai')).toBe('xAI (Grok)')
    expect(providerLabel('inconnu')).toBe('inconnu')
  })
})

describe('UC-CPT-04 — ApiKeysSection (composant seul)', () => {
  it('UC-CPT-04-U13 — messages : message serveur d’une ApiError, repli générique sinon ; pas de rechargement après un échec, rechargement après un succès ; un chargement réussi efface l’alerte (AN1 corrigée)', async () => {
    const enPanne = vi
      .fn()
      .mockRejectedValue(Object.assign(new ApiError('Erreur serveur (HTTP 503).', 503), { serverMessage: 'Stockage de clés non configuré' }))
    const deleteKey = vi.fn().mockRejectedValueOnce(new TypeError('boom')).mockResolvedValue(null)
    const vue = render(<ApiKeysSection deps={{ listKeys: enPanne, deleteKey, revealKey: vi.fn() }} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Stockage de clés non configuré')

    // un chargement réussi (nouvelle source) efface l'alerte du premier
    const listKeys = vi.fn().mockResolvedValue([{ provider: 'google', createdAt: '2026-09-28T12:00:00', avisPurgeAt: null }])
    vue.rerender(<ApiKeysSection deps={{ listKeys, deleteKey, revealKey: vi.fn() }} />)
    expect(await screen.findByText('à supprimer — gardée le 2026-09-28')).toBeDefined()
    expect(screen.queryByText('Stockage de clés non configuré')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer du serveur' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    })
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain('Une erreur est survenue. Réessayez.')
    expect(listKeys).toHaveBeenCalledTimes(1) // pas de rechargement après un échec

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer du serveur' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    })
    expect(deleteKey).toHaveBeenLastCalledWith('google')
    expect(await screen.findByText('Clé Google (Gemini) supprimée du serveur.')).toBeDefined()
    expect(listKeys).toHaveBeenCalledTimes(2)
  })

  it('UC-CPT-04-U22 — « Supprimer du serveur » en deux temps : le premier toucher arme seulement et prévient que la clé ne sera plus récupérable ; « Annuler » désarme ; seule la confirmation supprime', async () => {
    const listKeys = vi.fn().mockResolvedValue([{ provider: 'anthropic', createdAt: '2026-09-28T12:00:00', avisPurgeAt: null }])
    const deleteKey = vi.fn().mockResolvedValue(null)
    render(<ApiKeysSection deps={{ listKeys, deleteKey, revealKey: vi.fn() }} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer du serveur' }))
    expect(deleteKey).not.toHaveBeenCalled()
    expect(screen.getByTestId('cle-suppression-armee').textContent).toContain('ne sera plus récupérable')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByTestId('cle-suppression-armee')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmer la suppression' })).toBeNull()
    expect(deleteKey).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer du serveur' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    })
    expect(deleteKey).toHaveBeenCalledTimes(1)
    expect(deleteKey).toHaveBeenCalledWith('anthropic')
  })

  it('UC-CPT-04-U23 — la section dit où part l’analyse approfondie, qui tourne sur le serveur : avec la clé de la plateforme, ou celle de l’école de l’élève quand elle en a posé une', async () => {
    render(<ApiKeysSection deps={{ listKeys: vi.fn().mockResolvedValue([]), deleteKey: vi.fn(), revealKey: vi.fn() }} />)
    expect(await screen.findByText('Aucune clé gardée sur le serveur.')).toBeDefined()
    expect(document.body.textContent).toContain(
      'part avec la clé de la plateforme — ou avec celle de votre école, quand elle paie pour vous et en a posé une.')
  })

  it('UC-CPT-04-U20 — « Recopier dans ce navigateur, puis supprimer » : la clé relue est écrite dans humanome-keys AVANT la suppression ; un navigateur qui ne la garde pas → rien n’est supprimé', async () => {
    const ordre = []
    const storage = memoryStorage()
    storage.setItem.mockImplementation((k, v) => {
      ordre.push('navigateur')
      storage.map.set(k, String(v))
    })
    const deps = {
      listKeys: vi.fn().mockResolvedValue([{ provider: 'anthropic', createdAt: '2026-07-15T10:00:00', avisPurgeAt: null }]),
      revealKey: vi.fn(async () => ({ apiKey: 'sk-ant-gardee' })),
      deleteKey: vi.fn(async () => ordre.push('serveur')),
      keyStorage: storage,
    }
    render(<ApiKeysSection deps={deps} />)
    const recopier = await screen.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' })
    await act(async () => {
      fireEvent.click(recopier)
    })
    expect(ordre).toEqual(['navigateur', 'serveur'])
    expect(getLocalKey('anthropic', storage)).toBe('sk-ant-gardee')
    cleanup()

    const plein = memoryStorage()
    plein.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError')
    })
    const refus = { ...deps, deleteKey: vi.fn(), keyStorage: plein }
    render(<ApiKeysSection deps={refus} />)
    const recopierPlein = await screen.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' })
    await act(async () => {
      fireEvent.click(recopierPlein)
    })
    expect(refus.deleteKey).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Ce navigateur n’a pas pu garder la clé : rien n’a été supprimé du serveur.')
  })
})

describe('UC-CPT-04 — client /api/keys', () => {
  it('UC-CPT-04-U14 — listKeys, revealKey, deleteKey : URL (fournisseur encodé), méthode, X-CSRF-Token sur DELETE seulement ; plus de PUT', async () => {
    await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: {}, csrfToken: 'tok-k' })) })

    const entree = { provider: 'openai', createdAt: '2026-09-28T12:00:00', avisPurgeAt: null }
    const list = vi.fn().mockResolvedValue(jsonResponse(200, [entree]))
    await expect(listKeys({ fetchFn: list })).resolves.toEqual([entree])
    const reveal = vi.fn().mockResolvedValue(jsonResponse(200, { apiKey: 'sk-du-serveur' }, { 'cache-control': 'no-store' }))
    await expect(revealKey('open router', { fetchFn: reveal })).resolves.toEqual({ apiKey: 'sk-du-serveur' })
    const del = vi.fn().mockResolvedValue(noContentResponse())
    await expect(deleteKey('open router', { fetchFn: del })).resolves.toBeNull()

    expect(list.mock.calls[0][0]).toBe('api/keys')
    expect(list.mock.calls[0][1].method).toBe('GET')
    expect(reveal.mock.calls[0][0]).toBe('api/keys/open%20router')
    expect(reveal.mock.calls[0][1].method).toBe('GET')
    expect(del.mock.calls[0][0]).toBe('api/keys/open%20router')
    expect(del.mock.calls[0][1].method).toBe('DELETE')
    expect(del.mock.calls[0][1].body).toBeUndefined()
    expect(del.mock.calls[0][1].headers['X-CSRF-Token']).toBe('tok-k')
    for (const fn of [list, reveal]) expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBeUndefined()
  })
})
