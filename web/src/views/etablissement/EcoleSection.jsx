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

/** Un nombre au centième près (une surtaxe au centième, un montant au centime). */
const auCentieme = (x) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9

/** Le plafond par élève, au plus (Ecoles::PLAFOND_MAX_MICROUSD : 100 000 $). */
const PLAFOND_MAX_USD = 100_000

/** La longueur d'une clé, au plus (EcoleCles::LONGUEUR_MAX). */
const CLE_MAX = 400

/** Les champs d'un refus du serveur (422 {error, fields}) que la section montre sous leur champ. */
const CHAMPS = ['surtaxePct', 'plafondEleveUsd', 'cle']

/**
 * @param {{fetchFn?: typeof fetch}} props seam de test
 */
export default function EcoleSection({ fetchFn }) {
  const [ecole, setEcole] = useState(null)
  const [erreurChargement, setErreurChargement] = useState(null)
  const [surtaxe, setSurtaxe] = useState('')
  const [plafond, setPlafond] = useState('')
  const [cle, setCle] = useState('')
  const [occupe, setOccupe] = useState(false)
  // le retour d'une action, montré près de son formulaire : {zone: 'reglages' | 'cle', erreur, info}
  const [retour, setRetour] = useState(null)
  // les messages d'un champ, sous ce champ (refus sur place, ou 422 du serveur)
  const [champs, setChamps] = useState({})
  const [retraitArme, setRetraitArme] = useState(false)

  const charger = useCallback(async () => {
    try {
      const e = await fetchEcole(fetchFn)
      setEcole(e)
      setSurtaxe(String(e.surtaxePct))
      setPlafond(enDollars(e.plafondEleveMicrousd))
      setErreurChargement(null)
    } catch (err) {
      setErreurChargement(err.message)
    }
  }, [fetchFn])

  useEffect(() => {
    charger()
  }, [charger])

  /** Une action d'une zone : son retour près d'elle ; un 422 dit chaque champ sous le sien. */
  async function agir(zone, action, message, apres = () => {}) {
    setOccupe(true)
    setRetour(null)
    setChamps({})
    try {
      await action()
      apres()
      await charger()
      setRetour({ zone, erreur: null, info: message })
    } catch (err) {
      const fields = err?.fields && typeof err.fields === 'object' ? err.fields : {}
      const parChamp = Object.fromEntries(
        Object.entries(fields).filter(([nom, texte]) => CHAMPS.includes(nom) && typeof texte === 'string'),
      )
      const autres = Object.entries(fields)
        .filter(([nom, texte]) => !CHAMPS.includes(nom) && typeof texte === 'string')
        .map(([, texte]) => texte)
      setChamps(parChamp)
      // « Validation échouée » seul ne dit rien : le message du champ, sous lui, suffit
      const dits = Object.keys(parChamp).length > 0 && autres.length === 0
      setRetour({ zone, erreur: dits ? null : [err.message, ...autres].join(' — '), info: null })
    } finally {
      setOccupe(false)
    }
  }

  /** Les messages refusés sur place : rien ne part. */
  function refuser(messages) {
    setRetour(null)
    setChamps(messages)
    return Object.keys(messages).length > 0
  }

  function enregistrer(event) {
    event.preventDefault()
    const surtaxePct = Number(surtaxe)
    const plafondEleveUsd = Number(plafond)
    const min = ecole?.surtaxeMin ?? 3.5
    const max = ecole?.surtaxeMax ?? 10
    const messages = {}
    if (surtaxe.trim() === '' || !Number.isFinite(surtaxePct) || surtaxePct < min || surtaxePct > max) {
      messages.surtaxePct = 'La surtaxe se choisit entre 3,5 % et 10 %.'
    } else if (!auCentieme(surtaxePct)) {
      messages.surtaxePct = 'La surtaxe se choisit au centième (par exemple 4,25).'
    }
    if (plafond.trim() === '' || !Number.isFinite(plafondEleveUsd) || plafondEleveUsd < 0
      || plafondEleveUsd > PLAFOND_MAX_USD || !auCentieme(plafondEleveUsd)) {
      messages.plafondEleveUsd = 'Le plafond par élève est un montant en dollars, de 0 à 100 000, au centime.'
    }
    if (refuser(messages)) return
    agir('reglages', () => saveEcole({ surtaxePct, plafondEleveUsd }, fetchFn), 'Réglages de l’école enregistrés.')
  }

  function poser(event) {
    event.preventDefault()
    const valeur = cle.trim()
    let message = null
    if (valeur === '') {
      message = 'Saisissez la clé Anthropic de l’école.'
    } else if (/[\u0000-\u0020\u007f]/.test(valeur) || valeur.length > CLE_MAX) {
      message = `La clé se saisit sans espace, d’un seul tenant (${CLE_MAX} caractères au plus).`
    }
    if (refuser(message === null ? {} : { cle: message })) return
    // la clé ne reste pas affichée une fois enregistrée ; refusée, elle reste à corriger
    agir('cle', () => poserCleEcole(valeur, fetchFn),
      'Clé de l’école enregistrée, chiffrée : elle ne sera plus jamais affichée.', () => setCle(''))
  }

  function retirer() {
    if (!retraitArme) {
      setRetraitArme(true) // en deux temps : armer puis confirmer
      return
    }
    setRetraitArme(false)
    agir('cle', () => retirerCleEcole(fetchFn), 'Clé de l’école retirée.')
  }

  /** Les attributs d'un champ et son message, sous lui. */
  const champ = (id, nom) => ({
    id,
    'aria-invalid': champs[nom] ? 'true' : undefined,
    'aria-describedby': champs[nom] ? `${id}-erreur` : undefined,
  })
  const messageDe = (id, nom) =>
    champs[nom] ? (
      <p id={`${id}-erreur`} className="etab-ecole-champ-erreur" role="alert">
        {champs[nom]}
      </p>
    ) : null
  /** Le retour d'une zone, près de son formulaire. */
  const retourDe = (zone) =>
    retour?.zone !== zone ? null : retour.erreur ? (
      <p role="alert" className="load-error">
        {retour.erreur}
      </p>
    ) : retour.info ? (
      <p role="status" className="account-notice">
        {retour.info}
      </p>
    ) : null

  if (ecole === null) {
    return (
      <section className="espace-bloc" aria-label="Mon école">
        <h2>Mon école</h2>
        {erreurChargement ? (
          <p role="alert" className="load-error">
            {erreurChargement}
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
          {...champ('etab-plafond', 'plafondEleveUsd')}
          type="number"
          min="0"
          max={PLAFOND_MAX_USD}
          step="0.01"
          inputMode="decimal"
          value={plafond}
          onChange={(event) => setPlafond(event.target.value)}
        />
        {messageDe('etab-plafond', 'plafondEleveUsd')}
        <label htmlFor="etab-surtaxe">Surtaxe sur la clé de l’instance (%)</label>
        <input
          {...champ('etab-surtaxe', 'surtaxePct')}
          type="number"
          min={ecole.surtaxeMin}
          max={ecole.surtaxeMax}
          step="0.01"
          inputMode="decimal"
          value={surtaxe}
          onChange={(event) => setSurtaxe(event.target.value)}
        />
        {messageDe('etab-surtaxe', 'surtaxePct')}
        <p className="privacy-note">
          Sans clé de l’école, les usages payants de vos élèves sont débités de votre crédit au coût réel, plus votre
          surtaxe — de 3,5 % (les frais de PayPal et de Stripe) à 10 %, à votre choix. Une analyse en cours garde la
          surtaxe de son lancement. Le plafond compte, pour chaque élève et par mois (UTC), ce que vous payez pour lui.
        </p>
        <button type="submit" className="button button-primary" disabled={occupe}>
          Enregistrer les réglages
        </button>
        {retourDe('reglages')}
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
          <form className="etab-ecole-cle-form" onSubmit={poser} noValidate>
            <label htmlFor="etab-cle">Clé Anthropic</label>
            <input
              {...champ('etab-cle', 'cle')}
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={cle}
              onChange={(event) => setCle(event.target.value)}
            />
            {messageDe('etab-cle', 'cle')}
            <button type="submit" className="button" disabled={occupe}>
              Enregistrer la clé
            </button>
          </form>
        ) : (
          <p role="status">Le chiffrement des clés n’est pas configuré sur ce serveur.</p>
        )}
        {retourDe('cle')}
        <p className="privacy-note">
          Seule une école garde sa clé sur nos serveurs, pour ses élèves : chiffrée, jamais réaffichée ni renvoyée,
          retirée quand vous le voulez. Avec elle, les analyses de vos élèves partent chez Anthropic sur votre compte :
          vous payez Anthropic directement, la plateforme rien, et le plafond par élève compte le coût. Vous pouvez relire
          dans votre Console Anthropic les résultats des appels partis par lots avec elle ; vos élèves en sont prévenus.
        </p>
      </div>

      <div className="etab-ecole-eleves">
        <h3>Mes élèves et leurs dépenses</h3>
        {ecole.eleves.length === 0 && ecole.partis.nombre === 0 ? (
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
                    <td>{e.cohortes.join(', ')}</td>
                    <td>{formatUsd(e.moisMicrousd)}</td>
                    <td>{formatUsd(e.totalMicrousd)}</td>
                  </tr>
                ))}
                {ecole.partis.nombre > 0 ? (
                  // leur consentement retiré : leurs montants ensemble, jamais leur nom
                  <tr data-testid="etab-partis">
                    <td>
                      {ecole.partis.nombre} élève{ecole.partis.nombre > 1 ? 's' : ''} parti{ecole.partis.nombre > 1 ? 's' : ''}
                    </td>
                    <td>{ecole.partis.nombre > 1 ? 'ont quitté vos cohortes — sans leur nom' : 'a quitté vos cohortes — sans son nom'}</td>
                    <td>{formatUsd(ecole.partis.moisMicrousd)}</td>
                    <td>{formatUsd(ecole.partis.totalMicrousd)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        <p className="privacy-note">
          Ce mois-ci ({ecole.mois}) : {formatUsd(ecole.depenseMoisMicrousd)} engagés pour vos élèves. Vous voyez des
          montants, jamais le contenu de leurs analyses.
        </p>
      </div>

    </section>
  )
}
