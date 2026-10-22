import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ApiKeysSection from './ApiKeysSection.jsx'
import { ApiError } from '../../api/client.js'

afterEach(cleanup)

function fakeDeps(overrides = {}) {
  return {
    listKeys: vi.fn(async () => [{ provider: 'anthropic', createdAt: '2026-07-15T10:00:00' }]),
    storeKey: vi.fn(async () => null),
    deleteKey: vi.fn(async () => null),
    ...overrides,
  }
}

describe('ApiKeysSection', () => {
  it('liste les clés enregistrées (sans jamais la clé)', async () => {
    render(<ApiKeysSection deps={fakeDeps()} />)
    // Date unique de la ligne (« Anthropic (Claude) » figure aussi dans le select).
    expect(await screen.findByText(/enregistrée le 2026-07-15/)).toBeTruthy()
    expect(document.querySelector('.account-keys-provider').textContent).toBe('Anthropic (Claude)')
  })

  it('aucune clé : message dédié', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    expect(await screen.findByText('Aucune clé enregistrée.')).toBeTruthy()
  })

  it('enregistre une clé (provider + champ) et recharge', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => []) })
    render(<ApiKeysSection deps={deps} />)
    await screen.findByText('Aucune clé enregistrée.')

    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-abcdef123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    await waitFor(() => expect(deps.storeKey).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-abcdef123456' }))
    expect(await screen.findByText(/enregistrée \(chiffrée\)/)).toBeTruthy()
  })

  it('le bouton reste désactivé pour une clé trop courte', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    await screen.findByText('Aucune clé enregistrée.')
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'court' } })
    expect(screen.getByRole('button', { name: 'Enregistrer la clé' })).toHaveProperty('disabled', true)
  })

  it('supprime une clé', async () => {
    const deps = fakeDeps()
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(deps.deleteKey).toHaveBeenCalledWith('anthropic'))
  })

  it('erreur de chargement : message', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => { throw new ApiError('Boom', 500) }) })
    render(<ApiKeysSection deps={deps} />)
    expect(await screen.findByText('Boom')).toBeTruthy()
  })

  // Exigence : ajouter une clé — l'échec serveur doit être visible (role=alert),
  // sans faux rechargement de la liste en succès.
  it("échec d'enregistrement : message serveur en role=alert, pas de rechargement", async () => {
    const error = new ApiError('Clé API invalide (8 à 4096 caractères imprimables)', 422)
    error.serverMessage = error.message // posé comme le fait apiFetch (client.js)
    const deps = fakeDeps({
      listKeys: vi.fn(async () => []),
      storeKey: vi.fn(async () => { throw error }),
    })
    render(<ApiKeysSection deps={deps} />)
    await screen.findByText('Aucune clé enregistrée.')

    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-abcdef123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Clé API invalide (8 à 4096 caractères imprimables)')
    // Pas de feedback de succès ni de rechargement : listKeys n'a servi qu'au montage.
    expect(screen.queryByText(/enregistrée \(chiffrée\)/)).toBeNull()
    expect(deps.listKeys).toHaveBeenCalledTimes(1)
  })

  it('échec de suppression : message en role=alert', async () => {
    const deps = fakeDeps({ deleteKey: vi.fn(async () => { throw new ApiError('Boom suppression', 500) }) })
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Boom suppression')
    expect(deps.listKeys).toHaveBeenCalledTimes(1)
  })

  // Exigence : « champ password […] jamais réaffichée » — le champ ne doit ni
  // s'autocompléter ni conserver la clé après enregistrement.
  it('« jamais réaffichée » : champ type=password, autoComplete=off, vidé après enregistrement', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => []) })
    render(<ApiKeysSection deps={deps} />)
    await screen.findByText('Aucune clé enregistrée.')

    const input = screen.getByLabelText('Clé API')
    expect(input.type).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')

    fireEvent.change(input, { target: { value: 'sk-ant-abcdef123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    await screen.findByText(/enregistrée \(chiffrée\)/)
    expect(input.value).toBe('')
  })

  // Exigence : fournisseurs anthropic/openai/google/openrouter/xai/ollama, et
  // Mistral AI, fournisseur des appels Twin9 (ADR-012) — sans le fournisseur de test « mock ».
  it('le select Fournisseur propose les 6 fournisseurs de l’exigence et Mistral AI (sans mock)', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    await screen.findByText('Aucune clé enregistrée.')

    const options = Array.from(screen.getByLabelText('Fournisseur').querySelectorAll('option'))
    expect(options.map((o) => o.value)).toEqual(['anthropic', 'openai', 'mistral', 'google', 'openrouter', 'xai', 'ollama'])
    expect(options.map((o) => o.textContent)).toEqual([
      'Anthropic (Claude)',
      'OpenAI (GPT)',
      'Mistral AI',
      'Google (Gemini)',
      'OpenRouter',
      'xAI (Grok)',
      'Ollama (local)',
    ])
  })

  it('dit que Twin9 n’emploie qu’une clé personnelle Anthropic, qu’une clé Mistral AI ne sert encore à rien, et donne le début d’une clé de chaque fournisseur', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    await screen.findByText('Aucune clé enregistrée.')
    expect(screen.getByText(/Pour l’analyse approfondie Twin9, une clé personnelle ne sert que chez Anthropic/)).toBeTruthy()
    const cle = screen.getByLabelText('Clé API')
    expect(cle.placeholder).toBe('ex. sk-ant-…')
    expect(screen.queryByText(/Aucun parcours n’emploie encore une clé Mistral AI/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: 'mistral' } })
    expect(cle.placeholder).toBe('clé de La Plateforme Mistral')
    expect(screen.getByText(/Aucun parcours n’emploie encore une clé Mistral AI/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: 'google' } })
    expect(cle.placeholder).toBe('ex. AIza…')
  })
})
