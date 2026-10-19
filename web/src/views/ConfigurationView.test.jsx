// Page #/configuration (T13) : construite depuis le schéma du profil Twin9 ;
// aucun réglage du schéma ne manque ; une valeur modifiée se distingue ;
// l'interrupteur bascule du mode essai au mode complet ; les droits de la
// matrice (docs/autorisations.md) se lisent dans ce que la page offre.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ConfigurationView from './ConfigurationView.jsx'
import { resetApiClient } from '../api/client.js'
import schema from '../../../schemas/twin9-profil.schema.json'
import v98 from '../../../api/config/twin9-profil-v98.json'

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

const configuration = (extra = {}) => ({
  profils: [],
  defaut: v98,
  referentiels: [{ id: 'respire', versions: ['7.1.0', '7.0.0'] }],
  gabarits: ['v9.8'],
  cle_perso_ouverte: false,
  cle_perso_enregistree: false,
  ...extra,
})

/**
 * Chaque réglage du schéma, comme chemin : chaque feuille de ses objets, le
 * premier lecteur du collège, chaque table ; ni la version du schéma ni le
 * type du document, qui ne se règlent pas. Écrit ici, indépendamment de la
 * page : c'est elle qu'on vérifie.
 */
function reglages(node, chemin = []) {
  const n = node.$ref ? { ...schema.$defs[node.$ref.split('/').pop()], ...node } : node
  if ('const' in n) return []
  if (n.properties) return Object.entries(n.properties).flatMap(([cle, enfant]) => reglages(enfant, [...chemin, cle]))
  if (n.items) return reglages(n.items, [...chemin, 0])
  return [chemin.join('/')]
}

async function ouvrir(routes) {
  const fetchFn = routedFetch({ 'GET api/twin9/configuration': jsonResponse(200, configuration()), ...routes })
  const vue = render(<ConfigurationView deps={{ fetchFn }} />)
  await waitFor(() => expect(vue.container.querySelector('[role="switch"]')).not.toBeNull())
  expect(vue.container.querySelector('h2').textContent).toBe('Configuration de Twin9')
  return { fetchFn, vue }
}

// La page compte plus de 150 réglages : les requêtes par rôle ou par libellé
// sur tout le document y sont lentes sous jsdom ; elles visent la barre du profil.
const champ = (vue, chemin) => vue.container.querySelector(`[data-chemin="${chemin}"]`)
const barre = () => within(document.querySelector('.config-barre'))
const annonce = (role) => waitFor(() => expect(document.querySelector(`[role="${role}"]`)).not.toBeNull())
  .then(() => document.querySelector(`[role="${role}"]`).textContent)

