import { describe, expect, it } from 'vitest'
import { FAMILIES, isCurrentItem, navGroups } from './nav.js'

describe('navGroups (sept familles d’intention)', () => {
  it('un visiteur anonyme voit « Découvrir » et « Compte » (Se connecter)', () => {
    const groups = navGroups({ roles: [] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'compte'])
    expect(groups[0].items.map((i) => i.href)).toEqual([
      '#/',
      '#/cartographie',
      '#/essayer',
      '#/referentiel',
      '#/guides',
    ])
    expect(groups[1].items.map((i) => i.label)).toEqual(['Se connecter', 'Confidentialité'])
  })

  it('un apprenant gagne « Ma cartographie », avec l’échelle de valeur badgée', () => {
    const groups = navGroups({ roles: ['apprenant'] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'cartographie', 'compte'])
    const carto = groups[1]
    expect(carto.label).toBe('Ma cartographie')
    expect(carto.items.map((i) => i.label)).toEqual([
      'Tableau de bord',
      'Mon portfolio',
      'Cartographier mes écrits',
      'Cartographie ouverte',
      'Analyse approfondie',
      'Mes profils Twin9',
      'Partager ma cartographie',
    ])
    // Échelle de valeur lisible depuis les libellés (friction n°1).
    const badges = Object.fromEntries(carto.items.filter((i) => i.badge).map((i) => [i.label, i.badge]))
    expect(badges).toEqual({
      'Cartographier mes écrits': 'standard',
      'Cartographie ouverte': 'gratuit',
      'Analyse approfondie': 'premium',
    })
  })

  it('chaque rôle cumulé ajoute SA famille, dans un ordre stable', () => {
    const groups = navGroups({ roles: ['apprenant', 'cartographe', 'admin'] })
    expect(groups.map((g) => g.id)).toEqual([
      'decouvrir',
      'cartographie',
      'encadrer',
      'administrer',
      'compte',
    ])
    const encadrer = groups.find((g) => g.id === 'encadrer')
    expect(encadrer.items[0]).toMatchObject({ href: '#/cartographe', label: 'Ma file de relecture' })
    const admin = groups.find((g) => g.id === 'administrer')
    expect(admin.items).toHaveLength(6)
    // Le monitoring a son entrée, la première, comme dans l'administration.
    expect(admin.items[0]).toMatchObject({ href: '#/admin/monitoring', label: 'Monitoring' })
  })

  it('« Faire évoluer » filtre ses items par rôle (promptologue vs épistémiarque)', () => {
    const promptologue = navGroups({ roles: ['apprenant', 'promptologue'] })
    const evoluer = promptologue.find((g) => g.id === 'evoluer')
    expect(evoluer.items.map((i) => i.label)).toEqual(['Atelier de prompts'])

    const both = navGroups({ roles: ['apprenant', 'promptologue', 'epistemiarque'] })
    expect(both.find((g) => g.id === 'evoluer').items.map((i) => i.label)).toEqual([
      'Atelier de prompts',
      'Édition du référentiel',
    ])

    // L'épistémiarque seul a désormais un domicile (friction découverte).
    const epistemiarque = navGroups({ roles: ['apprenant', 'epistemiarque'] })
    expect(epistemiarque.find((g) => g.id === 'evoluer').items.map((i) => i.label)).toEqual([
      'Édition du référentiel',
    ])
  })

  it('« Atelier Twin9 » n’apparaît qu’avec les DEUX rôles admin ∧ promptologue (AD-D2)', () => {
    // Promptologue seul : pas d'atelier Twin9 (manque admin).
    const promptologueSeul = navGroups({ roles: ['promptologue'] })
    expect(promptologueSeul.find((g) => g.id === 'evoluer').items.map((i) => i.label)).toEqual([
      'Atelier de prompts',
    ])
    // Admin seul : pas de famille « Faire évoluer » du tout (ni promptologue ni épistémiarque).
    const adminSeul = navGroups({ roles: ['admin'] })
    expect(adminSeul.find((g) => g.id === 'evoluer')).toBeUndefined()
    // Admin ∧ promptologue : l'atelier Twin9 apparaît.
    const adminPromptologue = navGroups({ roles: ['admin', 'promptologue'] })
    const items = adminPromptologue.find((g) => g.id === 'evoluer').items.map((i) => i.label)
    expect(items).toContain('Atelier Twin9')
    expect(items).toContain('Atelier de prompts')
  })

  it('connecté, la famille compte expose profil, crédit et confidentialité', () => {
    const groups = navGroups({ roles: ['apprenant'] })
    const compte = groups.find((g) => g.id === 'compte')
    expect(compte.label).toBe('Mon compte')
    expect(compte.items.map((i) => i.href)).toEqual([
      '#/compte',
      '#/compte/credit',
      '#/confidentialite',
    ])
  })

  it('un rôle inconnu n’ajoute rien', () => {
    const groups = navGroups({ roles: ['inconnu'] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'compte'])
  })
})

