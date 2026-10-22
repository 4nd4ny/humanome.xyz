// Interface ultime — modèle de la copie autonome (spec §11, point 2) :
// public/carto/viewer-template.html, construit par scripts/build-viewer.mjs
// et livré avec le site. Lu une fois par session, puis gardé en mémoire.
// Lu à côté d'index.html : une copie du site ouverte en file:// ne peut pas
// le lire (fetch refusé), elle le dit au lieu de « Failed to fetch » (INSTALL.md §4).

import { DATA_SLOT } from '../core/standalone.js'

export const TEMPLATE_URL = 'carto/viewer-template.html'

/** Raison affichée après « La copie autonome n'a pas pu être produite : ». */
export const VIEWER_TEMPLATE_FILE_MESSAGE =
  'elle se prépare sur le site en ligne ou via un serveur local ' +
  '(son modèle ne peut pas être lu depuis un fichier ouvert directement)'

const defaultFetch = (...args) => fetch(...args)
const cache = new WeakMap()

/**
 * @param {typeof fetch} [fetchFn]
 * @param {{protocol?: string}} [options] test seam (défaut : location.protocol)
 * @throws {Error} VIEWER_TEMPLATE_FILE_MESSAGE en file://, sans rien lire
 */
export async function loadViewerTemplate(fetchFn = defaultFetch, { protocol } = {}) {
  if ((protocol ?? globalThis.location?.protocol) === 'file:') throw new Error(VIEWER_TEMPLATE_FILE_MESSAGE)
  if (cache.has(fetchFn)) return cache.get(fetchFn)
  const res = await fetchFn(TEMPLATE_URL)
  if (!res.ok) throw new Error(`modèle de copie autonome introuvable (HTTP ${res.status})`)
  const text = await res.text()
  // Un serveur de développement renvoie la page d'accueil pour un fichier absent.
  if (!text.includes(DATA_SLOT)) throw new Error('modèle de copie autonome introuvable : lancez « npm run build:viewer »')
  cache.set(fetchFn, text)
  return text
}
