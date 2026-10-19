// UC-EPI-05 — Importer un référentiel d'une autre structure : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
//
// La section « Autres référentiels » de l'atelier (#/epistemiarque/referentiels)
// est rendue pour un membre épistémiarque, puis pour un administrateur qui
// n'en est pas membre : importer un fichier au niveau choisi, lire un refus,
// soumettre, voter, publier. Le client du référentiel est simulé (couture
// deps.docApi) ; RESPIRE n'apparaît pas dans la section. Référentiel FICTIF.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import EpistemiarqueView from '../../../src/views/EpistemiarqueView.jsx'
import { ApiError } from '../../../src/api/client.js'

afterEach(() => cleanup())

const MEMBRE = { id: 1, displayName: 'Alix', roles: ['epistemiarque'] }
const ADMIN = { id: 2, displayName: 'Admin', roles: ['admin'] }

const DOCUMENT = {
  schemaVersion: '2.0.0',
  kind: 'referentiel',
  id: 'fictif-lettre',
  version: '1.0.0',
  label: 'Fictif lettré',
  source: 'Fixture',
  niveaux: [
    { nom: 'capacité', motif: '[A-E][1-4]' },
    { nom: 'facette', motif: '[A-E][1-4]\\.[1-9]' },
  ],
  poles: [{ num: 1, nom: 'A · Pôle fictif', couleur: null }],
  competences: [{ code: 'A1', nom: 'Capacité fictive', pole: 1, elements: [{ code: 'A1.1', nom: 'Facette fictive' }] }],
}

const tally = (pour, reached) => ({ electorateSize: 2, threshold: 2, pour, contre: 0, abstention: 0, notVoted: 2 - pour,
  outcome: reached ? 'adopted' : 'pending', reached })

function docApi(overrides = {}) {
  return {
    listDrafts: vi.fn(async () => [
      { id: 11, referentielId: 'fictif-neuf', semver: '1.0.0', label: 'Fictif à neuf pôles', status: 'review', tally: tally(1, false) },
      { id: 12, referentielId: 'fictif-lettre', semver: '1.1.0', label: 'Fictif lettré', status: 'review', tally: tally(2, true) },
      { id: 13, referentielId: 'fictif-autre', semver: '0.1.0', label: 'Fictif autre', status: 'draft' },
      { id: 14, referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7', status: 'draft' },
    ]),
    listCatalogue: vi.fn(async () => [
      { id: 'fictif-lettre', label: 'Fictif lettré', versions: ['1.0.0'] },
      { id: 'respire', label: 'RESPIRE v7', versions: ['7.0.0'] },
    ]),
    importReferentiel: vi.fn(async (document, niveau) => ({
      id: 20, referentielId: document.id, semver: document.version, status: 'draft',
      content: { poles: document.poles, competences: niveau === 'facette' ? [{ code: 'A1.1' }] : document.competences },
    })),
    getDraft: vi.fn(async (id) => ({ id, referentielId: 'fictif-neuf', semver: '1.0.0', status: 'review', content: {
      poles: [{ num: 1, nom: 'Pôle fictif 1' }, { num: 2, nom: 'Pôle fictif 2' }],
      competences: [{ code: '1.01', nom: 'Compétence fictive 1.01', pole: 1 }, { code: '2.01', nom: 'Compétence fictive 2.01', pole: 2 }],
    } })),
    submitDraft: vi.fn(async () => ({})),
    withdrawDraft: vi.fn(async () => ({})),
    publishDraft: vi.fn(async () => ({})),
    vote: vi.fn(async () => ({})),
    ...overrides,
  }
}

async function ouvrir(user, api) {
  render(<EpistemiarqueView section="referentiels" deps={{ fetchMeFn: async () => ({ user }), docApi: api }} />)
  await screen.findByRole('region', { name: 'Référentiels au vote' })
}

async function choisirFichier(contenu, nom = 'fictif.json') {
  const fichier = new File([contenu], nom, { type: 'application/json' })
  fichier.text = async () => contenu // jsdom ne fournit pas File.text
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Fichier du référentiel'), { target: { files: [fichier] } })
  })
}

