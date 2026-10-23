// Les clés API dans le profil (cahier §4.5 ; ADR-013 §5, règle R1 de Christian).
//
// Depuis l'ADR-013, les clés d'un utilisateur restent dans son navigateur :
// humanome n'en garde plus aucune, seule une école garde la sienne, pour ses
// élèves (dans son espace établissement). La section le dit, et n'a plus de
// formulaire d'ajout. Elle montre les clés gardées sur le serveur AVANT,
// « à supprimer », qui ne servent plus à aucune analyse, avec deux boutons :
// « Supprimer du serveur », et « Recopier dans ce navigateur, puis supprimer »
// (la clé est relue une fois, mémorisée dans localStorage 'humanome-keys',
// celui de l'assistant de run et de la cartographie ouverte, puis supprimée du
// serveur), pour que personne ne perde une clé gardée nulle part ailleurs. Si
// la date de l'avis de purge est connue, elle dit à partir de quand la clé
// sera supprimée d'office (30 jours après l'avis).

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client.js'
import {
  deleteKey as deleteKeyApi,
  listKeys as listKeysApi,
  providerLabel,
  revealKey as revealKeyApi,
} from '../../api/keys.js'
import {
  KEY_STAYS_IN_BROWSER,
  getLocalKey as getLocalKeyFn,
  setLocalKey as setLocalKeyFn,
} from '../../lib/local-keys.js'

/** Jours entre l'avis et la purge (api/src/Keys/UserKeysPurge.php, DELAI_JOURS). */
const DELAI_PURGE_JOURS = 30

/**
 * @param {unknown} error
 * @returns {string} message affichable ; une session perdue (403 du
 *   middleware CSRF, 401) dit de se reconnecter (les routes /api/keys ne
 *   répondent jamais 403 elles-mêmes)
 */
function message(error) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Votre session a expiré : reconnectez-vous, puis réessayez.'
  }
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  return 'Une erreur est survenue. Réessayez.'
}

/** « AAAA-MM-JJ » de l'avis + 30 jours, ou null. */
function datePurge(avisPurgeAt) {
  const avis = new Date(`${String(avisPurgeAt).slice(0, 10)}T00:00:00Z`)
  if (avisPurgeAt == null || Number.isNaN(avis.getTime())) return null
  avis.setUTCDate(avis.getUTCDate() + DELAI_PURGE_JOURS)
  return avis.toISOString().slice(0, 10)
}

/**
 * @param {{deps?: {listKeys?: typeof listKeysApi, revealKey?: typeof revealKeyApi,
 *   deleteKey?: typeof deleteKeyApi, keyStorage?: Storage}}} props coutures de test (keyStorage : le
 *   stockage du navigateur, localStorage par défaut)
 */
export default function ApiKeysSection({ deps = {} }) {
  const listKeys = deps.listKeys ?? listKeysApi
  const revealKey = deps.revealKey ?? revealKeyApi
  const deleteKey = deps.deleteKey ?? deleteKeyApi

  const [keys, setKeys] = useState(null) // null = chargement, [] = aucune
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    listKeys()
      .then((list) => {
        if (alive) {
          setKeys(Array.isArray(list) ? list : [])
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (alive) {
          setKeys([])
          setLoadError(message(error))
        }
      })
    return () => {
      alive = false
    }
  }, [listKeys, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  async function remove(prov) {
    setBusy(true)
    setFeedback(null)
    try {
      await deleteKey(prov)
      setFeedback({ kind: 'ok', message: `Clé ${providerLabel(prov)} supprimée du serveur.` })
      reload()
    } catch (error) {
      setFeedback({ kind: 'error', message: message(error) })
    } finally {
      setBusy(false)
    }
  }

  async function copyThenRemove(prov) {
    setBusy(true)
    setFeedback(null)
    try {
      const { apiKey } = (await revealKey(prov)) ?? {}
      if (typeof apiKey !== 'string' || apiKey === '') {
        throw new Error('La clé gardée n’a pas pu être relue : rien n’a été supprimé.')
      }
      setLocalKeyFn(prov, apiKey, deps.keyStorage)
      // un navigateur qui n'a pas pu la garder (stockage plein ou bloqué) : rien n'est supprimé
      if (getLocalKeyFn(prov, deps.keyStorage) !== apiKey) {
        throw new Error('Ce navigateur n’a pas pu garder la clé : rien n’a été supprimé du serveur.')
      }
      await deleteKey(prov)
      setFeedback({
        kind: 'ok',
        message: `Clé ${providerLabel(prov)} recopiée dans ce navigateur, puis supprimée du serveur.`,
      })
      reload()
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof ApiError ? message(error) : error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-keys" aria-label="Clés API">
      <h2>Clés API</h2>
      <p className="account-keys-intro" data-testid="cle-reste-navigateur">
        <strong>{KEY_STAYS_IN_BROWSER}</strong>
      </p>
      <p className="account-keys-intro">
        Pour lancer une cartographie avec votre propre clé, saisissez-la au lancement (assistant de
        cartographie, cartographie ouverte) : elle n’y est gardée que si vous demandez à la mémoriser
        dans ce navigateur, et ne part que vers le fournisseur choisi. L’analyse approfondie Twin9, qui
        tourne sur le serveur, part avec la clé de la plateforme.
      </p>

      {keys === null ? (
        <p role="status">Chargement des clés…</p>
      ) : keys.length > 0 ? (
        <>
          <p className="account-keys-intro" data-testid="cles-a-supprimer">
            Ces clés avaient été gardées sur le serveur avant ce changement. Elles ne servent plus à
            aucune analyse et <strong>sont à supprimer</strong> : recopiez-les dans ce navigateur si
            vous ne les avez nulle part ailleurs, ou supprimez-les.
          </p>
          <ul className="account-keys-list">
            {keys.map((k) => {
              const purge = datePurge(k.avisPurgeAt)
              return (
                <li key={k.provider} className="account-keys-item">
                  <span className="account-keys-provider">{providerLabel(k.provider)}</span>
                  <span className="account-keys-date">
                    à supprimer — gardée le {String(k.createdAt).slice(0, 10)}
                    {purge ? `, supprimée d’office à partir du ${purge}` : ''}
                  </span>
                  <button
                    type="button"
                    className="account-keys-copy"
                    onClick={() => copyThenRemove(k.provider)}
                    disabled={busy}
                  >
                    Recopier dans ce navigateur, puis supprimer
                  </button>
                  <button
                    type="button"
                    className="account-keys-delete"
                    onClick={() => remove(k.provider)}
                    disabled={busy}
                  >
                    Supprimer du serveur
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="account-keys-empty">Aucune clé gardée sur le serveur.</p>
      )}

      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'load-error' : 'account-keys-ok'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  )
}
