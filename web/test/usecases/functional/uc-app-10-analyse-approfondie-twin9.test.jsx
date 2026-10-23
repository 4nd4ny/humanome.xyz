// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Les scénarios sont joués sur l'application ENTIÈRE (<App/>, #/twin9 et
// #/twin9/<id>) avec le vrai client API (session vérifiée au démarrage →
// jeton CSRF → POST/PUT) ; seul le réseau est simulé (fetch global), avec un
// IndexedDB factice pour la bibliothèque de portfolios et le magasin de
// l'interface de cartographie. Le run tourne sur le serveur (ADR-011) : le
// front le lance, le suit — la page le fait avancer tant qu'elle est ouverte,
// à son rythme réel (une pause de 300 ms entre deux tours qui ont avancé) — et
// l'ouvre dans l'interface de cartographie (#/cartographie), où il devient un
// jeu. Les résultats simulés ont la forme de ceux du moteur factice du
// serveur ; aucun gabarit n'apparaît jamais côté front.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { createCartoStore as createInterfaceStore } from '../../../src/carto/core/store.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import respire from '../../../public/data/referentiel/respire-v7.json'
import { FakeIDBKeyRange, createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { bodyOf, jsonResponse, meResponse, stubFetch } from '../support/twin.js'
// un run configuré, tel que ses résultats le rendent à son propriétaire (P0-1) : valeurs inventées
import exemple from '../../../../schemas/fixtures/twin9-configuration-exemple.json'

const idb = createFakeIndexedDb()
const CSRF = 'csrf-twin-lot'
const PORTFOLIO = '## 2026-01-05\nPremier jour : j’ai monté le capteur.\n## 2026-01-06\nDeuxième jour : j’ai lu les mesures.\n'
const DATES = ['2026-01-05', '2026-01-06']
const ATTENTE = { timeout: 4000 }

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
    admission: { journees: 2, total: 2, limite: 'credit', instruites: 2, en_attente: 0, changees_en_attente: 0 },
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

const enCours = (journees, repondus) =>
  run({
    retard: null,
    avance_at: '2026-10-20 10:00:05',
    progression: { appels: { envoye: 1, attente: 0, repondu: repondus, panne: 0 }, journees, fusion: false, lots: 0, runs_avant: 0 },
    cout: { depense_microusd: 2_000, budget_usd: null, duree_minutes: null },
  })

const fini = () =>
  run({
    statut: 'termine',
    retard: null,
    avance_at: '2026-10-20 10:00:09',
    finished_at: '2026-10-20 10:00:09',
    progression: { appels: { envoye: 0, attente: 0, repondu: 5, panne: 0 }, journees: 2, fusion: true, lots: 0, runs_avant: 0 },
    cout: { depense_microusd: 4_200, budget_usd: null, duree_minutes: null },
    compteurs: { appels: 5, pannes: 0, journees: 2, cout_microusd: 4_200 },
  })

/** L'aperçu d'un premier run de deux journées, d'après le run de référence. */
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

/** Le référentiel du run, tel que ses résultats le portent : pôles et compétences, sans description (T17). */
const REFERENTIEL_DU_RUN = {
  id: 'respire',
  version: '7.0.0',
  label: 'RESPIRE v7',
  poles: respire.poles.map(({ num, nom, couleur }) => ({ num, nom, couleur })),
  competences: respire.competences.map(({ code, nom, pole }) => ({ code, nom, pole })),
}

/**
 * Les résultats d'un run qui a jugé, chaque jour, la première compétence de
 * chaque pôle, comme le moteur factice du serveur (GET …/resultats).
 */
function resultats() {
  const jugees = REFERENTIEL_DU_RUN.poles.map((p) => REFERENTIEL_DU_RUN.competences.find((c) => c.pole === p.num))
  const verdict = (c, date) => ({
    code: c.code,
    nom: c.nom,
    statut: 'présence établie',
    score_preuves: 1,
    score_indices: 0,
    confiance: 0.8,
    traces_probantes: [{ piece: 1, extrait: `Le ${date}, j’ai mesuré le CO2.`, date, type: 'journal', role: 'preuve' }],
  })
  const sorties = {}
  for (const date of DATES) {
    sorties[`journees/${date}/carto_jour.json`] = JSON.stringify({
      journee: date,
      date,
      verdicts: Object.fromEntries(jugees.map((c) => [c.code, verdict(c, date)])),
    })
  }
  const attestations = DATES.map((date, i) => ({ jour_index: i, journee: date, date, confiance: 0.8, score_preuves: 1, score_indices: 0 }))
  sorties['carto_evolutive.json'] = JSON.stringify({
    journal_id: 'mon-journal',
    competences: Object.fromEntries(jugees.map((c) => [c.code, { code: c.code, nom: c.nom, pole: c.pole, attestations, signaux: [] }])),
    histoires: {},
    rapports_poles: {},
    kairos_evolutif: 'Synthèse fictive.',
  })
  const r = fini()
  return {
    run: { id: 7, journal: r.journal, statut: r.statut, retard: null, mode: r.mode, attestation: r.attestation, created_at: r.created_at, finished_at: r.finished_at },
    lecteur: 'proprietaire',
    sorties,
    memoire: [],
    referentiel: REFERENTIEL_DU_RUN,
  }
}

/** Anthropic, par lots : ce que la configuration dit du profil v9.8 (ADR-012). */
const ANTHROPIC = { id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' }

/** Les routes d'un compte apprenant qui a une bibliothèque, un profil et du crédit. */
function routes(overrides = {}) {
  return {
    'GET auth/me': meResponse(['apprenant']),
    'GET twin9/runs': jsonResponse(200, { disponible: true, runs: [] }),
    'GET twin9/configuration': jsonResponse(200, {
      profils: [{ id: 3, nom: 'Direct', updated_at: '2026-10-20 09:00:00', fournisseurs: [{ ...ANTHROPIC, voie: 'directe' }] }],
      defaut_fournisseurs: [ANTHROPIC],
      referentiels: [{ id: 'respire', versions: ['7.0.0'], brouillons: [] }],
      gabarits: ['v9.8'],
      cle_perso_ouverte: false,
      cle_perso_enregistree: false,
    }),
    'POST twin9/runs/apercu': jsonResponse(200, apercu()),
    ...overrides,
  }
}

/** L'application entière à `hash`, IndexedDB factice ; `portfolio` : une entrée de la bibliothèque. */
async function openApp(hash, { portfolio = null } = {}) {
  vi.stubGlobal('indexedDB', idb.factory)
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
  if (portfolio) await createPortfolioStore().create({ titre: 'Mon journal', texte: portfolio })
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

const ecritures = (calls, key) => calls.filter((c) => c.key === key)

/**
 * Le mode expert (UC-VIS-06), choisi dans ce navigateur : un apprenant seul est en mode simple par défaut, où la page
 * lance avec le profil v9.8, sans liste des profils (A10).
 */
const modeExpert = () => localStorage.setItem('humanome-mode', 'expert')

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  idb.reset()
  window.location.hash = ''
  localStorage.removeItem('humanome-mode')
  resetApiClient()
})

describe('UC-APP-10 — l’apprenant lance une analyse approfondie, la suit et l’ouvre dans la cartographie', () => {
  it('UC-APP-10-F16 — nominal (IHM) : profil, portfolio de la bibliothèque, accord, aperçu, lancement (CSRF) ; la page du run le fait avancer jusqu’au bout, puis l’ouvre dans la cartographie, dans un jeu « Twin9 · <journal> · <référentiel> »', async () => {
    const etats = [run(), enCours(1, 2), fini()]
    let tour = 0
    const { calls } = stubFetch(
      routes({
        'POST twin9/runs': jsonResponse(201, run()),
        'GET twin9/runs/7': () => jsonResponse(200, etats[Math.min(tour++, etats.length - 1)]),
        'POST twin9/runs/avancer': jsonResponse(200, { avance: true, locked: false }),
        'GET twin9/runs/7/resultats': jsonResponse(200, resultats()),
      }),
    )
    modeExpert() // il choisit un de ses profils (A10)
    await openApp('#/twin9', { portfolio: PORTFOLIO })

    // Étapes 1-3 : le formulaire, le portfolio de la bibliothèque présélectionné, le lancement désactivé sans accord.
    const lancer = await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect(screen.getByRole('heading', { level: 3, name: 'Lancer une analyse' })).toBeDefined()
    expect(lancer.disabled).toBe(true)
    expect(screen.getByLabelText('Portfolio').selectedOptions[0].textContent).toBe('Mon journal')
    expect([...screen.getByLabelText('Profil').options].map((o) => o.textContent)).toEqual(['Profil v9.8', 'Direct'])
    expect(screen.getByRole('link', { name: 'Régler mes profils' }).getAttribute('href')).toBe('#/configuration')
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    expect(ecritures(calls, 'POST twin9/runs/apercu')).toHaveLength(0) // pas d'aperçu avant l'accord
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))

    // Étape 4 : l'aperçu, rien n'est gardé côté serveur ; il dit les journées, le coût et la durée.
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(avant.textContent).toContain('2 journées à instruire.')
    expect(avant.textContent).toContain('Coût estimé : 3,39 $ · durée estimée : 22 min (d’après le vrai run de PLANT-01, en essai, × 7 pôles).')
    const [demande] = ecritures(calls, 'POST twin9/runs/apercu')
    expect(bodyOf(demande)).toEqual({ profil: 3, portfolio: { nom: 'Mon journal.md', texte: PORTFOLIO } })
    expect(demande.init.headers['X-CSRF-Token']).toBe(CSRF)

    // Étape 5 : le lancement, avec l'accord et le jeton CSRF ; la page du run s'ouvre.
    expect(lancer.disabled).toBe(false)
    fireEvent.click(lancer)
    await waitFor(() => expect(window.location.hash).toBe('#/twin9/7'))
    const [lance] = ecritures(calls, 'POST twin9/runs')
    expect(bodyOf(lance)).toEqual({
      profil: 3,
      portfolio: { nom: 'Mon journal.md', texte: PORTFOLIO },
      accord: { fournisseurs: ['anthropic'] },
      visibilite: 'privee',
    })
    expect(lance.init.headers['X-CSRF-Token']).toBe(CSRF)

    // Étape 6 : la page le fait avancer tant qu'il est en cours (CSRF), puis le dit fini.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'), ATTENTE)
    const avances = ecritures(calls, 'POST twin9/runs/avancer')
    expect(avances).toHaveLength(2)
    expect(avances.every((c) => c.init.headers['X-CSRF-Token'] === CSRF)).toBe(true)
    expect(screen.getByRole('heading', { level: 3, name: 'mon-journal' })).toBeDefined()
    expect(screen.getByText('2 journées finies · fusion faite')).toBeDefined()
    expect(screen.getByText('Appels : 5 répondus')).toBeDefined()
    expect(screen.getByText('Coût : 0,0042 $')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Mes analyses' }).getAttribute('href')).toBe('#/twin9')

    // Étape 8 : l'attestation du run.
    const attestation = screen.getByText('Attestation').closest('details')
    const lignes = Object.fromEntries([...attestation.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]))
    expect(lignes).toEqual({
      Profil: 'Direct',
      Référentiel: 'respire 7.0.0',
      'Jeu de gabarits': 'v9.8 · abcdef0123456789',
      Moteur: 'version inconnue',
      Admission: '2 journées à instruire',
      Accord: '2026-10-20 10:00:00',
    })

    // Étape 7 : les résultats, ouverts dans l'interface de cartographie, dans un jeu qui nomme le journal et le référentiel.
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    expect(calls.filter((c) => c.key === 'GET twin9/runs/7/resultats')).toHaveLength(1)
    await waitFor(() => expect(document.querySelector('.carto-context-dataset')?.textContent).toBe('Twin9 · mon-journal · RESPIRE v7'), ATTENTE)
    const [jeu] = await createInterfaceStore().listDatasets()
    expect([jeu.title, jeu.dayCount]).toEqual(['Twin9 · mon-journal · RESPIRE v7', 2])
  })

  it('UC-APP-10-F17 — E1 : un visiteur est invité à se connecter, au lancement comme sur la page d’un run ; E2 : sur une instance sans moteur, la page le dit, sans formulaire, et liste encore ses analyses', async () => {
    const refus = jsonResponse(401, { error: 'Authentification requise' })
    let { calls } = stubFetch({ 'GET auth/me': refus, 'GET twin9/runs': refus, 'GET twin9/configuration': refus, 'GET twin9/runs/7': refus })
    await openApp('#/twin9')
    const invite = await screen.findByRole('link', { name: 'Connectez-vous' })
    expect(invite.getAttribute('href')).toBe('#/compte')
    expect(invite.closest('p').textContent).toBe('Connectez-vous pour lancer une analyse approfondie.')
    expect(screen.queryByRole('button', { name: 'Lancer l’analyse' })).toBeNull()

    window.location.hash = '#/twin9/7'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(calls.some((c) => c.key === 'GET twin9/runs/7')).toBe(true))
    expect((await screen.findByRole('link', { name: 'Connectez-vous' })).getAttribute('href')).toBe('#/compte')
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(calls.filter((c) => c.init?.method && c.init.method !== 'GET')).toEqual([])
    cleanup()
    vi.unstubAllGlobals()

    ;({ calls } = stubFetch(
      routes({
        'GET twin9/runs': jsonResponse(200, {
          disponible: false,
          runs: [{ id: 5, journal: 'ancien-journal', statut: 'termine', attente: null, visibilite: 'privee', profil: 'Profil v9.8', mode: 'complet', created_at: '2026-10-01 09:00:00', finished_at: '2026-10-01 09:10:00' }],
        }),
      }),
    ))
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    expect((await screen.findByText('L’analyse approfondie n’est pas disponible sur cette instance.')).getAttribute('role')).toBe('status')
    expect(screen.queryByRole('heading', { name: 'Lancer une analyse' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /J’accepte que mon portfolio/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lancer l’analyse' })).toBeNull()
    const liste = screen.getByRole('heading', { name: 'Mes analyses' }).closest('section')
    expect(within(liste).getByRole('link', { name: 'ancien-journal' }).getAttribute('href')).toBe('#/twin9/5')
    expect(within(liste).getByRole('listitem').textContent).toBe('ancien-journal · 2026-10-01 · Profil v9.8 · Terminé')
    expect(calls.some((c) => c.key === 'POST twin9/runs/apercu')).toBe(false)
  })

  it('UC-APP-10-F18 — A2 : l’aperçu dit les journées que le crédit admet avec leur fusion, les autres attendant ; E5 : le refus dit ce qu’il faudrait, « Recharger » mène au crédit, et aucun lancement n’est possible', async () => {
    const refus =
      'Votre crédit ne couvre pas une carte, même d’une journée : il faudrait 2,26 $ (une journée et sa fusion, d’après le run de référence, réserves des appels comprises)'
    const { calls } = stubFetch(
      routes({
        // le profil v9.8 : le crédit couvre une journée sur deux ; le profil « Direct » : rien
        'POST twin9/runs/apercu': (url, init) =>
          jsonResponse(
            200,
            bodyOf({ init }).profil === 3
              ? apercu({ admission: { journees: 0, total: 2, limite: 'credit', instruites: 0, en_attente: 2, changees_en_attente: 0, autres_usd: 0, refus } })
              : apercu({ admission: { journees: 1, total: 2, limite: 'credit', instruites: 1, en_attente: 1, changees_en_attente: 0, autres_usd: 0, refus: null } }),
          ),
        'POST twin9/runs': jsonResponse(422, { error: refus }),
      }),
    )
    modeExpert() // il passe ensuite au profil « Direct » (A10)
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))

    // A2 : une journée admise avec sa fusion, l'autre pour une prochaine analyse ; le lancement est possible.
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    await waitFor(() =>
      expect(avant.textContent).toContain(
        'Votre crédit couvre 1 des 2 journées à instruire, avec leur fusion, d’après le run de référence, réserves des appels comprises. ' +
          'L’autre attendra une prochaine analyse.',
      ),
    )
    expect(avant.textContent).toContain('Coût estimé (1 journée) : 3,39 $')
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' }).disabled).toBe(false)

    // E5 : avec le profil « Direct », le crédit ne couvre rien ; la page dit ce qu'il faudrait. Ses appels Anthropic
    // partent en direct, ceux du profil v9.8 par lots : l'accord, qui nomme les voies, est à redonner (ADR-012).
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '3' } })
    expect(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toBe(`${refus}. Recharger`)
    expect(within(alerte).getByRole('link', { name: 'Recharger' }).getAttribute('href')).toBe('#/compte/credit')
    expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).not.toContain('Coût estimé')
    const lancer = screen.getByRole('button', { name: 'Lancer l’analyse' })
    expect(lancer.disabled).toBe(true)
    fireEvent.click(lancer)
    expect(calls.some((c) => c.key === 'POST twin9/runs')).toBe(false)
    expect(window.location.hash).toBe('#/twin9')
    expect(calls.filter((c) => c.key === 'POST twin9/runs/apercu').map((c) => bodyOf(c).profil)).toEqual([null, 3])
  })

  it('UC-APP-10-F22 — A9 : un profil multi-fournisseur ; l’accord nomme ses fournisseurs, leur voie et leur étiquette RGPD, avant tout aperçu, et le lancement envoie leur liste ; un fournisseur que l’instance n’a pas ouvert fait refuser le lancement, message affiché', async () => {
    const refus = 'Profil refusé — greffier : le fournisseur Mistral AI n’est pas disponible sur cette instance'
    const mistral = { id: 'mistral', libelle: 'Mistral AI', rgpd: 'oui', voie: 'directe' }
    const { calls } = stubFetch(
      routes({
        'GET twin9/configuration': jsonResponse(200, {
          profils: [{ id: 5, nom: 'Mixte', updated_at: '2026-10-22 09:00:00', fournisseurs: [ANTHROPIC, mistral] }],
          defaut_fournisseurs: [ANTHROPIC],
          referentiels: [{ id: 'respire', versions: ['7.0.0'], brouillons: [] }],
          gabarits: ['v9.8'],
          cle_perso_ouverte: false,
          cle_perso_enregistree: false,
        }),
        'POST twin9/runs': jsonResponse(422, { error: refus }),
      }),
    )
    modeExpert() // il choisit son profil multi-fournisseur (A10)
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    await screen.findByRole('button', { name: 'Lancer l’analyse' })
    fireEvent.change(screen.getByLabelText('Profil'), { target: { value: '5' } })
    const accord = screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ })
    expect(accord.closest('label').textContent).toContain(
      'Le texte part chez les fournisseurs des modèles de ce profil : Anthropic (par lots ; RGPD : sous conditions) et ' +
        'Mistral AI (en direct ; RGPD : oui). Par lots, Anthropic garde le lot jusqu’à sa suppression, 29 jours au plus.',
    )
    expect(ecritures(calls, 'POST twin9/runs/apercu')).toHaveLength(0)
    fireEvent.click(accord)
    await screen.findByRole('region', { name: 'Avant de lancer' })

    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    expect((await screen.findByRole('alert')).textContent).toBe(refus)
    const [lance] = ecritures(calls, 'POST twin9/runs')
    expect(bodyOf(lance).accord).toEqual({ fournisseurs: ['anthropic', 'mistral'] })
    expect(lance.init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(window.location.hash).toBe('#/twin9')
  })

  it('UC-APP-10-F24 — A10 : en mode simple, le défaut d’un apprenant, la page lance avec le profil v9.8, sans liste des profils ni « Régler mes profils » ; l’aide le dit ; en mode expert, la liste revient', async () => {
    const { calls } = stubFetch(routes({ 'POST twin9/runs': jsonResponse(201, run()) }))
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    const lancer = await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect(screen.queryByLabelText('Profil')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Régler mes profils' })).toBeNull()
    expect(screen.getByTestId('twin9-profil-simple').textContent).toContain('Profil v9.8')
    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(screen.getByRole('dialog').textContent).toContain('activez le « Mode expert » au bas du menu')
    fireEvent.keyDown(document, { key: 'Escape' })

    // l'accord nomme les fournisseurs du profil v9.8 ; l'aperçu et le lancement le désignent (profil nul)
    const accord = screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ })
    expect(accord.closest('label').textContent).toContain('Anthropic (par lots ; RGPD : sous conditions)')
    fireEvent.click(accord)
    await screen.findByRole('region', { name: 'Avant de lancer' })
    fireEvent.click(lancer)
    await waitFor(() => expect(window.location.hash).toBe('#/twin9/7'))
    expect(ecritures(calls, 'POST twin9/runs/apercu').map((c) => bodyOf(c).profil)).toEqual([null])
    expect(bodyOf(ecritures(calls, 'POST twin9/runs')[0])).toMatchObject({ profil: null, accord: { fournisseurs: ['anthropic'] } })
    cleanup()
    vi.unstubAllGlobals()
    idb.reset()

    // le mode expert, choisi dans ce navigateur : la liste et le lien reviennent ; le mode n'est jamais un droit
    stubFetch(routes())
    modeExpert()
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect([...screen.getByLabelText('Profil').options].map((o) => o.textContent)).toEqual(['Profil v9.8', 'Direct'])
    expect(screen.getByRole('link', { name: 'Régler mes profils' }).getAttribute('href')).toBe('#/configuration')
    expect(screen.queryByTestId('twin9-profil-simple')).toBeNull()
  })

  it('UC-APP-10-F28 — A11 : le référentiel se choisit au lancement — en mode simple, le menu paraît dès deux référentiels publiés, par défaut celui du profil ; l’aperçu dit le référentiel lu et les spécialistes du jury retirés ; l’aperçu et le lancement portent le choix (CSRF)', async () => {
    const referentiels = [
      { id: 'respire', label: 'RESPIRE v7', versions: ['7.0.0'], brouillons: [] },
      { id: 'humanome-fictif', label: 'Humanome fictif', versions: ['18.0.0', '17.0.0'], brouillons: [] },
    ]
    const { calls } = stubFetch(
      routes({
        'GET twin9/configuration': jsonResponse(200, {
          profils: [],
          defaut: { referentiel: { id: 'respire', version: null } },
          defaut_fournisseurs: [ANTHROPIC],
          referentiels,
          gabarits: ['v9.8'],
          cle_perso_ouverte: false,
          cle_perso_enregistree: false,
        }),
        'POST twin9/runs/apercu': (url, init) =>
          jsonResponse(
            200,
            bodyOf({ init }).referentiel
              ? apercu({ referentiel: { id: 'humanome-fictif', version: '18.0.0', label: 'Humanome fictif' }, jury_retire: [] })
              : apercu({ referentiel: { id: 'respire', version: '7.0.0', label: 'RESPIRE v7' }, jury_retire: [] }),
          ),
        'POST twin9/runs': jsonResponse(201, run()),
      }),
    )
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    await screen.findByRole('button', { name: 'Lancer l’analyse' })
    expect(screen.queryByLabelText('Profil')).toBeNull() // mode simple (A10)
    const menu = screen.getByLabelText('Référentiel')
    expect([...menu.options].map((o) => o.textContent)).toEqual(['Celui du profil (RESPIRE v7)', 'Humanome fictif'])
    expect(menu.value).toBe('')

    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).toContain('Référentiel lu : RESPIRE v7, version 7.0.0.'))
    fireEvent.change(menu, { target: { value: 'humanome-fictif' } })
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Avant de lancer' }).textContent).toContain('Référentiel lu : Humanome fictif, version 18.0.0.'),
    )
    const apercus = ecritures(calls, 'POST twin9/runs/apercu')
    expect(apercus.map((c) => bodyOf(c).referentiel ?? null)).toEqual([null, { id: 'humanome-fictif', version: null }])
    expect(apercus.every((c) => c.init.headers['X-CSRF-Token'] === CSRF)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    await waitFor(() => expect(window.location.hash).toBe('#/twin9/7'))
    const [lance] = ecritures(calls, 'POST twin9/runs')
    expect(bodyOf(lance)).toEqual({
      profil: null,
      portfolio: { nom: 'Mon journal.md', texte: PORTFOLIO },
      accord: { fournisseurs: ['anthropic'] },
      visibilite: 'privee',
      referentiel: { id: 'humanome-fictif', version: null },
    })
    expect(lance.init.headers['X-CSRF-Token']).toBe(CSRF)
  })

  it('UC-APP-10-F19 — A3 : annuler puis reprendre un run en cours ; A4 : arrêté par son budget, il reprend sous un nouveau budget et va au bout ; A5 : la case du cartographe règle qui lit ses résultats (jeton CSRF à chaque écriture)', async () => {
    // A3 — un run en cours que la page fait avancer ; le serveur ne lui donne pas de tour (verrou pris).
    let statut = 'en_cours'
    let repris = false
    let { calls } = stubFetch(
      routes({
        'GET twin9/runs/7': () => jsonResponse(200, repris ? fini() : run({ statut, retard: statut === 'en_cours' ? 'En attente de son premier tour' : null })),
        'POST twin9/runs/avancer': jsonResponse(200, { avance: false, locked: true }),
        'POST twin9/runs/7/annuler': () => {
          statut = 'annule'
          return jsonResponse(200, run({ statut, retard: null, finished_at: '2026-10-20 10:01:00' }))
        },
        'POST twin9/runs/7/reprendre': () => {
          statut = 'en_cours'
          repris = true
          return jsonResponse(200, run({ statut, retard: null }))
        },
      }),
    )
    await openApp('#/twin9/7')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('En cours — En attente de son premier tour'))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Annulé'))
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(screen.queryByLabelText(/Nouveau budget/)).toBeNull() // annulé, pas arrêté par son budget
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'), ATTENTE)
    const [annule] = ecritures(calls, 'POST twin9/runs/7/annuler')
    const [reprise] = ecritures(calls, 'POST twin9/runs/7/reprendre')
    expect([annule.init.headers['X-CSRF-Token'], reprise.init.headers['X-CSRF-Token'], bodyOf(reprise)]).toEqual([CSRF, CSRF, undefined])
    cleanup()
    vi.unstubAllGlobals()

    // A4 — arrêté par son budget : un nouveau budget, et il va au bout.
    const arrete = run({
      id: 8,
      statut: 'echoue',
      attente: 'budget atteint : carte incomplète',
      retard: 'Budget atteint : carte incomplète',
      progression: { appels: { envoye: 0, attente: 1, repondu: 5, panne: 0 }, journees: 1, fusion: false, lots: 0, runs_avant: 0 },
      cout: { depense_microusd: 980_000, budget_usd: 1, duree_minutes: null },
    })
    let budget = null
    ;({ calls } = stubFetch(
      routes({
        'GET twin9/runs/8': () => jsonResponse(200, budget === null ? arrete : { ...fini(), id: 8, cout: { depense_microusd: 1_400_000, budget_usd: budget, duree_minutes: null } }),
        'POST twin9/runs/avancer': jsonResponse(200, { avance: true, locked: false }),
        'POST twin9/runs/8/reprendre': (url, init) => {
          budget = bodyOf({ init }).budget_usd
          return jsonResponse(200, { ...arrete, statut: 'en_cours', attente: null, retard: null, cout: { ...arrete.cout, budget_usd: budget } })
        },
      }),
    ))
    await openApp('#/twin9/8')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Arrêté — Budget atteint : carte incomplète'))
    expect(screen.getByText('Coût : 0,98 $ · budget : 1,00 $')).toBeDefined()
    // Sa carte incomplète s'ouvrirait déjà : une journée est finie.
    expect(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' })).toBeDefined()
    fireEvent.change(screen.getByLabelText(/Nouveau budget \(USD\)/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'), ATTENTE)
    expect(screen.getByText('Coût : 1,40 $ · budget : 5,00 $')).toBeDefined()
    const [repriseBudget] = ecritures(calls, 'POST twin9/runs/8/reprendre')
    expect([bodyOf(repriseBudget), repriseBudget.init.headers['X-CSRF-Token']]).toEqual([{ budget_usd: 5 }, CSRF])
    cleanup()
    vi.unstubAllGlobals()

    // A5 — la case du cartographe, sur la page du run fini : visible, puis de nouveau privé.
    let visibilite = 'privee'
    ;({ calls } = stubFetch(
      routes({
        'GET twin9/runs/7': () => jsonResponse(200, { ...fini(), visibilite }),
        'PUT twin9/runs/7/visibilite': (url, init) => {
          visibilite = bodyOf({ init }).visibilite
          return jsonResponse(200, { ...fini(), visibilite })
        },
      }),
    ))
    await openApp('#/twin9/7')
    const caseCartographe = await screen.findByRole('checkbox', { name: /Mon cartographe peut lire les résultats/ })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    expect(caseCartographe.checked).toBe(false)
    fireEvent.click(caseCartographe)
    await waitFor(() => expect(caseCartographe.checked).toBe(true))
    fireEvent.click(caseCartographe)
    await waitFor(() => expect(caseCartographe.checked).toBe(false))
    const puts = ecritures(calls, 'PUT twin9/runs/7/visibilite')
    expect(puts.map((c) => [bodyOf(c), c.init.headers['X-CSRF-Token']])).toEqual([
      [{ visibilite: 'cartographe' }, CSRF],
      [{ visibilite: 'privee' }, CSRF],
    ])
    // Le run fini ne s'avance plus.
    expect(ecritures(calls, 'POST twin9/runs/avancer')).toEqual([])
  })

  it('UC-APP-10-F21 — P0-1 : la page du run fini ouvre sa configuration (rôles, fournisseurs et étiquette RGPD, voies, modèles, budgets de sortie ; appels, pannes, sorties tronquées, coût), lue dans ses résultats ; ouvert dans la cartographie, le jeu ne garde de sa configuration que la liste blanche', async () => {
    const r = resultats()
    r.run = { ...r.run, configuration: exemple.run.configuration, execution: exemple.run.execution }
    const { calls } = stubFetch(
      routes({
        // ses compteurs par étape nomment celle de la sortie tronquée
        'GET twin9/runs/7': jsonResponse(200, {
          ...fini(),
          compteurs: { ...fini().compteurs, par_etape: { greffier: { appels: 2, pannes: 1, tronques: 1, cout_microusd: 900 } } },
          configuration_empreinte: exemple.run.configuration.empreinte,
        }),
        'GET twin9/runs/7/resultats': jsonResponse(200, r),
      }),
    )
    await openApp('#/twin9/7')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    // à côté de l'attestation, qui ne change pas
    const attestation = screen.getByText('Attestation').closest('details')
    expect([...attestation.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Profil', 'Référentiel', 'Jeu de gabarits', 'Moteur', 'Admission', 'Accord'])
    const configuration = screen.getByText('Configuration').closest('details')
    expect(calls.filter((c) => c.key === 'GET twin9/runs/7/resultats')).toHaveLength(0)
    fireEvent.click(configuration.querySelector('summary'))
    await within(configuration).findByText('Réglages des appels')
    expect(configuration.querySelector('tr[data-role="etages/profond"]').textContent).toBe('Analyse profondeAnthropic RGPD : sous conditionspar lotsclaude-exemple-profond4000')
    const ligne = (terme) => [...configuration.querySelectorAll('dt')].find((dt) => dt.textContent === terme).nextElementSibling.textContent
    expect(ligne('Clé')).toBe('celle de l’instance')
    expect(ligne('Appels')).toBe('9 : 8 répondus, 1 en panne dont 1 sortie tronquée')
    expect(ligne('Coût')).toBe('0,0042 $')
    // le conseil nomme l'étape, et dit le coût du remède : toute la carte instruite de nouveau
    const conseil = configuration.querySelector('.twin9-conseil').textContent
    expect(conseil).toContain('Une sortie tronquée a été comptée en panne (étape « Greffier »).')
    expect(conseil).toContain('augmentez le budget de sortie de l’étape « Greffier »')
    expect(conseil).toContain('toutes les journées de la carte sont instruites de nouveau, et payées, pas seulement celles d’une panne')

    // ouvert dans la cartographie : chaque journée dit ses modèles et son jeu ; ni prix, ni coût, ni plafond, ni clé dans le jeu
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    await waitFor(() => expect(document.querySelector('.carto-context-dataset')?.textContent).toBe('Twin9 · mon-journal · RESPIRE v7'), ATTENTE)
    const store = createInterfaceStore()
    const [jeu] = await store.listDatasets()
    const tout = await store.exportAll(jeu.datasetId)
    expect(tout.runDetails['twin9:7|configuration'].configuration.gabarits).toEqual({ jeu: 'jeu-exemple' })
    const provenance = tout.dataset.days[0].variants[0].provenance
    expect([provenance.model, provenance.prompt, provenance.configurationRef]).toEqual([
      'profond: claude-exemple-profond, rapide: claude-exemple-rapide, lecteurs: claude-exemple-rapide',
      'gabarits jeu-exemple',
      'twin9:7|configuration',
    ])
    expect(JSON.stringify(tout)).not.toMatch(/"prix"|"grille"|"cle"|"plafonds"|"budget_usd"|"cout_microusd"|"reprises"|reserve_microusd/)
  })

  it('UC-APP-10-F23 — S3-3 : un run dont la stigmergie du greffier est activée, ouvert dans la cartographie : chaque journée garde les traces de son analyse, et la modale du jour les montre selon leur nature ; une journée en panne, non conservées ; en mode simple, sans intensité', async () => {
    const r = resultats()
    const bloc = (date, run) => ({
      analyse: 2,
      run,
      explorateurs: [],
      lues: {},
      depots: [],
      rejets: [],
      traces: [{ id: `t-${date}`, code: '1.01', start: 0, end: 30, extrait: `Le ${date}, j’ai mesuré le CO2.`, tau: 1.7, incertitude: 'faible', statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 2 }],
    })
    for (const date of DATES) {
      const chemin = `journees/${date}/carto_jour.json`
      r.sorties[chemin] = JSON.stringify({ ...JSON.parse(r.sorties[chemin]), stigmergie: bloc(date, '2026-10-20T10:00:00.a1b2c3') })
    }
    // le 6, un appel en panne : son analyse n'est pas entrée dans la mémoire de la carte
    r.traces_conservees = { '2026-01-05': true, '2026-01-06': false }
    stubFetch(routes({ 'GET twin9/runs/7': jsonResponse(200, fini()), 'GET twin9/runs/7/resultats': jsonResponse(200, r) }))
    await openApp('#/twin9/7')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Terminé'))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir dans la cartographie' }))
    await waitFor(() => expect(document.querySelector('.carto-context-dataset')?.textContent).toBe('Twin9 · mon-journal · RESPIRE v7'), ATTENTE)

    const store = createInterfaceStore()
    const [jeu] = await store.listDatasets()
    const tout = await store.exportAll(jeu.datasetId)
    expect(tout.dataset.days.map((d) => [d.date, d.variants[0].stigmergie])).toEqual([
      ['2026-01-05', { analyse: 2, traces: 1, conservee: true }],
      ['2026-01-06', { analyse: 2, traces: 1, conservee: false }],
    ])

    // la modale du 5 : la trace, sa nature ; l'apprenant (mode simple par défaut) n'en lit pas l'intensité
    window.location.hash = '#/cartographie/jour/2026-01-05'
    const dialog = await screen.findByRole('dialog', { name: /5 janvier 2026/ }, ATTENTE)
    const section = await within(dialog).findByRole('region', { name: 'Traces de la stigmergie (1)' })
    await waitFor(() => expect(section.querySelector('.carto-sg-list li')).not.toBeNull())
    const nom = REFERENTIEL_DU_RUN.competences.find((c) => c.code === '1.01').nom
    expect(section.querySelector('.carto-sg-what').textContent).toBe(`1.01 ${nom} · incertitude faible`)
    expect(section.textContent).toContain('Conservées dans la mémoire de la carte')
    expect(section.textContent).not.toMatch(/intensité|score/i)

    // celle du 6, en panne : ses traces ne sont pas dites conservées
    window.location.hash = '#/cartographie/jour/2026-01-06'
    const sixieme = await screen.findByRole('dialog', { name: /6 janvier 2026/ }, ATTENTE)
    const traces6 = await within(sixieme).findByRole('region', { name: 'Traces de la stigmergie (1)' })
    expect(traces6.querySelector('.carto-sg-warning').textContent).toContain('Non conservées')
    expect(traces6.textContent).not.toContain('Conservées dans la mémoire de la carte')
  })
})

