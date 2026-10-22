// Tests de l'étage C — extraction journalière (prompts recréés, sans oracle :
// vérification structurelle uniquement, cf. plan-portage-moteur).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createMockProvider } from '../providers/mock.js'
import { OutputTruncatedError } from '../providers/errors.js'
import {
  ATTAQUES,
  RAISON_COURT_CIRCUIT,
  buildExtractionPrompt,
  buildKairosExtractionPrompt,
  extractDay,
  parseExtractionResponse,
  restreindreReferentiel,
} from './extract.js'
import { validateDocumentPourReferentiel } from '../conformite.js'

const referentiel = JSON.parse(
  readFileSync(new URL('../../../schemas/fixtures/referentiel-respire-v7.json', import.meta.url), 'utf8'),
)

const DAY_TEXT = 'Aujourd’hui j’ai vérifié la date de la halle aux archives municipales.'
const DATE = '2026-01-05'

/** Réponse pôle minimale mais valide : toutes les compétences court-circuitées. */
function minimalPoleResponse(num) {
  const comps = referentiel.competences
    .filter((c) => c.pole === num)
    .sort((a, b) => (a.code < b.code ? -1 : 1))
  return {
    poleNum: String(num),
    passagesSaillants: [],
    competences: comps.map((c) => ({
      code: c.code,
      courtCircuit: true,
      pieces: [],
      pedagogue: null,
      tracesRetenues: [],
      verdict: {
        statut: 'présence non établie',
        nombrePreuves: 0,
        nombreIndices: 0,
        confiance: 1,
        raison: RAISON_COURT_CIRCUIT,
        prescriptionMinimale: 'Documenter une situation concrète dans une prochaine feuille.',
      },
    })),
    auditPole: {
      competencesTotales: comps.length,
      courtCircuits: comps.length,
      competencesNonCourtCircuit: 0,
      presencesEtablies: 0,
      renvoisCartographe: 0,
      nonEtablies: comps.length,
    },
    rapport: null,
  }
}

