import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import Twin6OuverteView, { portfolioEnFeuilles } from './Twin6OuverteView.jsx'
import { UiModeContext } from '../lib/ui-mode.js'
import { createMemoryAdapter, createPortfolioStore } from '../lib/portfolio-store.js'
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
  sha256: 'abcdef0123456789'.repeat(4), // inventée
  templates: { scanPole: 'SCAN ${POLE}', kairos: 'KAIROS', fiches: { 1: '# Pôle 1 — TÊTE\n\n## 1.01 — Pensée\n' } },
}
const OFFER = {
  modeles: { 'claude-sonnet-5': [2.2, 11] },
  referentiel: [{ num: 1, nom: 'TÊTE — Penser & Comprendre', competences: [{ code: '1.01', nom: 'Pensée' }] }],
  // Compte financé par défaut : un run sur crédits réussit (le garde-fou de
  // solde ne bloque pas). Le test « solde insuffisant » abaisse ce solde à 1 USD.
  solde_microusd: 100_000_000,
}

// La version publiée de RESPIRE, FICTIVE : la même structure que /meta (un pôle, une compétence).
const RESPIRE = {
  id: 'respire', version: '7.0.0', label: 'RESPIRE v7', contentHash: '0123456789abcdef'.repeat(4), // inventée
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

/** Le fournisseur de la démo, simulé : une preuve résolue d'avance, puis le moteur l'appelle. */
function demoFactoryFake(journal = []) {
  return vi.fn(() => ({
    provider: { name: 'anthropic', transport: 'proxy', complete: async () => ({}) },
    prime: vi.fn(async () => journal.push('prime')),
  }))
}

const PORTFOLIO_COURT = '### 2026-01-05\n---\nAujourd’hui j’ai réparé l’horloge et réfléchi à ma méthode de travail.'

describe('Twin6OuverteView', () => {
  it('un visiteur : l’essai gratuit seul, sans offre ni clés, et l’invitation à se connecter pour les autres voies', async () => {
    const fetchOffer = vi.fn(async () => OFFER)
    const listKeys = vi.fn(async () => [])
    render(<Twin6OuverteView deps={baseDeps({ fetchMeFn: async () => ({ user: null }), fetchOffer, listKeys })} />)

    expect(await screen.findByLabelText(/Votre portfolio/)).toBeDefined()
    expect(screen.getByRole('radio', { name: /Essai gratuit/ }).checked).toBe(true)
    expect(screen.queryByRole('radio', { name: /Avec nos crédits/ })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Avec ma propre clé API/ })).toBeNull()
    expect(screen.queryByLabelText('Modèle')).toBeNull() // le serveur de la démo impose le sien
    expect(screen.getByRole('link', { name: 'Connectez-vous' }).getAttribute('href')).toBe('#/compte')
    expect(screen.getByTestId('twin6-compteur').textContent).toBe('0 / 5 000 caractères (essai gratuit)')
    expect(fetchOffer).not.toHaveBeenCalled() // /api/twin9/meta exige une session
    expect(listKeys).not.toHaveBeenCalled()
  })

  it('un visiteur lance l’essai : la première preuve est résolue avant le moteur, qui reçoit le fournisseur de la démo et le document publié', async () => {
    const journal = []
    const makeDemoProvider = demoFactoryFake(journal)
    const runEngine = vi.fn(async () => {
      journal.push('moteur')
      return { document: MERGE_DOC, calls: new Array(2).fill(0) }
    })
    const deps = baseDeps({ fetchMeFn: async () => ({ user: null }), makeDemoProvider, runEngine })
    render(<Twin6OuverteView deps={deps} />)

    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), { target: { value: PORTFOLIO_COURT } })
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(runEngine).toHaveBeenCalledTimes(1))
    expect(journal).toEqual(['prime', 'moteur'])
    const arg = runEngine.mock.calls[0][0]
    expect(arg.provider).toBe(makeDemoProvider.mock.results[0].value.provider)
    expect(arg.model).toBe('demo') // une indication : le proxy impose son modèle
    // Sans /meta, le run lit le document publié de RESPIRE (RG9).
    expect(arg.referentiel.poles).toEqual([{ num: 1, nom: 'TETE — Penser & Comprendre' }])
    // La configuration du document : l'essai (la voie « demo » de la vue), la structure lue dans le document.
    expect(arg.options.configuration).toMatchObject({
      acces: 'essai',
      referentiel: { id: 'respire', version: '7.0.0', contentHash: RESPIRE.contentHash, structure: 'document' },
    })
    expect(deps.makeOwnKeyProvider).not.toHaveBeenCalled()
    expect((await screen.findByText(/Cartographie ouverte terminée/)).textContent).toBe(
      'Cartographie ouverte terminée (essai gratuit).',
    )
  })

  it('essai gratuit : au-delà de 5 000 caractères, lancement impossible et ce qu’il faut retirer', async () => {
    const makeDemoProvider = demoFactoryFake()
    render(<Twin6OuverteView deps={baseDeps({ fetchMeFn: async () => ({ user: null }), makeDemoProvider })} />)

    const textarea = await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(textarea, { target: { value: `${PORTFOLIO_COURT} ${'x'.repeat(5000)}` } })
    const bouton = await screen.findByRole('button', { name: 'Lancer la cartographie ouverte' })
    expect(bouton.disabled).toBe(true)
    expect(screen.getByText(/Trop long pour l’essai gratuit/).textContent).toContain(
      `(retirez-en ${String(PORTFOLIO_COURT.length + 1).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')})`,
    )

    fireEvent.change(textarea, { target: { value: `${PORTFOLIO_COURT} ${'x'.repeat(4999 - PORTFOLIO_COURT.length)}` } })
    expect(screen.getByTestId('twin6-compteur').textContent).toBe('5 000 / 5 000 caractères (essai gratuit)')
    await waitFor(() => expect(bouton.disabled).toBe(false))
    expect(makeDemoProvider).not.toHaveBeenCalled()
  })

  it('essai gratuit épuisé (503) : le message de la démo, et le bouton de nouveau cliquable', async () => {
    const err = Object.assign(new Error('provider proxy : HTTP 503'), { status: 503 })
    const runEngine = vi.fn(async () => {
      throw err
    })
    render(
      <Twin6OuverteView
        deps={baseDeps({ fetchMeFn: async () => ({ user: null }), makeDemoProvider: demoFactoryFake(), runEngine })}
      />,
    )
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), { target: { value: PORTFOLIO_COURT } })
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la cartographie ouverte' }))

    expect((await screen.findByRole('alert')).textContent).toContain('La démo est épuisée pour aujourd’hui')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false),
    )
  })

  it('un compte peut aussi choisir l’essai gratuit : le choix du modèle disparaît, le fournisseur de la démo sert', async () => {
    const makeDemoProvider = demoFactoryFake()
    const deps = baseDeps({ makeDemoProvider })
    render(<Twin6OuverteView deps={deps} />)

    expect(await screen.findByLabelText('Modèle')).toBeDefined()
    fireEvent.click(screen.getByRole('radio', { name: /Essai gratuit/ }))
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Connectez-vous' })).toBeNull()
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), { target: { value: PORTFOLIO_COURT } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    expect(deps.runEngine.mock.calls[0][0].provider).toBe(makeDemoProvider.mock.results[0].value.provider)
    expect(deps.runEngine.mock.calls[0][0].options.configuration.acces).toBe('essai')
    expect(deps.makeOwnKeyProvider).not.toHaveBeenCalled()
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
    // Ce que la vue seule sait de la configuration du run (docs/contrats.md §4 point 8) : le
    // paquet et l'empreinte de ses octets, le référentiel choisi (son document fait foi ; ses
    // pôles lus dans /meta), l'origine de la fiche, l'accès ; le moteur complète le reste.
    expect(arg.options.configuration).toEqual({
      paquet: { id: 'twin6-ouverte', version: '1.0.0', sha256: PKG.sha256 },
      referentiel: { id: 'respire', version: '7.0.0', contentHash: RESPIRE.contentHash, structure: 'meta' },
      fiches: { 1: 'paquet' },
      acces: 'credits',
    })
    // Les bornes de l'exécution suivent l'horloge de generatedAt.
    expect(arg.options.now).toBe(deps.now)

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
    expect(deps.loadReferentiel.mock.calls[0][0]).toEqual({ id: 'respire' }) // la dernière version publiée de RESPIRE (la base d'abord, S5)
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
    // Sa structure et ses fiches viennent de son document ; il ne porte pas d'empreinte : null, non devinée.
    expect(arg.options.configuration).toMatchObject({
      referentiel: { id: 'fictif-lettre', version: '1.0.0', contentHash: null, structure: 'document' },
      fiches: { 1: 'document', 2: 'document' },
    })
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
    // La version choisie (8.0.0), lue dans son document ; la fiche du pôle 1 reste celle du paquet.
    expect(deps.runEngine.mock.calls[0][0].options.configuration).toMatchObject({
      referentiel: { id: 'respire', version: '8.0.0', structure: 'document' },
      fiches: { 1: 'paquet', 2: 'document' },
    })
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
    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    // L'accès, sans rien de la clé.
    const { configuration } = deps.runEngine.mock.calls[0][0].options
    expect(configuration.acces).toBe('cle_perso')
    expect(JSON.stringify(configuration)).not.toContain('sk-ant')
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

// Mode simple du site (lib/ui-mode.js, 2026-10-22) : pas de liste des modèles,
// le modèle cible du paquet ; rendu seul, la vue reste en mode expert.
describe('Twin6OuverteView — mode simple', () => {
  it('ni liste des modèles ni champ « Modèle » : le modèle cible du paquet, nommé et passé au moteur ; le référentiel reste au choix', async () => {
    const runEngine = vi.fn(async () => ({ document: MERGE_DOC, calls: new Array(8).fill(0) }))
    const offer = { ...OFFER, modeles: { 'claude-sonnet-5': [2.2, 11], 'claude-haiku-5-5': [1.1, 5.5] } }
    render(
      <UiModeContext.Provider value={{ expert: false, setExpert() {} }}>
        <Twin6OuverteView deps={baseDeps({ runEngine, fetchOffer: async () => offer, listReferentiels: async () => LISTE })} />
      </UiModeContext.Provider>,
    )
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), { target: { value: PORTFOLIO_COURT } })
    expect(screen.queryByLabelText('Modèle')).toBeNull()
    expect(screen.getByTestId('twin6-modele-defaut').textContent).toContain('claude-sonnet-5')
    expect((await screen.findByRole('combobox', { name: 'Référentiel' })).value).toBe('respire@7.0.0')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
    await screen.findByText(/Cartographie ouverte terminée/)
    expect(runEngine.mock.calls[0][0].model).toBe('claude-sonnet-5')
  })

  it('rendue seule (contexte par défaut) : la liste des modèles est proposée', async () => {
    render(<Twin6OuverteView deps={baseDeps()} />)
    fireEvent.change(await screen.findByLabelText(/Votre portfolio/), { target: { value: PORTFOLIO_COURT } })
    expect(screen.getByLabelText('Modèle').value).toBe('claude-sonnet-5')
    expect(screen.queryByTestId('twin6-modele-defaut')).toBeNull()
  })
})

