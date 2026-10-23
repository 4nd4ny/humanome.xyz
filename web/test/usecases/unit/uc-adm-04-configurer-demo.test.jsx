// UC-ADM-04 — Configurer la démo publique : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-04-configurer-demo.md
//
// Code sollicité appelé directement : les appels de admin-api.js
// (GET/PUT/DELETE api/admin/demo-config, geste « interrupteur »), la
// construction du PUT partiel par le formulaire de ReglagesSection (rendu
// isolé, réseau injecté par fetchFn), ses contrôles côté client (modèle libre
// vide, champ vide ou non numérique) et l'affichage de la configuration
// serveur par ConfigSection (secrets réduits à « configuré / absent »).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  fetchDemoConfig,
  fetchWaitlist,
  liftWaitlist,
  liftWaitlisted,
  resetDemoConfig,
  saveDemoConfig,
  toggleDemo,
} from '../../../src/views/admin/admin-api.js'
import ReglagesSection from '../../../src/views/admin/ReglagesSection.jsx'
import ConfigSection from '../../../src/views/admin/ConfigSection.jsx'
import { jsonResponse } from '../support/adm.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const DEMO = {
  effective: {
    enabled: true,
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    sortieMax: 64000,
    maxInputChars: 20000,
    perIpPerHour: 20,
    dailyGlobalTokens: 2000000,
    dailyBudgetUsd: 5,
    powDifficultyBits: 20,
    upstreamTimeoutSeconds: 60,
  },
  sources: { model: 'fichier', enabled: 'fichier' },
  modelRefuse: [],
  allowedModels: ['claude-haiku-5-5', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5'],
  apiKeyConfigured: true,
}

const SETTINGS = {
  defaultPackage: { stored: null, proposal: null, effective: null },
  worker: { jobsInQueue: 0, byStatus: {}, activeRuns: 0, lastActivity: null },
  config: {},
}

/** Réseau de ReglagesSection : chargement + PUT observé. */
function reglagesFetch(demo = DEMO, onPut = () => jsonResponse(200, demo)) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    if (key === 'GET api/admin/settings') return jsonResponse(200, SETTINGS)
    if (key === 'GET api/prompt-packages') return jsonResponse(200, [])
    if (key === 'GET api/admin/demo-config') return jsonResponse(200, demo)
    if (key === 'PUT api/admin/demo-config') return onPut(init)
    throw new Error(`route non mockée : ${key}`)
  })
}

async function renderReglages(fetchFn) {
  render(<ReglagesSection fetchFn={fetchFn} />)
  const toggle = await screen.findByRole('switch')
  // L'effet qui recopie la configuration dans le brouillon (AN-2) doit avoir joué
  // avant la première saisie : sous charge, il passait après et l'effaçait.
  await act(async () => {})
  return toggle
}

const puts = (fetchFn) => fetchFn.mock.calls.filter(([, init]) => init?.method === 'PUT')

describe('UC-ADM-04 — client admin-api.js', () => {
  it('UC-ADM-04-U13 — GET / PUT {patch} / DELETE sur api/admin/demo-config, jeton CSRF sur les mutations', async () => {
    await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-demo' }) })
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, DEMO))

    await fetchDemoConfig(fetchFn)
    await saveDemoConfig({ perIpPerHour: 5 }, fetchFn)
    await resetDemoConfig(fetchFn)

    const [[getUrl, getInit], [putUrl, putInit], [delUrl, delInit]] = fetchFn.mock.calls
    expect([getUrl, getInit.method]).toEqual(['api/admin/demo-config', 'GET'])
    expect(getInit.headers['X-CSRF-Token']).toBeUndefined()
    expect([putUrl, putInit.method, JSON.parse(putInit.body)]).toEqual(['api/admin/demo-config', 'PUT', { perIpPerHour: 5 }])
    expect(putInit.headers['X-CSRF-Token']).toBe('csrf-demo')
    expect([delUrl, delInit.method, delInit.body]).toEqual(['api/admin/demo-config', 'DELETE', undefined])
    expect(delInit.headers['X-CSRF-Token']).toBe('csrf-demo')
  })

  it('UC-ADM-04-U14 — toggleDemo : le geste envoie un PUT {enabled} booléen et rien d’autre', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, DEMO))

    await toggleDemo(0, fetchFn)
    await toggleDemo('oui', fetchFn)

    expect(fetchFn.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['api/admin/demo-config', 'PUT'],
      ['api/admin/demo-config', 'PUT'],
    ])
    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([{ enabled: false }, { enabled: true }])
  })
})

