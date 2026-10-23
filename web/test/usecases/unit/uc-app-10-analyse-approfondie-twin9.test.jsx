// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Code sollicité appelé directement : les routes #/twin9 et #/twin9/<id> et
// l'entrée « Analyse approfondie » de la navigation, le client des runs
// (web/src/api/twin9.js : méthode, chemin, corps, jeton CSRF), le document
// `twin9-run` que la page remet à l'interface de cartographie
// (twin9RunFiles), et la vue Twin9View rendue seule avec ses coutures
// (fetchFn, store, pause) : Lancer (journées à instruire), Apercu (admission,
// refus) et PageDuRun (reprise après un arrêt par un plafond). Les runs
// tournent sur le serveur (ADR-011) : le front ne fait que les lancer, les
// suivre et les lire. Depuis P0-1 : la configuration et l'exécution du run
// (VueConfiguration, pour son propriétaire et pour un cartographe lié) et
// ce que l'importeur du run en garde dans le jeu (liste blanche). Depuis le
// sprint 4 (T0) : le portfolio envoyé à Twin9, découpé en les journées de
// l'interface (portfolioPourTwin9), et ce que l'aperçu en dit.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { navGroups } from '../../../src/nav.js'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  annulerRun,
  apercuRun,
  avancerRuns,
  fetchConfiguration,
  fetchResultats,
  fetchRun,
  fetchRuns,
  lancerRun,
  rendreRunVisible,
  reprendreRun,
} from '../../../src/api/twin9.js'
import { twin9RunFiles } from '../../../src/lib/interface-handoff.js'
import { createMemoryAdapter, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import Twin9View from '../../../src/views/Twin9View.jsx'
import { ETAPES_DU_MOTEUR, VueConfiguration } from '../../../src/views/twin9/ConfigurationDuRun.jsx'
import { importTwin9Run } from '../../../src/carto/core/importers/twin9-run.js'
import { buildHighlightedPortfolioMarkdown, buildPortfolioMarkdown } from '../../../src/carto/core/portfolio-md.js'
import { sansMarquesTwin9 } from '../../../src/lib/twin9/marques.js'
import { portfolioPourTwin9 } from '../../../src/lib/twin9/portfolio-pour-twin9.js'
import { segmentText } from '@engine/portfolio/segment.js'
import { StigmergieDuJour } from '../../../src/carto/ui/Stigmergie.jsx'
import { SecondReadings } from '../../../src/carto/ui/SecondReading.jsx'
import { jsonResponse } from '../support/twin.js'
// un run configuré, tel que ses résultats le rendent à son propriétaire (P0-1) : valeurs inventées
import exemple from '../../../../schemas/fixtures/twin9-configuration-exemple.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const PORTFOLIO = '## 2026-01-05\nPremier jour : j’ai monté le capteur.\n## 2026-01-06\nDeuxième jour : j’ai lu les mesures.\n'

/** Routeur de fetchFn : « MÉTHODE api/chemin » → réponse (objet ou fonction de init). */
function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) return jsonResponse(404, { error: `route non simulée : ${key}` })
    return typeof handler === 'function' ? handler(init) : handler
  })
}

/** Un run tel que sa page le suit (GET /api/twin9/runs/{id}). */
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
    profil: { id: 3, nom: 'Direct', mode: 'complet' },
    gabarits: { jeu: 'v9.8', versions: {}, empreinte: 'abcdef0123456789' },
    referentiel: { id: 'respire', version: '7.0.0', empreinte: '0123456789abcdef' },
    moteur: { commit: null },
  },
  progression: { appels: { envoye: 0, attente: 0, repondu: 0, panne: 0 }, journees: 0, fusion: false, lots: 0, runs_avant: 0 },
  cout: { depense_microusd: 0, budget_usd: null, duree_minutes: null },
  compteurs: null,
  created_at: '2026-10-20 10:00:00',
  avance_at: null,
  finished_at: null,
  accord_at: '2026-10-20 10:00:00',
  ...extra,
})

/** L'aperçu (POST /api/twin9/runs/apercu) d'un premier run de deux journées, d'après la référence. */
const apercu = (extra = {}) => ({
  journal: 'Mon_journal',
  mode: 'complet',
  voie: 'directe',
  cle: 'instance',
  journees: { total: 2, nouvelles: 2, changees: 0 },
  estimation: { cout_usd: 3.38688, min_usd: 3.38688, max_usd: 3.38688, reserve_usd: 2.25792, duree_s: 1316, reference: 'PLANT-01', poles: 7 },
  admission: { journees: 2, total: 2, limite: 'credit', instruites: 2, en_attente: 0, changees_en_attente: 0, autres_usd: 0, refus: null },
  plafonds: { budget_usd: null, duree_minutes: null },
  credit_usd: 100,
  ...extra,
})

async function bibliotheque() {
  const store = createPortfolioStore(createMemoryAdapter())
  await store.create({ titre: 'Mon journal', texte: PORTFOLIO })
  return store
}

/** Twin9View à #/twin9, l'aperçu donné ; l'accord coché, rend la région « Avant de lancer ». */
async function avantDeLancer(reponseApercu) {
  const fetchFn = routedFetch({
    'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
    'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
    'POST api/twin9/runs/apercu': jsonResponse(200, reponseApercu),
  })
  render(<Twin9View deps={{ fetchFn, store: await bibliotheque() }} />)
  fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
  return screen.findByRole('region', { name: 'Avant de lancer' })
}

describe('UC-APP-10 — routes et navigation', () => {
  it('UC-APP-10-U01 — #/twin9 (lancer) et #/twin9/<id> (la page d’un run) ; l’entrée « Analyse approfondie », premium, pour un apprenant', () => {
    expect(parseHash('#/twin9')).toEqual({ name: 'twin9', section: null })
    expect(parseHash('#/twin9/12')).toEqual({ name: 'twin9', section: '12' })

    const carto = navGroups({ roles: ['apprenant'] }).find((g) => g.id === 'cartographie')
    const entree = carto.items.find((i) => i.label === 'Analyse approfondie')
    expect(entree).toEqual({ href: '#/twin9', label: 'Analyse approfondie', route: 'twin9', badge: 'premium', hint: 'Twin9' })
    // Elle suit la cartographie ouverte : l'échelle gratuit / standard / premium se lit dans l'ordre.
    expect(carto.items.map((i) => i.label).slice(2, 5)).toEqual(['Cartographier mes écrits', 'Cartographie ouverte', 'Analyse approfondie'])
    // Un visiteur ne la voit pas : la famille « Ma cartographie » est celle de l'apprenant.
    expect(navGroups({ roles: [] }).flatMap((g) => g.items).some((i) => i.href === '#/twin9')).toBe(false)
  })
})

