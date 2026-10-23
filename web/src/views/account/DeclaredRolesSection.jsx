// « Mes rôles RESPIRE » dans le profil (#/compte, sprint 8, UC-CPT-07).
//
// La personne coche les rôles de l'écosystème RESPIRE qu'elle se reconnaît,
// et, avec promptagogue, épistémiarque ou maître du grimoire, la case
// « membre du cercle des fondateurs ». Une déclaration NE DONNE AUCUN ACCÈS
// (docs/autorisations.md, principe 7) : les espaces du menu suivent les
// habilitations, que seul l'administrateur attribue (UC-ADM-01). La section
// le dit, et n'a aucun moyen d'en ouvrir un : elle n'écrit que
// PUT api/auth/me/declared-roles et ne prévient pas le shell.
//
// Le catalogue (libellés, définitions, éligibilité au cercle) est celui que
// sert l'API (Auth\DeclaredRoles::catalogue) ; le serveur revérifie la case du
// cercle à chaque écriture (422), l'IHM la retire dès que le dernier rôle
// éligible est décoché.

import { useEffect, useMemo, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import {
  FOUNDING_CIRCLE_LABEL,
  fetchDeclaredRoles as fetchDeclaredRolesApi,
  saveDeclaredRoles as saveDeclaredRolesApi,
} from '../../api/declared-roles.js'

/** @param {unknown} error @returns {string} message affichable (détails par champ d'un 422) */
function message(error) {
  if (error instanceof ApiError) {
    const details = Object.values(error.fields ?? {}).filter((value) => typeof value === 'string')
    if (details.length > 0) return details.join(' ')
    return error.serverMessage ?? error.message
  }
  if (error instanceof ApiUnavailableError) return error.message
  return 'Enregistrement impossible. Réessayez.'
}

/** @param {string[]} a @param {string[]} b @returns {boolean} mêmes éléments */
function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item))
}

