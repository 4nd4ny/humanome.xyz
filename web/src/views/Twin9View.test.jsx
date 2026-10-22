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
// un run configuré tel que ses résultats le rendent à son propriétaire (P0-1) : valeurs inventées
import exemple from '../../../schemas/fixtures/twin9-configuration-exemple.json'

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

const ANTHROPIC_LOTS = { id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' }
const ANTHROPIC_DIRECT = { ...ANTHROPIC_LOTS, voie: 'directe' }

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
      'GET api/twin9/configuration': jsonResponse(200, { profils: [{ id: 3, nom: 'Direct', fournisseurs: [ANTHROPIC_DIRECT] }] }),
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
    const accord = screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ })
    expect(accord.closest('label').textContent).toContain(
      'Le texte part chez Anthropic (en direct ; RGPD : sous conditions), le fournisseur du modèle. Voir la politique',
    )
    fireEvent.click(accord)
    expect(lancer.disabled).toBe(false)
    fireEvent.click(lancer)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('#/twin9/7'))
    expect(envoye).toEqual({
      profil: 3,
      portfolio: { nom: 'Mon journal.md', texte: '## 2026-01-05\nPremier jour.\n' },
      accord: { fournisseurs: ['anthropic'] },
      visibilite: 'cartographe',
    })
  })

  it('l’accord nomme les fournisseurs du profil, leur voie et leur étiquette RGPD ; il vaut pour eux seuls (ADR-012)', async () => {
    let envoye = null
    const corps = []
    const mistral = { id: 'mistral', libelle: 'Mistral AI', rgpd: 'oui', voie: 'directe' }
    const google = { id: 'google', libelle: 'Google (Gemini)', rgpd: 'non', voie: 'directe' }
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, {
        profils: [
          { id: 3, nom: 'Mixte', fournisseurs: [ANTHROPIC_LOTS, mistral] },
          { id: 4, nom: 'Tiers', fournisseurs: [mistral, google] },
          { id: 5, nom: 'Mixte bis', fournisseurs: [ANTHROPIC_LOTS, mistral] },
        ],
        defaut_fournisseurs: [ANTHROPIC_LOTS],
      }),
      'POST api/twin9/runs/apercu': (init) => {
        corps.push(JSON.parse(init.body).profil)
        return jsonResponse(200, apercu({ fournisseurs: [ANTHROPIC_LOTS, mistral], estimation: { ...apercu().estimation, duree_s: null } }))
      },
      'POST api/twin9/runs': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, run())
      },
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque(), navigate: vi.fn() }} />)
    const lancer = await screen.findByRole('button', { name: 'Lancer l’analyse' })
    const accord = () => screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ })
    expect(accord().closest('label').textContent).toContain(
      'Le texte part chez Anthropic (par lots ; RGPD : sous conditions), le fournisseur du modèle. Par lots, Anthropic garde ' +
        'le lot jusqu’à sa suppression, 29 jours au plus.',
    )

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    expect(accord().closest('label').textContent).toContain(
      'Le texte part chez les fournisseurs des modèles de ce profil : Anthropic (par lots ; RGPD : sous conditions) et ' +
        'Mistral AI (en direct ; RGPD : oui). Par lots, Anthropic garde le lot jusqu’à sa suppression, 29 jours au plus.',
    )
    fireEvent.click(accord())
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(avant.textContent).toContain('en partie par lots, la durée dépend d’Anthropic')

    // un profil aux mêmes fournisseurs, par les mêmes voies : l'accord tient
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '5' } })
    expect(accord().checked).toBe(true)
    await waitFor(() => expect(corps).toEqual([3, 5]))

    // d'autres fournisseurs : l'accord est à redonner, et rien ne part avant
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '4' } })
    expect(accord().checked).toBe(false)
    expect(lancer.disabled).toBe(true)
    expect(screen.queryByRole('region', { name: 'Avant de lancer' })).toBeNull()
    expect(accord().closest('label').textContent).toContain(
      'Mistral AI (en direct ; RGPD : oui) et Google (Gemini) (en direct ; RGPD : non). Google (Gemini) est étiqueté « non » ' +
        'au regard du RGPD : à éviter pour les journaux d’élèves réels.',
    )
    expect(accord().closest('label').textContent).not.toContain('29 jours')
    expect(corps).toEqual([3, 5])

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    fireEvent.click(accord())
    await waitFor(() => expect(lancer.disabled).toBe(false))
    fireEvent.click(lancer)
    await waitFor(() => expect(envoye).not.toBeNull())
    expect(envoye.accord).toEqual({ fournisseurs: ['anthropic', 'mistral'] })
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('ouvre dans la cartographie un run sur un autre référentiel, avec ce référentiel, que le titre du jeu nomme (T17)', async () => {
    const autre = { ...fini(), attestation: { ...fini().attestation, referentiel: { id: 'fictif-lettre', version: '1.0.0' } } }
    const referentiel = {
      id: 'fictif-lettre',
      version: '1.0.0',
      label: 'Fictif lettré',
      poles: [{ num: 1, nom: 'A · Pôle fictif A', couleur: null }],
      competences: [{ code: 'A1', nom: 'Capacité fictive A1', pole: 1 }],
    }
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, autre),
      'GET api/twin9/runs/7/resultats': jsonResponse(200, {
        run: { id: 7, journal: 'mon-journal', statut: 'termine' },
        lecteur: 'proprietaire',
        sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify({ verdicts: {} }) },
        memoire: [],
        referentiel,
      }),
    })
    const publie = { id: 'respire', poles: [], competences: [{ code: 'A1', description: 'Une autre structure' }] }
    const onOpenInInterface = vi.fn()
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {}, getReferentiel: async () => ({ doc: publie }) }} onOpenInInterface={onOpenInInterface} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(onOpenInInterface).toHaveBeenCalledTimes(1))
    const [files, opts] = onOpenInInterface.mock.calls[0]
    expect(opts.title).toBe('Twin9 · mon-journal · Fictif lettré')
    // le sien, sans description d’un référentiel publié qui n’est pas lui
    expect(JSON.parse(files[0].text).referentiel).toEqual(referentiel)
  })

  it('ouvre un run de RESPIRE avec le référentiel du run, et les descriptions du référentiel publié (T17)', async () => {
    const referentiel = {
      id: 'respire',
      version: '7.0.0',
      label: 'RESPIRE v7',
      poles: [{ num: 1, nom: 'TETE — Penser & Comprendre', couleur: '#2563eb' }],
      competences: [{ code: '1.01', nom: 'Pensée critique', pole: 1 }],
    }
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, fini()),
      'GET api/twin9/runs/7/resultats': jsonResponse(200, {
        run: { id: 7, journal: 'mon-journal', statut: 'termine' },
        lecteur: 'proprietaire',
        sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify({ verdicts: {} }) },
        memoire: [],
        referentiel,
      }),
    })
    const publie = { id: 'respire', poles: [], competences: [{ code: '1.01', description: 'Examiner avant de conclure.' }] }
    const onOpenInInterface = vi.fn()
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {}, getReferentiel: async () => ({ doc: publie }) }} onOpenInInterface={onOpenInInterface} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(onOpenInInterface).toHaveBeenCalledTimes(1))
    const [files, opts] = onOpenInInterface.mock.calls[0]
    expect(opts.title).toBe('Twin9 · mon-journal · RESPIRE v7')
    expect(JSON.parse(files[0].text).referentiel.competences).toEqual([
      { code: '1.01', nom: 'Pensée critique', pole: 1, description: 'Examiner avant de conclure.' },
    ])
  })

  it('ouvre un run d’avant T16, dont les résultats ne disent pas le référentiel, avec le référentiel publié : il a lu RESPIRE', async () => {
    const ancien = { ...fini(), attestation: { ...fini().attestation, referentiel: undefined } }
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, ancien),
      'GET api/twin9/runs/7/resultats': jsonResponse(200, {
        run: { id: 7, journal: 'mon-journal', statut: 'termine' },
        lecteur: 'proprietaire',
        sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify({ verdicts: {} }) },
        memoire: [],
        referentiel: null,
      }),
    })
    const publie = { id: 'respire', poles: [], competences: [] }
    const onOpenInInterface = vi.fn()
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {}, getReferentiel: async () => ({ doc: publie }) }} onOpenInInterface={onOpenInInterface} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(onOpenInInterface).toHaveBeenCalledTimes(1))
    const [files, opts] = onOpenInInterface.mock.calls[0]
    expect(opts.title).toBe('Twin9 · mon-journal')
    expect(JSON.parse(files[0].text).referentiel).toEqual(publie)
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

