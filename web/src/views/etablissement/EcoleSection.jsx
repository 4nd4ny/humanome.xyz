// Mon école (sprint 6, lot S6b — ADR-013 §3, §5) : ce que l'école paie pour
// ses élèves. Son crédit (acheté sur la page du crédit, réservée aux écoles),
// le plafond que chacun de ses élèves peut engager par mois (0 par défaut :
// rien de payant à ses frais tant qu'elle ne l'a pas réglé — montré en
// premier), sa surtaxe sur la clé de l'instance (de 3,5 % à 10 %, à son
// choix), sa clé Anthropic (écrite, retirée, jamais réaffichée), ses élèves et
// ce que chacun a engagé, en montants seulement.

import { useCallback, useEffect, useState } from 'react'
import { formatUsd } from '../../api/twin9.js'
import { fetchEcole, frDate, poserCleEcole, retirerCleEcole, saveEcole } from './etablissement-api.js'

/** Des micro-dollars, en dollars au centime, pour un champ. */
const enDollars = (microusd) => String(Math.round(Number(microusd) / 10_000) / 100)

/**
 * @param {{fetchFn?: typeof fetch}} props seam de test
 */
export default function EcoleSection({ fetchFn }) {
  const [ecole, setEcole] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [surtaxe, setSurtaxe] = useState('')
  const [plafond, setPlafond] = useState('')
  const [cle, setCle] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [info, setInfo] = useState(null)
  const [retraitArme, setRetraitArme] = useState(false)

  const charger = useCallback(async () => {
    try {
      const e = await fetchEcole(fetchFn)
      setEcole(e)
      setSurtaxe(String(e.surtaxePct))
      setPlafond(enDollars(e.plafondEleveMicrousd))
      setErreur(null)
    } catch (err) {
      setErreur(err.message)
    }
  }, [fetchFn])

  useEffect(() => {
    charger()
  }, [charger])

  async function agir(action, message) {
    setOccupe(true)
    setErreur(null)
    setInfo(null)
    try {
      await action()
      await charger()
      setInfo(message)
    } catch (err) {
      setErreur(err.message)
    } finally {
      setOccupe(false)
    }
  }

  function enregistrer(event) {
    event.preventDefault()
    const surtaxePct = Number(surtaxe)
    const plafondEleveUsd = Number(plafond)
    if (!Number.isFinite(surtaxePct) || surtaxePct < (ecole?.surtaxeMin ?? 3.5) || surtaxePct > (ecole?.surtaxeMax ?? 10)) {
      setErreur('La surtaxe se choisit entre 3,5 % et 10 %.')
      return
    }
    if (!Number.isFinite(plafondEleveUsd) || plafondEleveUsd < 0) {
      setErreur('Le plafond par élève est un montant en dollars, 0 ou plus.')
      return
    }
    agir(() => saveEcole({ surtaxePct, plafondEleveUsd }, fetchFn), 'Réglages de l’école enregistrés.')
  }

  function poser(event) {
    event.preventDefault()
    if (cle.trim() === '') {
      setErreur('Saisissez la clé Anthropic de l’école.')
      return
    }
    const valeur = cle.trim()
    setCle('') // la clé ne reste pas affichée
    agir(() => poserCleEcole(valeur, fetchFn), 'Clé de l’école enregistrée, chiffrée : elle ne sera plus jamais affichée.')
  }

  function retirer() {
    if (!retraitArme) {
      setRetraitArme(true) // en deux temps : armer puis confirmer
      return
    }
    setRetraitArme(false)
    agir(() => retirerCleEcole(fetchFn), 'Clé de l’école retirée.')
  }

  if (ecole === null) {
    return (
      <section className="espace-bloc" aria-label="Mon école">
        <h2>Mon école</h2>
        {erreur ? (
          <p role="alert" className="load-error">
            {erreur}
          </p>
        ) : (
          <p role="status">Chargement…</p>
        )}
      </section>
    )
  }

  const cleAnthropic = ecole.cles.find((c) => c.fournisseur === 'anthropic') ?? null
  return (
    <section className="espace-bloc etab-ecole" aria-label="Mon école" data-testid="etab-ecole">
      <h2>Mon école{ecole.respireNumero !== null ? ` — RESPIRE#${ecole.respireNumero}` : ''}</h2>
      {ecole.plafondEleveMicrousd === 0 ? (
        <p role="status" className="account-notice" data-testid="etab-plafond-zero">
          Le plafond par élève vaut 0 : vos élèves ne peuvent rien lancer de payant à vos frais (analyse approfondie,
          cartographie ouverte sur crédits) tant que vous ne l’avez pas réglé.
        </p>
      ) : null}

      <p data-testid="etab-credit">
        Crédit de l’école : <strong>{formatUsd(ecole.creditMicrousd)}</strong>.{' '}
        <a href="#/compte/credit">Acheter du crédit</a> (seule une école en achète).
      </p>

      <form className="etab-ecole-reglages" onSubmit={enregistrer} noValidate>
        <label htmlFor="etab-plafond">Plafond par élève et par mois (USD)</label>
        <input
          id="etab-plafond"
          type="number"
          min="0"
          step="0.01"
          value={plafond}
          onChange={(event) => setPlafond(event.target.value)}
        />
        <label htmlFor="etab-surtaxe">Surtaxe sur la clé de l’instance (%)</label>
        <input
          id="etab-surtaxe"
          type="number"
          min={ecole.surtaxeMin}
          max={ecole.surtaxeMax}
          step="0.01"
          value={surtaxe}
          onChange={(event) => setSurtaxe(event.target.value)}
        />
        <p className="privacy-note">
          Sans clé de l’école, les usages payants de vos élèves sont débités de votre crédit au coût réel, plus votre
          surtaxe — de 3,5 % (les frais de PayPal et de Stripe) à 10 %, à votre choix. Une analyse en cours garde la
          surtaxe de son lancement. Le plafond compte, pour chaque élève et par mois (UTC), ce que vous payez pour lui.
        </p>
        <button type="submit" className="button button-primary" disabled={occupe}>
          Enregistrer les réglages
        </button>
      </form>

      <div className="etab-ecole-cle">
        <h3>Clé Anthropic de l’école</h3>
        {cleAnthropic ? (
          <p data-testid="etab-cle-posee">
            Une clé est posée depuis le {frDate(cleAnthropic.poseeLe)} — jamais réaffichée.{' '}
            <button type="button" className="button" disabled={occupe} onClick={retirer}>
              {retraitArme ? 'Confirmer le retrait' : 'Retirer la clé'}
            </button>
          </p>
        ) : ecole.chiffrementDisponible ? (
          <form className="etab-ecole-cle-form" onSubmit={poser}>
            <label htmlFor="etab-cle">Clé Anthropic</label>
            <input
              id="etab-cle"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={cle}
              onChange={(event) => setCle(event.target.value)}
            />
            <button type="submit" className="button" disabled={occupe}>
              Enregistrer la clé
            </button>
          </form>
        ) : (
          <p role="status">Le chiffrement des clés n’est pas configuré sur ce serveur.</p>
        )}
        <p className="privacy-note">
          Seule une école garde sa clé sur nos serveurs, pour ses élèves : chiffrée, jamais réaffichée ni renvoyée,
          retirée quand vous le voulez. Avec elle, les analyses de vos élèves partent chez Anthropic sur votre compte :
          vous payez Anthropic directement, la plateforme rien, et le plafond par élève compte le coût. Vous pouvez relire
          dans votre Console Anthropic les résultats des appels partis par lots avec elle ; vos élèves en sont prévenus.
        </p>
      </div>

      <div className="etab-ecole-eleves">
        <h3>Mes élèves et leurs dépenses</h3>
        {ecole.eleves.length === 0 ? (
          <p className="privacy-note">Aucun élève pour l’instant : ils rejoignent vos cohortes par leur code.</p>
        ) : (
          <div className="table-scroll">
            <table data-testid="etab-eleves">
              <thead>
                <tr>
                  <th scope="col">Élève</th>
                  <th scope="col">Cohortes</th>
                  <th scope="col">Ce mois-ci</th>
                  <th scope="col">En tout</th>
                </tr>
              </thead>
              <tbody>
                {ecole.eleves.map((e) => (
                  <tr key={e.userId}>
                    <td>{e.displayName}</td>
                    <td>{e.membre ? e.cohortes.join(', ') : 'a quitté vos cohortes'}</td>
                    <td>{formatUsd(e.moisMicrousd)}</td>
                    <td>{formatUsd(e.totalMicrousd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="privacy-note">
          Ce mois-ci ({ecole.mois}) : {formatUsd(ecole.depenseMoisMicrousd)} engagés pour vos élèves. Vous voyez des
          montants, jamais le contenu de leurs analyses.
        </p>
      </div>

      {erreur ? (
        <p role="alert" className="load-error">
          {erreur}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="account-notice">
          {info}
        </p>
      ) : null}
    </section>
  )
}
