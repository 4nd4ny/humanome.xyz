// Analyse approfondie Twin9 — #/twin9 et #/twin9/<id> (T9, plan du moteur PHP
// de Twin_v9, lot 2, « Lancer et suivre », « Lire les résultats »).
//
// Les runs tournent sur le serveur, par tranches (ADR-011). On lance un run
// avec un de ses profils (#/configuration) ou celui de la v9.8, sur un
// portfolio de sa bibliothèque ou un fichier, avec son accord : portfolio et
// état du run restent sur le serveur jusqu'à ce qu'on les efface. La page du
// run suit sa progression, lue dans son journal, et le fait avancer tant
// qu'elle est ouverte ; on l'annule, on le reprend, on choisit qui lit ses
// résultats, et on l'ouvre dans la cartographie, délibérations comprises.
// Son entrée de navigation, « Analyse approfondie », est revenue avec T11,
// qui a retiré le moteur du navigateur (nav.js).
//
// Avant de lancer (T10), l'accord donné, la page dit combien de journées le
// run instruirait — un portfolio déjà évalué n'instruit que ses journées
// nouvelles ou changées —, son coût estimé (en moyenne, au plus bas, au plus
// haut, d'après les évaluations passées de mêmes réglages, T8) et sa durée,
// les journées que le crédit ou le budget admet avec leur fusion (T8,
// stratégie A : les autres attendent une prochaine analyse), ou le refus, qui
// dit ce qu'il faudrait et ne laisse pas lancer ; les plafonds du profil. Un
// run arrêté par son budget reprend sous un nouveau budget, par son crédit
// une fois rechargé, avant sa fusion comme les autres ; sa carte, incomplète,
// s'ouvre dans la cartographie, qui le dit. Son attestation dit son admission.
// Depuis P0-1, sa configuration se lit à côté (twin9/ConfigurationDuRun.jsx) :
// fournisseur, voie, modèle et budget de sortie de chaque rôle, jeu de
// gabarits, référentiel, clé ; puis ses appels, pannes et sorties tronquées.
//
// L'accord nomme les fournisseurs auxquels le run envoie le texte, chacun avec
// sa voie et son étiquette RGPD (ADR-012) : la configuration les donne pour
// chaque profil, avant tout aperçu, puisque l'aperçu emporte déjà le
// portfolio. Il vaut pour cette liste : un profil qui en atteint d'autres le
// redemande. Le lancement l'envoie ({fournisseurs: [ids]}), et le serveur
// refuse une liste qui n'est pas celle du profil. Le texte envoyé ne porte
// jamais les marques d'un portfolio surligné par Twin9 (S3-3,
// lib/twin9/marques.js), qu'il vienne de la bibliothèque ou d'un fichier.
//
// Le moteur lit le référentiel du run (T16), et sa carte s'ouvre dans la
// cartographie avec lui (T17) : RESPIRE, ou celui d'une autre structure, dont
// le titre du jeu porte le nom.
//
// Depuis le sprint 4 (T0, journal de la cartographie D-73), Twin9 reçoit le
// portfolio découpé en les journées de l'interface (lib/twin9/portfolio-pour-twin9.js) :
// le découpage de la fiche du portfolio, ses fusions et dates corrigées à la
// main comprises, ou celui du site pour un fichier ; un en-tête que Twin9 ne
// lit pas reçoit `### AAAA-MM-JJ`, une date qu'il lirait au milieu d'une
// journée est neutralisée par « — ». L'aperçu et le lancement envoient ce même
// texte, et l'aperçu dit les journées dont le texte change pour Twin9.
//
// Mode d'affichage (sprint 1, lot 2 ; lib/ui-mode.js) : en mode simple, la
// page lance avec le profil v9.8, sans liste des profils ni « Régler mes
// profils » ; un profil choisi en mode expert ne part pas en mode simple. Le
// mode n'est jamais un droit : #/configuration reste ouverte par son adresse.
//
// Le référentiel se choisit au lancement (sprint 5, lot C) : par défaut celui
// du profil ; sinon un référentiel publié (sa dernière version), ou, en mode
// expert, un de ses brouillons pour un run d'essai. Le menu « Référentiel »
// est toujours proposé en mode expert ; en mode simple, dès que plus d'un
// référentiel est publié. Le serveur l'écrit dans la copie du profil, avant
// de l'admettre ; un autre référentiel retire les spécialistes que le profil
// impose au jury par pôle ou par compétence, et l'aperçu le dit.
//
// Qui paie (sprint 6, lot S6b — ADR-013 §4) : l'école de l'élève quand il en a
// une, sur son crédit ou sur sa clé, sous le plafond qu'elle lui accorde par
// mois ; son propre solde restant, s'il le choisit. Avec plusieurs écoles, il
// choisit (twin9/ChoixPayeur.jsx) ; la page dit que son école voit le montant,
// jamais le contenu. Un run que son école ne paie plus s'arrête, et sa reprise
// choisit de nouveau qui paie.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client.js'
import {
  annulerRun,
  apercuRun,
  avancerRuns,
  fetchConfiguration,
  fetchResultats,
  fetchRun,
  fetchRuns,
  fetchTwin9Meta,
  formatUsd,
  lancerRun,
  rendreRunVisible,
  reprendreRun,
} from '../api/twin9.js'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { twin9RunFiles } from '../lib/interface-handoff.js'
import { sansMarquesTwin9 } from '../lib/twin9/marques.js'
import { portfolioPourTwin9 } from '../lib/twin9/portfolio-pour-twin9.js'
import { formatShort } from '../carto/core/dates.js'
import { useUiMode } from '../lib/ui-mode.js'
import { libelleRgpd, libelleVoie } from './configuration/profilSchema.js'
import ConfigurationDuRun from './twin9/ConfigurationDuRun.jsx'
import ChoixPayeur from './twin9/ChoixPayeur.jsx'
import { choixParDefaut, listePayeurs, phrasePayeur, valeurPayeur } from '../lib/payeurs.js'
import '../styles/twin9.css'

