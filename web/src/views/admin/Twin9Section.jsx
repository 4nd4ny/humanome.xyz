// Section « Twin9 » de l'administration (ADR-010, AD-D2) — SUPERVISION seule :
//   1. Réglages  : marge Twin9/Twin6, packs PayPal (achetés par les écoles
//                  seules, ADR-013), fournisseurs ouverts aux runs (ADR-012), offre de
//                  modèles -> PUT partiel (diff). Décision COMMERCIALE, admin
//                  seul. Un fournisseur autre qu'Anthropic s'ouvre ici, avec
//                  son étiquette RGPD et la présence de la clé de l'instance
//                  (jamais la clé) ; un fournisseur étiqueté « non » derrière un
//                  second interrupteur ; ses modèles se tarifent à la main, avec
//                  leurs plafonds (sortie, réflexion, durée d'un appel) et leur
//                  réglage de raisonnement ; un modèle dont le pire cas s'est
//                  révélé insuffisant y est signalé (refusé au lancement).
//   2. Jeu par défaut (T14) : le jeu de gabarits du profil par défaut, parmi
//                  le jeu v9.8 et les copies des promptologues (sans contenu).
//   3. Comptes   : supervision des comptes ayant une activité (soldes/cumuls).
//
// L'ÉDITION DES GABARITS a quitté cette section : elle vit dans #/twin9-atelier
// (Twin9AtelierView), réservée aux administrateurs-promptologues (les deux
// rôles, AD-D2). Le contenu du Golden Prompt n'est plus jamais visible ici.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import {
  fetchComptes,
  fetchJeux,
  fetchTwin9Config,
  fixerJeuDefaut,
  formatUsd,
  saveTwin9Config,
} from '../../api/twin9.js'
import {
  FOURNISSEURS,
  LIBELLES_FOURNISSEURS,
  REFLEXION_PARAMS,
  RGPD_FOURNISSEURS,
  clePrix,
  depuisClePrix,
  libelleRgpd,
} from '../configuration/profilSchema.js'

/** @param {string} iso @returns {string} date/heure française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}

// ---- 1. Réglages -----------------------------------------------------------

/** Les fournisseurs qu'un run peut atteindre (twin9_fournisseurs_ouverts) : Anthropic seul quand la config ne le dit pas. */
function ouvertsDe(config) {
  return Array.isArray(config?.twin9_fournisseurs_ouverts) ? config.twin9_fournisseurs_ouverts : ['anthropic']
}

/** Une valeur de la grille, en chaîne pour un champ ('' : absente). */
const champ = (v) => (v === undefined || v === null ? '' : String(v))

/** Brouillon (chaînes) depuis la config effective (admin shape). */
function draftFromConfig(config) {
  return {
    marge: config?.marge === undefined ? '' : String(config.marge),
    margeTwin6: config?.marge_twin6 === undefined ? '' : String(config.marge_twin6),
    ouverts: ouvertsDe(config),
    nonRgpd: Boolean(config?.twin9_fournisseurs_non_rgpd),
    packs: (config?.packs ?? []).map((p) => ({
      montant_usd: String(p.montant_usd),
      libelle: p.libelle,
    })),
    modeles: Object.entries(config?.modeles ?? {}).map(([cle, m]) => {
      const [fournisseur, id] = depuisClePrix(cle)
      return {
        fournisseur,
        id,
        prixIn: String(m.prix_usd_mtok?.[0] ?? ''),
        prixOut: String(m.prix_usd_mtok?.[1] ?? ''),
        plafondSortie: champ(m.plafond_sortie),
        plafondReflexion: champ(m.plafond_reflexion),
        dureeMaxS: champ(m.duree_max_s),
        reflexionParam: m.reflexion_param ?? '',
      }
    }),
  }
}

/**
 * Les fournisseurs, tels que le serveur les dit à l'administrateur (libellé,
 * étiquette RGPD, voie par lots, variable de la clé de l'instance et sa
 * présence) ; à défaut, le registre recopié, sans rien de la clé.
 */
function registreDe(config) {
  return Array.isArray(config?.fournisseurs)
    ? config.fournisseurs
    : FOURNISSEURS.map((id) => ({ id, libelle: LIBELLES_FOURNISSEURS[id], rgpd: RGPD_FOURNISSEURS[id], lots: id === 'anthropic' }))
}