// Mes portfolios (sprint 1, amélioration 11) : un portfolio du module
// portfolio remplit la zone de saisie, en feuilles « ### AAAA-MM-JJ ».
describe('Twin6OuverteView — mes portfolios', () => {
  it('portfolioEnFeuilles : texte déjà en feuilles repris tel quel ; sinon une feuille par journée datée, les passages non datés comptés et laissés de côté', () => {
    expect(portfolioEnFeuilles({ texte: PORTFOLIO_COURT, segments: [] })).toEqual({ texte: PORTFOLIO_COURT, journees: 1, nonDates: 0 })
    const deux = '### 2026-01-05\n---\nUn.\n\n### 2026-01-06\nDeux.\n\n### 2026-01-05\nUn bis.'
    expect(portfolioEnFeuilles({ texte: deux }).journees).toBe(2)
    expect(
      portfolioEnFeuilles({
        texte: 'brut sans feuille',
        segments: [
          { date: null, texte: 'Préambule.' },
          { date: '2026-01-06', texte: '06/01/2026\nDeux.\n' },
          { date: '2026-01-05', texte: '05/01/2026\nUn.' },
          { date: '2026-01-06', texte: 'Deux, suite.' },
          { date: null, texte: '   ' },
        ],
      }),
    ).toEqual({
      texte: '### 2026-01-05\n---\n05/01/2026\nUn.\n\n### 2026-01-06\n---\n06/01/2026\nDeux.\n\n\nDeux, suite.',
      journees: 2,
      nonDates: 1,
    })
    expect(portfolioEnFeuilles({ texte: 'rien', segments: [{ date: null, texte: 'rien' }] })).toEqual({ texte: '', journees: 0, nonDates: 1 })
    expect(portfolioEnFeuilles(null)).toEqual({ texte: '', journees: 0, nonDates: 0 })
  })

  it('la liste propose les portfolios de ce navigateur ; en choisir un remplit la zone de saisie ; un magasin illisible ne montre pas de liste', async () => {
    const portfolioStore = createPortfolioStore(createMemoryAdapter())
    await portfolioStore.create({ titre: 'Journal', texte: PORTFOLIO_COURT, segments: [] })
    render(<Twin6OuverteView deps={baseDeps({ portfolioStore })} />)
    const choix = await screen.findByLabelText('Partir d’un de mes portfolios')
    fireEvent.change(choix, { target: { value: choix.options[1].value } })
    expect(screen.getByLabelText(/Votre portfolio/).value).toBe(PORTFOLIO_COURT)
    expect(screen.getByTestId('twin6-reprise').textContent).toBe('« Journal » : 1 journée datée, en feuilles ### AAAA-MM-JJ.')
    cleanup()

    const illisible = { list: async () => { throw new Error('IndexedDB indisponible') } }
    render(<Twin6OuverteView deps={baseDeps({ portfolioStore: illisible })} />)
    await screen.findByLabelText(/Votre portfolio/)
    expect(screen.queryByLabelText('Partir d’un de mes portfolios')).toBeNull()
  })
})
