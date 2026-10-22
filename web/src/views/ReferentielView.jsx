import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REFERENTIEL_PAR_DEFAUT as RESPIRE } from '@engine/conformite.js'
import ReferentielChoice from '../components/ReferentielChoice.jsx'
import { listPublishedReferentiels, loadPublishedReferentiel } from '../data/referentiel.js'
import { getReferentiel } from '../data/load.js'
import { referentielHash } from '../router.js'

/** Le menu remplace l'adresse : choisir un référentiel n'empile pas d'historique. */
const remplacerAdresse = (hash) => window.location.replace(hash)

/**
 * Référentiel public (P4.4, cahier §4.1/§3.5) : arbre pôles -> compétences
 * de la version publiée, tels qu'elle les déclare, aux couleurs des pôles,
 * recherche plein-texte client (code, nom et définition, insensible aux
 * accents), permalien par compétence (#/referentiel/<code> : défilement +
 * surbrillance), et bandeau sobre vers l'espace participatif Decidim — qui
 * nourrit et critique le référentiel, sans le remplacer.
 *
 * Tout référentiel publié (S5, lot E) : le menu « Référentiel »
 * (ReferentielChoice) les propose, chacun à sa dernière version, RESPIRE par
 * défaut ; l'adresse nomme un autre par `?id=<id>` (lien profond, permaliens
 * compris), et le menu la remplace. Un référentiel se lit comme dans les
 * parcours (data/referentiel.js, `{id}`) : la base par l'API publique
 * d'abord, l'export statique en repli, RESPIRE embarqué en dernier. Un
 * identifiant qui ne se charge pas est dit, et RESPIRE s'affiche à sa place ;
 * le menu montre alors RESPIRE, le référentiel affiché, et y choisir de
 * nouveau celui qui a échoué le redemande.
 * La provenance d'un autre référentiel que RESPIRE (son `source` : d'où il
 * vient, sa licence — S5, E9) s'affiche sous l'en-tête, quelle que soit la
 * source de lecture.
 *
 * @param {{focusCode?: string | null, referentielId?: string | null,
 *   load?: typeof loadPublishedReferentiel, list?: typeof listPublishedReferentiels,
 *   replaceHash?: (hash: string) => void}} props `load`, `list` et `replaceHash` sont des coutures de test.
 */
