// Analyse approfondie Twin9 (T9) : on lance un run avec un de ses profils et
// un portfolio de sa bibliothèque, son accord donné ; la page du run le fait
// avancer jusqu'au bout, l'annule, le reprend, choisit qui lit ses résultats
// et l'ouvre dans la cartographie. T10 : avant de lancer, les journées à
// instruire, le coût et la durée estimés ; un run arrêté par son budget
// reprend sous un nouveau ; sa carte incomplète s'ouvre, marquée. T8 : les
// journées que le crédit admet avec leur fusion, ou le refus et ce qu'il
// faudrait ; un run arrêté avant sa fusion se reprend comme les autres.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Twin9View from './Twin9View.jsx'
import { resetApiClient } from '../api/client.js'
import { createMemoryAdapter, createPortfolioStore } from '../lib/portfolio-store.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const run = (extra = {}) => ({
  id: 7,
  journal: 'mon-journal',
  statut: 'en_cours',
  attente: null,
  retard: 'En attente de son premier tour',
  visibilite: 'privee',
  mode: 'complet',
  voie: 'directe',
  attestation: {
    profil: { id: 3, nom: 'Direct' },
    gabarits: { jeu: 'v9.8', versions: {}, empreinte: 'abcdef0123456789' },
    referentiel: { id: 'respire', version: '7.0.0' },
    moteur: { commit: null },
  },
  progression: { appels: { envoye: 0, attente: 0, repondu: 0, panne: 0 }, journees: 0, fusion: false, lots: 0, runs_avant: 0 },
  compteurs: null,
  created_at: '2026-10-19 10:00:00',
  avance_at: null,
  finished_at: null,
  accord_at: '2026-10-19 10:00:00',
  ...extra,
})

const fini = () =>
  run({
    statut: 'termine',
    retard: null,
    progression: { appels: { envoye: 0, attente: 0, repondu: 0, panne: 0 }, journees: 2, fusion: true, lots: 0, runs_avant: 0 },
    compteurs: { appels: 5, pannes: 1 },
  })

const apercu = (extra = {}) => ({
  journal: 'Mon_journal',
  mode: 'complet',
  voie: 'directe',
  cle: 'instance',
  journees: { total: 3, nouvelles: 1, changees: 0 },
  estimation: { cout_usd: 2.258431, min_usd: 1.904, max_usd: 3.104321, reserve_usd: 1.128, duree_s: 1316, evaluations: 2 },
  admission: { journees: 3, total: 3, limite: 'credit', instruites: 1, en_attente: 0, changees_en_attente: 0, autres_usd: 0, refus: null },
  plafonds: { budget_usd: 5, duree_minutes: null },
  credit_usd: 100,
  ...extra,
})

async function bibliotheque() {
  const store = createPortfolioStore(createMemoryAdapter())
  await store.create({ titre: 'Mon journal', texte: '## 2026-01-05\nPremier jour.\n' })
  return store
}

