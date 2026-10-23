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
import { contrast } from '../../../src/carto/ui/colors.js'
import { phpDeclaredRoles } from '../support/declared-roles-php.js'
import { THEMES, declOf, globalCssRules, resolveColor } from '../support/global-css.js'

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
/** Inactif sans quitter l'ordre de tabulation : aria-disabled, jamais l'attribut disabled. */
const inactive = (button) => {
  expect(button.disabled).toBe(false)
  return button.getAttribute('aria-disabled') === 'true'
}

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
    expect(inactive(saveButton())).toBe(true)

    fireEvent.click(box('architecte'))
    expect(inactive(saveButton())).toBe(false)
    fireEvent.click(box('architecte'))
    expect(inactive(saveButton())).toBe(true)
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
    expect(inactive(saveButton())).toBe(true)

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
    expect(inactive(saveButton())).toBe(false)

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

  it('UC-CPT-07-U23 — lisibilité : la définition de chaque rôle et la note du cercle (texte de 0,85rem, annoncé par aria-describedby) atteignent 4,5:1 sur la surface de leur carte, en clair, en sombre du système et en sombre choisi (WCAG 1.4.3)', async () => {
    await renderSection({ roles: ['epistemiarque'] })
    const definition = document.getElementById(box('cartographe').getAttribute('aria-describedby'))
    const note = document.getElementById(circle().getAttribute('aria-describedby'))
    expect(definition.closest('li').className).toBe('account-respire-item')
    expect(note.parentElement.className).toBe('account-respire-founding')
    for (const span of [definition, note]) expect(span.className).toBe('account-respire-definition')

    const rules = globalCssRules()
    const text = declOf(rules, '.account-respire-definition')
    expect(text['font-size']).toBe('0.85rem') // petit texte : le seuil est 4,5:1, pas 3:1
    for (const card of ['.account-respire-item', '.account-respire-founding']) {
      const surface = declOf(rules, card).background ?? declOf(rules, card)['background-color']
      for (const theme of THEMES) {
        const ratio = contrast(resolveColor(rules, text.color, theme), resolveColor(rules, surface, theme))
        expect(ratio, `${card}, ${theme.name} : ${text.color} sur ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('UC-CPT-07-U24 — au clavier : « Enregistrer mes rôles » garde le focus pendant et après l’enregistrement (aria-disabled, jamais disabled, qui le ferait tomber sur la page) ; pendant l’envoi il s’annonce « Enregistrement… » ; inactif, l’activer n’envoie rien', async () => {
    let finish
    const save = vi.fn(
      (declaration) =>
        new Promise((resolve) => {
          finish = () => resolve({ ...declaration, catalogue })
        }),
    )
    await renderSection({ save })

    // Inactif (rien n'a changé) : focalisable, et l'activer n'envoie rien.
    saveButton().focus()
    expect(document.activeElement).toBe(saveButton())
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(box('noesiologue'))
    saveButton().focus()
    await act(async () => {
      fireEvent.click(saveButton())
    })
    // Pendant l'envoi : un nom parlant, inactif, toujours focalisé ; un second envoi n'en part pas.
    const pending = section().getByRole('button', { name: 'Enregistrement…' })
    expect(inactive(pending)).toBe(true)
    expect(document.activeElement).toBe(pending)
    await act(async () => {
      fireEvent.click(pending)
    })
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
    expect(section().getByRole('status').textContent).toBe(
      'Rôles RESPIRE enregistrés. Vos accès ne changent pas : seul l’administrateur habilite.',
    )
    expect(inactive(saveButton())).toBe(true)
    expect(document.activeElement).toBe(saveButton())
  })
})