function poleOfPrompt(prompt) {
  if (prompt.includes('SYNTHÈSE KAIROS')) return null
  return Number(prompt.match(/# Pôle (\d) — /)[1])
}

describe('buildExtractionPrompt', () => {
  const prompt = buildExtractionPrompt({ referentiel, poleNum: 1, dayText: DAY_TEXT, date: DATE })

  it('porte la date (ISO + français), le texte du jour et le pôle', () => {
    expect(prompt).toContain('2026-01-05')
    expect(prompt).toContain('05/01/2026')
    expect(prompt).toContain(DAY_TEXT)
    expect(prompt).toContain('# Pôle 1 — TETE')
  })

  it('liste toutes les compétences du pôle et seulement lui', () => {
    for (const c of referentiel.competences.filter((c) => c.pole === 1)) {
      expect(prompt).toContain(`${c.code} — ${c.nom}`)
    }
    expect(prompt).not.toContain('2.01 —')
  })

  it('décrit le protocole adversarial complet et la typologie a..h', () => {
    for (const marker of [
      'LE GREFFIER', 'presomptionAbsence', 'presomptionSycophantie', 'conclusionAdversariale',
      'attaqueDominante', 'tracesRetenues', 'auditPole', 'rapportCompletMarkdown',
      'présence établie', 'renvoi au cartographe', 'présence non établie',
      RAISON_COURT_CIRCUIT,
    ]) {
      expect(prompt).toContain(marker)
    }
    for (const [lettre, { nom }] of Object.entries(ATTAQUES)) {
      expect(prompt).toContain(`${lettre} — ${nom}`)
    }
  })

  it('exige une sortie JSON stricte avec un gabarit parsable', () => {
    expect(prompt).toContain('JSON strict')
    expect(prompt).toContain('"poleNum": "1"')
    expect(prompt).toContain('"verdictAttaque"')
  })

  it('rejette un pôle inconnu et des entrées manquantes', () => {
    expect(() => buildExtractionPrompt({ referentiel, poleNum: 9, dayText: DAY_TEXT, date: DATE }))
      .toThrow(/poleNum 9/)
    expect(() => buildExtractionPrompt({ referentiel, poleNum: 1, dayText: '', date: DATE }))
      .toThrow(/dayText/)
    expect(() => buildExtractionPrompt({ referentiel, poleNum: 1, dayText: DAY_TEXT, date: '05/01/2026' }))
      .toThrow(/AAAA-MM-JJ/)
    expect(() => buildExtractionPrompt({ poleNum: 1, dayText: DAY_TEXT, date: DATE }))
      .toThrow(/referentiel/)
  })
})

describe('buildKairosExtractionPrompt', () => {
  const prompt = buildKairosExtractionPrompt({ referentiel, dayText: DAY_TEXT, date: DATE })

  it('référence les 7 pôles, le texte du jour et les attendus kairos', () => {
    for (let n = 1; n <= 7; n++) expect(prompt).toContain(`Pôle ${n} — `)
    expect(prompt).toContain(DAY_TEXT)
    for (const marker of [
      'SYNTHÈSE KAIROS', 'formeProfil', 'ceQuiRelieLesPoles', 'ceQuiEmergeEntreLesLignes',
      'invitationsPourLaSuite', 'syntheseCompleteMarkdown', 'connexionsTransversales',
      'noeudsConceptuels', 'competencesOrphelines',
    ]) {
      expect(prompt).toContain(marker)
    }
  })
})

describe('parseExtractionResponse', () => {
  it('parse un objet JSON nu', () => {
    expect(parseExtractionResponse('{"a": 1}')).toEqual({ a: 1 })
  })

  it('parse un bloc ```json et ignore la prose autour', () => {
    expect(parseExtractionResponse('Voici :\n```json\n{"a": 1}\n```\nVoilà.')).toEqual({ a: 1 })
    expect(parseExtractionResponse('Réponse : {"a": {"b": 2}} — fin.')).toEqual({ a: { b: 2 } })
  })

  it('répare les virgules terminales', () => {
    expect(parseExtractionResponse('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } })
  })

  it('accepte le littéral null (kairos absent)', () => {
    expect(parseExtractionResponse('null')).toBeNull()
  })

  it('rejette les JSON non-objets et l’absence de JSON avec une erreur claire', () => {
    expect(() => parseExtractionResponse('[1, 2]')).toThrow(/objet attendu/)
    expect(() => parseExtractionResponse('Aucun JSON ici.')).toThrow(/aucun JSON valide.*Aucun JSON ici/s)
    expect(() => parseExtractionResponse(42)).toThrow(TypeError)
  })

  it('ne corrompt jamais une virgule terminale DANS une chaîne', () => {
    // Une regex naïve transformerait "x, ]" en "x]" — corruption silencieuse.
    expect(parseExtractionResponse('{"a": "x, ]" ,}')).toEqual({ a: 'x, ]' })
    expect(parseExtractionResponse('{"a": "fin ,}" , "b": [1,],}')).toEqual({ a: 'fin ,}', b: [1] })
    expect(parseExtractionResponse('{"a": "guillemet \\" et , ]" ,}')).toEqual({ a: 'guillemet " et , ]' })
  })

  it('trouve l’objet même quand la prose contient des accolades', () => {
    expect(parseExtractionResponse('bla { pas du json } et ensuite {"ok": true} fin'))
      .toEqual({ ok: true })
    expect(parseExtractionResponse('{"ok": true} … et un } orphelin')).toEqual({ ok: true })
  })

  it('préfère l’objet dominant (le plus long) aux accolades incidentes', () => {
    expect(parseExtractionResponse('note {"n": 1} puis {"poleNum": "1", "competences": []}'))
      .toEqual({ poleNum: '1', competences: [] })
  })

  it('rejette un JSON tronqué avec une erreur claire', () => {
    expect(() => parseExtractionResponse('{"poleNum": "1", "competences": [{"pieces": ['))
      .toThrow(/aucun JSON valide/)
  })
})

describe('extractDay', () => {
  function workingMock() {
    return createMockProvider({
      responses: ({ prompt }) => {
        const num = poleOfPrompt(prompt)
        if (num === null) return 'null'
        return JSON.stringify(minimalPoleResponse(num))
      },
    })
  }

  it('fait 7 appels pôle + 1 kairos et rend un document validé', async () => {
    const provider = workingMock()
    const progress = []
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: DATE,
      referentiel,
      provider,
      model: 'mock-cartographe',
      onProgress: (p) => progress.push(p),
    })
    expect(provider.callCount).toBe(8)
    expect(doc.kind).toBe('cartographie-jour')
    expect(doc.date).toBe(DATE)
    expect(doc.poles).toHaveLength(7)
    expect(doc.poles.map((p) => p.poleNum)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(doc.kairos).toBeNull()
    expect(progress).toHaveLength(8)
    expect(progress.at(-1)).toEqual({
      step: 'kairos',
      poleNum: null,
      done: 8,
      total: 8,
      skipped: false,
    })
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('kairosOptional : un kairos imparsable dégrade en kairos null au lieu d’échouer', async () => {
    const brokenKairos = ({ prompt }) => {
      const num = poleOfPrompt(prompt)
      if (num === null) return '```json { "kairos": { tronqué…' // réponse coupée
      return JSON.stringify(minimalPoleResponse(num))
    }

    // Sans l'option : le run échoue (comportement historique conservé).
    await expect(
      extractDay({
        dayText: DAY_TEXT,
        date: DATE,
        referentiel,
        provider: createMockProvider({ responses: brokenKairos }),
      }),
    ).rejects.toThrow(/kairos/)

    // Avec l'option : document valide, kairos null, progression marquée skipped.
    const progress = []
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: DATE,
      referentiel,
      provider: createMockProvider({ responses: brokenKairos }),
      kairosOptional: true,
      onProgress: (p) => progress.push(p),
    })
    expect(doc.poles).toHaveLength(7)
    expect(doc.kairos).toBeNull()
    expect(progress.at(-1).skipped).toBe(true)
  })

  it('contextualise une réponse imparsable (pôle + date)', async () => {
    const provider = createMockProvider({
      responses: ({ prompt }) => (poleOfPrompt(prompt) === 3 ? 'pas de JSON' : JSON.stringify(minimalPoleResponse(poleOfPrompt(prompt) ?? 1))),
    })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider }))
      .rejects.toThrow(/pôle 3 \(2026-01-05\).*aucun JSON valide/s)
  })

  it('rejette un poleNum incohérent dans la réponse', async () => {
    const provider = createMockProvider({
      responses: ({ prompt }) => {
        const num = poleOfPrompt(prompt)
        const pole = minimalPoleResponse(num ?? 1)
        if (num === 2) pole.poleNum = '5'
        return num === null ? 'null' : JSON.stringify(pole)
      },
    })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider }))
      .rejects.toThrow(/pôle 2 .*poleNum incohérent/s)
  })

  it('rejette un document final invalide au schéma avec le détail ajv', async () => {
    // auditPole étant recalculé par extractDay, l'invalidité doit porter sur
    // une donnée NON réparable : un statut de verdict hors énumération.
    const provider = createMockProvider({
      responses: ({ prompt }) => {
        const num = poleOfPrompt(prompt)
        if (num === null) return 'null'
        const pole = minimalPoleResponse(num)
        if (num === 4) {
          // Compétence INSTRUITE (pièce + pédagogue complet) au statut hors
          // énumération : non réparable par normalizeCompetences.
          const c = pole.competences[0]
          c.pieces = [{ pid: 1, numero: 1, contexte: 'x' }]
          c.courtCircuit = false
          c.pedagogue = {
            presomptionAbsence: { raisonnement: 'x', piecesQuiResistent: [] },
            presomptionSycophantie: { raisonnement: 'x', examenPieces: [] },
            conclusionAdversariale: { raisonnement: 'x', confianceFinale: 0.5 },
          }
          c.tracesRetenues = []
          c.verdict = {
            statut: 'présence miraculeuse',
            nombrePreuves: 0,
            nombreIndices: 0,
            confiance: 0.5,
            motif: 'x',
            prescription: 'x',
          }
        }
        return JSON.stringify(pole)
      },
    })
    // Attrapé dès la validation par pôle (le retry unique s'applique au bon
    // appel), le message reste contextualisé pôle + date.
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider }))
      .rejects.toThrow(/pôle 4 .*invalide au schéma/s)
  })

  it('rejette explicitement une génération tronquée (stopReason max_tokens)', async () => {
    const provider = {
      complete: async () => ({
        text: '{"poleNum": "1", "competences": [',
        usage: { inputTokens: 10, outputTokens: 4096 },
        model: 'mock',
        stopReason: 'max_tokens',
      }),
    }
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider }))
      .rejects.toThrow(/tronquée/)
  })

  it('sortie tronquée levée par le fournisseur : un seul appel pour le pôle (jamais refaite), consigne gardée, cause typée', async () => {
    const provider = createMockProvider({
      responses: '{"poleNum": "1", "competences": [',
      usage: { inputTokens: 10, outputTokens: 4096 },
      stopReason: 'max_tokens',
    })
    const failure = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider, maxTokens: 4096 })
      .catch((e) => e)
    expect(failure.message).toBe(
      'extractDay : pôle 1 (2026-01-05) — réponse tronquée (budget de sortie atteint) — réduisez le texte de la journée',
    )
    expect(failure.cause).toBeInstanceOf(OutputTruncatedError)
    expect(failure.cause.usage).toEqual({ inputTokens: 10, outputTokens: 4096 })
    expect(provider.callCount).toBe(1)
  })

  it('fournisseur injecté qui signale seulement max_tokens : pas de second essai non plus', async () => {
    let calls = 0
    const provider = {
      complete: async () => {
        calls += 1
        return { text: '{"poleNum": "1", "competences": [', usage: {}, model: 'mock', stopReason: 'max_tokens' }
      },
    }
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider })).rejects.toThrow(/tronquée/)
    expect(calls).toBe(1)
  })

  it('fenêtre de contexte pleine : message dédié', async () => {
    const provider = createMockProvider({ responses: '{', stopReason: 'context_window' })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider })).rejects.toThrow(
      'extractDay : pôle 1 (2026-01-05) — réponse tronquée (fenêtre de contexte du modèle pleine) — réduisez le texte de la journée',
    )
  })

  it('kairos tronqué : jamais refait ; kairosOptional le dégrade en null, sinon échec explicite', async () => {
    const responses = ({ prompt }) => {
      const num = poleOfPrompt(prompt)
      return num === null ? '{"kairos": {' : JSON.stringify(minimalPoleResponse(num))
    }
    const stopReason = ({ prompt }) => (poleOfPrompt(prompt) === null ? 'max_tokens' : 'end')

    const strict = createMockProvider({ responses, stopReason })
    const failure = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider: strict }).catch((e) => e)
    expect(failure.message).toBe('extractDay : kairos (2026-01-05) — réponse kairos tronquée (budget de sortie atteint)')
    expect(failure.cause).toBeInstanceOf(OutputTruncatedError)
    expect(strict.callCount).toBe(8) // 7 pôles + 1 kairos, sans second kairos

    const tolerant = createMockProvider({ responses, stopReason })
    const doc = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel, provider: tolerant, kairosOptional: true })
    expect(doc.kairos).toBeNull()
    expect(tolerant.callCount).toBe(8)
  })

  it('exige provider, referentiel, dayText et date', async () => {
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel })).rejects.toThrow(/provider/)
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, provider: workingMock() })).rejects.toThrow(/referentiel/)
    await expect(extractDay({ dayText: '', date: DATE, referentiel, provider: workingMock() })).rejects.toThrow(/dayText/)
    await expect(extractDay({ dayText: DAY_TEXT, date: 'demain', referentiel, provider: workingMock() })).rejects.toThrow(/AAAA-MM-JJ/)
  })
})