const STATUTS = { en_cours: 'En cours', termine: 'Terminé', annule: 'Annulé', echoue: 'Arrêté' }

const pauseParDefaut = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Des dollars, à la française : « 2,26 $ ». */
const dollars = (usd) => `${Number(usd).toFixed(2).replace('.', ',')} $`

/** Une durée en secondes, lisible : « 45 s », « 12 min », « 2 h 05 ». */
function duree(s) {
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Les journées qu'un run instruirait : toutes au premier run, les nouvelles ou changées ensuite. */
function phraseJournees({ total, nouvelles, changees }) {
  const s = (k) => (k > 1 ? 's' : '')
  const n = nouvelles + changees
  if (nouvelles === total) return `${total} journée${s(total)} à instruire.`
  if (n === 0) return 'Ce portfolio a déjà été évalué : aucune journée nouvelle ni changée, seule la fusion se refait.'
  const quoi = [nouvelles ? `${nouvelles} nouvelle${s(nouvelles)}` : null, changees ? `${changees} changée${s(changees)}` : null]
    .filter(Boolean)
    .join(' et ')
  return `Ce portfolio a déjà été évalué : ${n} journée${s(n)} sur ${total} à instruire (${quoi}), les autres reprises telles quelles.`
}

/** Anthropic seul, sa voie inconnue : face à un serveur qui ne nomme pas les fournisseurs d'un profil, il n'en appelle pas d'autre. */
const ANTHROPIC = { id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', voie: null }

/** Les fournisseurs qu'atteint le profil choisi (GET twin9/configuration) : ceux que l'accord nomme. */
function fournisseursDuLancement(donnees, profil) {
  const liste = profil === '' ? donnees?.defautFournisseurs : donnees?.profils.find((p) => String(p.id) === profil)?.fournisseurs
  return Array.isArray(liste) && liste.length > 0 ? liste : [ANTHROPIC]
}

/**
 * Les référentiels qu'un lancement peut choisir (S5, lot C ; `referentiels` de GET twin9/configuration) : chaque
 * référentiel publié, sa dernière version (`version` nulle) ; en mode expert, ses brouillons, pour un run d'essai.
 * @returns {Array<{valeur: string, id: string, version: string|null, libelle: string}>}
 */
function choixReferentiels(referentiels, expert) {
  const options = []
  for (const r of Array.isArray(referentiels) ? referentiels : []) {
    const nom = r.label || r.id
    if (r.versions?.length > 0) options.push({ valeur: r.id, id: r.id, version: null, libelle: nom })
    if (expert) {
      for (const v of r.brouillons ?? []) {
        options.push({ valeur: `${r.id}@${v}`, id: r.id, version: v, libelle: `${nom} ${v} (brouillon, run d’essai)` })
      }
    }
  }
  return options
}

/** « Anthropic, OpenAI et Mistral AI ». */
function enumeration(noms) {
  return noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

/**
 * Ce que l'accord dit des fournisseurs : chacun, sa voie et son étiquette RGPD ;
 * le délai d'un lot chez Anthropic ; un fournisseur étiqueté « non ».
 */
function phraseFournisseurs(fournisseurs) {
  const nom = (f) => {
    const precisions = [f.voie ? libelleVoie(f.voie) : null, f.rgpd ? libelleRgpd(f.rgpd) : null].filter(Boolean)
    return precisions.length > 0 ? `${f.libelle} (${precisions.join(' ; ')})` : f.libelle
  }
  const phrases = [
    fournisseurs.length === 1
      ? `Le texte part chez ${nom(fournisseurs[0])}, le fournisseur du modèle.`
      : `Le texte part chez les fournisseurs des modèles de ce profil : ${enumeration(fournisseurs.map(nom))}.`,
  ]
  if (fournisseurs.some((f) => f.id === 'anthropic' && f.voie !== 'directe')) {
    phrases.push('Par lots, Anthropic garde le lot jusqu’à sa suppression, 29 jours au plus.')
  }
  const non = fournisseurs.filter((f) => f.rgpd === 'non').map((f) => f.libelle)
  if (non.length > 0) {
    phrases.push(
      `${enumeration(non)} ${non.length > 1 ? 'sont étiquetés' : 'est étiqueté'} « non » au regard du RGPD : à éviter pour ` +
        'les journaux d’élèves réels.',
    )
  }
  return phrases.join(' ')
}

/** Combien de dates une phrase nomme avant de dire « et N autres ». */
const DATES_NOMMEES = 6

/**
 * Ce que l'envoi change au texte (sprint 4, T0) : les journées retouchées pour que Twin9 y lise celles de
 * l'interface, nommées ; les passages sans date, en tête, qu'il ne lit pas. Vide quand rien ne change.
 */
function phraseRetouche({ retouchees, sansDate }) {
  const s = (n) => (n > 1 ? 's' : '')
  const phrases = []
  const n = retouchees.length
  if (n > 0) {
    const noms = retouchees.slice(0, DATES_NOMMEES).map((d) => formatShort(d, { weekday: false }))
    const reste = n - noms.length
    const liste = reste > 0 ? `${noms.join(', ')} et ${reste} autre${s(reste)}` : enumeration(noms)
    phrases.push(
      `Pour que Twin9 y lise vos journées, le texte envoyé est retouché (un en-tête de date ajouté, une date ` +
        `neutralisée par « — ») : ${n} journée${s(n)} touchée${s(n)}, ${liste}.`,
    )
  }
  if (sansDate > 0) {
    phrases.push(
      sansDate > 1
        ? `Les ${sansDate} passages sans date, en tête du texte envoyé, ne sont pas lus par Twin9.`
        : 'Le passage sans date, en tête du texte envoyé, n’est pas lu par Twin9.',
    )
  }
  return phrases.join(' ')
}

/** Une journée de Twin9 par son identifiant : « 3 févr. 2026 », « 3 févr. 2026 (2e entrée) » pour « 2026-02-03_b ». */
function nomDeJournee(id) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:_([b-z]))?$/.exec(id)
  const date = m ? formatShort(m[1], { weekday: false }) : '—'
  if (date === '—') return id
  return m[2] ? `${date} (${m[2].charCodeAt(0) - 96}e entrée)` : date
}

/**
 * Les journées que Twin9 lisait dans le texte d'origine et qu'il ne lit plus dans le texte envoyé (sprint 4, T0) :
 * la carte est additive, une journée de sa mémoire absente du portfolio y reste, et sa fusion la compte encore, avec
 * le même passage dans la journée qui l'a reçu. Celles que la mémoire de la carte garde, quand l'aperçu la dit
 * (`memoire`) ; sinon toutes, au conditionnel. Vide quand il n'y en a pas.
 */
function phraseDisparues(disparues, memoire) {
  const connue = Array.isArray(memoire)
  const jours = connue ? disparues.filter((id) => memoire.includes(id)) : disparues
  const n = jours.length
  if (n === 0) return ''
  const noms = jours.slice(0, DATES_NOMMEES).map(nomDeJournee)
  const reste = n - noms.length
  const liste = reste > 0 ? `${noms.join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}` : enumeration(noms)
  const lues =
    n > 1
      ? `Twin9 lisait dans ce texte ${n} journées qu’il n’y lit plus : ${liste}.`
      : `Twin9 lisait dans ce texte une journée qu’il n’y lit plus : ${liste}.`
  const suite =
    n > 1
      ? connue
        ? 'Lues par un run précédent, elles restent dans la mémoire de la carte, et sa fusion les compte encore.'
        : 'Si un run précédent les a lues, elles restent dans la mémoire de la carte, et sa fusion les compte encore.'
      : connue
        ? 'Lue par un run précédent, elle reste dans la mémoire de la carte, et sa fusion la compte encore.'
        : 'Si un run précédent l’a lue, elle reste dans la mémoire de la carte, et sa fusion la compte encore.'
  return `${lues} ${suite}`
}

/**
 * À moins de deux journées datées dans l'interface, le texte part tel quel (sprint 4, T0) : les journées que Twin9 y
 * lit pourtant et que l'interface n'a pas (des titres datés d'autres jours), et celle de l'interface qu'il n'y lit pas
 * (avant son premier titre daté). Vide quand Twin9 y lit les journées de l'interface, ou rien de daté.
 */
function phraseEcart({ autres = [], nonLues = [] }) {
  if (autres.length === 0 && nonLues.length === 0) return ''
  const liste = (jours) => {
    const noms = jours.slice(0, DATES_NOMMEES).map(nomDeJournee)
    const reste = jours.length - noms.length
    return reste > 0 ? `${noms.join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}` : enumeration(noms)
  }
  const parties = []
  if (autres.length > 0) {
    parties.push(
      `Twin9 lit dans ce texte ${autres.length > 1 ? `${autres.length} journées` : 'une journée'} que l’interface n’a pas : ` +
        liste(autres),
    )
  }
  if (nonLues.length > 0) {
    const quoi = nonLues.length > 1 ? `les vôtres, des ${liste(nonLues)}` : `la vôtre, du ${liste(nonLues)}`
    parties.push(`${parties.length > 0 ? 'et ' : 'Twin9 '}ne lit pas ${quoi}`)
  }
  return `${parties.join(', ')}. Le texte part tel quel : à moins de deux journées datées, il n’est pas retouché.`
}

/** Les spécialistes qu'un autre référentiel retire au jury du profil (S5, lot C) : vide quand il n'en retire aucun. */
function phraseJury(retires) {
  const par = [
    retires.includes('specialistes') ? 'par pôle' : null,
    retires.includes('par_competence') ? 'par compétence' : null,
  ].filter(Boolean)
  return par.length === 0
    ? ''
    : `Les spécialistes que ce profil impose au jury ${par.join(' et ')} valent pour son référentiel : ils sont retirés ` +
        'pour celui-ci, et le jury garde ses sièges par défaut.'
}

/**
 * Avant de lancer : le référentiel lu (S5, lot C) ; les journées à instruire ; le coût estimé, en moyenne, au plus bas
 * et au plus haut, et la durée ; celles que le crédit ou le budget admet avec leur fusion (T8), ou le refus, qui dit ce
 * qu'il faudrait ; les plafonds ; ce que l'envoi change au texte, et les journées que Twin9 n'y lit plus que la carte
 * garde (sprint 4, T0).
 */
/** Son propre solde restant, parmi les payeurs possibles : un refus de son école peut le lui proposer. */
function soldeRestant(payeurs) {
  return listePayeurs(payeurs).some((p) => p.type === 'personnel' && Number(p.solde_microusd ?? 0) > 0)
}

function Apercu({ apercu, envoi }) {
  const e = apercu.estimation
  const a = apercu.admission
  const source =
    e.evaluations != null
      ? `d’après ${e.evaluations > 1 ? `${e.evaluations} évaluations passées` : 'une évaluation passée'} de mêmes réglages`
      : `d’après le vrai run de PLANT-01, en essai${e.poles > 1 ? `, × ${e.poles} pôles` : ''}`
  const cout =
    dollars(e.min_usd) === dollars(e.max_usd)
      ? dollars(e.cout_usd)
      : `${dollars(e.cout_usd)} en moyenne, de ${dollars(e.min_usd)} à ${dollars(e.max_usd)}`
  // par lots, la durée est celle d'Anthropic, même quand d'autres appels partent en direct (P1-5)
  const voies = Array.isArray(apercu.fournisseurs) ? apercu.fournisseurs.map((f) => f.voie) : [apercu.voie]
  const parLots = voies.some((v) => v === 'lots' || v === 'mixte')
  const temps =
    e.duree_s != null
      ? ` · durée estimée : ${duree(e.duree_s)}`
      : parLots
        ? voies.some((v) => v !== 'lots')
          ? ' · en partie par lots, la durée dépend d’Anthropic'
          : ' · par lots, la durée dépend d’Anthropic'
        : ''
  const { budget_usd: budget, duree_minutes: minutes } = apercu.plafonds
  const s = (n) => (n > 1 ? 's' : '')
  const retouche = envoi ? phraseRetouche(envoi) : ''
  const disparues = envoi?.disparues ? phraseDisparues(envoi.disparues, apercu.memoire) : ''
  const ecart = envoi ? phraseEcart(envoi) : ''
  const ref = apercu.referentiel
  const jury = Array.isArray(apercu.jury_retire) ? phraseJury(apercu.jury_retire) : ''
  // qui paie (ADR-013 §4) : son école voit le montant ; un refus ne propose la recharge que de son propre crédit
  const ecole = apercu.payeur?.type === 'ecole'
  const payePar = phrasePayeur(apercu.payeur)
  const sujet =
    a?.limite === 'budget'
      ? 'Le budget du profil'
      : a?.limite === 'plafond'
        ? 'Le plafond que votre école vous accorde ce mois-ci'
        : ecole
          ? 'Le crédit de votre école'
          : 'Votre crédit'
  return (
    <section className="twin9-apercu" aria-label="Avant de lancer">
      {payePar ? <p data-testid="apercu-payeur">{payePar}</p> : null}
      {apercu.cle === 'ecole' ? (
        <p data-testid="apercu-cle-ecole">
          L’analyse part avec la clé Anthropic de votre école : votre école paie Anthropic, et peut relire dans sa
          Console Anthropic les résultats des appels partis par lots.
        </p>
      ) : null}
      {ref?.id ? (
        <p>
          Référentiel lu : {ref.label || ref.id}
          {ref.version ? `, version ${ref.version}` : ''}.{jury ? ` ${jury}` : ''}
        </p>
      ) : null}
      <p>{phraseJournees(apercu.journees)}</p>
      {retouche ? <p>{retouche}</p> : null}
      {disparues ? <p>{disparues}</p> : null}
      {ecart ? <p>{ecart}</p> : null}
      {a?.refus ? (
        <p role="alert">
          {a.refus}.{a.limite === 'credit' && !ecole ? <> <a href="#/compte/credit">Recharger</a></> : null}
          {ecole && (a.limite === 'plafond' || a.limite === 'credit') && soldeRestant(apercu.payeurs)
            ? ' Vous pouvez aussi choisir « Mon solde restant » dans « Qui paie ».'
            : null}
        </p>
      ) : (
        <>
          {a?.en_attente > 0 ? (
            <p>
              {sujet}
              {a.limite === 'credit' && a.autres_usd > 0 ? `, déduits les ${dollars(a.autres_usd)} que vos analyses en cours peuvent encore dépenser,` : ''}{' '}
              couvre {a.instruites} des {a.instruites + a.en_attente} journées à instruire, avec leur fusion,{' '}
              {e.evaluations != null ? 'au coût le plus haut observé' : 'd’après le run de référence'}, réserves des appels comprises.{' '}
              {a.en_attente > 1 ? `Les ${a.en_attente} autres attendront` : 'L’autre attendra'} une prochaine analyse
              {a.changees_en_attente > 0
                ? ` ; d’ici là, la carte garde la version déjà évaluée de${a.changees_en_attente > 1 ? `s ${a.changees_en_attente} journées changées` : ' la journée changée'}`
                : ''}
              .
            </p>
          ) : null}
          <p>
            Coût estimé{a?.en_attente > 0 ? ` (${a.instruites} journée${s(a.instruites)})` : ''} : {cout}
            {temps} ({source}).
          </p>
        </>
      )}
      {budget != null || minutes != null ? (
        <p>
          Plafonds du profil : {[budget != null ? `budget ${dollars(budget)}` : null, minutes != null ? `durée ${minutes} min` : null].filter(Boolean).join(' · ')}.
        </p>
      ) : null}
    </section>
  )
}

/** Ce qu'un run a pris à son lancement (T8) : les journées qu'il instruit, celles laissées à une prochaine analyse. */
function phraseAdmission({ instruites = 0, en_attente: attente = 0 }) {
  const s = (n) => (n > 1 ? 's' : '')
  const prises = `${instruites} journée${s(instruites)} à instruire`
  return attente > 0 ? `${prises} ; ${attente} laissée${s(attente)} à une prochaine analyse` : prises
}

/** Le nom d'un portfolio de la bibliothèque, en fichier : son titre nomme sa carte d'un run à l'autre. */
function nomDeFichier(titre) {
  const base = String(titre ?? '').trim().replace(/[\\/\x00-\x1f]+/g, '-') || 'portfolio'
  return /\.(md|txt)$/i.test(base) ? base : `${base}.md`
}

function Connexion() {
  return (
    <p>
      <a href="#/compte">Connectez-vous</a> pour lancer une analyse approfondie.
    </p>
  )
}

/**
 * @param {{section?: string|null, deps?: {fetchFn?: typeof fetch, store?: object, pause?: (ms: number) => Promise<void>,
 *   navigate?: (hash: string) => void, getReferentiel?: () => Promise<object>},
 *   onOpenInInterface?: (files: Array<{path: string, text: string}>, opts?: {title?: string}) => void}} props
 */
export default function Twin9View({ section = null, deps = {}, onOpenInInterface }) {
  const id = /^\d+$/.test(String(section ?? '')) ? Number(section) : null
  return (
    <section className="admin config twin9">
      <h2>Analyse approfondie</h2>
      {id === null ? <Lancer deps={deps} /> : <PageDuRun id={id} deps={deps} onOpenInInterface={onOpenInInterface} />}
    </section>
  )
}

function Lancer({ deps }) {
  const { fetchFn } = deps
  // Mode d'affichage (défaut du contexte : expert, la liste des profils est proposée).
  const { expert } = useUiMode()
  const navigate = deps.navigate ?? ((hash) => (window.location.hash = hash))
  const [etat, setEtat] = useState({ chargement: true })
  const [donnees, setDonnees] = useState(null)
  const [portfolio, setPortfolio] = useState('')
  const [fichier, setFichier] = useState(null)
  const [profil, setProfil] = useState('')
  // le référentiel choisi au lancement (S5, lot C) : '' pour celui du profil
  const [referentiel, setReferentiel] = useState('')
  const [visible, setVisible] = useState(false)
  // l'accord, donné pour une liste de fournisseurs et de voies : la clé de cette liste, null sans accord
  const [accord, setAccord] = useState(null)
  // qui paie (ADR-013 §4) : les payeurs possibles du compte, et le choix ('' : le défaut du serveur)
  const [payeurs, setPayeurs] = useState([])
  const [payeur, setPayeur] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)
  // en mode simple, le profil v9.8 : un profil choisi en mode expert ne part pas (S1, lot 2)
  const profilEffectif = expert ? profil : ''

  useEffect(() => {
    let actif = true
    const store = deps.store ?? createPortfolioStore()
    Promise.all([fetchRuns({ fetchFn }), fetchConfiguration({ fetchFn }), store.list().catch(() => [])])
      .then(([runs, config, portfolios]) => {
        if (!actif) return
        setDonnees({
          ...runs,
          profils: config.profils,
          defautFournisseurs: config.defaut_fournisseurs ?? null,
          referentiels: config.referentiels ?? [],
          defautReferentiel: config.defaut?.referentiel ?? null,
          portfolios,
        })
        setPortfolio(portfolios[0]?.id ?? 'fichier')
        setEtat({})
      })
      .catch((e) => actif && setEtat({ erreur: e }))
    // les payeurs possibles, à part : sans eux, le serveur choisit (son école quand il n'en a qu'une)
    fetchTwin9Meta({ fetchFn })
      .then((meta) => {
        if (!actif) return
        const liste = listePayeurs(meta?.payeurs)
        setPayeurs(liste)
        setPayeur((p) => (p === '' ? choixParDefaut(liste) : p))
      })
      .catch(() => {})
    return () => {
      actif = false
    }
  }, [fetchFn, deps.store])

  // L'accord vaut pour les fournisseurs qu'il nomme : un profil qui en atteint d'autres, ou par une autre voie, le redemande.
  const fournisseurs = fournisseursDuLancement(donnees, profilEffectif)
  const cleAccord = JSON.stringify(fournisseurs.map((f) => [f.id, f.voie]))
  const accorde = accord !== null && accord === cleAccord
  // un accord donné pour d'autres fournisseurs tombe : revenir à leur profil le redemande
  useEffect(() => {
    if (accord !== null && accord !== cleAccord) setAccord(null)
  }, [accord, cleAccord])

  // Le référentiel (S5, lot C) : celui du profil, ou un autre ; en mode simple, ni brouillon ni menu tant qu'un seul
  // référentiel est publié. Celui du profil, à sa version (figée ou la dernière), est « Celui du profil » : il n'est
  // pas proposé une seconde fois, où il lirait la dernière version publiée (ses brouillons, oui). Un choix que le menu
  // ne propose plus (un brouillon en mode simple, le référentiel du profil choisi) retombe sur le profil.
  const tousLesReferentiels = choixReferentiels(donnees?.referentiels, expert)
  const publies = tousLesReferentiels.filter((o) => o.version === null).length
  const menuReferentiel = expert ? tousLesReferentiels.length > 0 : publies > 1
  const duProfil =
    profilEffectif === '' ? donnees?.defautReferentiel : donnees?.profils.find((p) => String(p.id) === profilEffectif)?.referentiel
  const optionsReferentiel = tousLesReferentiels.filter((o) => !(o.version === null && o.id === duProfil?.id))
  const referentielChoisi = menuReferentiel ? (optionsReferentiel.find((o) => o.valeur === referentiel) ?? null) : null
  const choixRef = referentielChoisi ? { id: referentielChoisi.id, version: referentielChoisi.version } : null
  const cleReferentiel = referentielChoisi?.valeur ?? ''
  const nomDuProfil = duProfil?.id
    ? `${tousLesReferentiels.find((o) => o.id === duProfil.id && o.version === null)?.libelle ?? duProfil.id}` +
      (duProfil.version ? `, version ${duProfil.version}` : '')
    : null

  // Avant de lancer, l'accord donné : ce que le run instruirait, et ce qu'il coûterait.
  const local = donnees?.portfolios.find((p) => p.id === portfolio) ?? null
  // le texte analysé ne porte jamais les marques d'un portfolio surligné (S3-3), d'où qu'il vienne
  const choisi = local ? { nom: nomDeFichier(local.titre), texte: sansMarquesTwin9(local.texte) } : fichier
  // Twin9 reçoit les journées de l'interface (sprint 4, T0) : celles de la fiche, sinon celles du site.
  const texteChoisi = choisi?.texte ?? ''
  const segmentsLocaux = local?.segments
  const envoi = useMemo(() => portfolioPourTwin9(texteChoisi, { segments: segmentsLocaux }), [texteChoisi, segmentsLocaux])
  const [apercu, setApercu] = useState(null)
  const nom = choisi?.nom ?? null
  const texte = envoi.texte
  useEffect(() => {
    if (!accorde || nom === null || texte.trim() === '') {
      setApercu(null)
      return undefined
    }
    let actif = true
    setApercu({ chargement: true })
    const [id, version] = cleReferentiel === '' ? [] : [cleReferentiel.split('@')[0], cleReferentiel.split('@')[1] ?? null]
    const quiPaie = valeurPayeur(payeur)
    apercuRun(
      {
        profil: profilEffectif === '' ? null : Number(profilEffectif),
        portfolio: { nom, texte },
        ...(id ? { referentiel: { id, version } } : {}),
        ...(quiPaie !== null ? { payeur: quiPaie } : {}),
      },
      { fetchFn },
    )
      .then((a) => actif && setApercu({ donnees: a }))
      .catch((e) => actif && setApercu({ erreur: e.message }))
    return () => {
      actif = false
    }
  }, [accorde, profilEffectif, cleReferentiel, nom, texte, fetchFn, payeur])

  if (etat.chargement) return <p>Chargement…</p>
  if (etat.erreur) {
    return etat.erreur instanceof ApiError && etat.erreur.status === 401 ? (
      <Connexion />
    ) : (
      <p className="load-error" role="alert">
        {etat.erreur.message}
      </p>
    )
  }

  // refusé d'avance (T8) : le crédit ou le budget ne couvre pas même une journée et sa fusion
  const pret = accorde && choisi !== null && choisi.texte.trim() !== '' && !occupe && !apercu?.donnees?.admission?.refus

  const lancer = async (e) => {
    e.preventDefault()
    setOccupe(true)
    setErreur(null)
    const quiPaie = valeurPayeur(payeur)
    try {
      const run = await lancerRun(
        {
          profil: profilEffectif === '' ? null : Number(profilEffectif),
          portfolio: { nom: choisi.nom, texte: envoi.texte },
          accord: { fournisseurs: fournisseurs.map((f) => f.id) },
          visibilite: visible ? 'cartographe' : 'privee',
          ...(choixRef ? { referentiel: choixRef } : {}),
          ...(quiPaie !== null ? { payeur: quiPaie } : {}),
        },
        { fetchFn },
      )
      navigate(`#/twin9/${run.id}`)
    } catch (err) {
      setErreur(err.message)
      setOccupe(false)
    }
  }

  const lireFichier = (f) => {
    if (!f) return setFichier(null)
    f.text().then((texte) => setFichier({ nom: f.name, texte: sansMarquesTwin9(texte) }))
  }

  return (
    <>
      {donnees.disponible ? (
        <form className="twin9-lancer" onSubmit={lancer} noValidate>
          <h3>Lancer une analyse</h3>
          {expert ? (
            <div className="config-champ">
              <label htmlFor="twin9-profil">Profil</label>
              <div className="config-commande">
                <select id="twin9-profil" value={profil} onChange={(e) => setProfil(e.target.value)}>
                  <option value="">Profil v9.8</option>
                  {donnees.profils.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>{' '}
                <a href="#/configuration">Régler mes profils</a>
              </div>
            </div>
          ) : (
            <p className="privacy-note" data-testid="twin9-profil-simple">
              Profil : Profil v9.8. Le mode expert, au bas du menu, propose vos profils et leurs réglages.
            </p>
          )}
          {menuReferentiel ? (
            <div className="config-champ">
              <label htmlFor="twin9-referentiel">Référentiel</label>
              <div className="config-commande">
                <select id="twin9-referentiel" value={cleReferentiel} onChange={(e) => setReferentiel(e.target.value)}>
                  <option value="">{nomDuProfil ? `Celui du profil (${nomDuProfil})` : 'Celui du profil'}</option>
                  {optionsReferentiel.map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <div className="config-champ">
            <label htmlFor="twin9-portfolio">Portfolio</label>
            <div className="config-commande">
              {donnees.portfolios.length > 0 ? (
                <select id="twin9-portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
                  {donnees.portfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titre}
                    </option>
                  ))}
                  <option value="fichier">Un fichier…</option>
                </select>
              ) : null}
              {portfolio === 'fichier' ? (
                <input
                  type="file"
                  aria-label="Fichier du portfolio"
                  accept=".md,.txt,text/markdown,text/plain"
                  onChange={(e) => lireFichier(e.target.files?.[0])}
                />
              ) : null}
            </div>
          </div>
          <ChoixPayeur
            id="twin9-payeur"
            payeurs={payeurs}
            valeur={payeur}
            onChange={setPayeur}
            cle={apercu?.donnees?.cle ?? 'instance'}
          />
          <label className="twin9-case">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Mon cartographe peut
            lire les résultats
          </label>
          <fieldset className="twin9-accord">
            <legend>Accord</legend>
            <label className="twin9-case">
              <input type="checkbox" checked={accorde} onChange={(e) => setAccord(e.target.checked ? cleAccord : null)} /> J’accepte
              que mon portfolio et l’état de l’analyse restent sur le serveur humanome.xyz jusqu’à ce que je les efface.{' '}
              {phraseFournisseurs(fournisseurs)} Voir la <a href="#/confidentialite">politique de confidentialité</a>.
            </label>
          </fieldset>
          {apercu?.donnees ? <Apercu apercu={apercu.donnees} envoi={envoi} /> : null}
          {apercu?.chargement ? <p>Estimation…</p> : null}
          {apercu?.erreur ? (
            <p className="load-error" role="alert">
              {apercu.erreur}
            </p>
          ) : null}
          {erreur ? (
            <p className="load-error" role="alert">
              {erreur}
            </p>
          ) : null}
          <button type="submit" disabled={!pret}>
            Lancer l’analyse
          </button>
        </form>
      ) : (
        <p role="status">L’analyse approfondie n’est pas disponible sur cette instance.</p>
      )}
      {donnees.runs.length > 0 ? (
        <section className="twin9-runs">
          <h3>Mes analyses</h3>
          <ul>
            {donnees.runs.map((r) => (
              <li key={r.id}>
                <a href={`#/twin9/${r.id}`}>{r.journal}</a> · {String(r.created_at).slice(0, 10)}
                {r.profil ? ` · ${r.profil}` : ''}
                {r.mode === 'test' ? ' · essai' : ''} · {STATUTS[r.statut] ?? r.statut}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function PageDuRun({ id, deps, onOpenInInterface }) {
  const { fetchFn } = deps
  const pause = deps.pause ?? pauseParDefaut
  const [run, setRun] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const [relance, setRelance] = useState(0)
  const [budget, setBudget] = useState('')
  // sa reprise choisit de nouveau qui paie quand son école ne le paie plus (ADR-013 §4)
  const [payeursReprise, setPayeursReprise] = useState(null)
  const [payeurReprise, setPayeurReprise] = useState('')

  // Tant que la page est ouverte, elle fait avancer les runs de la personne (ADR-011 §2).
  useEffect(() => {
    let actif = true
    async function suivre() {
      let r = await fetchRun(id, { fetchFn })
      if (!actif) return
      setRun(r)
      while (actif && r.statut === 'en_cours') {
        const a = await avancerRuns({ fetchFn }).catch(() => ({ avance: false }))
        if (!actif) return
        r = await fetchRun(id, { fetchFn })
        if (!actif) return
        setRun(r)
        if (r.statut !== 'en_cours') break
        await pause(a.avance ? 300 : 3000)
      }
    }
    suivre().catch((e) => actif && setErreur(e))
    return () => {
      actif = false
    }
  }, [id, fetchFn, pause, relance])

  // arrêté parce que son école ne le paie plus, ou au plafond qu'elle lui accorde : les payeurs possibles, pour sa reprise
  const attenteEcole =
    run?.statut === 'echoue' &&
    /^(votre école ne paie plus|plafond de votre école|crédit de votre école)/.test(String(run?.attente ?? ''))
  useEffect(() => {
    if (!attenteEcole || payeursReprise !== null) return undefined
    let actif = true
    fetchTwin9Meta({ fetchFn })
      .then((meta) => {
        if (!actif) return
        const liste = listePayeurs(meta?.payeurs)
        setPayeursReprise(liste)
        setPayeurReprise(choixParDefaut(liste))
      })
      .catch(() => actif && setPayeursReprise([]))
    return () => {
      actif = false
    }
  }, [attenteEcole, payeursReprise, fetchFn])

  const agir = useCallback(
    async (action) => {
      setOccupe(true)
      setErreur(null)
      try {
        const r = await action()
        setRun(r)
        if (r.statut === 'en_cours') setRelance((n) => n + 1)
      } catch (e) {
        setErreur(e)
      } finally {
        setOccupe(false)
      }
    },
    [],
  )

  const ouvrir = async () => {
    setOccupe(true)
    setErreur(null)
    try {
      const resultats = await fetchResultats(id, { fetchFn })
      const files = await twin9RunFiles(resultats, deps.getReferentiel ? { getReferentiel: deps.getReferentiel } : undefined)
      const incomplete = resultats.run.statut !== 'termine'
      const label = resultats.referentiel?.label ? ` · ${resultats.referentiel.label}` : ''
      onOpenInInterface?.(files, { title: `Twin9 · ${resultats.run.journal}${label}${incomplete ? ' — carte incomplète' : ''}` })
    } catch (e) {
      setErreur(e)
    } finally {
      setOccupe(false)
    }
  }

  if (erreur instanceof ApiError && erreur.status === 401) return <Connexion />
  if (run === null) {
    return erreur ? (
      <p className="load-error" role="alert">
        {erreur.message}
      </p>
    ) : (
      <p>Chargement…</p>
    )
  }

  const p = run.progression
  // un run fini ne garde de son journal que ses compteurs
  const appels = run.compteurs
    ? { repondu: run.compteurs.appels - run.compteurs.pannes, panne: run.compteurs.pannes, envoye: 0, attente: 0 }
    : p.appels
  const enCours = appels.envoye + appels.attente
  const cout = run.cout ?? null
  // arrêté par son budget, il reprend sous un nouveau (vide : aucun) ; par le crédit, une fois rechargé
  const parBudget = run.statut === 'echoue' && String(run.attente ?? '').startsWith('budget atteint')
  const parCredit = run.statut === 'echoue' && String(run.attente ?? '').startsWith('crédit insuffisant')
  // son école ne le paie plus, ou son plafond du mois est atteint : sa reprise choisit qui paie
  const parEcole = attenteEcole
  const depenseUsd = (cout?.depense_microusd ?? 0) / 1_000_000
  const budgetValide = budget === '' || Number(budget) > depenseUsd
  // une carte à ouvrir : sa fusion faite, ou des journées finies d'un run arrêté
  const carte = p.fusion || (run.statut !== 'en_cours' && p.journees > 0)
  return (
    <article className="twin9-run">
      <p>
        <a href="#/twin9">Mes analyses</a>
      </p>
      <h3>{run.journal}</h3>
      <p role="status" className="twin9-statut">
        <strong>{STATUTS[run.statut] ?? run.statut}</strong>
        {run.retard ? ` — ${run.retard}` : ''}
      </p>
      <ul className="twin9-progression">
        <li>
          {p.journees} journée{p.journees > 1 ? 's' : ''} finie{p.journees > 1 ? 's' : ''}
          {p.fusion ? ' · fusion faite' : ''}
        </li>
        <li>
          Appels : {appels.repondu} répondu{appels.repondu > 1 ? 's' : ''}
          {enCours > 0 ? ` · ${enCours} en cours` : ''}
          {appels.panne > 0 ? ` · ${appels.panne} en panne` : ''}
        </li>
        {p.lots > 0 ? <li>{p.lots} lot{p.lots > 1 ? 's' : ''} chez Anthropic</li> : null}
        {run.payeur?.type === 'ecole' ? (
          <li data-testid="run-payeur">
            Payé par votre école{run.payeur.nom ? `, ${run.payeur.nom}` : ''} : elle voit le montant, jamais le contenu
          </li>
        ) : null}
        {cout && (cout.depense_microusd > 0 || cout.budget_usd != null) ? (
          <li>
            Coût : {formatUsd(cout.depense_microusd)}
            {cout.budget_usd != null ? ` · budget : ${dollars(cout.budget_usd)}` : ''}
          </li>
        ) : null}
      </ul>
      {erreur ? (
        <p className="load-error" role="alert">
          {erreur.message}
        </p>
      ) : null}
      <div className="config-actions">
        {run.statut === 'en_cours' ? (
          <button type="button" disabled={occupe} onClick={() => agir(() => annulerRun(id, { fetchFn }))}>
            Annuler
          </button>
        ) : null}
        {parBudget ? (
          <label className="twin9-budget">
            Nouveau budget (USD){' '}
            <input
              type="number"
              min={depenseUsd}
              step="0.01"
              placeholder="aucun"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
        ) : null}
        {parEcole && payeursReprise !== null ? (
          <ChoixPayeur
            id="twin9-payeur-reprise"
            payeurs={payeursReprise}
            valeur={payeurReprise}
            onChange={setPayeurReprise}
            disabled={occupe}
          />
        ) : null}
        {run.statut === 'annule' || run.statut === 'echoue' ? (
          <button
            type="button"
            disabled={
              occupe ||
              (parBudget && !budgetValide) ||
              (parEcole && payeursReprise !== null && listePayeurs(payeursReprise).length > 1 && valeurPayeur(payeurReprise) === null)
            }
            onClick={() => {
              const quiPaie = parEcole ? valeurPayeur(payeurReprise) : null
              const corps = {
                ...(parBudget ? { budget_usd: budget === '' ? null : Number(budget) } : {}),
                ...(quiPaie !== null ? { payeur: quiPaie } : {}),
              }
              agir(() => reprendreRun(id, { fetchFn }, Object.keys(corps).length > 0 ? corps : undefined))
            }}
          >
            Reprendre
          </button>
        ) : null}
        {parCredit ? <a href="#/compte/credit">Recharger mon crédit</a> : null}
        {carte ? (
          <button type="button" className="twin9-ouvrir" disabled={occupe} onClick={ouvrir}>
            Ouvrir dans la cartographie
          </button>
        ) : null}
      </div>
      <label className="twin9-case">
        <input
          type="checkbox"
          checked={run.visibilite === 'cartographe'}
          disabled={occupe}
          onChange={(e) => agir(() => rendreRunVisible(id, e.target.checked ? 'cartographe' : 'privee', { fetchFn }))}
        />{' '}
        Mon cartographe peut lire les résultats
      </label>
      {run.attestation ? (
        <details className="twin9-attestation">
          <summary>Attestation</summary>
          <dl>
            <dt>Profil</dt>
            <dd>
              {run.attestation.profil?.nom ?? '—'}
              {run.mode === 'test' ? ' (essai)' : ''}
            </dd>
            <dt>Référentiel</dt>
            <dd>
              {run.attestation.referentiel?.id} {run.attestation.referentiel?.version}
            </dd>
            <dt>Jeu de gabarits</dt>
            <dd>
              {run.attestation.gabarits?.jeu} · {run.attestation.gabarits?.empreinte}
            </dd>
            <dt>Moteur</dt>
            <dd>{run.attestation.moteur?.commit ? run.attestation.moteur.commit.slice(0, 12) : 'version inconnue'}</dd>
            {run.attestation.admission ? (
              <>
                <dt>Admission</dt>
                <dd>{phraseAdmission(run.attestation.admission)}</dd>
              </>
            ) : null}
            <dt>Accord</dt>
            <dd>{run.accord_at ?? '—'}</dd>
          </dl>
        </details>
      ) : null}
      {/* sa configuration et son exécution (P0-1) : le suivi n'en porte que l'empreinte, les blocs se lisent dans ses
          résultats ; un run lancé avant elle, sans configuration, y montre son exécution partielle */}
      <ConfigurationDuRun
        version={run.statut}
        parEtape={run.compteurs?.par_etape ?? null}
        charger={() =>
          fetchResultats(id, { fetchFn }).then((r) => ({ configuration: r.run?.configuration ?? null, execution: r.run?.execution ?? null }))
        }
      />
    </article>
  )
}
