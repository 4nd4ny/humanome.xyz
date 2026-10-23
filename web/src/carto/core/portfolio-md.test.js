// Question 20 (décision du 2026-10-14) — un chemin du carnet du dialogue vers
// le portfolio : un dialogue versé fait partie du portfolio exporté en
// Markdown, dans la journée où il a été tenu ; redécoupé comme à l'import, le
// fichier redonne les mêmes journées. Le versement se défait entièrement.
import { describe, expect, it } from 'vitest'
import { buildHighlightedPortfolioMarkdown, buildPortfolioMarkdown, boundaryDate, hasPortfolioToExport, locateExtractInText } from './portfolio-md.js'
import { sansMarquesTwin9 } from '../../lib/twin9/marques.js'
import { reflectionIsoDay, versedDialogueMarkdown } from './dialogue.js'
import { addReflection, removeReflection, setReflectionVersed } from './ops.js'
import { importFiles } from './import.js'
import { importPortfolioText } from './importers/portfolio.js'
import { createDataset } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-14T10:00:00.000Z'
// Midi UTC : la même journée dans tous les fuseaux de UTC−11 à UTC+11.
const HELD_23 = '2025-12-23T12:00:00.000Z'
const HELD_TODAY = '2026-10-14T12:00:00.000Z'

const citation = {
  threadId: 'citation:2025-12-22:1.01',
  kind: 'citation',
  question: 'Le 22 décembre 2025, vous écrivez ce passage, où l’analyse lit « Vérifier » (1.01). Qu’est-ce qui se jouait pour vous ce jour-là ?',
  quote: 'J’ai vérifié deux sources contradictoires avant de conclure',
  answer: 'Je doutais de la date du chantier.\nJ’ai préféré vérifier.',
  refs: { dates: ['2025-12-22'], codes: ['1.01'] },
  relaunch: { text: 'Qu’est-ce qui vous a fait douter ?', model: 'Ollama — llama3.1' },
}
const silence = { threadId: 'silence:a:b', kind: 'silence', question: 'Que s’est-il passé pendant ce temps ?', quote: null, answer: '', refs: { dates: [], codes: [] } }

async function louStore() {
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const res = await importFiles(files, createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW })
  await store.commit(res)
  return { store, dataset: res.dataset }
}

/** Garde deux dialogues (tenus le 23 décembre et aujourd'hui) et verse ceux demandés. */
async function withDialogues(verse = []) {
  const { store, dataset } = await louStore()
  let ds = addReflection(dataset, { entries: [citation, silence] }, { now: HELD_23 })
  ds = addReflection(ds, { entries: [{ ...silence, answer: 'Une longue pause, puis la reprise.' }] }, { now: HELD_TODAY })
  const [r23, rToday] = ds.reflections
  for (const r of verse.map((k) => (k === '23' ? r23 : rToday))) ds = setReflectionVersed(ds, r.id, true, { now: NOW })
  await store.saveDataset(ds)
  return { store, ds, r23, rToday }
}

