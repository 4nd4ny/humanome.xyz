// Atelier Twin9 (#/twin9-atelier, AD-D2) — édition des gabarits du Golden
// Prompt réservée à admin ∧ promptologue (les DEUX rôles). Garde front doublée
// côté serveur (RequireRole::all). Les jeux de gabarits (T14) : le jeu v9.8 se
// lit, une copie de son auteur s'édite. Gabarits FICTIFS (noms plats).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Twin9AtelierView from './Twin9AtelierView.jsx'
import { resetApiClient } from '../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const PROTOCOLES = {
  protocole: [
    { name: 'gabarit-alpha', longueur: 1200, variables: ['TEXTE_JOURNEE', 'PIECES'], updated_at: '2026-07-10 09:00:00' },
    { name: 'gabarit-beta', longueur: 640, variables: [], updated_at: '2026-07-09 08:00:00' },
  ],
}

const JEUX = {
  defaut: 'v9.8',
  jeux: [
    { id: 'v9.8', auteur: null, mien: false, gabarits: 2, created_at: null, defaut: true },
    { id: 'essai', auteur: 'Camille', mien: true, gabarits: 2, created_at: '2026-10-19 10:00:00', defaut: false },
  ],
}

const COPIE = 'api/twin9/admin/jeux/essai'

const baseRoutes = {
  'GET api/twin9/admin/jeux': () => jsonResponse(200, JEUX),
  [`GET ${COPIE}/protocole`]: () => jsonResponse(200, PROTOCOLES),
}

describe('Twin9AtelierView — garde admin ∧ promptologue', () => {
  it('refuse un admin SEUL (pas promptologue) : rien du contenu, aucun appel réseau', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['admin']} deps={{ fetchFn }} />)
    await screen.findByTestId('twin9-atelier-reserve')
    expect(screen.queryByText(/Gabarits du Golden Prompt/)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuse un promptologue SEUL (pas admin)', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['promptologue']} deps={{ fetchFn }} />)
    await screen.findByTestId('twin9-atelier-reserve')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('autorise un administrateur-promptologue (les deux rôles)', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)
    expect(await screen.findByRole('button', { name: /gabarit-alpha/ })).toBeTruthy()
    expect(screen.getByText(/Contenu confidentiel/i)).toBeTruthy()
    expect(fetchFn).toHaveBeenCalled()
  })
})

