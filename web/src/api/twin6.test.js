import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTwin6Package, makeCreditsProvider, makeOwnKeyProvider, fetchTwin6Offer, TWIN6_PACKAGE_URL } from './twin6.js'
import { resetApiClient } from './client.js'
import { OutputTruncatedError } from '@engine/providers/errors.js'

/** Les octets d'un texte, en ArrayBuffer à leur taille exacte. */
function arrayBufferOf(octets) {
  return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    arrayBuffer: async () => arrayBufferOf(new TextEncoder().encode(JSON.stringify(body))),
  }
}

/** Une réponse qui sert ces octets tels quels (le paquet statique). */
function bytesResponse(octets) {
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, arrayBuffer: async () => arrayBufferOf(octets) }
}

const sha256NodeHex = (octets) => createHash('sha256').update(octets).digest('hex')

beforeEach(() => resetApiClient())

describe('loadTwin6Package', () => {
  it('charge et met en forme le paquet public pour le moteur', async () => {
    const pkg = {
      id: 'twin6-ouverte',
      version: '1.0.0',
      nom: 'Cartographie ouverte Twin6',
      licence: 'AGPL-3.0-only',
      modeleCibleDefaut: 'claude-sonnet-5',
      scanPole: 'SCAN ${POLE}',
      kairos: 'KAIROS',
      fiches: { 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4', 5: 'F5', 6: 'F6', 7: 'F7' },
    }
    const fetchFn = vi.fn(async () => jsonResponse(pkg))
    const out = await loadTwin6Package({ fetchFn, url: 'data/twin6/x.json' })
    expect(fetchFn).toHaveBeenCalledWith('data/twin6/x.json')
    expect(out.id).toBe('twin6-ouverte')
    expect(out.templates.scanPole).toBe('SCAN ${POLE}')
    expect(out.templates.kairos).toBe('KAIROS')
    expect(Object.keys(out.templates.fiches)).toHaveLength(7)
  })

  it('rejette un paquet incomplet', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ id: 'x' }))
    await expect(loadTwin6Package({ fetchFn })).rejects.toThrow(/invalide/)
    // Des octets qui ne sont pas du JSON : invalide de même, sans SyntaxError nu.
    const casse = vi.fn(async () => bytesResponse(new TextEncoder().encode('<html>pas un paquet</html>')))
    await expect(loadTwin6Package({ fetchFn: casse })).rejects.toThrow('Paquet Twin6 invalide (scanPole/kairos/fiches attendus)')
  })

  it('l’empreinte SHA-256 des octets servis, telle que la calcule node:crypto — sur des octets non ASCII, espaces compris', async () => {
    // Inventé : des accents, une espace insécable, une indentation et un saut de ligne final
    // que JSON.parse effacerait — l'empreinte porte sur les octets, pas sur l'objet.
    const texte = '{\n  "id": "paquet-fictif",\n  "version": "1.0.0",\n  "scanPole": "Pôle ${POLE} — « fictif »\u00a0",\n  "kairos": "K",\n  "fiches": {"1": "Fiche"}\n}\n'
    const octets = new TextEncoder().encode(texte)
    const pkg = await loadTwin6Package({ fetchFn: async () => bytesResponse(octets) })
    expect(pkg.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(pkg.sha256).toBe(sha256NodeHex(octets))
    expect(pkg.templates.scanPole).toBe('Pôle ${POLE} — « fictif »\u00a0')
    // Un octet de plus (le même objet, sans le saut final) : une autre empreinte.
    const sansSaut = await loadTwin6Package({ fetchFn: async () => bytesResponse(octets.slice(0, -1)) })
    expect(sansSaut.sha256).not.toBe(pkg.sha256)
    expect(sansSaut.templates).toEqual(pkg.templates)
  })

  it('le paquet servi (web/public, construit par scripts/build-twin6-package.mjs) : son empreinte est celle de ses octets', async () => {
    const octets = readFileSync(resolve(process.cwd(), 'public', TWIN6_PACKAGE_URL))
    const fetchFn = vi.fn(async () => bytesResponse(new Uint8Array(octets.buffer, octets.byteOffset, octets.byteLength)))
    const pkg = await loadTwin6Package({ fetchFn })
    expect(fetchFn).toHaveBeenCalledWith(TWIN6_PACKAGE_URL)
    expect(pkg).toMatchObject({ id: 'twin6-ouverte', version: '1.1.0' })
    expect(pkg.sha256).toBe(sha256NodeHex(octets))
  })
})

