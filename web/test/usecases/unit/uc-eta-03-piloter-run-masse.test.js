// UC-ETA-03 — Lancer, suivre et annuler un run de masse : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-03-piloter-run-masse.md
//
// Code sollicité appelé directement : l'estimation de coût d'un run de masse
// (un appel par pôle du référentiel du run + le kairos par journée — 8 pour
// RESPIRE v7 —, table de prix du moteur), la normalisation du tableau
// d'avancement réel, les appels de lancement / annulation / paquets publiés,
// les constantes d'affichage (six statuts de jobs, polling 5 s), puis
// CohorteSection rendue ISOLÉMENT (coutures fetchFn, getReferentiel,
// listReferentiels) : calcul de l'estimation (taille moyenne tirée des dépôts,
// modèle, référentiel choisi), règle d'affichage du bouton « Annuler le run »
// (RunProgress) et choix du référentiel publié.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PRICING_DISCLAIMER } from '@engine/providers/index.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  cancelRun,
  DEFAULT_DAY_CHARS,
  estimateMassRun,
  fetchPublishedPackages,
  fetchRun,
  JOB_STATUS_LABELS,
  launchRun,
  SERVICE_MODEL,
} from '../../../src/views/etablissement/etablissement-api.js'
import CohorteSection, { POLL_INTERVAL_MS } from '../../../src/views/etablissement/CohorteSection.jsx'
import {
  CSRF,
  cohorteDetail,
  configProjection,
  fakeFetch,
  jsonResponse,
  membre,
  PUBLISHED_PACKAGES,
  runBoard,
} from '../support/eta.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'

/** Neuf pôles numérotés, deux compétences chacun (comme le fictif de T15). */
const NEUF = {
  id: 'fictif-neuf',
  version: '1.0.0',
  label: 'Fictif à neuf pôles',
  poles: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, nom: `Pôle fictif ${i + 1}` })),
  competences: Array.from({ length: 18 }, (_, i) => ({ code: `${Math.floor(i / 2) + 1}.0${(i % 2) + 1}`, nom: `C${i}`, pole: Math.floor(i / 2) + 1 })),
}

afterEach(() => {
  cleanup()
  resetApiClient()
})

async function primeCsrf() {
  await apiFetch('auth/me', { fetchFn: async () => jsonResponse(200, { user: {}, csrfToken: CSRF }) })
}

describe('UC-ETA-03 — estimation du coût avant lancement', () => {
  it('UC-ETA-03-U08 — estimateMassRun : un appel par pôle du référentiel + kairos par journée (RESPIRE v7 : 8, neuf pôles : 10), tokens et coût au prix du modèle, modèle hors table → coût null', () => {
    const known = estimateMassRun({ totalJournees: 3, avgDayChars: DEFAULT_DAY_CHARS, model: SERVICE_MODEL, referentiel })
    expect(known).toEqual({
      totalCalls: 24,
      tokensIn: 220000, // ceil(24 × (3 000 + 30 000) / 3,6)
      tokensOut: 24000,
      costUsd: 0.68, // 0,22 Mtok × 2 $ + 0,024 Mtok × 10 $ (Sonnet 5, page des prix du 2026-10-21)
      disclaimer: PRICING_DISCLAIMER,
    })

    // Un autre référentiel : un appel par pôle, plus le kairos.
    expect(estimateMassRun({ totalJournees: 3, model: SERVICE_MODEL, referentiel: NEUF }).totalCalls).toBe(30)

    // Modèle absent de la table de prix → coût « inconnu » (null)…
    const unknown = estimateMassRun({ totalJournees: 3, model: 'phi4:14b', referentiel })
    expect(unknown.totalCalls).toBe(24)
    expect(unknown.costUsd).toBeNull()
    // …alors que les familles locales llama/mistral/qwen sont tarifées 0.
    expect(estimateMassRun({ totalJournees: 3, model: 'llama3.1:70b', referentiel }).costUsd).toBe(0)

    expect(estimateMassRun({ totalJournees: 'n/a', model: SERVICE_MODEL, referentiel })).toMatchObject({
      totalCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    })
  })
})

