// Configuration d'un run Twin9 — sur la page #/twin9/<id> (P0-1, docs/contrats.md §8.9).
//
// Ce avec quoi le run a été lancé, à côté de son attestation, qu'elle ne
// remplace pas : chaque rôle (étage, étape, étape au second ressort, lecteur
// du collège) avec son fournisseur et l'étiquette RGPD de celui-ci, sa voie
// (par lots ou directe), son modèle et son budget de sortie ; le jeu de
// gabarits, le référentiel et la clé. Puis comment il s'est déroulé : ses
// appels, ses pannes et ses sorties tronquées (des pannes, P0-2) par
// fournisseur et par voie, les passes du moteur, son coût.
//
// Le suivi de la page (GET /api/twin9/runs/{id}), interrogé sans cesse, ne
// porte que l'empreinte de la configuration : les deux blocs se lisent dans
// les résultats du run (`run.configuration`, `run.execution`), une fois, quand
// on ouvre « Configuration », et de nouveau quand son statut change.
//
// Chaque ligne tient à la présence de son champ : un cartographe lié lit les
// blocs sans prix, coût, plafond ni clé (§8.9), et ces lignes disparaissent.

import { useEffect, useRef, useState } from 'react'
import { formatUsd } from '../../api/twin9.js'
import { libelle, noeud } from '../configuration/profilSchema.js'

/** L'étiquette RGPD d'un fournisseur, telle que le registre la donne (ce n'est pas un avis juridique). */
export const RGPD = { oui: 'RGPD : oui', sous_conditions: 'RGPD : sous conditions', non: 'RGPD : non' }

const VOIES = { lots: 'par lots', directe: 'directe', mixte: 'par lots et directe' }
const CLES = { instance: 'celle de l’instance', personnelle: 'clé personnelle' }
const GROUPES = [
  ['etages', 'Étages'],
  ['etapes', 'Étapes'],
  ['second_ressort', 'Second ressort'],
  ['lecteurs', 'Lecteurs du collège'],
]

const s = (n) => (n > 1 ? 's' : '')
const estObjet = (x) => Boolean(x && typeof x === 'object' && !Array.isArray(x))

/** Le nom d'un rôle : un étage ou une étape comme la page des profils le dit (« Greffier »), un lecteur par son nom. */
function nomDuRole(groupe, cle) {
  if (groupe === 'lecteurs') return cle
  if (groupe === 'etages') return libelle(cle, noeud(['etages', cle]))
  return libelle(cle, noeud(['etapes', cle])).replace(/\s*\(étage \w+\)$/, '')
}

