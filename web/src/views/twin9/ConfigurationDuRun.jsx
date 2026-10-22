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
// les résultats du run (`run.configuration`, `run.execution`), qui portent
// aussi ses sorties — jamais au rythme du suivi : quand on ouvre
// « Configuration », de nouveau à chaque ouverture tant que le run est en
// cours (ses comptes avancent), et quand son statut change. Un run lancé
// avant P0-1 n'a pas de configuration : son exécution, partielle, s'y lit
// seule.
//
// Chaque ligne tient à la présence de son champ : un cartographe lié lit les
// blocs sans prix, coût, plafond ni clé (§8.9), dans les résultats (l'API) ;
// la page du run, elle, n'est que celle de son propriétaire.

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

/**
 * L'étape du profil que suit chaque étape du moteur, celles que comptent les compteurs du run
 * (`compteurs.par_etape`) : CallSettings::ETAPES (un test les compare), les lectures du collège à part.
 */
export const ETAPES_DU_MOTEUR = {
  premiere_impression: 'premiere_impression',
  greffier: 'greffier',
  leger: 'juge_leger',
  contre_lecture: 'contre_lecture',
  accusation: 'accusation',
  defense: 'defense',
  replique: 'replique',
  briefing: 'briefing',
  jure: 'jures',
  relance: 'relance',
  jure2: 'second_tour',
  gardien_support: 'gardien_support',
  gardien_raisonnement: 'gardien_raisonnement',
  president: 'president',
  merge_kairos: 'relectures',
  merge_pole: 'relectures',
  merge_competence: 'relectures',
  merge_rapporteur: 'relectures',
  condense: 'arpenteur',
  arpenteur: 'arpenteur',
  retour_sources: 'arpenteur',
}

/** Les étapes du profil dont les appels sont de la fusion, d'aucune journée. */
const DE_LA_FUSION = new Set(['relectures', 'arpenteur'])

/** Une étape du moteur comme la page des profils la nomme ; les lectures du collège, par leur étage. */
function nomDeLEtape(etape) {
  if (etape === 'tagger') return nomDuRole('etages', 'lecteurs')
  const duProfil = ETAPES_DU_MOTEUR[etape]
  return duProfil ? nomDuRole('etapes', duProfil) : etape
}

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

/**
 * Le conseil des sorties tronquées (P0-2, §8) : les étapes en cause, quand les compteurs du run fini les
 * disent ; ce qu'une panne fait d'une journée, ou de la fusion ; et ce que coûte le remède : un autre budget
 * de sortie change l'empreinte des réglages (§8.2), et toutes les journées de la carte sont instruites de
 * nouveau au run suivant, pas seulement celle en panne.
 */
function ConseilDesTronquees({ tronques, parEtape }) {
  const etapes = estObjet(parEtape)
    ? Object.entries(parEtape)
        .filter(([, c]) => estObjet(c) && c.tronques > 0)
        .map(([etape]) => etape)
    : null
  const noms = [...new Set((etapes ?? []).map(nomDeLEtape))]
  const fusion = etapes !== null && etapes.some((e) => DE_LA_FUSION.has(ETAPES_DU_MOTEUR[e]))
  // sans compteurs (un run pas encore fini), on ne sait pas : la règle des journées vaut
  const journee = etapes === null || etapes.length === 0 || etapes.some((e) => !DE_LA_FUSION.has(ETAPES_DU_MOTEUR[e]))
  const lesEtapes = noms.map((n) => `« ${n} »`).join(', ')
  const plusieurs = tronques > 1
  const quelleEtape = noms.length === 1 ? `l’étape ${lesEtapes}` : noms.length > 1 ? 'ces étapes' : plusieurs ? 'leur étape' : 'son étape'
  const phrases = [
    `${plusieurs ? `${tronques} sorties tronquées ont été comptées` : 'Une sortie tronquée a été comptée'} en panne` +
      `${noms.length > 0 ? ` (${noms.length > 1 ? 'étapes' : 'étape'} ${lesEtapes})` : ''}.`,
    journee ? 'Une journée dont un appel est en panne n’entre pas dans la mémoire de la carte : le prochain run l’instruit de nouveau.' : null,
    fusion ? 'Un appel de la fusion n’est d’aucune journée : la fusion se refait à chaque run.' : null,
    `${plusieurs ? 'Pour qu’elles ne soient plus tronquées' : 'Pour qu’elle ne soit plus tronquée'}, augmentez le budget de sortie de ${quelleEtape}`,
  ].filter(Boolean)
  return (
    <p className="twin9-conseil">
      {phrases.join(' ')} (<a href="#/configuration">Régler mes profils</a>) : un autre budget de sortie change l’empreinte des
      réglages, et au prochain run toutes les journées de la carte sont instruites de nouveau, et payées, pas seulement celles
      d’une panne — l’aperçu du lancement le dit, et en prévoit le coût.
    </p>
  )
}

