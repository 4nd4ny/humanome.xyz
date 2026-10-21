// UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'apprenant ouvre
// #/twin6-ouverte, colle son portfolio, choisit la voie de paiement et lance.
// Le VRAI moteur (executerTwin6 + twin6ToMergeDocument) tourne dans jsdom ;
// seul le réseau est simulé (fetch global) : paquet public fictif, /api/twin9/meta,
// export statique des référentiels publiés (data/referentiel/, fictifs),
// /api/twin6/appel (voie crédits) ou api.anthropic.com (voie clé perso). L'essai
// gratuit (A6) passe par un faux serveur de la démo aux règles du serveur PHP
// (défi à usage unique, preuve vérifiée par sha256 via node:crypto, champ piège).
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { TWIN6_PACKAGE_URL } from '../../../src/api/twin6.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { downloadJson } from '../../../src/lib/download-json.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import {
  REFERENTIEL_LETTRE_FICTIF,
  REFERENTIEL_RESPIRE_FICTIF,
  TWIN6_PACKAGE,
  bodyOf,
  htmlResponse,
  jsonResponse,
  meResponse,
  metaTwin9,
  referentielsPublies,
  stubFetch,
  routeKey,
  twin6ModelText,
} from '../support/twin.js'
import { fakeDemoServer } from '../support/vis.js'

// Export « un clic » observé sans Blob ni <a download> (jsdom).
vi.mock('../../../src/lib/download-json.js', () => ({ downloadJson: vi.fn(() => true) }))

const PORTFOLIO =
  '### 2026-02-10\n---\nAujourd’hui j’ai recoupé trois sources avant de conclure, puis expliqué ma démarche au groupe.'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/** Réponse de POST api/twin6/appel (contrat provider moteur + contribution). */
function appelOk(url, init, extra = {}, referentiel = null) {
  const { prompt } = bodyOf({ init })
  return jsonResponse(200, {
    text: twin6ModelText(prompt, referentiel),
    usage: { inputTokens: 1000, outputTokens: 200 },
    model: 'claude-sonnet-5',
    stopReason: 'end_turn',
    cout_microusd: 6602,
    ...extra,
  })
}

/** Réponse Anthropic Messages API (voie clé perso, appel direct navigateur). */
function anthropicOk(url, init) {
  const { messages } = JSON.parse(init.body)
  return jsonResponse(200, {
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text: twin6ModelText(messages[0].content) }],
    usage: { input_tokens: 900, output_tokens: 150 },
    stop_reason: 'end_turn',
  })
}

function routes(overrides = {}) {
  return {
    'GET auth/me': meResponse(['apprenant']),
    [`GET ${TWIN6_PACKAGE_URL}`]: jsonResponse(200, TWIN6_PACKAGE),
    'GET twin9/meta': jsonResponse(200, metaTwin9()),
    // RESPIRE seul publié, à la structure de /meta.
    ...referentielsPublies([REFERENTIEL_RESPIRE_FICTIF]),
    'GET keys': jsonResponse(200, []),
    'POST twin6/appel': appelOk,
    ...overrides,
  }
}

function openTwin6(fetchMeUser = { id: 7, roles: ['apprenant'] }) {
  window.location.hash = '#/twin6-ouverte'
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: fetchMeUser })} />)
}

async function saisirPortfolio(texte = PORTFOLIO) {
  fireEvent.change(await screen.findByLabelText(/Votre portfolio/), { target: { value: texte } })
  // Le référentiel choisi est chargé : le décompte des appels s'affiche, le bouton peut s'activer.
  await screen.findByText(/appels au modèle/)
}

async function lancer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
  })
}

const appelsTwin6 = (calls) => calls.filter((c) => c.key === 'POST twin6/appel')

/**
 * Essai gratuit (A6) : le faux serveur de la démo répond aux défis et à
 * POST api/llm (réponse du modèle de la démo) ; toute autre requête suit les
 * routes du lot, consignées dans `calls`.
 */
