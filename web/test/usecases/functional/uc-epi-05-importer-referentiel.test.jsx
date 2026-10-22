// UC-EPI-05 — Importer un référentiel d'une autre structure : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
//
// La section « Autres référentiels » de l'atelier (#/epistemiarque/referentiels)
// est rendue pour un membre épistémiarque, puis pour un administrateur qui
// n'en est pas membre : importer un fichier au niveau choisi, lire un refus,
// soumettre, voter, publier. Le client du référentiel est simulé (couture
// deps.docApi) ; RESPIRE n'apparaît pas dans la section. Référentiel FICTIF.
// S5, lot D : écrire le référentiel en Markdown (aperçu, motifs déduits,
// erreurs à leur ligne), les modèles à télécharger, l'export d'un publié.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import EpistemiarqueView from '../../../src/views/EpistemiarqueView.jsx'
import { ApiError } from '../../../src/api/client.js'
import { downloadBlob } from '../../../src/lib/download-json.js'
import {
  MODELE_JSON,
  MODELE_MARKDOWN,
  referentielEnMarkdown,
  SOURCE_PAR_DEFAUT,
} from '../../../src/lib/referentiel-markdown.js'

vi.mock('../../../src/lib/download-json.js', () => ({ downloadBlob: vi.fn(() => true), downloadJson: vi.fn(() => true) }))

afterEach(() => {
  cleanup()
  vi.mocked(downloadBlob).mockClear()
})

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
    getPublishedVersion: vi.fn(async () => ({ ...DOCUMENT, contentHash: 'f'.repeat(64) })),
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

/** Un référentiel FICTIF au format des fiches de pôle : deux pôles, deux niveaux. */
const MARKDOWN = [
  '<!-- niveaux : capacité, facette -->', //  1
  '', //                                       2
  '# Pôle 1 — A · Pôle fictif', //             3
  '<!-- couleur : #2563eb -->', //             4
  '', //                                       5
  'Ce que cherche le pôle fictif.', //         6
  '', //                                       7
  '## A1 — Capacité fictive', //               8
  '', //                                       9
  'Ce que désigne A1.', //                     10
  '', //                                       11
  '### A1.1 — Facette fictive', //             12
  '', //                                       13
  '---', //                                    14
  '', //                                       15
  '## A2 — Autre capacité', //                 16
  '', //                                       17
  '### A2.1 — Autre facette', //               18
  '', //                                       19
  '# Pôle 2 — B · Second pôle', //             20
  '', //                                       21
  '## B1 — Capacité du pôle B', //             22
  '', //                                       23
  '### B1.1 — Facette du pôle B', //           24
  '',
].join('\n')

/** Le document qu'il décrit, sous les trois champs de la page. */
const DU_MARKDOWN = {
  schemaVersion: '2.1.0',
  kind: 'referentiel',
  id: 'fictif-md',
  version: '1.0.0',
  label: 'Fictif Markdown',
  source: SOURCE_PAR_DEFAUT,
  niveaux: [
    { nom: 'capacité', motif: '[A-B][1-2]' },
    { nom: 'facette', motif: '[A-B][1-2]\\.1' },
  ],
  poles: [
    { num: 1, nom: 'A · Pôle fictif', couleur: '#2563eb', description: 'Ce que cherche le pôle fictif.' },
    { num: 2, nom: 'B · Second pôle', couleur: null },
  ],
  competences: [
    { code: 'A1', nom: 'Capacité fictive', pole: 1, description: 'Ce que désigne A1.', elements: [{ code: 'A1.1', nom: 'Facette fictive' }] },
    { code: 'A2', nom: 'Autre capacité', pole: 1, elements: [{ code: 'A2.1', nom: 'Autre facette' }] },
    { code: 'B1', nom: 'Capacité du pôle B', pole: 2, elements: [{ code: 'B1.1', nom: 'Facette du pôle B' }] },
  ],
}

const formulaireMarkdown = () => screen.getByRole('form', { name: 'Écrire un référentiel en Markdown' })

async function saisir(libelle, valeur, dans = formulaireMarkdown()) {
  await act(async () => {
    fireEvent.change(within(dans).getByLabelText(libelle), { target: { value: valeur } })
  })
}

async function remplirLesChamps({ id = 'fictif-md', label = 'Fictif Markdown', version = '1.0.0' } = {}) {
  await saisir('Identifiant', id)
  await saisir('Libellé', label)
  await saisir('Version', version)
}

const erreursDuMarkdown = () =>
  within(formulaireMarkdown()).queryAllByRole('list', { name: 'Erreurs du Markdown' }).flatMap((ul) =>
    within(ul).getAllByRole('listitem').map((li) => li.textContent),
  )

/** Le texte d'un Blob de jsdom. */
const texteDu = (blob) =>
  new Promise((resolve) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resolve(lecteur.result)
    lecteur.readAsText(blob)
  })

