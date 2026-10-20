import { frenchDate } from '../data/load.js'

/** « 12 / 61 » with the referential's total, « 12 » without it. */
export function sur(compte, total) {
  return Number.isFinite(total) ? `${compte} / ${total}` : String(compte)
}

/**
 * Header statistics of the merge view. The established competences are
 * counted out of the referential's (totalCompetences, read from the
 * referential of the document); without it, the count stands alone.
 * @param {{mergeDoc: object, totalCompetences?: number|null}} props
 */
export default function StatBadges({ mergeDoc, totalCompetences = null }) {
  const periode = mergeDoc?.periode ?? {}
  const meta = mergeDoc?.profilMeta ?? {}
  const items = [
    { label: 'Feuilles de portfolio', value: String(periode.nbFeuilles ?? meta.nb_feuilles ?? '—') },
    {
      label: 'Période',
      value:
        periode.premiere && periode.derniere
          ? `${frenchDate(periode.premiere)} → ${frenchDate(periode.derniere)}`
          : '—',
    },
    {
      label: 'Compétences établies',
      value:
        meta.competences_etablies != null
          ? sur(meta.competences_etablies, totalCompetences)
          : '—',
    },
  ]

  return (
    <ul className="stat-badges">
      {items.map(({ label, value }) => (
        <li key={label} className="stat-badge">
          <span className="stat-badge-value">{value}</span>
          <span className="stat-badge-label">{label}</span>
        </li>
      ))}
    </ul>
  )
}
