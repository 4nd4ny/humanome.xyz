// Analyse approfondie coupée jusqu'au lot 3 (moteur dans le dépôt privé
// 4nd4ny/Twin_v9) : la route n'affiche plus qu'un avis.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Twin9View from './Twin9View.jsx'

afterEach(cleanup)

describe('Twin9View', () => {
  it('annonce le retour de l’analyse approfondie, exécutée sur le serveur', () => {
    render(<Twin9View />)
    expect(screen.getByRole('status').textContent).toMatch(/revient bientôt/)
  })
})