describe('Twin9AtelierView — édition et banc d’essai', () => {
  async function renderAtelier(routes) {
    const fetchFn = routedFetch(routes)
    render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)
    await screen.findByRole('button', { name: /gabarit-alpha/ })
    return fetchFn
  }

  it('charge le contenu, l’édite et enregistre (PUT versionné, texte brut)', async () => {
    let putBody = null
    await renderAtelier({
      ...baseRoutes,
      [`GET ${COPIE}/protocole/gabarit-alpha`]: jsonResponse(200, {
        name: 'gabarit-alpha',
        content: 'CONTENU FICTIF {$TEXTE_JOURNEE}',
        variables: ['TEXTE_JOURNEE', 'PIECES'],
      }),
      [`PUT ${COPIE}/protocole/gabarit-alpha`]: (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, { name: 'gabarit-alpha', variables: ['TEXTE_JOURNEE'], status: 'updated' })
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /gabarit-alpha/ }))
    const textarea = await screen.findByLabelText(/Contenu du gabarit/)
    expect(textarea.value).toBe('CONTENU FICTIF {$TEXTE_JOURNEE}')
    fireEvent.change(textarea, { target: { value: 'CONTENU FICTIF MODIFIÉ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText(/nouvelle version archivée/)
    expect(putBody).toEqual({ content: 'CONTENU FICTIF MODIFIÉ' })
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('versions : « Voir » montre le contenu archivé, « Restaurer » repose la version (D13)', async () => {
    let restoreBody = null
    let liveContent = 'CONTENU V2 (vivant)'
    await renderAtelier({
      ...baseRoutes,
      [`GET ${COPIE}/protocole/gabarit-alpha`]: () =>
        jsonResponse(200, { name: 'gabarit-alpha', content: liveContent, variables: [] }),
      [`GET ${COPIE}/protocole/gabarit-alpha/versions`]: () =>
        jsonResponse(200, {
          name: 'gabarit-alpha',
          versions: [{ version: 1, longueur: 10, variables: [], created_at: '2026-07-10 09:00:00' }],
        }),
      [`GET ${COPIE}/protocole/gabarit-alpha/versions/1`]: jsonResponse(200, {
        name: 'gabarit-alpha',
        version: 1,
        content: 'CONTENU V1 (archivé)',
        variables: [],
        created_at: '2026-07-10 09:00:00',
      }),
      [`POST ${COPIE}/protocole/gabarit-alpha/restore`]: (init) => {
        restoreBody = JSON.parse(init.body)
        liveContent = 'CONTENU V1 (archivé)' // le vivant devient la version restaurée
        return jsonResponse(200, { name: 'gabarit-alpha', variables: [], status: 'updated', restored_from: 1 })
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /gabarit-alpha/ }))
    await screen.findByLabelText(/Contenu du gabarit/)
    fireEvent.click(screen.getByRole('button', { name: 'Voir les versions' }))
    await screen.findByRole('button', { name: 'Voir' })

    // « Voir » : contenu archivé en LECTURE (texte brut, <pre>).
    fireEvent.click(screen.getByRole('button', { name: 'Voir' }))
    const apercu = await screen.findByTestId('twin9-apercu-version')
    expect(apercu.textContent).toBe('CONTENU V1 (archivé)')
    expect(apercu.tagName).toBe('PRE')

    // « Restaurer » : POST {version}, l'éditeur recharge le vivant restauré.
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    await screen.findByText(/restaurée comme gabarit vivant/)
    expect(restoreBody).toEqual({ version: 1 })
    expect((await screen.findByLabelText(/Contenu du gabarit/)).value).toBe('CONTENU V1 (archivé)')
  })

  it('banc d’essai : rendu du gabarit en texte brut (aucun appel LLM)', async () => {
    let postBody = null
    await renderAtelier({
      ...baseRoutes,
      [`POST ${COPIE}/tester`]: (init) => {
        postBody = JSON.parse(init.body)
        return jsonResponse(200, { rendu: 'RENDU FICTIF DU GABARIT', non_resolues: [] })
      },
    })

    fireEvent.change(screen.getByLabelText('Gabarit'), { target: { value: 'gabarit-alpha' } })
    const champ = await screen.findByLabelText('TEXTE_JOURNEE')
    fireEvent.change(champ, { target: { value: 'exemple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rendre le gabarit' }))

    const rendu = await screen.findByTestId('twin9-rendu')
    expect(rendu.textContent).toBe('RENDU FICTIF DU GABARIT')
    expect(rendu.tagName).toBe('PRE')
    expect(postBody).toEqual({ name: 'gabarit-alpha', variables: { TEXTE_JOURNEE: 'exemple', PIECES: '' } })
  })

  it('le jeu v9.8 se lit seulement : ni « Enregistrer » ni « Restaurer », l’éditeur en lecture', async () => {
    const fetchFn = await renderAtelier({
      ...baseRoutes,
      'GET api/twin9/admin/jeux/v9.8/protocole': () => jsonResponse(200, PROTOCOLES),
      'GET api/twin9/admin/jeux/v9.8/protocole/gabarit-beta': jsonResponse(200, {
        name: 'gabarit-beta',
        content: 'CONTENU V9.8 FICTIF',
        variables: [],
      }),
      'GET api/twin9/admin/jeux/v9.8/protocole/gabarit-beta/versions': jsonResponse(200, {
        name: 'gabarit-beta',
        versions: [{ version: 1, longueur: 5, variables: [], created_at: '2026-07-10 09:00:00' }],
      }),
    })

    fireEvent.change(screen.getByLabelText('Jeu'), { target: { value: 'v9.8' } })
    await screen.findByText(/Le jeu v9.8 est en lecture seule : copiez-le pour le modifier/)
    fireEvent.click(screen.getByRole('button', { name: /gabarit-beta/ }))
    const textarea = await screen.findByLabelText(/Contenu du gabarit/)
    expect(textarea.value).toBe('CONTENU V9.8 FICTIF')
    expect(textarea.readOnly).toBe(true)
    expect(screen.getByText(/Lecture : gabarit-beta/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir les versions' }))
    await screen.findByRole('button', { name: 'Voir' })
    expect(screen.queryByRole('button', { name: 'Restaurer' })).toBeNull()
    expect(fetchFn.mock.calls.some(([, init]) => (init?.method ?? 'GET') !== 'GET')).toBe(false)
  })

  it('copie le jeu v9.8 sous un nom, puis ouvre la copie', async () => {
    let jeux = { defaut: 'v9.8', jeux: [JEUX.jeux[0]] }
    let postBody = null
    const fetchFn = routedFetch({
      'GET api/twin9/admin/jeux': () => jsonResponse(200, jeux),
      'GET api/twin9/admin/jeux/v9.8/protocole': () => jsonResponse(200, PROTOCOLES),
      'POST api/twin9/admin/jeux': (init) => {
        postBody = JSON.parse(init.body)
        jeux = { defaut: 'v9.8', jeux: [JEUX.jeux[0], { ...JEUX.jeux[1], id: 'mienne' }] }
        return jsonResponse(201, { id: 'mienne', gabarits: 2 })
      },
      'GET api/twin9/admin/jeux/mienne/protocole': () => jsonResponse(200, PROTOCOLES),
    })
    render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)
    await screen.findByText(/Le jeu v9.8 est en lecture seule/)

    fireEvent.change(screen.getByLabelText(/Copier le jeu v9.8 sous le nom/), { target: { value: 'mienne' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    await screen.findByText(/Copie « mienne » créée \(2 gabarits\)/)
    expect(postBody).toEqual({ id: 'mienne' })
    expect(screen.getByLabelText('Jeu').value).toBe('mienne')
    expect(screen.getByText(/jeu « mienne »/)).toBeTruthy()
    expect(screen.queryByText(/Le jeu v9.8 est en lecture seule/)).toBeNull()
  })

  it('n’affiche pas la liste d’un jeu quitté avant sa réponse', async () => {
    let rendreV98 = null
    await renderAtelier({
      ...baseRoutes,
      'GET api/twin9/admin/jeux': () =>
        jsonResponse(200, { ...JEUX, jeux: [...JEUX.jeux, { ...JEUX.jeux[1], id: 'autre', mien: false, auteur: 'Noé' }] }),
      'GET api/twin9/admin/jeux/v9.8/protocole': () =>
        new Promise((resolve) => {
          rendreV98 = () => resolve(jsonResponse(200, { protocole: [{ ...PROTOCOLES.protocole[0], name: 'gabarit-v98' }] }))
        }),
      'GET api/twin9/admin/jeux/autre/protocole': () =>
        jsonResponse(200, { protocole: [{ ...PROTOCOLES.protocole[0], name: 'gabarit-autre' }] }),
    })

    fireEvent.change(screen.getByLabelText('Jeu'), { target: { value: 'v9.8' } })
    fireEvent.change(screen.getByLabelText('Jeu'), { target: { value: 'autre' } })
    await screen.findByRole('button', { name: /gabarit-autre/ })
    await act(async () => rendreV98())
    await waitFor(() => expect(screen.getByLabelText('Jeu').value).toBe('autre'))
    expect(screen.queryByRole('button', { name: /gabarit-v98/ })).toBeNull()
    expect(screen.getByText(/jeu « autre »/)).toBeTruthy()
  })
})