describe('UC-ADM-04 — formulaire de la démo (ReglagesSection isolé)', () => {
  it('UC-ADM-04-U31 — RG10 : le plafond mensuel des crédits offerts se règle comme les autres (origine, bornes 0 – 1000, PUT partiel) et le grand livre du mois s’affiche en lecture seule ; une API qui ne le donne pas ne montre pas le champ', async () => {
    const mois = { month: '2026-10', capUsd: 20, spentUsd: 3.2, reservedUsd: 0.32, remainingUsd: 16.48, calls: 41, refusals: 0, exhausted: false }
    const demo = {
      ...DEMO,
      effective: { ...DEMO.effective, monthlyFreeUsd: 20 },
      sources: { ...DEMO.sources, monthlyFreeUsd: 'env' },
      freeCreditsMonth: mois,
    }
    const fetchFn = reglagesFetch(demo)
    await renderReglages(fetchFn)

    const champ = screen.getByLabelText('Crédits offerts / mois (USD)')
    expect([champ.value, champ.min, champ.max, champ.step]).toEqual(['20', '0', '1000', '0.01'])
    expect(screen.getByTestId('demo-offerts-mois').textContent).toBe(
      'Crédits offerts ce mois-ci (2026-10, mois UTC) : 3.20 $ dépensés, 0.32 $ réservés par les appels en cours, ' +
        '16.48 $ restants sur 20.00 $ — 41 appels, 0 refus.',
    )
    fireEvent.change(champ, { target: { value: '0' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })
    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ monthlyFreeUsd: 0 })
    cleanup()

    await renderReglages(reglagesFetch({ ...demo, freeCreditsMonth: { ...mois, capUsd: 0, remainingUsd: 0, exhausted: true } }))
    expect(screen.getByTestId('demo-offerts-mois').textContent).toContain('Épuisés : l’Essayer, la démo et le tuteur répondent « revenez le 1er ».')
    cleanup()

    await renderReglages(reglagesFetch())
    expect(screen.queryByLabelText('Crédits offerts / mois (USD)')).toBeNull()
    expect(screen.queryByTestId('demo-offerts-mois')).toBeNull()
  })

  it('UC-ADM-04-U15 — PUT partiel : seuls les champs modifiés partent, convertis en nombres', async () => {
    const fetchFn = reglagesFetch()
    await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Entrée max (caractères)'), { target: { value: '40960' } })
    fireEvent.change(screen.getByLabelText('Budget quotidien (USD)'), { target: { value: '2.5' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect(puts(fetchFn)).toHaveLength(1)
    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ maxInputChars: 40960, dailyBudgetUsd: 2.5 })
    expect(await screen.findByText('Réglages de la démo enregistrés (effet immédiat).')).toBeTruthy()
  })

  it('UC-ADM-04-U16 — modèle hors liste : « autre… » présélectionné avec la valeur ; sans modification, aucun PUT', async () => {
    const fetchFn = reglagesFetch({ ...DEMO, effective: { ...DEMO.effective, model: 'claude-haiku-6' } })
    await renderReglages(fetchFn)

    expect(screen.getByLabelText('Modèle').value).toBe('__autre__')
    expect(screen.getByLabelText('Identifiant de modèle libre').value).toBe('claude-haiku-6')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Aucune modification à enregistrer.')).toBeTruthy()
    expect(puts(fetchFn)).toHaveLength(0)
  })

  it('UC-ADM-04-U17 — pendant l’enregistrement, interrupteur et boutons sont inactifs (pas de double envoi)', async () => {
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const fetchFn = reglagesFetch(DEMO, () => pending)
    const toggle = await renderReglages(fetchFn)

    fireEvent.click(toggle)

    expect(screen.getByRole('switch').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Enregistrer' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Réinitialiser/ }).disabled).toBe(true)
    await act(async () => {
      release(jsonResponse(200, { ...DEMO, effective: { ...DEMO.effective, enabled: false } }))
    })
    expect(await screen.findByText('Démo publique désactivée.')).toBeTruthy()
    expect(screen.getByRole('switch').disabled).toBe(false)
  })

  it('UC-ADM-04-U18 — (comportement actuel, limite L2) une décimale dans un champ entier est tronquée avant l’envoi', async () => {
    const fetchFn = reglagesFetch()
    await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Requêtes / IP / heure'), { target: { value: '12.7' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ perIpPerHour: 12 })
  })

  it('UC-ADM-04-U25 — E3 (client) : « autre… » avec un identifiant libre vidé → « Le modèle ne peut pas être vide. », aucun PUT', async () => {
    const fetchFn = reglagesFetch()
    await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: '__autre__' } })
    expect(screen.getByLabelText('Identifiant de modèle libre').value).toBe('claude-haiku-4-5-20251001')
    fireEvent.change(screen.getByLabelText('Identifiant de modèle libre'), { target: { value: '   ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Le modèle ne peut pas être vide.')
    expect(puts(fetchFn)).toHaveLength(0)
  })

  it('UC-ADM-04-U26 — « Valeur invalide » si le brouillon n’est pas numérique (valeur serveur nulle) ; une virgule dans un champ number est assainie en vide par le navigateur → « Champ vide »', async () => {
    const fetchFn = reglagesFetch({ ...DEMO, effective: { ...DEMO.effective, maxInputChars: null } })
    await renderReglages(fetchFn)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Valeur invalide pour « Entrée max (caractères) ».')
    cleanup()

    const other = reglagesFetch()
    await renderReglages(other)
    // Assainissement HTML d'un <input type="number"> : « 2,5 » n'est pas un
    // nombre flottant valide → valeur '' ; le remplacement « , » → « . » du
    // code n'est donc jamais atteint depuis ce champ.
    fireEvent.change(screen.getByLabelText('Budget quotidien (USD)'), { target: { value: '2,5' } })
    expect(screen.getByLabelText('Budget quotidien (USD)').value).toBe('')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Champ vide : Budget quotidien (USD).')
    expect(puts(fetchFn)).toHaveLength(0)
    expect(puts(other)).toHaveLength(0)
  })

  it('UC-ADM-04-U27 — (anomalie AN-2, comportement actuel) basculer l’interrupteur efface les saisies non enregistrées du formulaire', async () => {
    const fetchFn = reglagesFetch(DEMO, () => jsonResponse(200, { ...DEMO, effective: { ...DEMO.effective, enabled: false } }))
    const toggle = await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Entrée max (caractères)'), { target: { value: '40960' } })
    expect(screen.getByLabelText('Entrée max (caractères)').value).toBe('40960')
    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(await screen.findByText('Démo publique désactivée.')).toBeTruthy()
    // Le geste n'envoie que {enabled} : la saisie en cours n'est pas enregistrée.
    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ enabled: false })
    // La réponse remplace la config, l'effet draftFrom(config) écrase le brouillon.
    expect(screen.getByLabelText('Entrée max (caractères)').value).toBe('20000')
  })
})

