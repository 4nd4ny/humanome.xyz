// Réponses relayées en flux (2026-10-21) — POST api/llm (la démo) et POST
// api/twin6/appel (les crédits). Au navigateur qui la demande (Accept:
// text/event-stream), la route envoie la réponse du modèle à mesure qu'elle
// arrive : des événements `progression` {caracteres}, des commentaires
// « : attente » pendant un silence, puis `resultat` — le JSON que la route
// aurait répondu — ou `erreur` {status, error, …}. Un refus avant tout appel
// (quota, solde, preuve de travail…) reste une réponse JSON ordinaire.
//
// Christian, 2026-10-21 : « Si on passe en appel en flux, alors on voit la
// réponse arriver au fur et à mesure ? […] Si oui, alors c'est mon choix. »
// Un hébergement qui retient le flux le livre d'un bloc à la fin : la lecture
// est la même, sans progression.

/** L'en-tête Accept d'un appel relayé : le flux, sinon le JSON. */
export const ACCEPT_RELAIS = 'text/event-stream, application/json'

/** @returns {boolean} la réponse est un relais en flux */
export function estRelais(response) {
  return String(response?.headers?.get?.('content-type') ?? '').includes('text/event-stream')
}

/**
 * Lit un relais jusqu'à son issue, en signalant la progression.
 *
 * @param {Response} response une réponse `text/event-stream`
 * @param {{onProgression?: (caracteres: number) => void, signal?: AbortSignal}} [options]
 *   les caractères reçus jusqu'ici, pour l'appel en cours ; le signal de la requête
 * @returns {Promise<{status: number, data: object} | null>} l'issue : 200 et le
 *   résultat, ou le statut de l'erreur et son corps ; null quand le flux s'est
 *   arrêté sans issue (connexion coupée, script arrêté par l'hébergement)
 * @throws l'erreur d'un appel annulé (AbortError, ou la raison du signal)
 */
export async function lireRelais(response, { onProgression, signal } = {}) {
  let issue = null
  const lireBloc = (bloc) => {
    let nom = 'message'
    const lignes = []
    for (const ligne of bloc.split('\n')) {
      if (ligne.startsWith('event:')) nom = ligne.slice(6).trim()
      else if (ligne.startsWith('data:')) lignes.push(ligne.slice(5).replace(/^ /, ''))
    }
    if (lignes.length === 0) return // un commentaire (« : attente »)
    let data
    try {
      data = JSON.parse(lignes.join('\n'))
    } catch {
      return
    }
    if (nom === 'progression') {
      const caracteres = Number(data?.caracteres)
      if (Number.isFinite(caracteres)) onProgression?.(caracteres)
    } else if (nom === 'resultat') {
      issue = { status: 200, data }
    } else if (nom === 'erreur') {
      const { status, ...corps } = data ?? {}
      issue = { status: Number.isInteger(status) && status >= 400 ? status : 502, data: corps }
    }
  }
  let tampon = ''
  const consommer = (texte, fin) => {
    // Le serveur sépare ses lignes par « \n » ; un « \r » ne peut venir que
    // d'un intermédiaire (le JSON des données l'échappe).
    tampon += texte.replace(/\r/g, '')
    let limite
    while ((limite = tampon.indexOf('\n\n')) >= 0) {
      lireBloc(tampon.slice(0, limite))
      tampon = tampon.slice(limite + 2)
    }
    if (fin && tampon.trim() !== '') {
      lireBloc(tampon)
      tampon = ''
    }
  }

  const lecteur = response.body?.getReader?.()
  if (!lecteur) {
    consommer(await response.text(), true)
    return issue
  }
  const decodeur = new TextDecoder()
  for (;;) {
    let lu
    try {
      lu = await lecteur.read()
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err
      // La connexion a lâché en route : l'issue reçue jusque-là, s'il y en a une.
      return issue
    }
    const { done, value } = lu
    if (done) {
      consommer(decodeur.decode(), true)
      return issue
    }
    consommer(decodeur.decode(value, { stream: true }), false)
  }
}
