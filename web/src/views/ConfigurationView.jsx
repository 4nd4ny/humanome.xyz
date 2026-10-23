// Page #/configuration (T13, docs/plan-twin9-php.md de Twin_v9, lot 4d) : les
// profils des runs Twin9 de la personne, construits depuis le schéma du profil
// (schemas/twin9-profil.schema.json). Une section par partie ; un
// interrupteur pour le mode essai ; une valeur modifiée se distingue de celle
// du profil v9.8, rien de plus. L'aide d'un réglage paraît quand on y entre.
//
// Les droits (docs/autorisations.md, « Configuration Twin9 ») : chacun règle
// ses profils, le référentiel parmi les publiés. La clé personnelle ne se
// choisit plus (ADR-013 §6 : une analyse du serveur ne peut pas garder la clé
// du navigateur) : un profil enregistré avant qui la porte la montre, avec ce
// qu'il faut faire, jusqu'à ce qu'on en choisisse une autre. Le serveur valide
// et complète chaque profil.
//
// Chaque étage, étape et lecteur choisit son fournisseur (ADR-012) : absent,
// il hérite du sien (« hérité : … »), et son étiquette RGPD se lit à côté,
// sans attendre le focus ; un fournisseur que l'instance n'ouvre pas, ou dont
// elle n'a pas la clé, ne se choisit pas (le serveur dit lequel, jamais
// pourquoi). Changer de fournisseur emporte la famille d'un lecteur qui
// suivait l'ancien, un modèle qu'il n'admet pas, l'effort d'Anthropic. La voie
// ne règle que les appels Anthropic, les autres partent en direct : son
// explication reste visible. Ce qui serait refusé se dit à côté du réglage.
//
// La stigmergie du greffier (sprint 3, un essai du moteur) ne se règle qu'en
// mode expert, comme le profil prédéfini qui l'active (« Stigmergie
// (essai) ») : le mode simple masque sa section, sauf dans un profil qui
// l'active, pour ne rien cacher de ce qui joue. Le mode n'est pas un droit :
// le serveur admet le même profil dans les deux modes.

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import { createProfil, deleteProfil, fetchConfiguration, fetchProfil, saveProfil } from '../api/twin9.js'
import { useUiMode } from '../lib/ui-mode.js'
import {
  ETAPES,
  FIXES,
  FOURNISSEUR_DEFAUT,
  SCHEMA,
  ecrire,
  egal,
  etageDeLEtape,
  facultatif,
  familleDefaut,
  fournisseurDe,
  fournisseurHerite,
  fournisseursDuProfil,
  genre,
  libelle,
  libelleChoix,
  libelleRgpd,
  libelleVoie,
  lire,
  lisible,
  modeleAdmis,
  modeleDe,
  modifies,
  noeud,
  nullable,
  objetDe,
  sensDeNull,
  suivreLeFournisseur,
  valeurDuMoteur,
} from './configuration/profilSchema.js'
import '../styles/configuration.css'

/** Les parties du profil, dans l'ordre du schéma ; le mode a son interrupteur. */
const PARTIES = Object.keys(SCHEMA.properties).filter((cle) => !FIXES.includes(cle) && cle !== 'mode')

/** Les parties qui ne se règlent qu'en mode expert : un essai du moteur. */
const EXPERT = ['stigmergie']

/** La valeur d'un profil prédéfini dans la liste des profils (« predefini:stigmergie »), distincte d'un identifiant. */
const PREDEFINI = 'predefini:'

const ident = (chemin) => `config-${chemin.join('-')}`

/**
 * Ce que l'instance dit de chaque fournisseur (GET twin9/configuration) : son
 * libellé, son étiquette RGPD, s'il peut servir un run maintenant ; Anthropic
 * seul face à un serveur qui ne le dit pas.
 */
const ANTHROPIC_SEUL = [{ id: FOURNISSEUR_DEFAUT, libelle: 'Anthropic', rgpd: 'sous_conditions', disponible: true }]

/** Ce que dit un profil enregistré avant l'ADR-013 sur la clé personnelle : le serveur le refuse au lancement. */
const CLE_PERSONNELLE_RETIREE =
  'La clé personnelle ne sert plus aux analyses du serveur : une analyse approfondie ne peut pas garder la clé de ' +
  'votre navigateur, et humanome ne garde plus les clés de ses utilisateurs. Choisissez la clé de l’instance : ce ' +
  'profil ne part pas tant qu’il porte la clé personnelle.'