describe('UC-ADM-04 — liste d’attente des inscriptions (sprint 7, S7a-2)', () => {
  it('UC-ADM-04-U32 — admin-api.js : GET api/admin/waitlist normalisé, « Lever » POST …/{id}/lift et « Tout lever » POST …/lift avec le jeton CSRF', async () => {
    await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-attente' }) })
    const fetchFn = vi.fn(async (url, init = {}) => {
      if (url === 'api/admin/waitlist' && (init.method ?? 'GET') === 'GET') {
        return jsonResponse(200, { month: '2026-10', signupsOpen: false, nextLift: '2026-11-01', total: 1, accounts: [{ id: 7 }] })
      }
      return jsonResponse(200, { ok: true })
    })
    expect(await fetchWaitlist(fetchFn)).toEqual({
      month: '2026-10',
      signupsOpen: false,
      nextLift: '2026-11-01',
      total: 1,
      accounts: [{ id: 7 }],
    })
    await liftWaitlisted(7, fetchFn)
    await liftWaitlist(fetchFn)
    const [, one] = fetchFn.mock.calls[1]
    const [, all] = fetchFn.mock.calls[2]
    expect([fetchFn.mock.calls[1][0], one.method, one.headers['X-CSRF-Token']]).toEqual(['api/admin/waitlist/7/lift', 'POST', 'csrf-attente'])
    expect([fetchFn.mock.calls[2][0], all.method, all.headers['X-CSRF-Token']]).toEqual(['api/admin/waitlist/lift', 'POST', 'csrf-attente'])

    // Réponse partielle : des valeurs sûres (inscriptions ouvertes, liste vide).
    expect(await fetchWaitlist(async () => jsonResponse(200, {}))).toEqual({
      month: '',
      signupsOpen: true,
      nextLift: '',
      total: 0,
      accounts: [],
    })
  })

  it('UC-ADM-04-U33 — RG11 : ReglagesSection — le grand livre dit « Inscriptions : en liste d’attente » et le seuil ; la liste suit l’ordre d’inscription, « Lever » un compte puis « Tout lever » rechargent la liste et le disent ; une API sans la route : une note, aucune alerte', async () => {
    await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-attente' }) })
    const mois = { month: '2026-10', capUsd: 20, spentUsd: 19.8, reservedUsd: 0, remainingUsd: 0.2, calls: 900, refusals: 3,
      exhausted: false, signupsOpen: false, signupFloorUsd: 0.320065 }
    const demo = { ...DEMO, effective: { ...DEMO.effective, monthlyFreeUsd: 20 }, freeCreditsMonth: mois }
    let accounts = [
      { id: 7, email: 'ada@example.org', displayName: 'Ada', createdAt: '2026-10-20T08:00:00', waitlistedAt: '2026-10-20T06:00:00Z' },
      { id: 9, email: 'bob@example.org', displayName: 'Bob', createdAt: '2026-10-21T08:00:00', waitlistedAt: '2026-10-21T06:00:00Z' },
    ]
    const base = reglagesFetch(demo)
    const fetchFn = vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`
      if (key === 'GET api/admin/waitlist') {
        return jsonResponse(200, { month: '2026-10', signupsOpen: false, nextLift: '2026-11-01', total: accounts.length, accounts })
      }
      if (key === 'POST api/admin/waitlist/7/lift') {
        accounts = accounts.filter((a) => a.id !== 7)
        return jsonResponse(200, { id: 7, status: 'lifted' })
      }
      if (key === 'POST api/admin/waitlist/lift') {
        const lifted = accounts.length
        accounts = []
        return jsonResponse(200, { lifted, remaining: 0 })
      }
      return base(url, init)
    })
    await renderReglages(fetchFn)

    expect(screen.getByTestId('demo-offerts-inscriptions').textContent).toBe(
      ' Inscriptions : en liste d’attente (fermées quand le plafond moins le dépensé ne couvre plus le plus petit appel de l’Essayer, 0.32 $).',
    )
    const block = screen.getByTestId('admin-waitlist')
    await within(block).findByText('ada@example.org')
    expect(block.textContent).toContain('Inscriptions : en liste d’attente.')
    expect(block.textContent).toContain('la liste est levée le 1er novembre 2026 (mois UTC)')
    expect(within(block).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      expect.stringContaining('ada@example.org'),
      expect.stringContaining('bob@example.org'),
    ])

    await act(async () => {
      fireEvent.click(within(block).getByRole('button', { name: 'Lever ada@example.org' }))
    })
    expect(await within(block).findByText('ada@example.org : levé, son code d’activation part par email.')).toBeDefined()
    expect(within(block).queryByRole('button', { name: 'Lever ada@example.org' })).toBeNull()
    const [, init] = fetchFn.mock.calls.find(([url]) => url === 'api/admin/waitlist/7/lift')
    expect([init.method, init.headers['X-CSRF-Token']]).toEqual(['POST', 'csrf-attente'])

    await act(async () => {
      fireEvent.click(within(block).getByRole('button', { name: 'Tout lever (1)' }))
    })
    expect(await within(block).findByText('1 compte levé.')).toBeDefined()
    expect(within(block).getByTestId('waitlist-empty').textContent).toBe('Aucune inscription en attente.')
    cleanup()

    // L'API d'avant (sans la route) : le reste des réglages s'affiche, une note, aucune alerte.
    await renderReglages(reglagesFetch(demo))
    expect(await screen.findByTestId('waitlist-unavailable')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('UC-ADM-04-U34 — RG11 : ReglagesSection — un courriel de code que le transport refuse : « Lever » affiche le message du serveur (502) en alerte et le compte reste listé ; « Tout lever » arrêté au premier refus (failed) le dit, sans prétendre le compte levé', async () => {
    await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-attente' }) })
    const accounts = [
      { id: 7, email: 'ada@example.org', displayName: 'Ada', createdAt: '2026-10-20T08:00:00', waitlistedAt: '2026-10-20T06:00:00Z' },
      { id: 9, email: 'bob@example.org', displayName: 'Bob', createdAt: '2026-10-21T08:00:00', waitlistedAt: '2026-10-21T06:00:00Z' },
    ]
    const refus = 'Le courriel du code d’activation n’est pas parti : le compte reste en liste d’attente. Réessayez plus tard.'
    const base = reglagesFetch(DEMO)
    const fetchFn = vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`
      if (key === 'GET api/admin/waitlist') {
        return jsonResponse(200, { month: '2026-10', signupsOpen: false, nextLift: '2026-11-01', total: accounts.length, accounts })
      }
      if (key === 'POST api/admin/waitlist/9/lift') {
        return jsonResponse(502, { error: refus })
      }
      if (key === 'POST api/admin/waitlist/lift') {
        return jsonResponse(200, { lifted: 0, failed: 1, remaining: 2 })
      }
      return base(url, init)
    })
    await renderReglages(fetchFn)
    const block = screen.getByTestId('admin-waitlist')
    await within(block).findByText('bob@example.org')

    await act(async () => {
      fireEvent.click(within(block).getByRole('button', { name: 'Lever bob@example.org' }))
    })
    expect((await within(block).findByRole('alert')).textContent).toBe(refus)
    expect(within(block).queryByRole('status')).toBeNull()
    expect(within(block).getByRole('button', { name: 'Lever bob@example.org' })).toBeDefined()

    await act(async () => {
      fireEvent.click(within(block).getByRole('button', { name: 'Tout lever (2)' }))
    })
    expect((await within(block).findByRole('status')).textContent).toBe(
      '0 compte levé ; un courriel de code n’est pas parti : ce compte et les suivants restent en liste d’attente, réessayez plus tard.',
    )
    expect(within(block).getAllByRole('row')).toHaveLength(3)
  })
})

