// UC-ADM-04 — Configurer la démo publique : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-04-configurer-demo.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'administrateur
// ouvre #/admin/reglages, bascule l'interrupteur de la démo, règle modèle et
// plafonds, réinitialise ; puis consulte #/admin/config. Le réseau est simulé
// par un faux serveur en mémoire qui reproduit le contrat de
// /api/admin/demo-config (fusion des surcharges, origine « base » /
// « fichier », 422 hors bornes, CSRF exigé, DELETE = retour au fichier).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, callsTo, createAdminBackend, jsonResponse } from '../support/adm.js'

const FILE = {
  enabled: true,
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  maxInputChars: 20000,
  perIpPerHour: 20,
  dailyGlobalTokens: 2000000,
  dailyBudgetUsd: 5,
  powDifficultyBits: 20,
  upstreamTimeoutSeconds: 60,
}

/** La sortie d'un appel : le maximum du modèle (2026-10-21), un affichage, pas un réglage. */
// L'interrupteur de la démo, par son nom : le tiroir de l'application porte
// aussi un interrupteur, « Mode expert » (sprint 1, 2026-10-22).
const DEMO_SWITCH = { name: /^Démo publique/ }

const sortieMax = (model) => (model.startsWith('claude-haiku-4-5') ? 64000 : 128000)

