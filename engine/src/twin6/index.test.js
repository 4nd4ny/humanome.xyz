import { describe, it, expect, vi } from 'vitest'
import {
  executerTwin6,
  buildScanPolePrompt,
  buildKairosPrompt,
  extractJson,
  TWIN6_CALLS,
  twin6CallsFor,
  fichesPourTwin6,
  configurationTwin6,
  executionTwin6,
} from './index.js'
import { twin6ToMergeDocument } from './mapper.js'
import { validateDocument } from '../validation.js'
import { validateDocumentPourReferentiel } from '../conformite.js'
import { createMockProvider } from '../providers/mock.js'
import { OutputTruncatedError } from '../providers/errors.js'

const referentiel = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ code: `${n}.01`, nom: `Compétence ${n}.01`, pole: n })),
}

// carto_pole canonique pour le pôle N : une compétence attestée par une trace.
function cartoPoleFor(num) {
  return {
    poleNum: num,
    passagesSaillants: [{ pid: 1, feuille: '2026-02-10', extraitVerbatim: `Trace ${num}.`, contexte: 'projet', auteur: 'apprenant' }],
    competences: [
      {
        code: `${num}.01`,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Attestation ${num}.`, confianceFinale: 0.7 } },
        verdict: { statut: 'présence établie', nombrePreuves: 1, nombreIndices: 0, confiance: 0.7, motif: 'Trace concrète.', prescription: 'Poursuivre.' },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Pôle ${num}\n\nPrésent.`, portraitPole: '.' },
    auditPole: { competencesTotales: 1, presencesEtablies: 1 },
  }
}

const kairosOut = {
  kairos: { apprenant: { portrait: 'Profil.', formeProfil: 'Massifs.', syntheseCompleteMarkdown: '## Synthèse\n\nUn tout cohérent.' } },
  emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
}

const templates = {
  scanPole: 'Analyse le pôle ${POLE} en lisant P${POLE}.md.',
  kairos: 'Synthèse kairos des 7 carto_pole.',
  fiches: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, `Fiche du pôle ${n}`])),
}

/** Provider factice : renvoie le carto_pole du pôle demandé (déduit du prompt), puis le kairos. */
function mockProvider() {
  return {
    name: 'mock',
    complete: vi.fn(async ({ prompt }) => {
      const isKairos = prompt.includes('carto_P1')
      if (isKairos) {
        return { text: '```json\n' + JSON.stringify(kairosOut) + '\n```', usage: { inputTokens: 500, outputTokens: 200 }, model: 'mock-1', stopReason: 'end_turn' }
      }
      // Le prompt scan-pole contient « pôle N » après substitution de ${POLE}.
      const m = prompt.match(/Fiche des compétences du pôle (\d)/)
      const num = m ? Number(m[1]) : 1
      // Réponse volontairement bruitée (préambule + fence) pour tester extractJson.
      return { text: `Voici la cartographie.\n\n\`\`\`json\n${JSON.stringify(cartoPoleFor(num))}\n\`\`\`\nVoilà.`, usage: { inputTokens: 1000, outputTokens: 400 }, model: 'mock-1', stopReason: 'end_turn' }
    }),
  }
}