describe('UC-APP-10 — qui paie l’analyse (sprint 6, lot S6b — ADR-013 §4)', () => {
  const TILLEULS = {
    type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false, cle: false, mois: '2026-10',
    plafond_microusd: 50_000_000, engage_microusd: 0, reste_credit_microusd: 50_000_000, reste_cle_microusd: 50_000_000,
  }
  const PLATANES = { ...TILLEULS, id: 4, nom: 'École des Platanes' }

  it('UC-APP-10-F33 — A12, A13 (IHM) : élève de deux écoles et d’un solde : « Qui paie » à choisir ; l’aperçu et le lancement portent son choix (CSRF) ; l’aperçu dit que son école paie et en voit le montant, et, sur sa clé, qu’elle peut relire les résultats de ses lots', async () => {
    const { calls } = stubFetch(
      routes({
        'GET twin9/meta': jsonResponse(200, { payeurs: [TILLEULS, PLATANES, { type: 'personnel', solde_microusd: 2_000_000 }] }),
        'POST twin9/runs/apercu': (url, init) => {
          const corps = JSON.parse(init.body)
          return corps.payeur === undefined
            ? jsonResponse(422, { error: 'Choisissez qui paie cette analyse : vous êtes membre de plusieurs écoles' })
            : jsonResponse(200, apercu({ cle: 'ecole', credit_usd: null, payeur: { type: 'ecole', id: 4, nom: 'École des Platanes', soi: false } }))
        },
        'POST twin9/runs': jsonResponse(201, run({ payeur: { type: 'ecole', id: 4, nom: 'École des Platanes' } })),
        'GET twin9/runs/7': jsonResponse(200, fini()),
      }),
    )
    await openApp('#/twin9', { portfolio: PORTFOLIO })

    const menu = await screen.findByLabelText('Qui paie')
    expect([...menu.options].map((o) => o.textContent)).toEqual([
      'Choisir…',
      'Mon école, École des Tilleuls (il me reste 50,00 $ ce mois-ci)',
      'Mon école, École des Platanes (il me reste 50,00 $ ce mois-ci)',
      'Mon solde restant (2,00 $)',
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Choisissez qui paie cette analyse : vous êtes membre de plusieurs écoles')

    fireEvent.change(menu, { target: { value: '4' } })
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    expect(within(avant).getByTestId('apercu-payeur').textContent).toBe(
      'Payé par votre école, École des Platanes. Elle voit le montant de ce qu’elle paie pour vous, jamais le contenu de vos analyses sur humanome ; avec sa propre clé Anthropic, elle peut relire dans sa Console Anthropic les résultats des appels partis par lots.',
    )
    // sur la clé de son école, l'aperçu dit que l'école peut relire les résultats de ses lots (ADR-013 §6) — et l'accord
    // du lancement le nomme (§7)
    expect(within(avant).getByTestId('apercu-cle-ecole').textContent).toContain('relire dans sa Console Anthropic')
    expect(screen.getByTestId('accord-console-ecole').textContent).toContain(
      'votre école peut relire dans sa Console Anthropic les résultats des appels partis par lots')
    expect(screen.getByRole('checkbox', { name: /J’accepte que mon portfolio/ }).closest('label').textContent)
      .toContain('Console Anthropic')
    const demandes = ecritures(calls, 'POST twin9/runs/apercu')
    expect(bodyOf(demandes[demandes.length - 1]).payeur).toBe(4)
    expect(demandes[demandes.length - 1].init.headers['X-CSRF-Token']).toBe(CSRF)

    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    await waitFor(() => expect(window.location.hash).toBe('#/twin9/7'))
    expect(bodyOf(ecritures(calls, 'POST twin9/runs')[0])).toEqual({
      profil: null,
      portfolio: { nom: 'Mon journal.md', texte: PORTFOLIO },
      accord: { fournisseurs: ['anthropic'] },
      visibilite: 'privee',
      payeur: 4,
    })
  })

  it('UC-APP-10-F38 — E15 (IHM) : son école n’a pas réglé son plafond ; un solde à lui : l’aperçu dit le refus du serveur, et propose « Mon solde restant » dans « Qui paie »', async () => {
    const sansPlafond = { ...TILLEULS, plafond_microusd: 0, reste_credit_microusd: 0, reste_cle_microusd: 0 }
    const refus = 'Votre école n’a pas encore réglé le plafond qu’elle vous accorde chaque mois (0 $ par défaut) : demandez-le-lui avant de lancer une analyse qu’elle paie'
    stubFetch(
      routes({
        'GET twin9/meta': jsonResponse(200, { payeurs: [sansPlafond, { type: 'personnel', solde_microusd: 2_000_000 }] }),
        'POST twin9/runs/apercu': jsonResponse(200, apercu({
          credit_usd: null, payeur: { type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false },
          payeurs: [sansPlafond, { type: 'personnel', solde_microusd: 2_000_000 }],
          admission: { journees: 0, total: 2, limite: 'plafond', instruites: 0, en_attente: 2, changees_en_attente: 0,
                       autres_usd: 0, refus },
        })),
      }),
    )
    await openApp('#/twin9', { portfolio: PORTFOLIO })
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’accepte que mon portfolio/ }))
    const avant = await screen.findByRole('region', { name: 'Avant de lancer' })
    const alerte = await within(avant).findByRole('alert')
    expect(alerte.textContent).toContain(refus)
    expect(alerte.textContent).toContain('Vous pouvez aussi choisir « Mon solde restant » dans « Qui paie ».')
    expect(within(alerte).queryByRole('link', { name: 'Recharger' })).toBeNull()
  })

  it('UC-APP-10-F34 — E16 (IHM) : arrêté parce que son école ne le paie plus, la page le dit ; sa reprise choisit qui paie (son solde) et le porte (CSRF)', async () => {
    const arrete = run({
      statut: 'echoue', attente: 'votre école ne paie plus cette analyse', retard: 'Votre école ne paie plus cette analyse',
      finished_at: '2026-10-20 10:00:09', payeur: { type: 'ecole', id: 3, nom: 'École des Tilleuls' },
    })
    let repris = false
    const { calls } = stubFetch(
      routes({
        'GET twin9/meta': jsonResponse(200, { payeurs: [{ type: 'personnel', solde_microusd: 2_000_000 }] }),
        'GET twin9/runs/7': () => jsonResponse(200, repris ? fini() : arrete),
        'POST twin9/runs/7/reprendre': () => {
          repris = true
          return jsonResponse(200, run({ payeur: { type: 'personnel' } }))
        },
        'POST twin9/runs/avancer': jsonResponse(200, { avance: true, locked: false }),
      }),
    )
    await openApp('#/twin9/7')

    expect((await screen.findByRole('status')).textContent).toBe('Arrêté — Votre école ne paie plus cette analyse')
    expect(screen.getByTestId('run-payeur').textContent).toContain('Payé par votre école, École des Tilleuls')
    await waitFor(() => expect(ecritures(calls, 'GET twin9/meta')).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(ecritures(calls, 'POST twin9/runs/7/reprendre')).toHaveLength(1))
    const [reprise] = ecritures(calls, 'POST twin9/runs/7/reprendre')
    expect(bodyOf(reprise)).toEqual({ payeur: 'personnel' })
    expect(reprise.init.headers['X-CSRF-Token']).toBe(CSRF)
  })
})

