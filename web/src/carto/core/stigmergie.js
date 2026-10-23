// Interface ultime — les traces de la stigmergie du greffier de Twin9 (sprint
// 3, lot S3-3 ; docs/twin9/spec-stigmergie.md §9 et §11.3 de Twin_v9).
//
// Une analyse Twin9 dont la stigmergie est activée laisse, dans la mémoire
// de la carte, des TRACES : un passage du portfolio validé par la procédure
// (juge léger, tribunal) pour une compétence, avec un niveau d'incertitude
// calculé par la procédure et une intensité qui s'évapore d'une analyse de la
// journée à l'autre. Seul le greffier de l'analyse suivante les lit. La carte
// du jour en garde l'état après l'analyse (son bloc `stigmergie`), que
// l'importeur du run recopie par liste blanche dans le détail de la journée.
//
// Ce qu'en montre l'interface :
//   - le passage de chaque trace, surligné selon son incertitude ;
//   - son intensité, en mode expert et pour le cartographe SEULEMENT, jamais
//     comme une note : c'est la force d'une piste pour le greffier, pas une
//     évaluation de la personne (le mot « score » n'est jamais employé) ;
//   - des traces « non conservées » quand l'analyse de la journée n'est pas
//     entrée dans la mémoire de la carte — un appel de la journée en panne
//     (une panne n'est jamais un verdict) : le serveur le dit
//     (`traces_conservees` des résultats), et sans ce signal l'interface ne
//     les dit jamais conservées.

import { isIsoDate } from './dates.js'

/** L'intensité la plus haute d'une trace (τ_max du moteur). */
export const TAU_MAX = 3

/**
 * Les natures de trace, dans l'ordre de la plus sûre à l'écartée : le mot de
 * la procédure, la classe du surlignage, son libellé, ce qu'en fait le
 * greffier de l'analyse suivante (le texte des lignes de traces du moteur,
 * spec §8.4).
 */
export const INCERTITUDES = Object.freeze({
  faible: { slug: 'faible', label: 'incertitude faible', consigne: 'le greffier la reverse comme pièce si le passage porte toujours la compétence' },
  moyenne: { slug: 'moyenne', label: 'incertitude moyenne', consigne: 'le greffier la recoupe' },
  forte: { slug: 'forte', label: 'incertitude forte', consigne: 'le greffier la verse avec ses objections' },
  'écartée': { slug: 'ecartee', label: 'écartée', consigne: 'déjà instruite et non retenue : le greffier ne la reverse que sur élément nouveau' },
})

const estObjet = (x) => Boolean(x && typeof x === 'object' && !Array.isArray(x))
const texteOuNull = (x) => (typeof x === 'string' ? x : null)
const entierOuNull = (x) => (Number.isInteger(x) ? x : null)

/**
 * Une trace du bloc, réduite à ses champs nommés (valeurs simples), ou null :
 * sans code, sans extrait, d'une incertitude inconnue ou d'une intensité qui
 * n'est pas un nombre fini, elle ne se montre pas.
 */
function traceGardee(t) {
  if (!estObjet(t) || typeof t.code !== 'string' || t.code === '' || typeof t.extrait !== 'string' || t.extrait.trim() === '') return null
  if (!Object.hasOwn(INCERTITUDES, t.incertitude) || typeof t.tau !== 'number' || !Number.isFinite(t.tau)) return null
  return {
    id: texteOuNull(t.id),
    code: t.code,
    start: entierOuNull(t.start),
    end: entierOuNull(t.end),
    extrait: t.extrait,
    tau: t.tau,
    incertitude: t.incertitude,
    statut: texteOuNull(t.statut),
    voie: texteOuNull(t.voie),
    role: texteOuNull(t.role),
    source: texteOuNull(t.source),
    analyses: entierOuNull(t.analyses),
  }
}

/**
 * Le bloc `stigmergie` d'une carte du jour tel que le jeu le garde : son rang
 * (`analyse`), son run, ses traces par liste blanche, et si elles sont
 * conservées dans la mémoire de la carte — `true`, `false` (l'analyse n'y est
 * pas : une journée en panne), ou `null` quand rien ne le dit (jamais
 * montrées conservées). Ni les dépôts, ni les rejets, ni les traces lues.
 * @param {unknown} bloc `carte.stigmergie`
 * @param {boolean | null} conservee
 * @returns {{analyse: number | null, run: string | null, conservee: boolean | null, traces: object[]} | null}
 *   null sans bloc (la stigmergie désactivée)
 */
export function stigmergieGardee(bloc, conservee) {
  if (!estObjet(bloc)) return null
  return {
    analyse: entierOuNull(bloc.analyse),
    run: texteOuNull(bloc.run),
    conservee: typeof conservee === 'boolean' ? conservee : null,
    traces: (Array.isArray(bloc.traces) ? bloc.traces : []).map(traceGardee).filter(Boolean),
  }
}

/**
 * Ce que l'index d'un jeu dit des traces d'une analyse (sans lire son
 * détail) : son rang, combien de traces, et si elles sont conservées.
 * @param {ReturnType<typeof stigmergieGardee>} gardee
 */
export function resumeStigmergie(gardee) {
  return { analyse: gardee.analyse, traces: gardee.traces.length, conservee: gardee.conservee }
}

/**
 * Les traces d'une journée qui sont l'état gardé de sa carte : celles de
 * l'analyse qui compte (la variante active), si elles sont conservées ;
 * sinon celles de l'analyse conservée de plus haut rang. Jamais des traces
 * non conservées.
 * @param {{variants?: object[], activeVariantId?: string | null} | undefined} day journée de l'index
 * @param {{variants?: Record<string, object>} | null | undefined} detail son détail
 * @returns {{variantId: string, bloc: object} | null}
 */
export function tracesConserveesDuJour(day, detail) {
  const candidats = (day?.variants ?? [])
    .map((v) => ({ variantId: v.id, bloc: detail?.variants?.[v.id]?.stigmergie }))
    .filter((c) => c.bloc?.conservee === true && c.bloc.traces?.length > 0)
  if (candidats.length === 0) return null
  return candidats.find((c) => c.variantId === day.activeVariantId) ?? [...candidats].sort((a, b) => (b.bloc.analyse ?? 0) - (a.bloc.analyse ?? 0))[0]
}

/** Le jeu a-t-il, dans son index, des traces conservées à surligner ? */
export function hasConservedTraces(dataset) {
  return (dataset?.days ?? []).some((d) => isIsoDate(d?.date) && (d.variants ?? []).some((v) => v?.stigmergie?.conservee === true && v.stigmergie.traces > 0))
}

/** L'intensité d'une trace, à deux décimales, à la française. */
export function formatIntensite(tau) {
  return Number(tau).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Les intensités se montrent-elles ? En mode expert et pour le cartographe
 * seulement (décision Q6 du sprint 3) : jamais par défaut — ni dans une
 * copie autonome, ni sans session.
 * @param {{roles?: string[], expert?: boolean} | null | undefined} session
 * @param {{viewer?: boolean}} [opts]
 */
export function intensitesVisibles(session, { viewer = false } = {}) {
  if (viewer || !session) return false
  return session.expert === true || (session.roles ?? []).includes('cartographe')
}