describe('executerTwin6', () => {
  it('enchaîne 7 scan-pole + 1 kairos et produit un cartographie-merge valide', async () => {
    const provider = mockProvider()
    const progress = []
    const meta = { journalId: 'run-twin6', sourceProtocole: 'twin6-ouverte@1.0.0', generatedAt: '2026-07-15T00:00:00' }
    const out = await executerTwin6({
      portfolio: '### 2026-02-10\n---\nJ’ai fait quelque chose de notable.',
      templates,
      referentiel,
      provider,
      model: 'claude-haiku-4-5-20251001',
      options: { onProgress: (p) => progress.push(p), meta },
    })

    expect(provider.complete).toHaveBeenCalledTimes(TWIN6_CALLS) // 8
    expect(out.calls).toHaveLength(8)
    expect(out.cartoPoles).toHaveLength(7)
    expect(out.usage).toEqual({ inputTokens: 7 * 1000 + 500, outputTokens: 7 * 400 + 200 })

    const res = validateDocument('cartographie-merge', out.document)
    expect(res.errors).toEqual([])
    expect(res.valid).toBe(true)
    expect(out.document.narratifs.kairosHtml).toContain('Un tout cohérent')

    // Progression : une entrée par pôle + kairos + done.
    expect(progress.at(-1)).toMatchObject({ phase: 'done', done: 8, total: 8 })
  })

  it('substitue ${POLE} par le numéro et attache fiche + portfolio', () => {
    const p = buildScanPolePrompt('Pôle ${POLE}, lis P${POLE}.md', 3, 'FICHE-3', 'PORTFOLIO-X')
    expect(p).toContain('Pôle 3, lis P3.md')
    expect(p).toContain('FICHE-3')
    expect(p).toContain('PORTFOLIO-X')
    expect(p).not.toContain('${POLE}')
  })

  it('extractJson tolère les fences et le préambule', () => {
    expect(extractJson('bla\n```json\n{"a":1}\n```\nfin')).toEqual({ a: 1 })
    expect(extractJson('{"b":2}')).toEqual({ b: 2 })
    expect(() => extractJson('aucun json ici')).toThrow(/aucun objet JSON/)
  })

  it('compte un scan par pôle et le kairos : RESPIRE v7, huit ; cinq pôles, six', () => {
    expect(twin6CallsFor(referentiel)).toBe(TWIN6_CALLS)
    expect(twin6CallsFor({ poles: [1, 2, 3, 4, 5].map((num) => ({ num })) })).toBe(6)
  })

  it('un autre référentiel : un scan par pôle avec la fiche écrite depuis son document, puis le kairos ; le document le nomme', async () => {
    const lettres = ['A', 'B', 'C', 'D', 'E']
    const lettre = {
      id: 'fictif-lettre',
      poles: lettres.map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}` })),
      competences: lettres.map((l, i) => ({ code: `${l}1`, nom: `Capacité fictive ${l}1`, pole: i + 1, description: `Définition fictive de ${l}1.` })),
    }
    const provider = {
      complete: vi.fn(async ({ prompt }) => {
        if (prompt.includes('## carto_P1')) {
          return { text: JSON.stringify(kairosOut), usage: { inputTokens: 5, outputTokens: 2 }, model: 'mock-1', stopReason: 'end_turn' }
        }
        const num = Number(/Fiche des compétences du pôle (\d+)/.exec(prompt)[1])
        const pole = { ...cartoPoleFor(num) }
        pole.competences = [{ ...pole.competences[0], code: `${lettres[num - 1]}1` }]
        return { text: JSON.stringify(pole), usage: { inputTokens: 10, outputTokens: 4 }, model: 'mock-1', stopReason: 'end_turn' }
      }),
    }
    // Les fiches du paquet (RESPIRE) ne nomment pas ses compétences : chacune s'écrit depuis le document.
    const fiches = fichesPourTwin6(lettre, templates.fiches)
    const out = await executerTwin6({
      portfolio: '### 2026-02-10\n---\nJ’ai fait quelque chose de notable.',
      templates: { ...templates, fiches },
      referentiel: lettre,
      provider,
      model: 'claude-haiku-4-5-20251001',
      options: { meta: { journalId: 'run-twin6', sourceProtocole: 'twin6-ouverte@1.0.0', generatedAt: '2026-07-15T00:00:00' } },
    })

    expect(provider.complete).toHaveBeenCalledTimes(twin6CallsFor(lettre))
    expect(out.calls.map((c) => c.etape)).toEqual(['scan-pole/1', 'scan-pole/2', 'scan-pole/3', 'scan-pole/4', 'scan-pole/5', 'kairos'])
    const premier = provider.complete.mock.calls[0][0].prompt
    expect(premier).toContain('# Pôle 1 — A · Pôle fictif A\n\n## A1 — Capacité fictive A1\n\nDéfinition fictive de A1.')
    expect(out.document.referentiel).toBe('fictif-lettre')
    expect(validateDocumentPourReferentiel('cartographie-merge', out.document, lettre).errors).toEqual([])
  })

  it('gabarits 1.1.0 : les variables du référentiel sont rendues avant tout appel, ${POLE} pôle par pôle', async () => {
    const lettres = ['A', 'B', 'C', 'D', 'E']
    const lettre = {
      id: 'fictif-lettre',
      poles: lettres.map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}` })),
      competences: lettres.map((l, i) => ({ code: `${l}1`, nom: `Capacité fictive ${l}1`, pole: i + 1 })),
    }
    const provider = {
      complete: vi.fn(async ({ prompt }) => {
        if (prompt.includes('## carto_P1')) {
          return { text: JSON.stringify(kairosOut), usage: {}, model: 'mock-1', stopReason: 'end_turn' }
        }
        const num = Number(/Fiche des compétences du pôle (\d+)/.exec(prompt)[1])
        const pole = { ...cartoPoleFor(num) }
        pole.competences = [{ ...pole.competences[0], code: `${lettres[num - 1]}1` }]
        return { text: JSON.stringify(pole), usage: {}, model: 'mock-1', stopReason: 'end_turn' }
      }),
    }
    const lisants = {
      scanPole: "Le pôle ${POLE}, un des ${NB_POLES} pôles du référentiel ${REFERENTIEL} ; codes `${FORMAT_CODE}`${PRECISION_FORMAT_CODE}, ex. ${CODES_EXEMPLE}.",
      kairos: 'Les ${NB_POLES} carto_P[1..${NB_POLES}], les ${NB_COMPETENCES} verdicts, codes ${FORMAT_CODE}.',
      fiches: fichesPourTwin6(lettre, templates.fiches),
    }
    await executerTwin6({ portfolio: 'x', templates: lisants, referentiel: lettre, provider, model: 'm' })

    const prompts = provider.complete.mock.calls.map(([params]) => params.prompt)
    expect(prompts[2].startsWith('Le pôle 3, un des 5 pôles du référentiel fictif-lettre ; codes `XY`, ex. A1, B1, C1 et D1.')).toBe(true)
    expect(prompts[5].startsWith('Les 5 carto_P[1..5], les 5 verdicts, codes XY.')).toBe(true)
    for (const prompt of prompts) expect(prompt).not.toContain('${')
  })

  it('échoue explicitement sur une sortie tronquée (max_tokens)', async () => {
    const provider = { complete: vi.fn(async () => ({ text: '{}', usage: {}, model: 'm', stopReason: 'max_tokens' })) }
    await expect(
      executerTwin6({ portfolio: 'x', templates, referentiel, provider, model: 'm' }),
    ).rejects.toThrow(/tronquée/)
  })

  it('sortie tronquée levée par le fournisseur : erreur nommant l’étape, usage du run (appel tronqué compris), aucun nouvel essai', async () => {
    const pole = (num) => JSON.stringify(cartoPoleFor(num))
    // Pôles 1 et 2 aboutis, pôle 3 coupé (le fournisseur lève, comme createProvider).
    const provider = createMockProvider({
      responses: ({ prompt }) => pole(Number(/Fiche des compétences du pôle (\d)/.exec(prompt)[1])),
      usage: { inputTokens: 100, outputTokens: 40 },
      stopReason: (_params, i) => (i === 2 ? 'max_tokens' : 'end'),
    })
    const failure = await executerTwin6({ portfolio: 'x', templates, referentiel, provider, model: 'm', options: { maxTokens: 64 } })
      .catch((e) => e)

    expect(failure).toBeInstanceOf(OutputTruncatedError)
    expect(failure.message).toMatch(/^executerTwin6: sortie tronquée \(max_tokens\) à l'étape scan-pole\/3 — réponse tronquée : budget de sortie atteint \(max_tokens = 64\)/)
    expect(failure).toMatchObject({
      etape: 'scan-pole/3',
      provider: 'mock',
      maxTokens: 64,
      usage: { inputTokens: 100, outputTokens: 40 },
      usageRun: { inputTokens: 300, outputTokens: 120 },
    })
    expect(failure.calls.map((c) => [c.etape, c.stopReason])).toEqual([
      ['scan-pole/1', 'end'],
      ['scan-pole/2', 'end'],
      ['scan-pole/3', 'max_tokens'],
    ])
    expect(failure.cause).toBeInstanceOf(OutputTruncatedError)
    expect(provider.callCount).toBe(3)
  })

  it('fenêtre de contexte pleine (fournisseur injecté) : même échec explicite', async () => {
    const provider = { name: 'inj', complete: vi.fn(async () => ({ text: '{', usage: { inputTokens: 9, outputTokens: 1 }, model: 'm', stopReason: 'context_window', truncated: true })) }
    const failure = await executerTwin6({ portfolio: 'x', templates, referentiel, provider, model: 'm' }).catch((e) => e)
    expect(failure).toBeInstanceOf(OutputTruncatedError)
    expect(failure.message).toBe("executerTwin6: sortie tronquée (context_window) à l'étape scan-pole/1")
    expect(failure).toMatchObject({ etape: 'scan-pole/1', limit: 'contexte', usageRun: { inputTokens: 9, outputTokens: 1 } })
  })

  it('refus du fournisseur : erreur explicite (code refus) au lieu d’un échec d’extractJson sur un texte vide', async () => {
    const provider = createMockProvider({ responses: '', usage: { inputTokens: 7, outputTokens: 0 }, stopReason: 'refusal' })
    const failure = await executerTwin6({ portfolio: 'x', templates, referentiel, provider, model: 'm' }).catch((e) => e)
    expect(failure.message).toBe("executerTwin6: le fournisseur a refusé de répondre à l'étape scan-pole/1")
    expect(failure).toMatchObject({
      code: 'refus',
      status: 200,
      retryable: false,
      etape: 'scan-pole/1',
      usageRun: { inputTokens: 7, outputTokens: 0 },
    })
    expect(failure.calls).toEqual([
      { etape: 'scan-pole/1', usage: { inputTokens: 7, outputTokens: 0 }, model: 'm', stopReason: 'refusal', stopReasonRaw: 'refusal' },
    ])
    expect(provider.callCount).toBe(1)
  })

  it('chaque appel consigne son arrêt (stopReason, stopReasonRaw)', async () => {
    const out = await executerTwin6({ portfolio: 'x', templates, referentiel, provider: mockProvider(), model: 'm' })
    expect(out.calls[0]).toEqual({
      etape: 'scan-pole/1',
      usage: { inputTokens: 1000, outputTokens: 400 },
      model: 'mock-1',
      stopReason: 'end_turn',
      stopReasonRaw: null,
    })
  })
})