describe('restreindreReferentiel', () => {
  it('périmètre vide -> document d’origine, partiel false', () => {
    expect(restreindreReferentiel(referentiel)).toEqual({ referentiel, partiel: false })
    expect(restreindreReferentiel(referentiel, {})).toEqual({ referentiel, partiel: false })
    expect(restreindreReferentiel(referentiel, { poles: [], competences: [] }))
      .toEqual({ referentiel, partiel: false })
  })

  it('une compétence -> son pôle seul, partiel true', () => {
    const { referentiel: r, partiel } = restreindreReferentiel(referentiel, {
      competences: ['3.04'],
    })
    expect(partiel).toBe(true)
    expect(r.poles.map((p) => p.num)).toEqual([3])
    expect(r.competences).toHaveLength(1)
    expect(r.competences[0].code).toBe('3.04')
    // Le document d'origine n'est pas muté.
    expect(referentiel.competences.length).toBeGreaterThan(1)
  })

  it('un pôle -> toutes ses compétences, partiel true', () => {
    const attendu = referentiel.competences.filter((c) => c.pole === 5)
    const { referentiel: r, partiel } = restreindreReferentiel(referentiel, { poles: [5] })
    expect(partiel).toBe(true)
    expect(r.poles.map((p) => p.num)).toEqual([5])
    expect(r.competences).toEqual(attendu)
  })

  it('périmètre sans aucune compétence retenue -> erreur explicite', () => {
    expect(() => restreindreReferentiel(referentiel, { competences: ['9.99'] }))
      .toThrow(/périmètre vide/)
    // Intersection vide : compétence du pôle 3 filtrée sur le pôle 1.
    expect(() => restreindreReferentiel(referentiel, { poles: [1], competences: ['3.04'] }))
      .toThrow(/périmètre vide/)
  })
})