describe('UC-APP-10 — client des runs', () => {
  it('UC-APP-10-U02 — lectures en GET ; aperçu, lancement, avance, annulation, reprise (avec ou sans budget) en POST, visibilité en PUT, chacun avec le jeton CSRF', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me' ? jsonResponse(200, { user: { id: 7 }, csrfToken: 'csrf-uc-app-10' }) : jsonResponse(200, { ok: true }),
    )
    const portfolio = { nom: 'Mon journal.md', texte: PORTFOLIO }
    await fetchMe({ fetchFn })
    await fetchRuns({ fetchFn })
    await fetchConfiguration({ fetchFn })
    await apercuRun({ profil: 3, portfolio }, { fetchFn })
    await lancerRun({ profil: null, portfolio, accord: true, visibilite: 'cartographe' }, { fetchFn })
    await fetchRun(7, { fetchFn })
    await avancerRuns({ fetchFn })
    await annulerRun(7, { fetchFn })
    await reprendreRun(7, { fetchFn })
    await reprendreRun(7, { fetchFn }, { budget_usd: 5 })
    await reprendreRun(7, { fetchFn }, { budget_usd: null })
    await rendreRunVisible(7, 'cartographe', { fetchFn })
    await fetchResultats(7, { fetchFn })

    const appels = fetchFn.mock.calls.slice(1).map(([url, init]) => [
      init.method,
      url,
      init.body === undefined ? undefined : JSON.parse(init.body),
      init.headers['X-CSRF-Token'],
    ])
    expect(appels).toEqual([
      ['GET', 'api/twin9/runs', undefined, undefined],
      ['GET', 'api/twin9/configuration', undefined, undefined],
      ['POST', 'api/twin9/runs/apercu', { profil: 3, portfolio }, 'csrf-uc-app-10'],
      ['POST', 'api/twin9/runs', { profil: null, portfolio, accord: true, visibilite: 'cartographe' }, 'csrf-uc-app-10'],
      ['GET', 'api/twin9/runs/7', undefined, undefined],
      ['POST', 'api/twin9/runs/avancer', undefined, 'csrf-uc-app-10'],
      ['POST', 'api/twin9/runs/7/annuler', undefined, 'csrf-uc-app-10'],
      ['POST', 'api/twin9/runs/7/reprendre', undefined, 'csrf-uc-app-10'],
      ['POST', 'api/twin9/runs/7/reprendre', { budget_usd: 5 }, 'csrf-uc-app-10'],
      ['POST', 'api/twin9/runs/7/reprendre', { budget_usd: null }, 'csrf-uc-app-10'],
      ['PUT', 'api/twin9/runs/7/visibilite', { visibilite: 'cartographe' }, 'csrf-uc-app-10'],
      ['GET', 'api/twin9/runs/7/resultats', undefined, undefined],
    ])
  })
})

describe('UC-APP-10 — le document remis à l’interface de cartographie', () => {
  const FUSION = { journal_id: 'mon-journal', competences: { '1.01': { code: '1.01', attestations: [], signaux: [] } } }
  const JOUR = { journee: '2026-01-05', date: '2026-01-05', verdicts: {} }
  const REFERENTIEL_DU_RUN = {
    id: 'respire',
    version: '7.0.0',
    label: 'RESPIRE v7',
    poles: [{ num: 1, nom: 'TETE — Penser & Comprendre', couleur: '#2563eb' }],
    competences: [
      { code: '1.01', nom: 'Pensée critique', pole: 1 },
      { code: '1.02', nom: 'Synthèse', pole: 1 },
    ],
  }
  const PUBLIE = {
    id: 'respire',
    poles: [],
    competences: [{ code: '1.01', description: 'Examiner avant de conclure.' }, { code: '1.02' }],
  }
  const resultats = (extra = {}) => ({
    run: { id: 7, journal: 'mon-journal', statut: 'termine' },
    lecteur: 'proprietaire',
    sorties: {
      'carto_evolutive.json': JSON.stringify(FUSION),
      'journees/2026-01-05/carto_jour.json': JSON.stringify(JOUR),
      'journees/2026-01-06/carto_jour.json': JSON.stringify({ ...JOUR, journee: '2026-01-06', date: '2026-01-06' }),
      'rapport.md': '# Rapport',
    },
    memoire: ['2026-01-06'],
    referentiel: REFERENTIEL_DU_RUN,
    ...extra,
  })

  it('UC-APP-10-U03 — document `twin9-run` : fusion et cartes du jour lues, mémoire, référentiel du run complété des descriptions du publié de même identifiant, `incomplete` ; rien à ouvrir → erreur', async () => {
    const getReferentiel = vi.fn(async () => ({ doc: PUBLIE }))
    const files = await twin9RunFiles(resultats(), { getReferentiel })
    expect(files.map((f) => f.path)).toEqual(['twin9-run-7.json'])
    const doc = JSON.parse(files[0].text)
    expect(doc.kind).toBe('twin9-run')
    expect(doc.run).toEqual({ id: 7, journal: 'mon-journal', statut: 'termine' })
    expect(doc.carto_evolutive).toEqual(FUSION)
    expect(Object.keys(doc.journees)).toEqual(['2026-01-05', '2026-01-06'])
    expect(doc.journees['2026-01-05']).toEqual(JOUR)
    expect(doc.memoire).toEqual(['2026-01-06'])
    expect(doc.incomplete).toBe(false)
    // Le référentiel du run, ses pôles et ses compétences ; la description du publié s'y ajoute là où il en a une.
    expect(doc.referentiel).toEqual({
      ...REFERENTIEL_DU_RUN,
      competences: [{ code: '1.01', nom: 'Pensée critique', pole: 1, description: 'Examiner avant de conclure.' }, { code: '1.02', nom: 'Synthèse', pole: 1 }],
    })
    // Seules les cartes du jour et la fusion entrent : pas le rapport.
    expect(JSON.stringify(doc)).not.toContain('# Rapport')

    // Un autre référentiel garde le sien, sans description d'un publié qui n'est pas lui.
    const autre = { ...REFERENTIEL_DU_RUN, id: 'fictif-lettre', label: 'Fictif lettré' }
    expect(JSON.parse((await twin9RunFiles(resultats({ referentiel: autre }), { getReferentiel }))[0].text).referentiel).toEqual(autre)
    // Un run d'avant T16, qui ne le dit pas, a lu RESPIRE : le référentiel publié.
    expect(JSON.parse((await twin9RunFiles(resultats({ referentiel: null }), { getReferentiel }))[0].text).referentiel).toEqual(PUBLIE)

    // Un run arrêté : sa carte est incomplète, sa fusion peut manquer.
    const arrete = resultats({
      run: { id: 8, journal: 'mon-journal', statut: 'echoue' },
      sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify(JOUR) },
      memoire: [],
    })
    const docArrete = JSON.parse((await twin9RunFiles(arrete, { getReferentiel }))[0].text)
    expect([docArrete.incomplete, docArrete.carto_evolutive, Object.keys(docArrete.journees)]).toEqual([true, null, ['2026-01-05']])

    // Rien à ouvrir : ni fusion ni journée finie.
    await expect(twin9RunFiles(resultats({ sorties: { 'rapport.md': '# Rapport' } }), { getReferentiel })).rejects.toThrow(
      'Ce run n’a encore ni fusion ni journée finie : rien à ouvrir dans la cartographie.',
    )
  })
})

