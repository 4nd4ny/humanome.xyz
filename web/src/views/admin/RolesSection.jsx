// Section « Rôles » de l'administration (P12.1, cahier §3.8) : rechercher des
// comptes, attribuer et retirer les rôles du référentiel §2. La garde de rôle
// est faite par AdminView (ici l'utilisateur EST admin). API SESSION admin.
//
// Anti-verrouillage : un admin ne peut pas retirer SON PROPRE rôle admin — le
// serveur l'impose (409) ; l'UI retire aussi le bouton correspondant.
//
// Sprint 8 (UC-ADM-01 A7) : à côté des rôles — les HABILITATIONS, qui seules
// ouvrent des droits — la colonne « Rôles déclarés » montre les rôles RESPIRE
// que chaque compte se déclare dans #/compte (UC-CPT-07), qui n'en ouvrent
// aucun. Pour chaque habilitation que ses déclarations appellent et qu'il n'a
// pas (`grantable`, calculé par le serveur), un bouton « Habiliter » l'attribue
// d'un clic : le même POST audité que « Attribuer ». L'administrateur ne
// modifie pas les déclarations. Les messages et le bouton disent
// « habilitation », avec son libellé (ROLE_LABELS : « épistémiarque »).

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { FOUNDING_CIRCLE_LABEL, declaredRoleLabel } from '../../api/declared-roles.js'
import { ROLE_LABELS } from '../../nav.js'
import { ASSIGNABLE_ROLES, frDate, grantRole, listUsers, revokeRole } from './admin-api.js'

/** @param {string} role @returns {string} libellé de l'habilitation (« épistémiarque ») */
const habilitationLabel = (role) => ROLE_LABELS[role] ?? role

/** @param {unknown} value @returns {string[]} liste d'identifiants (vide si absente : API antérieure) */
function slugList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item !== '') : []
}

