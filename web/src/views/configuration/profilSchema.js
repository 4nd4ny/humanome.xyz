// Le profil d'un run Twin9 lu dans son schéma (T13) : la page #/configuration
// se construit depuis schemas/twin9-profil.schema.json, sans liste de réglages
// à tenir à jour à côté. Fonctions pures : résolution des $ref, genre de chaque
// réglage, lecture et écriture par chemin, égalité, libellés.

import schema from '../../../../schemas/twin9-profil.schema.json'

export const SCHEMA = schema

/** Les parties du profil qui ne se règlent pas : la version du schéma et le type du document. */
export const FIXES = ['schemaVersion', 'kind']

/** Un nœud du schéma, sa référence locale (#/$defs/…) résolue. */
export function resoudre(node) {
  if (!node || typeof node.$ref !== 'string') return node ?? {}
  const { $ref, ...reste } = node
  return { ...schema.$defs[$ref.split('/').pop()], ...reste }
}

/**
 * Le genre d'un réglage : 'objet' (des réglages nommés), 'liste' (le
 * collège), 'table' (clé → valeur), 'choix', 'booleen', 'entier', 'nombre',
 * 'texte', ou 'fixe'.
 */
export function genre(node) {
  const n = resoudre(node)
  if ('const' in n) return 'fixe'
  if (Array.isArray(n.enum)) return 'choix'
  const types = [].concat(n.type ?? [])
  if (types.includes('object')) return n.properties ? 'objet' : 'table'
  if (types.includes('array')) return 'liste'
  if (types.includes('boolean')) return 'booleen'
  if (types.includes('integer')) return 'entier'
  if (types.includes('number')) return 'nombre'
  return 'texte'
}

/** Un réglage qui admet « aucun » (null). */
export function nullable(node) {
  return [].concat(resoudre(node).type ?? []).includes('null')
}

/** Ce que veut dire « aucun » pour un réglage nullable, comme sa description le dit (« null : toutes »). */
export function sensDeNull(node) {
  const m = /null\s*:\s*([^.,;]+)/.exec(resoudre(node).description ?? '')
  return m ? m[1].trim() : 'aucun'
}

/**
 * La valeur que prend le moteur d'un réglage absent, comme sa description la
 * dit (« Absent : 0,3, la valeur du moteur. ») : les réglages de la stigmergie,
 * sans valeur par défaut au schéma ; null sinon.
 */
export function valeurDuMoteur(node) {
  const m = /Absent\s*:\s*(\S+?),?\s+la valeur du moteur/.exec(resoudre(node).description ?? '')
  return m ? m[1] : null
}

/** Un réglage qui peut manquer : son parent ne l'exige pas, et il n'a pas de valeur par défaut. */
export function facultatif(parent, cle) {
  const p = resoudre(parent)
  return !(p.required ?? []).includes(cle) && !('default' in resoudre(p.properties?.[cle]))
}

/** Le nœud du schéma d'un chemin (liste de clés et d'indices). */
export function noeud(chemin) {
  let n = resoudre(schema)
  for (const pas of chemin) {
    n = resoudre(typeof pas === 'number' ? n.items : n.properties?.[pas] ?? n.additionalProperties)
  }
  return n
}

/** La valeur d'un chemin ; undefined si elle manque. */
export function lire(doc, chemin) {
  let v = doc
  for (const pas of chemin) {
    if (v === null || typeof v !== 'object') return undefined
    v = v[pas]
  }
  return v
}

/**
 * Une copie du document, la valeur du chemin remplacée ; undefined la retire.
 * Les objets traversés sont copiés, le reste partagé.
 */
export function ecrire(doc, chemin, valeur) {
  if (chemin.length === 0) return valeur
  const [pas, ...suite] = chemin
  const copie = Array.isArray(doc) ? [...doc] : { ...(doc ?? {}) }
  const enfant = ecrire(copie[pas], suite, valeur)
  if (enfant === undefined && !Array.isArray(copie)) delete copie[pas]
  else copie[pas] = enfant
  return copie
}

/** Deux valeurs JSON égales. */
export function egal(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && egal(a[k], b[k]))
}

/** Le nombre de réglages d'une partie qui diffèrent du profil par défaut. */
export function modifies(doc, defaut, chemin) {
  const n = noeud(chemin)
  const g = genre(n)
  if (g === 'objet') {
    return Object.keys(n.properties).reduce((s, k) => s + modifies(doc, defaut, [...chemin, k]), 0)
  }
  if (g === 'liste') {
    const items = lire(doc, chemin) ?? []
    const longueur = Math.max(items.length, (lire(defaut, chemin) ?? []).length)
    let s = 0
    for (let i = 0; i < longueur; i++) s += modifies(doc, defaut, [...chemin, i])
    return s
  }
  return egal(lire(doc, chemin), lire(defaut, chemin)) ? 0 : 1
}