/** Libellés joints à la française : « a, b et c ». */
function joinLabels(labels) {
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`
}

/**
 * @param {{deps?: {fetchDeclaredRoles?: typeof fetchDeclaredRolesApi,
 *   saveDeclaredRoles?: typeof saveDeclaredRolesApi}}} props coutures de test
 */
export default function DeclaredRolesSection({ deps = {} }) {
  const fetchDeclaredRoles = deps.fetchDeclaredRoles ?? fetchDeclaredRolesApi
  const saveDeclaredRoles = deps.saveDeclaredRoles ?? saveDeclaredRolesApi

  const [status, setStatus] = useState('loading') // loading | ready | unavailable
  const [catalogue, setCatalogue] = useState([])
  const [saved, setSaved] = useState({ roles: [], foundingCircle: false })
  const [roles, setRoles] = useState([])
  const [foundingCircle, setFoundingCircle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    let alive = true
    fetchDeclaredRoles()
      .then((declaration) => {
        if (!alive) return
        if (declaration.catalogue.length === 0) {
          setStatus('unavailable')
          return
        }
        setCatalogue(declaration.catalogue)
        setSaved({ roles: declaration.roles, foundingCircle: declaration.foundingCircle })
        setRoles(declaration.roles)
        setFoundingCircle(declaration.foundingCircle)
        setStatus('ready')
      })
      .catch(() => {
        // Sans déclaration lisible, pas de formulaire (il écraserait celle du
        // serveur) ; un message discret, le reste du profil reste utilisable.
        if (alive) setStatus('unavailable')
      })
    return () => {
      alive = false
    }
  }, [fetchDeclaredRoles])

  const eligible = useMemo(
    () => catalogue.filter((entry) => entry.foundingCircleEligible).map((entry) => entry.id),
    [catalogue],
  )
  const withHabilitation = useMemo(
    () => catalogue.filter((entry) => entry.habilitation !== null).map((entry) => entry.label.toLowerCase()),
    [catalogue],
  )
  const circleOffered = roles.some((role) => eligible.includes(role))
  const dirty = !sameSet(roles, saved.roles) || foundingCircle !== saved.foundingCircle

  function toggle(id, checked) {
    setFeedback(null)
    const next = checked ? [...roles, id] : roles.filter((role) => role !== id)
    // La case du cercle part avec le dernier rôle qui la porte (le serveur
    // refuserait la déclaration : 422).
    if (!next.some((role) => eligible.includes(role))) setFoundingCircle(false)
    setRoles(catalogue.map((entry) => entry.id).filter((role) => next.includes(role)))
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      const result = await saveDeclaredRoles({ roles, foundingCircle: circleOffered && foundingCircle })
      setSaved({ roles: result.roles, foundingCircle: result.foundingCircle })
      setRoles(result.roles)
      setFoundingCircle(result.foundingCircle)
      setFeedback({
        kind: 'ok',
        message: 'Rôles RESPIRE enregistrés. Vos accès ne changent pas : seul l’administrateur habilite.',
      })
    } catch (error) {
      setFeedback({ kind: 'error', message: message(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-respire" aria-label="Mes rôles RESPIRE">
      <h2>Mes rôles RESPIRE</h2>
      <p className="account-respire-intro">
        Dites quels rôles de l’écosystème RESPIRE sont les vôtres. Ils figurent sur votre compte, que
        l’administrateur voit, et dans votre archive de compte ; ils sont supprimés avec le compte.
      </p>
      <p className="account-respire-notice">
        <strong>Une déclaration ne donne pas d’accès ; l’administrateur habilite.</strong> Les espaces du
        menu suivent vos habilitations (ci-dessus), que seul l’administrateur attribue.
        {withHabilitation.length > 0
          ? ` ${capitalize(joinLabels(withHabilitation))} ont une habilitation du même nom : l’administrateur voit votre déclaration et peut vous l’accorder.`
          : null}
      </p>

      {status === 'loading' ? <p className="account-respire-loading">Chargement de vos rôles RESPIRE…</p> : null}
      {status === 'unavailable' ? (
        <p className="account-respire-unavailable">
          Vos rôles RESPIRE ne peuvent pas être chargés pour le moment. Réessayez plus tard.
        </p>
      ) : null}

      {status === 'ready' ? (
        <form className="account-respire-form" onSubmit={save}>
          <fieldset className="account-respire-roles" disabled={busy}>
            <legend>Les rôles que je me reconnais</legend>
            <ul className="account-respire-list">
              {catalogue.map((entry) => (
                <li key={entry.id} className="account-respire-item">
                  <input
                    type="checkbox"
                    id={`respire-${entry.id}`}
                    checked={roles.includes(entry.id)}
                    onChange={(event) => toggle(entry.id, event.target.checked)}
                    aria-describedby={entry.definition ? `respire-${entry.id}-definition` : undefined}
                  />
                  <label htmlFor={`respire-${entry.id}`} className="account-respire-label">
                    {entry.label}
                  </label>
                  {entry.definition ? (
                    <span id={`respire-${entry.id}-definition`} className="account-respire-definition">
                      {entry.definition}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {circleOffered ? (
              <div className="account-respire-founding">
                <input
                  type="checkbox"
                  id="respire-founding-circle"
                  checked={foundingCircle}
                  onChange={(event) => {
                    setFeedback(null)
                    setFoundingCircle(event.target.checked)
                  }}
                  aria-describedby="respire-founding-circle-hint"
                />
                <label htmlFor="respire-founding-circle" className="account-respire-label">
                  {FOUNDING_CIRCLE_LABEL}
                </label>
                <span id="respire-founding-circle-hint" className="account-respire-definition">
                  Proposé aux promptagogues, épistémiarques et maîtres du grimoire.
                </span>
              </div>
            ) : null}
          </fieldset>
          <button type="submit" className="button" disabled={busy || !dirty}>
            {busy ? '…' : 'Enregistrer mes rôles'}
          </button>
        </form>
      ) : null}

      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'load-error' : 'account-respire-ok'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  )
}

/** @param {string} text @returns {string} première lettre en capitale */
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
