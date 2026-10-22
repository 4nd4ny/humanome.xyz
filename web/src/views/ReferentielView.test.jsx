import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReferentielView from './ReferentielView.jsx'
// Le document qu'écrit scripts/convertir-humanome.mjs depuis la fixture FICTIVE à la forme Humanome (S5, lot B)
import humanome from '../../../schemas/fixtures/referentiel-humanome-fictif.json'

afterEach(cleanup)

const fixture = {
  version: '1.0.0',
  label: 'Fixture v1',
  poles: [
    { num: 1, nom: 'TETE — Penser', couleur: '#2563eb' },
    { num: 2, nom: 'COEUR — Relier', couleur: '#10b981' },
  ],
  competences: [
    { code: '1.01', nom: 'Pensée Critique', pole: 1, description: 'Douter méthodiquement des sources.' },
    { code: '1.02', nom: 'Synthèse Intégrative', pole: 1 },
    { code: '2.01', nom: 'Communication Authentique', pole: 2 },
  ],
}

const load = async () => ({ doc: fixture, origin: 'published' })
// Aucun référentiel listé : pas de menu, et aucune lecture réelle de l'API.
const list = async () => []

async function renderView(props = {}) {
  render(<ReferentielView load={load} list={list} {...props} />)
  await screen.findByText('TETE — Penser')
}