describe('Twin9View — lancer (T9)', () => {
  it('invite un visiteur à se connecter', async () => {
    const fetchFn = routedFetch({ 'GET api/twin9/runs': jsonResponse(401, { error: 'Authentification requise' }), 'GET api/twin9/configuration': jsonResponse(401, {}) })
    render(<Twin9View deps={{ fetchFn, store: createPortfolioStore(createMemoryAdapter()) }} />)
    expect((await screen.findByRole('link', { name: 'Connectez-vous' })).getAttribute('href')).toBe('#/compte')
  })

  it('dit quand l’analyse approfondie ne tourne pas sur cette instance', async () => {
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: false, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
    })
    render(<Twin9View deps={{ fetchFn, store: createPortfolioStore(createMemoryAdapter()) }} />)
    expect((await screen.findByRole('status')).textContent).toMatch(/pas disponible/)
    expect(screen.queryByRole('button', { name: 'Lancer l’analyse' })).toBeNull()
  })

  it('lance un run avec son profil et un portfolio de sa bibliothèque, une fois son accord donné', async () => {
    let envoye = null
    const navigate = vi.fn()
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [{ id: 3, nom: 'Direct' }] }),
      'POST api/twin9/runs/apercu': jsonResponse(200, apercu()),
      'POST api/twin9/runs': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, run())
      },
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque(), navigate }} />)
    const lancer = await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect(lancer.disabled).toBe(true)
    expect(screen.getByLabelText('Portfolio').value).not.toBe('fichier')

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Mon cartographe peut lire/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    expect(lancer.disabled).toBe(false)
    fireEvent.click(lancer)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('#/twin9/7'))
    expect(envoye).toEqual({
      profil: 3,
      portfolio: { nom: 'Mon journal.md', texte: '## 2026-01-05\nPremier jour.\n' },
      accord: true,
      visibilite: 'cartographe',
    })
  })

  it('avant de lancer, l’accord donné, dit les journées à instruire, le coût estimé et sa fourchette, la durée', async () => {
    const corps = []
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [{ id: 3, nom: 'Direct' }] }),
      'POST api/twin9/runs/apercu': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, apercu())
      },
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
    await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect(screen.queryByRole('region', { name: 'Avant de lancer' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(corps).toEqual([{ profil: 3, portfolio: { nom: 'Mon journal.md', texte: '## 2026-01-05\nPremier jour.\n' } }])
    expect(avant.textContent).toContain(
      'Ce portfolio a déjà été évalué : 1 journée sur 3 à instruire (1 nouvelle), les autres reprises telles quelles.',
    )
    expect(avant.textContent).toContain(
      'Coût estimé : 2,26 $ en moyenne, de 1,90 $ à 3,10 $ · durée estimée : 22 min (d’après 2 évaluations passées de mêmes réglages).',
    )
    expect(avant.textContent).toContain('Plafonds du profil : budget 5,00 $.')
    expect(avant.textContent).not.toContain('attendr')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('dit les journées que le crédit admet avec leur fusion, et que les autres attendent (T8)', async () => {
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': jsonResponse(
        200,
        apercu({
          journees: { total: 60, nouvelles: 58, changees: 2 },
          admission: { journees: 42, total: 60, limite: 'credit', instruites: 42, en_attente: 18, changees_en_attente: 2, autres_usd: 0, refus: null },
        }),
      ),
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(avant.textContent).toContain(
      'Votre crédit couvre 42 des 60 journées à instruire, avec leur fusion, au coût le plus haut observé, réserves des appels comprises. ' +
        'Les 18 autres attendront une prochaine analyse ; d’ici là, la carte garde la version déjà évaluée des 2 journées changées.',
    )
    expect(avant.textContent).toContain('Coût estimé (42 journées) : 2,26 $ en moyenne')
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(false)
  })

  it('déduit ce que les analyses en cours peuvent encore dépenser ; le budget du profil borne de même (T8)', async () => {
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [{ id: 3, nom: 'Direct' }] }),
      'POST api/twin9/runs/apercu': (init) =>
        jsonResponse(
          200,
          JSON.parse(init.body).profil === 3
            ? apercu({
                estimation: { cout_usd: 1.2, min_usd: 1.2, max_usd: 1.2, reserve_usd: 0.6, duree_s: null, reference: 'PLANT-01', poles: 7 },
                admission: { journees: 1, total: 3, limite: 'budget', instruites: 1, en_attente: 1, changees_en_attente: 0, autres_usd: 0, refus: null },
              })
            : apercu({
                admission: { journees: 2, total: 3, limite: 'credit', instruites: 1, en_attente: 2, changees_en_attente: 0, autres_usd: 2.5, refus: null },
              }),
        ),
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).toContain(
        'Votre crédit, déduits les 2,50 $ que vos analyses en cours peuvent encore dépenser, couvre 1 des 3 journées à instruire, ' +
          'avec leur fusion, au coût le plus haut observé, réserves des appels comprises. Les 2 autres attendront une prochaine analyse.',
      ),
    )
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).toContain(
        'Le budget du profil couvre 1 des 2 journées à instruire, avec leur fusion, d’après le run de référence, réserves des ' +
          'appels comprises. L’autre attendra une prochaine analyse.',
      ),
    )
  })

  it('dit quand le crédit ne couvre pas une carte, même d’une journée, ce qu’il faudrait, et ne lance pas (T8)', async () => {
    const refus = 'Votre crédit ne couvre pas une carte, même d’une journée : il faudrait 3,11 $ (une journée et sa fusion, au coût le plus haut observé, réserves des appels comprises)'
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': jsonResponse(
        200,
        apercu({ admission: { journees: 0, total: 3, limite: 'credit', instruites: 0, en_attente: 1, changees_en_attente: 0, autres_usd: 0, refus } }),
      ),
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toBe(`${refus}. Recharger`)
    expect(within(alerte).getByRole('link', { name: 'Recharger' }).getAttribute('href')).toBe('#/compte/credit')
    expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).not.toContain('Coût estimé')
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(true)
  })

  it('dit au premier run que toutes ses journées s’instruisent, d’après le run de référence', async () => {
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': jsonResponse(
        200,
        apercu({
          voie: 'lots',
          journees: { total: 3, nouvelles: 3, changees: 0 },
          estimation: { cout_usd: 1.69327, min_usd: 1.6931, max_usd: 1.6934, reserve_usd: 0.564, duree_s: null, reference: 'PLANT-01', poles: 7 },
          plafonds: { budget_usd: null, duree_minutes: null },
          credit_usd: 100,
        }),
      ),
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(avant.textContent).toContain('3 journées à instruire.')
    expect(avant.textContent).toContain(
      'Coût estimé : 1,69 $ · par lots, la durée dépend d’Anthropic (d’après le vrai run de PLANT-01, en essai, × 7 pôles).',
    )
    expect(avant.textContent).not.toContain('Plafonds')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('liste ses analyses', async () => {
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, {
        disponible: true,
        runs: [{ id: 7, journal: 'mon-journal', statut: 'termine', attente: null, visibilite: 'privee', profil: 'Direct', mode: 'test', created_at: '2026-10-19 10:00:00', finished_at: null }],
      }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
    })
    render(<Twin9View deps={{ fetchFn, store: createPortfolioStore(createMemoryAdapter()) }} />)
    const lien = await screen.findByRole('link', { name: 'mon-journal' })
    expect(lien.getAttribute('href')).toBe('#/twin9/7')
    expect(lien.parentElement.textContent).toContain('essai · Terminé')
  })
})