/**
 * Ce que la tranche la plus courte que sert l'instance (la sienne, ou celle du
 * déclencheur si elle est plus courte) laisse à un appel d'un autre
 * fournisseur au départ, en secondes entières, tel que le serveur le dit
 * (duree_max_admise : la règle du lancement) ; 35 à défaut (40 s).
 */
const dureeAdmiseDe = (config) => (Number.isInteger(config?.duree_max_admise) ? config.duree_max_admise : 35)

/** Un entier écrit en chiffres, ou NaN. */
const entier = (texte) => (/^\d+$/.test(String(texte).trim()) ? Number(String(texte).trim()) : Number.NaN)

/** « 2 / 10 » : les prix [entrée, sortie] d'un modèle, en USD par million de jetons. */
function prixLisibles(tarif) {
  const p = tarif?.prix_usd_mtok
  if (!Array.isArray(p)) return '—'
  const palier = tarif.palier_long
  return `${p[0]} / ${p[1]}` + (palier ? ` (au-delà de ${palier.au_dela_de} jetons : ${palier.prix_usd_mtok?.[0]} / ${palier.prix_usd_mtok?.[1]})` : '')
}

/** Horodatage unix (s) -> date/heure française ('—' si absent). */
function frUnix(t) {
  return typeof t === 'number' ? new Date(t * 1000).toLocaleString('fr-FR') : '—'
}

/**
 * Le relevé quotidien des prix d'Anthropic (2026-10-21) : le déclencheur lit leur
 * page une fois par jour et récrit les prix des modèles de l'offre ; son dernier
 * état, tel que le serveur le garde (releve_tarifs, null avant le premier).
 */