/** Les rôles RESPIRE que le compte se déclare, et l'habilitation d'un clic. */
function DeclaredCell({ user, onGrant, busy }) {
  const declared = slugList(user.declaredRoles)
  const grantable = slugList(user.grantable).filter((role) => !user.roles.includes(role))
  const foundingCircle = user.foundingCircle === true

  if (declared.length === 0 && !foundingCircle) return <em>aucune déclaration</em>
  return (
    <>
      <ul className="admin-declared-chips" aria-label={`Rôles déclarés par ${user.email}`}>
        {declared.map((role) => (
          <li key={role} className="admin-declared-chip">
            {declaredRoleLabel(role)}
          </li>
        ))}
        {foundingCircle ? <li className="admin-declared-chip">{FOUNDING_CIRCLE_LABEL}</li> : null}
      </ul>
      {grantable.length > 0 ? (
        <div className="admin-declared-grant">
          {grantable.map((role) => (
            <button
              key={role}
              type="button"
              disabled={busy}
              aria-label={`Habiliter « ${habilitationLabel(role)} » pour ${user.email}`}
              onClick={() => onGrant(user.id, role, { declared: true })}
            >
              Habiliter « {habilitationLabel(role)} »
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** Un compte : rôles courants + attribution/retrait. */
function UserRow({ user, currentUserId, onGrant, onRevoke, busy }) {
  const [roleToAdd, setRoleToAdd] = useState('')
  const missing = ASSIGNABLE_ROLES.filter((r) => !user.roles.includes(r))

  return (
    <tr>
      <td>
        <strong>{user.displayName}</strong>
        <br />
        <span className="admin-email">{user.email}</span>
      </td>
      <td>
        {user.roles.length === 0 ? (
          <em>aucun</em>
        ) : (
          <ul className="admin-role-chips">
            {user.roles.map((role) => {
              const isOwnAdmin = user.id === currentUserId && role === 'admin'
              return (
                <li key={role} className="admin-role-chip">
                  <span>{role}</span>
                  {isOwnAdmin ? (
                    <span
                      className="admin-role-lock"
                      title="Anti-verrouillage : vous ne pouvez pas retirer votre propre rôle admin"
                    >
                      🔒
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="admin-role-remove"
                      disabled={busy}
                      aria-label={`Retirer le rôle ${role} de ${user.email}`}
                      onClick={() => onRevoke(user.id, role)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </td>
      <td>
        <DeclaredCell user={user} onGrant={onGrant} busy={busy} />
      </td>
      <td>
        <div className="admin-role-add">
          <label className="visually-hidden" htmlFor={`role-add-${user.id}`}>
            Rôle à attribuer à {user.email}
          </label>
          <select
            id={`role-add-${user.id}`}
            value={roleToAdd}
            disabled={busy || missing.length === 0}
            onChange={(event) => setRoleToAdd(event.target.value)}
          >
            <option value="">— rôle —</option>
            {missing.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || roleToAdd === ''}
            onClick={() => {
              onGrant(user.id, roleToAdd)
              setRoleToAdd('')
            }}
          >
            Attribuer
          </button>
        </div>
      </td>
      <td className="admin-created">{frDate(user.createdAt)}</td>
    </tr>
  )
}

/**
 * @param {object} props
 * @param {number|null} props.currentUserId id de l'admin connecté (anti-verrouillage)
 * @param {typeof fetch} [props.fetchFn] couture de test
 */
export default function RolesSection({ currentUserId, fetchFn }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const result = await listUsers({ query: submitted, page }, fetchFn)
      setData(result)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof ApiUnavailableError
          ? err.message
          : err instanceof ApiError
            ? err.message
            : 'Chargement impossible.',
      )
    }
  }, [submitted, page, fetchFn])

  useEffect(() => {
    load()
  }, [load])

  async function mutate(action, successMessage) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await action()
      setMessage(successMessage)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const onGrant = (userId, role, { declared = false } = {}) =>
    mutate(
      () => grantRole(userId, role, fetchFn),
      `Habilitation « ${habilitationLabel(role)} » accordée${declared ? ', comme le compte l’a déclaré' : ''}.`,
    )
  const onRevoke = (userId, role) =>
    mutate(() => revokeRole(userId, role, fetchFn), `Habilitation « ${habilitationLabel(role)} » retirée.`)

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section className="admin-roles">
      <h2>Comptes et rôles</h2>
      <p className="admin-roles-intro">
        Les <strong>habilitations</strong> ouvrent les espaces et les droits ; seul un administrateur
        les attribue. Les <strong>rôles déclarés</strong> sont ceux que chaque compte se reconnaît dans
        son profil : ils n’ouvrent rien. « Habiliter » accorde l’habilitation qu’une déclaration
        appelle (cartographe, promptologue, épistémiarque).
      </p>
      <form
        className="admin-search"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setSubmitted(query.trim())
        }}
      >
        <label htmlFor="admin-user-search">Rechercher un compte (e-mail ou nom)</label>
        <input
          id="admin-user-search"
          type="search"
          value={query}
          placeholder="ex. : dupond ou @example.org"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Rechercher</button>
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

      {status === 'loading' && !data ? <p role="status">Chargement des comptes…</p> : null}

      {data ? (
        <>
          <p className="admin-count" role="status">
            {data.total} compte{data.total > 1 ? 's' : ''}
            {submitted ? ` pour « ${submitted} »` : ''}.
          </p>
          {data.users.length === 0 ? (
            <p>Aucun compte ne correspond.</p>
          ) : (
            // Cinq colonnes ne tiennent pas sur un téléphone : le tableau défile
            // dans son conteneur, jamais la page (html ne défile pas en largeur).
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Compte</th>
                    <th scope="col">Habilitations</th>
                    <th scope="col">Rôles déclarés</th>
                    <th scope="col">Attribuer</th>
                    <th scope="col">Créé le</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      currentUserId={currentUserId}
                      onGrant={onGrant}
                      onRevoke={onRevoke}
                      busy={busy}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <div className="admin-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