describe('verser un dialogue au portfolio', () => {
  it('verser, retirer : un drapeau sur le dialogue, rien n’est recopié', async () => {
    const { ds, r23 } = await withDialogues()
    const versed = setReflectionVersed(ds, r23.id, true, { now: NOW })
    expect(versed.reflections.find((r) => r.id === r23.id).versedAt).toBe(NOW)
    expect(setReflectionVersed(versed, r23.id, true, { now: '2027-01-01T00:00:00.000Z' })).toBe(versed) // déjà versé : rien ne change
    expect(setReflectionVersed(versed, 'inconnu', true, { now: NOW })).toBe(versed)
    const back = setReflectionVersed(versed, r23.id, false, { now: NOW })
    expect(back.reflections.find((r) => r.id === r23.id)).toEqual(r23)
    // Retirer le dialogue du carnet le retire aussi du portfolio.
    expect(removeReflection(versed, r23.id, { now: NOW }).reflections.some((r) => r.versedAt)).toBe(false)
  })

  it('le dialogue versé, en Markdown : questions répondues seulement, passage daté et attribué, relance attribuée au modèle', () => {
    const md = versedDialogueMarkdown({ at: HELD_23, entries: [citation, silence] })
    expect(md.startsWith('### Dialogue d’accompagnement du 23 décembre 2025\n')).toBe(true)
    expect(md).toContain('*Questions tirées de la cartographie ; les réponses sont de l’auteur du portfolio.*')
    expect(md).toContain(`**Question.** ${citation.question}`)
    expect(md).toContain('> Passage du 22 décembre 2025 cité par le dialogue : « J’ai vérifié deux sources contradictoires avant de conclure »')
    expect(md).toContain('**Réponse.** Je doutais de la date du chantier.\nJ’ai préféré vérifier.')
    expect(md).toContain('> Relance proposée par un modèle de langage (Ollama — llama3.1) : Qu’est-ce qui vous a fait douter ?')
    expect(md).not.toContain('Que s’est-il passé') // sans réponse : absent
    // Aucune ligne produite n'ouvre une journée.
    for (const line of md.split('\n')) if (line.trim()) expect(boundaryDate(line)).toBeUndefined()
    expect(versedDialogueMarkdown({ at: HELD_23, entries: [silence] })).toBe('')
    expect(reflectionIsoDay(HELD_23)).toBe('2025-12-23')
    expect(reflectionIsoDay('pas une date')).toBe(null)
  })

  it('le portfolio exporté : chaque journée dans l’ordre, le dialogue dans la sienne ; redécoupé, il redonne les mêmes journées', async () => {
    const { store } = await withDialogues(['23', 'today'])
    const exported = await store.exportAll('ds-lou')
    const out = buildPortfolioMarkdown(exported)
    expect(out).toMatchObject({ days: 4, dialogues: 2, undated: 0 })

    const back = importPortfolioText(out.text, { fileName: 'portfolio.md' })
    expect(back.undated).toEqual([])
    expect(back.segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24', '2026-10-14'])
    const byDate = Object.fromEntries(back.segments.map((s) => [s.date, s.text]))
    // Le texte de chaque journée, tel quel.
    for (const s of back.segments.slice(0, 3)) expect(s.text).toContain(exported.details[s.date].portfolio.text.trim())
    // Le dialogue du 23 décembre, après le texte de ce jour ; celui d'aujourd'hui ouvre sa journée.
    expect(byDate['2025-12-23'].indexOf('### Dialogue d’accompagnement du 23 décembre 2025')).toBeGreaterThan(byDate['2025-12-23'].indexOf('La maquette a cédé'))
    expect(byDate['2025-12-23']).toContain('**Réponse.** Je doutais de la date du chantier.')
    expect(byDate['2026-10-14']).toMatch(/^## 2026-10-14\n\n### Dialogue d’accompagnement du 14 octobre 2026/)
    expect(byDate['2026-10-14']).toContain('**Réponse.** Une longue pause, puis la reprise.')
    expect(byDate['2025-12-22']).not.toContain('Dialogue')
  })

  it('un dialogue gardé mais non versé n’y est pas ; retiré du portfolio, il en sort', async () => {
    const { store, ds, r23 } = await withDialogues(['23'])
    let out = buildPortfolioMarkdown(await store.exportAll('ds-lou'))
    expect(out.dialogues).toBe(1)
    expect(out.text).not.toContain('Une longue pause') // le dialogue d'aujourd'hui n'est pas versé
    expect(out.text).not.toContain('## 2026-10-14')
    await store.saveDataset(setReflectionVersed(ds, r23.id, false, { now: NOW }))
    out = buildPortfolioMarkdown(await store.exportAll('ds-lou'))
    expect(out).toMatchObject({ days: 3, dialogues: 0 })
    expect(out.text).not.toContain('Dialogue d’accompagnement')
  })

  it('une réponse avec une date seule sur sa ligne ou un séparateur ne coupe pas la journée', () => {
    const answer = 'Je relis ma journée.\nLe 5 janvier 2026\n---\n## 2026-01-06\nFin de ma réponse.'
    const exported = {
      dataset: { reflections: [{ id: 'rf', at: HELD_TODAY, versedAt: NOW, entries: [{ ...silence, answer }] }], portfolio: null },
      details: {},
    }
    const out = buildPortfolioMarkdown(exported)
    const back = importPortfolioText(out.text)
    expect(back.segments.map((s) => s.date)).toEqual(['2026-10-14'])
    expect(back.undated).toEqual([])
    // Le trait reste tel quel : après l'en-tête de la journée, il ne coupe plus (D-55).
    expect(out.text).toContain('— Le 5 janvier 2026\n---\n— ## 2026-01-06\nFin de ma réponse.')
  })

  it('feuilles séparées (une par journée) : traits gardés tels quels (ils ne coupent plus une journée, D-55), date d’un autre jour neutralisée, en-tête jamais doublé', () => {
    const exported = {
      dataset: { reflections: [], portfolio: null },
      details: {
        '2026-01-05': { portfolio: { text: '## 2026-01-05\n\nMatin.\n\n---\n\nAprès-midi.\n\n***\n\n06/01/2026\n\nNote pour demain.\n\n---\n' } },
        '2026-01-06': { portfolio: { text: '## 2026-01-06\n\nSecond jour.\n' } },
      },
    }
    const out = buildPortfolioMarkdown(exported)
    const back = importPortfolioText(out.text)
    expect(back.segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(back.undated).toEqual([])
    expect(back.segments[0].text).toContain('Matin.\n\n---\n\nAprès-midi.\n\n***\n\n— 06/01/2026\n\nNote pour demain.\n\n---')
    expect(out.text.match(/## 2026-01-05/g)).toHaveLength(1) // pas d'en-tête en double
    expect(out.text.startsWith('## 2026-01-05\n\nMatin.')).toBe(true)
  })

  it('année à deux chiffres (sprint 4) : « ### 02.03.26 » ouvre sa journée ; d’un autre jour, dans une feuille, il est neutralisé', () => {
    expect(boundaryDate('### 02.03.26')).toBe('2026-03-02')
    expect(boundaryDate('02.03.26')).toBeUndefined() // ligne nue : du texte, comme pour Twin9
    const exported = {
      dataset: { reflections: [], portfolio: null },
      details: {
        '2026-03-02': { portfolio: { text: '### 02.03.26\n\nMatin.\n\n### 04.03.26\n\nNote recopiée.\n' } },
        '2026-03-04': { portfolio: { text: '### 04.03.26\n\nSecond jour.\n' } },
      },
    }
    const out = buildPortfolioMarkdown(exported)
    expect(out.text.startsWith('### 02.03.26\n\nMatin.\n\n— ### 04.03.26\n\nNote recopiée.')).toBe(true)
    expect(importPortfolioText(out.text).segments.map((s) => s.date)).toEqual(['2026-03-02', '2026-03-04'])
  })

  it('une journée qui ne s’ouvre pas sur son en-tête le reçoit ; un passage sans date reste sans date, en tête du fichier (D-55)', () => {
    const exported = {
      dataset: {
        reflections: [],
        portfolio: { undated: [{ title: null, text: 'Un passage jamais daté.' }, { title: null, text: 'Un autre.\n\n---\n\n07/01/2026\n\nSa suite.' }] },
      },
      details: {
        '2026-01-06': { portfolio: { text: '# Mon journal\n\n## 2026-01-06\n\nSecond jour.\n' } },
        '2026-01-05': { portfolio: { text: 'Rattaché à la main, sans en-tête.\n\n05/01/2026\n\nSuite du même jour.' } },
      },
    }
    const out = buildPortfolioMarkdown(exported)
    expect(out).toMatchObject({ days: 2, dialogues: 0, undated: 2 })
    // Avant la première journée, un trait coupe encore : chaque passage après un « *** »,
    // ses propres traits espacés et ses dates neutralisées.
    expect(out.text.startsWith('***\n\nUn passage jamais daté.\n\n***\n\nUn autre.\n\n- - -\n\n— 07/01/2026\n\nSa suite.\n\n## 2026-01-05')).toBe(true)
    const back = importPortfolioText(out.text)
    expect(back.segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(back.segments[0].text).toContain('Rattaché à la main, sans en-tête.')
    expect(back.segments[0].text).toContain('Suite du même jour.')
    expect(back.segments[1].text).toContain('# Mon journal') // le titre du document reste avec sa journée
    // Chaque passage reste seul et sans date ; son trait et sa date ne le coupent pas.
    expect(back.undated).toHaveLength(2)
    expect(back.undated[0].text.trim()).toBe('Un passage jamais daté.')
    expect(back.undated[1].text.trim()).toBe('Un autre.\n\n- - -\n\n— 07/01/2026\n\nSa suite.')
    // Réexporté, le fichier ne change plus.
    const again = buildPortfolioMarkdown({
      dataset: { reflections: [], portfolio: { undated: back.undated } },
      details: Object.fromEntries(back.segments.map((seg) => [seg.date, { portfolio: { text: seg.text } }])),
    })
    expect(again.text).toBe(out.text)
  })

  it('portfolio exporté puis réimporté (avec l’évaluation suivante) : le dialogue, désormais dans le texte de sa journée, n’est pas doublé', async () => {
    const { store } = await withDialogues(['23', 'today'])
    const first = buildPortfolioMarkdown(await store.exportAll('ds-lou'))
    // Réimport du fichier dans le même jeu : les textes des journées le contiennent désormais.
    const exported = await store.exportAll('ds-lou')
    const back = importPortfolioText(first.text)
    const details = { ...exported.details }
    for (const seg of back.segments) details[seg.date] = { ...(details[seg.date] ?? {}), portfolio: { title: seg.title, text: seg.text, source: 'export.md' } }
    const second = buildPortfolioMarkdown({ dataset: exported.dataset, details })
    expect(second.text.match(/### Dialogue d’accompagnement/g)).toHaveLength(2)
    expect(second.dialogues).toBe(2)
    expect(importPortfolioText(second.text).segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24', '2026-10-14'])
  })

  it('un portfolio exporté avant D-55 (traits espacés dans le dialogue), réimporté : le dialogue n’est pas doublé', () => {
    const answer = 'Avant le trait.\n---\nAprès le trait.'
    const reflection = { id: 'rf', at: HELD_TODAY, versedAt: NOW, entries: [{ ...silence, answer }] }
    const legacyDay = `## 2026-10-14\n\n${versedDialogueMarkdown(reflection).trim().replace(/^---$/m, '- - -')}`
    const out = buildPortfolioMarkdown({ dataset: { reflections: [reflection], portfolio: null }, details: { '2026-10-14': { portfolio: { text: legacyDay } } } })
    expect(out.text.match(/### Dialogue d’accompagnement/g)).toHaveLength(1)
    expect(out.text).toContain('Avant le trait.\n- - -\nAprès le trait.')
  })

  it('rien à exporter sans texte ni dialogue versé', async () => {
    const empty = createDataset({ datasetId: 'vide', referential: miniReferential(), now: NOW })
    expect(hasPortfolioToExport(empty)).toBe(false)
    expect(buildPortfolioMarkdown({ dataset: empty, details: {} })).toEqual({ text: '', days: 0, dialogues: 0, undated: 0 })
    const kept = addReflection(empty, { entries: [{ ...silence, answer: 'Oui.' }] }, { now: HELD_TODAY })
    expect(hasPortfolioToExport(kept)).toBe(false) // gardé, pas versé
    expect(hasPortfolioToExport(setReflectionVersed(kept, kept.reflections[0].id, true, { now: NOW }))).toBe(true)
    const { dataset } = await louStore()
    expect(hasPortfolioToExport(dataset)).toBe(true)
  })
})

// S3-3 — le portfolio surligné : les passages des traces conservées de la stigmergie de Twin9, marqués
// selon leur nature, et le tableau des traces de chaque journée ; réimporté, le portfolio sans marques.
describe('le portfolio surligné (S3-3)', () => {
  const JOUR1 = [
    '## 2026-01-05',
    '',
    'J’ai monté le capteur et vérifié chaque mesure.',
    '',
    '- Je relie la pompe,',
    '- la sonde et le réservoir.',
    '',
    'Un passage | avec <balise> à citer.',
  ].join('\n')
  const JOUR2 = '## 2026-01-06\n\nDeuxième jour : j’ai lu les mesures.'
  const trace = (code, extrait, incertitude, tau, extra = {}) => ({ id: `t-${code}-${tau}`, code, start: 0, end: 10, extrait, tau, incertitude, statut: 'présence établie', voie: 'tribunal', role: 'preuve décisive', source: 'trace_probante', analyses: 2, ...extra })
  const TRACES = [
    trace('1.01', 'J’ai monté le capteur et vérifié chaque mesure.', 'faible', 2.19),
    trace('1.05', 'Je relie la pompe,\n- la sonde et le réservoir.', 'écartée', 0.147),
    trace('1.01', 'monté le capteur', 'moyenne', 0.6),
    trace('1.05', 'Un passage introuvable dans ce texte.', 'forte', 0.3),
    trace('1.08', 'Un passage | avec <balise> à citer.', 'faible', 1),
  ]
  const exported = ({ conservee1 = true, conservee2 = false } = {}) => ({
    dataset: {
      days: [
        { date: '2026-01-05', activeVariantId: 'v1', variants: [{ id: 'v1', stigmergie: { analyse: 3, traces: TRACES.length, conservee: conservee1 } }] },
        { date: '2026-01-06', activeVariantId: 'v2', variants: [{ id: 'v2', stigmergie: { analyse: 1, traces: 1, conservee: conservee2 } }] },
      ],
      reflections: [],
      portfolio: { undated: [] },
    },
    details: {
      '2026-01-05': { portfolio: { text: JOUR1 }, variants: { v1: { stigmergie: { analyse: 3, run: 'r3', conservee: conservee1, traces: TRACES } } } },
      '2026-01-06': { portfolio: { text: JOUR2 }, variants: { v2: { stigmergie: { analyse: 1, run: 'r1', conservee: conservee2, traces: [trace('1.01', 'j’ai lu les mesures', 'faible', 1)] } } } },
    },
  })
  const refl = { compByCode: new Map([['1.01', { name: 'Analyse', order: 1 }], ['1.05', { name: 'Pensée systémique', order: 2 }], ['1.08', { name: 'Rigueur', order: 3 }]]) }
  const marks = (text) => [...text.matchAll(/<mark ([^>]*)>([^<]*)<\/mark>/g)].map((m) => [m[1], m[2]])

  it('chaque passage d’une trace conservée est marqué selon sa nature, ligne par ligne, hors des marqueurs de liste ; la journée finit sur le tableau de ses traces', () => {
    const out = buildHighlightedPortfolioMarkdown(exported(), { refl })
    expect([out.days, out.traces, out.marked]).toEqual([2, 5, 3])
    expect(marks(out.text)).toEqual([
      ['data-twin9-code="1.01" data-incertitude="faible"', 'J’ai monté le capteur et vérifié chaque mesure.'],
      ['data-twin9-code="1.05" data-incertitude="écartée"', 'Je relie la pompe,'],
      ['data-twin9-code="1.05" data-incertitude="écartée"', 'la sonde et le réservoir.'],
    ])
    expect(out.text).toContain('<mark data-twin9-code="1.08" data-incertitude="faible">Un passage | avec <balise> à citer.</mark>')
    expect(out.text).toContain('- <mark data-twin9-code="1.05" data-incertitude="écartée">Je relie la pompe,</mark>\n- <mark')
    // une marque ne passe jamais d'une ligne à l'autre
    for (const m of out.text.matchAll(/<mark [^>]*>([\s\S]*?)<\/mark>/g)) expect(m[1]).not.toContain('\n')
    // le tableau, en fin de journée, avant la suivante ; ses cases n'ont ni HTML ni barre qui les couperaient
    const tableau = out.text.slice(out.text.indexOf('<!-- twin9-traces -->'), out.text.indexOf('<!-- /twin9-traces -->'))
    expect(tableau).toContain('| Compétence | Nature de la trace | Passage |')
    expect(tableau).toContain('| 1.01 Analyse | incertitude faible | « J’ai monté le capteur et vérifié chaque mesure. » |')
    expect(tableau).toContain('| 1.01 Analyse | incertitude moyenne | « monté le capteur » (non surligné : dans le passage de 1.01) |')
    expect(tableau).toContain('| 1.05 Pensée systémique | écartée | « Je relie la pompe, - la sonde et le réservoir. » |')
    expect(tableau).toContain('« Un passage introuvable dans ce texte. » (non surligné : introuvable tel quel dans ce texte)')
    expect(tableau).toContain('| 1.08 Rigueur | incertitude faible | « Un passage \\| avec &lt;balise&gt; à citer. » |')
    expect(tableau).toContain('analyse n° 3 de cette journée')
    expect(out.text.indexOf('<!-- /twin9-traces -->')).toBeLessThan(out.text.indexOf('## 2026-01-06'))
    // la journée en panne : ni marque ni tableau
    expect(out.text.slice(out.text.indexOf('## 2026-01-06'))).toBe(`${JOUR2}\n`)
    // ni intensité (elle ne se montre pas par défaut), ni « score »
    expect(out.text).not.toMatch(/data-intensite|Intensité|score/i)
  })

  it('l’intensité, seulement quand elle se montre (mode expert, cartographe) : un attribut et une colonne', () => {
    const out = buildHighlightedPortfolioMarkdown(exported(), { refl, intensites: true })
    expect(marks(out.text)[0][0]).toBe('data-twin9-code="1.01" data-incertitude="faible" data-intensite="2.19"')
    expect(out.text).toContain('| Compétence | Nature de la trace | Intensité (sur 3) | Passage |')
    expect(out.text).toContain('| 1.01 Analyse | incertitude faible | 2,19 | « J’ai monté')
    expect(out.text).not.toMatch(/score/i)
  })

  it('réimporté, il redonne à l’octet le portfolio sans marques, et les mêmes journées', () => {
    for (const intensites of [false, true]) {
      const plain = buildPortfolioMarkdown(exported()).text
      const highlighted = buildHighlightedPortfolioMarkdown(exported(), { refl, intensites }).text
      expect(highlighted).not.toBe(plain)
      expect(sansMarquesTwin9(highlighted)).toBe(plain)
      const lu = importPortfolioText(highlighted, { fileName: 'portfolio-surligne.md' })
      expect(lu.segments).toEqual(importPortfolioText(plain, { fileName: 'portfolio-surligne.md' }).segments)
      expect(lu.report.map((r) => r.code)).toContain('marques-twin9-retirees')
      expect(JSON.stringify(lu.segments)).not.toMatch(/data-twin9|data-incertitude|data-intensite|twin9-traces/)
    }
  })

  it('jamais une trace non conservée ; sans trace conservée, le portfolio sans marques', () => {
    const aucune = exported({ conservee1: null, conservee2: false })
    expect(buildHighlightedPortfolioMarkdown(aucune, { refl }).text).toBe(buildPortfolioMarkdown(aucune).text)
    const deux = buildHighlightedPortfolioMarkdown(exported({ conservee2: true }), { refl })
    expect(deux.text).toContain('Deuxième jour : <mark data-twin9-code="1.01" data-incertitude="faible">j’ai lu les mesures</mark>.')
  })

  it('les valeurs des attributs sont échappées ; un passage se retrouve aux blancs près', () => {
    const ex = exported()
    ex.details['2026-01-05'].variants.v1.stigmergie.traces = [trace('1"><x', 'J’ai monté   le capteur et\nvérifié chaque mesure.', 'forte', 1)]
    const out = buildHighlightedPortfolioMarkdown(ex, { refl })
    expect(out.text).toContain('<mark data-twin9-code="1&quot;&gt;&lt;x" data-incertitude="forte">J’ai monté le capteur et vérifié chaque mesure.</mark>')
    expect(sansMarquesTwin9(out.text)).toBe(buildPortfolioMarkdown(ex).text)
    expect(locateExtractInText('a b\n\nc  d', 'b c d')).toEqual([2, 9])
    expect(locateExtractInText('abc', 'x')).toBeNull()
  })
})