function ReleveTarifs({ releve }) {
  const intro = (
    <>
      Prix relevés chaque jour sur{' '}
      <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noreferrer">
        la page des prix d’Anthropic
      </a>{' '}
      par le déclencheur, pour les modèles d’Anthropic de l’offre : une correction à la main tient jusqu’au relevé
      suivant. Les prix des autres fournisseurs se saisissent à la main, et aucun relevé ne les touche.
    </>
  )
  if (!releve) {
    return (
      <div className="privacy-note" data-testid="twin9-releve-tarifs">
        <p>{intro} Aucun relevé encore.</p>
      </div>
    )
  }
  const changements = Array.isArray(releve.changements) ? releve.changements : []
  const absents = Array.isArray(releve.absents) ? releve.absents : []
  return (
    <div className="privacy-note" data-testid="twin9-releve-tarifs">
      <p>
        {intro}{' '}
        {releve.releve_at
          ? `Dernier relevé réussi : ${frUnix(releve.releve_at)}${changements.length === 0 ? ', aucun prix changé.' : ' :'}`
          : 'Aucun relevé réussi encore.'}
      </p>
      {changements.length > 0 ? (
        <ul>
          {changements.map((c) => (
            <li key={c.modele}>
              {c.modele} : {prixLisibles(c.avant)} → {prixLisibles(c.apres)} $ par million de jetons
            </li>
          ))}
        </ul>
      ) : null}
      {absents.length > 0 ? (
        <p>Absents de la page, prix inchangés : {absents.join(', ')}.</p>
      ) : null}
      {releve.statut === 'echec' ? (
        <p role="alert" className="admin-message">
          Dernière tentative, {frUnix(releve.tentative_at)} : échec ({releve.erreur}). La grille garde ses prix ;
          le déclencheur réessaie dans l’heure.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Le modèle d'un autre fournisseur dont un appel a coûté plus que sa réserve
 * (pire_cas_insuffisants, ADR-012 §6) : l'instance a payé l'excédent, et le
 * serveur le refuse au lancement tant que ses plafonds n'ont pas changé.
 */
function PireCasInsuffisant({ cle, marques }) {
  const marque = marques?.[cle]
  if (!marque) return null
  const appels = Number(marque.appels) || 0
  return (
    <p role="alert" className="admin-message" data-testid={`twin9-pire-cas-${cle}`}>
      Pire cas insuffisant : {appels} appel{appels > 1 ? 's' : ''} de ce modèle {appels > 1 ? 'ont' : 'a'} coûté plus
      que {appels > 1 ? 'leur réserve' : 'sa réserve'} (jusqu’à {formatUsd(marque.excedent_max_microusd)} de plus,
      payés par l’instance), depuis le {frDate(marque.depuis)}. Il est refusé au lancement jusqu’à ce que ses plafonds
      changent : relevez son plafond de réflexion, ou son plafond de sortie.
    </p>
  )
}

/**
 * Réglages Twin9 : marge (1..5), packs (montant + libellé, ajout/suppression),
 * offre de modèles (id, prix [in, out] ; un profil ne demande à un modèle que
 * son prix — les « étages » sont partis le 2026-10-20). Enregistrer envoie un
 * DIFF de clés de haut niveau (le serveur fusionne puis valide la config
 * complète ; 422 hors bornes affiché tel quel).
 */
function ReglagesBloc({ config, fetchFn, onSaved }) {
  const [draft, setDraft] = useState(() => draftFromConfig(config))
  const registre = registreDe(config)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Resync sur la config sauvegardée (onSaved met à jour le parent -> config).
  useEffect(() => {
    setDraft(draftFromConfig(config))
  }, [config])

  function setPack(i, field, value) {
    setDraft((prev) => ({
      ...prev,
      packs: prev.packs.map((p, j) => (j === i ? { ...p, [field]: value } : p)),
    }))
  }
  function addPack() {
    setDraft((prev) => ({ ...prev, packs: [...prev.packs, { montant_usd: '', libelle: '' }] }))
  }
  function removePack(i) {
    setDraft((prev) => ({ ...prev, packs: prev.packs.filter((_, j) => j !== i) }))
  }

  function setModele(i, field, value) {
    setDraft((prev) => ({
      ...prev,
      modeles: prev.modeles.map((m, j) => (j === i ? { ...m, [field]: value } : m)),
    }))
  }
  function addModele() {
    // la durée maximale d'un appel proposée : 30 s, au plus ce que la tranche la plus courte servie laisse au départ
    // d'un appel (35 s pour une tranche de 40 s, 21 s pour les 25 s de cron-job.org ; au-delà, un lancement est refusé)
    const duree = String(Math.min(30, dureeAdmiseDe(config)))
    setDraft((prev) => ({
      ...prev,
      modeles: [
        ...prev.modeles,
        { fournisseur: 'anthropic', id: '', prixIn: '', prixOut: '', plafondSortie: '', plafondReflexion: '0', dureeMaxS: duree, reflexionParam: '' },
      ],
    }))
  }

  /** Ouvrir ou fermer un fournisseur ; refermer les fournisseurs « non » les retire tous. */
  function setOuvert(id, ouvert) {
    setDraft((prev) => ({ ...prev, ouverts: ouvert ? [...prev.ouverts, id] : prev.ouverts.filter((f) => f !== id) }))
  }
  function setNonRgpd(permis) {
    setDraft((prev) => ({
      ...prev,
      nonRgpd: permis,
      ouverts: permis ? prev.ouverts : prev.ouverts.filter((f) => registre.find((r) => r.id === f)?.rgpd !== 'non'),
    }))
  }
  function removeModele(i) {
    setDraft((prev) => ({ ...prev, modeles: prev.modeles.filter((_, j) => j !== i) }))
  }

  /** DIFF brouillon -> config effective, ou {error} (validation cliente minimale). */
  function buildPatch() {
    const patch = {}

    const marge = Number.parseFloat(String(draft.marge).replace(',', '.'))
    if (!Number.isFinite(marge)) return { error: 'Marge invalide : nombre attendu.' }
    if (marge !== config.marge) patch.marge = marge

    const margeTwin6 = Number.parseFloat(String(draft.margeTwin6).replace(',', '.'))
    if (!Number.isFinite(margeTwin6)) return { error: 'Marge Twin6 invalide : nombre attendu.' }
    if (margeTwin6 !== config.marge_twin6) patch.marge_twin6 = margeTwin6

    // les fournisseurs ouverts, dans l'ordre du registre ; envoyés seulement s'ils changent
    const ouverts = FOURNISSEURS.filter((f) => draft.ouverts.includes(f))
    const avant = ouvertsDe(config)
    if (ouverts.length !== avant.length || ouverts.some((f) => !avant.includes(f))) patch.twin9_fournisseurs_ouverts = ouverts
    if (draft.nonRgpd !== Boolean(config.twin9_fournisseurs_non_rgpd)) patch.twin9_fournisseurs_non_rgpd = draft.nonRgpd

    const nextPacks = draft.packs.map((p) => ({
      montant_usd: Number.parseFloat(String(p.montant_usd).replace(',', '.')),
      libelle: p.libelle.trim(),
    }))
    for (const p of nextPacks) {
      if (!Number.isFinite(p.montant_usd)) return { error: 'Montant de pack invalide.' }
    }
    if (JSON.stringify(nextPacks) !== JSON.stringify(config.packs)) patch.packs = nextPacks

    const nextModeles = {}
    for (const m of draft.modeles) {
      const id = m.id.trim()
      if (id === '') return { error: 'Identifiant de modèle vide.' }
      // la clé de la grille : l'identifiant nu chez Anthropic, « fournisseur:modèle » ailleurs (ADR-012)
      const cle = clePrix(m.fournisseur, id)
      const prixIn = Number.parseFloat(String(m.prixIn).replace(',', '.'))
      const prixOut = Number.parseFloat(String(m.prixOut).replace(',', '.'))
      if (!Number.isFinite(prixIn) || !Number.isFinite(prixOut)) {
        return { error: `Prix invalide pour « ${cle} ».` }
      }
      // ce que le formulaire n'édite pas (le palier des longs prompts, T10) reste tel quel, à sa place
      const entree = { ...(config.modeles?.[cle] ?? {}), prix_usd_mtok: [prixIn, prixOut] }
      if (m.fournisseur !== 'anthropic') {
        // un autre fournisseur porte ses plafonds (le serveur vérifie leurs bornes de chaque fournisseur)
        const sortie = entier(m.plafondSortie)
        const reflexion = entier(m.plafondReflexion)
        const duree = entier(m.dureeMaxS)
        if (!(sortie > 0)) return { error: `Plafond de sortie invalide pour « ${cle} » : entier strictement positif attendu.` }
        if (!Number.isInteger(reflexion)) return { error: `Plafond de réflexion invalide pour « ${cle} » : entier positif ou nul attendu.` }
        if (!(duree >= 1 && duree <= 45)) return { error: `Durée maximale invalide pour « ${cle} » : de 1 à 45 secondes.` }
        entree.plafond_sortie = sortie
        entree.plafond_reflexion = reflexion
        entree.duree_max_s = duree
        if (m.reflexionParam !== '' && REFLEXION_PARAMS[m.fournisseur]) entree.reflexion_param = m.reflexionParam
        else delete entree.reflexion_param
      }
      nextModeles[cle] = entree
    }
    if (JSON.stringify(nextModeles) !== JSON.stringify(config.modeles)) patch.modeles = nextModeles

    return { patch }
  }

  async function save() {
    const { patch, error: clientError } = buildPatch()
    if (clientError) {
      setMessage(null)
      setError(clientError)
      return
    }
    if (!patch || Object.keys(patch).length === 0) {
      setError(null)
      setMessage('Aucune modification à enregistrer.')
      return
    }
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const next = await saveTwin9Config(patch, { fetchFn })
      onSaved(next)
      setMessage('Réglages Twin9 enregistrés.')
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof ApiUnavailableError
          ? err.message
          : 'Enregistrement impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Réglages</h3>

      <div className="admin-field">
        <label htmlFor="twin9-marge">Contribution Twin9 (multiplicateur sur les prix des fournisseurs)</label>
        <div className="admin-field-input">
          <input
            id="twin9-marge"
            type="number"
            inputMode="decimal"
            min="1"
            max="5"
            step="0.01"
            value={draft.marge}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, marge: event.target.value }))}
          />
          <span className="admin-field-bounds">1 – 5</span>
        </div>
      </div>
      <div className="admin-field">
        <label htmlFor="twin9-marge-twin6">Contribution Twin6 (cartographie ouverte)</label>
        <div className="admin-field-input">
          <input
            id="twin9-marge-twin6"
            type="number"
            inputMode="decimal"
            min="1"
            max="5"
            step="0.01"
            value={draft.margeTwin6}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, margeTwin6: event.target.value }))}
          />
          <span className="admin-field-bounds">1 – 5</span>
        </div>
      </div>
      <p className="privacy-note">
        Par défaut <strong>Twin9 ×1,20</strong> (+20 %, R&amp;D du Golden Prompt propriétaire) et{' '}
        <strong>Twin6 ×1,10</strong> (+10 %, couverture des frais : PayPal, hébergement OVH, domaine,
        budget Haiku de la démo). « Contribution », jamais « surtaxe ».
      </p>

      <h4>Packs de recharge (PayPal)</h4>
      <p className="privacy-note">
        Seules les écoles achètent des crédits (ADR-013) : un autre compte ne voit pas les packs. La
        promotion « Twin9 gratuit avec sa propre clé » a disparu avec la clé personnelle, qu’une analyse
        du serveur ne peut pas garder.
      </p>
      <ul className="twin9-admin-packs">
        {draft.packs.map((p, i) => (
          <li key={i} className="twin9-admin-pack">
            <div className="admin-field">
              <label htmlFor={`twin9-pack-montant-${i}`}>Montant (USD)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-pack-montant-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="100"
                  step="1"
                  value={p.montant_usd}
                  disabled={busy}
                  onChange={(event) => setPack(i, 'montant_usd', event.target.value)}
                />
                <span className="admin-field-bounds">1 – 100</span>
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-pack-libelle-${i}`}>Libellé</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-pack-libelle-${i}`}
                  type="text"
                  value={p.libelle}
                  disabled={busy}
                  onChange={(event) => setPack(i, 'libelle', event.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="admin-button-secondary"
              disabled={busy}
              onClick={() => removePack(i)}
              aria-label={`Supprimer le pack ${i + 1}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="admin-button-secondary" disabled={busy} onClick={addPack}>
        Ajouter un pack
      </button>

      <h4>Fournisseurs des appels Twin9</h4>
      <p className="privacy-note">
        Un run n’atteint que les fournisseurs ouverts ici, Anthropic seul par défaut (ADR-012). Un autre fournisseur
        n’est appelé qu’en direct, avec la clé de l’instance, que l’environnement du serveur porte et que cette page ne
        montre jamais ; ses modèles se tarifent à la main dans l’offre ci-dessous. Les étiquettes RGPD sont
        indicatives, pas un avis juridique. Ouvrir un fournisseur, c’est l’ouvrir à tous les comptes : les textes de
        confidentialité le nomment déjà.
      </p>
      <div className="admin-field admin-field-toggle">
        <label htmlFor="twin9-non-rgpd">
          <input
            id="twin9-non-rgpd"
            type="checkbox"
            checked={draft.nonRgpd}
            disabled={busy}
            onChange={(event) => setNonRgpd(event.target.checked)}
          />{' '}
          Permettre d’ouvrir les fournisseurs étiquetés « non » au regard du RGPD
        </label>
      </div>
      <ul className="twin9-admin-fournisseurs">
        {registre.map((f) => {
          const ouvert = draft.ouverts.includes(f.id)
          return (
            <li key={f.id} className="twin9-admin-fournisseur" data-fournisseur={f.id}>
              <label htmlFor={`twin9-fournisseur-${f.id}`}>
                <input
                  id={`twin9-fournisseur-${f.id}`}
                  type="checkbox"
                  checked={ouvert}
                  disabled={busy || (f.rgpd === 'non' && !draft.nonRgpd && !ouvert)}
                  onChange={(event) => setOuvert(f.id, event.target.checked)}
                />{' '}
                {f.libelle}
              </label>{' '}
              <span className={`value-badge twin9-rgpd twin9-rgpd-${f.rgpd}`}>{libelleRgpd(f.rgpd)}</span>
              {' · '}
              {f.lots ? 'par lots ou en direct' : 'en direct'}
              {typeof f.cle_instance === 'boolean' ? ` · clé de l’instance (${f.env}) : ${f.cle_instance ? 'posée' : 'absente'}` : ''}
            </li>
          )
        })}
      </ul>

      <h4>Offre de modèles</h4>
      <ReleveTarifs releve={config?.releve_tarifs ?? null} />
      <p className="privacy-note">
        Le modèle d’un autre fournisseur porte ses plafonds : le plafond de sortie (en jetons, au moins le budget de
        sortie des étapes qui l’emploient ; 32 768 au plus chez Google), le plafond de réflexion (les jetons de
        raisonnement que le pire cas d’un appel ajoute ; plus de zéro chez xAI, dont le raisonnement ne se coupe pas),
        la durée maximale d’un appel (de 1 à 45 s), et chez OpenAI et Google le réglage de raisonnement le plus bas
        que le modèle admet (un mauvais choix fait refuser ses appels).
      </p>
      <p className="privacy-note" data-testid="twin9-duree-admise">
        {Number.isInteger(config?.secondes_declencheur)
          ? `Le déclencheur demande des tranches de ${config.secondes_declencheur} s, et une page de run ouverte de ${config?.secondes_par_tranche ?? 40} s : `
          : `Les tranches durent ${config?.secondes_par_tranche ?? 40} s : `}
        la plus courte laisse {dureeAdmiseDe(config)} s au départ d’un appel. Un modèle plus long n’est pas admis au
        lancement ; un run qui l’emploie déjà attend une tranche plus longue (sa page ouverte), puis s’arrête au bout de
        30 minutes.
      </p>
      <ul className="twin9-admin-modeles">
        {draft.modeles.map((m, i) => (
          <li key={i} className="twin9-admin-modele">
            <div className="admin-field">
              <label htmlFor={`twin9-modele-fournisseur-${i}`}>Fournisseur</label>
              <div className="admin-field-input">
                <select
                  id={`twin9-modele-fournisseur-${i}`}
                  value={m.fournisseur}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'fournisseur', event.target.value)}
                >
                  {registre.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-modele-id-${i}`}>Identifiant du modèle</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-id-${i}`}
                  type="text"
                  value={m.id}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'id', event.target.value)}
                />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-modele-prixin-${i}`}>Prix entrée (USD / Mtok)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-prixin-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={m.prixIn}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'prixIn', event.target.value)}
                />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-modele-prixout-${i}`}>Prix sortie (USD / Mtok)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-prixout-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={m.prixOut}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'prixOut', event.target.value)}
                />
              </div>
            </div>
            {m.fournisseur !== 'anthropic' ? (
              <>
                <div className="admin-field">
                  <label htmlFor={`twin9-modele-plafond-sortie-${i}`}>Plafond de sortie (jetons)</label>
                  <div className="admin-field-input">
                    <input
                      id={`twin9-modele-plafond-sortie-${i}`}
                      type="number"
                      min="1"
                      step="1"
                      value={m.plafondSortie}
                      disabled={busy}
                      onChange={(event) => setModele(i, 'plafondSortie', event.target.value)}
                    />
                  </div>
                </div>
                <div className="admin-field">
                  <label htmlFor={`twin9-modele-plafond-reflexion-${i}`}>Plafond de réflexion (jetons)</label>
                  <div className="admin-field-input">
                    <input
                      id={`twin9-modele-plafond-reflexion-${i}`}
                      type="number"
                      min="0"
                      step="1"
                      value={m.plafondReflexion}
                      disabled={busy}
                      onChange={(event) => setModele(i, 'plafondReflexion', event.target.value)}
                    />
                  </div>
                </div>
                <div className="admin-field">
                  <label htmlFor={`twin9-modele-duree-${i}`}>Durée maximale d’un appel (s)</label>
                  <div className="admin-field-input">
                    <input
                      id={`twin9-modele-duree-${i}`}
                      type="number"
                      min="1"
                      max="45"
                      step="1"
                      value={m.dureeMaxS}
                      disabled={busy}
                      onChange={(event) => setModele(i, 'dureeMaxS', event.target.value)}
                    />
                    <span className="admin-field-bounds">1 – 45</span>
                  </div>
                </div>
                {REFLEXION_PARAMS[m.fournisseur] ? (
                  <div className="admin-field">
                    <label htmlFor={`twin9-modele-reflexion-${i}`}>Réglage de raisonnement</label>
                    <div className="admin-field-input">
                      <select
                        id={`twin9-modele-reflexion-${i}`}
                        value={m.reflexionParam}
                        disabled={busy}
                        onChange={(event) => setModele(i, 'reflexionParam', event.target.value)}
                      >
                        <option value="">aucun (celui du modèle)</option>
                        {REFLEXION_PARAMS[m.fournisseur].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
                <PireCasInsuffisant cle={clePrix(m.fournisseur, m.id.trim())} marques={config?.pire_cas_insuffisants} />
              </>
            ) : null}
            <button
              type="button"
              className="admin-button-secondary"
              disabled={busy}
              onClick={() => removeModele(i)}
              aria-label={`Supprimer le modèle ${i + 1}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="admin-button-secondary" disabled={busy} onClick={addModele}>
        Ajouter un modèle
      </button>

      <div className="twin9-admin-actions">
        <button type="button" disabled={busy} onClick={save}>
          Enregistrer les réglages
        </button>
      </div>

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
    </div>
  )
}

