// Réponses « text/event-stream » factices du relais en flux (api/relais.js,
// 2026-10-21) : de vraies Response, dont le corps arrive par morceaux.

const ENTETES = { 'content-type': 'text/event-stream; charset=utf-8' }

/** Un événement du relais, tel que la route l'écrit (RelaisAppel::evenement). */
export function evenementRelais(nom, donnees) {
  return `event: ${nom}\ndata: ${JSON.stringify(donnees)}\n\n`
}

/**
 * Une réponse relayée entière, livrée par morceaux de `taille` octets — coupés
 * n'importe où, au milieu d'un caractère ou d'une fin d'événement compris.
 *
 * @param {string} texte
 * @param {{taille?: number}} [options]
 */
export function reponseRelais(texte, { taille = 7 } = {}) {
  const octets = new TextEncoder().encode(texte)
  const flux = new ReadableStream({
    start(controleur) {
      for (let i = 0; i < octets.length; i += taille) controleur.enqueue(octets.slice(i, i + taille))
      controleur.close()
    },
  })
  return new Response(flux, { status: 200, headers: ENTETES })
}

/**
 * Une réponse relayée que le test conduit : il pousse ses événements quand il
 * le veut, et la ferme — pour voir la page pendant l'appel —, ou la fait
 * échouer comme le navigateur le fait d'une requête annulée (AbortError).
 *
 * @returns {{response: Response, pousser: (texte: string) => void, fermer: () => void,
 *   echouer: (raison: unknown) => void}}
 */
export function relaisPilote() {
  let controleur
  const flux = new ReadableStream({
    start(c) {
      controleur = c
    },
  })
  const encodeur = new TextEncoder()
  return {
    response: new Response(flux, { status: 200, headers: ENTETES }),
    pousser: (texte) => controleur.enqueue(encodeur.encode(texte)),
    fermer: () => controleur.close(),
    echouer: (raison) => controleur.error(raison),
  }
}