describe('UC-APP-10 — Twin9View : avant de lancer', () => {
  it('UC-APP-10-U04 — les journées à instruire : toutes au premier run ; les nouvelles ou changées d’un portfolio déjà évalué (A1) ; rien de neuf, la fusion seule', async () => {
    const cas = [
      [{ total: 2, nouvelles: 2, changees: 0 }, '2 journées à instruire.'],
      [{ total: 1, nouvelles: 1, changees: 0 }, '1 journée à instruire.'],
      [
        { total: 3, nouvelles: 1, changees: 0 },
        'Ce portfolio a déjà été évalué : 1 journée sur 3 à instruire (1 nouvelle), les autres reprises telles quelles.',
      ],
      [
        { total: 4, nouvelles: 1, changees: 2 },
        'Ce portfolio a déjà été évalué : 3 journées sur 4 à instruire (1 nouvelle et 2 changées), les autres reprises telles quelles.',
      ],
      [
        { total: 3, nouvelles: 0, changees: 0 },
        'Ce portfolio a déjà été évalué : aucune journée nouvelle ni changée, seule la fusion se refait.',
      ],
    ]
    for (const [journees, phrase] of cas) {
      const region = await avantDeLancer(apercu({ journees }))
      expect(region.querySelector('p').textContent).toBe(phrase)
      cleanup()
    }
  })

  it('UC-APP-10-U05 — admission partielle : ce que le crédit couvre, que les autres attendent, le coût des journées admises (A2) ; refus : ce qu’il faudrait, « Recharger », bouton désactivé (E5)', async () => {
    const partielle = await avantDeLancer(
      apercu({ admission: { journees: 1, total: 2, limite: 'credit', instruites: 1, en_attente: 1, changees_en_attente: 0, autres_usd: 0, refus: null } }),
    )
    expect(partielle.textContent).toContain(
      'Votre crédit couvre 1 des 2 journées à instruire, avec leur fusion, d’après le run de référence, réserves des appels comprises. ' +
        'L’autre attendra une prochaine analyse.',
    )
    expect(partielle.textContent).toContain('Coût estimé (1 journée) : 3,39 $ · durée estimée : 22 min (d’après le vrai run de PLANT-01, en essai, × 7 pôles).')
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(false)
    cleanup()

    const refus =
      'Votre crédit ne couvre pas une carte, même d’une journée : il faudrait 2,26 $ (une journée et sa fusion, d’après le run de référence, réserves des appels comprises)'
    const refusee = await avantDeLancer(
      apercu({ admission: { journees: 0, total: 2, limite: 'credit', instruites: 0, en_attente: 2, changees_en_attente: 0, autres_usd: 0, refus } }),
    )
    const alerte = within(refusee).getByRole('alert')
    expect(alerte.textContent).toBe(`${refus}. Recharger`)
    expect(within(alerte).getByRole('link', { name: 'Recharger' }).getAttribute('href')).toBe('#/compte/credit')
    expect(refusee.textContent).not.toContain('Coût estimé')
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(true)
  })
})

