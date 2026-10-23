// UC-CPT-07 — Déclarer ses rôles RESPIRE : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
//
// L'application ENTIÈRE (<App/>), session ouverte, sur #/compte : la section
// « Mes rôles RESPIRE », la case du cercle, l'enregistrement, et surtout la
// propriété du sprint 8 — UNE DÉCLARATION NE CHANGE AUCUNE FAMILLE DU MENU, ni
// aucun de ses items, ni le mode d'affichage par défaut, ni une garde de vue —
// avec son contrôle positif (l'habilitation, elle, change le menu). Le réseau
// est le faux serveur du lot (support/cpt.js), dont le catalogue et la
// validation sont lus dans api/src/Auth/DeclaredRoles.php ; le rechargement
// est simulé par un nouveau montage. Aucun choix d'affichage n'est stocké :
// le mode suit le défaut des rôles, que seule l'habilitation fixe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { navGroups } from '../../../src/nav.js'
import { defaultMode } from '../../../src/lib/ui-mode.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'
import { phpDeclaredRoles } from '../support/declared-roles-php.js'

const MAYA = { id: 7, email: 'maya@example.org', password: 'correct horse battery', displayName: 'Maya' }
const { catalogue, eligible } = phpDeclaredRoles()
const labelOf = (id) => catalogue.find((entry) => entry.id === id).label

async function openAccount(api) {
  window.location.hash = '#/compte'
  render(<App lib={fakeLib} />)
  await screen.findByRole('group', { name: 'Les rôles que je me reconnais' })
  await waitFor(() => expect(menu().families).toContain('Mon compte'))
  return api
}

/** Le menu tel qu'il est rendu : familles, liens, interrupteur du mode. */
function menu() {
  const nav = document.querySelector('nav[aria-label="Navigation principale"]')
  return {
    families: [...nav.querySelectorAll('[role="group"]')].map((group) => group.getAttribute('aria-label')),
    hrefs: [...nav.querySelectorAll('a')].map((link) => `${link.textContent.trim()} ${link.getAttribute('href')}`),
    expert: nav.querySelector('[role="switch"]')?.getAttribute('aria-checked') ?? null,
  }
}

/** Le menu que navGroups calcule pour ces habilitations (mode par défaut des rôles). */
function menuFor(habilitations) {
  const expert = defaultMode(habilitations) === 'expert'
  return navGroups({ roles: habilitations, authenticated: true, expert }).map((family) => family.label)
}

const section = () => within(screen.getByRole('region', { name: 'Mes rôles RESPIRE' }))
const box = (id) => section().getByRole('checkbox', { name: labelOf(id) })
const circle = () => section().queryByRole('checkbox', { name: 'Membre du cercle des fondateurs' })

async function save() {
  await act(async () => {
    fireEvent.click(section().getByRole('button', { name: 'Enregistrer mes rôles' }))
  })
}

async function declareEverything() {
  for (const entry of catalogue) if (!box(entry.id).checked) fireEvent.click(box(entry.id))
  fireEvent.click(circle())
  await save()
  await section().findByText('Rôles RESPIRE enregistrés. Vos accès ne changent pas : seul l’administrateur habilite.')
}

/** Rechargement : nouveau montage, même faux serveur (même session). */
async function reload(api) {
  cleanup()
  resetApiClient()
  return openAccount(api)
}

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

