// Analyse approfondie Twin9 (T9) : on lance un run avec un de ses profils et
// un portfolio de sa bibliothèque, son accord donné ; la page du run le fait
// avancer jusqu'au bout, l'annule, le reprend, choisit qui lit ses résultats
// et l'ouvre dans la cartographie.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        run: { id: 7, journal: 'mon-journal' },
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