describe('UC-APP-10 — Twin9View : l’accord nomme les fournisseurs (ADR-012)', () => {
  const anthropic = { id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' }
  const openrouter = { id: 'openrouter', libelle: 'OpenRouter', rgpd: 'non', voie: 'directe' }

  it('UC-APP-10-U17 — chaque fournisseur du profil, sa voie et son étiquette RGPD, avant tout aperçu ; un autre profil le redemande ; le lancement envoie leur liste ; un serveur qui ne la donne pas : Anthropic', async () => {
    let envoye = null
    const apercus = []
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, {
        profils: [{ id: 3, nom: 'Mixte', fournisseurs: [anthropic, openrouter] }, { id: 4, nom: 'Ancien' }],
        defaut_fournisseurs: [anthropic],
      }),
      'POST api/twin9/runs/apercu': (init) => {
        apercus.push(JSON.parse(init.body).profil)
        return jsonResponse(200, apercu())
      },
      'POST api/twin9/runs': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, { id: 7 })
      },
    })
    render(<Twin9View deps={{ fetchFn, store: await bibliotheque(), navigate: vi.fn() }} />)
    const accord = async () => (await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ })).closest('label')
    expect((await accord()).textContent).toContain('Le texte part chez Anthropic (par lots ; RGPD : sous conditions), le fournisseur du modèle.')

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    expect((await accord()).textContent).toContain(
      'Le texte part chez les fournisseurs des modèles de ce profil : Anthropic (par lots ; RGPD : sous conditions) et ' +
        'OpenRouter (en direct ; RGPD : non). Par lots, Anthropic garde le lot jusqu’à sa suppression, 29 jours au plus. ' +
        'OpenRouter est étiqueté « non » au regard du RGPD : à éviter pour les journaux d’élèves réels.',
    )
    expect(apercus).toEqual([]) // rien ne part avant l'accord
    fireEvent.click(within(await accord()).getByRole('checkbox'))
    await screen.findByRole('region', { name: 'Avant de lancer' })

    // un profil que le serveur ne décrit pas (avant ADR-012) : Anthropic, sa voie tue ; l'accord est à redonner
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '4' } })
    expect(within(await accord()).getByRole('checkbox').checked).toBe(false)
    expect((await accord()).textContent).toContain('Le texte part chez Anthropic (RGPD : sous conditions), le fournisseur du modèle.')
    expect(screen.queryByRole('region', { name: 'Avant de lancer' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    fireEvent.click(within(await accord()).getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    await waitFor(() => expect(envoye).not.toBeNull())
    expect(envoye.accord).toEqual({ fournisseurs: ['anthropic', 'openrouter'] })
    expect(apercus).toEqual([3, 3])
  })
})

