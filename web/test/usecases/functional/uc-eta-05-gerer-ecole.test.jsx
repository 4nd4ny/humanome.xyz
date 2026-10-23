// UC-ETA-05 — Gérer son école (crédit, surtaxe, plafond par élève, clé) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-05-gerer-ecole.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) ouverte sur
// #/etablissement, section « Mon école » (sprint 6, lot S6b — ADR-013) : seule
// l'API est simulée (fetch global, formes réelles de GET/PUT
// api/etablissement/ecole — jamais de clé), la session et le jeton CSRF
// viennent de GET api/auth/me. Aucune vraie clé : des valeurs inventées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import { CSRF, LEARNER_USER, configProjection, ecolePage, jsonResponse, noContent, openApp, stubApi } from '../support/eta.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

/** L'accueil d'une école dont la page évolue avec les écritures reçues. */
function ecoleApi(initial = ecolePage()) {
  let page = initial
  return stubApi({
    'GET api/etablissement/cohortes': jsonResponse(200, []),
    'GET api/etablissement/config': jsonResponse(200, configProjection()),
    'GET api/etablissement/ecole': () => jsonResponse(200, page),
    'PUT api/etablissement/ecole': (init) => {
      const corps = JSON.parse(init.body)
      page = { ...page, surtaxePct: corps.surtaxePct, plafondEleveMicrousd: Math.round(corps.plafondEleveUsd * 1_000_000) }
      return jsonResponse(200, page)
    },
    'PUT api/etablissement/ecole/cle': () => {
      page = { ...page, cles: [{ fournisseur: 'anthropic', poseeLe: '2026-10-22T10:00:00' }] }
      return jsonResponse(200, page)
    },
    'DELETE api/etablissement/ecole/cle/anthropic': () => {
      page = { ...page, cles: [] }
      return noContent()
    },
  })
}

describe('UC-ETA-05 — l’école règle ce qu’elle paie pour ses élèves', () => {
  it('UC-ETA-05-F07 — nominal (IHM) : « Mon école » en tête de l’espace, son plafond à 0 dit d’abord ; plafond et surtaxe enregistrés (CSRF) puis relus ; crédit et lien d’achat ; ses élèves et leur dépense', async () => {
    const api = ecoleApi(ecolePage({
      creditMicrousd: 20_000_000,
      depenseMoisMicrousd: 4_260,
      eleves: [{ userId: 12, displayName: 'Maya', cohortes: ['BTS SIO 2026'], membre: true, moisMicrousd: 4_260, totalMicrousd: 4_260 }],
    }))
    openApp('#/etablissement')

    const section = await screen.findByTestId('etab-ecole')
    // en tête : avant ses cohortes et la configuration des runs de masse
    const blocs = [...document.querySelectorAll('.espace-bloc')].map((b) => b.getAttribute('aria-label'))
    expect(blocs).toEqual(['Mon école', 'Mes cohortes', 'Configuration LLM et budget'])
    expect(within(section).getByTestId('etab-plafond-zero').textContent).toContain('vos élèves ne peuvent rien lancer de payant')
    expect(within(section).getByTestId('etab-credit').textContent).toContain('20,00 $')
    expect(within(section).getByRole('link', { name: 'Acheter du crédit' }).getAttribute('href')).toBe('#/compte/credit')
    expect(within(section).getByTestId('etab-eleves').textContent).toContain('Maya')

    fireEvent.change(screen.getByLabelText('Plafond par élève et par mois (USD)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Surtaxe sur la clé de l’instance (%)'), { target: { value: '6.5' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
    })
    expect(await screen.findByText('Réglages de l’école enregistrés.')).toBeDefined()
    const [put] = api.callsTo('PUT api/etablissement/ecole')
    expect(put.body).toEqual({ surtaxePct: 6.5, plafondEleveUsd: 10 })
    expect(put.headers['X-CSRF-Token']).toBe(CSRF)
    expect(api.callsTo('GET api/etablissement/ecole')).toHaveLength(2)
    expect(screen.queryByTestId('etab-plafond-zero')).toBeNull()
    expect(screen.getByLabelText('Plafond par élève et par mois (USD)').value).toBe('10')
  })

  it('UC-ETA-05-F08 — A2 (IHM) : la clé Anthropic de l’école posée (CSRF), jamais réaffichée ; retirée en deux temps', async () => {
    const api = ecoleApi()
    openApp('#/etablissement')

    fireEvent.change(await screen.findByLabelText('Clé Anthropic'), { target: { value: 'sk-ant-ecole-fictive-7' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    })
    expect((await screen.findByTestId('etab-cle-posee')).textContent).toContain('Une clé est posée depuis le')
    const [put] = api.callsTo('PUT api/etablissement/ecole/cle')
    expect(put.body).toEqual({ cle: 'sk-ant-ecole-fictive-7', fournisseur: 'anthropic' })
    expect(put.headers['X-CSRF-Token']).toBe(CSRF)
    expect(document.body.innerHTML).not.toContain('sk-ant-ecole')

    fireEvent.click(screen.getByRole('button', { name: 'Retirer la clé' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    })
    await waitFor(() => expect(api.callsTo('DELETE api/etablissement/ecole/cle/anthropic')).toHaveLength(1))
    expect(await screen.findByLabelText('Clé Anthropic')).toBeDefined()
  })

  it('UC-ETA-05-F09 — E1 (IHM) : un compte sans l’habilitation etablissement ne voit pas « Mon école » et rien n’est lu', async () => {
    const api = stubApi({}, { user: LEARNER_USER })
    openApp('#/etablissement', { user: LEARNER_USER })

    expect(await screen.findByTestId('etab-reserve')).toBeDefined()
    expect(screen.queryByTestId('etab-ecole')).toBeNull()
    expect(api.callsTo('GET api/etablissement/ecole')).toHaveLength(0)
  })
})
