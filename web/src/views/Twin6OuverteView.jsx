// Vue « Cartographie ouverte Twin6 » — #/twin6-ouverte.
//
// Le pendant GRATUIT et OPEN SOURCE de l'analyse approfondie Twin9 : un scan par
// pôle du référentiel choisi (Greffier / Pédagogue adversarial / Rapporteur) puis
// une synthèse Kairos, sur le portfolio ENTIER (RESPIRE v7 : 8 appels), rendus
// dans le MÊME sunburst évolutif que toutes les cartographies (le moteur mappe
// la sortie Twin6 vers cartographie-merge).
//
// Le référentiel (2026-10-20) : un référentiel publié au choix, RESPIRE par
// défaut ; le run en lit la structure dans son document, et chaque pôle sa
// fiche — celle du paquet quand elle en nomme exactement les compétences,
// sinon écrite depuis le document (api/twin6.js, referentielTwin6 ; moteur,
// fichesPourTwin6).
//
// Trois voies :
//   - CLÉ PERSO : le moteur (executerTwin6) tourne DANS le navigateur, appel
//     direct au fournisseur avec la clé de l'utilisateur → GRATUIT. La clé ne
//     quitte pas le navigateur (appel direct, en-tête browser-access) ; elle
//     s'y mémorise si on le demande (localStorage 'humanome-keys', celui de
//     l'assistant de run). Depuis l'ADR-013, la page ne lit plus de clé gardée
//     sur le serveur et le dit : « votre clé reste dans ce navigateur ».
//   - CRÉDITS : chaque appel passe par /api/twin6/appel (notre clé), +10 % de
//     contribution débités du solde prépayé — celui qu'un compte a encore, que
//     seule une école recharge (ADR-013 §2 c, e). Un apprenant dont l'école
//     paie (sprint 6, lot S6b — §4) : son école, sur sa clé si elle en a une,
//     sinon sur son crédit au coût réel et sa surtaxe, sous le plafond qu'elle
//     lui accorde par mois ; avec plusieurs écoles, il choisit laquelle
//     (twin9/ChoixPayeur.jsx), ou son propre solde restant.
//   - ESSAI GRATUIT (2026-10-21) : chaque appel passe par le proxy de la démo
//     (POST /api/llm, une preuve de travail par appel), comme l'Essayer, dont il
//     partage le budget du jour (1 $ par défaut) ; le serveur impose le modèle.
//     Ouvert aux visiteurs, pour qui c'est la seule voie, et aux comptes ; le
//     portfolio y compte 5 000 caractères au plus (DEMO_TEXT_MAX_CHARS).
//
// Le paquet de prompts est PUBLIC et téléchargeable (bandeau open source).
//
// Le document exporté dit comment il a été produit (2026-10-22, docs/contrats.md
// §4 point 8) : la vue passe au moteur ce qu'elle seule sait — le paquet et
// l'empreinte de ses octets, le référentiel choisi (son id, sa version, son
// empreinte, et d'où le moteur lit ses pôles), l'origine de chaque fiche,
// l'accès —, le moteur complète le bloc et y joint l'exécution.
//
// Mes portfolios (2026-10-22, sprint 1, amélioration 11) : comme Twin9, la page
// propose les portfolios de ce navigateur (module portfolio) ; en choisir un
// remplit la zone de saisie, en feuilles « ### AAAA-MM-JJ » (portfolioEnFeuilles).
//
// Mode simple (lib/ui-mode.js) : la liste des modèles n'est pas proposée ; le
// run part sur le modèle cible du paquet, nommé en une ligne.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import { getLocalKey, KEY_STAYS_IN_BROWSER, setLocalKey } from '../lib/local-keys.js'
import { formatUsd } from '../api/twin9.js'
import {
  TWIN6_PACKAGE_URL,
  loadTwin6Package,
  makeCreditsProvider,
  makeOwnKeyProvider,
  fetchTwin6Offer,
  referentielTwin6,
} from '../api/twin6.js'
import { executerTwin6, fichesPourTwin6, originesDesFiches, twin6CallsFor } from '@engine/twin6/index.js'
import { sortieMaxAnthropic } from '@engine/providers/limits.js'
import { REFERENTIEL_PAR_DEFAUT } from '@engine/conformite.js'
import { listPublishedReferentiels, loadPublishedReferentiel } from '../data/referentiel.js'
import ReferentielChoice from '../components/ReferentielChoice.jsx'
import MergeView from './MergeView.jsx'
import { useSunburstLib } from './view-helpers.js'
import { downloadJson } from '../lib/download-json.js'
import { DEMO_MODEL, DEMO_TEXT_MAX_CHARS, createDemoProvider, describeDemoError } from '../lib/demo-llm.js'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { computeDayGroups } from '../lib/run-launcher.js'
import { useUiMode } from '../lib/ui-mode.js'
import {
  CREDIT_ECOLE_BAS,
  choixParDefaut,
  creditEcoleBas,
  listePayeurs,
  payeurChoisi,
  resteMicrousd,
  valeurPayeur,
} from '../lib/payeurs.js'
import ChoixPayeur from './twin9/ChoixPayeur.jsx'

