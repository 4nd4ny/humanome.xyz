// UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>, #/twin9-atelier) :
// les rôles de la session viennent du shell (App → Twin9AtelierView), le
// réseau est simulé (fetch global) avec des gabarits FICTIFS aux noms
// HIÉRARCHIQUES, comme en production (« lourd/20-greffier »). L'atelier ouvre
// la copie de l'utilisateur, « essai » (T14) ; le jeu v9.8 s'y lit seulement.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { API_UNAVAILABLE_MESSAGE } from '../../../src/api/client.js'
import { bodyOf, htmlResponse, jsonResponse, meResponse, stubFetch } from '../support/twin.js'

const NOM = 'lourd/20-greffier'
const ENC = 'lourd%2F20-greffier'
const V_ACTUELLE = 'Greffier FICTIF v2 : examine {$EXTRAIT} pour {$CODE}.'
const V_ARCHIVEE = 'Greffier FICTIF v1 : examine {$EXTRAIT}.'
const LISTE = {
  protocole: [
    { name: NOM, longueur: V_ACTUELLE.length, variables: ['EXTRAIT', 'CODE'], updated_at: '2026-07-10 09:00:00' },
    { name: 'tagger/1-tag-pole', longueur: 80, variables: ['POLE_NUM'], updated_at: '2026-07-09 08:00:00' },
  ],
}

const V98 = { id: 'v9.8', auteur: null, mien: false, gabarits: 2, created_at: null, defaut: true }
const ESSAI = { id: 'essai', auteur: 'Camille', mien: true, gabarits: 2, created_at: '2026-10-19 10:00:00', defaut: false }
const COPIE = 'twin9/admin/jeux/essai'

function routes(overrides = {}) {
  return {
    'GET auth/me': meResponse(['admin', 'promptologue']),
    'GET twin9/admin/jeux': jsonResponse(200, { defaut: 'v9.8', jeux: [V98, ESSAI] }),
    [`GET ${COPIE}/protocole`]: jsonResponse(200, LISTE),
    [`GET ${COPIE}/protocole/${ENC}`]: jsonResponse(200, { name: NOM, content: V_ACTUELLE, variables: ['EXTRAIT', 'CODE'], updated_at: '2026-07-10 09:00:00' }),
    ...overrides,
  }
}

/** Le shell sonde la session lui-même (GET api/auth/me) : rôles ET jeton CSRF. */
function openAtelier() {
  window.location.hash = '#/twin9-atelier'
  render(<App lib={fakeLib} />)
}