describe('makeCreditsProvider', () => {
  it('appelle POST api/twin6/appel et mappe la réponse au contrat moteur', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({
        text: 'carto_P1 { ... }',
        usage: { inputTokens: 1200, outputTokens: 300 },
        model: 'claude-sonnet-5',
        stopReason: 'end_turn',
        cout_microusd: 6602,
      })
    })
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn })
    // Le handle nomme son fournisseur (la configuration du document le consigne) et son transport.
    expect(provider).toMatchObject({ name: 'twin6-credits', fournisseur: 'anthropic', transport: 'proxy' })

    const res = await provider.complete({ model: 'claude-sonnet-5', prompt: 'Analyse pôle 1', maxTokens: 4096 })

    expect(calls[0].url).toBe('api/twin6/appel')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body)).toEqual({
      model: 'claude-sonnet-5',
      prompt: 'Analyse pôle 1',
      system: null,
      max_tokens: 4096,
    })
    expect(res).toEqual({
      text: 'carto_P1 { ... }',
      usage: { inputTokens: 1200, outputTokens: 300 },
      model: 'claude-sonnet-5',
      stopReason: 'end',
      stopReasonRaw: 'end_turn',
      truncated: false,
    })
    expect(couts).toEqual([6602])
  })

  it('sortie tronquée : onCout reçoit le coût de l’appel (facturé), PUIS l’OutputTruncatedError est levée', async () => {
    const events = []
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        text: '{"poleNum": 1, "compet',
        usage: { inputTokens: 1200, outputTokens: 64000 },
        model: 'claude-sonnet-5',
        stopReason: 'max_tokens',
        cout_microusd: 9100,
      }),
    )
    const provider = makeCreditsProvider({ onCout: (c) => events.push(['cout', c]), fetchFn })
    const failure = await provider
      .complete({ model: 'claude-sonnet-5', prompt: 'Analyse pôle 1', maxTokens: 64000 })
      .catch((e) => {
        events.push(['erreur'])
        return e
      })
    expect(events).toEqual([['cout', 9100], ['erreur']])
    expect(failure).toBeInstanceOf(OutputTruncatedError)
    expect(failure).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      stopReason: 'max_tokens',
      stopReasonRaw: 'max_tokens',
      usage: { inputTokens: 1200, outputTokens: 64000 },
      maxTokens: 64000,
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // allowTruncated : le fragment revient, marqué.
    const allowed = await makeCreditsProvider({ fetchFn }).complete({ model: 'claude-sonnet-5', prompt: 'p', allowTruncated: true })
    expect(allowed).toMatchObject({ text: '{"poleNum": 1, "compet', truncated: true, stopReason: 'max_tokens' })
  })

  it('refus relayé : classé (stopReason refusal), pas levé', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ text: '', usage: {}, model: 'claude-sonnet-5', stopReason: 'refusal', cout_microusd: 10 }))
    const res = await makeCreditsProvider({ fetchFn }).complete({ model: 'claude-sonnet-5', prompt: 'p' })
    expect(res).toMatchObject({ text: '', stopReason: 'refusal', stopReasonRaw: 'refusal', truncated: false })
  })
})

describe('makeOwnKeyProvider', () => {
  it('crée un provider direct (clé perso, appel navigateur)', () => {
    const provider = makeOwnKeyProvider({ provider: 'anthropic', apiKey: 'sk-ant-user' })
    expect(typeof provider.complete).toBe('function')
    expect(provider.transport).toBe('direct')
    expect(provider.name).toBe('anthropic')
  })
})

describe('fetchTwin6Offer', () => {
  it('lit les prix Twin6 (+10 %) depuis /twin9/meta', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        modeles: { 'claude-sonnet-5': { prix_usd_mtok: [2.4, 12] } },
        modeles_twin6: { 'claude-sonnet-5': [2.2, 11] },
        referentiel: [{ num: 1, nom: 'TÊTE' }],
      }),
    )
    const offer = await fetchTwin6Offer({ fetchFn })
    expect(offer.modeles['claude-sonnet-5']).toEqual([2.2, 11])
    expect(offer).not.toHaveProperty('twin9PromoOuverte')
    expect(offer.referentiel).toHaveLength(1)
  })
})