describe('UC-ETA-03 — client API du run', () => {
  it('UC-ETA-03-U09 — fetchRun normalise le tableau réel (status → statut, 6 statuts, erreurs {userId, erreur})', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        runBoard({
          status: 'failed',
          jobs: { queued: 0, running: 0, done: 2, failed: 1, budget_exceeded: 0, cancelled: 0 },
          coutUsd: 0.42,
          erreurs: [{ jobId: 5, userId: 12, date: '2026-01-07', status: 'failed', attempts: 3, erreur: 'pôle 3 — panne' }],
        }),
      ),
    )

    const run = await fetchRun(42, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/etablissement/runs/42')
    expect(run).toEqual({
      runId: 42,
      statut: 'failed',
      jobs: { queued: 0, running: 0, done: 2, failed: 1, budget_exceeded: 0, cancelled: 0 },
      coutUsd: 0.42,
      // Le tableau réel ne porte que l'identifiant du membre (voir Limites).
      erreurs: [{ membre: '12', message: 'pôle 3 — panne' }],
    })
  })

  it('UC-ETA-03-U10 — launchRun et cancelRun : POST avec CSRF sur les routes du run', async () => {
    await primeCsrf()
    const launch = vi.fn().mockResolvedValue(jsonResponse(201, { runId: 42, jobs: 3 }))
    const body = { promptPackageId: 'aurora-v3-reconstruit', promptPackageVersion: '1.0.0', membres: [12] }

    expect(await launchRun(7, body, launch)).toEqual({ runId: 42, jobs: 3 })
    expect(launch.mock.calls[0][0]).toBe('api/etablissement/cohortes/7/runs')
    expect(launch.mock.calls[0][1].method).toBe('POST')
    expect(launch.mock.calls[0][1].headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(launch.mock.calls[0][1].body)).toEqual(body)

    const cancel = vi.fn().mockResolvedValue(jsonResponse(200, { id: 42, status: 'cancelled' }))
    expect(await cancelRun(42, cancel)).toEqual({ id: 42, status: 'cancelled' })
    expect(cancel.mock.calls[0][0]).toBe('api/etablissement/runs/42/annuler')
    expect(cancel.mock.calls[0][1].method).toBe('POST')
    expect(cancel.mock.calls[0][1].headers['X-CSRF-Token']).toBe(CSRF)
    expect(cancel.mock.calls[0][1].body).toBeUndefined()
  })

  it('UC-ETA-03-U11 — fetchPublishedPackages : liste réelle, entrées sans id/version écartées', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, [...PUBLISHED_PACKAGES, { id: 'incomplet' }, { version: '1.0.0' }, null]),
    )

    const packages = await fetchPublishedPackages(fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/prompt-packages')
    expect(packages.map((p) => `${p.id}@${p.version}`)).toEqual([
      'aurora-v3-reconstruit@1.0.0',
      'aurora-v3-reconstruit@1.1.0',
    ])
  })
})

describe('UC-ETA-03 — constantes d’affichage', () => {
  it('UC-ETA-03-U12 — six statuts de jobs libellés, polling toutes les 5 s, modèle de référence', () => {
    expect(JOB_STATUS_LABELS).toEqual({
      queued: 'En attente',
      running: 'En cours',
      done: 'Terminés',
      failed: 'En erreur',
      budget_exceeded: 'Budget dépassé',
      cancelled: 'Annulés',
    })
    expect(Object.isFrozen(JOB_STATUS_LABELS)).toBe(true)
    expect(POLL_INTERVAL_MS).toBe(5000)
    expect(SERVICE_MODEL).toBe('claude-sonnet-5')
  })
})

/** Deux déposants (3 + 2 journées, 9 000 + 4 000 caractères) et un non-déposant. */
const DEPOSANTS = [
  membre(),
  membre({
    userId: 14,
    displayName: 'Lila',
    portfolio: { titre: 'Carnet de Lila', journees: 2, taille: 4000, deposeLe: '2026-07-03T11:00:00' },
  }),
  membre({ userId: 13, displayName: 'Noé', portfolioDepose: false, portfolio: null }),
]

/** Référentiels publiés au format de listPublishedReferentiels : RESPIRE d'abord. */
const PUBLIES = [
  { id: 'respire', label: 'RESPIRE v7', versions: [{ semver: '7.0.0', label: 'RESPIRE v7', fichier: 'respire-7.0.0.json', publishedAt: null }] },
  { id: 'fictif-neuf', label: 'Fictif à neuf pôles', versions: [{ semver: '1.0.0', label: 'Fictif à neuf pôles', fichier: 'fictif-neuf-1.0.0.json', publishedAt: null }] },
]

function renderCohorte({ membres = DEPOSANTS, config = configProjection(), board = runBoard(), getReferentiel, listReferentiels } = {}) {
  const net = fakeFetch({
    'GET api/etablissement/cohortes/7': jsonResponse(200, cohorteDetail({ membres })),
    'GET api/etablissement/config': jsonResponse(200, config),
    'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 42, jobs: 5 }),
    'GET api/etablissement/runs/42': jsonResponse(200, board),
  })
  const seams = {
    getReferentiel: getReferentiel ?? (async () => ({ doc: referentiel })),
    listReferentiels: listReferentiels ?? (async () => []),
  }
  render(createElement(CohorteSection, { id: '7', fetchFn: net.fetchMock, ...seams }))
  return net
}