// ---- 2. Jeu de gabarits par défaut -----------------------------------------

/**
 * Le jeu de gabarits que prend le profil par défaut, et tout profil créé
 * depuis lui : le jeu v9.8 ou la copie d'un promptologue. Noms seulement,
 * jamais le contenu (AD-D2).
 */
function JeuDefautBloc({ fetchFn }) {
  const [jeux, setJeux] = useState(null)
  const [choix, setChoix] = useState('')
  const [defaut, setDefaut] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivant = true
    fetchJeux({ fetchFn })
      .then((res) => {
        if (!vivant) return
        setJeux(res?.jeux ?? [])
        setDefaut(res?.defaut ?? 'v9.8')
        setChoix(res?.defaut ?? 'v9.8')
      })
      .catch(() => vivant && setError('Jeux de gabarits indisponibles.'))
    return () => {
      vivant = false
    }
  }, [fetchFn])

  async function save() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fixerJeuDefaut(choix, { fetchFn })
      setDefaut(res?.defaut ?? choix)
      setMessage(`Jeu par défaut : « ${res?.defaut ?? choix} ».`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Jeu de gabarits par défaut</h3>
      {jeux ? (
        <>
          <div className="admin-field">
            <label htmlFor="twin9-jeu-defaut">Jeu du profil par défaut</label>
            <div className="admin-field-input">
              <select id="twin9-jeu-defaut" value={choix} onChange={(event) => setChoix(event.target.value)}>
                {jeux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.id === 'v9.8' ? 'v9.8' : `${j.id} (de ${j.auteur ?? 'compte supprimé'})`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" disabled={busy || choix === defaut} onClick={save}>
            Enregistrer
          </button>
        </>
      ) : null}
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
    </div>
  )
}

