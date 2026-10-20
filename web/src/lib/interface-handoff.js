// Remise d'une cartographie du site à l'interface de cartographie (journal
// de la cartographie D-43) : « Partager depuis l'interface » (Mes
// cartographies, apprenant) et « Ouvrir dans l'interface » (relecture,
// cartographe). L'interface lit telles quelles les journées et parcours du
// site ; une analyse Twin9 (carto_evolutive natif) passe d'abord par
// l'adaptateur du moteur, comme dans la visionneuse « Voir ». Rien ne quitte
// le navigateur : les fichiers sont remis à l'interface, qui les importe dans
// un nouveau jeu.
import { twin9ToMergeDocument } from '@engine/twin9/mapper.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'

/**
 * Nom du fichier d'une cartographie du site (téléchargement, rapport d'import).
 * @param {{type: string, document?: object, updatedAt?: string}} entry
 */
export function cartographyFileName({ type, document, updatedAt }) {
  const day = document?.date ?? document?.periode?.derniere ?? null
  const suffix = day ?? (String(updatedAt ?? '').slice(0, 10) || 'export')
  return `cartographie-${type}-${suffix}.json`
}

/**
 * Fichiers à remettre à l'interface pour une cartographie du site.
 * @param {{type: string, document: object, updatedAt?: string}} entry
 * @param {{getReferentiel?: () => Promise<object>}} [seams]
 * @returns {Promise<Array<{path: string, text: string}>>}
 * @throws {Error} analyse Twin9 sans journée datée (rien à placer sur la ligne de temps)
 */
export async function interfaceFiles(entry, { getReferentiel = loadPublishedReferentiel } = {}) {
  let document = entry.document
  if (entry.type === 'twin9') {
    const loaded = await getReferentiel()
    document = twin9ToMergeDocument(entry.document, loaded?.doc ?? loaded ?? null, {
      generatedAt: entry.document?.date ?? null,
    })
  }
  return [{ path: cartographyFileName(entry), text: JSON.stringify(document) }]
}

/**
 * Fichiers à remettre à l'interface pour un run Twin9 du serveur (T9) : un
 * document `twin9-run` — le run, sa fusion, ses cartes du jour (celles que sa
 * mémoire a reprises comprises), son référentiel —, que l'interface
 * importe avec le dossier de chaque verdict, délibérations comprises
 * (carto/core/importers/twin9-run.js). Un run arrêté avant sa fin (T10 : son
 * budget, sa durée, le crédit) remet ses journées finies, sans fusion
 * peut-être, sa carte marquée incomplète.
 *
 * Le référentiel est celui du run (T17) : ses pôles et ses compétences, tels
 * que son moteur les a lus ; les résultats n'en portent aucune description
 * (les fiches en sont faites), le référentiel publié de même identifiant
 * donne les siennes. Un run d'avant T16, qui ne le dit pas, a lu RESPIRE : le
 * référentiel publié.
 * @param {{run: object, sorties: Record<string, string>, memoire?: string[], referentiel?: object | null}} resultats GET /api/twin9/runs/{id}/resultats
 * @param {{getReferentiel?: () => Promise<object>}} [seams]
 * @returns {Promise<Array<{path: string, text: string}>>}
 * @throws {Error} run sans fusion ni journée finie (rien à placer sur la ligne de temps)
 */
export async function twin9RunFiles(resultats, { getReferentiel = loadPublishedReferentiel } = {}) {
  const fusion = resultats?.sorties?.['carto_evolutive.json']
  const journees = {}
  for (const [chemin, texte] of Object.entries(resultats?.sorties ?? {})) {
    const m = /^journees\/(.+)\/carto_jour\.json$/.exec(chemin)
    if (m) journees[m[1]] = JSON.parse(texte)
  }
  if (typeof fusion !== 'string' && Object.keys(journees).length === 0) {
    throw new Error('Ce run n’a encore ni fusion ni journée finie : rien à ouvrir dans la cartographie.')
  }
  const loaded = await getReferentiel()
  const publie = loaded?.doc ?? loaded ?? null
  const doc = {
    kind: 'twin9-run',
    run: resultats.run,
    referentiel: resultats.referentiel ? avecDescriptions(resultats.referentiel, publie) : publie,
    carto_evolutive: typeof fusion === 'string' ? JSON.parse(fusion) : null,
    journees,
    memoire: resultats.memoire ?? [],
    incomplete: resultats.run?.statut !== 'termine',
  }
  return [{ path: `twin9-run-${resultats.run?.id ?? 'run'}.json`, text: JSON.stringify(doc) }]
}

/** Le référentiel d'un run, avec les descriptions du référentiel publié de même identifiant. */
function avecDescriptions(referentiel, publie) {
  if (!publie || publie.id !== referentiel.id || !Array.isArray(referentiel.competences)) return referentiel
  const descriptions = new Map((publie.competences ?? []).map((c) => [c.code, c.description]))
  return {
    ...referentiel,
    competences: referentiel.competences.map((c) => (typeof descriptions.get(c.code) === 'string' ? { ...c, description: descriptions.get(c.code) } : c)),
  }
}
