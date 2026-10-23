// Interface ultime — les traces de la stigmergie du greffier de Twin9 dans
// la cartographie d'une journée (sprint 3, lot S3-3 ; core/stigmergie.js).
//
// Sous les verdicts de la modale du jour, quand l'analyse qui compte en a
// laissé : chaque trace avec sa compétence, sa nature (l'incertitude que la
// procédure a calculée, dite en mots et par la marque de son surlignage), le
// dernier verdict qui l'a déposée, son passage, et « Ouvrir dans le
// portfolio », qui le surligne selon sa nature. Son intensité ne se lit qu'en
// mode expert et pour le cartographe (`intensites`), jamais comme une note.
// Des traces non conservées (une journée en panne) le disent, en tête : elles
// ne guident pas l'analyse suivante.

import { useEffect, useMemo } from 'react'
import { NEED_DAY } from '../core/split.js'
import { INCERTITUDES, TAU_MAX, formatIntensite } from '../core/stigmergie.js'
import { traceClass } from './highlight-dom.js'
import { poleVars } from './colors.js'
import { usePalette } from './palette.js'

const SNIPPET = 220
const snippet = (s) => (s.length > SNIPPET ? `${s.slice(0, SNIPPET).trimEnd()}…` : s)

/** La marque d'une nature de trace, telle que le portfolio la surligne, avec son libellé. */
export function TraceNature({ incertitude }) {
  const nature = INCERTITUDES[incertitude]
  if (!nature) return null
  return <mark className={`carto-hl carto-hl--complete${traceClass(incertitude)}`}>{nature.label}</mark>
}

/** Ce que les traces d'une analyse sont pour la carte : conservées, non conservées (panne), non confirmées. */
export function conservationText(conservee) {
  if (conservee === true) return 'Conservées dans la mémoire de la carte : le greffier de la prochaine analyse de cette journée les relira.'
  if (conservee === false) {
    return 'Non conservées : l’analyse de cette journée n’est pas dans la mémoire de la carte — un appel de la journée est tombé en panne, et une panne n’est jamais un verdict. Elles ne guideront pas l’analyse suivante, qui refera celle-ci.'
  }
  return 'Non confirmées : rien ne dit qu’elles sont dans la mémoire de la carte ; elles ne sont pas montrées comme conservées.'
}

/**
 * @param {{date: string, variant: object | null, refl: object,
 *   getDetail: (date: string, need?: string) => object | null | undefined,
 *   ensureDetails?: (dates: string[], need?: string) => void,
 *   intensites?: boolean,
 *   onOpenPassage?: (p: {date: string, extract: string, label: string, incertitude: string, conservee: boolean | null, intensite?: string}) => void}} props
 *   variant : l'analyse qui compte ce jour (son résumé dit s'il a des traces : `stigmergie`) ;
 *   intensites : montrer l'intensité de chaque trace (mode expert, cartographe : core/stigmergie.js)
 */
export function StigmergieDuJour({ date, variant, refl, getDetail, ensureDetails, intensites = false, onOpenPassage }) {
  const palette = usePalette()
  const resume = variant?.stigmergie ?? null
  const has = Boolean(resume && resume.traces > 0)
  // Lues avec la journée seule (D-67) : le détail de la journée porte les traces.
  useEffect(() => {
    if (has) ensureDetails?.([date], NEED_DAY)
  }, [has, ensureDetails, date])
  const detail = has ? getDetail(date, NEED_DAY) : null
  const bloc = detail === undefined ? undefined : (detail?.variants?.[variant?.id]?.stigmergie ?? null)
  const traces = useMemo(() => {
    const order = (code) => refl.compByCode.get(code)?.order ?? 999
    return [...(bloc?.traces ?? [])].sort((a, b) => order(a.code) - order(b.code) || (a.start ?? 0) - (b.start ?? 0))
  }, [bloc, refl])
  if (!has) return null
  const conservee = bloc?.conservee ?? resume.conservee ?? null
  const id = `carto-sg-${date}`
  return (
    <section className="carto-sg" aria-labelledby={id}>
      <h3 id={id}>Traces de la stigmergie ({resume.traces})</h3>
      <p className="carto-small carto-muted">
        Des passages validés par la procédure{resume.analyse ? `, à l’analyse n° ${resume.analyse} de cette journée` : ''} : le greffier de l’analyse suivante les
        relit. Leur nature est l’incertitude que la procédure a calculée sur la validité de la preuve.
      </p>
      <p className={conservee === true ? 'carto-small' : 'carto-small carto-sg-warning'} role={conservee === true ? undefined : 'note'}>
        {conservationText(conservee)}
      </p>
      <p className="carto-small carto-sg-legend">
        {Object.keys(INCERTITUDES).map((k, i) => (
          <span key={k}>
            {i > 0 ? ' · ' : ''}
            <TraceNature incertitude={k} />
          </span>
        ))}
      </p>
      {bloc === undefined ? (
        <p className="carto-muted">Chargement…</p>
      ) : traces.length === 0 ? (
        <p className="carto-muted">Traces illisibles dans le détail de cette journée.</p>
      ) : (
        <ul className="carto-verdict-list carto-sg-list">
          {traces.map((t, i) => {
            const meta = refl.compByCode.get(t.code)
            const nature = INCERTITUDES[t.incertitude]
            const intensite = intensites ? formatIntensite(t.tau) : null
            return (
              <li key={t.id ?? `${t.code}|${i}`} className="carto-pole" style={poleVars(refl.poleByNum.get(meta?.pole)?.color ?? '#78716c', palette)}>
                <p className="carto-sg-what">
                  <span className="carto-code">{t.code}</span> {meta?.name ?? '(hors référentiel)'} · <TraceNature incertitude={t.incertitude} />
                  {intensite !== null ? (
                    <span className="carto-count">
                      {' '}
                      · intensité {intensite} sur {TAU_MAX}
                      {t.analyses ? `, déposée par ${t.analyses} analyse${t.analyses > 1 ? 's' : ''}` : ''}
                    </span>
                  ) : null}
                </p>
                {t.statut ? (
                  <p className="carto-small carto-muted">
                    Dernier verdict : {t.statut}
                    {t.voie ? `, ${t.voie}` : ''}
                    {t.role ? ` (${t.role})` : ''} — {nature.consigne}.
                  </p>
                ) : null}
                <blockquote className="carto-sg-extract">« {snippet(t.extrait)} »</blockquote>
                {onOpenPassage ? (
                  <button
                    type="button"
                    className="carto-link-btn"
                    onClick={() =>
                      onOpenPassage({
                        date,
                        extract: t.extrait,
                        label: `Trace ${t.code} · ${nature.label}`,
                        incertitude: t.incertitude,
                        conservee,
                        ...(intensite !== null ? { intensite } : {}),
                      })
                    }
                  >
                    Ouvrir dans le portfolio
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