describe('UC-CPT-07 — une déclaration ne change jamais le menu', () => {
  // Un cas par jeu d'habilitations (deux montages de <App/> chacun), et non les
  // six dans un seul test : ensemble, ils dépassaient les 5 s d'un test sur une
  // machine chargée (2 s au calme, plus de 5 s sous charge ; 5 échecs sur 20
  // passages parallèles).
  it.each([
    [[]],
    [['apprenant']],
    [['apprenant', 'employeur']],
    [['apprenant', 'cartographe']],
    [['etablissement']],
    [['admin', 'promptologue']],
  ])('UC-CPT-07-F10 — RG4, propriété (habilitations : %j) : déclarer les neuf rôles et la case ne change ni les familles du menu, ni ses liens, ni le mode d’affichage par défaut — à l’enregistrement comme après rechargement ; le menu reste celui des habilitations, et la session n’est pas relue', async (habilitations) => {
    const api = await openAccount(
      installFakeAccountApi({ users: [{ ...MAYA, roles: habilitations }], loggedInAs: MAYA.email }),
    )
    const before = menu()
    expect(before.families).toEqual(menuFor(habilitations))
    expect(before.expert).toBe(String(defaultMode(habilitations) === 'expert'))
    const sessionReads = api.callsTo('auth/me', 'GET').length

    await declareEverything()

    expect(api.users.get(MAYA.email).declared).toEqual({ roles: catalogue.map((e) => e.id), foundingCircle: true })
    expect(api.users.get(MAYA.email).roles).toEqual(habilitations)
    expect(menu()).toEqual(before)
    expect(api.callsTo('auth/me', 'GET')).toHaveLength(sessionReads)

    await reload(api)
    expect(section().getAllByRole('checkbox').every((b) => b.checked)).toBe(true)
    expect(menu()).toEqual(before)
  })

  it('UC-CPT-07-F11 — RG4, contrôle positif : la déclaration « cartographe » n’ouvre ni la famille « Encadrer et garantir » ni #/cartographe ; l’habilitation accordée par l’administrateur les ouvre à la session suivante et passe l’affichage en expert', async () => {
    const api = await openAccount(
      installFakeAccountApi({ users: [{ ...MAYA, roles: ['apprenant'] }], loggedInAs: MAYA.email }),
    )
    fireEvent.click(box('cartographe'))
    await save()
    await section().findByRole('status')
    expect(menu().families).not.toContain('Encadrer et garantir')
    expect(menu().expert).toBe('false')

    act(() => {
      window.location.hash = '#/cartographe'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByText('Cet espace de travail est réservé aux cartographes.')).toBeDefined()

    // L'administrateur habilite (UC-ADM-01) ; la session suivante relit les rôles.
    api.users.get(MAYA.email).roles.push('cartographe')
    act(() => {
      window.dispatchEvent(new Event('humanome:auth'))
    })
    await waitFor(() => expect(menu().families).toContain('Encadrer et garantir'))
    expect(menu().families).toEqual(menuFor(['apprenant', 'cartographe']))
    expect(menu().expert).toBe('true')
    expect(api.users.get(MAYA.email).declared.roles).toEqual(['cartographe'])
  })
})

describe('UC-CPT-07 — la section « Mes rôles RESPIRE » du profil', () => {
  it('UC-CPT-07-F12 — nominal : la section liste le catalogue avec la mention « une déclaration ne donne pas d’accès » ; promptagogue et la case cochés → PUT entier avec le jeton CSRF, confirmation ; relue au rechargement ; les habilitations du profil ne bougent pas', async () => {
    const api = await openAccount(
      installFakeAccountApi({ users: [{ ...MAYA, roles: ['apprenant'] }], loggedInAs: MAYA.email }),
    )
    expect(section().getByText('Une déclaration ne donne pas d’accès ; l’administrateur habilite.')).toBeDefined()
    expect(section().getAllByRole('checkbox').map((b) => b.labels[0].textContent)).toEqual(catalogue.map((e) => e.label))
    const profile = within(screen.getByRole('region', { name: 'Profil' }))
    expect(profile.getByText('Habilitations').closest('.account-row').querySelector('dd').textContent).toBe('Apprenant')

    fireEvent.click(box('promptagogue'))
    fireEvent.click(box('architecte'))
    fireEvent.click(circle())
    await save()

    expect(
      await section().findByText('Rôles RESPIRE enregistrés. Vos accès ne changent pas : seul l’administrateur habilite.'),
    ).toBeDefined()
    const [put] = api.callsTo('auth/me/declared-roles', 'PUT')
    expect(put.body).toEqual({ roles: ['promptagogue', 'architecte'], foundingCircle: true })
    expect(put.headers['X-CSRF-Token']).toBe(api.session.csrf)
    expect(profile.getByText('Habilitations').closest('.account-row').querySelector('dd').textContent).toBe('Apprenant')

    await reload(api)
    const checked = section().getAllByRole('checkbox').filter((b) => b.checked).map((b) => b.labels[0].textContent)
    expect(checked).toEqual(['Promptagogue', 'Architecte', 'Membre du cercle des fondateurs'])

    // A2 : tout décocher efface la déclaration (la case part avec le rôle qui la porte).
    fireEvent.click(box('promptagogue'))
    expect(circle()).toBeNull()
    fireEvent.click(box('architecte'))
    await save()
    await section().findByRole('status')
    expect(api.users.get(MAYA.email).declared).toEqual({ roles: [], foundingCircle: false })
  })

  it('UC-CPT-07-F13 — E1 : la case du cercle n’est proposée qu’avec un rôle éligible et disparaît avec le dernier ; le serveur ne la reçoit jamais seule ; un refus 422 affiche le message du champ, la déclaration du serveur reste', async () => {
    const api = await openAccount(
      installFakeAccountApi({
        users: [{ ...MAYA, roles: ['apprenant'], declared: { roles: ['epistemiarque'], foundingCircle: true } }],
        loggedInAs: MAYA.email,
      }),
    )
    expect(circle().checked).toBe(true)
    for (const id of catalogue.map((e) => e.id).filter((id) => !eligible.includes(id))) {
      fireEvent.click(box(id))
    }
    fireEvent.click(box('epistemiarque'))
    expect(circle()).toBeNull()
    await save()
    await section().findByRole('status')
    const [put] = api.callsTo('auth/me/declared-roles', 'PUT')
    expect(put.body.foundingCircle).toBe(false)
    expect(api.users.get(MAYA.email).declared.foundingCircle).toBe(false)

    // Le serveur refuse (ici forcé) : le message de son champ, rien d'écrit.
    const stored = structuredClone(api.users.get(MAYA.email).declared)
    api.failNext(
      'PUT auth/me/declared-roles',
      jsonResponse(422, {
        error: 'Validation échouée',
        fields: { foundingCircle: 'Le cercle des fondateurs est réservé aux promptagogues, épistémiarques et maîtres du grimoire : déclarez l’un de ces rôles' },
      }),
    )
    fireEvent.click(box('maitre-du-grimoire'))
    fireEvent.click(circle())
    await save()
    expect((await section().findByRole('alert')).textContent).toBe(
      'Le cercle des fondateurs est réservé aux promptagogues, épistémiarques et maîtres du grimoire : déclarez l’un de ces rôles',
    )
    expect(api.users.get(MAYA.email).declared).toEqual(stored)
    expect(circle().checked).toBe(true)
  })

  it('UC-CPT-07-F14 — E3, E4 : session disparue côté serveur → le PUT reçoit 403, l’alerte dit de se reconnecter, rien d’écrit ; déclaration illisible (500) → message discret, sans alerte, le reste du profil reste utilisable', async () => {
    const api = await openAccount(
      installFakeAccountApi({ users: [{ ...MAYA, roles: ['apprenant'] }], loggedInAs: MAYA.email }),
    )
    api.expireSession()
    fireEvent.click(box('noesiologue'))
    await save()
    expect((await section().findByRole('alert')).textContent).toBe(
      'Votre session a expiré : reconnectez-vous, puis enregistrez de nouveau vos rôles.',
    )
    expect(api.users.get(MAYA.email).declared).toEqual({ roles: [], foundingCircle: false })

    cleanup()
    vi.unstubAllGlobals()
    resetApiClient()
    const second = installFakeAccountApi({ users: [{ ...MAYA, roles: ['apprenant'] }], loggedInAs: MAYA.email })
    second.failNext('GET auth/me/declared-roles', jsonResponse(500, { error: 'Erreur interne' }))
    window.location.hash = '#/compte'
    render(<App lib={fakeLib} />)
    const failed = within(await screen.findByRole('region', { name: 'Mes rôles RESPIRE' }))
    expect(
      await failed.findByText('Vos rôles RESPIRE ne peuvent pas être chargés pour le moment. Réessayez plus tard.'),
    ).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(section().queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('region', { name: 'Profil' })).toBeDefined()
    expect(await screen.findByText('Aucune clé gardée sur le serveur.')).toBeDefined()
  })
})
