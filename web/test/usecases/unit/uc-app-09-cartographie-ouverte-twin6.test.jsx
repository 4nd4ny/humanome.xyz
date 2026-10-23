// UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
//
// Code sollicité appelé directement : la route #/twin6-ouverte, le client
// web/src/api/twin6.js (paquet PUBLIC, provider « crédits » via
// /api/twin6/appel, provider « clé perso » direct, offre lue dans /twin9/meta),
// l'adaptation du référentiel, le référentiel que lit un run (U32) et le
// formatage des montants. Réseau simulé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  RELAIS_INTERROMPU_CREDITS,
  TWIN6_PACKAGE_URL,
  fetchTwin6Offer,
  loadTwin6Package,
  makeCreditsProvider,
  makeOwnKeyProvider,
  referentielPourMoteur,
  referentielTwin6,
} from '../../../src/api/twin6.js'
import { RELAIS_INTERROMPU } from '../../../src/api/client.js'
import { evenementRelais, relaisPilote, reponseRelais } from '../../../src/test/relais-response.js'
import { formatUsd } from '../../../src/api/twin9.js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Twin6OuverteView from '../../../src/views/Twin6OuverteView.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { TWIN6_PACKAGE, jsonResponse } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

describe('UC-APP-09 — route', () => {
  it('UC-APP-09-U13 — #/twin6-ouverte ouvre la vue de cartographie ouverte', () => {
    expect(parseHash('#/twin6-ouverte')).toEqual({ name: 'twin6ouverte', section: null })
  })
})

describe('UC-APP-09 — paquet de prompts PUBLIC', () => {
  it('UC-APP-09-U14 — chargé depuis l’URL publique par défaut ; modèle cible par défaut ; HTTP en échec ou paquet incomplet → message explicite', async () => {
    const { modeleCibleDefaut, ...sansDefaut } = TWIN6_PACKAGE
    expect(modeleCibleDefaut).toBe('claude-sonnet-5')
    const fetchFn = vi.fn(async () => jsonResponse(200, sansDefaut))
    const pkg = await loadTwin6Package({ fetchFn })
    expect(fetchFn).toHaveBeenCalledWith(TWIN6_PACKAGE_URL)
    // La 1.1.0, dont les gabarits lisent le référentiel choisi (2026-10-20).
    expect(TWIN6_PACKAGE_URL).toBe('data/twin6/twin6-ouverte-1.1.0.json')
    expect(pkg.modeleCibleDefaut).toBe('claude-sonnet-5')
    expect(pkg.licence).toBe('AGPL-3.0-only')
    expect(Object.keys(pkg.templates)).toEqual(['scanPole', 'kairos', 'fiches'])

    const absent = vi.fn(async () => jsonResponse(404, { error: 'absent' }))
    await expect(loadTwin6Package({ fetchFn: absent })).rejects.toThrow('Paquet Twin6 introuvable (404)')

    // Paquet servi mais incomplet (kairos manquant) : refusé explicitement (E6).
    const incomplet = vi.fn(async () => jsonResponse(200, { scanPole: 'x', fiches: {} }))
    await expect(loadTwin6Package({ fetchFn: incomplet })).rejects.toThrow(
      'Paquet Twin6 invalide (scanPole/kairos/fiches attendus)',
    )
  })
})