describe('extractDay — périmètre restreint', () => {
  function workingMock() {
    return createMockProvider({
      responses: ({ prompt }) => {
        const kairos = prompt.includes('SYNTHÈSE KAIROS')
        if (kairos) return 'null'
        const num = Number(prompt.match(/# Pôle (\d) — /)[1])
        // Ne répond QUE les compétences listées dans le prompt (périmètre).
        const codes = [...prompt.matchAll(/^ {2}(\d\.\d\d) — /gm)].map((m) => m[1])
        const comps = referentiel.competences.filter((c) => codes.includes(c.code))
        const base = minimalPoleResponse(num)
        base.competences = base.competences.filter((c) => codes.includes(c.code))
        base.auditPole = {
          competencesTotales: comps.length,
          courtCircuits: comps.length,
          competencesNonCourtCircuit: 0,
          presencesEtablies: 0,
          renvoisCartographe: 0,
          nonEtablies: comps.length,
        }
        return JSON.stringify(base)
      },
    })
  }

  it('une compétence -> 1 seul appel (pas de kairos), document partiel marqué', async () => {
    const provider = workingMock()
    const progress = []
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: DATE,
      referentiel,
      provider,
      perimetre: { competences: ['3.04'] },
      onProgress: (p) => progress.push(p),
    })
    expect(provider.callCount).toBe(1)
    expect(doc.kind).toBe('cartographie-jour')
    expect(doc.poles).toHaveLength(1)
    expect(doc.poles[0].poleNum).toBe('3')
    expect(doc.poles[0].competences.map((c) => c.code)).toEqual(['3.04'])
    expect(doc.kairos).toBeNull()
    expect(doc.perimetre).toEqual({ partiel: true, poles: [3], competences: ['3.04'] })
    expect(progress).toEqual([{ step: 'pole', poleNum: 3, done: 1, total: 1 }])
  })

  it('un pôle -> ses compétences instruites, prompt limité au périmètre', async () => {
    const provider = workingMock()
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: DATE,
      referentiel,
      provider,
      perimetre: { poles: [5] },
    })
    expect(provider.callCount).toBe(1)
    const attendus = referentiel.competences
      .filter((c) => c.pole === 5)
      .map((c) => c.code)
      .sort()
    expect(doc.poles[0].competences.map((c) => c.code).sort()).toEqual(attendus)
    expect(doc.perimetre.partiel).toBe(true)
    // Le prompt envoyé ne liste QUE les compétences du pôle 5.
    const prompt = provider.calls[0].prompt
    expect(prompt).toContain('5.01')
    expect(prompt).not.toContain('1.01')
  })

  it('le modèle instruit tout le pôle : les compétences hors du périmètre sont écartées ; un code inconnu fait échouer', async () => {
    const toutLePole = createMockProvider({
      responses: ({ prompt }) => JSON.stringify(minimalPoleResponse(Number(prompt.match(/# Pôle (\d) — /)[1]))),
    })
    const doc = await extractDay({
      dayText: DAY_TEXT, date: DATE, referentiel, provider: toutLePole, perimetre: { competences: ['3.04'] },
    })
    expect(doc.poles[0].competences.map((c) => c.code)).toEqual(['3.04'])
    expect(doc.poles[0].auditPole.competencesTotales).toBe(1)

    const inconnu = createMockProvider({
      responses: ({ prompt }) => {
        const pole = minimalPoleResponse(Number(prompt.match(/# Pôle (\d) — /)[1]))
        pole.competences.push({ ...pole.competences[0], code: '3.99' })
        return JSON.stringify(pole)
      },
    })
    await expect(extractDay({
      dayText: DAY_TEXT, date: DATE, referentiel, provider: inconnu, perimetre: { competences: ['3.04'] },
    })).rejects.toThrow(/pôle 3 .*non conforme au référentiel.*le code 3\.99 n'est pas une compétence du référentiel/s)
  })

  it('périmètre couvrant tout le référentiel -> comportement complet inchangé', async () => {
    const provider = workingMock()
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: DATE,
      referentiel,
      provider,
      perimetre: { poles: [1, 2, 3, 4, 5, 6, 7] },
    })
    expect(provider.callCount).toBe(8) // 7 pôles + kairos
    expect(doc.poles).toHaveLength(7)
    expect(doc.perimetre).toBeUndefined()
  })
})

// --- Tout référentiel (2026-10-20) -------------------------------------------
// La structure se lit dans le référentiel employé : nombre et numéros des pôles,
// codes, nom du référentiel et codes d'exemple des prompts. Le garde-fou contre
// un pôle perdu ou un code inconnu est la conformité au référentiel.

/** Cinq pôles lettrés, quatre capacités chacun (la forme de l'Humanome V18). */
const LETTRE = {
  id: 'fictif-lettre',
  label: 'Fictif lettré v1.0.0',
  poles: ['A', 'B', 'C', 'D', 'E'].map((l, i) => ({ num: i + 1, nom: `${l} · Pôle fictif ${l}` })),
  competences: ['A', 'B', 'C', 'D', 'E'].flatMap((l, i) =>
    [1, 2, 3, 4].map((n) => ({ code: `${l}${n}`, nom: `Capacité fictive ${l}${n}`, pole: i + 1 })),
  ),
}

/** Neuf pôles numérotés, deux compétences chacun. */
const NEUF = {
  id: 'fictif-neuf',
  label: 'Fictif à neuf pôles',
  poles: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, nom: `Pôle fictif ${i + 1}` })),
  competences: Array.from({ length: 9 }, (_, i) => [1, 2].map((n) => ({
    code: `${i + 1}.0${n}`,
    nom: `Compétence fictive ${i + 1}.0${n}`,
    pole: i + 1,
  }))).flat(),
}

/** RESPIRE v7 sans son pôle 7 : une version de RESPIRE en six pôles. */
const RESPIRE_SIX = {
  ...referentiel,
  poles: referentiel.poles.filter((p) => p.num !== 7),
  competences: referentiel.competences.filter((c) => c.pole !== 7),
}

/** Réponse pôle minimale pour un référentiel quelconque : tout en court-circuit. */
function minimalPoleResponseFor(ref, num) {
  const comps = ref.competences
    .filter((c) => c.pole === num)
    .sort((a, b) => (a.code < b.code ? -1 : 1))
  const base = minimalPoleResponse(1)
  return {
    ...base,
    poleNum: String(num),
    competences: comps.map((c) => ({ ...base.competences[0], code: c.code })),
    auditPole: { ...base.auditPole, competencesTotales: comps.length, courtCircuits: comps.length, nonEtablies: comps.length },
  }
}

function mockFor(ref, { kairos = 'null', alterPole } = {}) {
  return createMockProvider({
    responses: ({ prompt }) => {
      if (prompt.includes('SYNTHÈSE KAIROS')) return kairos
      const num = Number(prompt.match(/# Pôle (\d+) — /)[1])
      const pole = minimalPoleResponseFor(ref, num)
      alterPole?.(pole, num)
      return JSON.stringify(pole)
    },
  })
}

describe('extractDay — tout référentiel', () => {
  it('cinq pôles lettrés : un appel par pôle + le kairos, le document nomme son référentiel', async () => {
    const provider = mockFor(LETTRE)
    const doc = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider })
    expect(provider.callCount).toBe(6)
    expect(doc.referentiel).toBe('fictif-lettre')
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'kind', 'referentiel', 'date', 'poles', 'kairos'])
    expect(doc.poles.map((p) => p.poleNum)).toEqual(['1', '2', '3', '4', '5'])
    expect(doc.poles[3].competences.map((c) => c.code)).toEqual(['D1', 'D2', 'D3', 'D4'])

    const [pole1, , , , , kairos] = provider.calls.map((c) => c.prompt)
    expect(pole1).toContain('pour UN pôle du référentiel Fictif lettré, en jouant')
    expect(pole1).toContain('les 4 codes\nA1, A2, A3, A4 dans cet ordre')
    expect(kairos).toContain('Les 5 pôles de la feuille du jour ont déjà été instruits')
    expect(kairos).toContain('# Référentiel Fictif lettré (5 pôles, 20 compétences)')
    expect(kairos).toContain('"codesRelies": [ "A1", "D2" ]')
    expect(kairos).toContain('"enRelationAvecCodes": [ "A1" ]')
    expect(kairos).not.toMatch(/RESPIRE|1\.01|4\.02|7 pôles/)
  })

  it('neuf pôles : neuf appels pôle + le kairos', async () => {
    const provider = mockFor(NEUF)
    const doc = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: NEUF, provider })
    expect(provider.callCount).toBe(10)
    expect(doc.referentiel).toBe('fictif-neuf')
    expect(doc.poles).toHaveLength(9)
    expect(provider.calls.at(-1).prompt).toContain('# Référentiel Fictif à neuf pôles (9 pôles, 18 compétences)')
  })

  it('une version de RESPIRE en six pôles : six appels pôle + le kairos, document de RESPIRE (non nommé)', async () => {
    const provider = mockFor(RESPIRE_SIX)
    const doc = await extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: RESPIRE_SIX, provider })
    expect(provider.callCount).toBe(7)
    expect(doc).not.toHaveProperty('referentiel')
    expect(doc.poles.map((p) => p.poleNum)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(provider.calls.at(-1).prompt).toContain('Les 6 pôles de la feuille du jour')
    expect(provider.calls.at(-1).prompt).toContain('# Référentiel RESPIRE (6 pôles, ')
  })

  it('refuse un pôle qui instruit un code inconnu du référentiel ou d’un autre pôle (après le retry)', async () => {
    const inconnu = mockFor(LETTRE, { alterPole: (pole, num) => { if (num === 2) pole.competences[0].code = 'Z9' } })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider: inconnu }))
      .rejects.toThrow(/pôle 2 .*non conforme au référentiel.*le code Z9 n'est pas une compétence du référentiel/s)
    const deplace = mockFor(LETTRE, { alterPole: (pole, num) => { if (num === 3) pole.competences[0].code = 'A1' } })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider: deplace }))
      .rejects.toThrow(/pôle 3 .*la compétence A1 est du pôle 1, pas du pôle 3/s)
  })

  it('un kairos qui relie des codes inconnus du référentiel échoue, ou dégrade en null (kairosOptional)', async () => {
    const kairos = JSON.stringify({
      kairos: {
        apprenant: {
          portrait: 'p', formeProfil: 'f', ceQuiRelieLesPoles: 'c', ceQuiEmergeEntreLesLignes: 'e',
          invitationsPourLaSuite: ['i'], syntheseCompleteMarkdown: 's',
        },
      },
      emergencesCrossPoles: {
        connexionsTransversales: [{ titre: 't', description: 'd', codesRelies: ['A1', '4.02'], piecesCommunes: [] }],
        noeudsConceptuels: [],
        competencesOrphelines: [],
      },
    })
    await expect(extractDay({ dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider: mockFor(LETTRE, { kairos }) }))
      .rejects.toThrow(/kairos .*non conforme au référentiel.*le code 4\.02 n'est pas une compétence du référentiel/s)
    const doc = await extractDay({
      dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider: mockFor(LETTRE, { kairos }), kairosOptional: true,
    })
    expect(doc.kairos).toBeNull()
  })

  it('périmètre restreint d’un autre référentiel : le document partiel nomme son référentiel et son périmètre', async () => {
    const provider = createMockProvider({
      responses: ({ prompt }) => {
        const num = Number(prompt.match(/# Pôle (\d+) — /)[1])
        const pole = minimalPoleResponseFor(LETTRE, num)
        pole.competences = pole.competences.filter((c) => c.code === 'C3')
        return JSON.stringify(pole)
      },
    })
    const doc = await extractDay({
      dayText: DAY_TEXT, date: DATE, referentiel: LETTRE, provider, perimetre: { competences: ['C3'] },
    })
    expect(provider.callCount).toBe(1)
    expect(doc.referentiel).toBe('fictif-lettre')
    expect(doc.perimetre).toEqual({ partiel: true, poles: [3], competences: ['C3'] })
    expect(validateDocumentPourReferentiel('cartographie-jour', doc, LETTRE).valid).toBe(true)
  })
})

describe('validateDocumentPourReferentiel, journée (schéma puis conformité, marqueur de périmètre compris)', () => {
  const jour = JSON.parse(
    readFileSync(new URL('../../../schemas/fixtures/cartographie-jour-2026-01-07.json', import.meta.url), 'utf8'),
  )

  it('RESPIRE v7 : la journée réelle est valide et conforme', () => {
    expect(validateDocumentPourReferentiel('cartographie-jour', jour, referentiel)).toEqual({ valid: true, errors: [] })
  })

  it('refuse une journée à qui il manque un pôle de son référentiel', () => {
    const sansPole4 = { ...jour, poles: jour.poles.filter((p) => p.poleNum !== '4') }
    const { valid, errors } = validateDocumentPourReferentiel('cartographie-jour', sansPole4, referentiel)
    expect(valid).toBe(false)
    expect(errors.map((e) => e.message)).toContain('il manque le pôle 4 du référentiel')
  })

  it('la même journée sans pôle 7 est conforme à une version de RESPIRE en six pôles', () => {
    const sixPoles = { ...jour, poles: jour.poles.filter((p) => p.poleNum !== '7') }
    // Le kairos du corpus relie aussi des codes du pôle 7 : la version à six pôles ne les connaît pas.
    expect(validateDocumentPourReferentiel('cartographie-jour', { ...sixPoles, kairos: null }, RESPIRE_SIX).valid).toBe(true)
  })

  it('le marqueur de périmètre échappe au schéma mais pas à la conformité', () => {
    const pole3 = jour.poles.find((p) => p.poleNum === '3')
    const partiel = { ...jour, poles: [pole3], kairos: null, perimetre: { partiel: true, poles: [3] } }
    expect(validateDocumentPourReferentiel('cartographie-jour', partiel, referentiel).valid).toBe(true)
    const { perimetre: _marqueur, ...sansMarqueur } = partiel
    expect(validateDocumentPourReferentiel('cartographie-jour', sansMarqueur, referentiel).errors.map((e) => e.message))
      .toContain('il manque les pôles 1, 2, 4, 5, 6, 7 du référentiel')
  })
})