async function cliquer(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

describe('UC-EPI-05 — importer, voter, publier un autre référentiel', () => {
  it('UC-EPI-05-F09 — nominal : un fichier à deux niveaux s’importe au niveau choisi ; la section se recharge', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true)

    await choisirFichier(JSON.stringify(DOCUMENT))
    const niveau = screen.getByLabelText('Niveau qui tient lieu de compétence')
    expect(within(niveau).getAllByRole('option').map((o) => o.value)).toEqual(['capacité', 'facette'])
    fireEvent.change(niveau, { target: { value: 'facette' } })
    await cliquer(screen.getByRole('button', { name: 'Importer' }))

    expect(api.importReferentiel).toHaveBeenCalledWith(DOCUMENT, 'facette')
    expect((await screen.findByRole('status')).textContent).toBe(
      'Brouillon « fictif-lettre » 1.0.0 importé : 1 compétences en 1 pôles.',
    )
    expect(api.listDrafts).toHaveBeenCalledTimes(2)
  })

  it('UC-EPI-05-F10 — un fichier à un seul niveau s’importe sans choix ; un fichier illisible est dit', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const { niveaux, ...unNiveau } = DOCUMENT
    await choisirFichier(JSON.stringify(unNiveau))
    expect(screen.queryByLabelText('Niveau qui tient lieu de compétence')).toBeNull()
    await cliquer(screen.getByRole('button', { name: 'Importer' }))
    expect(api.importReferentiel).toHaveBeenCalledWith(unNiveau, null)
    expect(niveaux).toHaveLength(2)

    await choisirFichier('pas du JSON', 'cassé.json')
    expect(screen.getByRole('alert').textContent).toBe('« cassé.json » n’est pas un fichier JSON lisible.')
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true)
  })

  it('UC-EPI-05-F11 — un refus du serveur s’affiche avec ses pointeurs ; rien n’est rechargé ; le fichier corrigé se choisit de nouveau', async () => {
    const refus = new ApiError('Document fails referentiel integrity checks', 422)
    refus.serverMessage = 'Document fails referentiel integrity checks'
    refus.errors = { '/competences/3/code': ['« A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'] }
    const api = docApi({ importReferentiel: vi.fn(async () => Promise.reject(refus)) })
    await ouvrir(MEMBRE, api)
    await choisirFichier(JSON.stringify(DOCUMENT))
    await cliquer(screen.getByRole('button', { name: 'Importer' }))

    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Document fails referentiel integrity checks')
    expect(within(alerte).getByRole('listitem').textContent).toBe(
      '/competences/3/code : « A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »',
    )
    expect(api.listDrafts).toHaveBeenCalledTimes(1)

    // the refused file is set aside: picked again (a browser fires no change for the same
    // name), it is the corrected one that leaves
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true)
    expect(screen.queryByLabelText('Niveau qui tient lieu de compétence')).toBeNull()
    const corrige = { ...DOCUMENT, label: 'Fictif lettré corrigé' }
    await choisirFichier(JSON.stringify(corrige))
    await cliquer(screen.getByRole('button', { name: 'Importer' }))
    expect(api.importReferentiel).toHaveBeenLastCalledWith(corrige, 'capacité')
  })

  it('UC-EPI-05-F12 — un membre soumet, vote, retire, publie une proposition adoptée ; RESPIRE n’est pas là', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const auVote = screen.getByRole('region', { name: 'Référentiels au vote' })
    const [neuf, lettre] = within(auVote).getAllByRole('listitem')
    expect(neuf.textContent).toContain('Fictif à neuf pôles — fictif-neuf 1.0.0')
    expect(within(neuf).queryByRole('button', { name: 'Publier' })).toBeNull()
    expect(within(lettre).getByRole('button', { name: 'Publier' })).toBeDefined()
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent.includes('respire'))).toEqual([])

    await cliquer(within(neuf).getByRole('button', { name: 'Pour' }))
    expect(api.vote).toHaveBeenCalledWith(11, 'pour')
    expect((await screen.findByRole('status')).textContent).toBe('Vote « pour » enregistré.')

    await cliquer(within(screen.getAllByRole('region', { name: 'Référentiels au vote' })[0]).getAllByRole('button', { name: 'Publier' })[0])
    expect(api.publishDraft).toHaveBeenCalledWith(12, null)

    const brouillons = await screen.findByRole('region', { name: 'Brouillons de référentiel' })
    await cliquer(within(brouillons).getByRole('button', { name: 'Soumettre au vote' }))
    expect(api.submitDraft).toHaveBeenCalledWith(13)

    await cliquer(within(screen.getByRole('region', { name: 'Référentiels au vote' })).getAllByRole('button', { name: 'Retirer' })[0])
    expect(api.withdrawDraft).toHaveBeenCalledWith(11)
    expect(within(screen.getByRole('region', { name: 'Référentiels publiés' })).getByRole('listitem').textContent).toBe(
      'Fictif lettré — fictif-lettre 1.0.0',
    )
  })

  it('UC-EPI-05-F13 — un administrateur non membre importe, soumet et publie, sans voter', async () => {
    await ouvrir(ADMIN, docApi())
    const auVote = screen.getByRole('region', { name: 'Référentiels au vote' })
    expect(within(auVote).queryByRole('button', { name: 'Pour' })).toBeNull()
    expect(within(auVote).getByRole('button', { name: 'Publier' })).toBeDefined()
    expect(screen.getByLabelText('Fichier du référentiel')).toBeDefined()
  })

  it('UC-EPI-05-F14 — l’atelier mène à la section ; sans autre référentiel, elle le dit', async () => {
    const api = docApi({ listDrafts: vi.fn(async () => []), listCatalogue: vi.fn(async () => [{ id: 'respire', label: 'RESPIRE v7', versions: ['7.0.0'] }]) })
    render(<EpistemiarqueView section="referentiels" deps={{ fetchMeFn: async () => ({ user: MEMBRE }), docApi: api }} />)
    expect(await screen.findByText('Aucun autre référentiel pour l’instant.')).toBeDefined()
    cleanup()

    const competences = { list: vi.fn(async () => []), listDrafts: vi.fn(async () => []) }
    render(<EpistemiarqueView deps={{ fetchMeFn: async () => ({ user: MEMBRE }), api: competences, docApi: api }} />)
    expect((await screen.findByRole('link', { name: 'Autres référentiels' })).getAttribute('href')).toBe('#/epistemiarque/referentiels')
  })

  it('UC-EPI-05-F15 — étape 4 : le document mis au vote se lit avant le vote, pôle par pôle', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const [neuf] = within(screen.getByRole('region', { name: 'Référentiels au vote' })).getAllByRole('listitem')
    await cliquer(within(neuf).getByRole('button', { name: 'Voir' }))
    expect(api.getDraft).toHaveBeenCalledWith(11)
    const document = await within(neuf).findByRole('list', { name: 'Document' })
    expect(within(document).getAllByRole('listitem').map((li) => li.firstChild.textContent)).toEqual([
      '1 · Pôle fictif 1', '1.01 — Compétence fictive 1.01', '2 · Pôle fictif 2', '2.01 — Compétence fictive 2.01',
    ])
    await cliquer(within(neuf).getByRole('button', { name: 'Masquer' }))
    expect(within(neuf).queryByRole('list', { name: 'Document' })).toBeNull()

    const brouillons = screen.getByRole('region', { name: 'Brouillons de référentiel' })
    await cliquer(within(brouillons).getByRole('button', { name: 'Voir' }))
    expect(api.getDraft).toHaveBeenLastCalledWith(13)
  })
})
