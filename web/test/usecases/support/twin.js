// Support du lot « Twin6 / Twin9 » (UC-APP-09, UC-APP-10, UC-APP-11,
// UC-PRO-08, UC-ADM-05) : réponses HTTP factices, routeur de `fetch` simulé et
// jeux de données FICTIFS.
//
// CONFIDENTIALITÉ (ADR-010) : aucun gabarit Twin9 réel ici — le front n'en voit
// de toute façon jamais (sauf l'atelier, dont les contenus sont inventés).
// Le routeur associe « MÉTHODE chemin » (chemin sans le préfixe « api/ » ni la
// query) OU « chemin » seul à une réponse (objet ou fonction (url, init) →
// réponse). Toute URL non routée répond 404 JSON. Chaque appel est consigné.
import { vi } from 'vitest'

/** Réponse JSON minimale compatible avec api/client.js et le moteur. */
export function jsonResponse(status, data, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : (lower[name.toLowerCase()] ?? null),
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

/** Réponse HTML (hébergement statique sans API : la page d'index répond). */
export function htmlResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    json: async () => {
      throw new SyntaxError('not json')
    },
    text: async () => '<!doctype html><title>humanome</title>',
  }
}

/** Clé de route d'une requête : « POST twin6/appel » (sans « api/ » ni query). */
export function routeKey(url, init = {}) {
  const method = String(init?.method ?? 'GET').toUpperCase()
  const path = String(url).replace(/^api\//, '').split('?')[0]
  return `${method} ${path}`
}

/**
 * Installe un `fetch` global routé. `routes` : { 'GET auth/me': réponse,
 * 'POST twin6/appel': (url, init) => réponse, 'data/twin6/x.json': … }.
 * @returns {{fetchMock: import('vitest').Mock, calls: Array<{url: string, key: string, init: object}>}}
 */
export function stubFetch(routes) {
  const calls = []
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = routeKey(url, init)
    calls.push({ url: String(url), key, init })
    const path = String(url).replace(/^api\//, '').split('?')[0]
    const hit = routes[key] ?? routes[String(url)] ?? routes[path]
    if (hit === undefined) return jsonResponse(404, { error: 'absent' })
    return typeof hit === 'function' ? hit(String(url), init) : hit
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

/** Corps JSON d'un appel consigné. */
export function bodyOf(call) {
  return call?.init?.body ? JSON.parse(call.init.body) : undefined
}

/** Session factice renvoyée par GET api/auth/me (sème le jeton CSRF). */
export function meResponse(roles = ['apprenant'], extra = {}) {
  return jsonResponse(200, {
    user: { id: 7, email: 'lea@example.org', displayName: 'Léa', roles, hasAvatar: false, ...extra },
    csrfToken: 'csrf-twin-lot',
  })
}

/** Les 7 pôles RESPIRE, aux noms accentués de l'import Twin9 (ceux de /api/twin9/meta). */
export const POLES_RESPIRE = [
  { num: 1, nom: 'TÊTE — Penser & Comprendre' },
  { num: 2, nom: 'CŒUR — Relier & Naviguer' },
  { num: 3, nom: 'MAIN — Créer & Incarner' },
  { num: 4, nom: 'ÂME — Discerner & Juger' },
  { num: 5, nom: 'RACINES — Évoluer & Résister' },
  { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
  { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
]

/** Référentiel au format /api/twin9/meta : 7 pôles, une compétence N.01 chacun. */
export const META_REFERENTIEL = POLES_RESPIRE.map((p) => ({
  num: p.num,
  nom: p.nom,
  competences: [{ code: `${p.num}.01`, nom: `Compétence fictive ${p.num}.01` }],
}))

/**
 * Paquet PUBLIC Twin6 FICTIF (même forme que web/public/data/twin6/…json) : la
 * fiche de chaque pôle nomme sa compétence (« ## N.01 — »), comme celles du
 * vrai paquet nomment les compétences de RESPIRE v7 — un run de ce RESPIRE la
 * lit telle quelle.
 */
export const TWIN6_PACKAGE = {
  id: 'twin6-ouverte',
  version: '1.0.0',
  nom: 'Cartographie ouverte Twin6 (fictif)',
  licence: 'AGPL-3.0-only',
  modeleCibleDefaut: 'claude-sonnet-5',
  scanPole: 'Scanne le pôle ${POLE} du portfolio avec la fiche P${POLE}.md (gabarit public fictif).',
  kairos: 'Synthèse kairos fictive des carto_pole.',
  fiches: Object.fromEntries(
    POLES_RESPIRE.map((p) => [
      p.num,
      `# Pôle ${p.num} — ${p.nom}\n\n## ${p.num}.01 — Compétence fictive ${p.num}.01\n\nFiche publique fictive du pôle ${p.num}.\n`,
    ]),
  ),
}

/**
 * La version publiée de RESPIRE, FICTIVE : la structure de /api/twin9/meta
 * (sept pôles, une compétence N.01 chacun), aux noms de pôle sans accent comme
 * ceux des documents publiés.
 */
export const REFERENTIEL_RESPIRE_FICTIF = {
  schemaVersion: '2.0.0',
  kind: 'referentiel',
  id: 'respire',
  version: '7.0.0',
  label: 'RESPIRE v7',
  poles: POLES_RESPIRE.map((p) => ({ num: p.num, nom: p.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), couleur: null })),
  competences: POLES_RESPIRE.map((p) => ({ code: `${p.num}.01`, nom: `Compétence fictive ${p.num}.01`, pole: p.num })),
}

/** Un autre référentiel publié, FICTIF : cinq pôles lettrés, deux capacités chacun (A1 à E2). */
export const REFERENTIEL_LETTRE_FICTIF = {
  schemaVersion: '2.0.0',
  kind: 'referentiel',
  id: 'fictif-lettre',
  version: '1.0.0',
  label: 'Fictif lettré',
  niveaux: [{ nom: 'capacité', motif: '[A-E][1-2]' }],
  poles: ['A', 'B', 'C', 'D', 'E'].map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}`, couleur: null })),
  competences: ['A', 'B', 'C', 'D', 'E'].flatMap((l, i) =>
    [1, 2].map((n) => ({ code: `${l}${n}`, nom: `Capacité fictive ${l}${n}`, pole: i + 1, description: `Définition fictive de ${l}${n}.` })),
  ),
}

/**
 * Routes de l'export statique des référentiels (data/referentiel/, UC-VIS-02) :
 * son index et un fichier par version publiée.
 *
 * @param {Array<object>} referentiels documents publiés
 */
export function referentielsPublies(referentiels) {
  const routes = {
    'data/referentiel/index.json': jsonResponse(
      200,
      referentiels.map((r) => ({
        referentielId: r.id,
        semver: r.version,
        label: r.label,
        publishedAt: '2026-10-20T00:00:00',
        fichier: `${r.id}-v${r.version}.json`,
      })),
    ),
  }
  for (const r of referentiels) routes[`data/referentiel/${r.id}-v${r.version}.json`] = jsonResponse(200, r)
  return routes
}

/**
 * Sortie `carto_pole` FICTIVE du pôle N : la compétence N.01 attestée par une
 * trace concrète sur la feuille `feuille`.
 */
export function cartoPoleFictif(num, feuille = '2026-02-10') {
  return {
    poleNum: num,
    passagesSaillants: [
      { pid: 1, feuille, extraitVerbatim: `Trace fictive du pôle ${num}.`, contexte: 'projet', auteur: 'apprenant' },
    ],
    competences: [
      {
        code: `${num}.01`,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte documenté' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Attestation fictive ${num}.`, confianceFinale: 0.7 } },
        verdict: {
          statut: 'présence établie',
          nombrePreuves: 1,
          nombreIndices: 0,
          confiance: 0.7,
          motif: 'Trace concrète.',
          prescription: 'Poursuivre.',
        },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Pôle ${num}\n\nPrésence fictive.`, portraitPole: '.' },
    auditPole: { competencesTotales: 1, presencesEtablies: 1 },
  }
}

/** Sortie `kairos` FICTIVE. */
export const KAIROS_FICTIF = {
  kairos: {
    apprenant: {
      portrait: 'Profil fictif.',
      formeProfil: 'Massifs.',
      syntheseCompleteMarkdown: '## Synthèse\n\nUn portrait fictif et cohérent.',
    },
  },
  emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
}

/**
 * Texte de réponse du modèle pour un prompt Twin6 : kairos si le prompt porte
 * les carto_pole (« carto_P1 »), sinon le carto_pole du pôle nommé dans le
 * prompt (« Fiche des compétences du pôle N ») ; sa compétence attestée est
 * N.01, ou la première du pôle dans `referentiel` s'il est donné.
 *
 * @param {string} prompt
 * @param {{competences: Array<{code: string, pole: number}>}} [referentiel]
 */
export function twin6ModelText(prompt, referentiel = null) {
  if (String(prompt).includes('## carto_P1')) return '```json\n' + JSON.stringify(KAIROS_FICTIF) + '\n```'
  const m = /Fiche des compétences du pôle (\d+)/.exec(String(prompt))
  const num = m ? Number(m[1]) : 1
  const pole = cartoPoleFictif(num)
  const code = referentiel?.competences.find((c) => Number(c.pole) === num)?.code
  if (code) pole.competences[0].code = code
  return `Voici la cartographie.\n\n\`\`\`json\n${JSON.stringify(pole)}\n\`\`\``
}

/**
 * Ce que sert /api/twin9/meta, FICTIF : offre Twin6, packs, référentiel,
 * PayPal, solde, clé privée (T11 : plus d'étapes, d'offre Twin9 ni de réglages
 * du pipeline, que seul lisait le moteur du navigateur ; 2026-10-20 : plus
 * l'état de la promotion, qu'aucune vue ne lisait).
 */
export function metaTwin9(overrides = {}) {
  return {
    modeles_twin6: { 'claude-sonnet-5': [3.3, 16.5] },
    packs: [
      { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
      { montant_usd: 20, libelle: 'Pack standard — 20 $' },
    ],
    referentiel: META_REFERENTIEL,
    paypalConfigured: true,
    solde_microusd: 50_000_000,
    cle_privee_disponible: false,
    ...overrides,
  }
}
