// Page #/configuration (T13) : construite depuis le schéma du profil Twin9 ;
// aucun réglage du schéma ne manque ; une valeur modifiée se distingue ;
// l'interrupteur bascule du mode essai au mode complet ; les droits de la
// matrice (docs/autorisations.md) se lisent dans ce que la page offre.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ConfigurationView from './ConfigurationView.jsx'
import { resetApiClient } from '../api/client.js'
import { UiModeContext } from '../lib/ui-mode.js'
import schema from '../../../schemas/twin9-profil.schema.json'
import v98 from '../../../api/config/twin9-profil-v98.json'
import essaiStigmergie from '../../../api/config/twin9-profil-stigmergie.json'

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

/** Les fournisseurs de l'instance (ProfilPolicy::choix) : Anthropic et Mistral AI disponibles, les autres non. */
const FOURNISSEURS = [
  { id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', disponible: true },
  { id: 'openai', libelle: 'OpenAI', rgpd: 'sous_conditions', disponible: false },
  { id: 'mistral', libelle: 'Mistral AI', rgpd: 'oui', disponible: true },
  { id: 'google', libelle: 'Google (Gemini)', rgpd: 'non', disponible: false },
  { id: 'xai', libelle: 'xAI (Grok)', rgpd: 'non', disponible: false },
  { id: 'openrouter', libelle: 'OpenRouter', rgpd: 'non', disponible: false },
]

/** La page ouverte sur un profil enregistré (id 7). */
async function ouvrirProfil(profil, extra = {}, routes = {}) {
  const ouverte = await ouvrir({
    'GET api/twin9/configuration': jsonResponse(
      200,
      configuration({ fournisseurs: FOURNISSEURS, profils: [{ id: 7, nom: 'Mixte', updated_at: '2026-10-22 10:00:00' }], ...extra }),
    ),
    'GET api/twin9/profils/7': jsonResponse(200, { id: 7, nom: 'Mixte', profil }),
    ...routes,
  })
  await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe('Mixte'))
  return ouverte
}

const visible = (element) => element.closest('.config-aide') === null
const options = (select) => [...select.options].map((o) => [o.value, o.textContent, o.disabled])

