// Hub public des guides / manuels de prise en main (#/guides).
//
//   #/guides                         -> accueil : les parcours de la session
//                                       d'abord, puis « Autres parcours » ;
//                                       cartes groupées par famille
//   #/guides/<parcours>              -> liste des chapitres du parcours
//   #/guides/<parcours>/<chapitre>   -> chapitre rendu
//
// Réutilise le mécanisme de formation existant (content/formation/<parcours>/
// + FormationSection) : le MÊME markdown sert les espaces de rôle connectés et
// ce hub public. Lisible par TOUS (pas de garde de rôle) — les manuels sont
// pédagogiques. La progression se synchronise au compte si l'on est connecté,
// sinon reste locale (createTrainingStore, comme les espaces).

import { useEffect, useState } from 'react'
import { fetchMe } from '../api/client.js'
import { guidesHash } from '../router.js'
import {
  FORMATION_META,
  FORMATION_PARCOURS,
  guidesBaseHash,
} from './espace/formation-content.js'
import FormationSection from './espace/FormationSection.jsx'

/** Ordre d'affichage des familles de cartes sur l'accueil. */
const FAMILY_ORDER = [
  'Découvrir',
  'Votre cartographie',
  'Encadrer',
  'Faire évoluer',
  'Administrer',
  'Écosystème RESPIRE',
]

/** Parcours d'un public sans rôle (visiteur, compte sans rôle) : ce qu'il peut faire tout de suite. */
const PUBLIC_PARCOURS = Object.freeze(['visiteur', 'apprenant', 'employeur'])

/**
 * Les parcours propres à une session, présentés en tête du hub (sprint 1,
 * amélioration 14) : un parcours par rôle détenu (l'identifiant d'un parcours
 * de rôle est le nom du rôle) ; sans rôle, visiteur, apprenant et employeur.
 * @param {string[] | null | undefined} roles
 * @returns {string[]} identifiants de parcours, dans l'ordre de FORMATION_PARCOURS
 */
export function guidesDeLaSession(roles) {
  const own = FORMATION_PARCOURS.filter((id) => (roles ?? []).includes(id))
  return own.length > 0 ? own : FORMATION_PARCOURS.filter((id) => PUBLIC_PARCOURS.includes(id))
}

/** Cartes d'un groupe de parcours, rangées par famille d'usage. */
function GuidesFamilies({ parcoursList }) {
  const families = FAMILY_ORDER.filter((f) => parcoursList.some((p) => p.famille === f))
  return families.map((family) => (
    <section key={family} className="guides-family" aria-label={family}>
      <h3>{family}</h3>
      <ul className="guides-cards">
        {parcoursList
          .filter((p) => p.famille === family)
          .map((p) => (
            <li key={p.id} className="guides-card">
              <a href={p.id === 'admin' ? guidesHash('admin') : guidesHash(p.id)}>
                <span className="guides-card-audience">{p.audience}</span>
                <strong className="guides-card-titre">{p.titre}</strong>
                <span className="guides-card-pitch">{p.pitch}</span>
                <span className="guides-card-cta" aria-hidden="true">
                  Commencer →
                </span>
              </a>
            </li>
          ))}
      </ul>
    </section>
  ))
}

/**
 * Accueil du hub : les parcours de la session d'abord (« Vos guides », ou
 * « Pour commencer » sans rôle), puis « Autres parcours » ; dans chaque
 * groupe, les cartes sont rangées par famille d'usage. Chaque parcours a UNE
 * carte.
 * @param {{roles: string[]}} props
 */
function GuidesHome({ roles }) {
  const parcoursList = FORMATION_PARCOURS.map((id) => ({ id, ...FORMATION_META[id] })).sort(
    (a, b) => a.ordre - b.ordre,
  )
  const ownIds = guidesDeLaSession(roles)
  const own = parcoursList.filter((p) => ownIds.includes(p.id))
  const others = parcoursList.filter((p) => !ownIds.includes(p.id))
  const withRole = FORMATION_PARCOURS.some((id) => roles.includes(id))

  return (
    <div className="guides-home">
      <p className="guides-lede">
        Des manuels de prise en main, un par profil d’utilisateur : ce que vous pouvez faire sur
        humanome.xyz et par où passer pour le faire. Tous les guides sont en accès libre.
      </p>
      <section className="guides-group guides-group--own" aria-labelledby="guides-own-title">
        <h2 id="guides-own-title">{withRole ? 'Vos guides' : 'Pour commencer'}</h2>
        <GuidesFamilies parcoursList={own} />
      </section>
      {others.length > 0 ? (
        <section className="guides-group" aria-labelledby="guides-others-title">
          <h2 id="guides-others-title">Autres parcours</h2>
          <GuidesFamilies parcoursList={others} />
        </section>
      ) : null}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string | null} props.parcours id du parcours (null = accueil du hub)
 * @param {string | null} props.chapter slug de chapitre (null = liste)
 * @param {object} [props.deps] coutures de test : {fetchMeFn}
 */
export default function GuidesView({ parcours, chapter, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const [connected, setConnected] = useState(false)
  // Rôles de la session : ses parcours passent en tête de l'accueil du hub.
  const [roles, setRoles] = useState([])

  // La progression se rattache au compte si l'on est connecté (sinon locale).
  // Aucune GARDE : un visiteur anonyme lit tout le hub.
  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then(({ user }) => {
        if (!alive) return
        setConnected(Boolean(user))
        setRoles(Array.isArray(user?.roles) ? user.roles : [])
      })
      .catch(() => {
        if (!alive) return
        setConnected(false)
        setRoles([])
      })
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  const known = parcours && FORMATION_PARCOURS.includes(parcours)

  return (
    <div className="guides">
      <h1>
        <a href="#/guides" style={{ textDecoration: 'none', color: 'inherit' }}>
          Guides &amp; prise en main
        </a>
      </h1>
      {parcours && !known ? (
        <div>
          <p role="alert" className="load-error">
            Guide inconnu : « {parcours} ».
          </p>
          <p>
            <a href="#/guides">Retour à tous les guides</a>
          </p>
        </div>
      ) : parcours ? (
        <>
          <p className="guides-breadcrumb">
            <a href="#/guides">← Tous les guides</a>
            {FORMATION_META[parcours] ? ` · ${FORMATION_META[parcours].audience}` : ''}
          </p>
          <FormationSection
            parcours={parcours}
            baseHash={guidesBaseHash(parcours)}
            chapter={chapter}
            connected={connected}
            trainingStore={deps.trainingStore}
          />
          {FORMATION_META[parcours]?.espace ? (
            <p className="privacy-note guides-espace-link">
              Vous avez le rôle {FORMATION_META[parcours].audience.toLowerCase()} ? Votre espace dédié
              est <a href={FORMATION_META[parcours].espace}>ici</a>.
            </p>
          ) : null}
        </>
      ) : (
        <GuidesHome roles={roles} />
      )}
    </div>
  )
}
