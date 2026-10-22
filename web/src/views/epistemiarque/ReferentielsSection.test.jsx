// La section « Autres référentiels » (S5, lot D) : le Markdown, son aperçu et
// l'export, dans le détail ; les parcours de UC-EPI-05 sont dans
// web/test/usecases/functional/uc-epi-05-importer-referentiel.test.jsx.
// Le client est simulé ; référentiels FICTIFS.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ReferentielsSection from './ReferentielsSection.jsx'

afterEach(() => cleanup())

function client(overrides = {}) {
  return {
    listDrafts: vi.fn(async () => []),
    listCatalogue: vi.fn(async () => [{ id: 'fictif', label: 'Fictif', versions: ['1.0.0'] }]),
    importReferentiel: vi.fn(async (document) => ({
      id: 1, referentielId: document.id, semver: document.version, content: document,
    })),
    getPublishedVersion: vi.fn(async () => ({ id: 'fictif', poles: [], competences: [] })),
    ...overrides,
  }
}

async function ouvrir(api = client()) {
  render(<ReferentielsSection api={api} canVote />)
  await screen.findByRole('region', { name: 'Référentiels publiés' })
  return api
}

const formulaire = () => screen.getByRole('form', { name: 'Écrire un référentiel en Markdown' })

async function saisir(libelle, valeur) {
  await act(async () => {
    fireEvent.change(within(formulaire()).getByLabelText(libelle), { target: { value: valeur } })
  })
}

async function remplir(texte) {
  await saisir('Texte Markdown du référentiel', texte)
  await saisir('Identifiant', 'fictif-md')
  await saisir('Libellé', 'Fictif Markdown')
  await saisir('Version', '1.0.0')
}

const DEUX_NIVEAUX = '# Pôle 1 — A · Pôle\n\n## A1 — Une\n\n### A1.1 — Fine\n\n## A2 — Deux\n\n### A2.1 — Fine aussi\n'

describe('ReferentielsSection — le Markdown', () => {
  it('l’aperçu suit chaque frappe ; un nom de niveau saisi nomme le choix du niveau et le document', async () => {
    const api = await ouvrir()
    expect(within(formulaire()).queryByText(/^Aperçu/)).toBeNull()
    await remplir('# Pôle 1 — A · Pôle\n\n## A1 — Une\n')
    expect(within(formulaire()).getByText('Aperçu : 1 pôles, 1 compétences.')).toBeDefined()
    expect(within(formulaire()).queryByLabelText('Niveau qui tient lieu de compétence')).toBeNull()

    await saisir('Texte Markdown du référentiel', DEUX_NIVEAUX)
    expect(within(formulaire()).getByText('Aperçu : 1 pôles, 2 compétences, 2 éléments plus fins.')).toBeDefined()
    expect(within(formulaire()).getByLabelText('Nom du niveau 2').value).toBe('élément')
    await saisir('Nom du niveau 2', 'grain')
    const niveau = within(formulaire()).getByLabelText('Niveau qui tient lieu de compétence')
    expect(within(niveau).getAllByRole('option').map((o) => o.value)).toEqual(['compétence', 'grain'])
    fireEvent.change(niveau, { target: { value: 'grain' } })
    await act(async () => {
      fireEvent.click(within(formulaire()).getByRole('button', { name: 'Importer le Markdown' }))
    })
    const [document, choisi] = api.importReferentiel.mock.calls[0]
    expect(document.niveaux).toEqual([
      { nom: 'compétence', motif: 'A[1-2]' },
      { nom: 'grain', motif: 'A[1-2]\\.1' },
    ])
    expect(choisi).toBe('grain')
  })

  it('l’aperçu n’est ni une alerte ni un statut ; un avertissement n’empêche pas l’import', async () => {
    await ouvrir()
    await remplir('# Pôle 1 — TÊTE et mains\n\n## T1 — Une\n')
    expect(
      within(within(formulaire()).getByRole('list', { name: 'Avertissements du Markdown' })).getByRole('listitem').textContent,
    ).toBe(
      'Ligne 1 : pôle 1 « TÊTE et mains » : son premier mot (TETE) est celui d’un pôle de RESPIRE ; l’analyse approfondie (Twin9) lui donnera les jurés de ce pôle de RESPIRE',
    )
    expect(within(formulaire()).getByRole('button', { name: 'Importer le Markdown' }).disabled).toBe(false)

    await saisir('Texte Markdown du référentiel', '## T1 — Sans pôle\n')
    expect(within(formulaire()).getByRole('list', { name: 'Erreurs du Markdown' })).toBeDefined()
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(screen.queryAllByRole('status')).toEqual([])
  })

  it('un fichier Markdown illisible est dit ; le texte en cours reste', async () => {
    await ouvrir()
    await saisir('Texte Markdown du référentiel', DEUX_NIVEAUX)
    const fichier = new File(['?'], 'cassé.md', { type: 'text/markdown' })
    fichier.text = async () => {
      throw new Error('illisible')
    }
    await act(async () => {
      fireEvent.change(within(formulaire()).getByLabelText('Fichier Markdown'), { target: { files: [fichier] } })
    })
    expect(screen.getByRole('alert').textContent).toBe('« cassé.md » ne se lit pas.')
    expect(within(formulaire()).getByLabelText('Texte Markdown du référentiel').value).toBe(DEUX_NIVEAUX)
  })
})

describe('ReferentielsSection — l’export', () => {
  const exporter = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exporter en Markdown' }))
    })
  }

  it('sans téléchargement possible, la page le dit ; un document trop profond pour le Markdown aussi', async () => {
    // jsdom n'a pas URL.createObjectURL : downloadBlob ne part pas
    const api = await ouvrir()
    await exporter()
    expect(api.getPublishedVersion).toHaveBeenCalledWith('fictif', '1.0.0')
    expect(screen.getByRole('alert').textContent).toBe('Ce navigateur ne permet pas le téléchargement.')

    let noeud = { code: 'A1', nom: 'A1', pole: 1 }
    const profond = { id: 'fictif', poles: [{ num: 1, nom: 'A', couleur: null }], competences: [noeud] }
    for (const code of ['A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5']) {
      noeud.elements = [{ code, nom: code }]
      ;[noeud] = noeud.elements
    }
    api.getPublishedVersion.mockResolvedValueOnce(profond)
    await exporter()
    expect(screen.getByRole('alert').textContent).toBe(
      'Ce référentiel a des éléments plus fins que « ###### » : le Markdown ne les écrit pas',
    )
  })

  it('sans référentiel publié, rien à exporter', async () => {
    render(<ReferentielsSection api={client({ listCatalogue: vi.fn(async () => []) })} canVote />)
    expect(await screen.findByText('Aucun autre référentiel pour l’instant.')).toBeDefined()
    expect(screen.queryByRole('form', { name: 'Exporter un référentiel publié' })).toBeNull()
  })
})