describe('ConfigurationView — un fournisseur par étage, étape et lecteur (ADR-012)', { timeout: 15000 }, () => {
  it('un réglage sans fournisseur hérite du sien, dit son étiquette RGPD sans le focus, et n’offre que les fournisseurs disponibles', async () => {
    const { vue } = await ouvrir({ 'GET api/twin9/configuration': jsonResponse(200, configuration({ fournisseurs: FOURNISSEURS })) })
    const greffier = vue.container.querySelector('#config-etapes-greffier-fournisseur')
    expect(options(greffier)).toEqual([
      ['', 'hérité : Anthropic', false],
      ['anthropic', 'Anthropic', false],
      ['openai', 'OpenAI (indisponible sur cette instance)', true],
      ['mistral', 'Mistral AI', false],
      ['google', 'Google (Gemini) (indisponible sur cette instance)', true],
      ['xai', 'xAI (Grok) (indisponible sur cette instance)', true],
      ['openrouter', 'OpenRouter (indisponible sur cette instance)', true],
    ])
    expect(vue.container.querySelector('#config-etapes-second_ressort-fournisseur').options[0].textContent).toBe(
      'hérité : celui de chaque étape',
    )
    expect(vue.container.querySelector('#config-college-0-fournisseur').options[0].textContent).toBe('hérité : Anthropic')
    const pastille = champ(vue, 'etapes/greffier/fournisseur').querySelector('.twin9-rgpd')
    expect(pastille.textContent).toBe('RGPD : sous conditions')
    expect(visible(pastille)).toBe(true)

    fireEvent.change(greffier, { target: { value: 'mistral' } })
    expect(champ(vue, 'etapes/greffier/fournisseur').querySelector('.twin9-rgpd').textContent).toBe('RGPD : oui')
    // une étape qui change de fournisseur nomme son modèle : la page le dit, à côté, avant le serveur
    const avertissement = champ(vue, 'etapes/greffier/fournisseur').querySelector('.config-avertissement')
    expect(avertissement.textContent).toBe('Choisissez le modèle Mistral AI de ce réglage : il change de fournisseur.')
    expect(visible(avertissement)).toBe(true)
    fireEvent.change(vue.container.querySelector('#config-etapes-greffier-modele'), { target: { value: 'claude-haiku-5-5' } })
    expect(champ(vue, 'etapes/greffier/fournisseur').querySelector('.config-avertissement')).toBeNull()
    expect(champ(vue, 'etapes/greffier/modele').querySelector('.config-avertissement').textContent).toBe(
      '« claude-haiku-5-5 » n’est pas un identifiant de modèle Mistral AI.',
    )
    fireEvent.change(vue.container.querySelector('#config-etapes-greffier-modele'), { target: { value: 'modele-fictif' } })
    expect(champ(vue, 'etapes/greffier/modele').querySelector('.config-avertissement')).toBeNull()

    // le résumé du profil : ce que l'accord du lancement nommera
    const resume = vue.container.querySelector('[aria-label="Fournisseurs de ce profil"]')
    expect(resume.querySelector('p').textContent).toBe(
      'Ce profil envoie son texte à : Anthropic RGPD : sous conditions (par lots) · Mistral AI RGPD : oui (en direct).',
    )
  })

  it('un fournisseur que nomme le profil se voit, même indisponible : le profil s’enregistre, il ne se lance pas', async () => {
    const profil = structuredClone(v98)
    profil.etapes = { greffier: { fournisseur: 'google', modele: 'modele-fictif' } }
    const { vue } = await ouvrirProfil(profil)
    const greffier = vue.container.querySelector('#config-etapes-greffier-fournisseur')
    expect(greffier.value).toBe('google')
    expect(options(greffier)[4]).toEqual(['google', 'Google (Gemini) (indisponible sur cette instance)', false])
    expect(champ(vue, 'etapes/greffier/fournisseur').querySelector('.twin9-rgpd').textContent).toBe('RGPD : non')
    expect(champ(vue, 'etapes/greffier/fournisseur').querySelector('.config-avertissement').textContent).toBe(
      'Google (Gemini) n’est pas disponible sur cette instance : le profil s’enregistre, il ne se lance pas.',
    )
    expect(vue.container.querySelector('[aria-label="Fournisseurs de ce profil"]').textContent).toContain(
      'Google (Gemini) RGPD : non (en direct, indisponible sur cette instance)',
    )
  })

  it('un lecteur qui change de fournisseur perd la famille qui suivait l’ancien et un modèle qu’il n’admet pas ; l’enregistrement les omet', async () => {
    let envoye = null
    const profil = structuredClone(v98)
    profil.college[0] = { ...profil.college[0], modele: 'claude-haiku-5-5', effort: 'low', reflexion: 'adaptative' }
    const { vue } = await ouvrirProfil(profil, {}, {
      'PUT api/twin9/profils/7': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(200, { id: 7, nom: envoye.nom, profil: envoye.profil })
      },
    })
    fireEvent.change(vue.container.querySelector('#config-college-0-fournisseur'), { target: { value: 'mistral' } })
    const famille = vue.container.querySelector('#config-college-0-famille')
    expect([famille.value, famille.placeholder]).toEqual(['', 'par défaut : mistral'])
    expect(vue.container.querySelector('#config-college-0-modele').value).toBe('')
    expect(vue.container.querySelector('#config-college-0-effort').value).toBe('')
    // la réflexion d'Anthropic ne part pas chez un autre : la page le dit sans le focus
    const reflexion = champ(vue, 'college/0/reflexion').querySelector('.config-explication')
    expect(reflexion.textContent).toBe(
      'Chez Mistral AI, ce réglage d’Anthropic ne part pas : le raisonnement suit l’entrée de la grille de l’instance pour ce modèle.',
    )
    fireEvent.change(vue.container.querySelector('#config-college-0-modele'), { target: { value: 'modele-fictif' } })
    fireEvent.click(barre().getByRole('button', { name: 'Enregistrer' }))
    expect(await annonce('status')).toBe('Profil enregistré.')
    expect(envoye.profil.college).toEqual([
      { nom: 'haiku', poids: 1.0, passes: 3, reflexion: 'adaptative', fournisseur: 'mistral', modele: 'modele-fictif' },
    ])
  })

  it('un étage garde un modèle à choisir chez son nouveau fournisseur ; l’effort de l’étage qu’hériterait un appel ailleurs se signale', async () => {
    const { vue } = await ouvrir({ 'GET api/twin9/configuration': jsonResponse(200, configuration({ fournisseurs: FOURNISSEURS })) })
    fireEvent.change(vue.container.querySelector('#config-etages-rapide-effort'), { target: { value: 'low' } })
    fireEvent.change(vue.container.querySelector('#config-etapes-greffier-fournisseur'), { target: { value: 'mistral' } })
    fireEvent.change(vue.container.querySelector('#config-etapes-greffier-modele'), { target: { value: 'modele-fictif' } })
    expect(champ(vue, 'etages/rapide/effort').querySelector('.config-avertissement').textContent).toBe(
      'Des appels de cet étage partent chez Mistral AI : ils hériteraient de cet effort, que l’API refuse hors d’Anthropic. ' +
        'Retirez-le de l’étage, ou posez-le étape par étape.',
    )

    fireEvent.change(vue.container.querySelector('#config-etages-rapide-fournisseur'), { target: { value: 'mistral' } })
    expect(vue.container.querySelector('#config-etages-rapide-modele').value).toBe('')
    expect(vue.container.querySelector('#config-etages-rapide-effort').value).toBe('')
    expect(champ(vue, 'etages/rapide/modele').querySelector('.config-avertissement').textContent).toBe('Choisissez un modèle Mistral AI.')
    fireEvent.change(vue.container.querySelector('#config-etages-rapide-fournisseur'), { target: { value: '' } })
    expect(vue.container.querySelector('#config-etages-rapide-modele').value).toBe('claude-haiku-5-5')
  })

  it('explique la voie sans le focus ; sans appel Anthropic, elle est sans effet', async () => {
    const { vue } = await ouvrir()
    const explication = champ(vue, 'voie').querySelector('.config-explication')
    expect(visible(explication)).toBe(true)
    expect(explication.textContent).toContain('Par lots, le défaut : les appels Anthropic passent par son API Message Batches')
    expect(explication.textContent).toContain('Les appels aux autres fournisseurs partent toujours en direct')
    expect(vue.container.querySelector('#config-voie').disabled).toBe(false)
    cleanup()

    const profil = structuredClone(v98)
    for (const etage of ['lecteurs', 'rapide', 'profond']) profil.etages[etage] = { ...profil.etages[etage], fournisseur: 'mistral', modele: 'modele-fictif' }
    profil.college[0] = { nom: 'haiku', poids: 1.0, passes: 3 }
    const tiers = await ouvrirProfil(profil)
    expect(tiers.vue.container.querySelector('#config-voie').disabled).toBe(true)
    expect(champ(tiers.vue, 'voie').querySelector('.config-explication').textContent).toBe(
      'Sans effet : ce profil n’appelle pas Anthropic, tous ses appels partent en direct.',
    )
  })

  it('la clé personnelle ne sert que chez Anthropic : un profil qui appelle un autre fournisseur ne la propose pas, et le dit', async () => {
    const profil = structuredClone(v98)
    profil.etapes = { greffier: { fournisseur: 'mistral', modele: 'modele-fictif' } }
    profil.cle = 'personnelle'
    const { vue } = await ouvrirProfil(profil, { cle_perso_ouverte: true, cle_perso_enregistree: true })
    const cle = vue.container.querySelector('#config-cle')
    expect(within(cle).getByRole('option', { name: 'Ma clé personnelle' }).disabled).toBe(false) // celle que nomme le profil
    expect(champ(vue, 'cle').querySelector('.config-avertissement').textContent).toBe(
      'La clé personnelle ne sert que chez Anthropic : ce profil appelle aussi Mistral AI, il ne part qu’avec les clés de l’instance.',
    )
    fireEvent.change(cle, { target: { value: 'instance' } })
    expect(within(cle).getByRole('option', { name: 'Ma clé personnelle' }).disabled).toBe(true)
    expect(champ(vue, 'cle').querySelector('.config-avertissement')).toBeNull()
  })
})

