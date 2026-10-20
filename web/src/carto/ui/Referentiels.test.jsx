// Plusieurs référentiels dans la cartographie (T17) : un run Twin9 du serveur
// sur un référentiel de 5 pôles lettrés, un autre sur 9 pôles, remis par la
// page du run (twin9RunFiles), s'ouvrent chacun dans son jeu, avec le
// référentiel du run ; leurs pôles s'affichent avec leurs noms, une couleur et
// un motif chacun ; les deux jeux coexistent.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { parseHash, subscribe } from '../../router.js'
import { twin9RunFiles } from '../../lib/interface-handoff.js'
import { showCartoTiles } from '../test/tiles.js'
import respire from '../../../public/data/referentiel/respire-v7.json'

const DATES = ['2026-01-05', '2026-01-06']
const LETTRES = ['A', 'B', 'C', 'D', 'E']

/** Le référentiel d'un run, tel que ses résultats le portent : cinq pôles lettrés, quatre capacités chacun. */
const LETTRE = {
  id: 'fictif-lettre',
  version: '1.0.0',
  label: 'Fictif lettré',
  poles: LETTRES.map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}`, couleur: null })),
  competences: LETTRES.flatMap((l, i) => [1, 2, 3, 4].map((k) => ({ code: `${l}${k}`, nom: `Capacité fictive ${l}${k}`, pole: i + 1 }))),
}

/** Neuf pôles numérotés, deux compétences chacun. */
const NEUF = {
  id: 'fictif-neuf',
  version: '1.0.0',
  label: 'Fictif à neuf pôles',
  poles: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, nom: `Pôle fictif ${i + 1}`, couleur: null })),
  competences: Array.from({ length: 9 }, (_, i) => [1, 2].map((k) => ({ code: `${i + 1}.0${k}`, nom: `Compétence fictive ${i + 1}.0${k}`, pole: i + 1 }))).flat(),
}

/**
 * Les résultats d'un run qui a jugé, chaque jour, la première compétence de
 * chaque pôle de son référentiel, comme le moteur factice du serveur.
 */
function resultats(referentiel, id) {
  const jugees = referentiel.poles.map((p) => referentiel.competences.find((c) => c.pole === p.num))
  const verdict = (c, date) => ({
    code: c.code,
    nom: c.nom,
    statut: 'présence établie',
    score_preuves: 1,
    score_indices: 0,
    confiance: 0.8,
    traces_probantes: [{ piece: 1, extrait: `Le ${date}, j’ai mesuré le CO2.`, date, type: 'journal', role: 'preuve' }],
  })
  const sorties = {}
  for (const date of DATES) {
    sorties[`journees/${date}/carto_jour.json`] = JSON.stringify({ journee: date, date, verdicts: Object.fromEntries(jugees.map((c) => [c.code, verdict(c, date)])) })
  }
  const attestations = DATES.map((date, i) => ({ jour_index: i, journee: date, date, confiance: 0.8, score_preuves: 1, score_indices: 0 }))
  sorties['carto_evolutive.json'] = JSON.stringify({
    journal_id: 'journal-e2e',
    competences: Object.fromEntries(jugees.map((c) => [c.code, { code: c.code, nom: c.nom, pole: c.pole, attestations, signaux: [] }])),
    histoires: {},
    rapports_poles: {},
    kairos_evolutif: 'Synthèse fictive.',
  })
  return { run: { id, journal: 'journal-e2e', statut: 'termine', finished_at: '2026-01-07T10:00:00Z' }, lecteur: 'proprietaire', sorties, memoire: [], referentiel }
}

/** Ce que la page du run remet à l'interface (Twin9View) : les fichiers et le titre du jeu. */
async function remise(referentiel, id) {
  const files = await twin9RunFiles(resultats(referentiel, id), { getReferentiel: async () => ({ doc: respire }) })
  return { id: `run-${id}`, files, title: `Twin9 · journal-e2e · ${referentiel.label}` }
}

function Harness({ store, incoming }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: respire }) }} incoming={incoming} />
}

const sunEl = () => document.querySelector('[data-tile="sun"] .carto-sun')
const poleSectors = () => [...(sunEl()?.querySelectorAll('path[role="button"][aria-label^="Pôle "]') ?? [])]
const poleNames = () => poleSectors().map((el) => /^Pôle (.+?) : /.exec(el.getAttribute('aria-label'))[1])
const poleColors = () => poleSectors().map((el) => el.style.getPropertyValue('--c'))
const competenceLabels = () =>
  [...(sunEl()?.querySelectorAll('path[role="button"]') ?? [])].map((el) => el.getAttribute('aria-label')).filter((l) => !l.startsWith('Pôle '))
const tile = (id) => document.querySelector(`[data-tile="${id}"]`)

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('plusieurs référentiels dans la cartographie (T17)', () => {
  it('une carte à 5 pôles lettrés s’affiche avec leurs noms, leurs capacités et une couleur par pôle', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    render(<Harness store={store} incoming={await remise(LETTRE, 11)} />)

    await waitFor(() => expect(poleNames()).toEqual(LETTRES.map((l) => `${l} · Pôle fictif ${l}`)))
    expect(competenceLabels().map((l) => l.split(' :')[0])).toEqual(LETTRES.map((l) => `${l}1 Capacité fictive ${l}1`))
    expect(new Set(poleColors()).size).toBe(5)
    expect(within(tile('datasets')).getByText(/Référentiel : Fictif lettré\./)).toBeTruthy()
    const [ds] = await store.listDatasets()
    expect([ds.title, ds.referential, ds.dayCount]).toEqual(['Twin9 · journal-e2e · Fictif lettré', 'Fictif lettré', 2])
  })

  it('une carte à 9 pôles s’affiche avec leurs noms, une couleur et un motif chacun ; la carte lettrée coexiste avec elle', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const lettre = await remise(LETTRE, 11)
    const { rerender } = render(<Harness store={store} incoming={lettre} />)
    await waitFor(() => expect(poleNames()).toHaveLength(5))
    rerender(<Harness store={store} incoming={await remise(NEUF, 12)} />)

    const neuf = Array.from({ length: 9 }, (_, i) => `Pôle fictif ${i + 1}`)
    await waitFor(() => expect(poleNames()).toEqual(neuf))
    expect(competenceLabels().map((l) => l.split(' ')[0])).toEqual(neuf.map((_, i) => `${i + 1}.01`))
    expect(new Set(poleColors()).size).toBe(9)
    // distinctions renforcées : un motif par pôle, au-delà des huit d'avant T17
    fireEvent.click(within(tile('legend')).getByRole('checkbox', { name: /distinctions renforcées/ }))
    await waitFor(() => expect(sunEl().querySelectorAll('pattern g.carto-sun-motif')).toHaveLength(9))
    expect(new Set([...sunEl().querySelectorAll('pattern g.carto-sun-motif')].map((g) => g.innerHTML)).size).toBe(9)

    // les deux jeux coexistent, chacun avec son référentiel
    const jeux = await store.listDatasets()
    expect(jeux.map((d) => d.referential).sort()).toEqual(['Fictif lettré', 'Fictif à neuf pôles'])
    const choix = within(tile('datasets')).getByRole('combobox', { name: /Ouvrir/ })
    expect([...choix.options].map((o) => o.textContent).sort()).toEqual([
      'Twin9 · journal-e2e · Fictif lettré (2 j.)',
      'Twin9 · journal-e2e · Fictif à neuf pôles (2 j.)',
    ])
    fireEvent.change(choix, { target: { value: jeux.find((d) => d.referential === 'Fictif lettré').datasetId } })
    await waitFor(() => expect(poleNames()).toEqual(LETTRES.map((l) => `${l} · Pôle fictif ${l}`)))
  })
})
