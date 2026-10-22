// Client de l'assistant tuteur (D9) — POST /api/tuteur, protégé par preuve de
// travail (même défi que la démo, GET api/llm/challenge). N'envoie JAMAIS le
// portfolio : la question, la rubrique courante (nom de route) et la mémoire
// courte (les 2 derniers échanges de l'onglet, bornés, sprint 11 lot C). Le
// rôle est déterminé CÔTÉ SERVEUR d'après la session ; on ne l'envoie pas.
import { apiFetch } from '../api/client.js'
import { fetchChallenge } from './demo-llm.js'
import { solvePow } from './pow.js'

/** Échanges gardés : une question et sa réponse chacun. */
export const MEMOIRE_ECHANGES = 2
/** Caractères (points de code) de tous les messages gardés ensemble. */
export const MEMOIRE_MAX_CARACTERES = 1500
/** Caractères d'un message : un échange tient toujours dans le total. */
export const MEMOIRE_MAX_PAR_MESSAGE = 750
/** Messages lus depuis la fin du fil : deux échanges parmi quelques égarés. */
const MEMOIRE_LUS = 16

// Les mêmes caractères que le trim de PHP : le serveur relit la mémoire avec
// la même règle (api/src/Tuteur/MemoireCourte.php) et ne la coupe jamais.
const trimPhp = (text) => text.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '')

/** Coupe à 750 points de code (mb_substr de PHP, pas des unités UTF-16). */
function couper(text) {
  const points = [...text]
  return points.length > MEMOIRE_MAX_PAR_MESSAGE ? `${points.slice(0, MEMOIRE_MAX_PAR_MESSAGE - 1).join('')}…` : text
}

const longueur = (echanges) => echanges.reduce((total, [q, r]) => total + [...q].length + [...r].length, 0)

/**
 * Mémoire courte du tuteur : les 2 derniers échanges du fil de l'onglet. Un
 * échange est une question (`user`) immédiatement suivie de sa réponse
 * (`assistant`), de texte non vide ; une question restée sans réponse (appel
 * échoué) ou tout autre message rompt la paire et tombe. Chaque message est
 * coupé à 750 caractères ; tant que le tout dépasse 1 500, l'échange le plus
 * ancien tombe. Même règle, mêmes vecteurs que le serveur
 * (api/tests/fixtures/tuteur/memoire-courte.json).
 * @param {unknown} messages le fil, [{role, text}, …]
 * @returns {{role: 'user'|'assistant', text: string}[]}
 */
export function memoireCourte(messages) {
  if (!Array.isArray(messages)) return []
  let echanges = []
  let question = null
  for (const message of messages.slice(-MEMOIRE_LUS)) {
    const role = message && typeof message === 'object' ? message.role : undefined
    const text = message && typeof message === 'object' && typeof message.text === 'string' ? trimPhp(message.text) : ''
    if (text === '' || (role !== 'user' && role !== 'assistant')) {
      question = null
    } else if (role === 'user') {
      question = text
    } else if (question !== null) {
      echanges.push([couper(question), couper(text)])
      question = null
    }
  }
  echanges = echanges.slice(-MEMOIRE_ECHANGES)
  while (echanges.length > 1 && longueur(echanges) > MEMOIRE_MAX_CARACTERES) echanges.shift()
  return echanges.flatMap(([q, r]) => [
    { role: 'user', text: q },
    { role: 'assistant', text: r },
  ])
}

/**
 * Pose une question au tuteur.
 * @param {{question: string, rubrique?: string, historique?: {role: string, text: string}[]}} params
 *   `historique` : le fil de l'onglet avant cette question ; seule sa mémoire
 *   courte part (`memoireCourte`).
 * @param {{apiFetchFn?: typeof apiFetch, fetchChallengeFn?: typeof fetchChallenge,
 *   solvePowFn?: typeof solvePow, signal?: AbortSignal}} [deps]
 * @returns {Promise<{text: string, model?: string}>}
 */
export async function askTuteur(
  { question, rubrique = '', historique = [] },
  { apiFetchFn = apiFetch, fetchChallengeFn = fetchChallenge, solvePowFn = solvePow, signal } = {},
) {
  const challenge = await fetchChallengeFn({ signal })
  // solvePow renvoie { nonce, attempts } : on n'envoie que le nonce.
  const { nonce } = await solvePowFn({
    challenge: challenge.challenge,
    difficultyBits: challenge.difficultyBits,
    signal,
  })
  const data = await apiFetchFn('tuteur', {
    method: 'POST',
    body: {
      question,
      rubrique,
      historique: memoireCourte(historique),
      challenge: challenge.challenge,
      nonce,
      website: '', // honeypot (doit rester vide)
    },
    ...(signal ? { signal } : {}),
  })
  return { text: typeof data?.text === 'string' ? data.text : '', model: data?.model }
}
