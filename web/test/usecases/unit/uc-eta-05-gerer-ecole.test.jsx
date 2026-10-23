// UC-ETA-05 — Gérer son école (crédit, surtaxe, plafond par élève, clé) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-05-gerer-ecole.md
//
// Le module des payeurs (lib/payeurs.js : qui paie un usage payant, ce qu'une
// école peut encore payer pour un élève), le menu « Qui paie »
// (views/twin9/ChoixPayeur.jsx) et la section « Mon école » de l'espace
// établissement (views/etablissement/EcoleSection.jsx), rendus isolément avec
// leur couture `fetchFn` ; le réseau est simulé (support/eta.js). Aucune vraie
// clé : des valeurs inventées.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  choixParDefaut,
  ecolesQuiPaient,
  libellePayeur,
  payeurChoisi,
  phrasePayeur,
  resteMicrousd,
  valeurPayeur,
} from '../../../src/lib/payeurs.js'
import ChoixPayeur from '../../../src/views/twin9/ChoixPayeur.jsx'
import EcoleSection from '../../../src/views/etablissement/EcoleSection.jsx'
import { ecolePage, fakeFetch, jsonResponse, noContent } from '../support/eta.js'

afterEach(() => cleanup())

const TILLEULS = {
  type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false, cle: false, mois: '2026-10',
  plafond_microusd: 5_000_000, engage_microusd: 1_200_000, reste_credit_microusd: 1_800_000, reste_cle_microusd: 3_800_000,
}
const PLATANES = { ...TILLEULS, id: 4, nom: 'École des Platanes', cle: true }
const SOLDE = { type: 'personnel', solde_microusd: 2_000_000 }

describe('UC-ETA-05 — qui paie (lib/payeurs.js)', () => {
  it('UC-ETA-05-U14 — défaut : la seule école, sinon le seul payeur ; deux écoles : à choisir ; la valeur d’une requête ; ce qu’une école peut encore payer, sur son crédit ou sur sa clé, jamais son crédit', () => {
    expect(choixParDefaut([TILLEULS, SOLDE])).toBe('3')
    expect(choixParDefaut([SOLDE])).toBe('personnel')
    expect(choixParDefaut([TILLEULS, PLATANES, SOLDE])).toBe('')
    expect(choixParDefaut(undefined)).toBe('')
    expect([valeurPayeur(''), valeurPayeur('personnel'), valeurPayeur('3'), valeurPayeur('x')]).toEqual([null, 'personnel', 3, null])
    expect(payeurChoisi([TILLEULS, SOLDE], '3')).toBe(TILLEULS)
    expect(payeurChoisi([TILLEULS], '9')).toBeNull()
    expect([resteMicrousd(TILLEULS), resteMicrousd(TILLEULS, 'ecole'), resteMicrousd(SOLDE)]).toEqual([1_800_000, 3_800_000, 2_000_000])
    expect(libellePayeur(TILLEULS)).toBe('Mon école, École des Tilleuls (il me reste 1,80 $ ce mois-ci)')
    expect(libellePayeur(SOLDE)).toBe('Mon solde restant (2,00 $)')
    expect(phrasePayeur(TILLEULS)).toBe(
      'Payé par votre école, École des Tilleuls. Elle voit le montant de ce qu’elle paie pour vous, jamais le contenu de vos analyses.',
    )
    expect(phrasePayeur(SOLDE)).toBe('')
    expect(phrasePayeur({ ...TILLEULS, soi: true })).toBe('') // une école pour elle-même
    expect(ecolesQuiPaient([TILLEULS, { ...PLATANES, soi: true }, SOLDE])).toEqual([TILLEULS])
  })

  it('UC-ETA-05-U15 — « Qui paie » : rien pour son seul solde ; une phrase pour sa seule école ; un menu à choisir pour deux écoles, ou son école et son solde', () => {
    const { container, rerender } = render(<ChoixPayeur payeurs={[SOLDE]} valeur="personnel" onChange={() => {}} />)
    expect(container.textContent).toBe('')
    rerender(<ChoixPayeur payeurs={[TILLEULS]} valeur="3" onChange={() => {}} />)
    expect(screen.getByTestId('payeur-ecole').textContent).toContain('Payé par votre école, École des Tilleuls.')
    let choix = ''
    rerender(<ChoixPayeur payeurs={[TILLEULS, PLATANES, SOLDE]} valeur="" onChange={(v) => (choix = v)} />)
    expect([...screen.getByLabelText('Qui paie').options].map((o) => o.textContent)).toEqual([
      'Choisir…',
      'Mon école, École des Tilleuls (il me reste 1,80 $ ce mois-ci)',
      'Mon école, École des Platanes (il me reste 1,80 $ ce mois-ci)',
      'Mon solde restant (2,00 $)',
    ])
    fireEvent.change(screen.getByLabelText('Qui paie'), { target: { value: '4' } })
    expect(choix).toBe('4')
    rerender(<ChoixPayeur payeurs={[TILLEULS, PLATANES, SOLDE]} valeur="4" cle="ecole" onChange={() => {}} />)
    expect(screen.getByLabelText('Qui paie').selectedOptions[0].textContent).toBe(
      'Mon école, École des Platanes (il me reste 3,80 $ ce mois-ci)',
    )
    expect(screen.getByText(/Elle voit le montant de ce qu’elle paie pour vous/)).toBeDefined()
  })
})

