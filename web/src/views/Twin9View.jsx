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

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import {
  annulerRun,
  avancerRuns,
  fetchConfiguration,
  fetchResultats,
  fetchRun,
  fetchRuns,
  lancerRun,
  rendreRunVisible,
  reprendreRun,
} from '../api/twin9.js'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { twin9RunFiles } from '../lib/interface-handoff.js'
import '../styles/twin9.css'

const STATUTS = { en_cours: 'En cours', termine: 'Terminé', annule: 'Annulé', echoue: 'Arrêté' }

const pauseParDefaut = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

  const local = donnees.portfolios.find((p) => p.id === portfolio) ?? null
  const choisi = local ? { nom: nomDeFichier(local.titre), texte: local.texte } : fichier
  const pret = accord && choisi !== null && choisi.texte.trim() !== '' && !occupe

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
      onOpenInInterface?.(files, { title: `Twin9 · ${resultats.run.journal}` })
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
        {run.statut === 'annule' || run.statut === 'echoue' ? (
          <button type="button" disabled={occupe} onClick={() => agir(() => reprendreRun(id, { fetchFn }))}>
            Reprendre
          </button>
        ) : null}
        {p.fusion ? (
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
            <dt>Accord</dt>
            <dd>{run.accord_at ?? '—'}</dd>
          </dl>
        </details>
      ) : null}
    </article>
  )
}
