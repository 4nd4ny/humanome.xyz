// Atelier épistémiarque, section « Autres référentiels » (T15, UC-EPI-05) —
// #/epistemiarque/referentiels. Un référentiel d'une autre structure que
// RESPIRE s'importe en brouillon, au niveau qui tient lieu de compétence ; il
// se soumet au vote, se lit (« Voir »), se vote et se publie à la majorité,
// comme une version.
// RESPIRE, lui, s'édite compétence par compétence dans l'atelier.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'

const RESPIRE = 'respire'

const VOTES = [
  ['pour', 'Pour'],
  ['contre', 'Contre'],
  ['abstention', 'Abstention'],
]

function messageDe(error) {
  if (error instanceof ApiUnavailableError) return error.message
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  return 'Une erreur est survenue. Réessayez.'
}

function titre(version) {
  return `${version.label} — ${version.referentielId} ${version.semver}`
}

function decompte(tally) {
  if (!tally) return null
  const issue = { adopted: 'majorité atteinte', rejected: 'rejetée', pending: 'en cours', blocked: 'aucun électeur' }
  return (
    <span className={`epi-chip epi-chip-${tally.outcome}`}>
      {tally.pour}/{tally.threshold ?? '—'} pour · {issue[tally.outcome] ?? tally.outcome}
    </span>
  )
}

/**
 * @param {{api: ReturnType<typeof import('./api.js').createEpistemiarqueApi>, canVote: boolean}} props
 *   canVote : les membres épistémiarques votent ; un administrateur importe, soumet et publie.
 */