describe('UC-ADM-04 — configuration serveur (ConfigSection isolé)', () => {
  const CONFIG = {
    application: {
      APP_ENV: { env: 'APP_ENV', description: 'Environnement.', secret: false, default: 'production', value: '' },
    },
    secrets: {
      MIGRATE_TOKEN: { env: 'MIGRATE_TOKEN', description: 'Jeton de déploiement.', secret: true, configured: true },
      ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY', description: 'Clé plateforme.', secret: true, configured: false },
    },
    llm: { DEMO_ENABLED: { env: 'DEMO_ENABLED', description: 'Interrupteur.', secret: false, default: '', value: '0' } },
  }

  it('UC-ADM-04-U19 — groupes libellés en français, secrets « configuré / absent » seulement, défaut affiché si vide', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { ...SETTINGS, config: CONFIG }))
    render(<ConfigSection fetchFn={fetchFn} />)

    expect(await screen.findByRole('heading', { name: 'Configuration serveur' })).toBeTruthy()
    for (const label of ['Application', 'Secrets (hors git)', 'LLM / démo']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy()
    }
    expect(screen.getByTestId('secret-MIGRATE_TOKEN').textContent).toBe('configuré')
    expect(screen.getByTestId('secret-ANTHROPIC_API_KEY').textContent).toBe('absent')
    expect(screen.getByText('(défaut : production)')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy() // DEMO_ENABLED=0 : la couche env de la démo
    expect(fetchFn.mock.calls[0][0]).toBe('api/admin/settings')
  })

  it('UC-ADM-04-U20 — erreurs de chargement : message de copie statique, sinon « Chargement impossible. »', async () => {
    render(<ConfigSection fetchFn={vi.fn().mockRejectedValue(new TypeError('offline'))} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/copie statique/)
    cleanup()

    render(<ConfigSection fetchFn={vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Erreur interne' }))} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Chargement impossible.')
  })
})