function serveurDeLaDemo(routesDuLot, answer) {
  const calls = []
  const server = fakeDemoServer({
    createHash,
    maxInputChars: 2000000, // le plafond par défaut d'api/config/demo.php (2026-10-21, sortie sans plafond)
    answer:
      answer ??
      ((body) =>
        jsonResponse(200, {
          text: twin6ModelText(body.prompt),
          usage: { inputTokens: 1200, outputTokens: 300 },
          model: 'claude-haiku-5-5',
          stopReason: 'end_turn',
        })),
    extra: (url, init = {}) => {
      if (url === 'api/llm' || url === 'api/llm/challenge') return undefined
      const key = routeKey(url, init)
      calls.push({ url, key, init })
      const path = url.replace(/^api\//, '').split('?')[0]
      const hit = routesDuLot[key] ?? routesDuLot[url] ?? routesDuLot[path]
      if (hit === undefined) return jsonResponse(404, { error: 'absent' })
      return typeof hit === 'function' ? hit(url, init) : hit
    },
  })
  return { ...server, calls }
}

const VISITEUR = { 'GET auth/me': jsonResponse(401, { error: 'Authentification requise' }) }

beforeEach(() => {
  resetApiClient()
  clearReferentielCache()
  downloadJson.mockClear()
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-09 — l’apprenant lance une cartographie ouverte', () => {
  it('UC-APP-09-F01 — nominal (voie crédits) : 8 appels via /api/twin6/appel, progression et contribution affichées, sunburst rendu, export JSON', async () => {
    // Le 2e appel est retenu le temps d'observer la progression (étape 5).
    let liberer
    const retenu = new Promise((r) => {
      liberer = r
    })
    let n = 0
    const { calls } = stubFetch(
      routes({
        'POST twin6/appel': async (url, init) => {
          n += 1
          if (n === 2) await retenu
          return appelOk(url, init)
        },
      }),
    )
    openTwin6()

    // Étapes 1-3 : formulaire prêt, RESPIRE choisi par défaut (8 appels), voie « crédits » par défaut,
    // prompts téléchargeables.
    await saisirPortfolio()
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('respire@7.0.0')
    expect(screen.getByText(/8 appels au modèle \(7 pôles \+ synthèse\)/)).toBeDefined()
    expect(screen.getByRole('radio', { name: /Avec nos crédits/ }).checked).toBe(true)
    expect(screen.getByRole('link', { name: 'Télécharger les prompts' }).getAttribute('href')).toBe(TWIN6_PACKAGE_URL)
    expect(screen.getByLabelText('Modèle').value).toBe('claude-sonnet-5')

    await lancer()

    // Étape 5 : « étape n/8 » et contribution cumulée pendant le run.
    const progression = await screen.findByText(/Analyse en cours — étape 1\/8 \(scan-pole\)/)
    expect(progression.textContent).toContain('0,0066 $ débités jusqu’ici')
    expect(screen.getByRole('button', { name: 'Analyse en cours…' }).disabled).toBe(true)
    await act(async () => {
      liberer()
    })

    // Étape 8 : résultat + contribution cumulée (8 × 6 602 µUSD ≈ 0,05 $).
    const succes = await screen.findByText(/Cartographie ouverte terminée/)
    expect(succes.textContent).toContain('0,05 $ de contribution')
    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
    // Sunburst rendu (secteurs de la lib injectée).
    expect(document.querySelectorAll('.sector').length).toBeGreaterThan(0)

    // Export JSON : le document cartographie-merge, en .json, sans aucun envoi réseau.
    const avantExport = calls.length
    fireEvent.click(screen.getByTestId('twin6-export'))
    expect(downloadJson).toHaveBeenCalledTimes(1)
    const [docExporte, nomFichier] = downloadJson.mock.calls[0]
    expect(docExporte.kind).toBe('cartographie-merge')
    expect(nomFichier).toMatch(/^cartographie-twin6-.+\.json$/)
    expect(calls.length).toBe(avantExport)

    // Anomalie 3 corrigée (2026-10-20) : le dénominateur « Compétences établies »
    // est celui du référentiel du run — 7 compétences ici —, jamais 61 supposé
    // (bandeau StatBadges et résumé de profil).
    expect(screen.getAllByText(/^\d+ \/ 7$/).length).toBe(2)
    expect(screen.queryByText(/\/ 61$/)).toBeNull()
    // Le document est de RESPIRE : il ne nomme pas de référentiel, ses pôles portent les noms de /meta.
    expect(docExporte).not.toHaveProperty('referentiel')
    expect(docExporte.domains[0].id).toBe('TÊTE — Penser & Comprendre')

    // Étapes 5-6 : 7 scan-pole (pôles 1→7, la fiche du paquet telle quelle) puis le kairos,
    // chacun avec le CSRF de la session.
    const appels = appelsTwin6(calls)
    expect(appels).toHaveLength(8)
    appels.slice(0, 7).forEach((c, i) => {
      expect(bodyOf(c).prompt).toContain(`# Fiche des compétences du pôle ${i + 1} (P${i + 1}.md)\n\n${TWIN6_PACKAGE.fiches[i + 1]}`)
      expect(bodyOf(c).prompt).toContain(PORTFOLIO)
    })
    expect(bodyOf(appels[7]).prompt).toContain('## carto_P7')
    for (const c of appels) {
      expect(c.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
      // Toute la sortie du modèle (2026-10-21, 8 192 avant) : 128 000 pour Sonnet 5.
      expect(bodyOf(c)).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 128000 })
    }
    // RGPD : le portfolio ne part QUE vers le proxy de l'appel, jamais ailleurs.
    const autres = calls.filter((c) => c.key !== 'POST twin6/appel')
    expect(autres.some((c) => String(c.init?.body ?? '').includes('recoupé trois sources'))).toBe(false)
    expect(calls.some((c) => c.url === ANTHROPIC_URL)).toBe(false)
  })

  it('UC-APP-09-F02 — A1 : clé perso saisie → appels DIRECTS au fournisseur, aucun passage par /api/twin6/appel, gratuit, même à solde nul (RG5)', async () => {
    // Solde prépayé NUL : le garde-fou de solde ne s'applique pas à la voie clé perso.
    const { calls } = stubFetch(
      routes({
        'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 0 })),
        [`POST ${ANTHROPIC_URL}`]: anthropicOk,
      }),
    )
    openTwin6()
    await saisirPortfolio()

    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Clé API Anthropic'), { target: { value: 'sk-ant-perso-fictive' } })
    await lancer()

    expect((await screen.findByText(/Cartographie ouverte terminée/)).textContent).toContain('(avec votre clé)')
    const directs = calls.filter((c) => c.url === ANTHROPIC_URL)
    expect(directs).toHaveLength(8)
    expect(directs.every((c) => c.init.headers['x-api-key'] === 'sk-ant-perso-fictive')).toBe(true)
    expect(appelsTwin6(calls)).toHaveLength(0)
    // La clé ne transite jamais vers notre API.
    expect(calls.filter((c) => c.url.startsWith('api/')).some((c) => String(c.init?.body ?? '').includes('sk-ant'))).toBe(false)
  })

  it('UC-APP-09-F03 — A2 : clé enregistrée au profil → révélée à la demande puis utilisée sans ressaisie', async () => {
    const { calls } = stubFetch(
      routes({
        'GET keys': jsonResponse(200, [{ provider: 'anthropic', createdAt: '2026-07-15' }]),
        'GET keys/anthropic': jsonResponse(200, { provider: 'anthropic', apiKey: 'sk-ant-profil-fictive' }),
        [`POST ${ANTHROPIC_URL}`]: anthropicOk,
        // Toute fuite vers la voie crédits ferait échouer le run.
        'POST twin6/appel': jsonResponse(500, { error: 'voie crédits interdite dans ce scénario' }),
      }),
    )
    openTwin6()
    await saisirPortfolio()
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    expect(screen.getByRole('radio', { name: /Utiliser ma clé Anthropic enregistrée/ }).checked).toBe(true)
    expect(screen.queryByLabelText('Clé API Anthropic')).toBeNull()

    await lancer()
    const succes = await screen.findByText(/Cartographie ouverte terminée/)
    expect(succes.textContent).toContain('(avec votre clé)')
    expect(calls.filter((c) => c.key === 'GET keys/anthropic')).toHaveLength(1)
    const directs = calls.filter((c) => c.url === ANTHROPIC_URL)
    expect(directs).toHaveLength(8)
    expect(directs.every((c) => c.init.headers['x-api-key'] === 'sk-ant-profil-fictive')).toBe(true)
    expect(appelsTwin6(calls)).toHaveLength(0)
  })

  it('UC-APP-09-F21 — A4 : un autre référentiel publié choisi → un scan par pôle (5) puis le kairos, fiches écrites depuis son document, document qui le nomme, total de ses compétences', async () => {
    const { calls } = stubFetch(
      routes({
        ...referentielsPublies([REFERENTIEL_RESPIRE_FICTIF, REFERENTIEL_LETTRE_FICTIF]),
        'POST twin6/appel': (url, init) => appelOk(url, init, {}, REFERENTIEL_LETTRE_FICTIF),
      }),
    )
    openTwin6()
    await saisirPortfolio()
    const choix = screen.getByRole('combobox', { name: 'Référentiel' })
    expect([...choix.options].map((o) => o.textContent)).toEqual(['RESPIRE v7', 'Fictif lettré'])
    fireEvent.change(choix, { target: { value: 'fictif-lettre@1.0.0' } })
    expect(await screen.findByText(/6 appels au modèle \(5 pôles \+ synthèse\)/)).toBeDefined()

    await lancer()
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    const appels = appelsTwin6(calls)
    expect(appels).toHaveLength(6)
    // La fiche du paquet (RESPIRE) ne nomme pas ses capacités : celle de chaque pôle s'écrit depuis son document.
    expect(bodyOf(appels[0]).prompt).toContain(
      '# Fiche des compétences du pôle 1 (P1.md)\n\n# Pôle 1 — A · Pôle fictif A\n\n## A1 — Capacité fictive A1\n\nDéfinition fictive de A1.',
    )
    expect(bodyOf(appels[5]).prompt).toContain('## carto_P5')
    // Le total des compétences établies est celui de ce référentiel (10), et l'export le nomme.
    expect(screen.getAllByText(/^\d+ \/ 10$/).length).toBe(2)
    fireEvent.click(screen.getByTestId('twin6-export'))
    const [docExporte] = downloadJson.mock.calls[0]
    expect(docExporte.referentiel).toBe('fictif-lettre')
    expect(docExporte.domains.map((d) => d.id)).toEqual(REFERENTIEL_LETTRE_FICTIF.poles.map((p) => p.nom))
  })

  it('UC-APP-09-F22 — A5 : une version de RESPIRE d’une autre structure que /meta (six pôles) → six scans, document de RESPIRE aux pôles de cette version', async () => {
    const six = {
      ...REFERENTIEL_RESPIRE_FICTIF,
      version: '8.0.0',
      label: 'RESPIRE v8',
      poles: REFERENTIEL_RESPIRE_FICTIF.poles.filter((p) => p.num !== 7),
      competences: REFERENTIEL_RESPIRE_FICTIF.competences.filter((c) => c.pole !== 7),
    }
    const { calls } = stubFetch(routes({ ...referentielsPublies([six, REFERENTIEL_RESPIRE_FICTIF]) }))
    openTwin6()
    await saisirPortfolio()
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('respire@8.0.0')
    expect(screen.getByText(/7 appels au modèle \(6 pôles \+ synthèse\)/)).toBeDefined()

    await lancer()
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    expect(appelsTwin6(calls)).toHaveLength(7)
    fireEvent.click(screen.getByTestId('twin6-export'))
    const [docExporte] = downloadJson.mock.calls[0]
    expect(docExporte).not.toHaveProperty('referentiel')
    // Les noms de pôle sont ceux du document de la version (sans accent), non plus ceux de /meta.
    expect(docExporte.domains.map((d) => d.id)).toEqual(six.poles.map((p) => p.nom))
    expect(screen.getAllByText(/^\d+ \/ 6$/).length).toBe(2)
  })

  it('UC-APP-09-F04 — E1 : visiteur sans session → l’essai gratuit seul (A6), une invitation à se connecter pour les autres voies ; ni offre ni clés lues', async () => {
    const { calls } = stubFetch(routes(VISITEUR))
    openTwin6(null)

    await saisirPortfolio()
    expect(screen.getAllByRole('radio').map((r) => [r.value, r.checked])).toEqual([['demo', true]])
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    expect(screen.getByRole('link', { name: 'Connectez-vous' }).getAttribute('href')).toBe('#/compte')
    expect(screen.getByText(/8 appels au modèle \(7 pôles \+ synthèse\)/).textContent).toContain('rien n’est débité ni conservé')
    expect(calls.some((c) => c.url === TWIN6_PACKAGE_URL)).toBe(true)
    expect(calls.some((c) => c.key === 'GET twin9/meta' || c.key === 'GET keys')).toBe(false)
  })

  it('UC-APP-09-F23 — A6 : un visiteur essaie gratuitement → 8 POST api/llm, chacun avec un défi neuf résolu, aucun /api/twin6/appel ; « (essai gratuit) », sunburst', async () => {
    const { calls, posts, rejected, issuedCount } = serveurDeLaDemo(routes(VISITEUR))
    openTwin6(null)
    await saisirPortfolio()
    await lancer()

    expect((await screen.findByText(/Cartographie ouverte terminée/)).textContent).toBe(
      'Cartographie ouverte terminée (essai gratuit).',
    )
    expect(document.querySelectorAll('.sector').length).toBeGreaterThan(0)
    // 7 scans (la fiche du paquet et le portfolio) puis le kairos, par le proxy de la démo.
    expect(posts).toHaveLength(8)
    posts.slice(0, 7).forEach((body, i) => {
      expect(body.prompt).toContain(`# Fiche des compétences du pôle ${i + 1} (P${i + 1}.md)`)
      expect(body.prompt).toContain(PORTFOLIO)
    })
    expect(posts[7].prompt).toContain('## carto_P7')
    expect(new Set(posts.map((b) => b.challenge)).size).toBe(8)
    expect(posts.every((b) => b.website === '' && typeof b.nonce === 'string')).toBe(true)
    expect(rejected).toEqual([])
    expect(issuedCount()).toBe(8)
    // Ni offre, ni crédit, ni clé : rien d'autre ne porte le portfolio.
    expect(calls.some((c) => ['POST twin6/appel', 'GET twin9/meta', 'GET keys'].includes(c.key))).toBe(false)
    expect(calls.some((c) => String(c.init?.body ?? '').includes('recoupé trois sources'))).toBe(false)
  })

  it('UC-APP-09-F24 — A6 : un compte choisit l’essai gratuit → les appels passent par la démo, aucun par /api/twin6/appel', async () => {
    const { calls, posts } = serveurDeLaDemo(routes())
    openTwin6()
    await saisirPortfolio()
    fireEvent.click(screen.getByRole('radio', { name: /Essai gratuit/ }))
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    await lancer()

    expect((await screen.findByText(/Cartographie ouverte terminée/)).textContent).toContain('(essai gratuit)')
    expect(posts).toHaveLength(8)
    expect(appelsTwin6(calls)).toHaveLength(0)
  })

  it('UC-APP-09-F25 — A6 : portfolio de plus de 5 000 caractères → essai impossible, ce qu’il faut retirer, aucune requête à la démo', async () => {
    const { calls, posts, issuedCount } = serveurDeLaDemo(routes(VISITEUR))
    openTwin6(null)
    const long = `${PORTFOLIO}\n${'x'.repeat(5000 - PORTFOLIO.length)}`
    expect(long).toHaveLength(5001)
    await saisirPortfolio(long)

    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(true)
    expect(screen.getByText(/Trop long pour l’essai gratuit/).textContent).toContain('(retirez-en 1)')
    expect(screen.getByTestId('twin6-compteur').textContent).toBe('5 001 / 5 000 caractères (essai gratuit)')
    await lancer()
    expect(posts).toHaveLength(0)
    expect(issuedCount()).toBe(0)
    expect(calls.some((c) => c.url.startsWith('api/llm'))).toBe(false)
  })

  it('UC-APP-09-F26 — A6 : budget du jour épuisé (503) → le message de la démo dès le premier appel, sans nouvel essai, bouton de nouveau cliquable', async () => {
    const { posts } = serveurDeLaDemo(routes(VISITEUR), () =>
      jsonResponse(503, { error: 'Démo épuisée pour aujourd’hui, revenez demain.' }),
    )
    openTwin6(null)
    await saisirPortfolio()
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La démo est épuisée pour aujourd’hui ou momentanément désactivée. Revenez un peu plus tard — ou créez un compte pour cartographier sans ces limites.',
    )
    expect(posts).toHaveLength(1)
    expect(screen.queryByText(/Cartographie ouverte terminée/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
  })

  it('UC-APP-09-F27 — A6 : un compte sur l’essai gratuit, budget du jour épuisé (503) → ses deux autres voies, pas l’invitation à créer un compte', async () => {
    const { posts } = serveurDeLaDemo(routes(), () =>
      jsonResponse(503, { error: 'Démo épuisée pour aujourd’hui, revenez demain.' }),
    )
    openTwin6()
    await saisirPortfolio()
    fireEvent.click(screen.getByRole('radio', { name: /Essai gratuit/ }))
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'L’essai gratuit est épuisé pour aujourd’hui ou momentanément désactivé. Revenez un peu plus tard — ou cartographiez avec nos crédits ou votre propre clé API.',
    )
    expect(posts).toHaveLength(1)
  })

  it('UC-APP-09-F05 — E2 : copie statique (pas d’API) → fonctionnalité indisponible, proprement', async () => {
    stubFetch({ 'GET auth/me': htmlResponse(200) })
    openTwin6(null)
    expect((await screen.findByText(/nécessite le serveur/)).textContent).toContain('copie statique')
  })

  it('UC-APP-09-F06 — E3 : solde prépayé trop bas pour le poids du portfolio et la réserve d’un appel → lancement bloqué AVANT tout appel', async () => {
    const { calls } = stubFetch(routes({ 'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 500_000 })) }))
    openTwin6()
    await saisirPortfolio()
    await lancer()

    const alerte = await screen.findByRole('alert')
    // 1 $ de poids, plus la réserve d'un appel : 128 000 tokens de sortie de Sonnet 5 à 11 $ / Mtok (2 / 10, contribution comprise).
    expect(alerte.textContent).toContain(
      'Solde insuffisant pour ce portfolio avec ce modèle (~2.41 $ : 1 $ estimés, et 1.41 $ réservés le temps de chaque appel puis rendus ; solde 0.50 $)',
    )
    expect(alerte.textContent).toContain('propre clé API')
    expect(appelsTwin6(calls)).toHaveLength(0)
  })

  it('UC-APP-09-F07 — E4 : le serveur refuse un appel (402, réserve non couverte) → run arrêté, message affiché, bouton réutilisable', async () => {
    let n = 0
    const { calls } = stubFetch(
      routes({
        'POST twin6/appel': (url, init) => {
          n += 1
          return n === 1
            ? appelOk(url, init)
            : jsonResponse(402, { error: 'Solde insuffisant', solde_microusd: 10, requis_estime_microusd: 160_000 })
        },
      }),
    )
    openTwin6()
    await saisirPortfolio()
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe('Solde insuffisant')
    expect(appelsTwin6(calls)).toHaveLength(2)
    expect(screen.queryByText(/Cartographie ouverte terminée/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
  })

  it('UC-APP-09-F08 — E5 : sortie tronquée (stop max_tokens) → échec explicite, pas de document partiel', async () => {
    stubFetch(routes({ 'POST twin6/appel': (url, init) => appelOk(url, init, { stopReason: 'max_tokens' }) }))
    openTwin6()
    await saisirPortfolio()
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toContain('sortie tronquée (max_tokens)')
    expect(screen.queryByTestId('twin6-export')).toBeNull()
  })

  it('UC-APP-09-F09 — E6 : paquet de prompts public introuvable, ou offre /api/twin9/meta illisible → erreur de chargement, formulaire absent', async () => {
    stubFetch(routes({ [`GET ${TWIN6_PACKAGE_URL}`]: jsonResponse(404, { error: 'absent' }) }))
    openTwin6()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Paquet Twin6 introuvable (404)'))
    expect(screen.queryByLabelText(/Votre portfolio/)).toBeNull()
    cleanup()
    resetApiClient()

    // Paquet servi, mais l'offre ne peut être lue : même issue.
    stubFetch(routes({ 'GET twin9/meta': jsonResponse(500, { error: 'Erreur interne' }) }))
    openTwin6()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Erreur interne'))
    expect(screen.queryByLabelText(/Votre portfolio/)).toBeNull()
  })
})