// ---- 3. Comptes ------------------------------------------------------------

/** Supervision : tous les comptes ayant une activité, triés par le serveur. */
function ComptesBloc({ comptes }) {
  return (
    <div className="twin9-admin-bloc">
      <h3>Comptes (supervision)</h3>
      <p className="privacy-note">
        Suivi des établissements et particuliers : soldes et cumuls (compteurs seulement, jamais
        de contenu), triés par dernière activité.
      </p>
      {comptes.length === 0 ? (
        <p>Aucun compte avec activité pour l’instant.</p>
      ) : (
        <table className="admin-table twin9-admin-comptes">
          <thead>
            <tr>
              <th scope="col">Compte</th>
              <th scope="col">Solde</th>
              <th scope="col">Recharges cumulées</th>
              <th scope="col">Consommé cumulé</th>
              <th scope="col">Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((c) => (
              <tr key={c.user_id}>
                <td>
                  {c.nom} <span className="admin-email">({c.email})</span>
                </td>
                <td>{formatUsd(c.solde_microusd)}</td>
                <td>{formatUsd(c.recharges_microusd)}</td>
                <td>{formatUsd(c.consomme_microusd)}</td>
                <td>{frDate(c.derniere_activite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---- Vue ------------------------------------------------------------------

/**
 * @param {object} props
 * @param {typeof fetch} [props.fetchFn] couture de test (injectée par AdminView)
 */
export default function Twin9Section({ fetchFn }) {
  const [config, setConfig] = useState(null)
  const [comptes, setComptes] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [cfg, cp] = await Promise.all([
        fetchTwin9Config({ fetchFn }),
        fetchComptes({ fetchFn }),
      ])
      setConfig(cfg ?? null)
      setComptes(Array.isArray(cp?.comptes) ? cp.comptes : [])
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  if (status === 'loading') {
    return <p role="status">Chargement de Twin9…</p>
  }
  if (status === 'error') {
    return (
      <p role="alert" className="load-error">
        {error}
      </p>
    )
  }

  return (
    <section className="admin-twin9 twin9-admin">
      <h2>Twin9 — supervision</h2>
      <p className="privacy-note">
        L’édition des gabarits du Golden Prompt a déménagé vers l’
        <a href="#/twin9-atelier">atelier Twin9</a> (réservé aux administrateurs-promptologues).
        Cette section garde la supervision commerciale : contribution, packs, comptes ; et le
        jeu de gabarits par défaut.
      </p>
      {config ? <ReglagesBloc config={config} fetchFn={fetchFn} onSaved={setConfig} /> : null}
      <JeuDefautBloc fetchFn={fetchFn} />
      <ComptesBloc comptes={comptes} />
    </section>
  )
}