const LIBELLES = {
  college: 'Collège des lecteurs',
  etages: 'Étages',
  etapes: 'Étapes',
  lecteurs: 'Lecteurs',
  rapide: 'Analyse rapide',
  profond: 'Analyse profonde',
  voie: 'Voie des appels Anthropic',
  parallelisme: 'Parallélisme',
  appels_directs: 'Appels directs simultanés',
  journees: 'Journées menées de front (appels directs)',
  budget_usd: 'Budget (USD)',
  duree_minutes: 'Durée (minutes)',
  cle: 'Clés',
  gabarits: 'Jeu de gabarits',
  referentiel: 'Référentiel',
  id: 'Référentiel',
  version: 'Version',
  jours: 'Journées lues',
  rescan: 'Nouveaux calques des journées inchangées',
  memoire: 'Mémoire de la carte',
  seuils_consensus: 'Seuils du consensus',
  juge_leger: 'Juge léger',
  jury: 'Jury',
  premiere_impression: 'Première impression',
  calques: 'Calques',
  merge: 'Fusion',
  scan_global: 'Arpenteur',
  stigmergie: 'Stigmergie du greffier (essai)',
  evaporation: 'Évaporation (ρ)',
  exploration: 'Exploration (ε)',
  lignes: 'Lignes de traces par dossier (K)',
  troncatures: 'Troncatures',
  fournisseur: 'Fournisseur',
  modele: 'Modèle',
  budget_sortie: 'Budget de sortie',
  effort: 'Effort',
  reflexion: 'Réflexion',
  nom: 'Nom',
  famille: 'Famille',
  poids: 'Poids',
  passes: 'Passes',
  enabled: 'Lancer l’Arpenteur',
}

/** Les libellés qui dépendent du chemin : une même clé, deux réglages (« enabled »). */
const LIBELLES_CHEMINS = {
  'stigmergie/enabled': 'Activer la stigmergie',
}

/** Le libellé d'un réglage : celui de son chemin, connu, ou sa clé, lisible. */
export function libelle(cle, node, chemin) {
  if (typeof cle === 'number') return `Lecteur ${cle + 1}`
  const parChemin = Array.isArray(chemin) ? LIBELLES_CHEMINS[chemin.join('/')] : undefined
  if (parChemin) return parChemin
  if (LIBELLES[cle]) return LIBELLES[cle]
  // une étape : sa description la nomme (« Greffier (étage rapide). »)
  const description = resoudre(node)?.description
  if (description && /^[A-ZÉ][^:]{0,60}\(étage \w+\)\.?$/.test(description)) return description.replace(/\.$/, '')
  const texte = String(cle).replaceAll('_', ' ')
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/**
 * Les fournisseurs d'un appel Twin9, dans l'ordre du registre
 * (Twin9\Fournisseurs\Fournisseurs, ADR-012), et leurs libellés : ceux du
 * registre, qu'un test compare.
 */
export const FOURNISSEURS = schema.$defs.fournisseur.enum
export const FOURNISSEUR_DEFAUT = 'anthropic'
export const LIBELLES_FOURNISSEURS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral AI',
  google: 'Google (Gemini)',
  xai: 'xAI (Grok)',
  openrouter: 'OpenRouter',
}

/** L'étiquette RGPD de chaque fournisseur, celle du registre (un test la compare) : la page la lit au serveur d'abord. */
export const RGPD_FOURNISSEURS = {
  anthropic: 'sous_conditions',
  openai: 'sous_conditions',
  mistral: 'oui',
  google: 'non',
  xai: 'non',
  openrouter: 'non',
}

/**
 * Les réglages de raisonnement qu'une entrée de la grille peut nommer
 * (reflexion_param), par fournisseur : ceux de Twin9Config::REFLEXION_PARAMS
 * (un test les compare), `reasoning_effort` d'OpenAI et `thinkingLevel` de
 * Gemini ; tous les modèles n'admettent pas toutes les valeurs.
 */
export const REFLEXION_PARAMS = {
  openai: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  google: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
}

