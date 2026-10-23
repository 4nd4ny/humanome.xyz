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
//
// Mode d'affichage (UC-VIS-06) : un apprenant seul est en mode SIMPLE par
// défaut ; les scénarios se jouent en mode EXPERT (liste des modèles), posé
// dans le navigateur avant le montage ; F32 rejoue le mode simple. F33 et F34
// reprennent un portfolio du module portfolio (IndexedDB factice).
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { TWIN6_PACKAGE_URL } from '../../../src/api/twin6.js'
import { formatUsd } from '../../../src/api/twin9.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { segmentText } from '@engine/portfolio/segment.js'
import { FakeIDBKeyRange, createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { downloadJson } from '../../../src/lib/download-json.js'
import { validateDocument } from '@engine/validation.js'
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
  referentielsEnBase,
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
  localStorage.clear()
  // Mode expert : la liste des modèles est proposée (F32 rejoue le mode simple).
  localStorage.setItem('humanome-mode', 'expert')
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
  localStorage.clear()
})

// F33-F34 : le module portfolio réel, sur un IndexedDB factice.
const idb = createFakeIndexedDb()

/** Pose un IndexedDB factice et y range un portfolio (segmenté comme le module portfolio). */
async function avecPortfolio(titre, texte) {
  vi.stubGlobal('indexedDB', idb.factory)
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
  await createPortfolioStore().create({ titre, texte, segments: segmentText(texte, { today: '2026-07-12' }) })
}