/** D'où viennent les comptes : figés à la fin, ou lus dans le journal d'un run en cours ou arrêté. */
function sourceDesComptes(execution) {
  if (execution.source === 'fige') return 'Figée à la fin du run.'
  if (execution.statut === 'en_cours') {
    return 'Lue dans son journal à l’ouverture : le run n’est pas fini, et ses comptes avancent ; refermez puis rouvrez « Configuration » pour les relire.'
  }
  return 'Lue dans son journal : le run est arrêté, ses comptes ne bougent plus tant qu’il ne reprend pas.'
}

/** Comment le run s'est déroulé (`execution`, §8.9). */
function Execution({ execution, fournisseurs, parEtape }) {
  const a = execution.appels ?? {}
  const tronques = a.tronques ?? 0
  const source = sourceDesComptes(execution)
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
      {tronques > 0 ? <ConseilDesTronquees tronques={tronques} parEtape={parEtape} /> : null}
      <Comptes titre="Par fournisseur" entete="Fournisseur" comptes={execution.par_fournisseur} nom={(id) => <Fournisseur id={id} fournisseurs={fournisseurs} />} />
      <Comptes titre="Par voie" entete="Voie" comptes={execution.par_voie} nom={(v) => VOIES[v] ?? v} />
    </>
  )
}

/**
 * La configuration et l'exécution d'un run, telles que ses résultats les portent ; `parEtape`, les compteurs
 * par étape d'un run fini (son suivi), qui nomment les étapes des sorties tronquées.
 * @param {{configuration: object | null, execution: object | null, parEtape?: object | null}} props
 */
export function VueConfiguration({ configuration, execution, parEtape = null }) {
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
      {estObjet(execution) ? <Execution execution={execution} fournisseurs={fournisseurs} parEtape={parEtape} /> : null}
    </div>
  )
}

/**
 * « Configuration » sur la page d'un run : lue dans ses résultats à l'ouverture — à chaque ouverture tant que
 * `version` (son statut) vaut `en_cours` —, relue quand `version` change tant qu'elle est ouverte ; une erreur
 * reste dans le bloc, sans toucher la page.
 * @param {{charger: () => Promise<{configuration: object | null, execution: object | null}>, version: string,
 *   parEtape?: object | null}} props
 */
export default function ConfigurationDuRun({ charger, version, parEtape = null }) {
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState({ blocs: null, erreur: null })
  const lue = useRef(null) // la version dont les blocs ont été lus (null : à lire)
  const demande = useRef(0) // la dernière lecture partie : seule elle s'affiche
  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => {
    if (!ouvert || (lue.current === version && version !== 'en_cours')) return
    lue.current = version
    const n = ++demande.current
    setEtat((e) => ({ ...e, erreur: null }))
    chargerRef.current().then(
      (blocs) => {
        if (demande.current === n) setEtat({ blocs, erreur: null })
      },
      (erreur) => {
        if (demande.current !== n) return
        lue.current = null // rouvrir réessaie
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
        <VueConfiguration configuration={etat.blocs.configuration} execution={etat.blocs.execution} parEtape={parEtape} />
      ) : ouvert ? (
        <p>Chargement…</p>
      ) : null}
    </details>
  )
}