/** La clé d'un modèle dans la grille des prix (Fournisseurs::clePrix) : l'identifiant nu chez Anthropic, « fournisseur:modèle » sinon. */
export function clePrix(fournisseur, modele) {
  return fournisseur === 'anthropic' ? modele : `${fournisseur}:${modele}`
}

/** Le fournisseur et le modèle d'une clé de la grille (Fournisseurs::depuisClePrix) : une clé nue est d'Anthropic. */
export function depuisClePrix(cle) {
  const i = cle.indexOf(':')
  const fournisseur = i > 0 ? cle.slice(0, i) : null
  return fournisseur !== null && fournisseur !== 'anthropic' && Object.hasOwn(LIBELLES_FOURNISSEURS, fournisseur)
    ? [fournisseur, cle.slice(i + 1)]
    : ['anthropic', cle]
}

const CHOIX = {
  ...LIBELLES_FOURNISSEURS,
  test: 'Essai',
  complet: 'Complet',
  directe: 'Directe',
  lots: 'Par lots',
  instance: 'Celle de l’instance',
  personnelle: 'Ma clé personnelle (ne sert plus)',
  coupee: 'Coupée',
  adaptative: 'Adaptative',
  aleatoire: 'Aléatoire',
}

/** Le libellé d'une valeur d'un choix. */
export function libelleChoix(valeur) {
  return CHOIX[valeur] ?? String(valeur)
}

/** Une valeur, lisible, pour dire la valeur par défaut. */
export function lisible(valeur) {
  if (valeur === undefined) return 'aucune'
  if (valeur === null) return 'aucun'
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'
  if (typeof valeur === 'object') return JSON.stringify(valeur)
  return libelleChoix(valeur)
}

// ---- Fournisseurs (ADR-012) ----------------------------------------------------

/**
 * L'étiquette RGPD d'un fournisseur, lisible. Ce n'est pas un avis juridique : la
 * recherche du comparatif des plateformes (juillet 2026), que le registre reprend.
 */
const RGPD = { oui: 'oui', sous_conditions: 'sous conditions', non: 'non', local: 'local' }

/** « RGPD : sous conditions ». */
export function libelleRgpd(rgpd) {
  return `RGPD : ${RGPD[rgpd] ?? rgpd}`
}

/** La voie d'un fournisseur, lisible : « par lots », « en direct ». */
export function libelleVoie(voie) {
  return { lots: 'par lots', directe: 'en direct', mixte: 'par lots et en direct' }[voie] ?? voie
}

/** Les étapes du profil, dans l'ordre du schéma (le second ressort compris). */
export const ETAPES = Object.keys(schema.properties.etapes.properties)

/** L'étage d'une étape, que sa description nomme (« Greffier (étage rapide). ») ; null si elle n'en nomme pas. */
export function etageDeLEtape(cle) {
  const description = resoudre(schema.properties.etapes.properties[cle])?.description ?? ''
  return /\(étage (\w+)\)/.exec(description)?.[1] ?? null
}

/** L'objet d'un réglage d'appel (étage, étape, lecteur) qui porte la feuille d'un chemin ; null sinon. */
export function objetDe(chemin) {
  if (chemin.length !== 3) return null
  const [partie, nom] = chemin
  if (partie === 'etages' || partie === 'etapes') return typeof nom === 'string' ? [partie, nom] : null
  if (partie === 'college') return typeof nom === 'number' ? [partie, nom] : null
  return null
}

/**
 * Le fournisseur dont hérite un objet qui n'en nomme pas : Anthropic pour un
 * étage, celui de son étage pour une étape, celui de l'étage des lecteurs pour
 * un lecteur. Null au second ressort, qui recouvre des étapes des deux étages :
 * chacune garde le sien.
 */
export function fournisseurHerite(profil, objet) {
  const [partie, nom] = objet
  if (partie === 'etages') return FOURNISSEUR_DEFAUT
  if (partie === 'college') return fournisseurDe(profil, ['etages', 'lecteurs'])
  const etage = etageDeLEtape(nom)
  return nom === 'second_ressort' || etage === null ? null : fournisseurDe(profil, ['etages', etage])
}

/** Le fournisseur effectif d'un objet : le sien, sinon celui dont il hérite. */
export function fournisseurDe(profil, objet) {
  return lire(profil, [...objet, 'fournisseur']) ?? fournisseurHerite(profil, objet)
}

