// Visionneuse d'une cartographie du tableau de bord (P8, câblage onOpen
// B <-> C) : rend le document sélectionné dans « Mes cartographies » en
// LECTURE SEULE avec les vues existantes (MergeView / DayView, P2) — même
// motif que ShareView, mais local : le document vient du carto-store
// (IndexedDB) ou de la copie serveur déjà chargée, jamais d'un appel réseau.

import { useEffect, useMemo, useState } from 'react'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import { chargerReferentielDuDocument } from '../../lib/referentiel-du-document.js'
import { twin9ToMergeDocument } from '../../lib/twin9/mapper.js'
import DayView from '../DayView.jsx'
import MergeView from '../MergeView.jsx'

/**
 * @param {object} props
 * @param {object} props.document cartographie (schéma jour, merge, ou
 *   carto_evolutive Twin9 — projetée vers le sunburst via l'adaptateur, D12)
 * @param {{type: 'jour'|'merge'|'twin9', titre: string, referentiel?: {id: string, version: string} | null}} props.entry
 *   métadonnées carto-store (son référentiel, quand le run l'a noté)
 * @param {() => void} props.onClose retour au tableau de bord
 * @param {object} [props.lib] module sunburst (App / tests)
 * @param {typeof loadPublishedReferentiel} [props.getReferentiel] couture de test
 */
export default function CartographyViewer({
  document,
  entry,
  onClose,
  lib,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [referentiel, setReferentiel] = useState(null)
  const [referentielError, setReferentielError] = useState(null)
  const referenceId = entry.referentiel?.id ?? null
  const referenceVersion = entry.referentiel?.version ?? null

  // Les libellés des deux vues viennent du référentiel de la cartographie
  // (2026-10-20) : la version que l'entrée a notée, sinon celui que nomme le
  // document, RESPIRE pour un document qui n'en nomme pas (repli sur la copie
  // embarquée) ; un autre référentiel introuvable est dit, jamais lu en RESPIRE.
  useEffect(() => {
    let active = true
    setReferentiel(null)
    setReferentielError(null)
    chargerReferentielDuDocument(document, {
      connu: referenceId ? { id: referenceId, version: referenceVersion } : null,
      getReferentiel,
    }).then(
      (loaded) => active && setReferentiel(loaded),
      (error) => active && setReferentielError(error.message),
    )
    return () => {
      active = false
    }
  }, [document, referenceId, referenceVersion, getReferentiel])

  // getDay stable : le document est déjà là, DayView le reçoit tel quel.
  const getDay = useMemo(() => () => Promise.resolve(document), [document])

  // Type twin9 (D12) : le document stocké est le carto_evolutive NATIF (source
  // de vérité) ; la vue merge est re-dérivée ici via l'adaptateur du moteur
  // (le référentiel publié a déjà la forme {poles, competences} attendue).
  const twin9Merge = useMemo(() => {
    if (entry.type !== 'twin9' || !referentiel || !document) return null
    try {
      return twin9ToMergeDocument(document, referentiel, { generatedAt: document.date ?? null })
    } catch {
      return null
    }
  }, [entry.type, referentiel, document])

  let body
  if (referentielError) {
    body = <p role="alert">{referentielError}</p>
  } else if (referentiel === null) {
    body = <p role="status">Chargement du référentiel…</p>
  } else if (entry.type === 'twin9') {
    body = twin9Merge ? (
      <MergeView mergeDoc={twin9Merge} referentiel={referentiel} lib={lib} />
    ) : (
      <p role="alert">
        Cette analyse Twin9 ne porte aucune journée datée : rien à projeter sur le sunburst.
        Le document JSON reste exportable depuis « Mes cartographies ».
      </p>
    )
  } else if (entry.type === 'merge') {
    body = <MergeView mergeDoc={document} referentiel={referentiel} lib={lib} />
  } else {
    body = (
      <DayView
        date={document?.date}
        referentiel={referentiel}
        days={document?.date ? [document.date] : []}
        getDay={getDay}
        lib={lib}
      />
    )
  }

  return (
    <div className="espace-carto-viewer" data-testid="carto-viewer">
      <p>
        <button type="button" className="button" onClick={onClose}>
          ← Retour au tableau de bord
        </button>
      </p>
      <h2>{entry.titre}</h2>
      {body}
    </div>
  )
}