/** L'offre d'un visiteur : ni prix, ni solde, ni structure importée (RG9 : le document publié). */
const OFFRE_VISITEUR = Object.freeze({ modeles: {}, referentiel: [], solde_microusd: 0 })

/** Une feuille datée : la ligne « ### AAAA-MM-JJ » qui ouvre une journée. */
const FEUILLE_DATEE = /^###\s+\d{4}-\d{2}-\d{2}\b/m

/**
 * Le texte qu'un portfolio du module portfolio donne à Twin6, en feuilles datées.
 *
 * - Son texte a déjà des feuilles « ### AAAA-MM-JJ » : il est repris tel quel
 *   (c'est le format que lisent les prompts Twin6).
 * - Sinon, chaque journée datée de son découpage devient une feuille
 *   « ### AAAA-MM-JJ », suivie de « --- » et du texte de la journée (son en-tête
 *   d'origine compris, « Lundi 5 janvier 2026 » par exemple) ; les passages non
 *   datés sont laissés de côté, et comptés.
 *
 * @param {{texte?: string, segments?: Array<{date: string | null, texte: string}>} | null} record
 * @returns {{texte: string, journees: number, nonDates: number}} `texte` vide :
 *   aucune journée datée
 */
export function portfolioEnFeuilles(record) {
  const brut = typeof record?.texte === 'string' ? record.texte : ''
  const segments = Array.isArray(record?.segments) ? record.segments : []
  if (FEUILLE_DATEE.test(brut)) {
    const feuilles = new Set([...brut.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\b/gm)].map((m) => m[1]))
    return { texte: brut, journees: feuilles.size, nonDates: 0 }
  }
  const nonDates = segments.filter(
    (seg) => seg && typeof seg.texte === 'string' && seg.texte.trim() !== '' && typeof seg.date !== 'string',
  ).length
  const groupes = computeDayGroups(segments)
  const texte = groupes.map((g) => `### ${g.iso}\n---\n${g.texte.trim()}`).join('\n\n')
  return { texte, journees: groupes.length, nonDates }
}

/** Démo épuisée, pour un compte : ses deux autres voies, pas l'invitation à en créer un. */
const ESSAI_EPUISE_COMPTE =
  'L’essai gratuit est épuisé pour aujourd’hui ou momentanément désactivé. ' +
  'Revenez un peu plus tard — ou cartographiez avec nos crédits ou votre propre clé API.'
/** Ce qu'un compte peut faire quand les crédits offerts du mois sont épuisés (sprint 7). */
const ESSAI_MOIS_COMPTE = 'D’ici là, cartographiez avec nos crédits ou votre propre clé API.'

/** 5000 -> « 5 000 » (espace des milliers, comme la page Essayer). */
function formatInt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function messageErreur(error) {
  if (error instanceof ApiUnavailableError) return error.message
  return error?.serverMessage || error?.message || 'Une erreur est survenue. Réessayez.'
}

/** Horodatage ISO sans fuseau (contrat cartographie-merge : ...THH:MM:SS). */
function horodatage(now) {
  return now.toISOString().slice(0, 19)
}

/** L'accès d'un run, au vocabulaire du document (« essai » pour la voie « demo » de la vue). */
const ACCES_PAR_VOIE = Object.freeze({ credits: 'credits', cle_perso: 'cle_perso', demo: 'essai' })

/**
 * Ce que la vue seule sait de la configuration d'un run (le moteur la complète) :
 * le paquet et l'empreinte de ses octets, le référentiel choisi — son document
 * fait foi pour l'id, la version et l'empreinte ; « structure » dit si le moteur
 * lit ses pôles dans /meta (RESPIRE) ou dans ce document —, l'origine de chaque
 * fiche, l'accès.
 */