/**
 * Les fournisseurs qu'atteignent les appels d'un profil, dans l'ordre du
 * registre, chacun avec sa voie : par lots pour Anthropic quand le profil le
 * dit, en direct sinon (CallSettings::fournisseurs() côté serveur) — chaque
 * lecteur du collège, chaque étape, chaque étape au second ressort ; l'étage
 * des lecteurs seul n'est appelé par personne.
 *
 * @returns {Array<{id: string, voie: 'lots'|'directe'}>}
 */
export function fournisseursDuProfil(profil) {
  const atteints = new Set()
  ;(profil?.college ?? []).forEach((_, i) => atteints.add(fournisseurDe(profil, ['college', i])))
  const second = lire(profil, ['etapes', 'second_ressort', 'fournisseur'])
  for (const etape of ETAPES.filter((e) => e !== 'second_ressort')) {
    const f = fournisseurDe(profil, ['etapes', etape])
    atteints.add(f)
    atteints.add(second ?? f)
  }
  return FOURNISSEURS.filter((f) => atteints.has(f)).map((id) => ({
    id,
    voie: id === FOURNISSEUR_DEFAUT && profil?.voie === 'lots' ? 'lots' : 'directe',
  }))
}

/**
 * Le motif des identifiants de modèle de chaque fournisseur, ceux du registre
 * (un test les compare) : « claude-… » chez Anthropic et nulle part ailleurs ;
 * ni « / » ni « : » chez Google ; « éditeur/modèle », sans suffixe, chez
 * OpenRouter.
 */
export const MOTIFS_MODELE = {
  anthropic: /^claude-[a-z0-9][a-z0-9.-]{0,72}$/,
  openai: /^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/,
  mistral: /^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/,
  google: /^[a-z0-9][a-z0-9.-]{0,79}$/,
  xai: /^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/,
  openrouter: /^(?=.{3,80}$)[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/,
}

/** Un identifiant de modèle que ce fournisseur admet. */
export function modeleAdmis(fournisseur, modele) {
  const motif = MOTIFS_MODELE[fournisseur]
  return typeof modele === 'string' && motif !== undefined && motif.test(modele)
}

/** La famille d'un lecteur qui n'en nomme pas : l'éditeur du modèle chez OpenRouter, son fournisseur sinon. */
export function familleDefaut(fournisseur, modele) {
  return fournisseur === 'openrouter' && typeof modele === 'string' && modele.includes('/') ? modele.split('/')[0] : fournisseur
}

/** Le modèle effectif d'un objet : le sien, sinon celui de son étage (au second ressort : aucun). */
export function modeleDe(profil, objet) {
  const propre = lire(profil, [...objet, 'modele'])
  if (propre !== undefined) return propre
  const [partie, nom] = objet
  if (partie === 'college') return lire(profil, ['etages', 'lecteurs', 'modele'])
  if (partie === 'etapes') {
    const etage = etageDeLEtape(nom)
    return nom === 'second_ressort' || etage === null ? undefined : lire(profil, ['etages', etage, 'modele'])
  }
  return undefined
}

/**
 * Le profil après qu'un objet a changé de fournisseur (`avant` → `profil`) :
 * la famille d'un lecteur suit, si elle était celle de l'ancien fournisseur
 * (elle part, et le serveur en déduit la nouvelle) ; un modèle que le nouveau
 * fournisseur n'admet pas est retiré d'une étape ou d'un lecteur, et remplacé
 * à l'étage, où il est requis (par celui du profil v9.8 chez Anthropic, à
 * choisir ailleurs) ; l'effort, propre à Anthropic, part avec lui.
 */
export function suivreLeFournisseur(avant, profil, objet, defaut) {
  const ancien = fournisseurDe(avant, objet)
  const nouveau = fournisseurDe(profil, objet)
  if (ancien === nouveau) return profil
  let suite = profil
  if (objet[0] === 'college') {
    const famille = lire(suite, [...objet, 'famille'])
    if (famille === '' || famille === ancien || famille === familleDefaut(ancien, modeleDe(avant, objet))) {
      suite = ecrire(suite, [...objet, 'famille'], undefined)
    }
  }
  const modele = lire(suite, [...objet, 'modele'])
  if (nouveau !== null && modele !== undefined && !modeleAdmis(nouveau, modele)) {
    const remplacant = nouveau === FOURNISSEUR_DEFAUT ? (lire(defaut, [...objet, 'modele']) ?? '') : ''
    suite = ecrire(suite, [...objet, 'modele'], objet[0] === 'etages' ? remplacant : undefined)
  }
  if (nouveau !== null && nouveau !== FOURNISSEUR_DEFAUT) suite = ecrire(suite, [...objet, 'effort'], undefined)
  return suite
}
