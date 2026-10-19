// Page #/configuration (T13, docs/plan-twin9-php.md de Twin_v9, lot 4d) : les
// profils des runs Twin9 de la personne, construits depuis le schéma du profil
// (schemas/twin9-profil.schema.json). Une section par partie ; un
// interrupteur pour le mode essai ; une valeur modifiée se distingue de celle
// du profil v9.8, rien de plus. L'aide d'un réglage paraît quand on y entre.
//
// Les droits (docs/autorisations.md, « Configuration Twin9 ») : chacun règle
// ses profils, le référentiel parmi les publiés, la clé personnelle là où
// l'administrateur l'a ouverte. Le serveur valide et complète chaque profil.

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import { createProfil, deleteProfil, fetchConfiguration, fetchProfil, saveProfil } from '../api/twin9.js'
import {
  FIXES,
  SCHEMA,
  ecrire,
  egal,
  facultatif,
  genre,
  libelle,
  libelleChoix,
  lire,
  lisible,
  modifies,
  noeud,
  nullable,
  sensDeNull,
} from './configuration/profilSchema.js'
import '../styles/configuration.css'

/** Les parties du profil, dans l'ordre du schéma ; le mode a son interrupteur. */
const PARTIES = Object.keys(SCHEMA.properties).filter((cle) => !FIXES.includes(cle) && cle !== 'mode')

const ident = (chemin) => `config-${chemin.join('-')}`

/** La valeur d'un champ numérique : vide, c'est « aucun » ou l'absence ; sinon un nombre. */
function nombre(texte, node, peutManquer) {
  if (texte === '') return nullable(node) ? null : peutManquer ? undefined : ''
  const n = Number(texte)
  return Number.isFinite(n) ? n : texte
}

/** Un réglage : son libellé, sa commande, sa valeur par défaut s'il en diffère, son aide. */
function Champ({ chemin, valeur, defaut, peutManquer, onChange, contexte }) {
  const node = noeud(chemin)
  const g = genre(node)
  const id = ident(chemin)
  const modifie = !egal(valeur, defaut)
  const cle = chemin[chemin.length - 1]
  const champ = chemin.join('/')
  let commande

  const options = (valeurs, vide) => (
    <select id={id} value={valeur ?? ''} onChange={(e) => onChange(e.target.value === '' ? vide : e.target.value)}>
      {(peutManquer || vide === null) && <option value="">{vide === null ? sensDeNull(node) : '—'}</option>}
      {valeurs.map((v) => (
        <option key={v.valeur ?? v} value={v.valeur ?? v} disabled={v.desactive}>
          {v.libelle ?? libelleChoix(v)}
        </option>
      ))}
    </select>
  )

  if (champ === 'gabarits') {
    commande = options(contexte.gabarits)
  } else if (champ === 'referentiel/id') {
    commande = options(contexte.referentiels.map((r) => r.id))
  } else if (champ === 'referentiel/version') {
    const ref = contexte.referentiels.find((r) => r.id === contexte.profil.referentiel?.id)
    commande = options(ref?.versions ?? [], null)
  } else if (g === 'choix') {
    commande = options(
      node.enum.map((v) => ({
        valeur: v,
        libelle: libelleChoix(v),
        desactive: champ === 'cle' && v === 'personnelle' && !contexte.clePersoOuverte && valeur !== v,
      })),
      undefined,
    )
  } else if (g === 'booleen') {
    commande = <input id={id} type="checkbox" checked={valeur === true} onChange={(e) => onChange(e.target.checked)} />
  } else if (g === 'entier' || g === 'nombre') {
    commande = (
      <input
        id={id}
        type="number"
        step={g === 'entier' ? 1 : 'any'}
        min={node.minimum ?? node.exclusiveMinimum}
        max={node.maximum}
        value={valeur ?? ''}
        placeholder={nullable(node) ? sensDeNull(node) : peutManquer ? '—' : undefined}
        onChange={(e) => onChange(nombre(e.target.value, node, peutManquer))}
      />
    )
  } else {
    commande = (
      <input
        id={id}
        type="text"
        value={valeur ?? ''}
        pattern={node.pattern}
        placeholder={peutManquer ? '—' : undefined}
        onChange={(e) => onChange(e.target.value === '' && peutManquer ? undefined : e.target.value)}
      />
    )
  }

  const aide =
    champ === 'cle' && valeur === 'personnelle' && !contexte.clePersoEnregistree
      ? 'Aucune clé Anthropic personnelle n’est enregistrée : elle s’ajoute dans Mon compte.'
      : node.description
  return (
    <div className={`config-champ${modifie ? ' is-modified' : ''}`} data-chemin={champ}>
      <label htmlFor={id}>
        {libelle(cle, node)}
        {modifie && (
          <span className="config-modifie" title={`Par défaut : ${lisible(defaut)}`}>
            <span aria-hidden="true"> ●</span>
            <span className="visually-hidden"> (modifié ; par défaut : {lisible(defaut)})</span>
          </span>
        )}
      </label>
      <div className="config-commande">{commande}</div>
      {aide && <p className="config-aide">{aide}</p>}
    </div>
  )
}

