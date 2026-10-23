// UC-CPT-04 — Gérer ses clés API : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
//
// Depuis l'ADR-013, la clé d'un utilisateur reste dans son navigateur. Deux
// surfaces :
//  - l'étape « Fournisseur » de l'assistant de run, où la clé vit en
//    localStorage et ne part que vers le fournisseur choisi : la page le dit,
//    et ne propose plus ni de la synchroniser ni de la récupérer sur le
//    serveur. L'assistant est joué dans la vraie vue #/espace/nouveau-run
//    (EspaceView) : la session est DÉRIVÉE par la sonde GET auth/me contre le
//    faux serveur (connecté, anonyme, jeton CSRF), comme en production. Seules
//    les coutures de l'assistant sont injectées (portfolio en mémoire,
//    référentiel et journée des fixtures versionnées, fournisseur LLM simulé) ;
//    ses appels API passent par le vrai client vers le même faux serveur ;
//  - la section « Clés API » du profil, jouée dans <App/> (#/compte) contre le
//    faux serveur du lot (web/test/usecases/support/cpt.js) : les clés gardées
//    avant, « à supprimer », recopiées dans ce navigateur ou supprimées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import EspaceView from '../../../src/views/EspaceView.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { createMockProvider } from '@engine/providers/mock.js'
import { createMemoryStorage } from '@engine/runs/memory.js'
import { createMemoryAdapter, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const ADA = { id: 7, email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

// --- Profil (#/compte) --------------------------------------------------------

async function openKeysSection(apiOptions = {}) {
  const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email, ...apiOptions })
  window.location.hash = '#/compte'
  render(<App lib={fakeLib} />)
  const section = within(await screen.findByRole('region', { name: 'Clés API' }))
  return { api, section }
}

const R1 =
  'Votre clé reste dans ce navigateur : humanome ne la garde jamais sur ses serveurs. Seule une école peut y ' +
  'garder la sienne, pour ses élèves.'

// --- Assistant de run (étape Fournisseur) -------------------------------------

function memoryKeyStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }
}

/**
 * Rend #/espace/nouveau-run et avance jusqu'à l'étape « Fournisseur ». La session
 * (connectée ou non) est celle du faux serveur installé par le test.
 */