// Le bloc configuration/execution du document exporté (2026-10-22, docs/contrats.md §4 point 8).
describe('executerTwin6 — configuration et exécution du run', () => {
  const portfolio = '### 2026-02-10\n---\nJ’ai fait quelque chose de notable.'
  const meta = { journalId: 'twin6-ouverte', sourceProtocole: 'twin6-ouverte@1.1.0', generatedAt: '2026-07-15T00:00:00' }
  // Ce que la vue passe (Twin6OuverteView) : valeurs INVENTÉES.
  const donnees = {
    paquet: { id: 'twin6-ouverte', version: '1.1.0', sha256: 'abcdef0123456789'.repeat(4) },
    referentiel: { id: 'respire', version: '7.0.0', contentHash: '0123456789abcdef'.repeat(4), structure: 'meta' },
    fiches: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), 'paquet'])),
    acces: 'credits',
  }
  /** Une horloge qui avance d'une minute à chaque lecture. */
  const horloge = () => {
    let minute = 0
    return vi.fn(() => new Date(Date.UTC(2026, 6, 15, 10, minute++, 0)))
  }
  /** Le fournisseur des crédits, simulé : Anthropic par le serveur, outil forcé, modèle servi daté. */
  const credits = () => {
    const base = mockProvider()
    return {
      name: 'twin6-credits',
      fournisseur: 'anthropic',
      transport: 'proxy',
      complete: vi.fn(async (params) => ({
        ...(await base.complete(params)),
        model: 'claude-sonnet-5-20261001',
        stopReason: 'end',
        stopReasonRaw: 'tool_use',
        truncated: false,
      })),
    }
  }

  it('sans configuration : le document d’hier à l’octet (1.0.0), sans lire l’horloge', async () => {
    const now = horloge()
    const out = await executerTwin6({ portfolio, templates, referentiel, provider: mockProvider(), model: 'm', options: { meta, now } })
    expect(out.document.schemaVersion).toBe('1.0.0')
    expect(out.document).not.toHaveProperty('configuration')
    expect(out.document).not.toHaveProperty('execution')
    expect(JSON.stringify(out.document)).toBe(JSON.stringify(twin6ToMergeDocument(out.cartoPoles, out.kairos, referentiel, meta)))
    expect(now).not.toHaveBeenCalled()
  })

  it('avec configuration : le bloc complété par le moteur, l’exécution tirée des appels, 1.1.0, document valide', async () => {
    const now = horloge()
    const out = await executerTwin6({
      portfolio,
      templates,
      referentiel,
      provider: credits(),
      model: 'claude-sonnet-5',
      options: { meta, now, configuration: donnees },
    })
    const { document } = out

    expect(document.schemaVersion).toBe('1.1.0')
    expect(document.configuration).toEqual({
      schema: 'twin6-configuration/1',
      moteur: 'twin6',
      ...donnees,
      fournisseur: 'anthropic',
      voie: 'directe',
      transport: 'proxy',
      modele: 'claude-sonnet-5',
      maxTokens: 128000, // tout ce que Sonnet 5 peut rendre (sortieMaxAnthropic)
      temperature: null,
      rgpd: 'sous_conditions',
    })
    expect(Object.keys(document.configuration)).toEqual([
      'schema', 'moteur', 'paquet', 'referentiel', 'fiches', 'fournisseur', 'voie', 'acces', 'transport',
      'modele', 'maxTokens', 'temperature', 'rgpd',
    ])
    expect(document.execution).toEqual({
      schema: 'twin6-execution/1',
      debut: '2026-07-15T10:00:00',
      fin: '2026-07-15T10:01:00',
      appels: out.calls.map((c) => ({
        etape: c.etape,
        modele: 'claude-sonnet-5-20261001',
        stopReason: 'end',
        stopReasonRaw: 'tool_use',
        inputTokens: c.etape === 'kairos' ? 500 : 1000,
        outputTokens: c.etape === 'kairos' ? 200 : 400,
      })),
      usage: out.usage,
      modelesServis: ['claude-sonnet-5-20261001'],
      coutMicrousd: null,
    })
    expect(document.execution.appels.map((a) => a.etape)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `scan-pole/${n}`).concat('kairos'))
    expect(now).toHaveBeenCalledTimes(2)

    const res = validateDocument('cartographie-merge', document)
    expect(res.errors).toEqual([])
    expect(validateDocumentPourReferentiel('cartographie-merge', document, referentiel).errors).toEqual([])

    // Sans ses deux blocs, et en 1.0.0, c'est le document d'un run sans configuration, à l'octet.
    const sans = await executerTwin6({ portfolio, templates, referentiel, provider: credits(), model: 'claude-sonnet-5', options: { meta } })
    const { configuration: _c, execution: _e, ...reste } = document
    expect(JSON.stringify({ ...reste, schemaVersion: '1.0.0' })).toBe(JSON.stringify(sans.document))
  })

  it('le budget de sortie résolu et la température demandée ; la liste blanche ne laisse rien passer d’autre', async () => {
    const debordant = {
      ...donnees,
      paquet: { ...donnees.paquet, templates: { scanPole: 'texte du gabarit' } },
      referentiel: { ...donnees.referentiel, poles: [{ num: 1 }] },
      cle: 'valeur-fictive',
      fournisseur: 'openai',
    }
    const out = await executerTwin6({
      portfolio,
      templates,
      referentiel,
      provider: credits(),
      model: 'claude-haiku-4-5-20251001',
      options: { meta, now: horloge(), configuration: debordant, maxTokens: 4096, temperature: 0.2 },
    })
    const { configuration } = out.document
    expect(configuration).toMatchObject({ maxTokens: 4096, temperature: 0.2, fournisseur: 'anthropic', modele: 'claude-haiku-4-5-20251001' })
    expect(configuration.paquet).toEqual(donnees.paquet)
    expect(configuration.referentiel).toEqual(donnees.referentiel)
    expect(configuration).not.toHaveProperty('cle')
    expect(JSON.stringify(out.document)).not.toContain('texte du gabarit')
    expect(JSON.stringify(out.document)).not.toContain('valeur-fictive')

    // Sans maxTokens : celui du modèle (Haiku 4.5 : 64 000).
    const defaut = await executerTwin6({
      portfolio, templates, referentiel, provider: credits(), model: 'claude-haiku-4-5-20251001',
      options: { meta, now: horloge(), configuration: donnees },
    })
    expect(defaut.document.configuration.maxTokens).toBe(64000)
  })

  it('un fournisseur injecté : tag et transport lus au registre et au handle, inconnus → null ; ses arrêts bruts sont classés', async () => {
    // La clé personnelle : createProvider (nom = fournisseur), transport direct ; arrêt brut rendu tel quel.
    const direct = { ...mockProvider(), name: 'anthropic', transport: 'direct' }
    const out = await executerTwin6({
      portfolio, templates, referentiel, provider: direct, model: 'claude-sonnet-5',
      options: { meta, now: horloge(), configuration: { ...donnees, acces: 'cle_perso' } },
    })
    expect(out.document.configuration).toMatchObject({ fournisseur: 'anthropic', transport: 'direct', acces: 'cle_perso', rgpd: 'sous_conditions' })
    // `end_turn` en guise de classe : Anthropic le range en fin ; aucune valeur brute donnée.
    expect(out.document.execution.appels[0]).toMatchObject({ modele: 'mock-1', stopReason: 'end', stopReasonRaw: null })
    expect(out.calls[0].stopReason).toBe('end_turn') // les appels rendus restent tels quels
    expect(validateDocument('cartographie-merge', out.document).errors).toEqual([])

    // Un double que le registre ne connaît pas : rien n'est deviné.
    const inconnu = await executerTwin6({
      portfolio, templates, referentiel, provider: mockProvider(), model: 'm',
      options: { meta, now: horloge(), configuration: donnees },
    })
    expect(inconnu.document.configuration).toMatchObject({ fournisseur: null, transport: null, rgpd: null })
    expect(inconnu.document.execution.appels[0]).toMatchObject({ stopReason: 'other', stopReasonRaw: null })
    expect(validateDocument('cartographie-merge', inconnu.document).errors).toEqual([])
  })

  it('les tags de chaque fournisseur, et une valeur brute qui n’est pas un identifiant court', () => {
    const run = (name) => configurationTwin6(donnees, { provider: { name, transport: 'direct' }, model: 'x', maxTokens: 1 })
    expect(['anthropic', 'openai', 'google', 'xai', 'openrouter', 'ollama'].map((n) => run(n).rgpd)).toEqual([
      'sous_conditions', 'sous_conditions', 'non', 'non', 'non', 'local',
    ])
    expect(run('mistral').rgpd).toBe('oui')
    const execution = executionTwin6(
      [{ etape: 'kairos', usage: { inputTokens: 3, outputTokens: -1 }, model: '', stopReason: 'max_tokens', stopReasonRaw: 'une phrase' }],
      { debut: 'a', fin: 'b', fournisseur: 'anthropic' },
    )
    expect(execution.appels).toEqual([{ etape: 'kairos', modele: null, stopReason: 'max_tokens', stopReasonRaw: 'other', inputTokens: 3, outputTokens: 0 }])
    expect(execution.modelesServis).toEqual([])
  })

  it('l’essai : modèle demandé « demo », le modèle servi dans l’exécution', async () => {
    const demo = {
      name: 'anthropic',
      transport: 'proxy',
      complete: vi.fn(async (params) => ({ ...(await mockProvider().complete(params)), model: 'claude-haiku-5-5', stopReason: 'end', stopReasonRaw: 'tool_use' })),
    }
    const out = await executerTwin6({
      portfolio, templates, referentiel, provider: demo, model: 'demo',
      options: { meta, now: horloge(), configuration: { ...donnees, acces: 'essai' } },
    })
    expect(out.document.configuration).toMatchObject({ modele: 'demo', acces: 'essai', transport: 'proxy', maxTokens: 64000 })
    expect(out.document.execution.modelesServis).toEqual(['claude-haiku-5-5'])
    expect(validateDocument('cartographie-merge', out.document).errors).toEqual([])
  })
})