/** Faux /api/admin/demo-config : base > fichier, bornes de maxInputChars, un Haiku seulement. */
function demoRoutes({ apiKeyConfigured = true } = {}) {
  let overrides = {}
  const view = () => ({
    effective: { ...FILE, ...overrides, sortieMax: sortieMax(overrides.model ?? FILE.model) },
    sources: Object.fromEntries(Object.keys(FILE).map((k) => [k, k in overrides ? 'base' : 'fichier'])),
    modelRefuse: [],
    allowedModels: ['claude-haiku-5-5', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5'],
    apiKeyConfigured,
  })
  const guard = (init) => init.headers?.['X-CSRF-Token'] === CSRF
  return {
    'GET api/admin/settings': jsonResponse(200, {
      defaultPackage: { stored: null, proposal: null, effective: null },
      worker: { jobsInQueue: 0, byStatus: {}, activeRuns: 0, lastActivity: null },
      config: {
        secrets: {
          ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY', description: 'Clé plateforme.', secret: true, configured: true },
          POW_SECRET: { env: 'POW_SECRET', description: 'Secret PoW.', secret: true, configured: false },
        },
        llm: { DEMO_ENABLED: { env: 'DEMO_ENABLED', description: 'Interrupteur.', secret: false, default: '', value: '' } },
      },
    }),
    'GET api/prompt-packages': jsonResponse(200, []),
    'GET api/admin/demo-config': () => jsonResponse(200, view()),
    'PUT api/admin/demo-config': (init) => {
      if (!guard(init)) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
      const patch = JSON.parse(init.body)
      const chars = patch.maxInputChars
      if (chars !== undefined && (chars < 1000 || chars > 4000000)) {
        return jsonResponse(422, { error: 'maxInputChars doit être compris entre 1000 et 4000000.' })
      }
      overrides = { ...overrides, ...patch }
      return jsonResponse(200, view())
    },
    'DELETE api/admin/demo-config': (init) => {
      if (!guard(init)) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
      overrides = {}
      return jsonResponse(200, view())
    },
  }
}

function openAdmin(backend, hash = '#/admin/reglages') {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-04 — l’administrateur configure la démo publique', () => {
  it('UC-ADM-04-F11 — nominal (interrupteur) : un clic éteint la démo (PUT {enabled:false} + CSRF), état et origine affichés', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend)

    const toggle = await screen.findByRole('switch', DEMO_SWITCH)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.textContent).toContain('Démo publique : activée')
    expect(screen.getByText(/Clé API/).textContent).toContain('configurée')

    await click(toggle)

    expect(await screen.findByText('Démo publique désactivée.')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('switch', DEMO_SWITCH).getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByRole('switch', DEMO_SWITCH).textContent).toContain('désactivée')
    const [put] = callsTo(backend.calls, 'PUT', 'api/admin/demo-config')
    expect(JSON.parse(put.init.body)).toEqual({ enabled: false })
    expect(put.init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(screen.getAllByText('réglage base')).toHaveLength(1)
  })

  it('UC-ADM-04-F12 — nominal (réglages) : modèle (un Haiku) et entrée max modifiés → PUT partiel, message, badges « réglage base », sortie du modèle affichée', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend)
    await screen.findByRole('switch', DEMO_SWITCH)
    expect(screen.getByTestId('demo-sortie').textContent).toMatch(/64\s000 jetons/)

    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'claude-haiku-5-5' } })
    fireEvent.change(screen.getByLabelText('Entrée max (caractères)'), { target: { value: '40960' } })
    await click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Réglages de la démo enregistrés (effet immédiat).')).toBeTruthy()
    const [put] = callsTo(backend.calls, 'PUT', 'api/admin/demo-config')
    expect(JSON.parse(put.init.body)).toEqual({ model: 'claude-haiku-5-5', maxInputChars: 40960 })
    await waitFor(() => expect(screen.getAllByText('réglage base')).toHaveLength(2))
    expect(screen.getByLabelText('Entrée max (caractères)').value).toBe('40960')
    expect(screen.getByTestId('demo-sortie').textContent).toMatch(/128\s000 jetons/)
  })

  it('UC-ADM-04-F13 — A2 : « Réinitialiser » supprime les surcharges (DELETE) et rend la main au fichier', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend)
    await click(await screen.findByRole('switch', DEMO_SWITCH))
    await screen.findByText('Démo publique désactivée.')

    await click(screen.getByRole('button', { name: 'Réinitialiser (revenir aux valeurs env/fichier)' }))

    expect(await screen.findByText('Réglages de la démo réinitialisés (valeurs env/fichier).')).toBeTruthy()
    expect(callsTo(backend.calls, 'DELETE', 'api/admin/demo-config')).toHaveLength(1)
    expect(screen.queryByText('réglage base')).toBeNull()
    expect(screen.getByRole('switch', DEMO_SWITCH).getAttribute('aria-checked')).toBe('true')
  })

  it('UC-ADM-04-F14 — E3 : valeur hors bornes → message du serveur, rien n’est appliqué', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend)
    await screen.findByRole('switch', DEMO_SWITCH)

    fireEvent.change(screen.getByLabelText('Entrée max (caractères)'), { target: { value: '9999999' } })
    await click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect((await screen.findByRole('alert')).textContent).toBe('maxInputChars doit être compris entre 1000 et 4000000.')
    expect(screen.queryByText('réglage base')).toBeNull()
  })

  it('UC-ADM-04-F15 — E3 (client) : champ vide refusé localement, aucune requête PUT', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend)
    await screen.findByRole('switch', DEMO_SWITCH)

    fireEvent.change(screen.getByLabelText('Délai amont (secondes)'), { target: { value: '' } })
    await click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Champ vide : Délai amont (secondes).')
    expect(callsTo(backend.calls, 'PUT', 'api/admin/demo-config')).toHaveLength(0)
  })

  it('UC-ADM-04-F16 — E5 : jeton CSRF refusé → message, interrupteur inchangé', async () => {
    const routes = demoRoutes()
    routes['PUT api/admin/demo-config'] = jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
    const backend = createAdminBackend({ routes })
    openAdmin(backend)

    await click(await screen.findByRole('switch', DEMO_SWITCH))

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(screen.getByRole('switch', DEMO_SWITCH).getAttribute('aria-checked')).toBe('true')
  })

  it('UC-ADM-04-F17 — A4 : #/admin/config — couche serveur lisible, secrets réduits à « configuré / absent »', async () => {
    const backend = createAdminBackend({ routes: demoRoutes() })
    openAdmin(backend, '#/admin/config')

    expect(await screen.findByRole('heading', { name: 'Configuration serveur' })).toBeTruthy()
    expect(screen.getByTestId('secret-ANTHROPIC_API_KEY').textContent).toBe('configuré')
    expect(screen.getByTestId('secret-POW_SECRET').textContent).toBe('absent')
    expect(screen.getByText('DEMO_ENABLED')).toBeTruthy()
    expect(screen.getByText('(défaut : —)')).toBeTruthy()
  })

  it('UC-ADM-04-F18 — E1/E2 : visiteur ou compte sans rôle admin → espace réservé, aucune lecture de la configuration', async () => {
    // E1 : visiteur sans session (api/auth/me → 401).
    const visitor = createAdminBackend({ me: null, routes: demoRoutes() })
    openAdmin(visitor)
    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.getByText(/Vous n’êtes pas connecté/)).toBeTruthy()
    expect(screen.queryByRole('switch', DEMO_SWITCH)).toBeNull()
    expect(callsTo(visitor.calls, 'GET', 'api/admin/demo-config')).toHaveLength(0)
    cleanup()
    vi.unstubAllGlobals()
    resetApiClient()

    // E2 : connecté sans le rôle admin.
    const backend = createAdminBackend({
      me: { id: 5, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant', 'promptologue'] },
      routes: demoRoutes(),
    })
    openAdmin(backend)

    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.queryByText(/Vous n’êtes pas connecté/)).toBeNull()
    expect(screen.queryByRole('switch', DEMO_SWITCH)).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/demo-config')).toHaveLength(0)
  })

  it('UC-ADM-04-F19 — A6 puis A5 : modèle effectif hors liste → « autre… » présélectionné ; Enregistrer sans modification → « Aucune modification à enregistrer. », aucun PUT', async () => {
    const routes = demoRoutes()
    routes['GET api/admin/demo-config'] = jsonResponse(200, {
      effective: { ...FILE, model: 'claude-haiku-6', sortieMax: 64000 },
      sources: Object.fromEntries(Object.keys(FILE).map((k) => [k, 'fichier'])),
      modelRefuse: [],
      allowedModels: ['claude-haiku-5-5', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5'],
      apiKeyConfigured: true,
    })
    const backend = createAdminBackend({ routes })
    openAdmin(backend)
    await screen.findByRole('switch', DEMO_SWITCH)

    expect(screen.getByLabelText('Modèle').value).toBe('__autre__')
    expect(screen.getByLabelText('Identifiant de modèle libre').value).toBe('claude-haiku-6')
    await click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Aucune modification à enregistrer.')).toBeTruthy()
    expect(callsTo(backend.calls, 'PUT', 'api/admin/demo-config')).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('UC-ADM-04-F26 — A9 : la liste d’attente des inscriptions dans #/admin/reglages — comptes en attente dans l’ordre, « Lever » un compte (POST + CSRF) le retire et le dit, « Tout lever » vide la liste ; les réglages de la démo restent là', async () => {
    let waiting = [
      { id: 21, email: 'ada@example.org', displayName: 'Ada', createdAt: '2026-10-20T08:00:00', waitlistedAt: '2026-10-20T06:00:00Z' },
      { id: 22, email: 'bob@example.org', displayName: 'Bob', createdAt: '2026-10-21T08:00:00', waitlistedAt: '2026-10-21T06:00:00Z' },
      { id: 23, email: 'cid@example.org', displayName: 'Cid', createdAt: '2026-10-22T08:00:00', waitlistedAt: '2026-10-22T06:00:00Z' },
    ]
    const guard = (init) => init.headers?.['X-CSRF-Token'] === CSRF
    const routes = {
      ...demoRoutes(),
      'GET api/admin/waitlist': () =>
        jsonResponse(200, { month: '2026-10', signupsOpen: false, nextLift: '2026-11-01', total: waiting.length, accounts: waiting }),
      'POST api/admin/waitlist/22/lift': (init) => {
        if (!guard(init)) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
        waiting = waiting.filter((a) => a.id !== 22)
        return jsonResponse(200, { id: 22, status: 'lifted' })
      },
      'POST api/admin/waitlist/lift': (init) => {
        if (!guard(init)) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
        const lifted = waiting.length
        waiting = []
        return jsonResponse(200, { lifted, remaining: 0 })
      },
    }
    const backend = createAdminBackend({ routes })
    openAdmin(backend)
    await screen.findByRole('switch', DEMO_SWITCH)

    const block = await screen.findByTestId('admin-waitlist')
    await within(block).findByText('bob@example.org')
    expect(block.textContent).toContain('Inscriptions : en liste d’attente.')
    expect(within(block).getAllByRole('row').slice(1).map((r) => within(r).getByText(/@example\.org$/).textContent)).toEqual([
      'ada@example.org',
      'bob@example.org',
      'cid@example.org',
    ])

    await click(within(block).getByRole('button', { name: 'Lever bob@example.org' }))
    expect(await within(block).findByText('bob@example.org : levé, son code d’activation part par email.')).toBeTruthy()
    expect(within(block).queryByText('bob@example.org')).toBeNull()
    expect(callsTo(backend.calls, 'POST', 'api/admin/waitlist/22/lift')).toHaveLength(1)

    await click(within(block).getByRole('button', { name: 'Tout lever (2)' }))
    expect(await within(block).findByText('2 comptes levés.')).toBeTruthy()
    expect(within(block).getByText('Aucune inscription en attente.')).toBeTruthy()
    expect(screen.getByRole('switch', DEMO_SWITCH)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
