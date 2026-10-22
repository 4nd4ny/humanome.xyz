import { describe, it, expect, vi } from 'vitest'
import { executerTwin6, buildScanPolePrompt, buildKairosPrompt, extractJson, TWIN6_CALLS, twin6CallsFor, fichesPourTwin6 } from './index.js'
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