describe('ReferentielView', () => {
  it('rend l’arbre pôles -> compétences avec les couleurs des pôles', async () => {
    await renderView()

    expect(screen.getByRole('heading', { name: 'Référentiel de compétences' })).toBeDefined()
    expect(screen.getByText(/Fixture v1 — version 1\.0\.0/)).toBeDefined()

    // Les deux pôles et leurs compétences.
    expect(screen.getByText('COEUR — Relier')).toBeDefined()
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.getByText('Communication Authentique')).toBeDefined()

    // La définition (RESPIRE v7.1) est affichée quand elle est présente.
    expect(screen.getByText('Douter méthodiquement des sources.')).toBeDefined()

    // Couleur du pôle portée par la variable CSS de la section.
    const sections = document.querySelectorAll('.ref-pole')
    expect(sections).toHaveLength(2)
    expect(sections[0].style.getPropertyValue('--pole-color')).toBe('#2563eb')
    expect(sections[1].style.getPropertyValue('--pole-color')).toBe('#10b981')

    // Bandeau Decidim sobre, en lien externe.
    expect(
      screen
        .getByRole('link', { name: /Participer sur participer\.harmonia\.education/ })
        .getAttribute('href'),
    ).toBe('https://participer.harmonia.education')
    expect(screen.getByText(/nourrit et critique le référentiel/)).toBeDefined()
  })

  it('filtre par la recherche, insensible aux accents, sur code et nom', async () => {
    await renderView()
    const input = screen.getByLabelText('Rechercher une compétence')

    // Par nom, sans accents ni majuscules.
    fireEvent.change(input, { target: { value: 'pensee critique' } })
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.queryByText('Communication Authentique')).toBe(null)
    expect(screen.queryByText('COEUR — Relier')).toBe(null) // pôle vide masqué
    expect(screen.getByRole('status').textContent).toContain('1 compétence sur 3')

    // Par code.
    fireEvent.change(input, { target: { value: '2.01' } })
    expect(screen.getByText('Communication Authentique')).toBeDefined()
    expect(screen.queryByText('Pensée Critique')).toBe(null)

    // Effacer la recherche restaure tout.
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('3 compétences')
  })

  it('filtre aussi par la DESCRIPTION (définitions v7.1.0), insensible aux accents', async () => {
    await renderView()
    const input = screen.getByLabelText('Rechercher une compétence')

    // « methodiquement » (sans accent) n'apparaît QUE dans la description de
    // 1.01 — ni dans son code ni dans son nom : le champ description participe
    // bien au filtre de la recherche publique.
    fireEvent.change(input, { target: { value: 'methodiquement' } })
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.queryByText('Synthèse Intégrative')).toBe(null)
    expect(screen.queryByText('Communication Authentique')).toBe(null)
    expect(screen.queryByText('COEUR — Relier')).toBe(null) // pôle vide masqué
    expect(screen.getByRole('status').textContent).toContain('1 compétence sur 3')
  })

  it('expose un permalien #/referentiel/<code> par compétence', async () => {
    await renderView()
    expect(screen.getByRole('link', { name: '1.02' }).getAttribute('href')).toBe(
      '#/referentiel/1.02',
    )
  })

  it('surligne la compétence permaliée (focusCode)', async () => {
    await renderView({ focusCode: '1.02' })

    const item = document.getElementById('competence-1.02')
    expect(item).not.toBe(null)
    expect(item.className).toContain('ref-competence-focus')
    expect(screen.getByRole('link', { name: '1.02' }).getAttribute('aria-current')).toBe('true')

    // Les autres lignes ne sont pas surlignées.
    expect(document.getElementById('competence-1.01').className).not.toContain(
      'ref-competence-focus',
    )
  })

  it('signale proprement un code permalié inconnu', async () => {
    await renderView({ focusCode: '9.99' })
    expect(screen.getByRole('alert').textContent).toContain('9.99')
    expect(screen.getByRole('alert').textContent).toContain('introuvable')
  })

  it('UC-VIS-02-U13 — tout référentiel publié : RESPIRE par défaut, l’adresse en nomme un autre, le menu la remplace ; un identifiant introuvable est dit', async () => {
    const respire = { ...fixture, id: 'respire', label: 'RESPIRE v7.1.0', version: '7.1.0', source: 'Interne.' }
    const docs = { respire, [humanome.id]: humanome }
    const loader = vi.fn(async ({ id }) => {
      if (!docs[id]) throw new Error(`Le référentiel « ${id} » n'a pas pu être chargé`)
      return { doc: docs[id], origin: 'published' }
    })
    const lister = async () => [
      { id: 'respire', label: 'RESPIRE v7.1.0', source: null, versions: [{ semver: '7.1.0', label: 'RESPIRE v7.1.0' }] },
      { id: humanome.id, label: humanome.label, source: humanome.source, versions: [{ semver: humanome.version, label: humanome.label }] },
    ]
    const replaceHash = vi.fn()

    // Sans identifiant : RESPIRE, par son identifiant (l'API d'abord, data/referentiel.js) ; sa provenance n'est pas dite.
    const { rerender } = render(<ReferentielView load={loader} list={lister} replaceHash={replaceHash} />)
    const menu = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect(loader.mock.calls).toEqual([[{ id: 'respire' }]])
    expect(menu.value).toBe('respire@7.1.0')
    expect(document.querySelector('.ref-source')).toBeNull()
    expect(screen.getByRole('link', { name: '1.01' }).getAttribute('href')).toBe('#/referentiel/1.01')

    // Le menu remplace l'adresse, sans le code d'une compétence ; RESPIRE choisi de nouveau ne la change pas.
    fireEvent.change(menu, { target: { value: `${humanome.id}@${humanome.version}` } })
    expect(replaceHash.mock.calls).toEqual([['#/referentiel?id=fictif-humanome']])
    fireEvent.change(menu, { target: { value: 'respire@7.1.0' } })
    expect(replaceHash).toHaveBeenCalledTimes(1)

    // L'adresse nomme l'autre : il se charge par son identifiant ; sa provenance (licence) est dite une fois, pas sous le menu.
    rerender(<ReferentielView load={loader} list={lister} replaceHash={replaceHash} referentielId={humanome.id} focusCode="A2" />)
    await screen.findByText('A · Observer le fictif')
    expect(loader).toHaveBeenLastCalledWith({ id: 'fictif-humanome' })
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe(`${humanome.id}@${humanome.version}`)
    expect(document.querySelector('.ref-source').textContent).toBe(`Provenance : ${humanome.source}`)
    expect(screen.queryByTestId('referentiel-source')).toBeNull()
    expect(screen.getByRole('link', { name: 'A2' }).getAttribute('href')).toBe('#/referentiel/A2?id=fictif-humanome')
    expect(screen.getByRole('link', { name: 'A2' }).getAttribute('aria-current')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    // Le choix de RESPIRE ramène à l'adresse sans identifiant.
    fireEvent.change(screen.getByRole('combobox', { name: 'Référentiel' }), { target: { value: 'respire@7.1.0' } })
    expect(replaceHash).toHaveBeenLastCalledWith('#/referentiel')

    // Un identifiant introuvable : dit, et RESPIRE à sa place (ses permaliens sans identifiant) ; pas d'alerte sur le code.
    rerender(<ReferentielView load={loader} list={lister} replaceHash={replaceHash} referentielId="inconnu" focusCode="A2" />)
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Le référentiel «\sinconnu\s» n’a pas pu être chargé : RESPIRE s’affiche à sa\s+place\.$/,
    )
    expect(screen.getByText(/RESPIRE v7\.1\.0 — version 7\.1\.0/)).toBeDefined()
    expect(screen.getByRole('link', { name: '1.01' }).getAttribute('href')).toBe('#/referentiel/1.01')
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('respire@7.1.0')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('UC-VIS-02-U13 — un chargement plus lent, d’un choix déjà quitté, n’écrase pas le référentiel demandé', async () => {
    let lent
    const loader = vi.fn(({ id }) =>
      id === 'lent'
        ? new Promise((resolve) => (lent = () => resolve({ doc: { ...fixture, id: 'lent', label: 'Lent' }, origin: 'published' })))
        : Promise.resolve({ doc: { ...fixture, id, label: id === 'respire' ? 'RESPIRE' : 'Rapide' }, origin: 'published' }),
    )
    const { rerender } = render(<ReferentielView load={loader} list={list} referentielId="lent" />)
    rerender(<ReferentielView load={loader} list={list} referentielId="rapide" />)
    await screen.findByText(/Rapide — version/)
    await act(async () => lent())
    expect(screen.getByText(/Rapide — version/)).toBeDefined()
    expect(screen.queryByText(/Lent — version/)).toBeNull()
    // Le suivant se charge : l'ancien reste affiché, la page est dite occupée, sans alerte.
    let suite
    const attente = vi.fn(() => new Promise((resolve) => (suite = resolve)))
    rerender(<ReferentielView load={attente} list={list} referentielId="autre" focusCode="X9" />)
    await waitFor(() => expect(attente).toHaveBeenCalledWith({ id: 'autre' }))
    expect(document.querySelector('.referentiel').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => suite({ doc: { ...fixture, id: 'autre', label: 'Autre' }, origin: 'published' }))
    expect(screen.getByText(/Autre — version/)).toBeDefined()
    expect(document.querySelector('.referentiel').getAttribute('aria-busy')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('X9')
  })

  it('UC-VIS-02-U13 — une base sans RESPIRE publié : le menu choisit le premier référentiel, l’adresse est remplacée (pas d’entrée d’historique)', async () => {
    const replaceHash = vi.fn()
    const lister = async () => [{ id: humanome.id, label: humanome.label, source: null, versions: [{ semver: humanome.version, label: humanome.label }] }]
    render(<ReferentielView load={load} list={lister} replaceHash={replaceHash} />)
    await waitFor(() => expect(replaceHash).toHaveBeenCalledWith('#/referentiel?id=fictif-humanome'))
    expect(replaceHash).toHaveBeenCalledTimes(1)
  })

  it('UC-VIS-02-U16 — un référentiel qui ne se charge pas : le menu montre celui qui s’affiche (RESPIRE) ; le choisir de nouveau réessaie', async () => {
    const respire = { ...fixture, id: 'respire', label: 'RESPIRE v7.1.0', version: '7.1.0' }
    const autre = { ...fixture, id: 'autre', label: 'Autre', version: '1.0.0' }
    let echecs = 1 // une erreur 500 passagère de la route de version, l'export statique ne l'ayant pas
    const loader = vi.fn(async ({ id }) => {
      if (id === 'respire') return { doc: respire, origin: 'published' }
      if (echecs-- > 0) throw new Error('Le référentiel « autre » n’a pas pu être chargé')
      return { doc: autre, origin: 'published' }
    })
    const lister = async () => [
      { id: 'respire', label: 'RESPIRE v7.1.0', source: null, versions: [{ semver: '7.1.0', label: 'RESPIRE v7.1.0' }] },
      { id: 'autre', label: 'Autre', source: null, versions: [{ semver: '1.0.0', label: 'Autre' }] },
    ]
    const replaceHash = vi.fn()
    render(<ReferentielView load={loader} list={lister} replaceHash={replaceHash} referentielId="autre" />)
    expect((await screen.findByRole('alert')).textContent).toContain('« autre » n’a pas pu être chargé')
    expect(screen.getByText(/RESPIRE v7\.1\.0 — version 7\.1\.0/)).toBeDefined()
    // le menu montre le référentiel affiché, pas celui qui a échoué
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('respire@7.1.0'))

    // le choisir de nouveau le redemande (l'adresse, elle, le nomme déjà)
    fireEvent.change(screen.getByRole('combobox', { name: 'Référentiel' }), { target: { value: 'autre@1.0.0' } })
    await screen.findByText(/Autre — version 1\.0\.0/)
    expect(loader.mock.calls.filter(([{ id }]) => id === 'autre')).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Référentiel' }).value).toBe('autre@1.0.0')
    expect(replaceHash).not.toHaveBeenCalled()
  })

  it('UC-VIS-02-U16 — une base sans RESPIRE publié et un identifiant introuvable : le menu ne prétend pas montrer un autre référentiel que celui affiché', async () => {
    const replaceHash = vi.fn()
    const loader = vi.fn(async ({ id }) => {
      if (id === 'respire') return { doc: { ...fixture, id: 'respire', label: 'RESPIRE embarqué', version: '7.0.0' }, origin: 'bundled' }
      throw new Error(`Le référentiel « ${id} » n’a pas pu être chargé`)
    })
    const lister = async () => [{ id: humanome.id, label: humanome.label, source: null, versions: [{ semver: humanome.version, label: humanome.label }] }]
    render(<ReferentielView load={loader} list={lister} replaceHash={replaceHash} referentielId="inconnu" />)
    await screen.findByRole('alert')
    // RESPIRE, affiché, n'est pas au menu : comme sans identifiant, le premier référentiel publié devient le choix
    await waitFor(() => expect(replaceHash).toHaveBeenCalledWith('#/referentiel?id=fictif-humanome'))
    expect(replaceHash).toHaveBeenCalledTimes(1)
  })

  it('UC-VIS-02-U17 — au clavier, un choix du menu ne s’affiche qu’à sa validation (Entrée, la sortie du menu, un instant sans touche) ; au pointeur, aussitôt', async () => {
    const lister = async () => [
      { id: 'respire', label: 'RESPIRE v7.1.0', source: null, versions: [{ semver: '7.1.0', label: 'RESPIRE v7.1.0' }] },
      { id: humanome.id, label: humanome.label, source: null, versions: [{ semver: humanome.version, label: humanome.label }] },
      { id: 'autre', label: 'Autre', source: null, versions: [{ semver: '1.0.0', label: 'Autre' }] },
    ]
    const replaceHash = vi.fn()
    render(<ReferentielView load={load} list={lister} replaceHash={replaceHash} delaiClavier={50} />)
    const menu = await screen.findByRole('combobox', { name: 'Référentiel' })
    const auClavier = (touche, valeur) => {
      fireEvent.keyDown(menu, { key: touche })
      fireEvent.change(menu, { target: { value: valeur } }) // Chrome et Firefox sous Windows : un « change » par flèche
    }

    // les flèches parcourent les options : rien ne se charge, le menu montre l'option parcourue
    auClavier('ArrowDown', `${humanome.id}@${humanome.version}`)
    auClavier('ArrowDown', 'autre@1.0.0')
    expect(replaceHash).not.toHaveBeenCalled()
    expect(menu.value).toBe('autre@1.0.0')
    // Entrée valide l'option parcourue
    fireEvent.keyDown(menu, { key: 'Enter' })
    expect(replaceHash.mock.calls).toEqual([['#/referentiel?id=autre']])

    // quitter le menu valide aussi
    auClavier('ArrowUp', `${humanome.id}@${humanome.version}`)
    expect(replaceHash).toHaveBeenCalledTimes(1)
    fireEvent.focusOut(menu)
    expect(replaceHash).toHaveBeenLastCalledWith('#/referentiel?id=fictif-humanome')

    // un instant sans autre touche aussi (sous macOS, Entrée choisit dans la liste déroulante, hors de la page)
    auClavier('ArrowDown', 'autre@1.0.0')
    expect(replaceHash).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(replaceHash).toHaveBeenCalledTimes(3))
    expect(replaceHash).toHaveBeenLastCalledWith('#/referentiel?id=autre')

    // au pointeur, le choix s'affiche aussitôt
    fireEvent.mouseDown(menu)
    fireEvent.change(menu, { target: { value: `${humanome.id}@${humanome.version}` } })
    expect(replaceHash).toHaveBeenCalledTimes(4)
    expect(replaceHash).toHaveBeenLastCalledWith('#/referentiel?id=fictif-humanome')
  })
})
