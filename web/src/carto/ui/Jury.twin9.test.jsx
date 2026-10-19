// La délibération d'un run Twin9 du serveur dans l'interface (T9) : chaque
// juré par son nom, sa position et ses deux tours ; le débat dans tous ses
// temps (accusation, défense, briefing, relance, gardiens) ; le président ;
// les pièces du greffier.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunJury } from './Jury.jsx'

afterEach(cleanup)

const run = {
  code: '1.05',
  jury: {
    linguiste: { label: 'Linguiste', position: 'détection', synthese: 'Le lexique est précis.' },
    ingenieur: { label: 'Ingénieur', position: 'contestation', synthese: 'Finalement, non.' },
  },
  president: { prescription: 'Documente une deuxième situation.' },
  deliberation: {
    linguiste: { markdown: '### Premier tour\n\nLe lexique est précis.', preamble: '' },
    ingenieur: { markdown: '### Second tour\n\nFinalement, non.', preamble: '' },
    president: { markdown: 'Le président renvoie au cartographe.', preamble: '' },
  },
  debate: {
    accusation: { markdown: 'L’accusation doute.', preamble: '' },
    briefing: { markdown: 'Briefing neutre du dossier.', preamble: '' },
    gardien_support: { markdown: 'Support conforme.', preamble: '' },
  },
  pieces: [{ date: '2026-01-05', name: 'Pièces du greffier', text: 'Pièce 1 : j’ai monté le capteur.' }],
}

describe('RunJury, un jury Twin9', () => {
  it('donne chaque juré par son nom, sans confiance qu’il n’a pas dite', () => {
    render(<RunJury run={run} />)
    const membres = screen.getByRole('region', { name: 'Réflexions des membres du jury' })
    expect([...membres.querySelectorAll(':scope > details > summary')].map((s) => s.textContent)).toEqual([
      'Linguiste — détection',
      'Ingénieur — contestation',
    ])
  })

  it('déplie le débat dans tous ses temps, le président et les pièces du greffier', () => {
    render(<RunJury run={run} />)
    const debat = screen.getByText('Débat contradictoire').closest('details')
    expect([...debat.querySelectorAll(':scope > details > summary')].map((s) => s.textContent)).toEqual([
      'Accusation',
      'Briefing neutre',
      'Gardien du support',
    ])
    expect(screen.getByText('Le président renvoie au cartographe.')).toBeTruthy()
    expect(screen.getByText('Pièces du Greffier (1, verbatim)')).toBeTruthy()
  })
})
