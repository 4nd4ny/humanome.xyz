// UC-VIS-06 — Choisir l'affichage simple ou expert : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-06-choisir-affichage-simple-expert.md
//
// Code sollicité appelé directement : règle de résolution du mode
// (lib/ui-mode.js), plan du site selon le mode (nav.js), point d'aide du mode
// simple (help/registry.js), aperçu d'un profil sur l'accueil (FamilyTiles),
// interface de cartographie (CartoApp : onglet « Comparaison », tuile
// « Réglages », Gestionnaire et son point) et espace Export (« Préparer une
// démo »). L'assistant standard et Twin6 sont couverts par leurs tests de
// composant (RunWizard.test.jsx, Twin6OuverteView.test.jsx) et par
// UC-APP-02-F29 et UC-APP-09-F32.
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MODE_KEY, WORK_ROLES, defaultMode, resolvedMode, storeMode, storedMode } from '../../../src/lib/ui-mode.js'
import { FAMILIES, navGroups } from '../../../src/nav.js'
import { SIMPLE_MODE_POINT, helpFor } from '../../../src/help/registry.js'
import FamilyTiles from '../../../src/components/FamilyTiles.jsx'
import CartoApp from '../../../src/carto/ui/CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/carto/core/store.js'
import { importFiles } from '../../../src/carto/core/import.js'
import { createDataset } from '../../../src/carto/core/model.js'
import { parseHash, subscribe } from '../../../src/router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../../../src/carto/test/fixtures.js'

const ALL_ROLES = ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'employeur', 'etablissement', 'admin']

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  window.location.hash = ''
  localStorage.clear()
})

describe('UC-VIS-06 — règle de résolution du mode', () => {
  it('UC-VIS-06-U01 — défaut selon les rôles (expert dès un rôle de travail, simple pour le visiteur, l’apprenant seul, l’employeur) ; le choix stocké prime ; valeur inconnue ou stockage illisible : le défaut (RG3)', () => {
    expect(MODE_KEY).toBe('humanome-mode')
    const expected = { apprenant: 'simple', employeur: 'simple', cartographe: 'expert', promptologue: 'expert', epistemiarque: 'expert', etablissement: 'expert', admin: 'expert' }
    for (const role of ALL_ROLES) expect(defaultMode([role]), role).toBe(expected[role])
    expect(defaultMode([])).toBe('simple')
    expect(WORK_ROLES.every((r) => defaultMode(['apprenant', 'employeur', r]) === 'expert')).toBe(true)
    expect(resolvedMode(['admin'], 'simple')).toBe('simple')
    expect(resolvedMode([], 'expert')).toBe('expert')
    expect(resolvedMode(['admin'], null)).toBe('expert')

    const blocked = {
      getItem() {
        throw new DOMException('refusé', 'SecurityError')
      },
      setItem() {
        throw new DOMException('refusé', 'SecurityError')
      },
    }
    expect(storedMode(blocked)).toBeNull()
    expect(storeMode('expert', blocked)).toBe(false)
    expect(storedMode({ getItem: () => 'avance' })).toBeNull()
  })
})

