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
  voie: 'Voie',
  parallelisme: 'Parallélisme',
  appels_directs: 'Appels directs simultanés',
  journees: 'Journées menées de front (appels directs)',
  budget_usd: 'Budget (USD)',
  duree_minutes: 'Durée (minutes)',
  cle: 'Clé Anthropic',
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
  troncatures: 'Troncatures',
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

/** Le libellé d'un réglage : connu, ou sa clé, lisible. */
export function libelle(cle, node) {
  if (typeof cle === 'number') return `Lecteur ${cle + 1}`
  if (LIBELLES[cle]) return LIBELLES[cle]
  // une étape : sa description la nomme (« Greffier (étage rapide). »)
  const description = resoudre(node)?.description
  if (description && /^[A-ZÉ][^:]{0,60}\(étage \w+\)\.?$/.test(description)) return description.replace(/\.$/, '')
  const texte = String(cle).replaceAll('_', ' ')
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

const CHOIX = {
  test: 'Essai',
  complet: 'Complet',
  directe: 'Directe',
  lots: 'Par lots',
  instance: 'Celle de l’instance',
  personnelle: 'Ma clé personnelle',
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