/** Une table clé → valeur (les spécialistes imposés du jury). */
function Table({ chemin, valeur, defaut, onChange }) {
  const entrees = Object.entries(valeur ?? {})
  const modifie = !egal(valeur, defaut)
  const remplacer = (index, cle, val) =>
    onChange(Object.fromEntries(entrees.map((e, i) => (i === index ? [cle, val] : e))))
  return (
    <fieldset className={`config-champ config-table${modifie ? ' is-modified' : ''}`} data-chemin={chemin.join('/')}>
      <legend>
        {libelle(chemin[chemin.length - 1])}
        {modifie && <span className="config-modifie" title={`Par défaut : ${lisible(defaut)}`} aria-label="modifié"> ●</span>}
      </legend>
      {entrees.map(([cle, val], i) => (
        <div className="config-table-ligne" key={i}>
          <input aria-label="Clé" type="text" value={cle} onChange={(e) => remplacer(i, e.target.value, val)} />
          <input aria-label="Valeur" type="text" value={val} onChange={(e) => remplacer(i, cle, e.target.value)} />
          <button type="button" className="admin-button-secondary" onClick={() => onChange(Object.fromEntries(entrees.filter((_, j) => j !== i)))}>
            Retirer
          </button>
        </div>
      ))}
      <button type="button" className="admin-button-secondary" onClick={() => onChange({ ...(valeur ?? {}), '': '' })}>
        Ajouter
      </button>
      {noeud(chemin).description && <p className="config-aide">{noeud(chemin).description}</p>}
    </fieldset>
  )
}