function configurationDuRun({ pkg, doc, moteurRef, fiches, voie }) {
  return {
    paquet: { id: pkg.id, version: pkg.version, sha256: pkg.sha256 ?? null },
    referentiel: {
      id: typeof doc.id === 'string' && doc.id !== '' ? doc.id : 'respire',
      version: doc.version ?? null,
      contentHash: typeof doc.contentHash === 'string' ? doc.contentHash : null,
      structure: moteurRef === doc ? 'document' : 'meta',
    },
    fiches: originesDesFiches(fiches, pkg.templates.fiches),
    acces: ACCES_PAR_VOIE[voie] ?? null,
  }
}

/**
 * Poids d'un portfolio en USD (heuristique utilisateur : ~1 ko = 1 USD), utilisée
 * comme garde-fou de solde AVANT un run sur crédits. Au moins 1 $ (tout run coûte).
 * Le coût réel dépend du modèle et est réconcilié après le run ; c'est un plancher.
 */
function poidsEstimeUsd(texte) {
  const octets =
    typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(texte).length : texte.length
  return Math.max(1, Math.ceil(octets / 1024))
}

/**
 * Ce que le serveur réserve sur le crédit le temps d'UN appel, au-delà de son
 * entrée : toute la sortie que le modèle peut rendre, à son prix contribution
 * comprise (2026-10-21 — la sortie n'est plus plafonnée). Rendu après l'appel,
 * mais il doit tenir dans le solde à chaque appel du run.
 *
 * @param {string} model
 * @param {Record<string, [number, number]>} modeles prix [entrée, sortie] en USD / Mtok (offre)
 */
function reserveSortieUsd(model, modeles) {
  const prixSortie = Number(modeles?.[model]?.[1] ?? 0)
  return (sortieMaxAnthropic(model) * prixSortie) / 1_000_000
}

/** Ce qu'un payeur peut encore payer pour un run sur crédits : son école sur sa clé si elle en a une (ADR-013 §4). */
function restePour(payeur, offer) {
  if (payeur === null) return Number(offer?.solde_microusd ?? 0)
  return resteMicrousd(payeur, payeur.type === 'ecole' && payeur.cle ? 'ecole' : 'instance')
}