describe('UC-APP-09 — provider « crédits » (POST api/twin6/appel)', () => {
  it('UC-APP-09-U15 — envoie {model, prompt, system, max_tokens} avec le jeton CSRF de la session, rend le contrat moteur et remonte la contribution', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me'
        ? jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-uc-app-09' })
        : jsonResponse(200, {
            text: '{"poleNum":1}',
            usage: { inputTokens: 1000, outputTokens: 200 },
            model: 'claude-sonnet-5',
            stopReason: 'end_turn',
            cout_microusd: 6602,
          }),
    )
    await fetchMe({ fetchFn }) // sème le jeton CSRF, comme la vue au montage
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn })

    const res = await provider.complete({ model: 'claude-sonnet-5', prompt: 'Scanne le pôle 1', maxTokens: 8192 })

    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('api/twin6/appel')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-uc-app-09')
    expect(JSON.parse(init.body)).toEqual({ model: 'claude-sonnet-5', prompt: 'Scanne le pôle 1', system: null, max_tokens: 8192 })
    // L'arrêt relayé brut est normalisé (stopReason end, valeur brute gardée).
    expect(res).toEqual({
      text: '{"poleNum":1}',
      usage: { inputTokens: 1000, outputTokens: 200 },
      model: 'claude-sonnet-5',
      stopReason: 'end',
      stopReasonRaw: 'end_turn',
      truncated: false,
    })
    expect(couts).toEqual([6602])
    expect(provider).toMatchObject({ name: 'twin6-credits', transport: 'proxy' })
  })

  it('UC-APP-09-U16 — réponse partielle : valeurs par défaut sûres ; 402 serveur → ApiError typée, aucune contribution comptée', async () => {
    const partiel = vi.fn(async () => jsonResponse(200, {}))
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn: partiel })
    expect(await provider.complete({ model: 'm', prompt: 'p', maxTokens: 10 })).toEqual({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'm',
      stopReason: null,
      stopReasonRaw: null,
      truncated: false,
    })
    expect(couts).toEqual([0])

    const refus = vi.fn(async () =>
      jsonResponse(402, { error: 'Solde insuffisant', solde_microusd: 0, requis_estime_microusd: 155_000 }),
    )
    const couts2 = []
    const p2 = makeCreditsProvider({ onCout: (c) => couts2.push(c), fetchFn: refus })
    const err = await p2.complete({ model: 'm', prompt: 'p', maxTokens: 10 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(402)
    expect(err.message).toBe('Solde insuffisant')
    expect(couts2).toEqual([])
  })
})

describe('UC-APP-09 — provider « clé perso » (gratuit, direct navigateur)', () => {
  it('UC-APP-09-U17 — transport direct vers le fournisseur, jamais vers /api ; clé exigée', async () => {
    expect(() => makeOwnKeyProvider({ apiKey: '' })).toThrow(/apiKey requise/)

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }),
    }))
    const provider = makeOwnKeyProvider({ apiKey: 'sk-ant-perso-fictive', fetchFn })
    expect(provider).toMatchObject({ name: 'anthropic', transport: 'direct' })
    await provider.complete({ model: 'claude-sonnet-5', prompt: 'p' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(url.startsWith('api/')).toBe(false)
    expect(init.headers['x-api-key']).toBe('sk-ant-perso-fictive')
  })
})