async function estimateCost() {
  fireEvent.click(await screen.findByRole('button', { name: 'Estimer le coût' }))
  return screen.findByTestId('etab-run-estimate')
}

describe('UC-ETA-03 — CohorteSection rendue isolément', () => {
  it('UC-ETA-03-U13 — computeEstimate : taille moyenne d’une journée = Σ tailles / Σ journées (repli 3 000), modèle configuré sinon claude-sonnet-5', async () => {
    // (9 000 + 4 000) / 5 = 2 600 car. → ceil(40 × 32 600 / 3,6) = 362 223 tokens → 1.12 $ (Sonnet 5 à 2 / 10).
    renderCohorte()
    let block = await estimateCost()
    expect(block.textContent).toContain('40 appels LLM (modèle claude-sonnet-5)')
    expect(screen.getByTestId('etab-cout-estime').textContent).toBe('1.12 $')
    cleanup()

    // Tailles absentes : repli DEFAULT_DAY_CHARS (3 000) → 366 667 tokens → 1.13 $.
    renderCohorte({
      membres: DEPOSANTS.map((m) => (m.portfolio ? { ...m, portfolio: { ...m.portfolio, taille: undefined } } : m)),
    })
    await estimateCost()
    expect(screen.getByTestId('etab-cout-estime').textContent).toBe('1.13 $')
    cleanup()

    // Modèle configuré : il prime sur le modèle de référence.
    renderCohorte({ config: configProjection({ model: 'claude-haiku-4-5' }) })
    block = await estimateCost()
    expect(block.textContent).toContain('(modèle claude-haiku-4-5)')
    expect(block.textContent).not.toContain('claude-sonnet-5')
  })

  it('UC-ETA-03-U14 — RunProgress : « Annuler le run » tant que le run est actif ou a des jobs en file/en cours, masqué sinon', async () => {
    const cases = [
      [runBoard({ status: 'active' }), true],
      [runBoard({ status: 'budget_exceeded', jobs: { queued: 1, running: 0, done: 0, failed: 0, budget_exceeded: 1, cancelled: 0 } }), true],
      [runBoard({ status: 'done', jobs: { queued: 0, running: 0, done: 5, failed: 0, budget_exceeded: 0, cancelled: 0 } }), false],
      [runBoard({ status: 'cancelled', jobs: { queued: 0, running: 0, done: 1, failed: 0, budget_exceeded: 0, cancelled: 4 } }), false],
      // Forme réelle après un arrêt budgétaire (tout le « queued » est passé
      // « budget_exceeded ») : bouton masqué — voir Anomalies de la fiche.
      [runBoard({ status: 'budget_exceeded', jobs: { queued: 0, running: 0, done: 1, failed: 0, budget_exceeded: 4, cancelled: 0 } }), false],
    ]
    for (const [board, shown] of cases) {
      renderCohorte({ board })
      await estimateCost()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer et lancer le run' }))
      })
      await screen.findByTestId('etab-run-progress')
      expect(Boolean(screen.queryByRole('button', { name: 'Annuler le run' })), `${board.status} ${JSON.stringify(board.jobs)}`).toBe(shown)
      cleanup()
    }
  })
  it('UC-ETA-03-U15 — choix du référentiel publié : RESPIRE par défaut (sa dernière version publiée) ; un autre → estimation à ses pôles (10 appels par journée) et POST avec sa version', async () => {
    await primeCsrf()
    const getReferentiel = vi.fn(async (choix) => ({ doc: choix?.id === 'fictif-neuf' ? NEUF : referentiel }))
    const net = renderCohorte({ getReferentiel, listReferentiels: async () => PUBLIES })

    const select = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect(select.value).toBe('respire@7.0.0')
    let block = await estimateCost()
    expect(block.textContent).toContain('40 appels LLM') // 5 journées × (7 pôles + kairos)
    expect(getReferentiel).toHaveBeenLastCalledWith(undefined) // le défaut : la dernière version publiée de RESPIRE

    // Autre référentiel : l'estimation affichée ne vaut plus, puis se recalcule à ses pôles.
    fireEvent.change(select, { target: { value: 'fictif-neuf@1.0.0' } })
    expect(screen.queryByTestId('etab-run-estimate')).toBeNull()
    block = await estimateCost()
    expect(getReferentiel).toHaveBeenLastCalledWith({ id: 'fictif-neuf', version: '1.0.0' })
    expect(block.textContent).toContain('50 appels LLM') // 5 journées × (9 pôles + kairos)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer et lancer le run' }))
    })
    expect(net.callsTo('POST api/etablissement/cohortes/7/runs')[0].body).toEqual({
      promptPackageId: 'aurora-v3-reconstruit',
      promptPackageVersion: '1.0.0',
      referentielId: 'fictif-neuf',
      referentielVersion: '1.0.0',
    })
  })
})