async function ouvrirGabarit() {
  fireEvent.click(await screen.findByRole('button', { name: /lourd\/20-greffier/ }))
  return screen.findByLabelText('Contenu du gabarit (texte brut)')
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-08 — l’administrateur-promptologue édite un gabarit', () => {
  it('UC-PRO-08-F01 — nominal : liste (métadonnées), ouverture, édition, enregistrement versionné, liste rafraîchie', async () => {
    const { calls } = stubFetch(
      routes({ [`PUT ${COPIE}/protocole/${ENC}`]: jsonResponse(200, { name: NOM, variables: ['EXTRAIT', 'CODE', 'POLE_NOM'], status: 'updated' }) }),
    )
    openAtelier()

    expect(await screen.findByText(/Contenu confidentiel — ne pas divulguer/)).toBeDefined()
    const entree = await screen.findByRole('button', { name: /lourd\/20-greffier/ })
    expect(entree.textContent).toContain(`${V_ACTUELLE.length} caractères · 2 variables`)
    const zone = await ouvrirGabarit()
    expect(zone.value).toBe(V_ACTUELLE)

    fireEvent.change(zone, { target: { value: `${V_ACTUELLE} Pôle : {$POLE_NOM}.` } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect(await screen.findByText(`Gabarit « ${NOM} » enregistré (nouvelle version archivée).`)).toBeDefined()
    const put = calls.find((c) => c.key === `PUT ${COPIE}/protocole/${ENC}`)
    expect(bodyOf(put)).toEqual({ content: `${V_ACTUELLE} Pôle : {$POLE_NOM}.` })
    expect(put.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
    expect(calls.filter((c) => c.key === `GET ${COPIE}/protocole`)).toHaveLength(2) // liste relue
  })

  it('UC-PRO-08-F02 — A1 : enregistrer un contenu identique → « aucune nouvelle version »', async () => {
    stubFetch(routes({ [`PUT ${COPIE}/protocole/${ENC}`]: jsonResponse(200, { name: NOM, variables: [], status: 'unchanged' }) }))
    openAtelier()
    await ouvrirGabarit()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })
    expect(await screen.findByText('Contenu inchangé — aucune nouvelle version.')).toBeDefined()
  })

  it('UC-PRO-08-F03 — A2 : historique → lecture d’une version archivée → restauration non destructive ; restaurer une version identique → « rien à restaurer »', async () => {
    let restauree = false
    const { calls } = stubFetch(
      routes({
        [`GET ${COPIE}/protocole/${ENC}`]: () =>
          jsonResponse(200, { name: NOM, content: restauree ? V_ARCHIVEE : V_ACTUELLE, variables: ['EXTRAIT'] }),
        [`GET ${COPIE}/protocole/${ENC}/versions`]: () =>
          jsonResponse(200, {
            name: NOM,
            versions: restauree
              ? [
                  { version: 2, longueur: V_ACTUELLE.length, variables: ['EXTRAIT', 'CODE'], created_at: '2026-07-12 10:00:00' },
                  { version: 1, longueur: V_ARCHIVEE.length, variables: ['EXTRAIT'], created_at: '2026-07-01 10:00:00' },
                ]
              : [{ version: 1, longueur: V_ARCHIVEE.length, variables: ['EXTRAIT'], created_at: '2026-07-01 10:00:00' }],
          }),
        [`GET ${COPIE}/protocole/${ENC}/versions/1`]: jsonResponse(200, { name: NOM, version: 1, content: V_ARCHIVEE, variables: ['EXTRAIT'] }),
        [`POST ${COPIE}/protocole/${ENC}/restore`]: () => {
          const deja = restauree
          restauree = true
          return jsonResponse(200, { name: NOM, variables: ['EXTRAIT'], status: deja ? 'unchanged' : 'updated', restored_from: 1 })
        },
      }),
    )
    openAtelier()
    await ouvrirGabarit()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Voir les versions' }))
    })
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(2) // en-tête + v1
    await act(async () => {
      fireEvent.click(within(table).getByRole('button', { name: 'Voir' }))
    })
    expect((await screen.findByTestId('twin9-apercu-version')).textContent).toBe(V_ARCHIVEE)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurer cette version' }))
    })
    expect(await screen.findByText('Version 1 restaurée comme gabarit vivant (l’état précédent est archivé).')).toBeDefined()
    expect(screen.getByLabelText('Contenu du gabarit (texte brut)').value).toBe(V_ARCHIVEE)
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3) // l'ex-vivant est archivé
    expect(bodyOf(calls.find((c) => c.key === `POST ${COPIE}/protocole/${ENC}/restore`))).toEqual({ version: 1 })
    expect(screen.queryByTestId('twin9-apercu-version')).toBeNull()

    // La version 1 est désormais identique au vivant : le serveur répond « unchanged ».
    await act(async () => {
      fireEvent.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'Voir' })[1])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurer cette version' }))
    })
    expect(await screen.findByText('La version 1 est identique au gabarit vivant — rien à restaurer.')).toBeDefined()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3) // aucune version de plus
  })

  it('UC-PRO-08-F04 — A3 : banc d’essai — rendu avec des variables d’exemple, sans appel LLM, variables non résolues signalées', async () => {
    const { calls } = stubFetch(
      routes({ [`POST ${COPIE}/tester`]: jsonResponse(200, { rendu: 'Greffier FICTIF v2 : examine {$EXTRAIT} pour 1.01.', non_resolues: ['EXTRAIT'] }) }),
    )
    openAtelier()
    fireEvent.change(await screen.findByLabelText('Gabarit'), { target: { value: NOM } })
    fireEvent.change(screen.getByLabelText('CODE'), { target: { value: '1.01' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rendre le gabarit' }))
    })

    expect((await screen.findByTestId('twin9-rendu')).textContent).toBe('Greffier FICTIF v2 : examine {$EXTRAIT} pour 1.01.')
    expect(screen.getByText('Variables non résolues : EXTRAIT')).toBeDefined()
    expect(bodyOf(calls.find((c) => c.key === `POST ${COPIE}/tester`))).toEqual({ name: NOM, variables: { EXTRAIT: '', CODE: '1.01' } })
    expect(calls.some((c) => c.key === 'POST twin9/appel')).toBe(false)
  })

  it('UC-PRO-08-F05 — E1 : administrateur SANS le rôle promptologue → atelier réservé, aucun appel, pas de lien dans la navigation', async () => {
    const { calls } = stubFetch(routes({ 'GET auth/me': meResponse(['admin']) }))
    openAtelier()

    // Rôles chargés par le shell (la navigation « Administrer » est apparue)…
    await waitFor(() => expect(document.querySelector('a[href="#/admin/roles"]')).not.toBeNull())
    // … et l'atelier reste réservé.
    expect(screen.getByTestId('twin9-atelier-reserve').textContent).toContain('les deux rôles')
    expect(calls.some((c) => c.key.startsWith('GET twin9/admin/jeux'))).toBe(false)
    expect(screen.queryByRole('link', { name: /Atelier Twin9/ })).toBeNull()
  })

  it('UC-PRO-08-F06 — E3 : contenu vide ou blanc → « Enregistrer » désactivé côté IHM ; refus serveur (422, une variable qu’aucune étape ne fournit) → message affiché, contenu conservé dans l’éditeur', async () => {
    const refus = 'Variable qu’aucune étape ne fournit à ce gabarit : {$PIECES}'
    const { calls } = stubFetch(routes({ [`PUT ${COPIE}/protocole/${ENC}`]: jsonResponse(422, { error: refus }) }))
    openAtelier()
    const zone = await ouvrirGabarit()
    for (const vide of ['', '   \n\t ']) {
      fireEvent.change(zone, { target: { value: vide } })
      expect(screen.getByRole('button', { name: 'Enregistrer' }).disabled).toBe(true)
    }
    expect(calls.some((c) => c.key.startsWith('PUT '))).toBe(false)

    fireEvent.change(zone, { target: { value: `${V_ACTUELLE} {$PIECES}` } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe(refus)
    expect(screen.getByLabelText('Contenu du gabarit (texte brut)').value).toBe(`${V_ACTUELLE} {$PIECES}`)
  })

  it('UC-PRO-08-F07 — E5 : API indisponible (copie statique) → message explicite ; autre refus de la liste (403 : rôles retirés côté serveur) → « Chargement impossible. » ; aucun contenu', async () => {
    stubFetch({ 'GET auth/me': meResponse(['admin', 'promptologue']), 'GET twin9/admin/jeux': htmlResponse(200) })
    openAtelier()
    expect((await screen.findByText(API_UNAVAILABLE_MESSAGE)).getAttribute('role')).toBe('alert')
    expect(screen.queryByText(/Gabarits du Golden Prompt/)).toBeNull()
    cleanup()
    resetApiClient()

    stubFetch({ 'GET auth/me': meResponse(['admin', 'promptologue']), 'GET twin9/admin/jeux': jsonResponse(403, { error: 'Rôle insuffisant' }) })
    openAtelier()
    expect((await screen.findByText('Chargement impossible.')).getAttribute('role')).toBe('alert')
    expect(screen.queryByText(/Gabarits du Golden Prompt/)).toBeNull()
  })

  it('UC-PRO-08-F23 — A6 : sans copie, l’atelier ouvre le jeu v9.8 en lecture ; « Copier » le copie sous le nom donné et ouvre la copie, à éditer', async () => {
    let jeux = [V98]
    const { calls } = stubFetch({
      'GET auth/me': meResponse(['admin', 'promptologue']),
      'GET twin9/admin/jeux': () => jsonResponse(200, { defaut: 'v9.8', jeux }),
      'GET twin9/admin/jeux/v9.8/protocole': jsonResponse(200, LISTE),
      'POST twin9/admin/jeux': () => {
        jeux = [V98, { ...ESSAI, id: 'mienne' }]
        return jsonResponse(201, { id: 'mienne', gabarits: 2 })
      },
      'GET twin9/admin/jeux/mienne/protocole': jsonResponse(200, LISTE),
      [`GET twin9/admin/jeux/mienne/protocole/${ENC}`]: jsonResponse(200, { name: NOM, content: V_ACTUELLE, variables: ['EXTRAIT', 'CODE'] }),
    })
    openAtelier()
    expect(await screen.findByText('Le jeu v9.8 est en lecture seule : copiez-le pour le modifier.')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Copier le jeu v9.8 sous le nom'), { target: { value: 'mienne' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    })
    expect(await screen.findByText(/Copie « mienne » créée \(2 gabarits\)/)).toBeDefined()
    const post = calls.find((c) => c.key === 'POST twin9/admin/jeux')
    expect(bodyOf(post)).toEqual({ id: 'mienne' })
    expect(post.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
    expect(screen.getByLabelText('Jeu').value).toBe('mienne')
    const zone = await ouvrirGabarit()
    expect(zone.readOnly).toBe(false)
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDefined()
  })

  it('UC-PRO-08-F24 — E7 : le jeu v9.8 et la copie d’un autre se lisent sans s’éditer — ni « Enregistrer » ni « Restaurer », aucune écriture', async () => {
    const AUTRE = { id: 'autre', auteur: 'Noé', mien: false, gabarits: 2, created_at: '2026-10-19 11:00:00', defaut: false }
    const { calls } = stubFetch(
      routes({
        'GET twin9/admin/jeux': jsonResponse(200, { defaut: 'v9.8', jeux: [V98, AUTRE, ESSAI] }),
        'GET twin9/admin/jeux/autre/protocole': jsonResponse(200, LISTE),
        [`GET twin9/admin/jeux/autre/protocole/${ENC}`]: jsonResponse(200, { name: NOM, content: V_ACTUELLE, variables: ['EXTRAIT', 'CODE'] }),
        [`GET twin9/admin/jeux/autre/protocole/${ENC}/versions`]: jsonResponse(200, {
          name: NOM,
          versions: [{ version: 1, longueur: V_ARCHIVEE.length, variables: ['EXTRAIT'], created_at: '2026-07-01 10:00:00' }],
        }),
      }),
    )
    openAtelier()
    await screen.findByRole('button', { name: /lourd\/20-greffier/ })
    expect(screen.getByLabelText('Jeu').value).toBe('essai')
    expect(within(screen.getByLabelText('Jeu')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'v9.8 (lecture seule) · par défaut',
      'autre (de Noé, lecture seule)',
      'essai (le vôtre)',
    ])

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Jeu'), { target: { value: 'autre' } })
    })
    expect(await screen.findByText('Lecture seule : cette copie est celle de Noé.')).toBeDefined()
    const zone = await ouvrirGabarit()
    expect(zone.readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Voir les versions' }))
    })
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Restaurer' })).toBeNull()
    expect(calls.some((c) => !c.key.startsWith('GET '))).toBe(false)
  })
})
