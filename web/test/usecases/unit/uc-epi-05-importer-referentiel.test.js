// UC-EPI-05 — Importer un référentiel d'une autre structure : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
//
// Code sollicité appelé directement : le client du référentiel
// (web/src/views/epistemiarque/api.js : import, catalogue) et le client HTTP
// (web/src/api/client.js), qui garde le détail d'un document refusé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, fetchMe, resetApiClient } from '../../../src/api/client.js'
import { createEpistemiarqueApi } from '../../../src/views/epistemiarque/api.js'

afterEach(() => resetApiClient())

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

const DOCUMENT = { kind: 'referentiel', id: 'fictif-lettre', niveaux: [{ nom: 'capacité', motif: '[A-E][1-4]' }] }

describe('UC-EPI-05 — client du référentiel', () => {
  it('UC-EPI-05-U08 — import (document, niveau facultatif) en POST, catalogue des publiés en GET', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createEpistemiarqueApi(apiFetchFn)
    await api.importReferentiel(DOCUMENT, 'capacité')
    await api.importReferentiel(DOCUMENT)
    await api.listCatalogue()
    expect(apiFetchFn.mock.calls).toEqual([
      ['referentiel/import', { method: 'POST', body: { document: DOCUMENT, niveau: 'capacité' } }],
      ['referentiel/import', { method: 'POST', body: { document: DOCUMENT } }],
      ['referentiels'],
    ])
  })

  it('UC-EPI-05-U09 — un document refusé garde son détail par pointeur ; une autre erreur n’en a pas', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === 'api/auth/me') return jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-epi-05' })
      if (url === 'api/referentiel/import') {
        return jsonResponse(422, {
          error: 'Document fails referentiel integrity checks',
          errors: { '/competences/3/code': ['« A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'] },
        })
      }
      return jsonResponse(409, { error: 'RESPIRE s’édite compétence par compétence dans son atelier : il ne s’importe pas' })
    })
    await fetchMe({ fetchFn })

    const refus = await apiFetch('referentiel/import', { method: 'POST', body: { document: DOCUMENT }, fetchFn }).catch((e) => e)
    expect(refus.status).toBe(422)
    expect(refus.errors).toEqual({ '/competences/3/code': ['« A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'] })
    expect(fetchFn.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf-epi-05')

    const conflit = await apiFetch('referentiel/drafts', { method: 'POST', body: {}, fetchFn }).catch((e) => e)
    expect([conflit.status, conflit.errors]).toEqual([409, null])
  })
})