describe('UC-APP-09 — offre et référentiel lus dans /api/twin9/meta', () => {
  it('UC-APP-09-U18 — prix Twin6 (+10 %), référentiel, solde, droit d’acheter et payeurs (ADR-013) ; replis sûrs si absents', async () => {
    const complet = vi.fn(async () =>
      jsonResponse(200, {
        modeles_twin6: { 'claude-sonnet-5': [2.2, 11] },
        referentiel: [{ num: 1, nom: 'TÊTE', competences: [] }],
        solde_microusd: '2500000',
        peut_acheter: true,
        payeurs: [{ type: 'personnel', solde_microusd: 2_500_000 }],
      }),
    )
    expect(await fetchTwin6Offer({ fetchFn: complet })).toEqual({
      modeles: { 'claude-sonnet-5': [2.2, 11] },
      referentiel: [{ num: 1, nom: 'TÊTE', competences: [] }],
      solde_microusd: 2_500_000,
      peut_acheter: true,
      // qui peut payer (ADR-013 §4, S6b), tel que le serveur le dit
      payeurs: [{ type: 'personnel', solde_microusd: 2_500_000 }],
    })
    expect(complet.mock.calls[0][0]).toBe('api/twin9/meta')

    const vide = vi.fn(async () => jsonResponse(200, { referentiel: {} }))
    expect(await fetchTwin6Offer({ fetchFn: vide })).toEqual({
      modeles: {},
      referentiel: [],
      solde_microusd: 0,
      peut_acheter: false, // seule une école achète (ADR-013) : faux sauf si le serveur le dit
      payeurs: [],
    })
  })

  it('UC-APP-09-U19 — referentielPourMoteur : pôles {num, nom} et compétences aplaties avec leur pôle', () => {
    expect(
      referentielPourMoteur([
        { num: 1, nom: 'TÊTE', competences: [{ code: '1.01', nom: 'A' }, { code: '1.02', nom: 'B' }] },
        { num: 2, nom: 'CŒUR' },
      ]),
    ).toEqual({
      poles: [{ num: 1, nom: 'TÊTE' }, { num: 2, nom: 'CŒUR' }],
      competences: [
        { code: '1.01', nom: 'A', pole: 1 },
        { code: '1.02', nom: 'B', pole: 1 },
      ],
    })
    expect(referentielPourMoteur(null)).toEqual({ poles: [], competences: [] })
  })

  it('UC-APP-09-U32 — referentielTwin6 : pour RESPIRE, la structure de /meta tant qu’elle est celle de la version choisie ; sinon le document publié', () => {
    const meta = [
      { num: 1, nom: 'TÊTE — Penser', competences: [{ code: '1.01', nom: 'A' }, { code: '1.02', nom: 'B' }] },
      { num: 2, nom: 'CŒUR — Relier', competences: [{ code: '2.01', nom: 'C' }] },
    ]
    const respire = {
      id: 'respire', version: '7.0.0',
      poles: [{ num: 2, nom: 'COEUR — Relier' }, { num: 1, nom: 'TETE — Penser' }],
      competences: [{ code: '1.02', nom: 'B', pole: 1 }, { code: '2.01', nom: 'C', pole: 2 }, { code: '1.01', nom: 'A', pole: 1 }],
    }
    // Même structure (ordre indifférent) : la structure de /meta, ses noms accentués, sans identifiant.
    expect(referentielTwin6(respire, meta)).toEqual(referentielPourMoteur(meta))
    // Une version de RESPIRE où une compétence change de pôle, ou à un pôle de moins : son document.
    const deplacee = { ...respire, competences: respire.competences.map((c) => (c.code === '1.02' ? { ...c, pole: 2 } : c)) }
    expect(referentielTwin6(deplacee, meta)).toBe(deplacee)
    const unPole = { ...respire, poles: [{ num: 1, nom: 'TETE — Penser' }], competences: respire.competences.filter((c) => c.pole === 1) }
    expect(referentielTwin6(unPole, meta)).toBe(unPole)
    // /meta vide (jamais importé) : le document de la version.
    expect(referentielTwin6(respire, [])).toBe(respire)
    // Un autre référentiel, même de structure semblable : toujours son document.
    const autre = { ...respire, id: 'fictif-semblable' }
    expect(referentielTwin6(autre, meta)).toBe(autre)
  })

  it('UC-APP-09-U20 — formatUsd : micro-USD → « x,yy $ », 4 décimales sous le centime', () => {
    expect(formatUsd(6602)).toBe('0,0066 $')
    expect(formatUsd(1_234_567)).toBe('1,23 $')
    expect(formatUsd(0)).toBe('0,00 $')
    expect(formatUsd(-7_000_000)).toBe('-7,00 $')
    expect(formatUsd('pas un nombre')).toBe('0,00 $')
  })
})

