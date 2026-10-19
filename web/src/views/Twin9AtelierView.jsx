// Atelier Twin9 (#/twin9-atelier, AD-D2) — l'édition des gabarits du Golden
// Prompt vit désormais dans la famille « Faire évoluer », réservée aux
// administrateurs-promptologues (les DEUX rôles). C'est le SEUL endroit du
// front où le CONTENU d'un gabarit est visible, et seulement pour admin ∧
// promptologue ; le serveur applique la même garde (RequireRole::all).
//
// Les jeux de gabarits (T14) : le jeu v9.8, importé, s'y lit sans jamais s'y
// écrire ; on le copie sous un nom, et l'on édite sa copie, avec ses versions et
// son retour arrière, puis on la choisit dans un profil (#/configuration). La
// copie d'un autre se lit. Une variable qu'aucune étape ne fournit est refusée
// par le serveur, qui le dit.
//
// La supervision commerciale (marge, promo Twin9 gratuit, comptes) et le jeu
// par défaut restent dans #/admin/twin9 (admin seul, Twin9Section).
//
// Le contenu rendu (gabarit édité, rendu du banc d'essai) reste du TEXTE BRUT :
// jamais de renderMarkdown/HTML — ce n'est pas du narratif, c'est un secret
// industriel. React échappe le texte, on l'affiche tel quel dans <textarea>/<pre>.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../api/client.js'
import {
  copierJeu,
  fetchJeux,
  fetchProtocole,
  fetchProtocoleList,
  fetchProtocoleVersion,
  fetchProtocoleVersions,
  restoreProtocoleVersion,
  saveProtocole,
  testerProtocole,
} from '../api/twin9.js'

/** @param {string} iso @returns {string} date/heure française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}

// ---- 0. Jeux de gabarits --------------------------------------------------

/** Le nom d'un jeu dans la liste : « v9.8 (lecture seule) », « essai (le vôtre) »… */
function libelleJeu(j) {
  let qui = `de ${j.auteur ?? 'compte supprimé'}, lecture seule`
  if (j.id === 'v9.8') qui = 'lecture seule'
  else if (j.mien) qui = 'le vôtre'
  return `${j.id} (${qui})${j.defaut ? ' · par défaut' : ''}`
}

/**
 * Choisir le jeu qu'on lit ou édite ; copier le jeu v9.8 sous un nom, qui
 * devient aussitôt le jeu ouvert.
 */