async function renderWizard({ connected, keyStorage = memoryKeyStorage(), bundleCalls = [] }) {
  const portfolioStore = createPortfolioStore(createMemoryAdapter(), { id: () => 'p-1' })
  await portfolioStore.create({
    titre: 'Mon journal',
    segments: [{ date: '2026-01-05', texte: 'Texte de la journée.', debut: 0, fin: 10 }],
  })
  const deps = {
    portfolioStore,
    keyStorage,
    loadReferentiel: async () => ({ doc: referentiel, origin: 'bundled' }),
    providerBundleFactory: (options) => {
      bundleCalls.push(options)
      return {
        provider: createMockProvider({
          responses: ({ prompt }) =>
            prompt.includes('SYNTHÈSE KAIROS')
              ? JSON.stringify(day05.kairos)
              : JSON.stringify(day05.poles[Number(prompt.match(/# Pôle (\d) — /)[1]) - 1]),
        }),
        prime: null,
        model: 'mock-cartographe',
        maxTokens: 8192,
      }
    },
    runStorageFactory: () => createMemoryStorage(),
    cartoStoreLoader: async () => ({ saveCartography: async () => ({ id: 'c' }), listCartographies: async () => [] }),
    navigate: vi.fn(),
  }
  render(<EspaceView section="nouveau-run" deps={{ runWizardDeps: deps }} />)
  await screen.findByTestId(connected ? 'espace-connecte' : 'espace-anonyme')

  // (a) portfolio, (b) version de prompt (repli embarqué : le faux serveur n'a pas de paquets).
  fireEvent.click(await screen.findByRole('radio', { name: /Mon journal/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('packages-fallback')
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('step-fournisseur')
  return { keyStorage, bundleCalls }
}

async function launchFromProviderStep() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('run-estimate')
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('step-execution')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lancer le run' }))
  })
}

describe('UC-CPT-04 — la clé dans l’assistant de run', () => {
  it('UC-CPT-04-F13 — nominal : sans compte, la clé mémorisée dans ce navigateur est pré-remplie, la page dit qu’elle y reste, plus de synchronisation ni de récupération ; elle sert au run et ne part jamais vers humanome', async () => {
    const api = installFakeAccountApi()
    const { keyStorage, bundleCalls } = await renderWizard({
      connected: false,
      keyStorage: memoryKeyStorage({ 'humanome-keys': JSON.stringify({ anthropic: 'sk-ant-locale' }) }),
    })

    expect(screen.getByLabelText('Clé API').value).toBe('sk-ant-locale')
    expect(screen.getByRole('checkbox', { name: /Mémoriser la clé dans ce navigateur/ }).checked).toBe(true)
    expect(screen.getByTestId('cle-reste-navigateur').textContent).toBe(R1)
    expect(screen.queryByRole('checkbox', { name: /Synchroniser sur le serveur/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Récupérer la clé depuis le serveur' })).toBeNull()

    // Nouvelle clé saisie : mémorisée au lancement, transmise au seul fournisseur.
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-nouvelle' } })
    await launchFromProviderStep()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    expect(JSON.parse(keyStorage.map.get('humanome-keys'))).toEqual({ anthropic: 'sk-ant-nouvelle' })
    expect(bundleCalls[0]).toMatchObject({ mode: 'cle', provider: 'anthropic', apiKey: 'sk-ant-nouvelle' })
    expect(api.calls.filter((c) => c.path.startsWith('keys'))).toHaveLength(0)
  }, 20000)

  it('UC-CPT-04-F14 — RG1 : connecté, la page ne propose rien de plus — aucune requête /api/keys, ni PUT ni GET ; la clé gardée dans ce navigateur', async () => {
    const api = installFakeAccountApi({ users: [{ ...ADA, keys: { anthropic: 'sk-ant-du-serveur' } }], loggedInAs: ADA.email })
    const { keyStorage, bundleCalls } = await renderWizard({ connected: true })

    expect(screen.getByLabelText('Clé API').value).toBe('') // la clé gardée sur le serveur n'est plus lue
    expect(screen.queryByRole('checkbox', { name: /Synchroniser sur le serveur/ })).toBeNull()
    expect(screen.getByTestId('cle-reste-navigateur').textContent).toBe(R1)
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-par-defaut' } })
    await launchFromProviderStep()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    expect(api.calls.filter((c) => c.path.startsWith('keys'))).toHaveLength(0)
    expect(JSON.parse(keyStorage.map.get('humanome-keys'))).toEqual({ anthropic: 'sk-ant-par-defaut' })
    expect(bundleCalls[0]).toMatchObject({ mode: 'cle', provider: 'anthropic', apiKey: 'sk-ant-par-defaut' })
  }, 20000)
})

describe('UC-CPT-04 — section « Clés API » du profil', () => {
  it('UC-CPT-04-F15 — A1, A3 : la section dit que la clé reste dans le navigateur, liste les clés gardées « à supprimer » (date de purge après l’avis) ; « Supprimer du serveur » → DELETE + CSRF ; 404 affiché ; clé locale intacte', async () => {
    const local = JSON.stringify({ anthropic: 'sk-ant-locale' })
    localStorage.setItem('humanome-keys', local)
    const { api, section } = await openKeysSection({
      users: [{ ...ADA, keys: { anthropic: 'sk-ant-serveur', openai: { apiKey: 'sk-openai-serveur', avisPurgeAt: '2026-10-22T08:00:00' } } }],
    })
    await section.findByText('Anthropic (Claude)', { selector: '.account-keys-provider' })
    expect(section.getByTestId('cle-reste-navigateur').textContent).toBe(R1)
    expect(section.queryByLabelText('Clé API')).toBeNull() // plus de formulaire d'ajout
    expect(section.getByText(/sont à supprimer/)).toBeDefined()
    expect(section.getByText(/supprimée d’office à partir du 2026-11-21/)).toBeDefined()

    // E4 depuis la section : l'entrée a disparu entre-temps (autre navigateur).
    api.failNext('DELETE keys/anthropic', jsonResponse(404, { error: 'Aucune clé enregistrée pour ce fournisseur' }))
    const [supprimerAnthropic] = section.getAllByRole('button', { name: 'Supprimer du serveur' })
    // en deux temps : armer, puis confirmer
    fireEvent.click(supprimerAnthropic)
    await act(async () => {
      fireEvent.click(section.getByRole('button', { name: 'Confirmer la suppression' }))
    })
    expect((await section.findByRole('alert')).textContent).toBe('Aucune clé enregistrée pour ce fournisseur')

    fireEvent.click(section.getAllByRole('button', { name: 'Supprimer du serveur' })[0])
    await act(async () => {
      fireEvent.click(section.getByRole('button', { name: 'Confirmer la suppression' }))
    })

    expect(await section.findByText('Clé Anthropic (Claude) supprimée du serveur.')).toBeDefined()
    const deletes = api.callsTo('keys/anthropic', 'DELETE')
    expect(deletes).toHaveLength(2)
    expect(deletes[1].headers['X-CSRF-Token']).toBe(api.session.csrf)
    expect(localStorage.getItem('humanome-keys')).toBe(local) // la suppression serveur ne touche pas le local
    expect(screen.queryByText(/sk-ant-serveur|sk-openai-serveur/)).toBeNull()
  })

  it('UC-CPT-04-F16 — A2 : « Recopier dans ce navigateur, puis supprimer » → GET keys/{fournisseur} puis DELETE ; la clé est dans humanome-keys, celle que l’assistant pré-remplit ; plus rien sur le serveur', async () => {
    const { api, section } = await openKeysSection({ users: [{ ...ADA, keys: { anthropic: 'sk-ant-serveur' } }] })
    await act(async () => {
      fireEvent.click(await section.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' }))
    })

    expect(await section.findByText('Clé Anthropic (Claude) recopiée dans ce navigateur, puis supprimée du serveur.')).toBeDefined()
    expect(api.calls.filter((c) => c.path.startsWith('keys/')).map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET keys/anthropic',
      'DELETE keys/anthropic',
    ])
    expect(JSON.parse(localStorage.getItem('humanome-keys'))).toEqual({ anthropic: 'sk-ant-serveur' })
    expect(await section.findByText('Aucune clé gardée sur le serveur.')).toBeDefined()
    expect(screen.queryByText(/sk-ant-serveur/)).toBeNull()
  })

  it('UC-CPT-04-F17 — E4 : la clé à recopier a disparu du serveur (404) → message, rien n’est supprimé ni écrit dans ce navigateur', async () => {
    const { api, section } = await openKeysSection({ users: [{ ...ADA, keys: { anthropic: 'sk-ant-serveur' } }] })
    api.failNext('GET keys/anthropic', jsonResponse(404, { error: 'Aucune clé enregistrée pour ce fournisseur' }))
    await act(async () => {
      fireEvent.click(await section.findByRole('button', { name: 'Recopier dans ce navigateur, puis supprimer' }))
    })

    expect((await section.findByRole('alert')).textContent).toBe('Aucune clé enregistrée pour ce fournisseur')
    expect(api.callsTo('keys/anthropic', 'DELETE')).toHaveLength(0)
    expect(localStorage.getItem('humanome-keys')).toBeNull()
  })

  it('UC-CPT-04-F18 — E1 : stockage serveur non configuré (503) → message explicite dans la section', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    api.override('GET keys', () => jsonResponse(503, { error: 'Stockage de clés non configuré' }))
    window.location.hash = '#/compte'
    render(<App lib={fakeLib} />)
    const section = within(await screen.findByRole('region', { name: 'Clés API' }))

    expect((await section.findByRole('alert')).textContent).toBe('Stockage de clés non configuré')
    expect(section.getByText('Aucune clé gardée sur le serveur.')).toBeDefined()
  })
})

describe('UC-CPT-04 — les clés et Twin9 (ADR-013)', () => {
  it('UC-CPT-04-F19 — A6 : la section dit que Twin9, qui tourne sur le serveur, part avec la clé de la plateforme ; elle ne demande aucune clé, Mistral AI comprise', async () => {
    const { section } = await openKeysSection()
    await section.findByText('Aucune clé gardée sur le serveur.')
    expect(section.getByText(/L’analyse approfondie Twin9, qui tourne sur le serveur, part avec la clé de la plateforme/)).toBeDefined()
    expect(section.queryByLabelText('Fournisseur')).toBeNull()
    expect(section.queryByRole('textbox')).toBeNull()
  })
})
