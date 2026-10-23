// Rôles RESPIRE déclarés (UC-CPT-07) : le catalogue tel que l'API le définit,
// LU dans api/src/Auth/DeclaredRoles.php. Les faux serveurs (cpt.js, adm.js)
// servent ainsi exactement le catalogue, l'éligibilité au cercle et les
// habilitations du serveur, et UC-CPT-07-U15 compare la copie des libellés du
// front (web/src/api/declared-roles.js) à cette source.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PHP = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../api/src/Auth/DeclaredRoles.php')
let parsed = null

/** Le bloc `public const NAME = [ … ];` du fichier PHP. */
function constBlock(php, name) {
  const match = new RegExp(`public const ${name} = \\[([\\s\\S]*?)\\n {4}\\];`).exec(php)
  if (!match) throw new Error(`DeclaredRoles.php : constante ${name} introuvable`)
  return match[1]
}

/**
 * @returns {{catalogue: Array<{id: string, label: string, definition: string, habilitation: string|null,
 *   foundingCircleEligible: boolean}>, eligible: string[], habilitations: Record<string, string>,
 *   foundingCircleLabel: string}}
 */
export function phpDeclaredRoles() {
  if (parsed === null) parsed = parse(readFileSync(PHP, 'utf8'))
  return structuredClone(parsed)
}

function parse(php) {
  const habilitations = Object.fromEntries(
    [...constBlock(php, 'HABILITATIONS').matchAll(/'([a-z-]+)' => '([a-z]+)'/g)].map((m) => [m[1], m[2]]),
  )
  const eligibleBlock = /public const FOUNDING_CIRCLE_ELIGIBLE = \[([^\]]*)\];/.exec(php)
  if (!eligibleBlock) throw new Error('DeclaredRoles.php : FOUNDING_CIRCLE_ELIGIBLE introuvable')
  const eligible = [...eligibleBlock[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  const label = /public const FOUNDING_CIRCLE_LABEL = '([^']*)';/.exec(php)
  if (!label) throw new Error('DeclaredRoles.php : FOUNDING_CIRCLE_LABEL introuvable')
  const catalogue = [
    ...constBlock(php, 'CATALOGUE').matchAll(
      /'([a-z-]+)' => \[\s*'label' => '([^']*)',\s*'definition' => '([^']*)',\s*\]/g,
    ),
  ].map(([, id, entryLabel, definition]) => ({
    id,
    label: entryLabel,
    definition,
    habilitation: habilitations[id] ?? null,
    foundingCircleEligible: eligible.includes(id),
  }))
  return { catalogue, eligible, habilitations, foundingCircleLabel: label[1] }
}

/**
 * La validation de DeclaredRoles::validate, rejouée par les faux serveurs
 * (mêmes champs, mêmes messages) : {declaration} ou {fields}.
 *
 * @param {unknown} body
 * @returns {{declaration: {roles: string[], foundingCircle: boolean} | null, fields: Record<string, string>}}
 */
export function validateDeclaration(body) {
  const { catalogue, eligible } = phpDeclaredRoles()
  const ids = catalogue.map((entry) => entry.id)
  if (body === null || typeof body !== 'object' || (Array.isArray(body) && body.length > 0)) {
    return { declaration: null, fields: { body: 'Objet JSON attendu : {roles, foundingCircle}' } }
  }
  const fields = {}
  const declared = []
  const roles = body.roles
  if (!Array.isArray(roles)) {
    fields.roles = 'Liste de rôles attendue (vide pour aucun)'
  } else {
    for (const role of roles) {
      if (typeof role !== 'string') {
        fields.roles = 'Chaque rôle est un identifiant (chaîne)'
        break
      }
      if (role === 'admin') {
        fields.roles = 'Le rôle « admin » ne se déclare pas : seul un administrateur l’attribue'
        break
      }
      if (!ids.includes(role)) {
        fields.roles = `Rôle non déclarable « ${role.slice(0, 32)} » (rôles RESPIRE : ${ids.join(', ')})`
        break
      }
      if (declared.includes(role)) {
        fields.roles = `Rôle « ${role} » en double`
        break
      }
      declared.push(role)
    }
  }
  const foundingCircle = 'foundingCircle' in body ? body.foundingCircle : false
  if (typeof foundingCircle !== 'boolean') {
    fields.foundingCircle = 'Case attendue (true ou false)'
  } else if (foundingCircle && !fields.roles && !declared.some((role) => eligible.includes(role))) {
    fields.foundingCircle =
      'Le cercle des fondateurs est réservé aux promptagogues, épistémiarques et maîtres du grimoire : déclarez l’un de ces rôles'
  }
  if (Object.keys(fields).length > 0) return { declaration: null, fields }
  return { declaration: { roles: ids.filter((id) => declared.includes(id)), foundingCircle }, fields: {} }
}

/**
 * Une déclaration telle que l'API la rend (ordre du catalogue ; la case n'est
 * jamais rapportée sans le rôle qui la porte, DeclaredRoles::ofUsers).
 */
export function declarationOf(stored = {}) {
  const { catalogue, eligible } = phpDeclaredRoles()
  const roles = catalogue.map((entry) => entry.id).filter((id) => (stored.roles ?? []).includes(id))
  return { roles, foundingCircle: stored.foundingCircle === true && roles.some((role) => eligible.includes(role)) }
}

/** DeclaredRoles::grantable : les habilitations appelées, non détenues. */
export function grantableOf(declaredRoles, habilitations) {
  const { habilitations: map } = phpDeclaredRoles()
  return declaredRoles.map((role) => map[role]).filter((role) => role !== undefined && !habilitations.includes(role))
}