/** Un temps du moteur en millisecondes, lisible : « 640 ms », « 1,8 s », « 2 min 05 s ». */
function tempsMoteur(ms) {
  if (ms < 1000) return `${ms} ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1).replace('.', ',')} s`
  const total = Math.round(sec)
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`
}

/** Un fournisseur, son libellé et son étiquette RGPD. */
function Fournisseur({ id, fournisseurs }) {
  const f = fournisseurs?.[id]
  return (
    <>
      {f?.libelle ?? id}
      {f?.rgpd ? (
        <>
          {' '}
          <span className={`value-badge twin9-rgpd twin9-rgpd-${f.rgpd}`}>{RGPD[f.rgpd] ?? f.rgpd}</span>
        </>
      ) : null}
    </>
  )
}

/** Les comptes d'une table (par fournisseur, par voie) : appels, pannes, tronqués, et le coût quand il est là. */
function Comptes({ titre, entete, comptes, nom }) {
  const lignes = Object.entries(comptes ?? {}).filter(([, c]) => estObjet(c))
  if (lignes.length === 0) return null
  const avecCout = lignes.some(([, c]) => Number.isInteger(c.cout_microusd))
  return (
    <table className="twin9-config-table">
      <caption>{titre}</caption>
      <thead>
        <tr>
          <th scope="col">{entete}</th>
          <th scope="col">Appels</th>
          <th scope="col">Pannes</th>
          <th scope="col">dont tronqués</th>
          {avecCout ? <th scope="col">Coût</th> : null}
        </tr>
      </thead>
      <tbody>
        {lignes.map(([k, c]) => (
          <tr key={k}>
            <th scope="row">{nom(k)}</th>
            <td>{c.appels ?? 0}</td>
            <td>{c.pannes ?? 0}</td>
            <td>{c.tronques ?? 0}</td>
            {avecCout ? <td>{Number.isInteger(c.cout_microusd) ? formatUsd(c.cout_microusd) : '—'}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Comment le run s'est déroulé (`execution`, §8.9). */
function Execution({ execution, fournisseurs }) {
  const a = execution.appels ?? {}
  const tronques = a.tronques ?? 0
  const source =
    execution.source === 'fige'
      ? 'Figée à la fin du run.'
      : 'Lue dans son journal : le run n’est pas fini, ces comptes avancent avec lui.'
  return (
    <>
      <h4>Exécution</h4>
      <p className="twin9-config-source">
        {source}
        {execution.partiel ? ' Lancé avant que sa configuration soit gardée : ses passes et le temps du moteur sont incomplets.' : ''}
      </p>
      <dl>
        <dt>Appels</dt>
        <dd>
          {a.total ?? 0} : {a.repondus ?? 0} répondu{s(a.repondus)}, {a.pannes ?? 0} en panne
          {tronques > 0 ? ` dont ${tronques} sortie${s(tronques)} tronquée${s(tronques)}` : ''}
          {a.refus > 0 ? `, ${a.refus} refus` : ''}
        </dd>
        <dt>Passes du moteur</dt>
        <dd>
          {execution.passes ?? 0}
          {Number.isInteger(execution.moteur_ms) ? ` (${tempsMoteur(execution.moteur_ms)} de moteur)` : ''}
        </dd>
        {execution.lots > 0 ? (
          <>
            <dt>Lots</dt>
            <dd>{execution.lots}</dd>
          </>
        ) : null}
        {Number.isInteger(execution.cout_microusd) ? (
          <>
            <dt>Coût</dt>
            <dd>{formatUsd(execution.cout_microusd)}</dd>
          </>
        ) : null}
      </dl>
      {tronques > 0 ? (
        <p className="twin9-conseil">
          {tronques > 1 ? `${tronques} sorties tronquées ont été comptées` : 'Une sortie tronquée a été comptée'} en panne : sa journée sera
          instruite de nouveau au prochain run. Augmentez le budget de sortie de son étape (<a href="#/configuration">Régler mes profils</a>).
        </p>
      ) : null}
      <Comptes titre="Par fournisseur" entete="Fournisseur" comptes={execution.par_fournisseur} nom={(id) => <Fournisseur id={id} fournisseurs={fournisseurs} />} />
      <Comptes titre="Par voie" entete="Voie" comptes={execution.par_voie} nom={(v) => VOIES[v] ?? v} />
    </>
  )
}

/**
 * La configuration et l'exécution d'un run, telles que ses résultats les portent.
 * @param {{configuration: object | null, execution: object | null}} props
 */
export function VueConfiguration({ configuration, execution }) {
  const c = estObjet(configuration) ? configuration : null
  const fournisseurs = c?.fournisseurs ?? {}
  const cle = c?.execution_prevue?.cle
  return (
    <div className="twin9-config">
      {c ? (
        <>
          <dl>
            <dt>Empreinte</dt>
            <dd>{c.empreinte}</dd>
            {c.lance_at ? (
              <>
                <dt>Lancé le</dt>
                <dd>{c.lance_at}</dd>
              </>
            ) : null}
            <dt>Fournisseurs</dt>
            <dd>
              {Object.entries(fournisseurs).map(([id, f], i) => (
                <span key={id}>
                  {i > 0 ? ' · ' : ''}
                  <Fournisseur id={id} fournisseurs={fournisseurs} />, {VOIES[f.voie] ?? f.voie}
                </span>
              ))}
            </dd>
            <dt>Jeu de gabarits</dt>
            <dd>
              {c.gabarits?.jeu}@{c.gabarits?.empreinte}
            </dd>
            <dt>Référentiel</dt>
            <dd>
              {c.referentiel?.id}@{c.referentiel?.version}
            </dd>
            {cle ? (
              <>
                <dt>Clé</dt>
                <dd>{CLES[cle] ?? cle}</dd>
              </>
            ) : null}
          </dl>
          <table className="twin9-config-table">
            <caption>Réglages des appels</caption>
            <thead>
              <tr>
                <th scope="col">Rôle</th>
                <th scope="col">Fournisseur</th>
                <th scope="col">Voie</th>
                <th scope="col">Modèle</th>
                <th scope="col">Budget de sortie</th>
              </tr>
            </thead>
            {GROUPES.map(([groupe, titre]) => {
              const reglages = Object.entries(c.appels?.[groupe] ?? {}).filter(([, r]) => estObjet(r))
              if (reglages.length === 0) return null
              return (
                <tbody key={groupe}>
                  <tr>
                    <th scope="rowgroup" colSpan={5}>
                      {titre}
                    </th>
                  </tr>
                  {reglages.map(([cleRole, r]) => (
                    <tr key={cleRole} data-role={`${groupe}/${cleRole}`}>
                      <th scope="row">{nomDuRole(groupe, cleRole)}</th>
                      <td>
                        <Fournisseur id={r.fournisseur} fournisseurs={fournisseurs} />
                      </td>
                      <td>{VOIES[r.voie] ?? r.voie}</td>
                      <td>{r.modele}</td>
                      <td>{r.budget_sortie}</td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </>
      ) : (
        <p>Ce run a été lancé avant que sa configuration soit gardée.</p>
      )}
      {estObjet(execution) ? <Execution execution={execution} fournisseurs={fournisseurs} /> : null}
    </div>
  )
}

/**
 * « Configuration » sur la page d'un run : lue dans ses résultats à l'ouverture, relue quand `version` change
 * (son statut) tant qu'elle est ouverte ; une erreur reste dans le bloc, sans toucher la page.
 * @param {{charger: () => Promise<{configuration: object | null, execution: object | null}>, version: string}} props
 */
export default function ConfigurationDuRun({ charger, version }) {
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState({ blocs: null, erreur: null })
  const demande = useRef(null)
  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => {
    if (!ouvert || demande.current === version) return
    demande.current = version
    setEtat((e) => ({ ...e, erreur: null }))
    chargerRef.current().then(
      (blocs) => {
        if (demande.current === version) setEtat({ blocs, erreur: null })
      },
      (erreur) => {
        if (demande.current !== version) return
        demande.current = null // rouvrir réessaie
        setEtat({ blocs: null, erreur })
      },
    )
  }, [ouvert, version])

  return (
    <details className="twin9-configuration" onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Configuration</summary>
      {etat.erreur ? (
        <p className="load-error">{etat.erreur.message}</p>
      ) : etat.blocs ? (
        <VueConfiguration configuration={etat.blocs.configuration} execution={etat.blocs.execution} />
      ) : ouvert ? (
        <p>Chargement…</p>
      ) : null}
    </details>
  )
}