/** Un réglage, quel que soit son genre : un groupe se déplie, une liste s'allonge, une feuille se règle. */
function Reglage({ chemin, profil, defaut, onChange, contexte, niveau = 0 }) {
  const node = noeud(chemin)
  const g = genre(node)
  const valeur = lire(profil, chemin)
  const changer = (c) => (v) => onChange(c, v)

  if (g === 'objet' || g === 'liste') {
    // une section fermée dit combien de ses réglages sont modifiés ; ouverte, chacun se distingue
    const n = niveau === 0 ? modifies(profil, defaut, chemin) : 0
    const titre = (
      <>
        {libelle(chemin[chemin.length - 1], node)}
        {n > 0 && <span className="config-compte"> · {n} modifié{n > 1 ? 's' : ''}</span>}
      </>
    )
    const contenu =
      g === 'objet' ? (
        Object.keys(node.properties).map((cle) => (
          <Reglage
            key={cle}
            chemin={[...chemin, cle]}
            profil={profil}
            defaut={defaut}
            onChange={onChange}
            contexte={contexte}
            niveau={niveau + 1}
          />
        ))
      ) : (
        <>
          {(valeur ?? []).map((_, i) => (
            <fieldset key={i} className="config-groupe" data-chemin={[...chemin, i].join('/')}>
              <legend>{libelle(i)}</legend>
              {Object.keys(noeud([...chemin, i]).properties).map((cle) => (
                <Reglage key={cle} chemin={[...chemin, i, cle]} profil={profil} defaut={defaut} onChange={onChange}
                  contexte={contexte} niveau={niveau + 2} />
              ))}
              <button
                type="button"
                className="admin-button-secondary"
                disabled={valeur.length <= (node.minItems ?? 0)}
                onClick={() => onChange(chemin, valeur.filter((__, j) => j !== i))}
              >
                Retirer ce lecteur
              </button>
            </fieldset>
          ))}
          <button type="button" className="admin-button-secondary"
            onClick={() => onChange(chemin, [...(valeur ?? []), { nom: '', famille: '' }])}>
            Ajouter un lecteur
          </button>
        </>
      )
    return niveau === 0 ? (
      <details className="config-partie" data-chemin={chemin.join('/')}>
        <summary>{titre}</summary>
        <div className="config-corps">{contenu}</div>
      </details>
    ) : (
      <fieldset className="config-groupe" data-chemin={chemin.join('/')}>
        <legend>{titre}</legend>
        {contenu}
      </fieldset>
    )
  }
  if (g === 'table') {
    return <Table chemin={chemin} valeur={valeur} defaut={lire(defaut, chemin)} onChange={changer(chemin)} />
  }
  const parent = chemin.length > 1 ? noeud(chemin.slice(0, -1)) : SCHEMA
  const peutManquer = typeof chemin[chemin.length - 1] === 'string' && facultatif(parent, chemin[chemin.length - 1])
  const champ = (
    <Champ
      chemin={chemin}
      valeur={valeur}
      defaut={lire(defaut, chemin)}
      peutManquer={peutManquer}
      onChange={changer(chemin)}
      contexte={{ ...contexte, profil }}
    />
  )
  return niveau === 0 ? <div className="config-partie config-partie-simple">{champ}</div> : champ
}

/** Le mode du run : essai (première journée, premier pôle) ou complet. */
function Interrupteur({ mode, defaut, onChange }) {
  const essai = mode === 'test'
  return (
    <div className={`config-mode${mode !== defaut ? ' is-modified' : ''}`} data-chemin="mode">
      <button
        type="button"
        className={`admin-demo-toggle ${essai ? 'is-on' : 'is-off'}`}
        role="switch"
        aria-checked={essai}
        aria-describedby="config-mode-aide"
        onClick={() => onChange(essai ? 'complet' : 'test')}
      >
        <span className="admin-demo-toggle-track" aria-hidden="true">
          <span className="admin-demo-toggle-thumb" />
        </span>
        <span className="admin-demo-toggle-label">
          Mode essai
          {mode !== defaut && (
            <span className="config-modifie" title={`Par défaut : ${lisible(defaut)}`}>
              <span aria-hidden="true"> ●</span>
              <span className="visually-hidden"> (modifié)</span>
            </span>
          )}
        </span>
      </button>
      <p id="config-mode-aide" className="config-aide">{SCHEMA.properties.mode.description}</p>
    </div>
  )
}

/**
 * @param {{ deps?: { fetchFn?: typeof fetch } }} props deps : seam de test
 */
