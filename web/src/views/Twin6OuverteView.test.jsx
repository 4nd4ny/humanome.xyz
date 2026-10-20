import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import Twin6OuverteView from './Twin6OuverteView.jsx'
import { ApiError } from '../api/client.js'
import * as fakeLib from '../test/fake-sunburst-lib.js'

afterEach(cleanup)

const ETABLIE = 'présence établie'

const MERGE_DOC = {
  kind: 'cartographie-merge',
  periode: { premiere: '2026-01-05', derniere: '2026-01-05', nbFeuilles: 1 },
  domains: [
    {
      id: 'TÊTE — Penser & Comprendre',
      color: '#2563eb',
      rapport_html: '<p>Rapport TÊTE.</p>',
      competences: [
        {
          id: '1.01 — Pensée', code: '1.01', points: 1, niveau: 3, statut: ETABLIE,
          description: 'Pensée', feedback: '<p>Feedback 1.01.</p>', score_moyen_par_feuille: 1,
          parFeuille: [{ date: '2026-01-05', statut: ETABLIE, preuves: 1, indices: 0, confiance: 0.7, score: 1 }],
        },
      ],
    },
  ],
  profilMeta: {
    competences_etablies: 1, competences_renvoyees: 0, competences_orphelines: 0, score_total: 1,
    evolution_globale: [{ date: '2026-01-05', score_total: 1, etablies: 1 }],
  },
  feuilles: [{ iso: '2026-01-05', label: '05/01/2026' }],
  narratifs: { kairosHtml: '<h3>Synthèse</h3><p>Kairos ouvert.</p>' },
}

const PKG = {
  id: 'twin6-ouverte', version: '1.0.0', modeleCibleDefaut: 'claude-sonnet-5',
  templates: { scanPole: 'SCAN ${POLE}', kairos: 'KAIROS', fiches: { 1: '# Pôle 1 — TÊTE\n\n## 1.01 — Pensée\n' } },
}
const OFFER = {
  modeles: { 'claude-sonnet-5': [3.3, 16.5] },
  twin9PromoOuverte: false,
  referentiel: [{ num: 1, nom: 'TÊTE — Penser & Comprendre', competences: [{ code: '1.01', nom: 'Pensée' }] }],
  // Compte financé par défaut : un run sur crédits réussit (le garde-fou de
  // solde ne bloque pas). Le test « solde insuffisant » abaisse ce solde à 1 USD.
  solde_microusd: 100_000_000,
}

// La version publiée de RESPIRE, FICTIVE : la même structure que /meta (un pôle, une compétence).
const RESPIRE = {
  id: 'respire', version: '7.0.0', label: 'RESPIRE v7',
  poles: [{ num: 1, nom: 'TETE — Penser & Comprendre' }],
  competences: [{ code: '1.01', nom: 'Pensée', pole: 1, description: 'Douter avec méthode.' }],
}
// Un autre référentiel publié, FICTIF : deux pôles lettrés.
const LETTRE = {
  id: 'fictif-lettre', version: '1.0.0', label: 'Fictif lettré',
  poles: [{ num: 1, nom: 'A · Percevoir' }, { num: 2, nom: 'B · Agir' }],
  competences: [{ code: 'A1', nom: 'Voir', pole: 1, description: 'Ce que voir veut dire.' }, { code: 'B1', nom: 'Faire', pole: 2 }],
}
const LISTE = [
  { id: 'respire', label: 'RESPIRE v7', versions: [{ semver: '7.0.0', label: 'RESPIRE v7' }] },
  { id: 'fictif-lettre', label: 'Fictif lettré', versions: [{ semver: '1.0.0', label: 'Fictif lettré' }] },
]

function baseDeps(over = {}) {
  return {
    fetchMeFn: async () => ({ user: { id: 1, roles: ['apprenant'] } }),
    loadPackage: async () => PKG,
    fetchOffer: async () => OFFER,
    makeCreditsProvider: () => ({ name: 'twin6-credits', complete: async () => ({}) }),
    makeOwnKeyProvider: vi.fn(() => ({ name: 'anthropic', complete: async () => ({}) })),
    listKeys: async () => [], // par défaut : aucune clé enregistrée
    revealKey: vi.fn(async () => ({ apiKey: 'sk-ant-stored-key' })),
    runEngine: vi.fn(async () => ({ document: MERGE_DOC, calls: new Array(8).fill(0) })),
    // Sans index des référentiels : aucun choix, RESPIRE (sa version publiée).
    listReferentiels: async () => [],
    loadReferentiel: vi.fn(async ({ id } = {}) => ({ doc: id === 'fictif-lettre' ? LETTRE : RESPIRE, origin: 'published' })),
    now: () => new Date('2026-07-15T00:00:00Z'),
    lib: fakeLib,
    ...over,
  }
}

