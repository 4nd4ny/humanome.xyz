import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ApiKeysSection from './ApiKeysSection.jsx'
import { ApiError } from '../../api/client.js'
import { KEYS_STORAGE_KEY } from '../../lib/local-keys.js'

afterEach(cleanup)

/** Un localStorage en mémoire ; `plein` : il refuse toute écriture. */
function memoryStorage({ plein = false } = {}) {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (plein) throw new Error('QuotaExceededError')
      data.set(k, String(v))
    },
    removeItem: (k) => data.delete(k),
  }
}

function fakeDeps(overrides = {}) {
  return {
    listKeys: vi.fn(async () => [{ provider: 'anthropic', createdAt: '2026-07-15T10:00:00', avisPurgeAt: null }]),
    revealKey: vi.fn(async () => ({ apiKey: 'sk-ant-gardee-0123456789' })),
    deleteKey: vi.fn(async () => null),
    keyStorage: memoryStorage(),
    ...overrides,
  }
}

describe('ApiKeysSection', () => {
  it('dit que la clé reste dans le navigateur (ADR-013, R1) et n’a plus de formulaire d’ajout', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    expect(await screen.findByText('Aucune clé gardée sur le serveur.')).toBeTruthy()
    expect(screen.getByTestId('cle-reste-navigateur').textContent).toBe(
      'Votre clé reste dans ce navigateur : humanome ne la garde jamais sur ses serveurs. Seule une école peut y ' +
        'garder la sienne, pour ses élèves.',
    )
    expect(screen.queryByLabelText('Clé API')).toBeNull()
    expect(screen.queryByRole('button', { name: /Enregistrer/ })).toBeNull()
    expect(screen.getByText(/L’analyse approfondie Twin9, qui tourne sur le serveur, part avec la clé de la plateforme/)).toBeTruthy()
  })

  it('liste les clés gardées avant, « à supprimer », sans jamais la clé ; la date de purge quand l’avis est parti', async () => {
    const listKeys = vi.fn(async () => [
      { provider: 'anthropic', createdAt: '2026-07-15T10:00:00', avisPurgeAt: null },
      { provider: 'openai', createdAt: '2026-07-16T10:00:00', avisPurgeAt: '2026-10-22T08:00:00' },
    ])
    render(<ApiKeysSection deps={fakeDeps({ listKeys })} />)
    expect(await screen.findByText(/à supprimer — gardée le 2026-07-15$/)).toBeTruthy()
    expect(screen.getByText('à supprimer — gardée le 2026-07-16, supprimée d’office à partir du 2026-11-21')).toBeTruthy()
    expect(screen.getByTestId('cles-a-supprimer').textContent).toContain('Elles ne servent plus à aucune analyse')
    expect(Array.from(document.querySelectorAll('.account-keys-provider')).map((n) => n.textContent)).toEqual([
      'Anthropic (Claude)',
      'OpenAI (GPT)',
    ])
    expect(document.body.textContent).not.toContain('sk-')
  })

  it('« Supprimer du serveur » supprime, recharge, et ne touche pas la clé de ce navigateur', async () => {
    const deps = fakeDeps()
    deps.keyStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ anthropic: 'sk-ant-locale-0123456789' }))
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer du serveur' }))
    await waitFor(() => expect(deps.deleteKey).toHaveBeenCalledWith('anthropic'))
    expect(await screen.findByText('Clé Anthropic (Claude) supprimée du serveur.')).toBeTruthy()
    expect(deps.revealKey).not.toHaveBeenCalled()
    expect(deps.listKeys).toHaveBeenCalledTimes(2)
    expect(JSON.parse(deps.keyStorage.getItem(KEYS_STORAGE_KEY))).toEqual({ anthropic: 'sk-ant-locale-0123456789' })
  })

  it('« Recopier dans ce navigateur, puis supprimer » : la clé relue va dans humanome-keys, puis est supprimée du serveur', async () => {
    const deps = fakeDeps()
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' }))
    expect(await screen.findByText('Clé Anthropic (Claude) recopiée dans ce navigateur, puis supprimée du serveur.')).toBeTruthy()
    expect(deps.revealKey).toHaveBeenCalledWith('anthropic')
    expect(deps.deleteKey).toHaveBeenCalledWith('anthropic')
    expect(JSON.parse(deps.keyStorage.getItem(KEYS_STORAGE_KEY))).toEqual({ anthropic: 'sk-ant-gardee-0123456789' })
    expect(document.body.textContent).not.toContain('sk-ant-gardee')
  })

  it('recopie impossible (stockage du navigateur plein, ou clé illisible) : rien n’est supprimé du serveur', async () => {
    const plein = fakeDeps({ keyStorage: memoryStorage({ plein: true }) })
    render(<ApiKeysSection deps={plein} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce navigateur n’a pas pu garder la clé : rien n’a été supprimé du serveur.',
    )
    expect(plein.deleteKey).not.toHaveBeenCalled()
    cleanup()

    const introuvable = new ApiError('Aucune clé enregistrée pour ce fournisseur', 404)
    introuvable.serverMessage = introuvable.message
    const illisible = fakeDeps({ revealKey: vi.fn(async () => { throw introuvable }) })
    render(<ApiKeysSection deps={illisible} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Aucune clé enregistrée pour ce fournisseur')
    expect(illisible.deleteKey).not.toHaveBeenCalled()
  })

  it('erreur de chargement : message', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => { throw new ApiError('Boom', 500) }) })
    render(<ApiKeysSection deps={deps} />)
    expect(await screen.findByText('Boom')).toBeTruthy()
  })

  it('session perdue (403 du jeton CSRF, 401) : l’alerte dit de se reconnecter, pas « Jeton CSRF absent ou invalide »', async () => {
    const csrf = new ApiError('Jeton CSRF absent ou invalide', 403)
    csrf.serverMessage = 'Jeton CSRF absent ou invalide'
    const deps = fakeDeps({ deleteKey: vi.fn(async () => { throw csrf }) })
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer du serveur' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Votre session a expiré : reconnectez-vous, puis réessayez.')
    cleanup()

    const gone = new ApiError('Authentification requise', 401)
    gone.serverMessage = 'Authentification requise'
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => { throw gone }) })} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Votre session a expiré : reconnectez-vous, puis réessayez.')
  })

  it('échec de suppression : message en role=alert, pas de rechargement', async () => {
    const deps = fakeDeps({ deleteKey: vi.fn(async () => { throw new ApiError('Boom suppression', 500) }) })
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer du serveur' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Boom suppression')
    expect(deps.listKeys).toHaveBeenCalledTimes(1)
  })
})
