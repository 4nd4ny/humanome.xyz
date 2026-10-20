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
// L'entrée de navigation reste masquée jusqu'au lot 3 (nav.js) : la page
// s'ouvre par son adresse.
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
//
// Le moteur lit le référentiel du run (T16), et sa carte s'ouvre dans la
// cartographie avec lui (T17) : RESPIRE, ou celui d'une autre structure, dont
// le titre du jeu porte le nom.

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import {
  annulerRun,
  apercuRun,
  avancerRuns,
  fetchConfiguration,
  fetchResultats,
  fetchRun,
  fetchRuns,
  formatUsd,
  lancerRun,
  rendreRunVisible,
  reprendreRun,
} from '../api/twin9.js'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { twin9RunFiles } from '../lib/interface-handoff.js'
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

/**
 * Avant de lancer : les journées à instruire ; le coût estimé, en moyenne, au plus bas et au plus haut, et la durée ;
 * celles que le crédit ou le budget admet avec leur fusion (T8), ou le refus, qui dit ce qu'il faudrait ; les plafonds.
 */
function Apercu({ apercu }) {
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
  const temps = e.duree_s != null ? ` · durée estimée : ${duree(e.duree_s)}` : apercu.voie === 'lots' ? ' · par lots, la durée dépend d’Anthropic' : ''
  const { budget_usd: budget, duree_minutes: minutes } = apercu.plafonds
  const s = (n) => (n > 1 ? 's' : '')
  return (
    <section className="twin9-apercu" aria-label="Avant de lancer">
      <p>{phraseJournees(apercu.journees)}</p>
      {a?.refus ? (
        <p role="alert">
          {a.refus}.{a.limite === 'credit' ? <> <a href="#/compte/credit">Recharger</a></> : null}
        </p>
      ) : (
        <>
          {a?.en_attente > 0 ? (
            <p>
              {a.limite === 'budget' ? 'Le budget du profil' : 'Votre crédit'}
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
  const navigate = deps.navigate ?? ((hash) => (window.location.hash = hash))
  const [etat, setEtat] = useState({ chargement: true })
  const [donnees, setDonnees] = useState(null)
  const [portfolio, setPortfolio] = useState('')
  const [fichier, setFichier] = useState(null)
  const [profil, setProfil] = useState('')
  const [visible, setVisible] = useState(false)
  const [accord, setAccord] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let actif = true
    const store = deps.store ?? createPortfolioStore()
    Promise.all([fetchRuns({ fetchFn }), fetchConfiguration({ fetchFn }), store.list().catch(() => [])])
      .then(([runs, config, portfolios]) => {
        if (!actif) return
        setDonnees({ ...runs, profils: config.profils, portfolios })
        setPortfolio(portfolios[0]?.id ?? 'fichier')
        setEtat({})
      })
      .catch((e) => actif && setEtat({ erreur: e }))
    return () => {
      actif = false
    }
  }, [fetchFn, deps.store])

  // Avant de lancer, l'accord donné : ce que le run instruirait, et ce qu'il coûterait.
  const local = donnees?.portfolios.find((p) => p.id === portfolio) ?? null
  const choisi = local ? { nom: nomDeFichier(local.titre), texte: local.texte } : fichier
  const [apercu, setApercu] = useState(null)
  const nom = choisi?.nom ?? null
  const texte = choisi?.texte ?? ''
  useEffect(() => {
    if (!accord || nom === null || texte.trim() === '') {
      setApercu(null)
      return undefined
    }
    let actif = true
    setApercu({ chargement: true })
    apercuRun({ profil: profil === '' ? null : Number(profil), portfolio: { nom, texte } }, { fetchFn })
      .then((a) => actif && setApercu({ donnees: a }))
      .catch((e) => actif && setApercu({ erreur: e.message }))
    return () => {
      actif = false
    }
  }, [accord, profil, nom, texte, fetchFn])

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
  const pret = accord && choisi !== null && choisi.texte.trim() !== '' && !occupe && !apercu?.donnees?.admission?.refus

  const lancer = async (e) => {
    e.preventDefault()
    setOccupe(true)
    setErreur(null)
    try {
      const run = await lancerRun(
        { profil: profil === '' ? null : Number(profil), portfolio: choisi, accord: true, visibilite: visible ? 'cartographe' : 'privee' },
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
    f.text().then((texte) => setFichier({ nom: f.name, texte }))
  }

  return (
    <>
      {donnees.disponible ? (
        <form className="twin9-lancer" onSubmit={lancer} noValidate>
          <h3>Lancer une analyse</h3>
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
          <label className="twin9-case">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Mon cartographe peut
            lire les résultats
          </label>
          <fieldset className="twin9-accord">
            <legend>Accord</legend>
            <label className="twin9-case">
              <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} /> J’accepte que mon
              portfolio et l’état de l’analyse restent sur le serveur humanome.xyz jusqu’à ce que je les efface. Le texte
              part chez Anthropic, le fournisseur du modèle ; par lots, Anthropic garde le lot jusqu’à sa suppression,
              29 jours au plus. Voir la <a href="#/confidentialite">politique de confidentialité</a>.
            </label>
          </fieldset>
          {apercu?.donnees ? <Apercu apercu={apercu.donnees} /> : null}
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
        {run.statut === 'annule' || run.statut === 'echoue' ? (
          <button
            type="button"
            disabled={occupe || (parBudget && !budgetValide)}
            onClick={() =>
              agir(() => reprendreRun(id, { fetchFn }, parBudget ? { budget_usd: budget === '' ? null : Number(budget) } : undefined))
            }
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
    </article>
  )
}
