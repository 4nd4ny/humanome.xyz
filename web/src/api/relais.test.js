import { describe, expect, it, vi } from 'vitest'
import { ACCEPT_RELAIS, estRelais, lireRelais } from './relais.js'
import { evenementRelais, reponseRelais } from '../test/relais-response.js'

const RESULTAT = { text: '{"poleNum":"1","nom":"Écouter"}', usage: { inputTokens: 900, outputTokens: 40 }, model: 'm' }

describe('relais en flux (api/relais.js)', () => {
  it('reconnaît un relais à son type, et le demande sans exclure le JSON', () => {
    expect(estRelais(reponseRelais(''))).toBe(true)
    expect(estRelais({ headers: { get: () => 'application/json' } })).toBe(false)
    expect(estRelais({})).toBe(false)
    expect(ACCEPT_RELAIS).toBe('text/event-stream, application/json')
  })

  it('lit la progression puis le résultat, livrés en morceaux coupés n’importe où ; commentaires et événements inconnus ignorés', async () => {
    const texte =
      ': attente\n\n' +
      evenementRelais('progression', { caracteres: 12 }) +
      evenementRelais('inconnu', { x: 1 }) +
      evenementRelais('progression', { caracteres: 36 }) +
      evenementRelais('resultat', RESULTAT)
    for (const taille of [1, 5, 7, 64, 100_000]) {
      const progression = vi.fn()
      expect(await lireRelais(reponseRelais(texte, { taille }), { onProgression: progression })).toEqual({
        status: 200,
        data: RESULTAT,
      })
      expect(progression.mock.calls).toEqual([[12], [36]])
    }
  })

  it('une erreur relayée : son statut, et son corps sans lui ; un statut absent ou invalide vaut 502', async () => {
    const erreur = { error: 'La réponse a dépassé le délai de 150 s : elle est coupée.', code: 'coupe', cout_microusd: 1234 }
    expect(await lireRelais(reponseRelais(evenementRelais('erreur', { status: 504, ...erreur })))).toEqual({
      status: 504,
      data: erreur,
    })
    expect((await lireRelais(reponseRelais(evenementRelais('erreur', { error: 'x' })))).status).toBe(502)
    expect((await lireRelais(reponseRelais(evenementRelais('erreur', { status: 200, error: 'x' })))).status).toBe(502)
  })

  it('une connexion qui lâche en route rend l’issue reçue jusque-là (null sans elle) ; une annulation reste une erreur', async () => {
    // Le texte d'abord, puis l'erreur : une erreur levée tout de suite viderait la file.
    const lachee = (texte, raison) => {
      let tirages = 0
      return new Response(
        new ReadableStream({
          pull(controleur) {
            tirages += 1
            if (tirages === 1) controleur.enqueue(new TextEncoder().encode(texte))
            else controleur.error(raison)
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const progression = vi.fn()
    expect(await lireRelais(lachee(evenementRelais('progression', { caracteres: 7 }), new TypeError('network error')), {
      onProgression: progression,
    })).toBeNull()
    expect(progression).toHaveBeenCalledWith(7)
    expect(await lireRelais(lachee(evenementRelais('resultat', RESULTAT), new TypeError('network error')))).toEqual({
      status: 200,
      data: RESULTAT,
    })
    const annulee = await lireRelais(lachee('', new DOMException('annulée', 'AbortError'))).catch((e) => e)
    expect(annulee.name).toBe('AbortError')
    const controleur = new AbortController()
    controleur.abort(new Error('raison propre'))
    const raison = await lireRelais(lachee('', controleur.signal.reason), { signal: controleur.signal }).catch((e) => e)
    expect(raison.message).toBe('raison propre')
  })

  it('un flux arrêté sans issue rend null ; la dernière issue est lue même sans ligne vide finale ; un corps sans lecteur se lit d’un bloc', async () => {
    expect(await lireRelais(reponseRelais(evenementRelais('progression', { caracteres: 3 })))).toBeNull()
    const sansFin = evenementRelais('resultat', RESULTAT).trimEnd()
    expect(await lireRelais(reponseRelais(sansFin))).toEqual({ status: 200, data: RESULTAT })
    const progression = vi.fn()
    const texte = evenementRelais('progression', { caracteres: 5 }) + evenementRelais('resultat', RESULTAT)
    expect(await lireRelais({ text: async () => texte }, { onProgression: progression })).toEqual({ status: 200, data: RESULTAT })
    expect(progression).toHaveBeenCalledWith(5)
  })
})
