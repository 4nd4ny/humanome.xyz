// Documents d'un membre (P11) : les documents JOUR produits par les runs de
// masse pour les cohortes de CET établissement (consentement explicite du
// membre), puis MERGE CALCULÉ CÔTÉ CLIENT via le moteur (membre-merge.js,
// pattern run-launcher) et visualisation LECTURE SEULE MergeView / DayView
// (même motif que CartographyViewer, P8).
//
// Chaque document se lit avec la version du référentiel que son run a figée
// (2026-10-20) ; la fusion, avec celle du run le plus récent.

import { useEffect, useMemo, useState } from 'react'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import DayView from '../DayView.jsx'
import MergeView from '../MergeView.jsx'
import { fetchMembreDocuments, frDate } from './etablissement-api.js'
import { buildMemberMerge, referentielDeLaFusion, uniqueDayEntries } from './membre-merge.js'

/** Clé d'une version de référentiel : `id@version` (version inconnue : vide). */
const cleDe = (ref) => `${ref.id}@${ref.version ?? ''}`

/**
 * @param {object} props
 * @param {string} props.userId identifiant du membre (segment d'URL)
 * @param {object} [props.lib] module sunburst (App / tests)
 * @param {typeof fetch} [props.fetchFn] seam de test
 * @param {typeof loadPublishedReferentiel} [props.getReferentiel] seam de test, appelé avec {id, version}
 */
export default function MembreSection({
  userId,
  lib,
  fetchFn,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [membre, setMembre] = useState(null)
  const [documents, setDocuments] = useState(null) // null = chargement
  // clé `id@version` -> {doc} ou {error} : les référentiels des runs du membre
  const [referentiels, setReferentiels] = useState(() => new Map())
  const [loadError, setLoadError] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null) // iso -> DayView, null -> merge

  useEffect(() => {
    let alive = true
    fetchMembreDocuments(userId, fetchFn)
      .then((data) => {
        if (!alive) return
        setMembre(data.membre)
        setDocuments(data.documents)
      })
      .catch((error) => {
        if (!alive) return
        setDocuments([])
        setLoadError(error.message)
      })
    return () => {
      alive = false
    }
  }, [userId, fetchFn])

  // La version du référentiel de chaque run, une fois chacune.
  useEffect(() => {
    let alive = true
    const versions = new Map((documents ?? []).map((d) => [cleDe(d.referentiel), d.referentiel]))
    for (const [cle, ref] of versions) {
      Promise.resolve()
        .then(() => getReferentiel({ id: ref.id, ...(ref.version ? { version: ref.version } : {}) }))
        .then(
          (loaded) => ({ doc: loaded?.doc ?? loaded ?? null }),
          (error) => ({ error: error instanceof Error ? error.message : String(error) }),
        )
        .then((result) => {
          if (alive) setReferentiels((current) => new Map(current).set(cle, result))
        })
    }
    return () => {
      alive = false
    }
  }, [documents, getReferentiel])

  // Merge déterministe côté client (décision M8) — recalculé si les documents
  // ou les référentiels changent, jamais envoyé au serveur.
  const dayEntries = useMemo(() => uniqueDayEntries(documents ?? []), [documents])
  const fusion = useMemo(() => referentielDeLaFusion(documents ?? []), [documents])
  const referentielFusion = fusion ? referentiels.get(cleDe(fusion)) : undefined
  const merge = useMemo(() => {
    if (!referentielFusion?.doc || dayEntries.length === 0) return null
    return buildMemberMerge(dayEntries.map((e) => e.document), referentielFusion.doc, { journalId: `membre-${userId}` })
  }, [dayEntries, referentielFusion, userId])

  const selected = selectedDay ? dayEntries.find((e) => e.date === selectedDay) : null
  const referentielDuJour = selected ? referentiels.get(cleDe(selected.referentiel)) : undefined
  const getDay = useMemo(
    () => () => Promise.resolve(selected?.document),
    [selected],
  )

  let body
  if (documents === null || (dayEntries.length > 0 && referentielFusion === undefined)) {
    body = <p role="status">Chargement…</p>
  } else if (dayEntries.length === 0) {
    body = (
      <p className="privacy-note">
        Aucun document produit pour ce membre dans vos cohortes pour l’instant : lancez un run
        de masse depuis la page de la cohorte.
      </p>
    )
  } else if (selected) {
    body = referentielDuJour?.doc ? (
      <DayView
        date={selected.date}
        referentiel={referentielDuJour.doc}
        days={[selected.date]}
        getDay={getDay}
        lib={lib}
      />
    ) : referentielDuJour?.error ? (
      <p role="alert" className="load-error">
        {referentielDuJour.error}
      </p>
    ) : (
      <p role="status">Chargement…</p>
    )
  } else if (referentielFusion.error) {
    body = (
      <p role="alert" className="load-error">
        {referentielFusion.error}
      </p>
    )
  } else if (merge?.document) {
    body = <MergeView mergeDoc={merge.document} referentiel={referentielFusion.doc} lib={lib} />
  } else {
    body = (
      <p role="alert" className="load-error" data-testid="etab-merge-erreur">
        {merge?.error ?? 'Fusion indisponible.'}
      </p>
    )
  }

  return (
    <div className="etab-membre">
      <p>
        <a href="#/etablissement">← Toutes mes cohortes</a>
      </p>
      <h2>{membre ? `Documents de ${membre.displayName}` : 'Documents du membre'}</h2>
      <p className="privacy-note" data-testid="etab-membre-consentement">
        Ces cartographies sont visibles par votre établissement parce que ce membre a rejoint
        une de vos cohortes avec son <strong>consentement explicite</strong>
        {membre?.consentAt ? ` (donné le ${frDate(membre.consentAt)})` : ''} — seuls les
        documents produits dans ce cadre apparaissent ici. La fusion chronologique est calculée
        dans votre navigateur par le moteur (lecture seule).
      </p>
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}

      {dayEntries.length > 0 ? (
        <nav className="etab-membre-nav" aria-label="Vues du membre">
          <button
            type="button"
            className="button"
            disabled={!selectedDay}
            onClick={() => setSelectedDay(null)}
          >
            Vue fusionnée ({dayEntries.length} journée(s))
          </button>
          {dayEntries.map((entry) => (
            <button
              key={entry.date}
              type="button"
              className="button"
              disabled={selectedDay === entry.date}
              onClick={() => setSelectedDay(entry.date)}
            >
              Journée {frDate(entry.date)}
            </button>
          ))}
        </nav>
      ) : null}

      {body}
    </div>
  )
}
