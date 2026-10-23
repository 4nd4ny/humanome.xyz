// UC-CPT-07 — Déclarer ses rôles RESPIRE : tests UNITAIRES de la section du
// profil (front). Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
//
// DeclaredRolesSection (web/src/views/account/DeclaredRolesSection.jsx) rendue
// seule, ses deux appels remplacés par des doubles (couture `deps`) : le
// catalogue servi par l'API (celui de DeclaredRoles.php, lu par
// support/declared-roles-php.js), la mention « une déclaration ne donne pas
// d'accès », la case du cercle conditionnelle, l'enregistrement, les refus et
// les pannes de lecture.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ApiError, ApiUnavailableError } from '../../../src/api/client.js'
import DeclaredRolesSection from '../../../src/views/account/DeclaredRolesSection.jsx'
import { phpDeclaredRoles } from '../support/declared-roles-php.js'

afterEach(cleanup)

const { catalogue, eligible } = phpDeclaredRoles()
const NOT_ELIGIBLE = catalogue.map((entry) => entry.id).filter((id) => !eligible.includes(id))
const labelOf = (id) => catalogue.find((entry) => entry.id === id).label

function deps({ roles = [], foundingCircle = false, save } = {}) {
  return {
    fetchDeclaredRoles: vi.fn(async () => ({ roles, foundingCircle, catalogue })),
    saveDeclaredRoles:
      save ?? vi.fn(async (declaration) => ({ ...declaration, catalogue })),
  }
}

async function renderSection(options) {
  const d = deps(options)
  render(<DeclaredRolesSection deps={d} />)
  await screen.findByRole('group', { name: 'Les rôles que je me reconnais' })
  return d
}

const section = () => within(screen.getByRole('region', { name: 'Mes rôles RESPIRE' }))
const box = (id) => section().getByRole('checkbox', { name: labelOf(id) })
const circle = () => section().queryByRole('checkbox', { name: 'Membre du cercle des fondateurs' })
const saveButton = () => section().getByRole('button', { name: 'Enregistrer mes rôles' })

