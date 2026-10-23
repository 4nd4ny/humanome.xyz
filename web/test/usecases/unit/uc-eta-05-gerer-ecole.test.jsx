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
  CREDIT_ECOLE_BAS,
  choixParDefaut,
  creditEcoleBas,
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
import { declOf, globalCssRules } from '../support/global-css.js'

afterEach(() => cleanup())

const TILLEULS = {
  type: 'ecole', id: 3, nom: 'École des Tilleuls', soi: false, cle: false, mois: '2026-10',
  plafond_microusd: 5_000_000, engage_microusd: 1_200_000, reste_credit_microusd: 3_800_000, reste_cle_microusd: 3_800_000,
  credit_suffisant: false,
}
const PLATANES = { ...TILLEULS, id: 4, nom: 'École des Platanes', cle: true }
const SOLDE = { type: 'personnel', solde_microusd: 2_000_000 }

describe('UC-ETA-05 — qui paie (lib/payeurs.js)', () => {
  it('UC-ETA-05-U14 — défaut : la seule école, sinon le seul payeur ; deux écoles : à choisir ; la valeur d’une requête ; ce qu’une école peut encore payer — son plafond restant, et si son crédit le couvre —, jamais son crédit', () => {
    expect(choixParDefaut([TILLEULS, SOLDE])).toBe('3')
    expect(choixParDefaut([SOLDE])).toBe('personnel')
    expect(choixParDefaut([TILLEULS, PLATANES, SOLDE])).toBe('')
    expect(choixParDefaut(undefined)).toBe('')
    expect([valeurPayeur(''), valeurPayeur('personnel'), valeurPayeur('3'), valeurPayeur('x')]).toEqual([null, 'personnel', 3, null])
    expect(payeurChoisi([TILLEULS, SOLDE], '3')).toBe(TILLEULS)
    expect(payeurChoisi([TILLEULS], '9')).toBeNull()
    // son plafond restant, sur le crédit comme sur la clé : le crédit de l'école ne se lit jamais, seulement s'il le couvre
    expect([resteMicrousd(TILLEULS), resteMicrousd(TILLEULS, 'ecole'), resteMicrousd(SOLDE)]).toEqual([3_800_000, 3_800_000, 2_000_000])
    expect(libellePayeur(TILLEULS)).toBe('Mon école, École des Tilleuls (il me reste 3,80 $ ce mois-ci)')
    expect([creditEcoleBas(TILLEULS), creditEcoleBas(TILLEULS, 'ecole'), creditEcoleBas({ ...TILLEULS, credit_suffisant: true }),
      creditEcoleBas({ ...TILLEULS, soi: true }), creditEcoleBas(SOLDE), creditEcoleBas(null)]).toEqual([true, false, false, false, false, false])
    expect(CREDIT_ECOLE_BAS).not.toMatch(/\d/)
    expect(libellePayeur(SOLDE)).toBe('Mon solde restant (2,00 $)')
    expect(phrasePayeur(TILLEULS)).toBe(
      'Payé par votre école, École des Tilleuls. Elle voit le montant de ce qu’elle paie pour vous, jamais le contenu de vos analyses sur humanome ; avec sa propre clé Anthropic, elle peut relire dans sa Console Anthropic les résultats des appels partis par lots.',
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
      'Mon école, École des Tilleuls (il me reste 3,80 $ ce mois-ci)',
      'Mon école, École des Platanes (il me reste 3,80 $ ce mois-ci)',
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
  it('UC-ETA-05-U16 — plafond à 0 montré d’abord ; crédit et lien d’achat ; réglages envoyés (PUT) ; surtaxe hors bornes refusée sans appel ; élèves et dépenses en montants, ceux qui sont partis ensemble et sans nom', async () => {
    let page = ecolePage({ creditMicrousd: 20_000_000, eleves: [
      { userId: 12, displayName: 'Maya', cohortes: ['BTS SIO 2026'], membre: true, moisMicrousd: 4_260, totalMicrousd: 9_000 },
    ], partis: { nombre: 1, moisMicrousd: 0, totalMicrousd: 1_000 }, depenseMoisMicrousd: 4_260 })
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
    // a learner who left (their consent withdrawn): their amounts with the others who left, never their name
    expect(lignes).toEqual([
      ['Maya', 'BTS SIO 2026', '0,0043 $', '0,0090 $'],
      ['1 élève parti', 'a quitté vos cohortes — sans son nom', '0,00 $', '0,0010 $'],
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

  it('UC-ETA-05-U22 — saisies refusées sur place : surtaxe au millième, plafond au millième ou au-delà de 100 000 $, clé avec un espace → message sous le champ, sans appel, la clé saisie gardée ; un refus du serveur (422) dit son champ, pas « Validation échouée » seul', async () => {
    let refus = null
    const net = fakeFetch({
      'GET api/etablissement/ecole': () => jsonResponse(200, ecolePage()),
      'PUT api/etablissement/ecole': () => jsonResponse(422, refus),
      'PUT api/etablissement/ecole/cle': () => jsonResponse(422, refus),
    })
    render(<EcoleSection fetchFn={net.fetchMock} />)
    const surtaxe = await screen.findByLabelText('Surtaxe sur la clé de l’instance (%)')
    const plafond = screen.getByLabelText('Plafond par élève et par mois (USD)')
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer les réglages' })
    const message = (champ) => document.getElementById(champ.getAttribute('aria-describedby'))?.textContent ?? ''

    fireEvent.change(surtaxe, { target: { value: '3.555' } })
    fireEvent.click(enregistrer)
    expect(message(surtaxe)).toContain('au centième')
    expect(surtaxe.getAttribute('aria-invalid')).toBe('true')
    for (const valeur of ['12.345', '200000']) {
      fireEvent.change(surtaxe, { target: { value: '5' } })
      fireEvent.change(plafond, { target: { value: valeur } })
      fireEvent.click(enregistrer)
      expect(message(plafond)).toContain('de 0 à 100 000')
    }
    expect(net.callsTo('PUT api/etablissement/ecole')).toHaveLength(0)

    const cle = screen.getByLabelText('Clé Anthropic')
    fireEvent.change(cle, { target: { value: 'sk-ant ecole-fictive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(message(cle)).toContain('sans espace')
    expect(cle.value).toBe('sk-ant ecole-fictive')
    expect(net.callsTo('PUT api/etablissement/ecole/cle')).toHaveLength(0)

    // the server refuses all the same: its field's message, under the field; the key typed stays
    refus = { error: 'Validation échouée', fields: { cle: 'Clé invalide : une clé non vide, sans espace, de 400 caractères au plus' } }
    fireEvent.change(cle, { target: { value: 'sk-ant-ecole-fictive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    await waitFor(() => expect(message(cle)).toBe('Clé invalide : une clé non vide, sans espace, de 400 caractères au plus'))
    expect(cle.value).toBe('sk-ant-ecole-fictive')
    refus = { error: 'Validation échouée', fields: { plafondEleveUsd: 'Plafond par élève invalide : un montant en dollars, de 0 à 100 000, au centième' } }
    fireEvent.change(plafond, { target: { value: '10' } })
    fireEvent.click(enregistrer)
    await waitFor(() => expect(message(plafond)).toContain('Plafond par élève invalide'))
  })

  it('UC-ETA-05-U23 — chaque retour s’affiche près de son formulaire (les réglages sous les réglages, la clé sous la clé), pas en bas de la section ; les deux formulaires ont leurs règles CSS (libellés en bloc, champs bordés, largeur bornée à 375 px)', async () => {
    const page = ecolePage({ plafondEleveMicrousd: 5_000_000, eleves: [
      { userId: 12, displayName: 'Maya', cohortes: ['BTS'], membre: true, moisMicrousd: 0, totalMicrousd: 0 },
    ] })
    const net = fakeFetch({
      'GET api/etablissement/ecole': () => jsonResponse(200, page),
      'PUT api/etablissement/ecole': () => jsonResponse(200, page),
      'PUT api/etablissement/ecole/cle': () => jsonResponse(503, { error: 'Chiffrement des clés non configuré sur ce serveur' }),
    })
    render(<EcoleSection fetchFn={net.fetchMock} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer les réglages' }))
    const ok = await screen.findByText('Réglages de l’école enregistrés.')
    const titreCle = screen.getByRole('heading', { name: 'Clé Anthropic de l’école' })
    const tableau = screen.getByTestId('etab-eleves')
    // before the key's block: the school sees it without scrolling
    expect(ok.compareDocumentPosition(titreCle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Clé Anthropic'), { target: { value: 'sk-ant-ecole-fictive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    const erreur = await screen.findByText('Chiffrement des clés non configuré sur ce serveur')
    expect(erreur.getAttribute('role')).toBe('alert')
    expect(titreCle.compareDocumentPosition(erreur) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(erreur.compareDocumentPosition(tableau) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const regles = globalCssRules()
    for (const formulaire of ['.etab-ecole-reglages', '.etab-ecole-cle-form']) {
      expect(declOf(regles, `${formulaire} label`).display).toBe('block')
      const champ = declOf(regles, `${formulaire} input`)
      // a field's edge must reach 3:1 against the page in all three interfaces (UC-VIS-07-U11)
      expect(champ.border).toBe('1px solid var(--line-strong)')
      expect(champ.width).toBe('min(28rem, 100%)')
      expect(champ['box-sizing'] ?? 'border-box').toBe('border-box')
    }
  })
})