describe('Twin9View — la page du run (T9)', () => {
  it('fait avancer le run tant qu’il est en cours, puis l’ouvre dans la cartographie', async () => {
    const etats = [run(), run({ retard: null, progression: { appels: { envoye: 1, attente: 0, repondu: 2, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 } }), fini()]
    let i = 0
    const avancer = vi.fn(() => jsonResponse(200, { avance: true, locked: false }))
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': () => jsonResponse(200, etats[Math.min(i++, etats.length - 1)]),
      'POST api/twin9/runs/avancer': avancer,
      'GET api/twin9/runs/7/resultats': jsonResponse(200, {
        run: { id: 7, journal: 'mon-journal', statut: 'termine' },
        lecteur: 'proprietaire',
        sorties: {
          'carto_evolutive.json': JSON.stringify({ competences: {} }),
          'journees/2026-01-05/carto_jour.json': JSON.stringify({ verdicts: {} }),
        },
        memoire: [],
      }),
    })
    const onOpenInInterface = vi.fn()
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {}, getReferentiel: async () => ({ doc: { poles: [], competences: [] } }) }} onOpenInInterface={onOpenInInterface} />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    expect(avancer).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/2 journées finies · fusion faite/)).toBeTruthy()
    expect(screen.getByText('Appels : 4 répondus · 1 en panne')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(onOpenInInterface).toHaveBeenCalledTimes(1))
    const [files, opts] = onOpenInInterface.mock.calls[0]
    expect(files.map((f) => f.path)).toEqual(['twin9-run-7.json'])
    const doc = JSON.parse(files[0].text)
    expect(doc.kind).toBe('twin9-run')
    expect(Object.keys(doc.journees)).toEqual(['2026-01-05'])
    expect(opts.title).toBe('Twin9 · mon-journal')
  })

  it('annule le run, puis le reprend', async () => {
    let statut = 'en_cours'
    const bloque = new Promise(() => {}) // la page attend : le test agit entre deux tours
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': () => jsonResponse(200, run({ statut, retard: null })),
      'POST api/twin9/runs/avancer': () => jsonResponse(200, { avance: false, locked: true }),
      'POST api/twin9/runs/7/annuler': () => {
        statut = 'annule'
        return jsonResponse(200, run({ statut, retard: null }))
      },
      'POST api/twin9/runs/7/reprendre': () => {
        statut = 'en_cours'
        return jsonResponse(200, run({ statut }))
      },
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: () => bloque }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Annulé'))

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy())
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/reprendre')).toHaveLength(1)
  })

  it('reprend sous un nouveau budget un run que son budget a arrêté', async () => {
    const corps = []
    const arrete = run({
      statut: 'echoue',
      attente: 'budget atteint : carte incomplète',
      retard: 'Budget atteint : carte incomplète',
      progression: { appels: { envoye: 0, attente: 2, repondu: 5, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 },
      cout: { depense_microusd: 980000, budget_usd: 1, duree_minutes: null },
    })
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, arrete),
      'POST api/twin9/runs/7/reprendre': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, { ...arrete, statut: 'termine', retard: null })
      },
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Arrêté — Budget atteint : carte incomplète'))
    expect(screen.getByText('Coût : 0,98 $ · budget : 1,00 $')).toBeTruthy()

    const reprendre = screen.getByRole('button', { name: 'Reprendre' })
    fireEvent.change(screen.getByLabelText(/Nouveau budget/), { target: { value: '0.5' } })
    expect(reprendre.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Nouveau budget/), { target: { value: '5' } })
    fireEvent.click(reprendre)
    await waitFor(() => expect(corps).toEqual([{ budget_usd: 5 }]))
  })

  it('reprend, rechargé ou sous un nouveau budget, un run arrêté avant d’entamer la réserve de sa fusion (T8)', async () => {
    const arrete = (attente, budget) =>
      run({
        statut: 'echoue',
        attente,
        retard: attente[0].toUpperCase() + attente.slice(1),
        attestation: { ...run().attestation, admission: { journees: 42, total: 60, limite: 'credit', instruites: 42, en_attente: 18 } },
        progression: { appels: { envoye: 0, attente: 1, repondu: 9, panne: 0 }, journees: 2, fusion: false, lots: 0, runs_avant: 0 },
        cout: { depense_microusd: 900000, budget_usd: budget, duree_minutes: null },
      })
    for (const [attente, budget, recharger] of [
      ['crédit insuffisant (fusion réservée) : carte incomplète', null, true],
      ['crédit insuffisant (engagé par vos autres analyses) : carte incomplète', null, true],
      ['budget atteint (fusion réservée) : carte incomplète', 2, false],
    ]) {
      const fetchFn = routedFetch({ 'GET api/twin9/runs/7': jsonResponse(200, arrete(attente, budget)) })
      render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe(`Arrêté — ${arrete(attente, budget).retard}`))
      expect(screen.queryByRole('link', { name: 'Recharger mon crédit' }) !== null).toBe(recharger)
      expect(screen.queryByLabelText(/Nouveau budget/) !== null).toBe(!recharger)
      expect(screen.getByRole('button', { name: 'Reprendre' })).toBeTruthy()
      expect(screen.getByText('42 journées à instruire ; 18 laissées à une prochaine analyse')).toBeTruthy()
      cleanup()
    }
  })

  it('ouvre dans la cartographie la carte incomplète d’un run arrêté, qui le dit', async () => {
    const arrete = run({
      statut: 'echoue',
      attente: 'crédit insuffisant : carte incomplète',
      retard: 'Crédit insuffisant : carte incomplète',
      progression: { appels: { envoye: 0, attente: 0, repondu: 2, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 },
      cout: { depense_microusd: 120000, budget_usd: null, duree_minutes: null },
    })
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, arrete),
      'GET api/twin9/runs/7/resultats': jsonResponse(200, {
        run: { id: 7, journal: 'mon-journal', statut: 'echoue', retard: 'Crédit insuffisant : carte incomplète' },
        lecteur: 'proprietaire',
        sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify({ verdicts: {} }) },
        memoire: [],
      }),
    })
    const onOpenInInterface = vi.fn()
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {}, getReferentiel: async () => ({ doc: null }) }} onOpenInInterface={onOpenInInterface} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Arrêté — Crédit insuffisant : carte incomplète'))
    expect(screen.getByRole('link', { name: 'Recharger mon crédit' }).getAttribute('href')).toBe('#/compte/credit')

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(onOpenInInterface).toHaveBeenCalledTimes(1))
    const [files, opts] = onOpenInInterface.mock.calls[0]
    expect(opts.title).toBe('Twin9 · mon-journal — carte incomplète')
    const doc = JSON.parse(files[0].text)
    expect([doc.incomplete, doc.carto_evolutive, Object.keys(doc.journees)]).toEqual([true, null, ['2026-01-05']])
  })

  it('ne propose pas la cartographie pour un run sur un autre référentiel que RESPIRE, et le dit (T16)', async () => {
    const autre = { ...fini(), attestation: { ...fini().attestation, referentiel: { id: 'fictif-lettre', version: '1.0.0' } } }
    const resultats = vi.fn(() => jsonResponse(200, {}))
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, autre),
      'GET api/twin9/runs/7/resultats': resultats,
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))

    expect(screen.queryByRole('button', { name: 'Ouvrir dans la cartographie' })).toBeNull()
    expect(screen.getByText('La cartographie n’ouvre encore que les analyses du référentiel RESPIRE : celle-ci porte sur « fictif-lettre ».')).toBeTruthy()
    expect(resultats).not.toHaveBeenCalled()
  })

  it('ouvre dans la cartographie un run sans référentiel dans son attestation : d’avant T16, il lit RESPIRE', async () => {
    const ancien = { ...fini(), attestation: { ...fini().attestation, referentiel: undefined } }
    const fetchFn = routedFetch({ 'GET api/twin9/runs/7': jsonResponse(200, ancien) })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    expect(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' })).toBeTruthy()
    expect(screen.queryByText(/n’ouvre encore que les analyses du référentiel RESPIRE/)).toBeNull()
  })

  it('laisse son cartographe lire les résultats, puis le lui retire', async () => {
    const corps = []
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, fini()),
      'PUT api/twin9/runs/7/visibilite': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, fini())
      },
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    const caseVisible = await screen.findByRole('checkbox', { name: /Mon cartographe peut lire/ })
    fireEvent.click(caseVisible)
    await waitFor(() => expect(corps).toEqual([{ visibilite: 'cartographe' }]))
  })
})