export default function Twin6OuverteView({ lib: injectedLib, deps = {} }) {
  // Mode d'affichage (défaut du contexte : expert, la liste des modèles est proposée).
  const { expert } = useUiMode()
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const runEngine = deps.runEngine ?? executerTwin6
  const loadPkg = deps.loadPackage ?? loadTwin6Package
  const fetchOffer = deps.fetchOffer ?? fetchTwin6Offer
  const creditsFactory = deps.makeCreditsProvider ?? makeCreditsProvider
  const ownKeyFactory = deps.makeOwnKeyProvider ?? makeOwnKeyProvider
  const demoFactory = deps.makeDemoProvider ?? createDemoProvider
  const now = deps.now ?? (() => new Date())
  const callOpts = deps.fetchFn ? { fetchFn: deps.fetchFn } : {}
  const loadReferentiel = deps.loadReferentiel ?? loadPublishedReferentiel
  // Stable : ReferentielChoice relit la liste quand cette fonction change.
  const listReferentiels = useMemo(
    () => deps.listReferentiels ?? (() => listPublishedReferentiels(callOpts)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const OWN_KEY_PROVIDER = 'anthropic'
  const [session, setSession] = useState({ status: 'loading', user: null })
  const [res, setRes] = useState({ status: 'loading', pkg: null, offer: null, message: '' })
  const [portfolio, setPortfolio] = useState('')
  const [model, setModel] = useState('')
  const [voie, setVoie] = useState('credits') // 'credits' | 'cle_perso' | 'demo'
  // La clé de ce navigateur, si elle y est mémorisée (jamais une clé gardée sur le serveur, ADR-013).
  const [apiKey, setApiKey] = useState(() => getLocalKey(OWN_KEY_PROVIDER, deps.keyStorage))
  const [memoriser, setMemoriser] = useState(() => getLocalKey(OWN_KEY_PROVIDER, deps.keyStorage) !== '')
  // Le référentiel choisi : null, RESPIRE (sa dernière version publiée) ; son document une fois chargé.
  const [choix, setChoix] = useState(null)
  const [ref, setRef] = useState({ status: 'loading', doc: null, message: '' })
  const [run, setRun] = useState({ status: 'idle', done: 0, total: 0, phase: '', doc: null, referentiel: null, cout: 0, error: '', voie: null, caracteres: 0 })
  const { lib } = useSunburstLib(deps.lib ?? injectedLib)
  const running = useRef(false)
  // Les portfolios de ce navigateur (IndexedDB, module portfolio) ; [] sans stockage.
  const [mesPortfolios, setMesPortfolios] = useState([])
  const [choixPortfolio, setChoixPortfolio] = useState('')
  const [reprise, setReprise] = useState(null) // {titre, journees, nonDates} du portfolio repris
  // qui paie sur crédits (ADR-013 §4) : '' le défaut du serveur, 'personnel', ou l'identifiant d'une école
  const [payeur, setPayeur] = useState('')

  useEffect(() => {
    let alive = true
    let store
    try {
      store = deps.portfolioStore ?? createPortfolioStore()
    } catch {
      return undefined
    }
    Promise.resolve()
      .then(() => store.list())
      .then((list) => alive && setMesPortfolios(Array.isArray(list) ? list : []))
      .catch(() => alive && setMesPortfolios([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Remplit la zone de saisie avec un portfolio du module portfolio. */
  function reprendrePortfolio(id) {
    setChoixPortfolio(id)
    const record = mesPortfolios.find((p) => p.id === id)
    if (!record) {
      setReprise(null)
      return
    }
    const { texte, journees, nonDates } = portfolioEnFeuilles(record)
    if (texte !== '') setPortfolio(texte)
    setReprise({ titre: record.titre, journees, nonDates })
  }

  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then((r) => alive && setSession({ status: r.user ? 'authenticated' : 'anonymous', user: r.user }))
      .catch((e) =>
        alive &&
        setSession({ status: e instanceof ApiUnavailableError ? 'unavailable' : 'anonymous', user: null }),
      )
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  // Sans compte, l'essai gratuit est la seule voie.
  const visiteur = session.status === 'anonymous'
  const ouverte = session.status === 'authenticated' || visiteur
  useEffect(() => {
    if (visiteur) setVoie('demo')
  }, [visiteur])

  useEffect(() => {
    if (!ouverte) return undefined
    let alive = true
    // Un visiteur ne lit pas l'offre (/api/twin9/meta exige une session).
    Promise.all([loadPkg(callOpts), visiteur ? OFFRE_VISITEUR : fetchOffer(callOpts)])
      .then(([pkg, offer]) => {
        if (!alive) return
        setRes({ status: 'ready', pkg, offer, message: '' })
        setModel((m) => m || pkg.modeleCibleDefaut)
        setPayeur((p) => (p === '' ? choixParDefaut(offer?.payeurs) : p))
      })
      .catch((e) => alive && setRes({ status: 'error', pkg: null, offer: null, message: messageErreur(e) }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status])

  useEffect(() => {
    if (!ouverte) return undefined
    let alive = true
    setRef({ status: 'loading', doc: null, message: '' })
    // Par défaut, la dernière version publiée de RESPIRE, lue comme le menu la
    // montre : dans la base d'abord (S5).
    loadReferentiel(choix ? { id: choix.id, version: choix.version, ...callOpts } : { id: REFERENTIEL_PAR_DEFAUT, ...callOpts })
      .then(({ doc }) => alive && setRef({ status: 'ready', doc, message: '' }))
      .catch((e) => alive && setRef({ status: 'error', doc: null, message: messageErreur(e) }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, choix?.id, choix?.version])

  const modeles = res.offer?.modeles ?? {}
  const payeurs = listePayeurs(res.offer?.payeurs)
  const ecoles = payeurs.filter((p) => p.type === 'ecole')
  const quiPaie = payeurChoisi(payeurs, payeur)
  // plusieurs écoles : l'élève choisit avant de lancer sur crédits
  const payeurAChoisir = voie === 'credits' && ecoles.length > 1 && quiPaie === null
  // Mode simple : le modèle cible du paquet, même si un autre avait été choisi en mode expert.
  const modele = expert ? model : (res.pkg?.modeleCibleDefaut ?? model)
  const portfolioPret = portfolio.trim().length > 40
  const essai = voie === 'demo'
  // L'essai gratuit borne le portfolio comme l'Essayer borne son texte.
  const tropLongPourEssai = essai && portfolio.length > DEMO_TEXT_MAX_CHARS
  // Et il veut une feuille datée : sans elle, ses huit appels, payés sur le
  // dollar du jour, finiraient sur « aucune feuille datée » (le texte collé
  // dans l'Essayer n'en a pas).
  const sansFeuilleDatee = essai && !FEUILLE_DATEE.test(portfolio)
  const clePersoPrete = apiKey.trim() !== ''
  // Le référentiel que lit le moteur : le document choisi ; pour RESPIRE, la
  // structure de /meta tant qu'elle est celle de la version choisie.
  const moteurRef = useMemo(
    () => (res.status === 'ready' && ref.status === 'ready' ? referentielTwin6(ref.doc, res.offer.referentiel) : null),
    [res.status, res.offer, ref.status, ref.doc],
  )
  const nbPoles = moteurRef?.poles.length ?? 0
  const peutLancer =
    res.status === 'ready' &&
    moteurRef !== null &&
    nbPoles > 0 &&
    (essai || !!modele) &&
    portfolioPret &&
    !tropLongPourEssai &&
    !sansFeuilleDatee &&
    (voie !== 'cle_perso' || clePersoPrete) &&
    !payeurAChoisir &&
    run.status !== 'running'

  async function lancer() {
    if (!peutLancer || running.current) return
    // Garde-fou crédits (demande utilisateur) : ne lancer sur NOTRE clé que si le
    // solde prépayé couvre le poids du portfolio. Heuristique ~1 ko = 1 USD (le
    // coût réel est réconcilié après le run). Plus la réserve d'un appel, toute
    // la sortie du modèle (2026-10-21) : sans elle, un solde qui couvre le poids
    // mais pas la réserve finirait sur un refus au milieu du run, ses premiers
    // scans payés. Sur clé perso, aucun débit → pas de garde. Bloque AVANT tout
    // appel facturable, avec un message vers la recharge.
    if (voie === 'credits') {
      const poids = poidsEstimeUsd(portfolio)
      const reserve = reserveSortieUsd(modele, modeles)
      const requisMicro = Math.ceil((poids + reserve) * 1_000_000)
      // son école, quand elle paie pour lui : ce qu'elle peut encore payer ce mois-ci, jamais son crédit (ADR-013 §4)
      const parEcole = quiPaie?.type === 'ecole' && !quiPaie.soi
      const solde = restePour(quiPaie, res.offer)
      if (solde < requisMicro) {
        // Arrondis au centime supérieur : le montant affiché ne passe jamais sous le solde qui manque.
        const auCentime = (usd) => (Math.ceil(usd * 100 - 1e-9) / 100).toFixed(2)
        // seule une école recharge (ADR-013 §2 e) : à un autre compte, la page ne propose pas la recharge
        const issue = parEcole
          ? 'Demandez à votre école de relever le plafond qu’elle vous accorde, choisissez un modèle moins cher, ou ' +
            'utilisez votre propre clé API, dans ce navigateur.'
          : res.offer?.peut_acheter
            ? 'Rechargez votre crédit, choisissez un modèle moins cher ou utilisez votre propre clé API.'
            : 'Choisissez un modèle moins cher, ou utilisez votre propre clé API, dans ce navigateur : seules les ' +
              'écoles achètent des crédits.'
        setRun((r) => ({
          ...r,
          status: 'error',
          error:
            `${parEcole ? 'Ce que votre école peut encore payer pour vous ce mois-ci ne suffit pas' : 'Solde insuffisant'} ` +
            `pour ce portfolio avec ce modèle (~${auCentime(poids + reserve)} $ : ` +
            `${poids} $ estimés, et ${auCentime(reserve)} $ réservés le temps de chaque appel puis rendus ; ` +
            `${parEcole ? 'il vous reste' : 'solde'} ${(solde / 1_000_000).toFixed(2)} $). ${issue}`,
        }))
        return
      }
    }
    running.current = true
    const referentiel = moteurRef
    setRun({ status: 'running', done: 0, total: twin6CallsFor(referentiel), phase: 'scan-pole', doc: null, referentiel, cout: 0, error: '', voie, caracteres: 0 })
    // La réponse de chaque appel arrive en flux (relais, 2026-10-21) : ses caractères reçus.
    const onProgression = (caracteres) => setRun((r) => ({ ...r, caracteres }))
    try {
      let provider
      if (essai) {
        // Une preuve de travail par appel ; la première est résolue avant le premier scan.
        const demo = demoFactory({
          ...callOpts,
          onPhase: (phase) => phase === 'llm' && setRun((r) => ({ ...r, caracteres: 0 })),
          onProgression,
        })
        await demo.prime()
        provider = demo.provider
      } else if (voie === 'cle_perso') {
        // La clé saisie, ou celle mémorisée dans ce navigateur ; jamais envoyée à humanome (ADR-013).
        const key = apiKey.trim()
        if (memoriser) setLocalKey(OWN_KEY_PROVIDER, key, deps.keyStorage)
        provider = ownKeyFactory({ provider: OWN_KEY_PROVIDER, apiKey: key, ...callOpts })
      } else {
        provider = creditsFactory({
          onCout: (c) => setRun((r) => ({ ...r, cout: r.cout + (Number(c) || 0) })),
          onProgression,
          payeur: valeurPayeur(payeur),
          ...callOpts,
        })
      }

      // Les fiches du paquet pour les pôles qu'elles décrivent, sinon écrites depuis le document choisi.
      const fiches = fichesPourTwin6(ref.doc, res.pkg.templates.fiches)
      const out = await runEngine({
        portfolio,
        templates: { ...res.pkg.templates, fiches },
        referentiel,
        provider,
        // Le proxy de la démo impose son modèle : celui-ci n'est qu'une indication.
        model: essai ? DEMO_MODEL : modele,
        options: {
          // Chaque étape ouvre un appel : ses caractères repartent de zéro.
          onProgress: (p) =>
            setRun((r) => ({ ...r, done: p.done ?? r.done, total: p.total ?? r.total, phase: p.phase ?? r.phase, caracteres: 0 })),
          meta: {
            journalId: 'twin6-ouverte',
            sourceProtocole: `${res.pkg.id}@${res.pkg.version}`,
            generatedAt: horodatage(now()),
          },
          configuration: configurationDuRun({ pkg: res.pkg, doc: ref.doc, moteurRef: referentiel, fiches, voie }),
          // Les bornes de l'exécution, à la même horloge que generatedAt.
          now,
        },
      })
      setRun((r) => ({ ...r, status: 'done', doc: out.document, done: out.calls.length, total: out.calls.length }))
    } catch (e) {
      // Quota, budget du jour, démo coupée : les messages de l'Essayer — sauf,
      // pour un compte, l'invitation à en créer un. Les crédits offerts du
      // mois épuisés (sprint 7) : le message du serveur, qui nomme le 1er du
      // mois suivant, et pour un compte ses deux autres voies.
      const demo = essai ? describeDemoError(e) : null
      const error = !essai
        ? messageErreur(e)
        : demo.code === 'offerts_epuises'
          ? visiteur
            ? demo.message
            : `${demo.message} ${ESSAI_MOIS_COMPTE}`
          : demo.kind === 'unavailable' && !visiteur
            ? ESSAI_EPUISE_COMPTE
            : demo.message
      // Sur crédits, ce que le run a coûté jusqu'à l'erreur — un appel coupé compris, facturé pour ce qu'il a produit.
      setRun((r) => ({
        ...r,
        status: 'error',
        error: voie === 'credits' && r.cout > 0 ? `${error} (${formatUsd(r.cout)} débités pour ce run.)` : error,
      }))
    } finally {
      running.current = false
    }
  }

  // ---- Rendu ---------------------------------------------------------------
  if (session.status === 'loading') {
    return <section className="twin6-ouverte"><p role="status">Chargement…</p></section>
  }
  if (session.status === 'unavailable') {
    return (
      <section className="twin6-ouverte">
        <h1>Cartographie ouverte Twin6</h1>
        <p role="status">Cette fonctionnalité nécessite le serveur (indisponible sur cette copie statique).</p>
      </section>
    )
  }
  const resultatPret = run.status === 'done' && run.doc

  return (
    <section className="twin6-ouverte">
      <h1>Cartographie ouverte Twin6</h1>
      <p className="twin6-intro">
        Une cartographie de vos compétences <strong>open source</strong> : un scan par pôle du référentiel choisi
        (RESPIRE par défaut) puis une synthèse Kairos, sur votre portfolio entier. Gratuite avec votre propre clé
        API, ou avec nos crédits
        (+10 % de contribution au fonctionnement du site) ; à essayer gratuitement, même sans compte, sur{' '}
        {formatInt(DEMO_TEXT_MAX_CHARS)} caractères.{' '}
        <a href={TWIN6_PACKAGE_URL} download>
          Télécharger les prompts
        </a>{' '}
        (AGPL, réutilisables partout).
      </p>

      {res.status === 'loading' ? <p role="status">Chargement du protocole…</p> : null}
      {res.status === 'error' ? <p role="alert" className="twin6-erreur">{res.message}</p> : null}
      {res.status === 'ready' && ref.status === 'error' ? (
        <p role="alert" className="twin6-erreur">{ref.message}</p>
      ) : null}

      {res.status === 'ready' && !resultatPret ? (
        <div className="twin6-formulaire">
          {mesPortfolios.length > 0 ? (
            <div className="twin6-mes-portfolios">
              <label htmlFor="twin6-mes-portfolios">Partir d’un de mes portfolios</label>
              <select
                id="twin6-mes-portfolios"
                value={choixPortfolio}
                disabled={run.status === 'running'}
                onChange={(e) => reprendrePortfolio(e.target.value)}
              >
                <option value="">— choisir —</option>
                {mesPortfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titre}
                  </option>
                ))}
              </select>
              {reprise ? (
                <p className="twin6-hint" role="status" data-testid="twin6-reprise">
                  {reprise.journees === 0
                    ? `« ${reprise.titre} » n’a aucune journée datée : datez ses journées dans « Mon portfolio ».`
                    : `« ${reprise.titre} » : ${reprise.journees} journée${reprise.journees > 1 ? 's' : ''} datée${reprise.journees > 1 ? 's' : ''}, en feuilles ### AAAA-MM-JJ` +
                      (reprise.nonDates > 0
                        ? ` ; ${reprise.nonDates} passage${reprise.nonDates > 1 ? 's' : ''} non daté${reprise.nonDates > 1 ? 's' : ''} laissé${reprise.nonDates > 1 ? 's' : ''} de côté.`
                        : '.')}
                </p>
              ) : null}
            </div>
          ) : null}
          <label htmlFor="twin6-portfolio">Votre portfolio (structuré en feuilles <code>### AAAA-MM-JJ</code>)</label>
          <textarea
            id="twin6-portfolio"
            rows={10}
            value={portfolio}
            disabled={run.status === 'running'}
            onChange={(e) => setPortfolio(e.target.value)}
            placeholder={'### 2026-01-05\n---\nCe que j’ai fait, réfléchi, appris…'}
          />
          {essai ? (
            <p className="twin6-compteur" data-testid="twin6-compteur">
              {formatInt(portfolio.length)} / {formatInt(DEMO_TEXT_MAX_CHARS)} caractères (essai gratuit)
            </p>
          ) : null}
          {tropLongPourEssai ? (
            <p className="twin6-hint" role="status">
              Trop long pour l’essai gratuit : réduisez votre portfolio à {formatInt(DEMO_TEXT_MAX_CHARS)} caractères
              (retirez-en {formatInt(portfolio.length - DEMO_TEXT_MAX_CHARS)}).
            </p>
          ) : null}
          {portfolioPret && sansFeuilleDatee ? (
            <p className="twin6-hint" role="status">
              L’essai gratuit demande au moins une feuille datée : une ligne <code>### AAAA-MM-JJ</code> avant le texte
              de la journée.
            </p>
          ) : null}

          <div className="twin6-options">
            <ReferentielChoice
              value={choix}
              onChange={setChoix}
              disabled={run.status === 'running'}
              list={listReferentiels}
            />
            {essai ? null : !expert ? (
              <p className="twin6-hint" data-testid="twin6-modele-defaut">
                Modèle : <code>{modele}</code> (par défaut ; le mode expert, au bas du menu, en propose d’autres).
              </p>
            ) : (
              <>
                <label htmlFor="twin6-modele">Modèle</label>
                <select
                  id="twin6-modele"
                  value={model}
                  disabled={run.status === 'running'}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {Object.keys(modeles).map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          <fieldset className="twin6-voie" disabled={run.status === 'running'}>
            <legend>Comment payer l’usage du modèle ?</legend>
            {visiteur ? null : (
              <>
                <label>
                  <input type="radio" name="voie" value="credits" checked={voie === 'credits'} onChange={() => setVoie('credits')} />{' '}
                  {ecoles.some((e) => !e.soi)
                    ? 'Avec les crédits que paie mon école (le coût réel et sa surtaxe)'
                    : 'Avec nos crédits (+10 % de contribution)'}
                </label>
                <label>
                  <input type="radio" name="voie" value="cle_perso" checked={voie === 'cle_perso'} onChange={() => setVoie('cle_perso')} />{' '}
                  Avec ma propre clé API (gratuit — la clé reste dans mon navigateur)
                </label>
              </>
            )}
            <label>
              <input type="radio" name="voie" value="demo" checked={voie === 'demo'} onChange={() => setVoie('demo')} />{' '}
              Essai gratuit ({formatInt(DEMO_TEXT_MAX_CHARS)} caractères au plus, modèle de la démonstration)
            </label>
            {visiteur ? (
              <p className="twin6-hint">
                Avec un compte, sans limite de longueur : votre propre clé API ou nos crédits.{' '}
                <a href="#/compte">Connectez-vous</a>.
              </p>
            ) : null}
            {voie === 'credits' ? (
              <ChoixPayeur
                id="twin6-payeur"
                payeurs={payeurs}
                valeur={payeur}
                onChange={setPayeur}
                cle={quiPaie?.type === 'ecole' && quiPaie.cle ? 'ecole' : 'instance'}
                disabled={run.status === 'running'}
              />
            ) : null}
            {voie === 'credits' && creditEcoleBas(quiPaie, quiPaie?.cle ? 'ecole' : 'instance') ? (
              <p className="twin6-hint" data-testid="credit-ecole-bas">
                {CREDIT_ECOLE_BAS}
              </p>
            ) : null}
            {voie === 'cle_perso' ? (
              <div className="twin6-cleperso">
                <input
                  type="password"
                  aria-label="Clé API Anthropic"
                  placeholder="sk-ant-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
                <label>
                  <input type="checkbox" checked={memoriser} onChange={(e) => setMemoriser(e.target.checked)} />{' '}
                  Mémoriser la clé dans ce navigateur
                </label>
                <p className="twin6-hint" data-testid="cle-reste-navigateur">
                  {KEY_STAYS_IN_BROWSER}
                </p>
              </div>
            ) : null}
          </fieldset>

          {moteurRef !== null ? (
            <p className="twin6-note">
              {nbPoles + 1} appels au modèle ({nbPoles} pôle{nbPoles > 1 ? 's' : ''} + synthèse).{' '}
              {essai
                ? 'Essai gratuit : rien n’est débité ni conservé ; le budget du jour est commun à tous les essais.'
                : 'Le coût réel dépend de la taille de votre portfolio et du modèle. En crédits, seul le coût réel (+10 %) est débité.'}
            </p>
          ) : ref.status === 'loading' ? (
            <p role="status" className="twin6-note">Chargement du référentiel…</p>
          ) : null}

          <button type="button" className="twin6-lancer" disabled={!peutLancer} onClick={lancer}>
            {run.status === 'running' ? 'Analyse en cours…' : 'Lancer la cartographie ouverte'}
          </button>
          {!portfolioPret ? <p className="twin6-hint">Collez d’abord un portfolio (au moins quelques phrases).</p> : null}
          {run.status === 'error' ? <p role="alert" className="twin6-erreur">{run.error}</p> : null}
        </div>
      ) : null}

      {run.status === 'running' ? (
        <div className="twin6-progress" role="status">
          <p>
            Analyse en cours — étape {run.done}/{run.total} ({run.phase})
            {run.caracteres > 0 ? (
              <span data-testid="twin6-caracteres"> — {formatInt(run.caracteres)} caractères reçus</span>
            ) : null}
            {run.cout > 0 ? ` — ${formatUsd(run.cout)} débités jusqu’ici` : ''}
          </p>
          <progress value={run.done} max={run.total} />
        </div>
      ) : null}

      {resultatPret ? (
        <div className="twin6-resultat">
          <p className="twin6-succes" role="status">
            Cartographie ouverte terminée
            {run.voie === 'demo'
              ? ' (essai gratuit)'
              : run.cout > 0
                ? ` — ${formatUsd(run.cout)} de contribution`
                : ' (avec votre clé)'}
            .
          </p>
          <p className="twin6-resultat-actions">
            <button
              type="button"
              className="button"
              data-testid="twin6-export"
              onClick={() => downloadJson(run.doc, `cartographie-twin6-${run.doc?.journalId ?? run.doc?.source?.journal_id ?? 'ouverte'}.json`)}
            >
              Exporter le JSON
            </button>
          </p>
          <MergeView mergeDoc={run.doc} referentiel={run.referentiel} lib={lib} />
        </div>
      ) : null}
    </section>
  )
}
