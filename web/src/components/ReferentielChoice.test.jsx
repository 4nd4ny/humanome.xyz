import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReferentielChoice from './ReferentielChoice.jsx'
import { clearReferentielCache, listPublishedReferentiels, loadPublishedReferentiel } from '../data/referentiel.js'
// Le document qu'écrit scripts/convertir-humanome.mjs depuis la fixture FICTIVE à la forme Humanome (S5, lot B)
import converti from '../../../schemas/fixtures/referentiel-humanome-fictif.json'

const liste = [
  { id: 'respire', label: 'RESPIRE v7', versions: [{ semver: '7.1.0', label: 'RESPIRE v7.1' }, { semver: '7.0.0', label: 'RESPIRE v7' }] },
  { id: 'fictif-lettre', label: 'Fictif lettré', versions: [{ semver: '1.0.0', label: 'Fictif lettré' }] },
]

afterEach(cleanup)

describe('ReferentielChoice', () => {
  it('offre les référentiels publiés, RESPIRE par défaut, chacun à sa dernière version', async () => {
    const onChange = vi.fn()
    render(<ReferentielChoice value={null} onChange={onChange} list={async () => liste} />)
    const select = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['respire@7.1.0', 'RESPIRE v7'],
      ['fictif-lettre@1.0.0', 'Fictif lettré'],
    ])
    expect(select.value).toBe('respire@7.1.0')
    fireEvent.change(select, { target: { value: 'fictif-lettre@1.0.0' } })
    expect(onChange).toHaveBeenCalledWith({ id: 'fictif-lettre', version: '1.0.0' })
  })

  it('lit la base (API publique) : RESPIRE d’abord et par défaut, même rangé après par la base (S5)', async () => {
    const json = (data) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data })
    const fetchFn = vi.fn(async (url) => {
      if (url === 'api/referentiels') {
        return json([
          { id: 'fictif-lettre', label: 'Fictif lettré', versions: ['1.0.0'] },
          { id: 'respire', label: 'RESPIRE v7', versions: ['7.1.0', '7.0.0'] },
        ])
      }
      throw new Error(`unexpected ${url}`)
    })
    const onChange = vi.fn()
    render(<ReferentielChoice value={null} onChange={onChange} list={() => listPublishedReferentiels({ fetchFn })} />)
    const select = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['respire@7.1.0', 'RESPIRE v7'],
      ['fictif-lettre@1.0.0', 'Fictif lettré'],
    ])
    expect(select.value).toBe('respire@7.1.0')
    fireEvent.change(select, { target: { value: 'fictif-lettre@1.0.0' } })
    expect(onChange).toHaveBeenCalledWith({ id: 'fictif-lettre', version: '1.0.0' })
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['api/referentiels'])
  })

  it('propose le référentiel amorcé depuis le YAML Humanome, puis charge son document tel que la base le sert (S5, lot B)', async () => {
    clearReferentielCache()
    const json = (data) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data })
    const route = `api/referentiels/${converti.id}/versions/${converti.version}`
    const fetchFn = vi.fn(async (url) => {
      // la réponse des routes publiques du lot A, une fois le document amorcé (ReferentielAmorcageTest)
      if (url === 'api/referentiels') {
        return json([
          { id: converti.id, label: converti.label, versions: [converti.version] },
          { id: 'respire', label: 'RESPIRE v7', versions: ['7.0.0'] },
        ])
      }
      if (url === route) return json(converti)
      throw new Error(`unexpected ${url}`)
    })
    const onChange = vi.fn()
    render(<ReferentielChoice value={null} onChange={onChange} list={() => listPublishedReferentiels({ fetchFn })} />)
    const select = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['respire@7.0.0', 'RESPIRE v7'],
      ['fictif-humanome@2.0.0-proposition.1', 'Fictif V2'],
    ])
    fireEvent.change(select, { target: { value: 'fictif-humanome@2.0.0-proposition.1' } })
    expect(onChange).toHaveBeenCalledWith({ id: 'fictif-humanome', version: '2.0.0-proposition.1' })
    const { doc, origin } = await loadPublishedReferentiel({ ...onChange.mock.calls[0][0], fetchFn })
    expect(origin).toBe('published')
    expect(doc).toEqual(converti)
    expect(doc.competences.map((c) => c.code)).toEqual(['A1', 'A2', 'B1'])
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['api/referentiels', route])
    clearReferentielCache()
  })

  it('sans RESPIRE au catalogue, le référentiel présélectionné devient le choix : le parcours charge celui que le menu montre (S5)', async () => {
    const seul = [liste[1]]
    const onChange = vi.fn()
    const { rerender } = render(<ReferentielChoice value={null} onChange={onChange} disabled list={async () => seul} />)
    const select = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect([...select.options].map((o) => o.textContent)).toEqual(['Fictif lettré'])
    expect(select.value).toBe('fictif-lettre@1.0.0')
    // jamais sous un run en cours : le choix suit quand le menu se rouvre
    expect(onChange).not.toHaveBeenCalled()
    rerender(<ReferentielChoice value={null} onChange={onChange} list={async () => seul} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 'fictif-lettre', version: '1.0.0' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    rerender(<ReferentielChoice value={{ id: 'fictif-lettre', version: '1.0.0' }} onChange={onChange} list={async () => seul} />)
    expect(onChange).toHaveBeenCalledTimes(1)
    cleanup()

    // avec RESPIRE, le défaut reste le sien, sans choix (null)
    const sansChoix = vi.fn()
    render(<ReferentielChoice value={null} onChange={sansChoix} list={async () => liste} />)
    expect((await screen.findByRole('combobox', { name: 'Référentiel' })).value).toBe('respire@7.1.0')
    expect(sansChoix).not.toHaveBeenCalled()
  })

  it('montre le choix reçu ; sans API ni index (copie statique), n’offre rien', async () => {
    const { unmount } = render(<ReferentielChoice value={{ id: 'fictif-lettre', version: '1.0.0' }} onChange={() => {}} list={async () => liste} />)
    expect((await screen.findByRole('combobox', { name: 'Référentiel' })).value).toBe('fictif-lettre@1.0.0')
    unmount()
    const vide = vi.fn(async () => [])
    const { container } = render(<ReferentielChoice value={null} onChange={() => {}} list={vide} />)
    await waitFor(() => expect(vide).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
