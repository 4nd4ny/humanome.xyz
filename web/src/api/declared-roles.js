// Rôles RESPIRE déclarés (sprint 8, UC-CPT-07) — client fin de
// api/src/routes/declared-roles.php.
//
// Une déclaration est l'identité RESPIRE que la personne se donne dans
// #/compte ; elle n'ouvre AUCUN droit (docs/autorisations.md, principe 7). Les
// droits sont les habilitations (`user.roles` de GET api/auth/me), que seul un
// administrateur attribue : le menu, les gardes de vue et le mode d'affichage
// par défaut ne lisent qu'elles. C'est pourquoi enregistrer une déclaration
// ne prévient PAS le shell (pas de notifyAuthChanged) : rien de ce qu'il
// affiche n'en dépend.
//
//   GET api/auth/me/declared-roles -> {roles, foundingCircle, catalogue}
//   PUT api/auth/me/declared-roles {roles, foundingCircle} -> la même forme
//       (remplace la déclaration entière ; 422 {error, fields} sinon)

import { apiFetch } from './client.js'

/**
 * Les neuf rôles déclarables, dans l'ordre de la liste RESPIRE, avec leur
 * libellé : copie de `DeclaredRoles::CATALOGUE` (api/src/Auth/DeclaredRoles.php,
 * test de concordance UC-CPT-07-U15). Elle ne sert qu'à NOMMER les
 * déclarations de la liste d'administration, qui ne porte que des
 * identifiants ; le profil, lui, affiche le catalogue servi par l'API
 * (libellés et définitions), seule source.
 */
export const DECLARED_ROLES = Object.freeze([
  { id: 'cartographe', label: 'Cartographe' },
  { id: 'promptologue', label: 'Promptologue' },
  { id: 'promptagogue', label: 'Promptagogue' },
  { id: 'eclaireur', label: 'Éclaireur' },
  { id: 'architecte', label: 'Architecte' },
  { id: 'epistemiarque', label: 'Épistémiarque' },
  { id: 'mediateur', label: 'Médiateur' },
  { id: 'noesiologue', label: 'Noèsiologue' },
  { id: 'maitre-du-grimoire', label: 'Maître du grimoire' },
])

/** Les rôles avec lesquels la case du cercle des fondateurs est proposée (et acceptée). */
export const FOUNDING_CIRCLE_ELIGIBLE = Object.freeze(['promptagogue', 'epistemiarque', 'maitre-du-grimoire'])

export const FOUNDING_CIRCLE_LABEL = 'Membre du cercle des fondateurs'

/** @param {string} id @returns {string} libellé du rôle déclaré (l'identifiant s'il est inconnu) */
export function declaredRoleLabel(id) {
  return DECLARED_ROLES.find((role) => role.id === id)?.label ?? id
}

/** @param {unknown} value @returns {string[]} les identifiants textuels d'une liste */
function slugs(value) {
  return Array.isArray(value) ? value.filter((role) => typeof role === 'string' && role !== '') : []
}

/**
 * Une réponse de la route, normalisée : rôles déclarés, case, catalogue
 * (entrées sans identifiant ni libellé écartées).
 *
 * @param {any} data
 * @returns {{roles: string[], foundingCircle: boolean, catalogue: Array<{id: string, label: string,
 *   definition: string, habilitation: string|null, foundingCircleEligible: boolean}>}}
 */
export function normalizeDeclaration(data) {
  const catalogue = Array.isArray(data?.catalogue)
    ? data.catalogue
        .filter((entry) => typeof entry?.id === 'string' && entry.id !== '' && typeof entry?.label === 'string')
        .map((entry) => ({
          id: entry.id,
          label: entry.label,
          definition: typeof entry.definition === 'string' ? entry.definition : '',
          habilitation: typeof entry.habilitation === 'string' ? entry.habilitation : null,
          foundingCircleEligible: entry.foundingCircleEligible === true,
        }))
    : []
  return { roles: slugs(data?.roles), foundingCircle: data?.foundingCircle === true, catalogue }
}

/** GET api/auth/me/declared-roles — la déclaration du compte de la session et le catalogue. */
export async function fetchDeclaredRoles(options) {
  return normalizeDeclaration(await apiFetch('auth/me/declared-roles', options))
}

/**
 * PUT api/auth/me/declared-roles — remplace la déclaration entière. Aucun
 * événement de session : une déclaration ne change ni le menu ni les accès.
 *
 * @param {{roles: string[], foundingCircle: boolean}} declaration
 */
export async function saveDeclaredRoles({ roles, foundingCircle }, options) {
  const data = await apiFetch('auth/me/declared-roles', {
    ...options,
    method: 'PUT',
    body: { roles: [...roles], foundingCircle: Boolean(foundingCircle) },
  })
  return normalizeDeclaration(data)
}