describe('navGroups — mode simple / expert (lib/ui-mode.js)', () => {
  const labels = (groups, id) => groups.find((g) => g.id === id).items.map((i) => i.label)

  it('mode simple : « Cartographie ouverte » (Twin6) et « Mes profils Twin9 » ne sont pas listés, et eux seuls', () => {
    const expert = navGroups({ roles: ['apprenant'], expert: true })
    const simple = navGroups({ roles: ['apprenant'], expert: false })
    expect(labels(simple, 'cartographie')).toEqual([
      'Tableau de bord',
      'Mon portfolio',
      'Cartographier mes écrits',
      'Analyse approfondie',
      'Partager ma cartographie',
    ])
    const keys = (groups) => groups.flatMap((g) => g.items.map((i) => `${g.id} › ${i.label}`))
    const removed = keys(expert).filter((k) => !keys(simple).includes(k))
    expect(removed).toEqual(['cartographie › Cartographie ouverte', 'cartographie › Mes profils Twin9'])
    expect(keys(simple).filter((k) => !keys(expert).includes(k))).toEqual([])
    // L'échelle de valeur du mode simple : un lien par palier, standard puis premium (Essayer, gratuit, est dans Découvrir).
    expect(simple.flatMap((g) => g.items).filter((i) => i.badge).map((i) => [i.label, i.badge])).toEqual([
      ['Essayer', 'gratuit'],
      ['Cartographier mes écrits', 'standard'],
      ['Analyse approfondie', 'premium'],
    ])
  })

  it('mode expert (défaut) : « Mes profils Twin9 » mène à #/configuration, après « Analyse approfondie »', () => {
    const carto = navGroups({ roles: ['apprenant'] }).find((g) => g.id === 'cartographie')
    const index = carto.items.findIndex((i) => i.label === 'Mes profils Twin9')
    expect(carto.items[index]).toMatchObject({ href: '#/configuration', route: 'configuration', expert: true })
    expect(carto.items[index - 1].label).toBe('Analyse approfondie')
    expect(navGroups({ roles: ['apprenant'], expert: true })).toEqual(navGroups({ roles: ['apprenant'] }))
  })

  it('propriété : pour chaque rôle et chaque cumul, les familles sont les mêmes dans les deux modes (le mode ne retire jamais une famille de rôle)', () => {
    const roles = ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'employeur', 'etablissement', 'admin']
    const sessions = [[], ...roles.map((r) => [r]), ...roles.map((r) => ['apprenant', r]), roles]
    for (const session of sessions) {
      for (const authenticated of [true, false]) {
        const ids = (expert) => navGroups({ roles: session, authenticated, expert }).map((g) => g.id)
        expect(ids(false), session.join('+') || 'visiteur').toEqual(ids(true))
      }
    }
    // Seuls des items de « Ma cartographie » portent l'attribut expert.
    const expertItems = FAMILIES.flatMap((f) => f.items.filter((i) => i.expert).map((i) => [f.id, i.label]))
    expect(expertItems).toEqual([
      ['cartographie', 'Cartographie ouverte'],
      ['cartographie', 'Mes profils Twin9'],
    ])
  })
})

describe('isCurrentItem', () => {
  const dashboard = { href: '#/espace', label: 'Tableau de bord', route: 'espace' }
  const run = { href: '#/espace/nouveau-run', route: 'espace', section: 'nouveau-run' }
  const partage = { href: '#/espace', label: 'Partager ma cartographie' } // sans route

  it('un item sans section ne matche que la racine de sa route', () => {
    expect(isCurrentItem(dashboard, { name: 'espace', section: null })).toBe(true)
    expect(isCurrentItem(dashboard, { name: 'espace', section: 'nouveau-run' })).toBe(false)
  })

  it('un item avec section matche exactement sa sous-section', () => {
    expect(isCurrentItem(run, { name: 'espace', section: 'nouveau-run' })).toBe(true)
    expect(isCurrentItem(run, { name: 'espace', section: null })).toBe(false)
  })

  it('un alias sans route n’est jamais courant', () => {
    expect(isCurrentItem(partage, { name: 'espace', section: null })).toBe(false)
  })
})