describe('UC-CPT-07 — la section « Mes rôles RESPIRE » du profil', () => {
  it('UC-CPT-07-U17 — rendu : la mention « une déclaration ne donne pas d’accès ; l’administrateur habilite », les neuf rôles du catalogue dans l’ordre, chacun décrit par sa définition, la déclaration courante cochée ; « Enregistrer mes rôles » inactif tant que rien ne change', async () => {
    await renderSection({ roles: ['cartographe', 'noesiologue'] })

    expect(section().getByRole('heading', { name: 'Mes rôles RESPIRE' })).toBeDefined()
    expect(section().getByText('Une déclaration ne donne pas d’accès ; l’administrateur habilite.')).toBeDefined()
    // Les déclarations qui ont une habilitation du même nom, nommées d'après le catalogue.
    expect(section().getByText(/Cartographe, promptologue et épistémiarque ont une habilitation du même nom/)).toBeDefined()

    const boxes = section().getAllByRole('checkbox')
    expect(boxes.map((b) => b.labels[0].textContent)).toEqual(catalogue.map((entry) => entry.label))
    for (const entry of catalogue) {
      const describedBy = box(entry.id).getAttribute('aria-describedby')
      expect(document.getElementById(describedBy).textContent).toBe(entry.definition)
    }
    expect(boxes.filter((b) => b.checked).map((b) => b.labels[0].textContent)).toEqual(['Cartographe', 'Noèsiologue'])
    expect(circle()).toBeNull()
    expect(saveButton().disabled).toBe(true)

    fireEvent.click(box('architecte'))
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(box('architecte'))
    expect(saveButton().disabled).toBe(true)
  })

  it('UC-CPT-07-U18 — case « Membre du cercle des fondateurs » : proposée avec chacun des trois rôles éligibles, jamais avec les six autres ; décocher le dernier rôle qui la porte la retire et la décoche', async () => {
    const d = await renderSection()
    expect(circle()).toBeNull()
    for (const id of NOT_ELIGIBLE) {
      fireEvent.click(box(id))
      expect(circle()).toBeNull()
      fireEvent.click(box(id))
    }
    for (const id of eligible) {
      fireEvent.click(box(id))
      expect(circle()).not.toBeNull()
      expect(circle().checked).toBe(false)
      fireEvent.click(box(id))
      expect(circle()).toBeNull()
    }

    // Deux rôles éligibles et la case : elle reste tant que l'un d'eux reste.
    fireEvent.click(box('promptagogue'))
    fireEvent.click(box('maitre-du-grimoire'))
    fireEvent.click(circle())
    fireEvent.click(box('promptagogue'))
    expect(circle().checked).toBe(true)
    fireEvent.click(box('maitre-du-grimoire'))
    expect(circle()).toBeNull()

    // Un rôle éligible recoché : la case revient décochée, rien n'est envoyé coché.
    fireEvent.click(box('epistemiarque'))
    expect(circle().checked).toBe(false)
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(d.saveDeclaredRoles).toHaveBeenCalledWith({ roles: ['epistemiarque'], foundingCircle: false })
  })

  it('UC-CPT-07-U19 — enregistrer : la déclaration entière, dans l’ordre du catalogue, avec la case ; message « vos accès ne changent pas » ; un refus 422 affiche les messages par champ et garde la saisie', async () => {
    const d = await renderSection({ roles: ['cartographe'] })
    fireEvent.click(box('maitre-du-grimoire'))
    fireEvent.click(box('eclaireur'))
    fireEvent.click(circle())
    await act(async () => {
      fireEvent.click(saveButton())
    })

    expect(d.saveDeclaredRoles).toHaveBeenCalledTimes(1)
    expect(d.saveDeclaredRoles).toHaveBeenCalledWith({
      roles: ['cartographe', 'eclaireur', 'maitre-du-grimoire'],
      foundingCircle: true,
    })
    expect(section().getByRole('status').textContent).toBe(
      'Rôles RESPIRE enregistrés. Vos accès ne changent pas : seul l’administrateur habilite.',
    )
    expect(saveButton().disabled).toBe(true)

    // Refus du serveur : le message de chaque champ, la saisie reste.
    const refusal = new ApiError('Validation échouée', 422)
    refusal.fields = { foundingCircle: 'Le cercle des fondateurs est réservé aux promptagogues.' }
    d.saveDeclaredRoles.mockRejectedValueOnce(refusal)
    fireEvent.click(box('eclaireur'))
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(section().getByRole('alert').textContent).toBe('Le cercle des fondateurs est réservé aux promptagogues.')
    expect(box('eclaireur').checked).toBe(false)
    expect(circle().checked).toBe(true)
    expect(saveButton().disabled).toBe(false)

    // Session perdue : le message du serveur, sans détail de champ.
    const csrf = new ApiError('Jeton CSRF absent ou invalide', 403)
    csrf.serverMessage = 'Jeton CSRF absent ou invalide'
    d.saveDeclaredRoles.mockRejectedValueOnce(csrf)
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(section().getByRole('alert').textContent).toBe('Jeton CSRF absent ou invalide')
  })

  it('UC-CPT-07-U20 — déclaration illisible (404 d’une API antérieure, 500, API injoignable, catalogue vide) : un message discret, sans alerte ni formulaire ; la mention reste', async () => {
    for (const failure of [
      () => Promise.reject(new ApiError('Ressource introuvable.', 404)),
      () => Promise.reject(new ApiError('Erreur interne', 500)),
      () => Promise.reject(new ApiUnavailableError()),
      async () => ({ roles: [], foundingCircle: false, catalogue: [] }),
    ]) {
      const save = vi.fn()
      render(<DeclaredRolesSection deps={{ fetchDeclaredRoles: vi.fn(failure), saveDeclaredRoles: save }} />)
      await waitFor(() =>
        expect(section().getByText('Vos rôles RESPIRE ne peuvent pas être chargés pour le moment. Réessayez plus tard.')).toBeDefined(),
      )
      expect(section().queryByRole('alert')).toBeNull()
      expect(section().queryByRole('checkbox')).toBeNull()
      expect(section().queryByRole('button')).toBeNull()
      expect(section().getByText('Une déclaration ne donne pas d’accès ; l’administrateur habilite.')).toBeDefined()
      expect(save).not.toHaveBeenCalled()
      cleanup()
    }
  })
})