/** Démonte l'application, puis retire l'IndexedDB factice (et le fetch simulé). */
function sansIndexedDb() {
  cleanup()
  idb.reset()
  vi.unstubAllGlobals()
}

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
    // Et il dit comment il a été produit (2026-10-22, contrats §4 point 8) : en 1.1.0, le paquet et
    // l'empreinte des octets servis, le référentiel (pôles lus dans /meta ; le document fictif ne porte
    // pas d'empreinte), l'accès, le fournisseur et son tag, le budget de sortie ; chaque appel, son arrêt.
    expect(docExporte.schemaVersion).toBe('1.1.0')
    expect(docExporte.configuration).toEqual({
      schema: 'twin6-configuration/1',
      moteur: 'twin6',
      paquet: {
        id: TWIN6_PACKAGE.id,
        version: TWIN6_PACKAGE.version,
        sha256: createHash('sha256').update(JSON.stringify(TWIN6_PACKAGE)).digest('hex'),
      },
      referentiel: { id: 'respire', version: '7.0.0', contentHash: null, structure: 'meta' },
      fiches: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), 'paquet'])),
      fournisseur: 'anthropic',
      voie: 'directe',
      acces: 'credits',
      transport: 'proxy',
      modele: 'claude-sonnet-5',
      maxTokens: 128000,
      temperature: null,
      rgpd: 'sous_conditions',
    })
    expect(docExporte.execution.appels.map((a) => [a.etape, a.stopReason, a.stopReasonRaw])).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [`scan-pole/${n}`, 'end', 'end_turn']).concat([['kairos', 'end', 'end_turn']]),
    )
    expect(docExporte.execution.usage).toEqual({ inputTokens: 8000, outputTokens: 1600 })
    expect(docExporte.execution.modelesServis).toEqual(['claude-sonnet-5'])
    expect(validateDocument('cartographie-merge', docExporte).errors).toEqual([])

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

  it('UC-APP-09-F03 — A2 : la clé mémorisée dans ce navigateur pré-remplit le champ et sert sans ressaisie ; aucune clé gardée sur le serveur n’est lue (ADR-013)', async () => {
    localStorage.setItem('humanome-keys', JSON.stringify({ anthropic: 'sk-ant-navigateur-fictive' }))
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
    expect(screen.getByLabelText('Clé API Anthropic').value).toBe('sk-ant-navigateur-fictive')
    expect(screen.queryByRole('radio', { name: /Utiliser ma clé Anthropic enregistrée/ })).toBeNull()
    expect(screen.getByTestId('cle-reste-navigateur').textContent).toContain('humanome ne la garde jamais sur ses serveurs')

    await lancer()
    const succes = await screen.findByText(/Cartographie ouverte terminée/)
    expect(succes.textContent).toContain('(avec votre clé)')
    expect(calls.filter((c) => c.key === 'GET keys' || c.key === 'GET keys/anthropic')).toHaveLength(0)
    const directs = calls.filter((c) => c.url === ANTHROPIC_URL)
    expect(directs).toHaveLength(8)
    expect(directs.every((c) => c.init.headers['x-api-key'] === 'sk-ant-navigateur-fictive')).toBe(true)
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

  it('UC-APP-09-F31 — A4 : les référentiels publiés en base (API publique) sont offerts sans export statique ; le run lit le document de l’API', async () => {
    const { calls } = stubFetch(
      routes({
        ...referentielsEnBase([REFERENTIEL_RESPIRE_FICTIF, REFERENTIEL_LETTRE_FICTIF]),
        'POST twin6/appel': (url, init) => appelOk(url, init, {}, REFERENTIEL_LETTRE_FICTIF),
      }),
    )
    openTwin6()
    await saisirPortfolio()
    // La base les range par identifiant ; le menu met RESPIRE d'abord, présélectionné.
    const choix = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect([...choix.options].map((o) => o.textContent)).toEqual(['RESPIRE v7', 'Fictif lettré'])
    expect(choix.value).toBe('respire@7.0.0')
    fireEvent.change(choix, { target: { value: 'fictif-lettre@1.0.0' } })
    expect(await screen.findByText(/6 appels au modèle \(5 pôles \+ synthèse\)/)).toBeDefined()

    await lancer()
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    const appels = appelsTwin6(calls)
    expect(appels).toHaveLength(6)
    expect(bodyOf(appels[0]).prompt).toContain('# Pôle 1 — A · Pôle fictif A\n\n## A1 — Capacité fictive A1')
    expect(calls.some((c) => c.key === 'GET referentiels/fictif-lettre/versions/1.0.0')).toBe(true)
    expect(calls.some((c) => c.url.startsWith('data/referentiel/fictif-lettre'))).toBe(false)
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

  it('UC-APP-09-F35 — A6, E14, RG11 : les crédits offerts du mois épuisés (503 offerts_epuises) → le message du serveur, qui nomme le 1er du mois suivant, dès le premier appel ; pour un compte, ses deux autres voies, jamais « pour aujourd’hui »', async () => {
    const refus = { error: 'Les crédits offerts de ce mois sont épuisés ; revenez le 1er novembre.', code: 'offerts_epuises' }
    const visiteur = serveurDeLaDemo(routes(VISITEUR), () => jsonResponse(503, refus))
    openTwin6(null)
    await saisirPortfolio()
    await lancer()
    expect((await screen.findByRole('alert')).textContent).toBe(refus.error)
    expect(visiteur.posts).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
    cleanup()

    const compte = serveurDeLaDemo(routes(), () => jsonResponse(503, refus))
    openTwin6()
    await saisirPortfolio()
    fireEvent.click(screen.getByRole('radio', { name: /Essai gratuit/ }))
    await lancer()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Les crédits offerts de ce mois sont épuisés ; revenez le 1er novembre. D’ici là, cartographiez avec nos crédits ou votre propre clé API.',
    )
    expect(compte.posts).toHaveLength(1)
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

  it('UC-APP-09-F36 — A7 (sprint 6, lot S6b) : son école paie — la voie le dit, chaque appel porte son école (payeur) ; ce qu’elle peut encore payer pour lui trop bas → lancement bloqué AVANT tout appel, sans proposer d’acheter', async () => {
    const ecole = {
      type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false, cle: false, mois: '2026-10',
      plafond_microusd: 5_000_000, engage_microusd: 0, reste_credit_microusd: 5_000_000, reste_cle_microusd: 5_000_000,
    }
    const { calls } = stubFetch(
      routes({ 'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 0, peut_acheter: false, payeurs: [ecole] })) }),
    )
    openTwin6()
    await saisirPortfolio()
    expect(screen.getByLabelText(/Avec les crédits que paie mon école/).checked).toBe(true)
    expect(screen.getByTestId('payeur-ecole').textContent).toContain('Payé par votre école, École des Tilleuls.')
    await lancer()

    await screen.findByText(/Cartographie ouverte terminée/, undefined, { timeout: 4000 })
    expect(appelsTwin6(calls).length).toBeGreaterThan(0)
    expect(appelsTwin6(calls).every((c) => bodyOf(c).payeur === 3)).toBe(true)
    cleanup()
    resetApiClient()

    const court = stubFetch(
      routes({
        'GET twin9/meta': jsonResponse(200, metaTwin9({
          solde_microusd: 0, peut_acheter: false, payeurs: [{ ...ecole, reste_credit_microusd: 500_000 }],
        })),
      }),
    )
    openTwin6()
    await saisirPortfolio()
    await lancer()
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Ce que votre école peut encore payer pour vous ce mois-ci ne suffit pas')
    expect(alerte.textContent).toContain('il vous reste 0.50 $')
    expect(alerte.textContent).toContain('relever le plafond')
    expect(alerte.textContent).not.toContain('Rechargez')
    expect(appelsTwin6(court.calls)).toHaveLength(0)
  })

  it('UC-APP-09-F37 — A7 : la voie « crédits » dit qui paie et comment — sur la clé de son école, le coût réel sans surtaxe et rien de débité ici ; son solde restant choisi, la contribution ; son école sans plafond réglé (0) et un solde à lui : le refus dit de demander le plafond, et propose « Mon solde restant »', async () => {
    const ecole = {
      type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false, cle: true, mois: '2026-10',
      plafond_microusd: 5_000_000, engage_microusd: 0, reste_credit_microusd: 5_000_000, reste_cle_microusd: 5_000_000,
      credit_suffisant: true,
    }
    stubFetch(routes({ 'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 0, peut_acheter: false, payeurs: [ecole] })) }))
    openTwin6()
    await saisirPortfolio()
    expect(screen.getByLabelText(/Avec ce que paie mon école, sur sa propre clé Anthropic/).checked).toBe(true)
    expect(screen.queryByText(/sa surtaxe/)).toBeNull()
    expect(screen.getByText(/Sur la clé de l’école, elle paie Anthropic directement : rien n’est débité ici\./)).toBeDefined()
    cleanup()
    resetApiClient()

    const sansPlafond = { ...ecole, cle: false, plafond_microusd: 0, reste_credit_microusd: 0, reste_cle_microusd: 0 }
    const solde = { type: 'personnel', solde_microusd: 3_000_000 }
    const court = stubFetch(routes({
      'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 3_000_000, peut_acheter: false, payeurs: [sansPlafond, solde] })),
    }))
    openTwin6()
    await saisirPortfolio()
    expect(screen.getByLabelText(/Avec les crédits que paie mon école \(le coût réel et sa surtaxe\)/)).toBeDefined()
    await lancer()
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Votre école n’a pas encore réglé le plafond qu’elle vous accorde : demandez-le-lui')
    expect(alerte.textContent).toContain('choisissez « Mon solde restant » dans « Qui paie »')
    expect(appelsTwin6(court.calls)).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Qui paie'), { target: { value: 'personnel' } })
    expect(screen.getByLabelText(/Avec mon solde restant \(\+10 % de contribution\)/)).toBeDefined()
  })

  it('UC-APP-09-F07 — E4 : le serveur refuse un appel (402, réserve non couverte) → run arrêté, message affiché avec ce que le run a débité (le premier appel abouti), bouton réutilisable', async () => {
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

    expect((await screen.findByRole('alert')).textContent).toBe(`Solde insuffisant (${formatUsd(6602)} débités pour ce run.)`)
    expect(appelsTwin6(calls)).toHaveLength(2)
    expect(screen.queryByText(/Cartographie ouverte terminée/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
  })

  it('UC-APP-09-F08 — E5 : sortie tronquée (stop max_tokens) → échec explicite nommant l’étape, ce que le run a débité appel tronqué compris, pas de document partiel', async () => {
    // Le premier appel abouti, le second tronqué : facturé (un 200), à un autre
    // coût, pour que le montant affiché dise s'il compte l'appel tronqué — et
    // une seule fois : sous le centime, formatUsd montre quatre décimales.
    let n = 0
    const { calls } = stubFetch(
      routes({
        'POST twin6/appel': (url, init) => {
          n += 1
          return n === 1 ? appelOk(url, init) : appelOk(url, init, { stopReason: 'max_tokens', cout_microusd: 2100 })
        },
      }),
    )
    openTwin6()
    await saisirPortfolio()
    await lancer()

    const alerte = (await screen.findByRole('alert')).textContent
    expect(alerte).toMatch(/^executerTwin6: sortie tronquée \(max_tokens\) à l'étape scan-pole\/2 — /)
    const debite = `(${formatUsd(6602 + 2100)} débités pour ce run.)`
    expect(alerte.slice(-debite.length)).toBe(debite)
    expect(appelsTwin6(calls)).toHaveLength(2)
    expect(screen.queryByText(/Cartographie ouverte terminée/)).toBeNull()
    expect(screen.queryByTestId('twin6-export')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
  })

  it('UC-APP-09-F31 — E5 : le fournisseur refuse de répondre (stop refusal relayé) → run arrêté à cette étape, ce que le run a débité refus compris, pas de document', async () => {
    let n = 0
    const { calls } = stubFetch(
      routes({
        'POST twin6/appel': (url, init) => {
          n += 1
          return n === 1 ? appelOk(url, init) : appelOk(url, init, { text: '', stopReason: 'refusal', cout_microusd: 2100 })
        },
      }),
    )
    openTwin6()
    await saisirPortfolio()
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe(
      `executerTwin6: le fournisseur a refusé de répondre à l'étape scan-pole/2 (${formatUsd(6602 + 2100)} débités pour ce run.)`,
    )
    expect(appelsTwin6(calls)).toHaveLength(2)
    expect(screen.queryByText(/Cartographie ouverte terminée/)).toBeNull()
    expect(screen.queryByTestId('twin6-export')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false)
  })

  it('UC-APP-09-F32 — mode simple (apprenant, aucun choix stocké) : pas de liste des modèles, le modèle cible du paquet nommé et employé, même choisi autrement en mode expert ; le référentiel reste au choix', async () => {
    localStorage.removeItem('humanome-mode')
    const { calls } = stubFetch(
      routes({ 'GET twin9/meta': jsonResponse(200, metaTwin9({ modeles_twin6: { 'claude-sonnet-5': [2.2, 11], 'claude-haiku-5-5': [1.1, 5.5] } })) }),
    )
    openTwin6()
    await saisirPortfolio()
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    expect(screen.getByTestId('twin6-modele-defaut').textContent).toContain('Modèle : claude-sonnet-5 (par défaut')
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('respire@7.0.0')

    // Mode expert depuis le tiroir : la liste paraît, on choisit Haiku…
    const menu = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    fireEvent.click(menu.getByRole('switch', { name: 'Mode expert' }))
    expect(localStorage.getItem('humanome-mode')).toBe('expert')
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'claude-haiku-5-5' } })
    // … puis retour au mode simple : le modèle employé redevient le modèle cible du paquet.
    fireEvent.click(menu.getByRole('switch', { name: 'Mode expert' }))
    expect(localStorage.getItem('humanome-mode')).toBe('simple')
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    await lancer()

    await screen.findByText(/Cartographie ouverte terminée/)
    const appels = appelsTwin6(calls)
    expect(appels).toHaveLength(8)
    expect(appels.every((c) => bodyOf(c).model === 'claude-sonnet-5')).toBe(true)
  })

  it('UC-APP-09-F33 — mes portfolios : un portfolio aux journées « Lundi 9 février 2026 » remplit la zone de saisie en feuilles ### AAAA-MM-JJ, le passage non daté laissé de côté et compté ; le run lit ce texte', async () => {
    const texte =
      'Note de départ, sans date, à ne pas cartographier.\n\n' +
      'Mardi 10 février 2026\nAujourd’hui j’ai recoupé trois sources avant de conclure.\n\n' +
      'Mercredi 11 février 2026\nJ’ai expliqué ma démarche au groupe, qui l’a reprise.'
    try {
      await avecPortfolio('Journal de Léa', texte)
      const { calls } = stubFetch(routes())
      openTwin6()
      const choix = await screen.findByLabelText('Partir d’un de mes portfolios')
      expect([...choix.options].map((o) => o.textContent)).toEqual(['— choisir —', 'Journal de Léa'])
      fireEvent.change(choix, { target: { value: choix.options[1].value } })

      const attendu =
        '### 2026-02-10\n---\nMardi 10 février 2026\nAujourd’hui j’ai recoupé trois sources avant de conclure.\n\n' +
        '### 2026-02-11\n---\nMercredi 11 février 2026\nJ’ai expliqué ma démarche au groupe, qui l’a reprise.'
      expect(screen.getByLabelText(/Votre portfolio/).value).toBe(attendu)
      expect(screen.getByTestId('twin6-reprise').textContent).toBe(
        '« Journal de Léa » : 2 journées datées, en feuilles ### AAAA-MM-JJ ; 1 passage non daté laissé de côté.',
      )
      await screen.findByText(/appels au modèle/)
      await lancer()
      await screen.findByText(/Cartographie ouverte terminée/)
      const appels = appelsTwin6(calls)
      expect(appels).toHaveLength(8)
      expect(appels.every((c) => bodyOf(c).prompt.includes(attendu))).toBe(true)
      expect(appels.some((c) => bodyOf(c).prompt.includes('Note de départ'))).toBe(false)
    } finally {
      sansIndexedDb()
    }
  })

  it('UC-APP-09-F34 — mes portfolios : un texte déjà en feuilles ### AAAA-MM-JJ est repris tel quel ; un portfolio sans journée datée ne remplit rien et le dit ; sans stockage local, pas de liste', async () => {
    try {
      await avecPortfolio('Déjà au format', PORTFOLIO)
      await createPortfolioStore().create({ titre: 'Sans date', texte: 'Des notes', segments: [{ date: null, texte: 'Des notes', debut: 0, fin: 9 }] })
      stubFetch(routes())
      openTwin6()
      const choix = await screen.findByLabelText('Partir d’un de mes portfolios')
      const valeur = (titre) => [...choix.options].find((o) => o.textContent === titre).value
      fireEvent.change(choix, { target: { value: valeur('Déjà au format') } })
      expect(screen.getByLabelText(/Votre portfolio/).value).toBe(PORTFOLIO)
      expect(screen.getByTestId('twin6-reprise').textContent).toBe('« Déjà au format » : 1 journée datée, en feuilles ### AAAA-MM-JJ.')
      fireEvent.change(choix, { target: { value: valeur('Sans date') } })
      // Rien n'est écrasé : le texte repris auparavant reste.
      expect(screen.getByLabelText(/Votre portfolio/).value).toBe(PORTFOLIO)
      expect(screen.getByTestId('twin6-reprise').textContent).toBe(
        '« Sans date » n’a aucune journée datée : datez ses journées dans « Mon portfolio ».',
      )
    } finally {
      sansIndexedDb()
    }
    resetApiClient()

    // Sans IndexedDB (jsdom nu) : le formulaire, sans la liste.
    stubFetch(routes())
    openTwin6()
    await screen.findByLabelText(/Votre portfolio/)
    expect(screen.queryByLabelText('Partir d’un de mes portfolios')).toBeNull()
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