/** « Anthropic, OpenAI et Mistral AI ». */
function enumeration(noms) {
  return noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

/** L'étiquette RGPD d'un fournisseur, en pastille (ce n'est pas un avis juridique). */
function Rgpd({ info }) {
  return info?.rgpd ? <span className={`value-badge twin9-rgpd twin9-rgpd-${info.rgpd}`}>{libelleRgpd(info.rgpd)}</span> : null
}

/**
 * Les appels d'un étage qui partent ailleurs que chez Anthropic sans poser leur
 * propre effort : ils hériteraient du sien, que l'API refuse hors d'Anthropic
 * (le second ressort recouvre chaque étape).
 */
function heritiersHorsAnthropic(profil, etage) {
  const hors = new Set()
  const ajouter = (f) => f !== null && f !== FOURNISSEUR_DEFAUT && hors.add(f)
  if (etage === 'lecteurs') {
    ;(profil.college ?? []).forEach((l, i) => l.effort === undefined && ajouter(fournisseurDe(profil, ['college', i])))
    return [...hors]
  }
  const second = lire(profil, ['etapes', 'second_ressort'])
  for (const etape of ETAPES.filter((e) => e !== 'second_ressort' && etageDeLEtape(e) === etage)) {
    if (lire(profil, ['etapes', etape, 'effort']) !== undefined) continue
    ajouter(fournisseurDe(profil, ['etapes', etape]))
    if (second?.effort === undefined) ajouter(second?.fournisseur ?? null)
  }
  return [...hors]
}

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
  const { profil } = contexte
  // un réglage absent du profil v9.8 que le moteur règle seul (la stigmergie) : sa valeur est celle du moteur
  const moteur = valeurDuMoteur(node)
  const parDefaut = defaut === undefined && moteur !== null ? `${moteur}, la valeur du moteur` : lisible(defaut)
  const objet = objetDe(chemin)
  const info = (f) => contexte.fournisseurs.find((x) => x.id === f)
  const nomDe = (f) => info(f)?.libelle ?? libelleChoix(f)
  // ce qui reste visible sans le focus : l'étiquette RGPD, une explication, ce que le serveur refuserait
  let pastille = null
  let explication = null
  let avertissement = null
  let commande

  const options = (valeurs, vide, desactive = false) => (
    <select id={id} value={valeur ?? ''} disabled={desactive} onChange={(e) => onChange(e.target.value === '' ? vide : e.target.value)}>
      {(peutManquer || vide === null) && <option value="">{vide === null ? sensDeNull(node) : '—'}</option>}
      {valeurs.map((v) => (
        <option key={v.valeur ?? v} value={v.valeur ?? v} disabled={v.desactive}>
          {v.libelle ?? libelleChoix(v)}
        </option>
      ))}
    </select>
  )

  if (champ === 'gabarits') {
    // un jeu qui ne lui est plus proposé (ancien jeu par défaut, copie hors de l'atelier) se voit, sans se choisir
    const offerts = valeur == null || contexte.gabarits.includes(valeur) ? contexte.gabarits
      : [...contexte.gabarits, { valeur, libelle: `${valeur} (ne vous est plus proposé)`, desactive: true }]
    commande = options(offerts)
  } else if (champ === 'referentiel/id') {
    commande = options(contexte.referentiels.map((r) => r.id))
  } else if (champ === 'referentiel/version') {
    const ref = contexte.referentiels.find((r) => r.id === contexte.profil.referentiel?.id)
    // ses propres brouillons, pour ses runs d'essai (T15)
    const brouillons = (ref?.brouillons ?? []).map((v) => ({ valeur: v, libelle: `${v} (brouillon, run d’essai)` }))
    commande = options([...(ref?.versions ?? []), ...brouillons], null)
  } else if (cle === 'fournisseur' && objet !== null) {
    // absent, il hérite ; un fournisseur indisponible ne se choisit pas, mais celui que le profil nomme se voit
    const herite = fournisseurHerite(profil, objet)
    const effectif = valeur ?? herite
    commande = (
      <select id={id} value={valeur ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
        <option value="">{herite === null ? 'hérité : celui de chaque étape' : `hérité : ${nomDe(herite)}`}</option>
        {node.enum.map((v) => {
          const disponible = info(v)?.disponible === true
          return (
            <option key={v} value={v} disabled={!disponible && valeur !== v}>
              {nomDe(v)}
              {disponible ? '' : ' (indisponible sur cette instance)'}
            </option>
          )
        })}
      </select>
    )
    pastille = effectif === null ? null : <Rgpd info={info(effectif)} />
    if (valeur !== undefined && valeur !== herite && lire(profil, [...objet, 'modele']) === undefined) {
      avertissement = `Choisissez le modèle ${nomDe(valeur)} de ce réglage : il change de fournisseur.`
    } else if (effectif !== null && info(effectif)?.disponible !== true) {
      avertissement = `${nomDe(effectif)} n’est pas disponible sur cette instance : le profil s’enregistre, il ne se lance pas.`
    }
  } else if (champ === 'voie') {
    // la voie ne règle que les appels Anthropic : sans eux, elle est sans effet
    const anthropic = fournisseursDuProfil(profil).some((f) => f.id === FOURNISSEUR_DEFAUT)
    commande = options(node.enum.map((v) => ({ valeur: v, libelle: libelleChoix(v) })), undefined, !anthropic)
    explication = anthropic
      ? 'Par lots, le défaut : les appels Anthropic passent par son API Message Batches, à moitié prix, et leurs réponses ' +
        'arrivent en différé, de quelques minutes à quelques heures ; Anthropic garde un lot jusqu’à sa suppression, 29 jours ' +
        'au plus. Directe : plein tarif, au fil de l’eau, autant d’appels à la fois que le parallélisme le permet. Les appels ' +
        'aux autres fournisseurs partent toujours en direct ; un profil mixte n’avance qu’au rythme de ses lots.'
      : 'Sans effet : ce profil n’appelle pas Anthropic, tous ses appels partent en direct.'
  } else if (g === 'choix') {
    // la clé personnelle ne se choisit plus (ADR-013 §6) ; un profil d'avant qui la porte la montre, désactivée
    commande = options(
      node.enum
        .filter((v) => !(champ === 'cle' && v === 'personnelle' && valeur !== v))
        .map((v) => ({
          valeur: v,
          libelle: libelleChoix(v),
          desactive: champ === 'cle' && v === 'personnelle',
        })),
      undefined,
    )
    if (champ === 'cle' && valeur === 'personnelle') {
      avertissement = CLE_PERSONNELLE_RETIREE
    }
    if (cle === 'reflexion' && objet !== null) {
      const f = fournisseurDe(profil, objet)
      if (f !== null && f !== FOURNISSEUR_DEFAUT) {
        explication = `Chez ${nomDe(f)}, ce réglage d’Anthropic ne part pas : le raisonnement suit l’entrée de la grille de l’instance pour ce modèle.`
      }
    }
    if (cle === 'effort' && objet !== null && valeur !== undefined) {
      const f = fournisseurDe(profil, objet)
      const heritiers = objet[0] === 'etages' ? heritiersHorsAnthropic(profil, objet[1]) : []
      if (f !== null && f !== FOURNISSEUR_DEFAUT) {
        avertissement = `L’effort est propre à Anthropic : cet appel part chez ${nomDe(f)}, retirez-le.`
      } else if (heritiers.length > 0) {
        avertissement = `Des appels de cet étage partent chez ${enumeration(heritiers.map(nomDe))} : ils hériteraient de cet ` +
          'effort, que l’API refuse hors d’Anthropic. Retirez-le de l’étage, ou posez-le étape par étape.'
      }
    }
  } else if (g === 'booleen') {
    commande = <input id={id} type="checkbox" checked={valeur === true} onChange={(e) => onChange(e.target.checked)} />
    if (champ === 'stigmergie/enabled' && valeur === true) {
      // les calques archivés votent déjà au consensus : le serveur refuse le double compte (ProfilPolicy)
      if (lire(profil, ['calques', 'accumulation']) !== false) {
        avertissement = 'La stigmergie demande de couper l’accumulation des calques (Calques) : les calques archivés ' +
          'votent déjà au consensus, ses traces y compteraient deux fois. Le profil serait refusé.'
      }
      explication = profil.rescan === true
        ? 'Chaque run relit les journées : leurs traces se renforcent ou s’évaporent d’une analyse à l’autre.'
        : 'Sans nouveaux calques des journées inchangées (rescan), une journée inchangée est reprise de la mémoire : ' +
          'ses traces ne changent pas d’un run à l’autre. Activer la stigmergie fait relire une fois les journées.'
    }
  } else if (g === 'entier' || g === 'nombre') {
    commande = (
      <input
        id={id}
        type="number"
        step={g === 'entier' ? 1 : 'any'}
        min={node.minimum ?? node.exclusiveMinimum}
        max={node.maximum}
        value={valeur ?? ''}
        placeholder={nullable(node) ? sensDeNull(node) : peutManquer ? (moteur ?? '—') : undefined}
        onChange={(e) => onChange(nombre(e.target.value, node, peutManquer))}
      />
    )
  } else {
    // la famille d'un lecteur qui n'en pose pas : celle que le serveur en déduit
    const placeholder =
      cle === 'famille' && objet !== null
        ? `par défaut : ${familleDefaut(fournisseurDe(profil, objet), modeleDe(profil, objet))}`
        : peutManquer
          ? '—'
          : undefined
    commande = (
      <input
        id={id}
        type="text"
        value={valeur ?? ''}
        pattern={node.pattern}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' && peutManquer ? undefined : e.target.value)}
      />
    )
    if (cle === 'modele' && objet !== null) {
      const f = fournisseurDe(profil, objet)
      if (f !== null && (valeur === '' || (valeur === undefined && objet[0] === 'etages'))) {
        avertissement = `Choisissez un modèle ${nomDe(f)}.`
      } else if (f !== null && valeur !== undefined && !modeleAdmis(f, valeur)) {
        avertissement = `« ${valeur} » n’est pas un identifiant de modèle ${nomDe(f)}.`
      }
    }
  }

  const aide = node.description
  return (
    <div className={`config-champ${modifie ? ' is-modified' : ''}`} data-chemin={champ}>
      <label htmlFor={id}>
        {libelle(cle, node, chemin)}
        {modifie && (
          <span className="config-modifie" title={`Par défaut : ${parDefaut}`}>
            <span aria-hidden="true"> ●</span>
            <span className="visually-hidden"> (modifié ; par défaut : {parDefaut})</span>
          </span>
        )}
      </label>
      <div className="config-commande">
        {commande}
        {pastille}
      </div>
      {explication && <p className="config-explication">{explication}</p>}
      {avertissement && <p className="config-avertissement">{avertissement}</p>}
      {aide && <p className="config-aide">{aide}</p>}
    </div>
  )
}

/**
 * Les fournisseurs qu'atteignent les appels du profil, chacun avec son
 * étiquette RGPD et sa voie, et s'il peut servir un run sur cette instance :
 * ce que l'accord du lancement nommera.
 */
function FournisseursDuProfil({ profil, fournisseurs }) {
  const info = (f) => fournisseurs.find((x) => x.id === f)
  return (
    <section className="config-fournisseurs" aria-label="Fournisseurs de ce profil">
      <p>
        Ce profil envoie son texte à :{' '}
        {fournisseursDuProfil(profil).map((f, i, liste) => (
          <span key={f.id} className="config-fournisseur">
            {info(f.id)?.libelle ?? libelleChoix(f.id)} <Rgpd info={info(f.id)} /> ({libelleVoie(f.voie)}
            {info(f.id)?.disponible === true ? '' : ', indisponible sur cette instance'})
            {i < liste.length - 1 ? ' · ' : '.'}
          </span>
        ))}
      </p>
      <p className="config-explication">
        Les étiquettes RGPD sont indicatives, pas un avis juridique. Un profil qui nomme un fournisseur indisponible
        s’enregistre, mais ne se lance pas ; seul l’administrateur ouvre un fournisseur.
      </p>
    </section>
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
        {libelle(chemin[chemin.length - 1], node, chemin)}
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
            onClick={() => onChange(chemin, [...(valeur ?? []), { nom: '' }])}>
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
  const { expert } = useUiMode()
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
      // un profil prédéfini se copie dans un nouveau profil, comme celui de la v9.8
      const predefini = typeof id === 'string' ? (c.predefinis ?? []).find((p) => PREDEFINI + p.id === id) : undefined
      setCourant(
        predefini !== undefined
          ? { id: null, nom: predefini.nom, profil: structuredClone(predefini.profil), predefini: predefini.id }
          : id === null || typeof id === 'string'
            ? { id: null, nom: '', profil: structuredClone(c.defaut) }
            : await fetchProfil(id, { fetchFn }),
      )
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
      // un autre fournisseur : la famille qui le suivait, un modèle qu'il n'admet pas, l'effort d'Anthropic
      const objet = objetDe(chemin)
      if (objet !== null && chemin[2] === 'fournisseur') profil = suivreLeFournisseur(c.profil, profil, objet, config.defaut)
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
    fournisseurs: Array.isArray(config.fournisseurs) ? config.fournisseurs : ANTHROPIC_SEUL,
  }

  return (
    <section className="admin config">
      <h2>Configuration de Twin9</h2>
      <form onSubmit={enregistrer} noValidate>
        <div className="config-barre">
          <label htmlFor="config-profil">Profil</label>
          <select
            id="config-profil"
            value={courant.predefini !== undefined ? PREDEFINI + courant.predefini : (courant.id ?? '')}
            onChange={(e) => {
              const v = e.target.value
              ouvrir(config, v === '' ? null : v.startsWith(PREDEFINI) ? v : Number(v)).catch((err) => setErreur(err.message))
            }}
          >
            <option value="">
              {courant.copieDe === undefined ? 'Nouveau, depuis le profil v9.8' : `Nouveau, copie de « ${courant.copieDe} »`}
            </option>
            {(expert || courant.predefini !== undefined) &&
              (config.predefinis ?? []).map((p) => (
                <option key={p.id} value={PREDEFINI + p.id}>
                  {`Nouveau, depuis « ${p.nom} »`}
                </option>
              ))}
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
        <FournisseursDuProfil profil={courant.profil} fournisseurs={contexte.fournisseurs} />
        {PARTIES.filter((cle) => expert || !EXPERT.includes(cle) || courant.profil[cle]?.enabled === true).map((cle) => (
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