export default function ReferentielsSection({ api, canVote }) {
  const [etat, setEtat] = useState({ status: 'loading' })
  const [cle, setCle] = useState(0)
  const [note, setNote] = useState(null)
  const [fichier, setFichier] = useState(null)
  const [niveau, setNiveau] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [apercu, setApercu] = useState(null)

  useEffect(() => {
    let vivant = true
    Promise.all([api.listDrafts(), api.listCatalogue()])
      .then(([versions, catalogue]) => {
        if (!vivant) return
        setEtat({
          status: 'ready',
          versions: (Array.isArray(versions) ? versions : []).filter((v) => v.referentielId !== RESPIRE),
          catalogue: (Array.isArray(catalogue) ? catalogue : []).filter((r) => r.id !== RESPIRE),
        })
      })
      .catch((error) => {
        if (vivant) setEtat({ status: 'error', message: messageDe(error) })
      })
    return () => {
      vivant = false
    }
  }, [api, cle])

  const recharger = useCallback(() => setCle((k) => k + 1), [])

  const lire = async (event) => {
    const file = event.target.files?.[0] ?? null
    setNote(null)
    setFichier(null)
    if (!file) return
    try {
      const document = JSON.parse(await file.text())
      const niveaux = (Array.isArray(document?.niveaux) ? document.niveaux : [])
        .map((n) => n?.nom)
        .filter((nom) => typeof nom === 'string' && nom !== '')
      setFichier({ nom: file.name, document, niveaux })
      setNiveau(niveaux[0] ?? '')
    } catch {
      setNote({ erreur: true, texte: `« ${file.name} » n’est pas un fichier JSON lisible.` })
    }
  }

  const importer = async (event) => {
    event.preventDefault()
    if (!fichier || occupe) return
    setOccupe(true)
    setNote(null)
    try {
      const brouillon = await api.importReferentiel(fichier.document, fichier.niveaux.length > 1 ? niveau : null)
      const { competences = [], poles = [] } = brouillon.content ?? {}
      setNote({
        erreur: false,
        texte: `Brouillon « ${brouillon.referentielId} » ${brouillon.semver} importé : ${competences.length} compétences en ${poles.length} pôles.`,
      })
      setFichier(null)
      event.target.reset?.()
      recharger()
    } catch (error) {
      setNote({ erreur: true, texte: messageDe(error), details: error?.errors ?? null })
      // le fichier refusé est écarté : choisi de nouveau, même sous le même nom (sans quoi le
      // navigateur ne signale aucun changement), c'est sa version corrigée qui part
      setFichier(null)
      event.target.reset?.()
    } finally {
      setOccupe(false)
    }
  }

  // Le document d'une version listée, à lire avant de voter (ou de soumettre).
  const basculer = (id) => {
    if (apercu?.id === id) {
      setApercu(null)
      return
    }
    setApercu({ id, status: 'loading' })
    api
      .getDraft(id)
      .then((version) => setApercu((a) => (a?.id === id ? { id, status: 'ready', content: version.content } : a)))
      .catch((error) => setApercu((a) => (a?.id === id ? { id, status: 'error', message: messageDe(error) } : a)))
  }

  const contenuDe = (id) => {
    if (apercu?.id !== id) return null
    if (apercu.status === 'loading') return <p role="status">Chargement du document…</p>
    if (apercu.status === 'error') return <p className="load-error">{apercu.message}</p>
    const competences = Array.isArray(apercu.content?.competences) ? apercu.content.competences : []
    return (
      <ul className="epi-list" aria-label="Document">
        {(Array.isArray(apercu.content?.poles) ? apercu.content.poles : []).map((pole) => (
          <li key={pole.num}>
            {`${pole.num} · ${pole.nom}`}
            <ul>
              {competences
                .filter((c) => c.pole === pole.num)
                .map((c) => (
                  <li key={c.code}>{`${c.code} — ${c.nom}`}</li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    )
  }

  const voir = (id) => (
    <button type="button" aria-expanded={apercu?.id === id} onClick={() => basculer(id)}>
      {apercu?.id === id ? 'Masquer' : 'Voir'}
    </button>
  )

  const agir = async (action, reussite) => {
    setOccupe(true)
    setNote(null)
    try {
      await action()
      setNote({ erreur: false, texte: reussite })
      recharger()
    } catch (error) {
      setNote({ erreur: true, texte: messageDe(error) })
    } finally {
      setOccupe(false)
    }
  }

  let listes = null
  if (etat.status === 'loading') {
    listes = <p role="status">Chargement des référentiels…</p>
  } else if (etat.status === 'error') {
    listes = (
      <p role="alert" className="load-error">
        {etat.message}
      </p>
    )
  } else {
    const auVote = etat.versions.filter((v) => v.status === 'review')
    const brouillons = etat.versions.filter((v) => v.status === 'draft')
    listes = (
      <>
        {auVote.length > 0 && (
          <section className="epi-block" aria-label="Référentiels au vote">
            <h3>Au vote</h3>
            <ul className="epi-list">
              {auVote.map((p) => (
                <li key={p.id} className="epi-list-item">
                  <span className="epi-list-title">{titre(p)}</span> {decompte(p.tally)} {voir(p.id)}{' '}
                  {canVote &&
                    VOTES.map(([vote, libelle]) => (
                      <button
                        key={vote}
                        type="button"
                        disabled={occupe}
                        onClick={() => agir(() => api.vote(p.id, vote), `Vote « ${libelle.toLowerCase()} » enregistré.`)}
                      >
                        {libelle}
                      </button>
                    ))}{' '}
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => agir(() => api.withdrawDraft(p.id), `« ${p.referentielId} » ${p.semver} retiré du vote.`)}
                  >
                    Retirer
                  </button>
                  {p.tally?.reached && (
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() => agir(() => api.publishDraft(p.id, null), `« ${p.referentielId} » ${p.semver} publié.`)}
                    >
                      Publier
                    </button>
                  )}
                  {contenuDe(p.id)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {brouillons.length > 0 && (
          <section className="epi-block" aria-label="Brouillons de référentiel">
            <h3>Brouillons</h3>
            <ul className="epi-list">
              {brouillons.map((d) => (
                <li key={d.id} className="epi-list-item">
                  <span className="epi-list-title">{titre(d)}</span> {voir(d.id)}{' '}
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => agir(() => api.submitDraft(d.id), `« ${d.referentielId} » ${d.semver} soumis au vote.`)}
                  >
                    Soumettre au vote
                  </button>
                  {contenuDe(d.id)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {etat.catalogue.length > 0 && (
          <section className="epi-block" aria-label="Référentiels publiés">
            <h3>Publiés</h3>
            <ul className="epi-list">
              {etat.catalogue.map((r) => (
                <li key={r.id} className="epi-list-item">
                  {r.label} — {r.id} {r.versions.join(', ')}
                </li>
              ))}
            </ul>
          </section>
        )}
        {auVote.length + brouillons.length + etat.catalogue.length === 0 && <p>Aucun autre référentiel pour l’instant.</p>}
      </>
    )
  }

  return (
    <div className="epi-referentiels">
      <p>
        <a href="#/epistemiarque">Retour à l’atelier</a>
      </p>
      <h2>Autres référentiels</h2>
      <p className="epi-intro">
        Un référentiel d’une autre structure que RESPIRE s’importe en brouillon, depuis un fichier JSON au format du
        référentiel, au niveau qui tient lieu de compétence ; il se vote et se publie ensuite comme une version.
      </p>
      <form className="epi-block" aria-label="Importer un référentiel" onSubmit={importer}>
        <label>
          Fichier du référentiel <input type="file" accept=".json,application/json" onChange={lire} />
        </label>
        {fichier && fichier.niveaux.length > 1 && (
          <label>
            {' '}
            Niveau qui tient lieu de compétence{' '}
            <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
              {fichier.niveaux.map((nom) => (
                <option key={nom} value={nom}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
        )}{' '}
        <button type="submit" disabled={!fichier || occupe}>
          Importer
        </button>
      </form>
      {note && (
        <div role={note.erreur ? 'alert' : 'status'} className={note.erreur ? 'load-error' : undefined}>
          <p>{note.texte}</p>
          {note.details && (
            <ul>
              {Object.entries(note.details)
                .slice(0, 20)
                .map(([pointeur, messages]) => (
                  <li key={pointeur}>
                    {pointeur} : {[].concat(messages).join(' ; ')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {listes}
    </div>
  )
}