describe('UC-VIS-06 — plan du site et aide selon le mode', () => {
  it('UC-VIS-06-U02 — navGroups : le mode simple retire « Cartographie ouverte » et « Mes profils Twin9 », rien d’autre ; pour toute session, les mêmes familles dans les deux modes (RG1)', () => {
    const marked = FAMILIES.flatMap((f) => f.items.filter((i) => i.expert).map((i) => i.href))
    expect(marked).toEqual(['#/twin6-ouverte', '#/configuration'])
    const sessions = [[], ...ALL_ROLES.map((r) => [r]), ['apprenant', 'cartographe'], ALL_ROLES]
    for (const roles of sessions) {
      const expert = navGroups({ roles, expert: true })
      const simple = navGroups({ roles, expert: false })
      const name = roles.join('+') || 'visiteur'
      expect(simple.map((g) => g.id), name).toEqual(expert.map((g) => g.id))
      for (const [i, family] of simple.entries()) {
        expect(family.items.map((x) => x.href), `${name} › ${family.id}`).toEqual(
          expert[i].items.filter((x) => !marked.includes(x.href)).map((x) => x.href),
        )
      }
    }
    // Le défaut de navGroups est expert (un appelant qui ignore le mode liste tout).
    expect(navGroups({ roles: ['apprenant'] })).toEqual(navGroups({ roles: ['apprenant'], expert: true }))
  })

  it('UC-VIS-06-U03 — helpFor : en mode simple, la cartographie, l’espace apprenant et Twin6 disent où sont les réglages avancés ; pas en mode expert, pas ailleurs', () => {
    for (const route of ['cartographie', 'espace', 'twin6ouverte']) {
      expect(helpFor(route, { expert: false }).points.at(-1), route).toBe(SIMPLE_MODE_POINT)
      expect(helpFor(route, { expert: true }).points ?? [], route).not.toContain(SIMPLE_MODE_POINT)
      expect(helpFor(route).points ?? [], route).not.toContain(SIMPLE_MODE_POINT)
    }
    for (const route of ['home', 'twin9', 'portfolio', 'referentiel']) {
      expect(helpFor(route, { expert: false }).points ?? [], route).not.toContain(SIMPLE_MODE_POINT)
    }
  })

  it('UC-VIS-06-U04 — accueil : les tuiles suivent le mode de la session ; l’aperçu d’un profil montre ce que CE profil verrait, à son mode par défaut', () => {
    const labels = () => [...document.querySelectorAll('.route-label')].map((el) => el.textContent)
    render(<FamilyTiles roles={['apprenant']} authenticated expert={false} />)
    expect(labels()).toContain('Analyse approfondie')
    expect(labels()).not.toContain('Cartographie ouverte')
    expect(labels()).not.toContain('Mes profils Twin9')
    cleanup()

    render(<FamilyTiles roles={['apprenant']} authenticated expert />)
    expect(labels()).toContain('Cartographie ouverte')
    expect(labels()).toContain('Mes profils Twin9')
    cleanup()

    // Visiteur en mode expert qui explore les profils : l'apprenant est montré en simple, le cartographe en expert.
    render(<FamilyTiles roles={[]} expert />)
    fireEvent.click(screen.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    const bar = within(screen.getByRole('group', { name: 'Choisir un profil à explorer' }))
    fireEvent.click(bar.getByRole('button', { name: 'Apprenant' }))
    expect(labels()).not.toContain('Cartographie ouverte')
    fireEvent.click(bar.getByRole('button', { name: 'Cartographe' }))
    expect(labels()).toContain('Cartographie ouverte')
    expect(labels()).toContain('Mes profils Twin9')
  })
})

// --- Interface de cartographie --------------------------------------------------
const NOW = '2026-10-13T12:00:00.000Z'

/** Le jeu de Lou, plus un fichier illisible : une anomalie bloquante à traiter (point du Gestionnaire). */
async function louStore() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  files.push({ path: 'casse.json', text: '{' })
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

function Harness({ store, session }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} session={session} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

const spaces = () =>
  [...within(screen.getByRole('navigation', { name: 'Espaces de la cartographie' })).getAllByRole('link')].map((a) => a.firstChild.textContent)
const panelLabels = () =>
  [...document.querySelectorAll('.carto-panels-menu input[type="checkbox"]')].map((input) => input.closest('label').textContent.trim())

describe('UC-VIS-06 — interface de cartographie', () => {
  it('UC-VIS-06-U05 — mode simple : ni onglet « Comparaison » ni tuile « Réglages » dans « Panneaux » ; le Gestionnaire et son point d’anomalies restent (RG2) ; mode expert (défaut) : tout', async () => {
    window.location.hash = '#/cartographie'
    const store = await louStore()
    render(<Harness store={store} session={{ roles: [], expert: false }} />)
    await waitFor(() => expect(spaces()).toContain('Gestionnaire'))
    expect(spaces()).toEqual(['Cartographie', 'Gestionnaire', 'Tableau de bord', 'Dialogue', 'Export'])
    expect(screen.getByRole('link', { name: /Gestionnaire/ }).querySelector('.carto-dot')).not.toBeNull()
    expect(screen.getByLabelText('1 anomalies à traiter')).toBeDefined()
    expect(panelLabels()).not.toContain('Réglages')
    expect(panelLabels()).toContain('Journées')
    cleanup()

    render(<Harness store={store} session={{ roles: [] }} />)
    await waitFor(() => expect(spaces()).toContain('Comparaison'))
    expect(spaces()).toEqual(['Cartographie', 'Gestionnaire', 'Comparaison', 'Tableau de bord', 'Dialogue', 'Export'])
    expect(panelLabels()).toContain('Réglages')
  })

  it('UC-VIS-06-U06 — masqué n’est pas interdit : #/cartographie/comparaison ouvert en mode simple s’affiche, son onglet aussi (marqué courant), et disparaît quand on en sort', async () => {
    window.location.hash = '#/cartographie/comparaison'
    render(<Harness store={await louStore()} session={{ roles: [], expert: false }} />)
    const tab = await screen.findByRole('link', { name: 'Comparaison' })
    expect(tab.getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.carto-app').className).toContain('carto-space-comparaison')
    act(() => {
      window.location.hash = '#/cartographie/export'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Comparaison' })).toBeNull())
  })

  it('UC-VIS-06-U07 — espace Export : en mode simple, pas de carte « Préparer une démo » ; les quatre formats restent ; en mode expert, la carte et son outil', async () => {
    window.location.hash = '#/cartographie/export'
    const store = await louStore()
    render(<Harness store={store} session={{ roles: [], expert: false }} />)
    await screen.findByRole('heading', { name: 'Archive complète (JSON)' })
    for (const name of ['Copie autonome (HTML)', 'Portfolio (Markdown)', 'Rapport imprimable (PDF)']) {
      expect(screen.getByRole('heading', { name })).toBeDefined()
    }
    expect(screen.queryByRole('heading', { name: 'Préparer une démo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ouvrir l’outil d’anonymisation' })).toBeNull()
    cleanup()

    render(<Harness store={store} session={{ roles: [], expert: true }} />)
    expect(await screen.findByRole('heading', { name: 'Préparer une démo' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Ouvrir l’outil d’anonymisation' })).toBeDefined()
  })
})