function JeuxBloc({ jeux, jeu, onChoisir, onCopie, fetchFn }) {
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function choisir(id) {
    setMessage(null)
    setError(null)
    try {
      await onChoisir(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ce jeu ne s’ouvre pas.')
    }
  }

  async function copier(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    let copie = null
    try {
      copie = await copierJeu(nom.trim(), { fetchFn })
      setNom('')
      await onCopie(copie.id)
      setMessage(
        `Copie « ${copie.id} » créée (${copie.gabarits} gabarits). ` +
          'Choisissez-la dans un profil de la page Configuration.',
      )
    } catch (err) {
      if (copie) setError(`Copie « ${copie.id} » créée, mais elle ne s’ouvre pas : rechargez la page.`)
      else setError(err instanceof ApiError ? err.message : 'Copie impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Jeux de gabarits</h3>
      <div className="admin-field">
        <label htmlFor="twin9-jeu">Jeu</label>
        <div className="admin-field-input">
          <select id="twin9-jeu" value={jeu} onChange={(event) => choisir(event.target.value)}>
            {jeux.map((j) => (
              <option key={j.id} value={j.id}>
                {libelleJeu(j)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <form className="twin9-admin-copie" onSubmit={copier}>
        <div className="admin-field">
          <label htmlFor="twin9-copie-nom">Copier le jeu v9.8 sous le nom</label>
          <div className="admin-field-input">
            <input
              id="twin9-copie-nom"
              type="text"
              value={nom}
              placeholder="minuscules, chiffres, . _ -"
              onChange={(event) => setNom(event.target.value)}
            />
          </div>
        </div>
        <button type="submit" disabled={busy || nom.trim() === ''}>
          Copier
        </button>
      </form>
      {message ? (
        <p role="status" className="admin-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ---- 1. Gabarits -----------------------------------------------------------

/**
 * Liste des gabarits du jeu (métadonnées seules) + éditeur du contenu. Cliquer
 * un gabarit charge son contenu (fetchProtocole) dans le <textarea> ;
 * Enregistrer versionne côté serveur (saveProtocole) ; « versions » liste
 * l'historique. Le jeu v9.8 et la copie d'un autre se lisent seulement.
 */
function GabaritsBloc({ jeu, protocoles, fetchFn, onSaved }) {
  const modifiable = jeu.id !== 'v9.8' && jeu.mien
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [versions, setVersions] = useState(null)
  const [apercu, setApercu] = useState(null) // {version, content} — version archivée en lecture

  async function openGabarit(name) {
    setSelected(name)
    setLoading(true)
    setContent('')
    setMessage(null)
    setError(null)
    setVersions(null)
    setApercu(null)
    try {
      const tpl = await fetchProtocole(jeu.id, name, { fetchFn })
      setContent(tpl?.content ?? '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement du gabarit impossible.')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await saveProtocole(jeu.id, selected, content, { fetchFn })
      setMessage(
        res?.status === 'unchanged'
          ? 'Contenu inchangé — aucune nouvelle version.'
          : `Gabarit « ${selected} » enregistré (nouvelle version archivée).`,
      )
      onSaved(jeu.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function loadVersions() {
    setError(null)
    try {
      const res = await fetchProtocoleVersions(jeu.id, selected, { fetchFn })
      setVersions(Array.isArray(res?.versions) ? res.versions : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Historique indisponible.')
    }
  }

  // D13 — lecture d'une version archivée (aperçu texte brut, jamais de HTML).
  async function voirVersion(version) {
    setError(null)
    try {
      const res = await fetchProtocoleVersion(jeu.id, selected, version, { fetchFn })
      setApercu({ version, content: res?.content ?? '' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Version indisponible.')
    }
  }

  // D13 — restauration : jamais destructive (le vivant est archivé d'abord).
  async function restaurer(version) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await restoreProtocoleVersion(jeu.id, selected, version, { fetchFn })
      setMessage(
        res?.status === 'unchanged'
          ? `La version ${version} est identique au gabarit vivant — rien à restaurer.`
          : `Version ${version} restaurée comme gabarit vivant (l’état précédent est archivé).`,
      )
      setApercu(null)
      const tpl = await fetchProtocole(jeu.id, selected, { fetchFn })
      setContent(tpl?.content ?? '')
      await loadVersions()
      onSaved(jeu.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Restauration impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Gabarits du Golden Prompt — jeu « {jeu.id} »</h3>
      <p className="twin9-admin-warning" role="note">
        <strong>Contenu confidentiel — ne pas divulguer.</strong> Ces gabarits sont le secret
        industriel de la plateforme (ADR-010) : ils ne sont visibles qu’ici, pour les
        administrateurs-promptologues.
      </p>
      {modifiable ? null : (
        <p className="privacy-note">
          {jeu.id === 'v9.8'
            ? 'Le jeu v9.8 est en lecture seule : copiez-le pour le modifier.'
            : `Lecture seule : cette copie est celle de ${jeu.auteur ?? 'un compte supprimé'}.`}
        </p>
      )}

      {protocoles.length === 0 ? (
        <p>Aucun gabarit importé pour l’instant.</p>
      ) : (
        <ul className="twin9-admin-gabarits">
          {protocoles.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                className="twin9-admin-gabarit"
                aria-pressed={selected === p.name}
                onClick={() => openGabarit(p.name)}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.longueur} caractères · {p.variables.length} variable
                  {p.variables.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="twin9-admin-editeur">
          <h4>
            {modifiable ? 'Édition' : 'Lecture'} : {selected}
          </h4>
          {loading ? (
            <p role="status">Chargement du contenu…</p>
          ) : (
            <>
              <label htmlFor="twin9-gabarit-content">Contenu du gabarit (texte brut)</label>
              <textarea
                id="twin9-gabarit-content"
                className="twin9-admin-textarea"
                rows={16}
                spellCheck={false}
                readOnly={!modifiable}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="twin9-admin-actions">
                {modifiable ? (
                  <button type="button" disabled={busy || content.trim() === ''} onClick={save}>
                    Enregistrer
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-button-secondary"
                  disabled={busy}
                  onClick={loadVersions}
                >
                  Voir les versions
                </button>
              </div>
            </>
          )}

          {message ? (
            <p role="status" className="admin-message">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="load-error">
              {error}
            </p>
          ) : null}

          {versions ? (
            versions.length === 0 ? (
              <p>Aucune version antérieure archivée.</p>
            ) : (
              <table className="admin-table twin9-admin-versions">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Longueur</th>
                    <th scope="col">Variables</th>
                    <th scope="col">Archivée le</th>
                    <th scope="col">{modifiable ? 'Actions' : 'Lire'}</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>{v.version}</td>
                      <td>{v.longueur}</td>
                      <td>{v.variables.length}</td>
                      <td>{frDate(v.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-button-secondary"
                          disabled={busy}
                          onClick={() => voirVersion(v.version)}
                        >
                          Voir
                        </button>
                        {modifiable ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="admin-button-secondary"
                              disabled={busy}
                              onClick={() => restaurer(v.version)}
                            >
                              Restaurer
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {apercu ? (
            <div className="twin9-admin-apercu">
              <h5>
                Version {apercu.version} (archivée, lecture seule)
                {modifiable ? (
                  <>
                    {' '}—{' '}
                    <button
                      type="button"
                      className="admin-button-secondary"
                      disabled={busy}
                      onClick={() => restaurer(apercu.version)}
                    >
                      Restaurer cette version
                    </button>
                  </>
                ) : null}
              </h5>
              <pre className="twin9-admin-rendu" data-testid="twin9-apercu-version">
                {apercu.content}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- 2. Banc d'essai -------------------------------------------------------

/**
 * Rendre un gabarit avec des variables d'exemple (aucun appel LLM) : les champs
 * sont générés depuis les .variables du gabarit choisi ; testerProtocole renvoie
 * {rendu, non_resolues}. Le rendu est du texte brut réservé à l'atelier.
 */
function BancEssaiBloc({ jeu, protocoles, fetchFn }) {
  const [name, setName] = useState('')
  const [vars, setVars] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const selected = protocoles.find((p) => p.name === name) ?? null

  function choose(next) {
    setName(next)
    setResult(null)
    setError(null)
    const found = protocoles.find((p) => p.name === next)
    const init = {}
    for (const v of found?.variables ?? []) init[v] = ''
    setVars(init)
  }

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await testerProtocole(jeu, name, vars, { fetchFn }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Banc d’essai</h3>
      <p className="privacy-note">
        Remplit un gabarit avec des variables d’exemple et affiche le rendu — <strong>aucun appel
        LLM</strong>, aucun débit. Réservé à l’atelier (le rendu contient le gabarit).
      </p>

      <div className="admin-field">
        <label htmlFor="twin9-banc-gabarit">Gabarit</label>
        <div className="admin-field-input">
          <select
            id="twin9-banc-gabarit"
            value={name}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">— choisir un gabarit —</option>
            {protocoles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected ? (
        <form
          className="twin9-admin-banc"
          onSubmit={(event) => {
            event.preventDefault()
            run()
          }}
        >
          {selected.variables.length === 0 ? (
            <p>Ce gabarit n’a aucune variable.</p>
          ) : (
            selected.variables.map((v) => (
              <div className="admin-field" key={v}>
                <label htmlFor={`twin9-var-${v}`}>{v}</label>
                <div className="admin-field-input">
                  <input
                    id={`twin9-var-${v}`}
                    type="text"
                    value={vars[v] ?? ''}
                    onChange={(event) =>
                      setVars((prev) => ({ ...prev, [v]: event.target.value }))
                    }
                  />
                </div>
              </div>
            ))
          )}
          <button type="submit" disabled={busy}>
            Rendre le gabarit
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="twin9-admin-rendu">
          <h4>Rendu</h4>
          <pre data-testid="twin9-rendu">{result.rendu}</pre>
          {Array.isArray(result.non_resolues) && result.non_resolues.length > 0 ? (
            <p role="status" className="admin-message">
              Variables non résolues : {result.non_resolues.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- Explication du rôle (garde front, doublée côté serveur) ---------------

function AtelierReserve() {
  return (
    <div className="admin-reserve" data-testid="twin9-atelier-reserve">
      <p role="alert">Cet atelier est réservé aux administrateurs-promptologues.</p>
      <p>
        L’édition des gabarits du Golden Prompt Twin9 exige <strong>les deux rôles</strong> :{' '}
        <strong>administrateur</strong> et <strong>promptologue</strong> (AD-D2). Le contenu des
        gabarits (secret industriel, ADR-010) ne transite jamais vers un client qui ne porte pas ces
        deux rôles. L’accès s’obtient auprès d’Harmonia Éducation.
      </p>
    </div>
  )
}

// ---- Vue ------------------------------------------------------------------

/**
 * @param {object} props
 * @param {string[]} [props.roles] rôles de la session (App les fournit)
 * @param {object} [props.deps] coutures de test : {fetchFn}
 */
export default function Twin9AtelierView({ roles = [], deps = {} }) {
  const fetchFn = deps.fetchFn
  const isAtelier = roles.includes('admin') && roles.includes('promptologue')

  const [jeux, setJeux] = useState(null)
  const [jeu, setJeu] = useState(null)
  const [protocoles, setProtocoles] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  // le dernier jeu demandé : une réponse arrivée après qu'on en a ouvert un autre ne s'affiche pas
  const demande = useRef(null)

  /** Ouvre un jeu : la liste de ses gabarits. */
  const ouvrir = useCallback(
    async (id) => {
      const avant = demande.current
      demande.current = id
      try {
        const pl = await fetchProtocoleList(id, { fetchFn })
        if (demande.current !== id) return
        setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
        setJeu(id)
      } catch (err) {
        if (demande.current === id) demande.current = avant // le jeu affiché reste celui d'avant
        throw err
      }
    },
    [fetchFn],
  )

  // les jeux, puis le jeu ouvert : sa première copie, sinon le jeu v9.8
  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const liste = (await fetchJeux({ fetchFn }))?.jeux ?? []
      setJeux(liste)
      await ouvrir(liste.find((j) => j.mien)?.id ?? 'v9.8')
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn, ouvrir])

  useEffect(() => {
    if (isAtelier) load()
  }, [isAtelier, load])

  /** Une copie faite : la liste des jeux relue, la copie ouverte. */
  const apresCopie = useCallback(
    async (id) => {
      setJeux((await fetchJeux({ fetchFn }))?.jeux ?? [])
      await ouvrir(id)
    },
    [fetchFn, ouvrir],
  )

  /** La liste d'un jeu relue après une écriture, s'il est toujours celui qu'on regarde. */
  const reloadProtocoles = useCallback(
    async (id) => {
      try {
        const pl = await fetchProtocoleList(id, { fetchFn })
        if (demande.current === id) setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
      } catch {
        /* on garde la liste précédente : l'échec est déjà signalé par le bloc */
      }
    },
    [fetchFn],
  )

  const courant = jeux?.find((j) => j.id === jeu) ?? { id: jeu ?? 'v9.8', mien: false, auteur: null }

  return (
    <div className="admin twin9-admin">
      <h1>Atelier Twin9 — Golden Prompt</h1>
      {!isAtelier ? (
        <AtelierReserve />
      ) : status === 'loading' ? (
        <p role="status">Chargement de l’atelier Twin9…</p>
      ) : status === 'error' ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : (
        <section className="admin-twin9">
          <JeuxBloc jeux={jeux} jeu={jeu} onChoisir={ouvrir} onCopie={apresCopie} fetchFn={fetchFn} />
          <GabaritsBloc
            key={`gabarits-${jeu}`}
            jeu={courant}
            protocoles={protocoles}
            fetchFn={fetchFn}
            onSaved={reloadProtocoles}
          />
          <BancEssaiBloc key={`banc-${jeu}`} jeu={jeu} protocoles={protocoles} fetchFn={fetchFn} />
        </section>
      )}
    </div>
  )
}