export default function ConfigurationView({ deps = {} }) {
  const { fetchFn } = deps
  const [etat, setEtat] = useState({ chargement: true })
  const [config, setConfig] = useState(null)
  const [courant, setCourant] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [aSupprimer, setASupprimer] = useState(false)

  const ouvrir = useCallback(
    async (c, id) => {
      setMessage(null)
      setErreur(null)
      setASupprimer(false)
      setCourant(id === null ? { id: null, nom: '', profil: structuredClone(c.defaut) } : await fetchProfil(id, { fetchFn }))
    },
    [fetchFn],
  )

  const charger = useCallback(
    async (id) => {
      try {
        const c = await fetchConfiguration({ fetchFn })
        setConfig(c)
        await ouvrir(c, id === undefined ? (c.profils[0]?.id ?? null) : id)
        setEtat({})
      } catch (e) {
        setEtat({ erreur: e })
      }
    },
    [fetchFn, ouvrir],
  )

  useEffect(() => {
    charger()
  }, [charger])

  if (etat.chargement) return <section className="admin config"><p>Chargement…</p></section>
  if (etat.erreur) {
    return (
      <section className="admin config">
        <h2>Configuration de Twin9</h2>
        {etat.erreur instanceof ApiError && etat.erreur.status === 401 ? (
          <p>
            <a href="#/compte">Connectez-vous</a> pour régler vos runs Twin9.
          </p>
        ) : (
          <p className="load-error" role="alert">{etat.erreur.message}</p>
        )}
      </section>
    )
  }

  const changer = (chemin, valeur) => {
    setMessage(null)
    setCourant((c) => {
      let profil = ecrire(c.profil, chemin, valeur)
      // un autre référentiel : sa dernière version, celles du précédent n'y valant rien
      if (chemin.join('/') === 'referentiel/id') profil = ecrire(profil, ['referentiel', 'version'], null)
      return { ...c, profil }
    })
  }

  const enregistrer = async (e) => {
    e.preventDefault()
    setOccupe(true)
    setMessage(null)
    setErreur(null)
    try {
      const enregistre =
        courant.id === null
          ? await createProfil(courant.nom, courant.profil, { fetchFn })
          : await saveProfil(courant.id, courant.nom, courant.profil, { fetchFn })
      if (courant.id === null) setConfig(await fetchConfiguration({ fetchFn }))
      setCourant(enregistre)
      setMessage('Profil enregistré.')
    } catch (err) {
      setErreur(err.message)
    } finally {
      setOccupe(false)
    }
  }

  const supprimer = async () => {
    if (!aSupprimer) {
      setASupprimer(true)
      return
    }
    setOccupe(true)
    try {
      await deleteProfil(courant.id, { fetchFn })
      await charger(null)
      setMessage('Profil supprimé.')
    } catch (err) {
      setErreur(err.message)
    } finally {
      setOccupe(false)
    }
  }

  const contexte = {
    gabarits: config.gabarits,
    referentiels: config.referentiels,
    clePersoOuverte: config.cle_perso_ouverte,
    clePersoEnregistree: config.cle_perso_enregistree,
  }

  return (
    <section className="admin config">
      <h2>Configuration de Twin9</h2>
      <form onSubmit={enregistrer} noValidate>
        <div className="config-barre">
          <label htmlFor="config-profil">Profil</label>
          <select
            id="config-profil"
            value={courant.id ?? ''}
            onChange={(e) =>
              ouvrir(config, e.target.value === '' ? null : Number(e.target.value)).catch((err) => setErreur(err.message))
            }
          >
            <option value="">
              {courant.copieDe === undefined ? 'Nouveau, depuis le profil v9.8' : `Nouveau, copie de « ${courant.copieDe} »`}
            </option>
            {config.profils.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
          <label htmlFor="config-nom">Nom du profil</label>
          <input
            id="config-nom"
            type="text"
            value={courant.nom}
            maxLength={120}
            required
            onChange={(e) => setCourant((c) => ({ ...c, nom: e.target.value }))}
          />
          <div className="config-actions">
            <button type="submit" disabled={occupe}>
              Enregistrer
            </button>
            {courant.id !== null && (
              <>
                <button
                  type="button"
                  className="admin-button-secondary"
                  disabled={occupe}
                  onClick={() => setCourant((c) => ({ ...c, id: null, nom: `${c.nom} (copie)`, copieDe: c.nom }))}
                >
                  Copier
                </button>
                <button type="button" className="admin-button-secondary" disabled={occupe} onClick={supprimer}>
                  {aSupprimer ? 'Confirmer la suppression' : 'Supprimer'}
                </button>
              </>
            )}
          </div>
        </div>
        {erreur && (
          <p className="load-error" role="alert">
            {erreur}
          </p>
        )}
        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}

        <Interrupteur mode={courant.profil.mode} defaut={config.defaut.mode} onChange={(m) => changer(['mode'], m)} />
        {PARTIES.map((cle) => (
          <Reglage
            key={cle}
            chemin={[cle]}
            profil={courant.profil}
            defaut={config.defaut}
            onChange={changer}
            contexte={contexte}
          />
        ))}
      </form>
    </section>
  )
}