describe('Twin6OuverteView', () => {
  it('invite un visiteur anonyme à se connecter', async () => {
    render(<Twin6OuverteView deps={baseDeps({ fetchMeFn: async () => ({ user: null }) })} />)
    expect(await screen.findByRole('link', { name: 'Connectez-vous' })).toBeDefined()
  })

  it('affiche le formulaire ouvert (clé perso gratuite ou crédits) une fois connecté', async () => {
    render(<Twin6OuverteView deps={baseDeps()} />)
    expect(await screen.findByLabelText(/Votre portfolio/)).toBeDefined()
    expect(screen.getByRole('radio', { name: /Avec nos crédits/ })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Avec ma propre clé API/ })).toBeDefined()
    // Lien de téléchargement des prompts open source.
    expect(screen.getByRole('link', { name: 'Télécharger les prompts' })).toBeDefined()
  })

  it('lance le moteur et rend le résultat dans le sunburst', async () => {
    const deps = baseDeps()
    render(<Twin6OuverteView deps={deps} />)

    const textarea = await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(textarea, {
      target: { value: '### 2026-01-05\n---\nAujourd’hui j’ai réparé l’horloge et réfléchi à ma méthode de travail.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    const arg = deps.runEngine.mock.calls[0][0]
    expect(arg.model).toBe('claude-sonnet-5')
    expect(arg.portfolio).toContain('réparé l’horloge')
    expect(arg.referentiel.poles).toEqual([{ num: 1, nom: 'TÊTE — Penser & Comprendre' }])
    expect(arg.referentiel.competences).toEqual([{ code: '1.01', nom: 'Pensée', pole: 1 }])

    // Résultat rendu (le sunburst réutilise MergeView).
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()

    // D4 — export JSON : bouton présent, télécharge la cartographie-merge du run.
    const exportBtn = screen.getByTestId('twin6-export')
    expect(exportBtn.textContent).toContain('Exporter le JSON')
    const anchors = []
    const origClick = HTMLAnchorElement.prototype.click
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((blob) => {
      anchors.push({ blob })
      return 'blob:mock'
    })
    URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = function () {
      anchors[anchors.length - 1].download = this.download
    }
    try {
      fireEvent.click(exportBtn)
      expect(anchors).toHaveLength(1)
      expect(anchors[0].download).toBe('cartographie-twin6-ouverte.json')
      expect(anchors[0].blob.type).toBe('application/json')
    } finally {
      HTMLAnchorElement.prototype.click = origClick
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })

  it('RESPIRE par défaut : le moteur lit la structure de /meta, celle de sa version publiée, et la fiche du paquet', async () => {
    const deps = baseDeps()
    render(<Twin6OuverteView deps={deps} />)
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    expect(await screen.findByText(/2 appels au modèle \(1 pôle \+ synthèse\)/)).toBeDefined()
    expect(screen.queryByRole('combobox', { name: 'Référentiel' })).toBeNull() // sans index, pas de choix
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    const arg = deps.runEngine.mock.calls[0][0]
    expect(arg.referentiel.poles).toEqual([{ num: 1, nom: 'TÊTE — Penser & Comprendre' }]) // les noms de /meta
    expect(arg.templates.fiches).toEqual({ 1: PKG.templates.fiches[1] }) // la fiche du paquet, telle quelle
    expect(deps.loadReferentiel.mock.calls[0][0]).toEqual({}) // la dernière version publiée de RESPIRE
    // Le total des compétences établies est celui de ce référentiel.
    expect(await screen.findAllByText('1 / 1')).toHaveLength(2)
  })

  it('un autre référentiel choisi : le moteur lit son document, une fiche écrite par pôle, et le décompte suit ses pôles', async () => {
    const deps = baseDeps({ listReferentiels: async () => LISTE })
    render(<Twin6OuverteView deps={deps} />)
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    const choix = await screen.findByRole('combobox', { name: 'Référentiel' })
    expect(choix.value).toBe('respire@7.0.0')
    fireEvent.change(choix, { target: { value: 'fictif-lettre@1.0.0' } })
    expect(await screen.findByText(/3 appels au modèle \(2 pôles \+ synthèse\)/)).toBeDefined()
    expect(deps.loadReferentiel).toHaveBeenLastCalledWith({ id: 'fictif-lettre', version: '1.0.0' })

    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    const arg = deps.runEngine.mock.calls[0][0]
    expect(arg.referentiel).toBe(LETTRE)
    expect(Object.keys(arg.templates.fiches)).toEqual(['1', '2'])
    expect(arg.templates.fiches[1]).toBe('# Pôle 1 — A · Percevoir\n\n## A1 — Voir\n\nCe que voir veut dire.\n')
  })

  it('une version de RESPIRE d’une autre structure que /meta : le moteur lit son document', async () => {
    const six = { ...RESPIRE, version: '8.0.0', poles: [...RESPIRE.poles, { num: 2, nom: 'COEUR — Relier' }],
      competences: [...RESPIRE.competences, { code: '2.01', nom: 'Écouter', pole: 2 }] }
    const deps = baseDeps({ loadReferentiel: vi.fn(async () => ({ doc: six, origin: 'published' })) })
    render(<Twin6OuverteView deps={deps} />)
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    expect(await screen.findByText(/3 appels au modèle/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    expect(deps.runEngine.mock.calls[0][0].referentiel).toBe(six)
  })

  it('un référentiel choisi qui ne se charge pas : message, lancement impossible', async () => {
    const deps = baseDeps({
      listReferentiels: async () => LISTE,
      loadReferentiel: vi.fn(async ({ id } = {}) => {
        if (id === 'fictif-lettre') throw new Error('Le référentiel « fictif-lettre » 1.0.0 n\'a pas pu être chargé')
        return { doc: RESPIRE, origin: 'published' }
      }),
    })
    render(<Twin6OuverteView deps={deps} />)
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Référentiel' }), { target: { value: 'fictif-lettre@1.0.0' } })
    expect((await screen.findByRole('alert')).textContent).toContain('« fictif-lettre » 1.0.0 n\'a pas pu être chargé')
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', true)
  })

  it('exige une clé API quand la voie « clé perso » est choisie', async () => {
    const deps = baseDeps()
    render(<Twin6OuverteView deps={deps} />)
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    // Sans clé, le bouton reste désactivé.
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Clé API Anthropic'), { target: { value: 'sk-ant-user' } })
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', false)
  })

  it('propose et lance sur la clé enregistrée au profil (sans ressaisie)', async () => {
    const deps = baseDeps({ listKeys: async () => [{ provider: 'anthropic', createdAt: '2026-07-15' }] })
    render(<Twin6OuverteView deps={deps} />)
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))

    // Le choix « clé enregistrée » est proposé et présélectionné : aucun champ à saisir,
    // le bouton est actif immédiatement.
    expect(await screen.findByRole('radio', { name: /clé Anthropic enregistrée/ })).toHaveProperty('checked', true)
    expect(screen.queryByLabelText('Clé API Anthropic')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    // La clé est révélée à la demande et passée au provider own-key.
    await waitFor(() => expect(deps.revealKey).toHaveBeenCalledWith('anthropic', expect.anything()))
    await waitFor(() => expect(deps.makeOwnKeyProvider).toHaveBeenCalled())
    expect(deps.makeOwnKeyProvider.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-ant-stored-key' })
  })

  // Exigence : « sinon saisie manuelle + lien vers le profil » — sans clé
  // enregistrée, la vue guide vers #/compte pour enregistrer sa clé.
  it('sans clé enregistrée : saisie manuelle + lien « enregistrez votre clé » vers #/compte', async () => {
    render(<Twin6OuverteView deps={baseDeps()} />) // listKeys → [] par défaut
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))

    const link = screen.getByRole('link', { name: /enregistrez votre clé dans votre profil/ })
    expect(link.getAttribute('href')).toBe('#/compte')
    // La saisie manuelle reste possible, et l'option « clé enregistrée » n'est pas proposée.
    expect(screen.getByLabelText('Clé API Anthropic')).toBeDefined()
    expect(screen.queryByRole('radio', { name: /clé Anthropic enregistrée/ })).toBeNull()
  })

  // Exigence : la clé enregistrée est révélée « à la demande » UNIQUEMENT —
  // si l'utilisateur choisit de saisir une autre clé, revealKey ne doit pas être appelé.
  it('« Saisir une autre clé » : lance sur la clé saisie, sans jamais révéler la clé du profil', async () => {
    const deps = baseDeps({ listKeys: async () => [{ provider: 'anthropic', createdAt: '2026-07-15' }] })
    render(<Twin6OuverteView deps={deps} />)
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))

    fireEvent.click(await screen.findByRole('radio', { name: /Saisir une autre clé/ }))
    fireEvent.change(screen.getByLabelText('Clé API Anthropic'), { target: { value: 'sk-ant-autre-cle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(deps.makeOwnKeyProvider).toHaveBeenCalled())
    expect(deps.makeOwnKeyProvider.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-ant-autre-cle' })
    expect(deps.revealKey).not.toHaveBeenCalled()
  })

  // Traçabilité — exigence utilisateur (credits-paypal, point 3) : « clé API
  // personnelle = usage GRATUIT (aucun débit de crédits) pour Twin6 ». La voie
  // cle_perso ne doit JAMAIS construire le provider crédités ni toucher
  // /api/twin6/appel : le moteur tourne dans le navigateur sur la clé de
  // l'utilisateur, rien ne nous est dû.
  it('voie clé perso : le provider crédités n’est jamais construit et /api/twin6/appel n’est jamais appelé', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('aucun fetch ne doit partir sur la voie clé perso')
    })
    const makeCreditsProvider = vi.fn(() => ({ name: 'twin6-credits', complete: async () => ({}) }))
    const deps = baseDeps({ makeCreditsProvider, fetchFn })
    render(<Twin6OuverteView deps={deps} />)

    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    fireEvent.change(screen.getByLabelText('Clé API Anthropic'), { target: { value: 'sk-ant-user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    // Gratuité prouvée : provider own-key construit, provider crédités jamais.
    expect(deps.makeOwnKeyProvider).toHaveBeenCalled()
    expect(makeCreditsProvider).not.toHaveBeenCalled()
    // Et aucun appel réseau facturable n'est parti (dont /api/twin6/appel).
    const urls = fetchFn.mock.calls.map(([u]) => String(u))
    expect(urls.filter((u) => u.includes('twin6/appel'))).toEqual([])
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    // Voie gratuite : le libellé de fin ne mentionne aucune contribution débitée.
    expect(screen.getByText(/avec votre clé/)).toBeDefined()
  })

  // Traçabilité — exigence utilisateur (credits-paypal, point 6) : garde-fou de
  // lancement — « n'accepter de lancer une cartographie sur NOTRE clé que si
  // les crédits restants couvrent le poids du portfolio (heuristique ~1 ko =
  // 1 USD) ». ROUGE-PRODUIT aujourd'hui : la voie crédits de Twin6 ne vérifie
  // PAS le solde avant de lancer — un run de 8 appels peut mourir en plein
  // milieu sur un 402. Comportement exigé : avec un portfolio de ~3 ko
  // (≈ 3 USD par l'heuristique) et un solde de 1 USD, le lancement est bloqué
  // AVANT tout appel, avec un message qui renvoie vers la recharge.
  it('voie crédits : solde insuffisant pour le poids du portfolio → lancement bloqué avant tout appel', async () => {
    const deps = baseDeps({
      // L'offre expose le solde prépayé (comme /api/twin9/meta le fournit déjà).
      fetchOffer: async () => ({ ...OFFER, solde_microusd: 1_000_000 }), // 1 USD
    })
    render(<Twin6OuverteView deps={deps} />)

    await screen.findByLabelText(/Votre portfolio/)
    // ~3 ko de portfolio ≈ 3 USD par l'heuristique 1 ko = 1 USD > solde (1 USD).
    const gros = `### 2026-01-05\n---\n${'Une journée détaillée avec des traces concrètes et datées. '.repeat(50)}`
    expect(gros.length).toBeGreaterThan(2900)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), { target: { value: gros } })

    // Voie crédits (défaut). Tenter de lancer : le garde-fou doit bloquer.
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    // Le moteur n'est JAMAIS lancé (aucun appel facturable ne part), et
    // l'utilisateur voit pourquoi (solde/crédit à recharger).
    expect(await screen.findByText(/solde insuffisant|rechargez|recharger/i)).toBeDefined()
    expect(deps.runEngine).not.toHaveBeenCalled()
  })

  // Clé supprimée entre-temps (ou serveur en erreur) : le run échoue proprement
  // (role=alert), le moteur n'est pas lancé, et l'utilisateur peut réessayer.
  it('échec de revealKey : erreur affichée (role=alert) et bouton de nouveau cliquable', async () => {
    const deps = baseDeps({
      listKeys: async () => [{ provider: 'anthropic', createdAt: '2026-07-15' }],
      revealKey: vi.fn(async () => {
        throw new ApiError('Aucune clé enregistrée pour ce fournisseur', 404)
      }),
    })
    render(<Twin6OuverteView deps={deps} />)
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    expect(await screen.findByRole('radio', { name: /clé Anthropic enregistrée/ })).toHaveProperty('checked', true)

    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Aucune clé enregistrée pour ce fournisseur')
    expect(deps.runEngine).not.toHaveBeenCalled()
    // Le verrou de lancement est relâché : l'utilisateur peut relancer.
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', false)
  })
})
