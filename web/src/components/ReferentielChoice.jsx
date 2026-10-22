// Choix du référentiel d'un parcours (2026-10-20) : la cartographie standard,
// Twin6 et la masse cartographient le référentiel publié qu'on choisit,
// RESPIRE par défaut — le parcours en lit la structure dans son JSON
// (data/referentiel.js). La liste vient de la base (API publique, S5), à
// défaut de l'index statique ; sans l'une ni l'autre (copie statique, hors
// ligne), aucun choix n'est offert : le parcours garde RESPIRE. Une liste sans
// RESPIRE (une base qui ne l'a pas publié) présélectionne la première : elle
// devient le choix (onChange), pour que le parcours charge le référentiel que
// le menu montre, jamais RESPIRE en douce. Sous le menu, la provenance d'un
// autre référentiel que RESPIRE (le `source` de sa dernière version, que la
// base fournit) : d'où il vient et sa licence — l'Humanome V18 est celui de
// respire.school, sous CC-BY-SA (S5, E1, E9).
import { useEffect, useId, useState } from 'react'
import { REFERENTIEL_PAR_DEFAUT as RESPIRE } from '@engine/conformite.js'
import { listPublishedReferentiels } from '../data/referentiel.js'

/** La valeur d'une option : un référentiel à sa dernière version. */
const valeur = (r) => `${r.id}@${r.versions[0].semver}`

/**
 * @param {object} props
 * @param {{id: string, version: string}|null} props.value le choix, null : le défaut (RESPIRE)
 * @param {(choix: {id: string, version: string}) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {typeof listPublishedReferentiels} [props.list] seam de test
 */
export default function ReferentielChoice({ value, onChange, disabled = false, list = listPublishedReferentiels }) {
  const [referentiels, setReferentiels] = useState([])
  const idProvenance = useId()

  useEffect(() => {
    let vivant = true
    list().then((liste) => vivant && setReferentiels(liste)).catch(() => {})
    return () => {
      vivant = false
    }
  }, [list])

  // Sans choix et sans RESPIRE, le défaut des parcours n'est pas au menu : le
  // premier référentiel devient le choix, sauf sous un run en cours (disabled).
  const sansRespire = referentiels.length > 0 && !referentiels.some((r) => r.id === RESPIRE)
  useEffect(() => {
    if (value || disabled || !sansRespire) return
    onChange({ id: referentiels[0].id, version: referentiels[0].versions[0].semver })
  }, [value, disabled, sansRespire, referentiels, onChange])

  if (referentiels.length === 0) return null
  const choisi = value
    ? `${value.id}@${value.version}`
    : valeur(referentiels.find((r) => r.id === RESPIRE) ?? referentiels[0])
  const affiche = referentiels.find((r) => valeur(r) === choisi)
  const provenance = affiche && affiche.id !== RESPIRE && affiche.source ? affiche.source : null

  return (
    <>
      <label className="referentiel-choice">
        Référentiel{' '}
        <select
          value={choisi}
          disabled={disabled}
          aria-label="Référentiel"
          aria-describedby={provenance ? idProvenance : undefined}
          onChange={(event) => {
            const r = referentiels.find((x) => valeur(x) === event.target.value)
            if (r) onChange({ id: r.id, version: r.versions[0].semver })
          }}
        >
          {referentiels.map((r) => (
            <option key={r.id} value={valeur(r)}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {provenance ? (
        <small id={idProvenance} className="referentiel-choice-source" data-testid="referentiel-source">
          Provenance : {provenance}
        </small>
      ) : null}
    </>
  )
}