/** Le profil prédéfini de l'essai de la stigmergie, comme GET twin9/configuration le sert. */
const PREDEFINIS = [
  {
    id: 'stigmergie',
    nom: 'Stigmergie (essai)',
    profil: essaiStigmergie,
    fournisseurs: [{ id: 'anthropic', libelle: 'Anthropic', rgpd: 'sous_conditions', voie: 'lots' }],
  },
]

/** La page dans un mode donné, comme le shell la rend (App.jsx). */
async function ouvrirEnMode(expert, routes = {}) {
  const fetchFn = routedFetch({
    'GET api/twin9/configuration': jsonResponse(200, configuration({ predefinis: PREDEFINIS })),
    ...routes,
  })
  const vue = render(
    <UiModeContext.Provider value={{ expert, setExpert() {} }}>
      <ConfigurationView deps={{ fetchFn }} />
    </UiModeContext.Provider>,
  )
  await waitFor(() => expect(vue.container.querySelector('[role="switch"]')).not.toBeNull())
  return { fetchFn, vue }
}

const valeursDuProfil = () => [...barre().getByLabelText('Profil').options].map((o) => o.value)

describe('ConfigurationView — la stigmergie du greffier (sprint 3)', { timeout: 15000 }, () => {
  it('en mode expert, une partie à elle, ses libellés, la valeur du moteur pour un réglage absent', async () => {
    const { vue } = await ouvrirEnMode(true)
    expect(champ(vue, 'stigmergie')).not.toBeNull()
    expect(champ(vue, 'stigmergie').querySelector('summary').textContent).toBe('Stigmergie du greffier (essai)')
    expect(champ(vue, 'stigmergie/enabled').querySelector('label').textContent).toBe('Activer la stigmergie')
    expect(champ(vue, 'scan_global/enabled').querySelector('label').textContent).toBe('Lancer l’Arpenteur')
    expect(vue.container.querySelector('#config-stigmergie-enabled').checked).toBe(false)
    expect(vue.container.querySelector('#config-stigmergie-evaporation').placeholder).toBe('0,3')
    expect(vue.container.querySelector('#config-stigmergie-evaporation').min).toBe('0.2')
    expect(vue.container.querySelector('#config-stigmergie-lignes').placeholder).toBe('5')
    expect(vue.container.querySelector('#config-stigmergie-lignes').max).toBe('10')
    expect(champ(vue, 'stigmergie').textContent).not.toMatch(/score/i)
    expect(valeursDuProfil()).toEqual(['', 'predefini:stigmergie'])
  })

  it('en mode simple, ni sa partie ni le profil prédéfini ; un profil qui l’active la montre', async () => {
    const allume = { ...v98, calques: { ...v98.calques, accumulation: false }, stigmergie: { enabled: true } }
    const { vue } = await ouvrirEnMode(false, {
      'GET api/twin9/configuration': jsonResponse(
        200,
        configuration({ predefinis: PREDEFINIS, profils: [{ id: 7, nom: 'Allumée', updated_at: '2026-10-22 10:00:00' }] }),
      ),
      'GET api/twin9/profils/7': jsonResponse(200, { id: 7, nom: 'Allumée', profil: allume }),
    })
    await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe('Allumée'))
    expect(valeursDuProfil()).toEqual(['', '7'])
    expect(champ(vue, 'stigmergie')).not.toBeNull()
    expect(vue.container.querySelector('#config-stigmergie-enabled').checked).toBe(true)

    fireEvent.change(barre().getByLabelText('Profil'), { target: { value: '' } })
    await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe(''))
    expect(champ(vue, 'stigmergie')).toBeNull()
    expect(champ(vue, 'scan_global')).not.toBeNull()
  })

  it('le profil prédéfini se copie dans un nouveau profil ; ce que le serveur refuserait se dit à côté', async () => {
    let envoye = null
    const { vue } = await ouvrirEnMode(true, {
      'POST api/twin9/profils': (init) => {
        envoye = JSON.parse(init.body)
        return jsonResponse(201, { id: 9, nom: envoye.nom, profil: envoye.profil })
      },
    })
    fireEvent.change(barre().getByLabelText('Profil'), { target: { value: 'predefini:stigmergie' } })
    await waitFor(() => expect(barre().getByLabelText('Nom du profil').value).toBe('Stigmergie (essai)'))
    expect(barre().getByLabelText('Profil').selectedOptions[0].textContent).toBe('Nouveau, depuis « Stigmergie (essai) »')
    expect(vue.container.querySelector('#config-stigmergie-enabled').checked).toBe(true)
    expect(within(champ(vue, 'stigmergie')).getByText(/· 5 modifiés/)).toBeTruthy()
    expect(within(champ(vue, 'stigmergie/evaporation')).getByTitle('Par défaut : 0,3, la valeur du moteur')).toBeTruthy()
    const enabled = champ(vue, 'stigmergie/enabled')
    expect(enabled.querySelector('.config-avertissement')).toBeNull()
    expect(enabled.querySelector('.config-explication').textContent).toMatch(/Chaque run relit les journées/)

    // les calques archivés de nouveau au consensus : le double compte que le serveur refuse
    fireEvent.click(vue.container.querySelector('#config-calques-accumulation'))
    expect(enabled.querySelector('.config-avertissement').textContent).toMatch(/Le profil serait refusé/)
    fireEvent.click(vue.container.querySelector('#config-calques-accumulation'))
    expect(enabled.querySelector('.config-avertissement')).toBeNull()
    fireEvent.click(vue.container.querySelector('#config-rescan'))
    expect(enabled.querySelector('.config-explication').textContent).toMatch(/reprise de la mémoire/)
    fireEvent.click(vue.container.querySelector('#config-rescan'))

    fireEvent.click(barre().getByRole('button', { name: 'Enregistrer' }))
    expect(await annonce('status')).toBe('Profil enregistré.')
    expect(envoye).toEqual({ nom: 'Stigmergie (essai)', profil: essaiStigmergie })
    expect(barre().getByLabelText('Profil').value).toBe('')
  })
})