// P0-1 (docs/contrats.md §8.9) : la configuration du run, à côté de son attestation. Le suivi n'en porte que
// l'empreinte ; les blocs se lisent dans les résultats, à l'ouverture de « Configuration ».
describe('Twin9View — la configuration du run (P0-1)', () => {
  const configure = (extra = {}) => ({ ...fini(), configuration_empreinte: 'ad519cee3a0b8405', ...extra })
  const resultats = (execution = exemple.run.execution) =>
    jsonResponse(200, {
      run: { id: 7, journal: 'mon-journal', statut: 'termine', configuration: exemple.run.configuration, execution },
      lecteur: 'proprietaire',
      sorties: {},
      memoire: [],
    })
  const lignes = (dl) => Object.fromEntries([...dl.querySelectorAll(':scope > dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]))
  const cellules = (tr) => [...tr.children].map((c) => c.textContent)

  it('ne lit rien tant qu’on ne l’ouvre pas ; d’un run lancé avant elle, montre son exécution partielle seule', async () => {
    let fetchFn = routedFetch({ 'GET api/twin9/runs/7': jsonResponse(200, configure()), 'GET api/twin9/runs/7/resultats': resultats() })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    let details = screen.getByText('Configuration').closest('details')
    expect(details.open).toBe(false)
    expect(details.textContent).toBe('Configuration')
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(0)
    cleanup()

    // en cours au déploiement de P0-1 : pas d'empreinte, mais une exécution, lue dans son journal puis figée, partielle
    const partielle = { ...exemple.run.execution, partiel: true }
    fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, fini()),
      'GET api/twin9/runs/7/resultats': jsonResponse(200, { run: { id: 7, journal: 'mon-journal', statut: 'termine', configuration: null, execution: partielle }, lecteur: 'proprietaire', sorties: {}, memoire: [] }),
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    details = screen.getByText('Configuration').closest('details')
    fireEvent.click(details.querySelector('summary'))
    await within(details).findByText(/Ce run a été lancé avant que sa configuration soit gardée/)
    expect(details.querySelector('.twin9-config-source').textContent).toBe(
      'Figée à la fin du run. Lancé avant que sa configuration soit gardée : ses passes et le temps du moteur sont incomplets.',
    )
    expect(lignes(details.querySelector('dl')).Appels).toBe('9 : 8 répondus, 1 en panne dont 1 sortie tronquée')
    expect(details.querySelector('table caption').textContent).toBe('Par fournisseur')
  })

  it('ouverte, dit chaque rôle avec son fournisseur et son étiquette RGPD, sa voie, son modèle et son budget de sortie ; le jeu, le référentiel, la clé ; puis l’exécution', async () => {
    const fetchFn = routedFetch({ 'GET api/twin9/runs/7': jsonResponse(200, configure()), 'GET api/twin9/runs/7/resultats': resultats() })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    const details = screen.getByText('Configuration').closest('details')
    fireEvent.click(details.querySelector('summary'))
    await within(details).findByText('Réglages des appels')
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(1)

    const [config, execution] = details.querySelectorAll('dl')
    expect(lignes(config)).toEqual({
      Empreinte: 'ad519cee3a0b8405',
      'Lancé le': '2026-01-05 09:00:00',
      Fournisseurs: 'Anthropic RGPD : sous conditions, par lots',
      'Jeu de gabarits': 'jeu-exemple@fedcba9876543210',
      Référentiel: 'referentiel-exemple@1.0.0',
      Clé: 'celle de l’instance',
    })
    const role = (cle) => cellules(details.querySelector(`tr[data-role="${cle}"]`))
    expect(role('etages/profond')).toEqual(['Analyse profonde', 'Anthropic RGPD : sous conditions', 'par lots', 'claude-exemple-profond', '4000'])
    expect(role('etapes/greffier')).toEqual(['Greffier', 'Anthropic RGPD : sous conditions', 'par lots', 'claude-exemple-rapide', '2000'])
    expect(role('second_ressort/president')).toEqual(['Président', 'Anthropic RGPD : sous conditions', 'par lots', 'claude-exemple-profond', '3000'])
    expect(role('lecteurs/lecteur-a')).toEqual(['lecteur-a', 'Anthropic RGPD : sous conditions', 'par lots', 'claude-exemple-rapide', '1000'])
    expect([...details.querySelectorAll('th[scope="rowgroup"]')].map((th) => th.textContent)).toEqual(['Étages', 'Étapes', 'Second ressort', 'Lecteurs du collège'])
    expect(details.querySelector('.twin9-rgpd').className).toContain('twin9-rgpd-sous_conditions')

    expect(lignes(execution)).toEqual({
      Appels: '9 : 8 répondus, 1 en panne dont 1 sortie tronquée',
      'Passes du moteur': '12 (640 ms de moteur)',
      Lots: '3',
      Coût: '0,0042 $',
    })
    expect(within(details).getByText(/Figée à la fin du run/)).toBeTruthy()
    // une sortie tronquée est une panne (P0-2) : le conseil d'augmenter le budget de son étape
    expect(details.querySelector('.twin9-conseil').textContent).toContain('Une sortie tronquée a été comptée en panne')
    expect(within(details).getByRole('link', { name: 'Régler mes profils' }).getAttribute('href')).toBe('#/configuration')
    const [, parFournisseur, parVoie] = details.querySelectorAll('table')
    expect([...parFournisseur.querySelectorAll('tr')].map(cellules)).toEqual([
      ['Fournisseur', 'Appels', 'Pannes', 'dont tronqués', 'Coût'],
      ['Anthropic RGPD : sous conditions', '9', '1', '1', '0,0042 $'],
    ])
    expect([...parVoie.querySelectorAll('tr')].map(cellules)).toEqual([
      ['Voie', 'Appels', 'Pannes', 'dont tronqués', 'Coût'],
      ['par lots', '9', '1', '1', '0,0042 $'],
    ])

    // séparée de l'attestation, qui ne change pas ; un seul statut, aucune alerte
    const attestation = screen.getByText('Attestation').closest('details')
    expect(attestation).not.toBe(details)
    expect([...attestation.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Profil', 'Référentiel', 'Jeu de gabarits', 'Moteur', 'Accord'])
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('se relit quand le run finit : son exécution, lue dans son journal en cours de route, est alors figée', async () => {
    let lache
    const attente = new Promise((resolve) => {
      lache = resolve
    })
    const enCoursDeRoute = configure({ statut: 'en_cours', retard: null, compteurs: null, progression: { appels: { envoye: 1, attente: 0, repondu: 2, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 } })
    // en cours, encore en cours (la page attend : le test ouvre « Configuration »), puis fini
    const etats = [enCoursDeRoute, enCoursDeRoute, configure()]
    let tour = 0
    const enCours = { ...exemple.run.execution, source: 'journal', statut: 'en_cours', appels: { total: 3, repondus: 2, pannes: 0, tronques: 0, refus: 0, tentatives: 3 } }
    let lu = 0
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': () => jsonResponse(200, etats[Math.min(tour++, etats.length - 1)]),
      'POST api/twin9/runs/avancer': jsonResponse(200, { avance: true, locked: false }),
      'GET api/twin9/runs/7/resultats': () => (lu++ === 0 ? resultats(enCours) : resultats()),
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: () => attente }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('En cours'))
    const details = screen.getByText('Configuration').closest('details')
    fireEvent.click(details.querySelector('summary'))
    await within(details).findByText(/Lue dans son journal/)
    expect(lignes(details.querySelectorAll('dl')[1]).Appels).toBe('3 : 2 répondus, 0 en panne')
    expect(details.querySelector('.twin9-conseil')).toBeNull()

    lache()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    await within(details).findByText(/Figée à la fin du run/)
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(2)
  })

  it('relit ses comptes à chaque ouverture tant que le run est en cours ; fini, une seule lecture', async () => {
    const enCoursDeRoute = configure({ statut: 'en_cours', retard: null, compteurs: null, progression: { appels: { envoye: 1, attente: 0, repondu: 2, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 } })
    const compte = (repondus) => ({ ...exemple.run.execution, source: 'journal', statut: 'en_cours', appels: { total: repondus + 1, repondus, pannes: 0, tronques: 0, refus: 0, tentatives: repondus + 1 } })
    let lu = 0
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, enCoursDeRoute),
      'POST api/twin9/runs/avancer': jsonResponse(200, { avance: false, locked: false }),
      'GET api/twin9/runs/7/resultats': () => resultats(compte(2 + 3 * lu++)),
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: () => new Promise(() => {}) }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('En cours'))
    const details = screen.getByText('Configuration').closest('details')
    const summary = details.querySelector('summary')
    fireEvent.click(summary)
    await within(details).findByText(/Lue dans son journal à l’ouverture/)
    expect(lignes(details.querySelectorAll('dl')[1]).Appels).toBe('3 : 2 répondus, 0 en panne')

    fireEvent.click(summary)
    await waitFor(() => expect(details.open).toBe(false))
    fireEvent.click(summary)
    await waitFor(() => expect(lignes(details.querySelectorAll('dl')[1]).Appels).toBe('6 : 5 répondus, 0 en panne'))
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(2)
    cleanup()

    const finiFetch = routedFetch({ 'GET api/twin9/runs/7': jsonResponse(200, configure()), 'GET api/twin9/runs/7/resultats': resultats() })
    render(<Twin9View section="7" deps={{ fetchFn: finiFetch, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    const fige = screen.getByText('Configuration').closest('details')
    fireEvent.click(fige.querySelector('summary'))
    await within(fige).findByText('Réglages des appels')
    fireEvent.click(fige.querySelector('summary'))
    await waitFor(() => expect(fige.open).toBe(false))
    fireEvent.click(fige.querySelector('summary'))
    await waitFor(() => expect(fige.open).toBe(true))
    expect(finiFetch.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(1)
  })

  it('dit une erreur de lecture dans le bloc, sans toucher la page ; la rouvrir réessaie', async () => {
    let echec = true
    const fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, configure()),
      'GET api/twin9/runs/7/resultats': () => (echec ? jsonResponse(500, { error: 'Erreur interne' }) : resultats()),
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    const details = screen.getByText('Configuration').closest('details')
    const summary = details.querySelector('summary')
    fireEvent.click(summary)
    expect((await within(details).findByText('Erreur interne')).className).toBe('load-error')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' })).toBeTruthy()

    echec = false
    fireEvent.click(summary)
    await waitFor(() => expect(details.open).toBe(false))
    fireEvent.click(summary)
    await within(details).findByText('Réglages des appels')
    expect(fetchFn.mock.calls.filter(([url]) => url === 'api/twin9/runs/7/resultats')).toHaveLength(2)
  })
})