describe('UC-APP-09 — clé enregistrée et garde-fou de solde', () => {
  it('UC-APP-09-U28 — la clé de ce navigateur (ADR-013) : la vue pré-remplit la clé mémorisée dans humanome-keys et ne lit plus aucune clé gardée sur le serveur (elle n’importe plus le client /api/keys)', async () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(resolve(here, '../../../src/views/Twin6OuverteView.jsx'), 'utf8')
    expect(source).not.toMatch(/from '\.\.\/api\/keys\.js'/)
    const keyStorage = {
      getItem: (k) => (k === 'humanome-keys' ? JSON.stringify({ anthropic: 'sk-ant-locale-fictive' }) : null),
      setItem: vi.fn(),
    }
    render(
      <Twin6OuverteView
        deps={{
          fetchMeFn: async () => ({ user: { id: 1 } }),
          loadPackage: async () => ({ ...TWIN6_PACKAGE, templates: {} }),
          fetchOffer: async () => ({ modeles: { 'claude-sonnet-5': [2.2, 11] }, referentiel: [], solde_microusd: 0 }),
          keyStorage,
          lib: fakeLib,
        }}
      />,
    )
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    expect(screen.getByLabelText('Clé API Anthropic').value).toBe('sk-ant-locale-fictive')
    expect(screen.getByTestId('cle-reste-navigateur').textContent).toContain('Votre clé reste dans ce navigateur')
  })

  it('UC-APP-09-U29 — Twin6OuverteView isolée : poids du portfolio = ⌈octets / 1024⌉ $ (1 $ minimum), plus la réserve d’un appel — toute la sortie du modèle à son prix, 2026-10-21 —, comparés au solde, AVANT toute construction du provider', async () => {
    const creditsFactory = vi.fn(() => ({ name: 'twin6-credits' }))
    const runEngine = vi.fn(async () => {
      throw new Error('moteur non exercé dans ce test unitaire')
    })
    render(
      <Twin6OuverteView
        deps={{
          fetchMeFn: async () => ({ user: { id: 1 } }),
          loadPackage: async () => ({ ...TWIN6_PACKAGE, templates: {} }),
          // Réserve d'un appel : 128 000 tokens × 11 $ / Mtok (Sonnet 5 à 2 / 10, contribution comprise) = 1,408 $.
          fetchOffer: async () => ({ modeles: { 'claude-sonnet-5': [2.2, 11] }, referentiel: [], solde_microusd: 3_399_999 }),
          makeCreditsProvider: creditsFactory,
          runEngine,
          lib: fakeLib,
        }}
      />,
    )
    const zone = await screen.findByLabelText(/Votre portfolio/)
    await screen.findByText(/appels au modèle/) // le référentiel est chargé : le bouton peut s'activer
    const lancer = () =>
      act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
      })

    // 1 025 octets → 2 $ + 1,408 $ requis > 3,399999 $ de solde : bloqué.
    fireEvent.change(zone, { target: { value: 'é'.repeat(512) + 'x' } })
    await lancer()
    expect(screen.getByRole('alert').textContent).toContain('~3.41 $ : 2 $ estimés, et 1.41 $ réservés')
    expect(screen.getByRole('alert').textContent).toContain('solde 3.40 $')
    expect(creditsFactory).not.toHaveBeenCalled()
    expect(runEngine).not.toHaveBeenCalled()

    // 1 024 octets → 1 $ + 1,408 $ requis ≤ solde : lancé.
    fireEvent.change(zone, { target: { value: 'é'.repeat(512) } })
    await lancer()
    expect(creditsFactory).toHaveBeenCalledTimes(1)
    expect(runEngine).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe('moteur non exercé dans ce test unitaire')
  })

  it('UC-APP-09-U34 — Twin6OuverteView isolée, essai gratuit (A6) : un visiteur n’a que cette voie, ni offre ni clés lues ; 5 000 caractères au plus, une feuille datée au moins ; la première preuve résolue avant le moteur, qui reçoit le fournisseur de la démo et le modèle indicatif « demo »', async () => {
    const ordre = []
    const demo = { provider: { name: 'anthropic', transport: 'proxy' }, prime: vi.fn(async () => ordre.push('preuve')) }
    const makeDemoProvider = vi.fn(() => demo)
    const fetchOffer = vi.fn()
    const runEngine = vi.fn(async () => {
      ordre.push('moteur')
      throw new Error('moteur non exercé dans ce test unitaire')
    })
    render(
      <Twin6OuverteView
        deps={{
          fetchMeFn: async () => ({ user: null }),
          loadPackage: async () => ({ ...TWIN6_PACKAGE, templates: {} }),
          fetchOffer,
          makeDemoProvider,
          runEngine,
          lib: fakeLib,
        }}
      />,
    )
    const zone = await screen.findByLabelText(/Votre portfolio/)
    await screen.findByText(/appels au modèle/)
    // La voie du visiteur est cochée par un effet, après le rendu qui la montre :
    // sous charge, le test la lisait avant (['demo', false]).
    await waitFor(() => expect(screen.getAllByRole('radio').map((r) => [r.value, r.checked])).toEqual([['demo', true]]))
    expect(fetchOffer).not.toHaveBeenCalled()
    const bouton = screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })

    // 5 001 caractères : bloqué, aucun fournisseur construit.
    const feuille = '### 2026-01-05\n'
    fireEvent.change(zone, { target: { value: feuille + 'x'.repeat(5001 - feuille.length) } })
    expect(bouton.disabled).toBe(true)
    // 5 000 sans feuille datée : bloqué, et la page dit pourquoi.
    fireEvent.change(zone, { target: { value: 'x'.repeat(5000) } })
    expect(bouton.disabled).toBe(true)
    expect(screen.getByText(/demande au moins une feuille datée/).textContent).toContain('### AAAA-MM-JJ')
    // 5 000 avec une feuille datée : lancé.
    fireEvent.change(zone, { target: { value: feuille + 'x'.repeat(5000 - feuille.length) } })
    expect(screen.queryByText(/demande au moins une feuille datée/)).toBeNull()
    await act(async () => {
      fireEvent.click(bouton)
    })
    expect(makeDemoProvider).toHaveBeenCalledTimes(1)
    expect(ordre).toEqual(['preuve', 'moteur'])
    expect(runEngine.mock.calls[0][0]).toMatchObject({ provider: demo.provider, model: 'demo' })
  })
})