describe('UC-APP-10 — Twin9View : la page d’un run arrêté', () => {
  it('UC-APP-10-U06 — arrêté par son budget : nouveau budget (au-delà de la dépense, ou vide pour aucun), reprise `{budget_usd}` ; par le crédit : « Recharger mon crédit », reprise sans budget (A4)', async () => {
    const corps = []
    const parBudget = run({
      statut: 'echoue',
      attente: 'budget atteint : carte incomplète',
      retard: 'Budget atteint : carte incomplète',
      progression: { appels: { envoye: 0, attente: 1, repondu: 5, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 },
      cout: { depense_microusd: 980_000, budget_usd: 1, duree_minutes: null },
    })
    let fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, parBudget),
      'POST api/twin9/runs/7/reprendre': (init) => {
        corps.push(init.body === undefined ? undefined : JSON.parse(init.body))
        return jsonResponse(200, parBudget)
      },
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Arrêté — Budget atteint : carte incomplète'))
    expect(screen.getByText('Coût : 0,98 $ · budget : 1,00 $')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Recharger mon crédit' })).toBeNull()

    const champ = screen.getByLabelText(/Nouveau budget \(USD\)/)
    const reprendre = screen.getByRole('button', { name: 'Reprendre' })
    expect(champ.getAttribute('placeholder')).toBe('aucun')
    // Un budget qui ne dépasse pas ce qui est dépensé ne reprend pas.
    fireEvent.change(champ, { target: { value: '0.5' } })
    expect(reprendre.disabled).toBe(true)
    fireEvent.change(champ, { target: { value: '5' } })
    expect(reprendre.disabled).toBe(false)
    fireEvent.click(reprendre)
    await waitFor(() => expect(corps).toEqual([{ budget_usd: 5 }]))
    // Vide : aucun budget.
    fireEvent.change(champ, { target: { value: '' } })
    fireEvent.click(reprendre)
    await waitFor(() => expect(corps).toEqual([{ budget_usd: 5 }, { budget_usd: null }]))
    cleanup()

    corps.length = 0
    const parCredit = run({
      statut: 'echoue',
      attente: 'crédit insuffisant : carte incomplète',
      retard: 'Crédit insuffisant : carte incomplète',
      progression: { appels: { envoye: 0, attente: 0, repondu: 2, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 },
      cout: { depense_microusd: 120_000, budget_usd: null, duree_minutes: null },
    })
    fetchFn = routedFetch({
      'GET api/twin9/runs/7': jsonResponse(200, parCredit),
      'POST api/twin9/runs/7/reprendre': (init) => {
        corps.push(init.body === undefined ? undefined : JSON.parse(init.body))
        return jsonResponse(200, parCredit)
      },
    })
    render(<Twin9View section="7" deps={{ fetchFn, pause: async () => {} }} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Arrêté — Crédit insuffisant : carte incomplète'))
    expect(screen.getByRole('link', { name: 'Recharger mon crédit' }).getAttribute('href')).toBe('#/compte/credit')
    expect(screen.queryByLabelText(/Nouveau budget/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(corps).toEqual([undefined]))
  })
})

// P0-1 (docs/contrats.md §8.9) : ce avec quoi un run a été lancé, et comment il s'est déroulé.
describe('UC-APP-10 — la configuration et l’exécution d’un run (P0-1)', () => {
  /** Ce qu'un cartographe lié en lit (RunConfiguration::pourCartographe, RunExecution::pourCartographe). */
  function pourCartographe() {
    const configuration = structuredClone(exemple.run.configuration)
    delete configuration.prix
    delete configuration.execution_prevue.plafonds
    delete configuration.execution_prevue.cle
    const execution = structuredClone(exemple.run.execution)
    delete execution.cout_microusd
    for (const table of ['par_voie', 'par_fournisseur', 'par_modele']) for (const c of Object.values(execution[table])) delete c.cout_microusd
    for (const r of execution.reprises) delete r.budget_usd
    return { configuration, execution }
  }
  const termes = (racine, selecteur) => [...racine.querySelectorAll(selecteur)].map((x) => x.textContent)

  it('UC-APP-10-U14 — VueConfiguration : chaque rôle avec son fournisseur et son étiquette RGPD, sa voie, son modèle, son budget de sortie ; jeu, référentiel, clé ; appels, pannes et sorties tronquées par fournisseur et par voie, passes, coût — sans clé ni coût pour un cartographe lié', () => {
    const { container } = render(<VueConfiguration configuration={exemple.run.configuration} execution={exemple.run.execution} />)
    expect(termes(container, 'dl:first-of-type > dt')).toEqual(['Empreinte', 'Lancé le', 'Fournisseurs', 'Jeu de gabarits', 'Référentiel', 'Clé'])
    expect(container.querySelector('tr[data-role="etapes/greffier"]').textContent).toBe('GreffierAnthropic RGPD : sous conditionspar lotsclaude-exemple-rapide2000')
    // tous les rôles : 3 étages, les étapes et le second ressort de la configuration, chaque lecteur du collège
    const appels = exemple.run.configuration.appels
    expect(container.querySelectorAll('tr[data-role]')).toHaveLength(['etages', 'etapes', 'second_ressort', 'lecteurs'].reduce((n, g) => n + Object.keys(appels[g]).length, 0))
    expect(termes(container, 'dl:last-of-type > dt')).toEqual(['Appels', 'Passes du moteur', 'Lots', 'Coût'])
    expect(termes(container, 'table caption')).toEqual(['Réglages des appels', 'Par fournisseur', 'Par voie'])
    expect(termes(container, 'table:last-of-type thead th')).toEqual(['Voie', 'Appels', 'Pannes', 'dont tronqués', 'Coût'])
    // le conseil des sorties tronquées (P0-2) : sans les compteurs d'un run fini, ni l'étape ni la phase ne sont
    // connues ; le remède dit son coût — un autre budget de sortie change l'empreinte des réglages
    const conseil = container.querySelector('.twin9-conseil').textContent
    expect(conseil).toContain('Une sortie tronquée a été comptée en panne.')
    expect(conseil).toContain('Une journée dont un appel est en panne n’entre pas dans la mémoire de la carte')
    expect(conseil).toContain('augmentez le budget de sortie de son étape')
    expect(conseil).toContain('change l’empreinte des réglages, et au prochain run toutes les journées de la carte sont instruites de nouveau, et payées, pas seulement celles d’une panne')
    // jamais un prix : la grille n'est pas affichée
    expect(container.textContent).not.toMatch(/USD\/MTok|remise|1,5 \$|7,5 \$/)
    cleanup()

    // les compteurs du run fini nomment les étapes, comme la page des profils : une journée, ou la fusion
    const conseilDe = (parEtape, tronques = 1) => {
      const execution = { ...exemple.run.execution, appels: { ...exemple.run.execution.appels, tronques } }
      const { container: c } = render(<VueConfiguration configuration={exemple.run.configuration} execution={execution} parEtape={parEtape} />)
      const texte = c.querySelector('.twin9-conseil').textContent
      cleanup()
      return texte
    }
    const greffier = conseilDe({ greffier: { appels: 3, pannes: 1, tronques: 1 }, president: { appels: 2, pannes: 0, tronques: 0 } })
    expect(greffier).toContain('Une sortie tronquée a été comptée en panne (étape « Greffier »).')
    expect(greffier).toContain('augmentez le budget de sortie de l’étape « Greffier »')
    expect(greffier).toContain('Une journée dont un appel est en panne')
    expect(greffier).not.toContain('fusion')
    const fusion = conseilDe({ merge_rapporteur: { appels: 1, pannes: 1, tronques: 1 } })
    expect(fusion).toContain('(étape « Relectures »)')
    expect(fusion).toContain('Un appel de la fusion n’est d’aucune journée : la fusion se refait à chaque run.')
    expect(fusion).not.toContain('Une journée dont')
    expect(fusion).toContain('toutes les journées de la carte sont instruites de nouveau')
    const deux = conseilDe({ jure2: { appels: 4, pannes: 1, tronques: 1 }, tagger: { appels: 6, pannes: 1, tronques: 1 }, condense: { appels: 1, pannes: 1, tronques: 1 } }, 3)
    expect(deux).toContain('3 sorties tronquées ont été comptées en panne (étapes « Jurés, second tour », « Lecteurs », « Arpenteur »).')
    expect(deux).toContain('Une journée dont un appel est en panne')
    expect(deux).toContain('la fusion se refait à chaque run')
    expect(deux).toContain('Pour qu’elles ne soient plus tronquées, augmentez le budget de sortie de ces étapes (Régler mes profils)')

    const lu = pourCartographe()
    const { container: c2 } = render(<VueConfiguration configuration={lu.configuration} execution={lu.execution} />)
    expect(termes(c2, 'dl:first-of-type > dt')).toEqual(['Empreinte', 'Lancé le', 'Fournisseurs', 'Jeu de gabarits', 'Référentiel'])
    expect(termes(c2, 'dl:last-of-type > dt')).toEqual(['Appels', 'Passes du moteur', 'Lots'])
    expect(termes(c2, 'table:last-of-type thead th')).toEqual(['Voie', 'Appels', 'Pannes', 'dont tronqués'])
    expect(c2.textContent).not.toMatch(/\$|undefined|NaN/)
    cleanup()

    // un run d'avant P0-1 : son exécution seule, marquée partielle
    const { container: c3 } = render(<VueConfiguration configuration={null} execution={{ ...lu.execution, partiel: true, source: 'journal', statut: 'en_cours' }} />)
    expect(c3.textContent).toContain('Ce run a été lancé avant que sa configuration soit gardée.')
    expect(c3.textContent).toContain('Lue dans son journal à l’ouverture : le run n’est pas fini, et ses comptes avancent ; refermez puis rouvrez « Configuration » pour les relire.')
    expect(c3.textContent).toContain('ses passes et le temps du moteur sont incomplets')
    cleanup()

    // un run arrêté : ses comptes, lus dans son journal, ne bougent plus
    const { container: c4 } = render(<VueConfiguration configuration={lu.configuration} execution={{ ...lu.execution, source: 'journal', statut: 'annule' }} />)
    expect(c4.querySelector('.twin9-config-source').textContent).toBe('Lue dans son journal : le run est arrêté, ses comptes ne bougent plus tant qu’il ne reprend pas.')
  })

  it('UC-APP-10-U16 — les étapes que nomme le conseil des sorties tronquées sont celles du moteur, comme CallSettings::ETAPES les range', () => {
    const php = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../api/src/Twin9/CallSettings.php'), 'utf8')
    const bloc = /public const ETAPES = \[([\s\S]*?)\];/.exec(php)[1]
    const etapes = Object.fromEntries([...bloc.matchAll(/'(\w+)' => '(\w+)'/g)].map((m) => [m[1], m[2]]))
    expect(Object.keys(etapes).length).toBeGreaterThan(15)
    expect(ETAPES_DU_MOTEUR).toEqual(etapes)
  })

  it('UC-APP-10-U15 — importTwin9Run : la configuration et l’exécution gardées par liste blanche sous « <run>|configuration » (ni prix, ni coût, ni plafond, ni clé), non comptées comme une délibération ; chaque journée dit ses modèles et son jeu de gabarits', () => {
    const doc = {
      kind: 'twin9-run',
      run: { ...exemple.run, id: 7, journal: 'mon-journal' },
      referentiel: null,
      carto_evolutive: null,
      journees: { '2026-01-05': { journee: '2026-01-05', date: '2026-01-05', verdicts: { '1.01': { code: '1.01', nom: 'Analyse', statut: 'présence établie', score_preuves: 1, score_indices: 0, confiance: 0.8 } } } },
      memoire: [],
    }
    const r = importTwin9Run(doc, { now: '2026-10-22T10:00:00Z' })
    expect(r.variants[0].summary.provenance).toMatchObject({
      source: 'twin9',
      model: 'profond: claude-exemple-profond, rapide: claude-exemple-rapide, lecteurs: claude-exemple-rapide',
      prompt: 'gabarits jeu-exemple',
      configurationRef: 'twin9:7|configuration',
      configuration: { empreinte: exemple.run.configuration.empreinte, fournisseurs: ['anthropic'], voies: ['lots'] },
    })
    expect(r.runDetails.map((x) => x.key)).toEqual(['twin9:7|configuration'])
    expect(r.report.find((x) => x.code === 'twin9-run').message).toBe('Run Twin9 7 : 1 journée(s), 0 délibération(s)')
    const meta = r.runDetails[0].value
    expect(Object.keys(meta.configuration)).toEqual(['empreinte', 'fournisseurs', 'appels', 'referentiel', 'gabarits'])
    expect(meta.configuration.gabarits).toEqual({ jeu: 'jeu-exemple' })
    expect(Object.keys(meta.execution)).toEqual(['statut', 'source', 'partiel', 'passes', 'appels', 'par_fournisseur', 'par_voie'])
    expect(JSON.stringify(r)).not.toMatch(/"prix"|"grille"|"cle"|"plafonds"|"budget_usd"|"cout_microusd"|"jetons|"reprises"/)
  })
})

// S3-3 — la stigmergie du greffier (docs/twin9/spec-stigmergie.md §9 et §11.3 de Twin_v9) : valeurs inventées.
describe('UC-APP-10 — les traces de la stigmergie du greffier (S3-3)', () => {
  const TRACE = { id: 't-0a1b2c3d4e5f', code: '1.01', start: 0, end: 30, extrait: 'Premier jour : j’ai monté le capteur.', tau: 1.7, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 2, premier_run: 'r1', dernier_run: 'r2' }
  const bloc = (extra = {}) => ({ analyse: 2, run: '2026-10-23T10:00:00.a1b2c3', explorateurs: [], lues: {}, depots: [{ code: '1.01' }], rejets: [], traces: [TRACE], ...extra })
  const docStigmergie = (extra = {}) => ({
    kind: 'twin9-run',
    run: { id: 7, journal: 'mon-journal' },
    referentiel: null,
    carto_evolutive: null,
    journees: {
      '2026-01-05': { journee: '2026-01-05', date: '2026-01-05', verdicts: { '1.01': { code: '1.01', nom: 'Analyse', statut: 'présence établie', score_preuves: 1, score_indices: 0, confiance: 0.8 } }, stigmergie: bloc() },
    },
    memoire: [],
    ...extra,
  })

  it('UC-APP-10-U19 — importTwin9Run : le bloc de la carte du jour gardé par liste blanche (rang, run, traces lisibles), résumé dans l’index ; conservé si les résultats le disent, non conservé pour une journée en panne, et jamais sans signal (sauf une journée de la mémoire) ; mêmes variantes avec ou sans lui', () => {
    const conserve = importTwin9Run(docStigmergie({ traces_conservees: { '2026-01-05': true } }), { now: '2026-10-23T10:00:00Z' })
    const [v] = conserve.variants
    expect(v.summary.stigmergie).toEqual({ analyse: 2, traces: 1, conservee: true })
    expect(v.detail.stigmergie).toEqual({
      analyse: 2,
      run: '2026-10-23T10:00:00.a1b2c3',
      conservee: true,
      traces: [{ id: 't-0a1b2c3d4e5f', code: '1.01', start: 0, end: 30, extrait: 'Premier jour : j’ai monté le capteur.', tau: 1.7, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 2 }],
    })
    const panne = importTwin9Run(docStigmergie({ traces_conservees: { '2026-01-05': false } }), { now: '2026-10-23T10:00:00Z' })
    expect(panne.variants[0].detail.stigmergie.conservee).toBe(false)
    expect(panne.report.find((x) => x.code === 'twin9-traces-non-conservees').date).toBe('2026-01-05')
    expect(importTwin9Run(docStigmergie(), { now: '2026-10-23T10:00:00Z' }).variants[0].detail.stigmergie.conservee).toBeNull()
    expect(importTwin9Run(docStigmergie({ memoire: ['2026-01-05'] }), { now: '2026-10-23T10:00:00Z' }).variants[0].detail.stigmergie.conservee).toBe(true)
    const sans = docStigmergie()
    delete sans.journees['2026-01-05'].stigmergie
    const sansBloc = importTwin9Run(sans, { now: '2026-10-23T10:00:00Z' }).variants[0]
    expect([sansBloc.summary.id, sansBloc.summary.digest]).toEqual([v.summary.id, v.summary.digest])
    expect(sansBloc.summary).not.toHaveProperty('stigmergie')
  })

  it('UC-APP-10-U20 — twin9RunFiles remet `traces_conservees` des résultats (nul sans lui) ; la section des traces dit leur nature en mots, leur conservation, et leur intensité seulement quand elle se montre — jamais « score »', async () => {
    const resultats = {
      run: { id: 7, journal: 'mon-journal', statut: 'termine' },
      sorties: { 'journees/2026-01-05/carto_jour.json': JSON.stringify(docStigmergie().journees['2026-01-05']) },
      memoire: [],
      referentiel: null,
    }
    const getReferentiel = vi.fn(async () => ({ doc: { id: 'respire', poles: [], competences: [] } }))
    const lu = async (r) => JSON.parse((await twin9RunFiles(r, { getReferentiel }))[0].text)
    expect((await lu({ ...resultats, traces_conservees: { '2026-01-05': false } })).traces_conservees).toEqual({ '2026-01-05': false })
    expect((await lu(resultats)).traces_conservees).toBeNull()

    const variant = { id: 'v1', stigmergie: { analyse: 2, traces: 1, conservee: true } }
    const refl = { compByCode: new Map([['1.01', { name: 'Analyse', pole: 1, order: 1 }]]), poleByNum: new Map() }
    const detail = (conservee) => ({ variants: { v1: { stigmergie: { analyse: 2, run: 'r2', conservee, traces: [TRACE] } } } })
    const onOpenPassage = vi.fn()
    const vue = (props) => render(<StigmergieDuJour date="2026-01-05" variant={variant} refl={refl} getDetail={() => detail(true)} onOpenPassage={onOpenPassage} {...props} />)
    const { container } = vue({ intensites: true })
    expect(container.querySelector('.carto-sg-what').textContent).toBe('1.01 Analyse · incertitude faible · intensité 1,70 sur 3, déposée par 2 analyses')
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans le portfolio' }))
    expect(onOpenPassage).toHaveBeenCalledWith({ date: '2026-01-05', extract: TRACE.extrait, label: 'Trace 1.01 · incertitude faible', incertitude: 'faible', conservee: true, intensite: '1,70' })
    cleanup()
    const simple = vue({})
    expect(simple.container.textContent).not.toMatch(/intensité|score/i)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans le portfolio' }))
    expect(onOpenPassage.mock.calls.at(-1)[0]).not.toHaveProperty('intensite')
    cleanup()
    const panne = vue({ getDetail: () => detail(false), intensites: true })
    expect(panne.container.querySelector('.carto-sg-warning').textContent).toContain('une panne n’est jamais un verdict')
    expect(panne.container.textContent).not.toMatch(/score/i)
    cleanup()
    // une analyse sans trace : rien
    expect(render(<StigmergieDuJour date="2026-01-05" variant={{ id: 'v1' }} refl={refl} getDetail={() => null} />).container.textContent).toBe('')
  })

  it('UC-APP-10-U21 — le portfolio surligné : chaque passage d’une trace conservée marqué selon sa nature, l’intensité seulement quand elle se montre, jamais une trace non conservée ; sans ses marques, le portfolio exporté à l’octet', () => {
    const exported = (conservee) => ({
      dataset: { days: [{ date: '2026-01-05', activeVariantId: 'v1', variants: [{ id: 'v1', stigmergie: { analyse: 2, traces: 1, conservee } }] }], reflections: [], portfolio: { undated: [] } },
      details: { '2026-01-05': { portfolio: { text: '## 2026-01-05\nPremier jour : j’ai monté le capteur.' }, variants: { v1: { stigmergie: { analyse: 2, run: 'r2', conservee, traces: [TRACE] } } } } },
    })
    const simple = buildHighlightedPortfolioMarkdown(exported(true))
    expect(simple.text).toContain('<mark data-twin9-code="1.01" data-incertitude="faible">Premier jour : j’ai monté le capteur.</mark>')
    expect(simple.text).toContain('<!-- twin9-traces -->')
    expect(simple.text).not.toMatch(/data-intensite|Intensité|score/i)
    const expert = buildHighlightedPortfolioMarkdown(exported(true), { intensites: true })
    expect(expert.text).toContain('data-intensite="1.7"')
    expect(expert.text).toContain('| 1.01 | incertitude faible | 1,70 |')
    for (const out of [simple, expert]) expect(sansMarquesTwin9(out.text)).toBe(buildPortfolioMarkdown(exported(true)).text)
    for (const nonConservee of [false, null]) expect(buildHighlightedPortfolioMarkdown(exported(nonConservee)).text).toBe(buildPortfolioMarkdown(exported(nonConservee)).text)
  })

  it('UC-APP-10-U22 — Twin9View : le texte envoyé à l’aperçu (et au lancement) ne porte jamais les marques d’un portfolio surligné, même rangé tel quel dans la bibliothèque', async () => {
    const corps = []
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, apercu())
      },
    })
    const store = createPortfolioStore(createMemoryAdapter())
    await store.create({ titre: 'Mon journal', texte: `## 2026-01-05\n<mark data-twin9-code="1.01" data-incertitude="faible">Premier jour</mark> : j’ai monté le capteur.\n\n<!-- twin9-traces -->\n| 1.01 |\n<!-- /twin9-traces -->\n` })
    render(<Twin9View deps={{ fetchFn, store }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    await waitFor(() => expect(corps).toHaveLength(1))
    expect(corps[0].portfolio.texte).toBe('## 2026-01-05\nPremier jour : j’ai monté le capteur.\n')
  })
})

describe('UC-APP-10 — le portfolio envoyé à Twin9 : les journées de l’interface (sprint 4, T0)', () => {
  it('UC-APP-10-U23 — Twin9View : l’aperçu et le lancement envoient le même texte, découpé selon la fiche du portfolio (une fusion faite à la main comprise) ; l’aperçu dit les journées retouchées', async () => {
    // fictif, écrit à rebours : Twin9 ne lit pas « 1er » ; la fiche a fusionné à la main le 3 dans le 1er
    const texte = '### 10.02.2026\nNous avons rangé la salle.\n\n### 1er.02.2026\nCarnet neuf.\n\n### 3.02.2026\nLe chat a ouvert la porte.\n'
    const [dix, premier, trois] = segmentText(texte, { today: '0000-00-00' })
    const segments = [dix, { ...premier, texte: premier.texte + trois.texte, fin: trois.fin }]
    const attendu = portfolioPourTwin9(texte, { segments })
    expect(attendu).toEqual({
      texte: '### 10.02.2026\nNous avons rangé la salle.\n\n### 2026-02-01\n\n### 1er.02.2026\nCarnet neuf.\n\n— ### 3.02.2026\nLe chat a ouvert la porte.\n',
      retouchees: ['2026-02-01', '2026-02-10'],
      sansDate: 0,
      // fusionné à la main dans le 1er, le 3 n'est plus une journée pour Twin9
      disparues: ['2026-02-03'],
    })

    const corps = []
    let lance = null
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, apercu())
      },
      'POST api/twin9/runs': (init) => {
        lance = JSON.parse(init.body)
        return jsonResponse(201, run())
      },
    })
    const store = createPortfolioStore(createMemoryAdapter())
    await store.create({ titre: 'Mon journal', texte, segments })
    const navigate = vi.fn()
    render(<Twin9View deps={{ fetchFn, store, navigate }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const region = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(region.textContent).toContain(
      'Pour que Twin9 y lise vos journées, le texte envoyé est retouché (un en-tête de date ajouté, une date neutralisée par « — ») : ' +
        '2 journées touchées, 1er févr. 2026 et 10 févr. 2026.',
    )
    expect(corps[0].portfolio).toEqual({ nom: 'Mon journal.md', texte: attendu.texte })

    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(lance.portfolio).toEqual({ nom: 'Mon journal.md', texte: attendu.texte })
  })

  it('UC-APP-10-U23 — un portfolio que Twin9 lit déjà en ses journées part à l’octet, et l’aperçu n’en dit rien', async () => {
    const region = await avantDeLancer(apercu())
    expect(portfolioPourTwin9(PORTFOLIO)).toEqual({ texte: PORTFOLIO, retouchees: [], sansDate: 0, disparues: [] })
    expect(region.textContent).not.toContain('retouché')
  })

  it('UC-APP-10-U23 — un passage sans date, en tête : le texte part à l’octet, l’aperçu dit que Twin9 ne le lit pas', async () => {
    const texte = `Mon introduction, avant toute journée.\n\n${PORTFOLIO}`
    expect(portfolioPourTwin9(texte)).toEqual({ texte, retouchees: [], sansDate: 1, disparues: [] })
    const corps = []
    const fetchFn = routedFetch({
      'GET api/twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
      'GET api/twin9/configuration': jsonResponse(200, { profils: [] }),
      'POST api/twin9/runs/apercu': (init) => {
        corps.push(JSON.parse(init.body))
        return jsonResponse(200, apercu())
      },
    })
    const store = createPortfolioStore(createMemoryAdapter())
    await store.create({ titre: 'Mon journal', texte })
    render(<Twin9View deps={{ fetchFn, store }} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const region = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(region.textContent).toContain('Le passage sans date, en tête du texte envoyé, n’est pas lu par Twin9.')
    expect(region.textContent).not.toContain('retouché')
    expect(corps[0].portfolio.texte).toBe(texte)
  })
})

describe('UC-APP-10 — ouvert dans la cartographie : deux cartes du même jour, un faisceau (sprint 4, C3 et C4)', () => {
  const carte = (jour, verdicts) => ({ journee: jour, date: '2026-01-05', verdicts })
  const etablie = (code, extrait) => ({ code, nom: code, statut: 'présence établie', confiance: 0.8, score_preuves: 1, score_indices: 0, etage: 'tribunal', traces_probantes: [{ piece: 1, extrait, date: '2026-01-05', role: 'preuve' }] })
  const run = () => ({
    kind: 'twin9-run',
    run: { id: 8, journal: 'mon-journal', finished_at: '2026-10-19 10:05:00' },
    referentiel: { poles: [{ num: 1, nom: 'TÊTE' }], competences: [{ code: '1.01', nom: 'Analyse', pole: 1 }, { code: '1.05', nom: 'Pensée systémique', pole: 1 }, { code: '1.07', nom: 'Synthèse', pole: 1 }] },
    carto_evolutive: {
      journal_id: 'mon-journal',
      competences: {
        '1.07': {
          code: '1.07',
          nom: 'Synthèse',
          statut_temporel: 'établie par faisceau (second ressort)',
          attestations: [{ jour_index: 0, journee: '2026-01-05', date: '2026-01-05', etage: 'faisceau', confiance: 0.55, score_preuves: 0, score_indices: 1 }],
          signaux: [],
          faisceau: { statut: 'présence établie', confiance: 0.55, motif: 'Les indices se répondent.', prescription: { pour_apprenant: 'Fais le lien.' }, traces: [{ piece: 3, extrait: 'Je résume la semaine en trois idées.', date: '2026-01-05', role: 'indice corroboratif' }] },
        },
      },
    },
    journees: {
      '2026-01-05': carte('2026-01-05', { '1.01': etablie('1.01', 'J’ai monté le capteur et vérifié chaque mesure.') }),
      '2026-01-05_b': carte('2026-01-05_b', { '1.05': etablie('1.05', 'Je relie la pompe, la sonde et le réservoir.') }),
    },
    memoire: [],
  })

  it('UC-APP-10-U24 — importTwin9Run, SecondReadings : deux cartes du même jour font une journée, leurs compétences réunies, et le compte rendu le dit ; une compétence établie par faisceau est une seconde lecture, avec la journée de ses traces, hors du soleil', () => {
    const r = importTwin9Run(run(), { now: '2026-10-23T10:00:00Z' })
    expect(r.variants.map((v) => [v.date, v.summary.verdicts.map((x) => x.code)])).toEqual([['2026-01-05', ['1.01', '1.05']]])
    expect(r.report.map((x) => x.code)).toContain('twin9-journee-dupliquee')
    expect(r.readings.map((x) => [x.id, Object.keys(x.codes)])).toEqual([['twin9:8:second-ressort', ['1.07']]])
    render(<SecondReadings dataset={{ days: [], readings: r.readings }} code="1.07" getDetail={() => undefined} getRunDetail={() => undefined} ensureRunDetail={() => {}} />)
    expect(screen.getByRole('region', { name: 'Seconde lecture' }).querySelector('summary').textContent).toBe(
      'Jury du second ressort de Twin9 : établie par faisceau (second ressort) · confiance 0,55 · 0 preuve, 1 indice · traces du 5 janv. 2026',
    )
  })
})