export default function ReferentielView({
  focusCode = null,
  referentielId = null,
  load = loadPublishedReferentiel,
  list = listPublishedReferentiels,
  replaceHash = remplacerAdresse,
}) {
  // Le référentiel demandé par l'adresse ; null : RESPIRE, le défaut.
  const choix = referentielId && referentielId !== RESPIRE ? referentielId : null
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  // Le numéro de l'essai : choisir de nouveau un référentiel qui n'a pas pu être chargé le redemande.
  const [essai, setEssai] = useState(0)

  useEffect(() => {
    let alive = true
    const show = (result, introuvable) => {
      if (alive) setData({ ...result, choix, essai, introuvable })
    }
    // loadPublishedReferentiel ne rejette jamais pour RESPIRE sans version ;
    // ceinture et bretelles pour un chargeur injecté : le référentiel embarqué.
    const respire = () => load({ id: RESPIRE }).catch(() => ({ doc: getReferentiel(), origin: 'bundled' }))
    if (choix === null) {
      respire().then((result) => show(result, false))
    } else {
      load({ id: choix })
        .then((result) => show(result, false))
        .catch(() => respire().then((result) => show(result, true)))
    }
    return () => {
      alive = false
    }
  }, [load, choix, essai])

  // Lu par `choisir` sans en changer l'identité (le menu en dépend dans un effet).
  const dataRef = useRef(data)
  dataRef.current = data

  const choisir = useCallback(
    (referentiel) => {
      const id = referentiel.id === RESPIRE ? null : referentiel.id
      if (id !== choix) {
        replaceHash(referentielHash(null, referentiel.id))
      } else if (id !== null && dataRef.current?.choix === choix && dataRef.current.introuvable) {
        setEssai((n) => n + 1) // celui qui n'a pas pu être chargé, demandé de nouveau : réessayé
      }
    },
    [choix, replaceHash],
  )

  const doc = data?.doc ?? null
  // Le document affiché est-il celui que demande l'adresse ? Sinon, le
  // suivant se charge (ou se charge de nouveau) : l'ancien reste affiché, sans alerte.
  const aJour = data !== null && data.choix === choix && data.essai === essai
  const introuvable = aJour && data.introuvable

  // Défilement vers la compétence permaliée une fois l'arbre rendu.
  useEffect(() => {
    if (!doc || !focusCode) return
    const element = document.getElementById(competenceDomId(focusCode))
    element?.scrollIntoView?.({ block: 'center' })
  }, [doc, focusCode])

  const trimmedQuery = query.trim()
  const poles = useMemo(() => {
    if (!doc) return []
    const folded = fold(trimmedQuery)
    return (doc.poles ?? []).map((pole) => ({
      ...pole,
      competences: (doc.competences ?? []).filter(
        (competence) =>
          competence.pole === pole.num &&
          (folded === '' ||
            fold(`${competence.code} ${competence.nom} ${competence.description ?? ''}`).includes(
              folded,
            )),
      ),
    }))
  }, [doc, trimmedQuery])

  if (!doc) {
    return (
      <div className="referentiel">
        <p className="ref-loading">Chargement du référentiel…</p>
      </div>
    )
  }

  const shown = poles.reduce((sum, pole) => sum + pole.competences.length, 0)
  const total = (doc.competences ?? []).length
  // L'exemple de la recherche : le premier code du référentiel affiché (« 1.01 » pour RESPIRE).
  const exemple = (doc.competences ?? [])[0]?.code ?? null
  const focusKnown =
    focusCode === null || (doc.competences ?? []).some((c) => c.code === focusCode)
  const provenance =
    doc.id !== RESPIRE && typeof doc.source === 'string' && doc.source !== '' ? doc.source : null

  return (
    <div className="referentiel" aria-busy={aJour ? undefined : 'true'}>
      <header className="ref-header">
        <h1>Référentiel de compétences</h1>
        <div className="ref-choice">
          <ReferentielChoice
            // le référentiel affiché : RESPIRE (null) à la place d'un introuvable
            value={choix && !introuvable ? { id: choix } : null}
            onChange={choisir}
            list={list}
            provenance={false}
          />
        </div>
        <p className="ref-version">
          {doc.label ?? doc.id} — version {doc.version} · {(doc.poles ?? []).length} pôles,{' '}
          {total} compétences. Public en lecture, édité par les épistémiarques, versionné :
          aucune version publiée n’est modifiée en place.
        </p>
        {provenance ? <p className="ref-source">Provenance : {provenance}</p> : null}
      </header>

      <aside className="ref-decidim">
        <p>
          Le référentiel s’édite collectivement : l’espace participatif Decidim d’Harmonia
          Éducation nourrit et critique le référentiel, il ne le remplace pas.
        </p>
        <a className="button" href="https://participer.harmonia.education" rel="noreferrer">
          Participer sur participer.harmonia.education
        </a>
      </aside>

      {introuvable ? (
        <p className="load-error" role="alert">
          Le référentiel «&nbsp;{choix}&nbsp;» n’a pas pu être chargé :{' '}
          {/* le menu montre RESPIRE, affiché : ce lien rend l'adresse sans l'identifiant introuvable */}
          <a href={referentielHash()}>RESPIRE</a> s’affiche à sa place.
        </p>
      ) : aJour && !focusKnown ? (
        <p className="load-error" role="alert">
          Compétence «&nbsp;{focusCode}&nbsp;» introuvable dans cette version du référentiel.
        </p>
      ) : null}

      <p className="ref-search">
        <label htmlFor="ref-search-input">Rechercher une compétence</label>
        <input
          id="ref-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={exemple ? `Code ou nom — ex. ${exemple}` : 'Code ou nom'}
          autoComplete="off"
        />
      </p>
      <p className="ref-count" role="status">
        {trimmedQuery === ''
          ? `${total} compétences.`
          : `${shown} compétence${shown > 1 ? 's' : ''} sur ${total} pour « ${trimmedQuery} ».`}
      </p>

      {poles.map((pole) =>
        trimmedQuery !== '' && pole.competences.length === 0 ? null : (
          <section
            key={pole.num}
            className="ref-pole"
            style={{ '--pole-color': pole.couleur }}
            aria-label={pole.nom}
          >
            <h2 className="ref-pole-title">
              {pole.nom}{' '}
              <span className="ref-pole-count">
                {pole.competences.length} compétence{pole.competences.length > 1 ? 's' : ''}
              </span>
            </h2>
            <ul className="ref-competences">
              {pole.competences.map((competence) => {
                const focused = competence.code === focusCode
                return (
                  <li
                    key={competence.code}
                    id={competenceDomId(competence.code)}
                    className={`ref-competence${focused ? ' ref-competence-focus' : ''}`}
                  >
                    <a
                      className="ref-competence-code"
                      href={referentielHash(competence.code, doc.id)}
                      aria-current={focused ? 'true' : undefined}
                      title={`Lien direct vers la compétence ${competence.code}`}
                    >
                      {competence.code}
                    </a>
                    <span className="ref-competence-name">{competence.nom}</span>
                    {competence.description ? (
                      <span className="ref-competence-desc">{competence.description}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  )
}

/** @param {string} code @returns {string} stable DOM id for a competence row */
function competenceDomId(code) {
  return `competence-${code}`
}

/** Accent- and case-insensitive folding for the client-side search. */
function fold(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