/** Le texte que porte un lien data: de téléchargement. */
const texteDuLien = (lien) => decodeURIComponent(lien.getAttribute('href').replace(/^data:[^,]*,/, ''))

describe('UC-EPI-05 — concevoir un référentiel en Markdown (S5, lot D)', () => {
  it('UC-EPI-05-F19 — nominal : un fichier .md s’aperçoit, ses motifs se déduisent et se modifient, il s’importe au niveau choisi', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const importerMd = within(formulaireMarkdown()).getByRole('button', { name: 'Importer le Markdown' })
    expect(importerMd.disabled).toBe(true)

    const fichier = new File([MARKDOWN], 'fictif.md', { type: 'text/markdown' })
    fichier.text = async () => MARKDOWN // jsdom ne fournit pas File.text
    await act(async () => {
      fireEvent.change(within(formulaireMarkdown()).getByLabelText('Fichier Markdown'), { target: { files: [fichier] } })
    })
    expect(within(formulaireMarkdown()).getByLabelText('Texte Markdown du référentiel').value).toBe(MARKDOWN)
    expect(within(formulaireMarkdown()).getByText('Aperçu : 2 pôles, 3 compétences, 3 éléments plus fins.')).toBeDefined()
    expect(
      within(within(formulaireMarkdown()).getByRole('list', { name: 'Pôles lus' })).getAllByRole('listitem').map((li) => li.textContent),
    ).toEqual(['1 · A · Pôle fictif — 2 compétences', '2 · B · Second pôle — 1 compétences'])
    // sans les trois champs, rien ne part : la page dit ce qui manque
    expect(erreursDuMarkdown()).toEqual(['Identifiant : requis', 'Version : requise', 'Libellé : requis'])
    expect(importerMd.disabled).toBe(true)

    await remplirLesChamps()
    expect(erreursDuMarkdown()).toEqual([])
    expect(within(formulaireMarkdown()).getByLabelText('Nom du niveau 1').value).toBe('capacité')
    expect(within(formulaireMarkdown()).getByLabelText('Motif du niveau 1').value).toBe('[A-B][1-2]')
    expect(within(formulaireMarkdown()).getByLabelText('Motif du niveau 2').value).toBe('[A-B][1-2]\\.1')
    // le motif des facettes, élargi à la main
    await saisir('Motif du niveau 2', '[A-E][1-4]\\.[1-9]')
    const niveau = within(formulaireMarkdown()).getByLabelText('Niveau qui tient lieu de compétence')
    expect(within(niveau).getAllByRole('option').map((o) => o.value)).toEqual(['capacité', 'facette'])
    fireEvent.change(niveau, { target: { value: 'facette' } })
    await cliquer(importerMd)

    const attendu = structuredClone(DU_MARKDOWN)
    attendu.niveaux[1].motif = '[A-E][1-4]\\.[1-9]'
    expect(api.importReferentiel).toHaveBeenCalledWith(attendu, 'facette')
    expect((await screen.findByRole('status')).textContent).toBe(
      'Brouillon « fictif-md » 1.0.0 importé : 1 compétences en 2 pôles.',
    )
    expect(api.listDrafts).toHaveBeenCalledTimes(2)
    // importé, le formulaire se vide
    expect(within(formulaireMarkdown()).getByLabelText('Texte Markdown du référentiel').value).toBe('')
    expect(within(formulaireMarkdown()).getByLabelText('Identifiant').value).toBe('')
  })

  it('UC-EPI-05-F20 — E1 : les erreurs du texte s’affichent à leur ligne et bloquent l’import ; un refus du serveur garde le texte', async () => {
    const refus = new ApiError('Document fails referentiel integrity checks', 422)
    refus.serverMessage = 'Document fails referentiel integrity checks'
    refus.errors = { '/competences/1/code': ['« A2 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'] }
    const api = docApi({ importReferentiel: vi.fn(async () => Promise.reject(refus)) })
    await ouvrir(MEMBRE, api)
    await remplirLesChamps()

    // un niveau sauté, un code en double, un pôle sans compétence
    const casse = MARKDOWN.replace('### A1.1', '#### A1.1').replace('## B1 —', '## A1 —').replace('# Pôle 2 — B · Second pôle', '# Pôle 2 — B · Vide\n\n# Pôle 3 — C · Second pôle')
    await saisir('Texte Markdown du référentiel', casse)
    expect(erreursDuMarkdown()).toEqual([
      'Ligne 12 : niveau sauté : « #### » ici, « ### » au plus',
      'Ligne 20 : le pôle 2 « B · Vide » n’a aucune compétence (« ## CODE — Nom »)',
      'Ligne 24 : code en double « A1 » (déjà ligne 8)',
    ])
    expect(within(formulaireMarkdown()).getByRole('button', { name: 'Importer le Markdown' }).disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull() // l'aperçu n'est pas une alerte

    // un motif saisi que le texte ne suit pas, puis le motif déduit repris
    await saisir('Texte Markdown du référentiel', MARKDOWN)
    await saisir('Motif du niveau 1', 'A[1-9]')
    expect(erreursDuMarkdown()).toEqual(['Ligne 22 : « B1 » ne suit pas le motif A[1-9] du niveau « capacité »'])
    await cliquer(within(formulaireMarkdown()).getByRole('button', { name: 'Reprendre le motif déduit' }))
    expect(within(formulaireMarkdown()).getByLabelText('Motif du niveau 1').value).toBe('[A-B][1-2]')
    expect(erreursDuMarkdown()).toEqual([])

    // le refus du serveur, par pointeur ; le texte reste, à corriger sur place
    await cliquer(within(formulaireMarkdown()).getByRole('button', { name: 'Importer le Markdown' }))
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Document fails referentiel integrity checks')
    expect(within(alerte).getByRole('listitem').textContent).toBe(
      '/competences/1/code : « A2 » ne suit pas le motif [A-E][1-4] du niveau « capacité »',
    )
    expect(within(formulaireMarkdown()).getByLabelText('Texte Markdown du référentiel').value).toBe(MARKDOWN)
    expect(within(formulaireMarkdown()).getByRole('button', { name: 'Importer le Markdown' }).disabled).toBe(false)
    expect(api.listDrafts).toHaveBeenCalledTimes(1)
  })

  it('UC-EPI-05-F21 — les modèles se téléchargent ; le modèle Markdown, collé, se lit sans erreur et s’importe', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const modeles = screen.getByRole('region', { name: 'Modèles de référentiel' })
    const markdown = within(modeles).getByRole('link', { name: 'en Markdown' })
    const json = within(modeles).getByRole('link', { name: 'en JSON' })
    expect([markdown.getAttribute('download'), json.getAttribute('download')]).toEqual([
      'modele-referentiel.md',
      'modele-referentiel.json',
    ])
    expect(texteDuLien(markdown)).toBe(MODELE_MARKDOWN)
    expect(texteDuLien(json)).toBe(MODELE_JSON)
    // le JSON commenté dans la page, champ par champ ; l'écueil des noms de pôle de RESPIRE
    expect(within(modeles).getByText('contentHash').nextSibling.textContent).toBe(
      'Facultatif à l’import : le serveur calcule l’empreinte des pôles et des compétences.',
    )
    expect(modeles.textContent).toContain('les jurés de ce pôle de RESPIRE')

    await saisir('Texte Markdown du référentiel', texteDuLien(markdown))
    await remplirLesChamps({ id: 'mon-referentiel', label: 'Mon référentiel' })
    expect(erreursDuMarkdown()).toEqual([])
    expect(within(formulaireMarkdown()).getByText('Aperçu : 2 pôles, 3 compétences, 4 éléments plus fins.')).toBeDefined()
    await cliquer(within(formulaireMarkdown()).getByRole('button', { name: 'Importer le Markdown' }))
    expect(api.importReferentiel).toHaveBeenCalledWith(JSON.parse(MODELE_JSON), 'capacité')
  })

  it('UC-EPI-05-F22 — tout référentiel publié, RESPIRE compris, s’exporte en Markdown ; un échec est dit', async () => {
    const api = docApi()
    await ouvrir(MEMBRE, api)
    const exporter = screen.getByRole('form', { name: 'Exporter un référentiel publié' })
    const choix = within(exporter).getByLabelText('Référentiel publié')
    expect(within(choix).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fictif lettré — fictif-lettre 1.0.0',
      'RESPIRE v7 — respire 7.0.0',
    ])
    await cliquer(within(exporter).getByRole('button', { name: 'Exporter en Markdown' }))
    expect(api.getPublishedVersion).toHaveBeenCalledWith('fictif-lettre', '1.0.0')
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, nom] = vi.mocked(downloadBlob).mock.calls[0]
    expect(nom).toBe('fictif-lettre-v1.0.0.md')
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await texteDu(blob)).toBe(referentielEnMarkdown(DOCUMENT))
    expect((await screen.findByRole('status')).textContent).toBe(
      '« fictif-lettre » 1.0.0 exporté en Markdown : fictif-lettre-v1.0.0.md.',
    )

    fireEvent.change(choix, { target: { value: 'respire@7.0.0' } })
    api.getPublishedVersion.mockRejectedValueOnce(Object.assign(new ApiError('Unknown published version', 404), {
      serverMessage: 'Unknown published version',
    }))
    await cliquer(within(exporter).getByRole('button', { name: 'Exporter en Markdown' }))
    expect(api.getPublishedVersion).toHaveBeenLastCalledWith('respire', '7.0.0')
    expect((await screen.findByRole('alert')).textContent).toBe('Unknown published version')
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })
})
