import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReferentielChoice from './ReferentielChoice.jsx'

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

  it('montre le choix reçu ; sans index (copie statique), n’offre rien', async () => {
    const { unmount } = render(<ReferentielChoice value={{ id: 'fictif-lettre', version: '1.0.0' }} onChange={() => {}} list={async () => liste} />)
    expect((await screen.findByRole('combobox', { name: 'Référentiel' })).value).toBe('fictif-lettre@1.0.0')
    unmount()
    const vide = vi.fn(async () => [])
    const { container } = render(<ReferentielChoice value={null} onChange={() => {}} list={vide} />)
    await waitFor(() => expect(vide).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