describe('UC-APP-09 — la réponse en flux (relais, 2026-10-21)', () => {
  const RESULTAT = {
    text: 'Pôle 1 : trois sources recoupées.',
    usage: { inputTokens: 700, outputTokens: 90 },
    model: 'claude-sonnet-5',
    stopReason: 'end_turn',
    cout_microusd: 2629,
  }
  const COUPE = {
    status: 504,
    error: 'La réponse a dépassé le délai de 150 s : coupée, elle est facturée pour ce qu’elle a produit.',
    code: 'coupe',
    cout_microusd: 8448,
  }

  it('UC-APP-09-U38 — provider « crédits » : demande le relais ; la progression remonte en caractères, le résultat relayé rend le contrat moteur et sa contribution ; coupé, l’appel remonte ce qu’il a coûté puis échoue avec le message du serveur ; la connexion perdue dit que l’appel a pu être facturé ; l’annulation reste une annulation', async () => {
    const couts = []
    const progression = []
    const relais = vi.fn(async () =>
      reponseRelais(evenementRelais('progression', { caracteres: 10 }) + evenementRelais('resultat', RESULTAT)),
    )
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), onProgression: (n) => progression.push(n), fetchFn: relais })
    expect(await provider.complete({ model: 'claude-sonnet-5', prompt: 'p', maxTokens: 8192 })).toEqual({
      text: RESULTAT.text,
      usage: RESULTAT.usage,
      model: 'claude-sonnet-5',
      stopReason: 'end',
      stopReasonRaw: 'end_turn',
      truncated: false,
    })
    expect(relais.mock.calls[0][1].headers.Accept).toBe('text/event-stream, application/json')
    expect(progression).toEqual([10])
    expect(couts).toEqual([2629])

    // Coupé en route : son coût d'abord, puis l'erreur, typée, au message du serveur.
    const coupe = makeCreditsProvider({
      onCout: (c) => couts.push(c),
      fetchFn: async () => reponseRelais(evenementRelais('progression', { caracteres: 40 }) + evenementRelais('erreur', COUPE)),
    })
    const erreur = await coupe.complete({ model: 'claude-sonnet-5', prompt: 'p', maxTokens: 8192 }).catch((e) => e)
    expect(erreur).toBeInstanceOf(ApiError)
    expect([erreur.status, erreur.code, erreur.message]).toEqual([504, 'coupe', COUPE.error])
    expect(couts).toEqual([2629, 8448])

    // Le flux s'arrête sans issue (l'hébergement a pu arrêter le script) : rien de compté ici, le solde fait foi.
    const perdu = makeCreditsProvider({
      onCout: (c) => couts.push(c),
      fetchFn: async () => reponseRelais(evenementRelais('progression', { caracteres: 40 })),
    })
    const interrompu = await perdu.complete({ model: 'claude-sonnet-5', prompt: 'p', maxTokens: 8192 }).catch((e) => e)
    expect(interrompu).toBeInstanceOf(ApiError)
    expect([interrompu.status, interrompu.code]).toEqual([502, 'interrompu'])
    expect(interrompu.message).toBe(RELAIS_INTERROMPU + RELAIS_INTERROMPU_CREDITS)
    expect(couts).toEqual([2629, 8448])

    // L'annulation passe au fetch, et revient en AbortError — pas en « serveur indisponible ».
    const controleur = new AbortController()
    const pilote = relaisPilote()
    const annule = makeCreditsProvider({
      fetchFn: async (url, init) => {
        // Le navigateur fait échouer la lecture du corps d'une requête annulée.
        init.signal.addEventListener('abort', () => pilote.echouer(new DOMException('annulée', 'AbortError')))
        return pilote.response
      },
    })
    const enCours = annule.complete({ model: 'claude-sonnet-5', prompt: 'p', maxTokens: 8192, signal: controleur.signal }).catch((e) => e)
    pilote.pousser(evenementRelais('progression', { caracteres: 5 }))
    controleur.abort()
    expect((await enCours).name).toBe('AbortError')
    const refuse = makeCreditsProvider({
      fetchFn: async () => {
        throw new DOMException('annulée', 'AbortError')
      },
    })
    expect((await refuse.complete({ model: 'm', prompt: 'p', maxTokens: 10 }).catch((e) => e)).name).toBe('AbortError')
  })

  it('UC-APP-09-U39 — Twin6OuverteView, voie crédits : les caractères reçus de l’appel en cours, remis à zéro à chaque étape ; un appel coupé laisse son message et ce que le run a débité', async () => {
    let opts = null
    const creditsFactory = vi.fn((o) => {
      opts = o
      return { name: 'twin6-credits' }
    })
    let relacher
    const runEngine = vi.fn(async ({ options }) => {
      options.onProgress({ phase: 'scan-pole', pole: 1, done: 0, total: 8 })
      opts.onCout(1500)
      opts.onProgression(1234)
      await new Promise((resolve) => {
        relacher = resolve
      })
      opts.onCout(8448)
      throw new ApiError(COUPE.error, 504, 'coupe')
    })
    render(
      <Twin6OuverteView
        deps={{
          fetchMeFn: async () => ({ user: { id: 1 } }),
          loadPackage: async () => ({ ...TWIN6_PACKAGE, templates: {} }),
          fetchOffer: async () => ({ modeles: { 'claude-sonnet-5': [2.2, 11] }, referentiel: [], solde_microusd: 50_000_000 }),
          makeCreditsProvider: creditsFactory,
          runEngine,
          lib: fakeLib,
        }}
      />,
    )
    const zone = await screen.findByLabelText(/Votre portfolio/)
    await screen.findByText(/appels au modèle/)
    fireEvent.change(zone, { target: { value: '### 2026-01-05\n---\nUne journée de travail, réfléchie et datée.' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    })
    expect(creditsFactory.mock.calls[0][0]).toHaveProperty('onProgression')
    expect((await screen.findByTestId('twin6-caracteres')).textContent).toBe(' — 1 234 caractères reçus')
    expect(screen.getByRole('status').textContent).toContain(`${formatUsd(1500)} débités jusqu’ici`)
    // Une nouvelle étape : ses caractères repartent de zéro.
    act(() => runEngine.mock.calls[0][0].options.onProgress({ phase: 'scan-pole', pole: 2, done: 1, total: 8 }))
    expect(screen.queryByTestId('twin6-caracteres')).toBeNull()

    await act(async () => relacher())
    expect(screen.getByRole('alert').textContent).toBe(`${COUPE.error} (${formatUsd(1500 + 8448)} débités pour ce run.)`)
  })
})