describe('UC-ETA-05 — la section « Mon école » (EcoleSection)', () => {
  it('UC-ETA-05-U16 — plafond à 0 montré d’abord ; crédit et lien d’achat ; réglages envoyés (PUT) ; surtaxe hors bornes refusée sans appel ; élèves et dépenses en montants', async () => {
    let page = ecolePage({ creditMicrousd: 20_000_000, eleves: [
      { userId: 12, displayName: 'Maya', cohortes: ['BTS SIO 2026'], membre: true, moisMicrousd: 4_260, totalMicrousd: 9_000 },
      { userId: 13, displayName: 'Noé', cohortes: [], membre: false, moisMicrousd: 0, totalMicrousd: 1_000 },
    ], depenseMoisMicrousd: 4_260 })
    const net = fakeFetch({
      'GET api/etablissement/ecole': () => jsonResponse(200, page),
      'PUT api/etablissement/ecole': (init) => {
        const corps = JSON.parse(init.body)
        page = { ...page, surtaxePct: corps.surtaxePct, plafondEleveMicrousd: Math.round(corps.plafondEleveUsd * 1_000_000) }
        return jsonResponse(200, page)
      },
    })
    render(<EcoleSection fetchFn={net.fetchMock} />)

    expect((await screen.findByTestId('etab-plafond-zero')).textContent).toContain('Le plafond par élève vaut 0')
    expect(screen.getByTestId('etab-credit').textContent).toContain('20,00 $')
    expect(screen.getByRole('link', { name: 'Acheter du crédit' }).getAttribute('href')).toBe('#/compte/credit')
    const lignes = [...screen.getByTestId('etab-eleves').querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent))
    expect(lignes).toEqual([
      ['Maya', 'BTS SIO 2026', '0,0043 $', '0,0090 $'],
      ['Noé', 'a quitté vos cohortes', '0,00 $', '0,0010 $'],
    ])

    fireEvent.change(screen.getByLabelText('Surtaxe sur la clé de l’instance (%)'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
    expect((await screen.findByRole('alert')).textContent).toBe('La surtaxe se choisit entre 3,5 % et 10 %.')
    expect(net.callsTo('PUT api/etablissement/ecole')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Surtaxe sur la clé de l’instance (%)'), { target: { value: '6.5' } })
    fireEvent.change(screen.getByLabelText('Plafond par élève et par mois (USD)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
    await waitFor(() => expect(net.callsTo('PUT api/etablissement/ecole')).toHaveLength(1))
    expect(net.callsTo('PUT api/etablissement/ecole')[0].body).toEqual({ surtaxePct: 6.5, plafondEleveUsd: 10 })
    expect((await screen.findByText('Réglages de l’école enregistrés.')).getAttribute('role')).toBe('status')
    expect(screen.queryByTestId('etab-plafond-zero')).toBeNull()
  })

  it('UC-ETA-05-U17 — la clé de l’école : posée (PUT), le champ vidé, jamais réaffichée ; retirée en deux temps (DELETE) ; sans chiffrement, aucun champ', async () => {
    let page = ecolePage()
    const net = fakeFetch({
      'GET api/etablissement/ecole': () => jsonResponse(200, page),
      'PUT api/etablissement/ecole/cle': () => {
        page = { ...page, cles: [{ fournisseur: 'anthropic', poseeLe: '2026-10-22T10:00:00' }] }
        return jsonResponse(200, page)
      },
      'DELETE api/etablissement/ecole/cle/anthropic': () => {
        page = { ...page, cles: [] }
        return noContent()
      },
    })
    const { container } = render(<EcoleSection fetchFn={net.fetchMock} />)

    fireEvent.change(await screen.findByLabelText('Clé Anthropic'), { target: { value: '  sk-ant-ecole-fictive  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect((await screen.findByTestId('etab-cle-posee')).textContent).toContain('jamais réaffichée')
    expect(net.callsTo('PUT api/etablissement/ecole/cle')[0].body).toEqual({ cle: 'sk-ant-ecole-fictive', fournisseur: 'anthropic' })
    expect(container.innerHTML).not.toContain('sk-ant-ecole')

    fireEvent.click(screen.getByRole('button', { name: 'Retirer la clé' }))
    expect(net.callsTo('DELETE api/etablissement/ecole/cle/anthropic')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    expect(await screen.findByLabelText('Clé Anthropic')).toBeDefined()
    expect(net.callsTo('DELETE api/etablissement/ecole/cle/anthropic')).toHaveLength(1)

    cleanup()
    const sans = fakeFetch({ 'GET api/etablissement/ecole': jsonResponse(200, ecolePage({ chiffrementDisponible: false })) })
    render(<EcoleSection fetchFn={sans.fetchMock} />)
    expect(await screen.findByText('Le chiffrement des clés n’est pas configuré sur ce serveur.')).toBeDefined()
    expect(screen.queryByLabelText('Clé Anthropic')).toBeNull()
  })
})