describe('ConfigurationView (T13)', { timeout: 15000 }, () => {
  it('ne laisse aucun réglage du schéma hors de la page', async () => {
    const { vue } = await ouvrir()
    const attendus = reglages(schema)
    expect(attendus.length).toBeGreaterThan(150)
    const manquants = attendus.filter((chemin) => champ(vue, chemin) === null)
    expect(manquants).toEqual([])
  })

  it('montre une section par partie du profil, le mode à part', async () => {
    const { vue } = await ouvrir()
    const parties = Object.keys(schema.properties).filter((k) => !['schemaVersion', 'kind', 'mode'].includes(k))
    for (const partie of parties) {
      const element = champ(vue, partie)
      expect(element, partie).not.toBeNull()
    }
    expect(vue.container.querySelectorAll('details.config-partie').length).toBeGreaterThan(10)
  })

  it('distingue une valeur modifiée de la valeur par défaut, et rien d’autre', async () => {
    const { vue } = await ouvrir()
    expect(vue.container.querySelectorAll('.is-modified')).toHaveLength(0)

    fireEvent.change(vue.container.querySelector('#config-voie'), { target: { value: 'directe' } })
    expect(champ(vue, 'voie').classList.contains('is-modified')).toBe(true)
    expect(within(champ(vue, 'voie')).getByTitle('Par défaut : Par lots')).toBeTruthy()

    fireEvent.change(vue.container.querySelector('#config-troncatures-journee-span_caracteres'), { target: { value: '900' } })
    expect(within(champ(vue, 'troncatures')).getByText(/1 modifié/)).toBeTruthy()

    fireEvent.change(vue.container.querySelector('#config-voie'), { target: { value: 'lots' } })
    expect(champ(vue, 'voie').classList.contains('is-modified')).toBe(false)
  })

  it('bascule du mode complet au mode essai par l’interrupteur, et enregistre le profil', async () => {
    let envoye = null
    const { fetchFn, vue } = await ouvrir({
      'POST api/twin9/profils': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, { id: 7, nom: envoye.nom, profil: envoye.profil })
      },
    })
    const interrupteur = vue.container.querySelector('[role="switch"]')
    expect(interrupteur.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(interrupteur)
    expect(interrupteur.getAttribute('aria-checked')).toBe('true')

    fireEvent.change(barre().getByLabelText('Nom du profil'), { target: { value: 'Mon essai' } })
    fireEvent.click(barre().getByRole('button', { name: 'Enregistrer' }))
    expect(await annonce('status')).toBe('Profil enregistré.')

    expect(envoye.nom).toBe('Mon essai')
    expect(envoye.profil.mode).toBe('test')
    expect(envoye.profil.etapes).toEqual({})
    expect({ ...envoye.profil, mode: 'complet' }).toEqual(v98)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('dit ce que le serveur refuse', async () => {
    await ouvrir({
      'POST api/twin9/profils': jsonResponse(422, { error: 'Profil refusé — /referentiel/id : aucun référentiel publié' }),
    })
    fireEvent.change(barre().getByLabelText('Nom du profil'), { target: { value: 'X' } })
    fireEvent.click(barre().getByRole('button', { name: 'Enregistrer' }))
    expect(await annonce('alert')).toContain('/referentiel/id')
  })

  it('n’offre la clé personnelle que là où l’administrateur l’a ouverte', async () => {
    const { vue } = await ouvrir()
    const personnelle = within(vue.container.querySelector('#config-cle')).getByRole('option', { name: 'Ma clé personnelle' })
    expect(personnelle.disabled).toBe(true)
    cleanup()

    const ouverte = await ouvrir({
      'GET api/twin9/configuration': jsonResponse(200, configuration({ cle_perso_ouverte: true })),
    })
    const cle = ouverte.vue.container.querySelector('#config-cle')
    expect(within(cle).getByRole('option', { name: 'Ma clé personnelle' }).disabled).toBe(false)
    fireEvent.change(cle, { target: { value: 'personnelle' } })
    expect(champ(ouverte.vue, 'cle').textContent).toContain('Aucune clé Anthropic personnelle n’est enregistrée')
  })

  it('propose les référentiels publiés et leurs versions, la dernière par défaut', async () => {
    const referentiels = [
      { id: 'respire', versions: ['7.1.0', '7.0.0'] },
      { id: 'autre', versions: ['1.0.0'] },
    ]
    const { vue } = await ouvrir({ 'GET api/twin9/configuration': jsonResponse(200, configuration({ referentiels })) })
    const ids = within(vue.container.querySelector('#config-referentiel-id')).getAllByRole('option')
    expect(ids.map((o) => o.value)).toEqual(['respire', 'autre'])
    const version = () => vue.container.querySelector('#config-referentiel-version')
    expect(within(version()).getAllByRole('option').map((o) => o.textContent)).toEqual(['la dernière', '7.1.0', '7.0.0'])

    fireEvent.change(version(), { target: { value: '7.0.0' } })
    fireEvent.change(vue.container.querySelector('#config-referentiel-id'), { target: { value: 'autre' } })
    expect(within(version()).getAllByRole('option').map((o) => o.textContent)).toEqual(['la dernière', '1.0.0'])
    expect(version().value).toBe('')
  })

  it('propose aussi ses brouillons, pour ses runs d’essai (T15)', async () => {
    const referentiels = [
      { id: 'respire', versions: ['7.0.0'], brouillons: ['7.1.0'] },
      { id: 'fictif-neuf', versions: [], brouillons: ['1.0.0'] },
    ]
    const { vue } = await ouvrir({ 'GET api/twin9/configuration': jsonResponse(200, configuration({ referentiels })) })
    const version = () => vue.container.querySelector('#config-referentiel-version')
    expect(within(version()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'la dernière',
      '7.0.0',
      '7.1.0 (brouillon, run d’essai)',
    ])
    fireEvent.change(vue.container.querySelector('#config-referentiel-id'), { target: { value: 'fictif-neuf' } })
    expect(within(version()).getAllByRole('option').map((o) => [o.value, o.textContent])).toEqual([
      ['', 'la dernière'],
      ['1.0.0', '1.0.0 (brouillon, run d’essai)'],
    ])
  })

  it('copie un profil sous un autre nom, sans toucher l’original', async () => {
    let envoye = null
    await ouvrir({
      'GET api/twin9/configuration': jsonResponse(200, configuration({ profils: [{ id: 7, nom: 'Direct', updated_at: '2026-10-19 10:00:00' }] })),
      'GET api/twin9/profils/7': jsonResponse(200, { id: 7, nom: 'Direct', profil: { ...v98, voie: 'directe' } }),
      'POST api/twin9/profils': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, { id: 8, nom: envoye.nom, profil: envoye.profil })
      },
    })
    await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe('Direct'))

    fireEvent.click(barre().getByRole('button', { name: 'Copier' }))
    const profil = barre().getByLabelText('Profil')
    expect(profil.value).toBe('')
    expect(profil.selectedOptions[0].textContent).toBe('Nouveau, copie de « Direct »')
    expect(barre().getByLabelText('Nom du profil').value).toBe('Direct (copie)')

    fireEvent.click(barre().getByRole('button', { name: 'Enregistrer' }))
    expect(await annonce('status')).toBe('Profil enregistré.')
    expect(envoye).toEqual({ nom: 'Direct (copie)', profil: { ...v98, voie: 'directe' } })
  })

  it('ouvre ses profils, et ne supprime qu’après confirmation', async () => {
    let supprime = false
    const profil = { ...v98, voie: 'directe' }
    await ouvrir({
      'GET api/twin9/configuration': () =>
        jsonResponse(200, configuration({ profils: supprime ? [] : [{ id: 7, nom: 'Direct', updated_at: '2026-10-19 10:00:00' }] })),
      'GET api/twin9/profils/7': jsonResponse(200, { id: 7, nom: 'Direct', profil }),
      'DELETE api/twin9/profils/7': () => {
        supprime = true
        return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
      },
    })
    await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe('Direct'))
    expect(barre().getByLabelText('Profil').value).toBe('7')

    fireEvent.click(barre().getByRole('button', { name: 'Supprimer' }))
    expect(supprime).toBe(false)
    fireEvent.click(barre().getByRole('button', { name: 'Confirmer la suppression' }))
    expect(await annonce('status')).toBe('Profil supprimé.')
    expect(supprime).toBe(true)
    expect(barre().getByLabelText('Profil').value).toBe('')
  })

  it('invite un visiteur à se connecter', async () => {
    const fetchFn = routedFetch({ 'GET api/twin9/configuration': jsonResponse(401, { error: 'Authentification requise' }) })
    render(<ConfigurationView deps={{ fetchFn }} />)
    expect((await screen.findByRole('link', { name: 'Connectez-vous' })).getAttribute('href')).toBe('#/compte')
  })
})
