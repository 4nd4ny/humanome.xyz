// Sprint 4, T0 (journal de la cartographie D-73) — le texte envoyé à Twin9 :
// ses journées sont celles de l'interface, et un texte que Twin9 lit déjà ainsi
// part à l'octet. Données fictives ; les cinq portfolios de Twin9 sont lus dans
// `TWIN_V9_DIR` (sautés sans lui), jamais recopiés ici.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { segmentText } from '@engine/portfolio/segment.js'
import { journeesLuesParTwin9, portfolioPourTwin9 } from './portfolio-pour-twin9.js'

const ICI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(ICI, '../../../../schemas/fixtures/twin9-portfolio')
const lire = (nom) => readFileSync(join(FIXTURES, nom), 'utf8')

/** Les journées de l'interface : dates du découpage du site, sans passage sans date, triées. */
const datesDeLInterface = (texte) =>
  [...new Set(segmentText(texte, { today: '0000-00-00' }).map((s) => s.date).filter((d) => d && d !== '0000-00-00'))].sort()
/** Les journées de Twin9, d'après la copie de ses expressions : leurs identifiants, triés. */
const idsDeTwin9 = (texte) => (journeesLuesParTwin9(texte) ?? []).map((f) => f.id).sort()

describe('portfolioPourTwin9 — les onze formes d’en-tête de l’étude du sprint 4 (§4.1)', () => {
  const entree = lire('formes-entree.md')
  const sortie = lire('formes-sortie.md')
  const dix = ['2026-01-24', '2026-01-25', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-09', '2026-02-10']

  it('le texte brut : dix journées pour l’interface, six pour Twin9, dont une (26 janvier) qu’elle n’a pas', () => {
    expect(datesDeLInterface(entree)).toEqual(dix)
    expect(idsDeTwin9(entree)).toEqual(['2026-01-24', '2026-01-25', '2026-01-26', '2026-01-31', '2026-02-09', '2026-02-10'])
  })

  it('le texte envoyé est celui de la fixture, que le test PHP passe au moteur (PortfolioPourTwin9Test)', () => {
    expect(portfolioPourTwin9(entree).texte).toBe(sortie)
  })

  it('envoyé, ses journées sont les mêmes pour l’interface et pour Twin9 : les dix de l’interface', () => {
    expect(datesDeLInterface(sortie)).toEqual(dix)
    expect(idsDeTwin9(sortie)).toEqual(dix)
  })

  it('les journées retouchées : celles qui reçoivent un en-tête, et celles qui rendent un passage qu’elles absorbaient', () => {
    // le 9 février absorbait le 1er ; le 31 janvier, du 30 au 27 ; les 10, 25 et 24 ne changent pas
    expect(portfolioPourTwin9(entree)).toEqual({
      texte: sortie,
      retouchees: ['2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-09'],
      sansDate: 0,
    })
    const avant = new Map(journeesLuesParTwin9(entree).map((f) => [f.id, f.texte]))
    for (const f of journeesLuesParTwin9(sortie).filter((x) => ['2026-02-10', '2026-01-25', '2026-01-24'].includes(x.id))) {
      expect(f.texte).toBe(avant.get(f.id))
    }
  })

  it('ce qu’elle garde, ajoute ou neutralise : l’en-tête lu à la même date gardé, « ### AAAA-MM-JJ » sinon, un titre daté d’un autre jour précédé de « — »', () => {
    expect(sortie).toContain('### 10.02.2026\n---\ntexte fictif 0')
    expect(sortie).toContain('### 2026-02-01\n\n### 1er.02.2026\n')
    expect(sortie).toContain('### 2026-01-30\n\n#### 30.01.2026\n')
    expect(sortie).toContain('### 2026-01-27\n\n### Mardi 27 janvier 2026\n')
    expect(sortie).toContain('\n— ### Retour sur la séance du 26.01.2026\n')
  })

  it('une seconde fois, rien ne change : le texte part tel quel', () => {
    expect(portfolioPourTwin9(sortie)).toEqual({ texte: sortie, retouchees: [], sansDate: 0 })
  })
})

const TWIN_V9_DIR = process.env.TWIN_V9_DIR || join(ICI, '../../../../../Twin_v9')
const PORTFOLIOS = join(TWIN_V9_DIR, 'tests/portfolios')
const avecTwin9 = existsSync(PORTFOLIOS)

describe.skipIf(!avecTwin9)('portfolioPourTwin9 — les cinq portfolios fictifs de Twin9 partent à l’octet', () => {
  const fichiers = avecTwin9 ? readdirSync(PORTFOLIOS).filter((f) => f.endsWith('.md')).sort() : []

  it('les cinq sont là', () => {
    expect(fichiers).toEqual(['PLANT-01.md', 'SYNTH-01.md', 'SYNTH-02.md', 'SYNTH-06.md', 'SYNTH-08.md'])
  })

  for (const f of fichiers) {
    it(`${f} : texte inchangé, aucune journée retouchée ; les journées de Twin9 sont celles de l’interface`, () => {
      const texte = readFileSync(join(PORTFOLIOS, f), 'utf8')
      expect(portfolioPourTwin9(texte)).toEqual({ texte, retouchees: [], sansDate: 0 })
      expect(idsDeTwin9(texte)).toEqual(datesDeLInterface(texte).length > 1 ? datesDeLInterface(texte) : [])
    })
  }

  // La copie des expressions de Portfolio.php, contre le moteur lui-même quand PHP et ses dépendances sont là.
  const php = (() => {
    if (!existsSync(join(TWIN_V9_DIR, 'php/vendor/autoload.php'))) return false
    try {
      execFileSync('php', ['-v'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()
  it.skipIf(!php)('Twin9 (PHP) : mêmes identifiants de journées que la copie, pour les cinq et pour les deux fixtures', () => {
    // un portfolio que Twin9 ne date pas (ses journées F01… sans date) : aucune journée datée
    const code =
      'require $argv[1] . "/php/vendor/autoload.php"; $o = []; foreach (array_slice($argv, 2) as $f) { $fs = \\Twin9\\Portfolio::splitFile($f)["feuilles"]; $ids = in_array(null, array_column($fs, "date"), true) ? [] : array_column($fs, "id"); sort($ids); $o[basename($f)] = $ids; } echo json_encode($o);'
    const chemins = [...fichiers.map((f) => join(PORTFOLIOS, f)), join(FIXTURES, 'formes-entree.md'), join(FIXTURES, 'formes-sortie.md')]
    const twin9 = JSON.parse(execFileSync('php', ['-r', code, TWIN_V9_DIR, ...chemins], { encoding: 'utf8' }))
    for (const c of chemins) expect(twin9[c.split('/').at(-1)], c).toEqual(idsDeTwin9(readFileSync(c, 'utf8')))
  })
})

describe('portfolioPourTwin9 — un journal écrit à rebours, comme les feuilles du journal 300', () => {
  // fictif : du plus récent au plus ancien, le 1er du mois en « 1er » ; Twin9 donne le 1er au 3, qui le précède
  const journal = [
    '### 10.02.2026', 'Nous avons rangé la salle ensemble.', '',
    '### 9.02.2026', 'Le capteur a mesuré la pluie.', '',
    '### 3.02.2026', 'Le chat du voisin a ouvert la porte du jardin.', '',
    '### 1er.02.2026', 'Premier jour du mois, carnet neuf.', '',
  ].join('\n')

  it('seuls le 1er (son en-tête) et le 3 (qui l’absorbait) sont retouchés ; le 10 et le 9 restent à l’octet', () => {
    const r = portfolioPourTwin9(journal)
    expect(r.retouchees).toEqual(['2026-02-01', '2026-02-03'])
    expect(idsDeTwin9(r.texte)).toEqual(datesDeLInterface(journal))
    expect(r.texte).toBe(journal.replace('### 1er.02.2026', '### 2026-02-01\n\n### 1er.02.2026'))
  })
})

describe('portfolioPourTwin9 — deux entrées du même jour, plus de « _b » (C3)', () => {
  const texte = '### 03.02.2026 matin\nLe matin.\n\n### 04.02.2026\nLe lendemain.\n\n### 03.02.2026 soir\nLe soir.\n'

  it('Twin9 lisait 2026-02-03 et 2026-02-03_b ; envoyé, une journée du 3, ses deux passages réunis, le second en-tête neutralisé', () => {
    expect(idsDeTwin9(texte)).toEqual(['2026-02-03', '2026-02-03_b', '2026-02-04'])
    const r = portfolioPourTwin9(texte)
    expect(r.texte).toBe('### 03.02.2026 matin\nLe matin.\n\n— ### 03.02.2026 soir\nLe soir.\n\n### 04.02.2026\nLe lendemain.\n')
    expect(idsDeTwin9(r.texte)).toEqual(['2026-02-03', '2026-02-04'])
    expect(r.retouchees).toEqual(['2026-02-03'])
  })
})

describe('portfolioPourTwin9 — le découpage de la fiche du portfolio', () => {
  const texte = '### 2026-03-02\nLundi.\n\n### 2026-03-03\nMardi.\n\n### 2026-03-04\nMercredi.\n'
  const auto = segmentText(texte, { today: '0000-00-00' })

  it('des journées fusionnées à la main restent fusionnées : l’en-tête intérieur est neutralisé, des deux côtés', () => {
    const segments = [{ ...auto[0], texte: auto[0].texte + auto[1].texte, fin: auto[1].fin }, auto[2]]
    const r = portfolioPourTwin9(texte, { segments })
    expect(r.texte).toBe('### 2026-03-02\nLundi.\n\n— ### 2026-03-03\nMardi.\n\n### 2026-03-04\nMercredi.\n')
    expect(idsDeTwin9(r.texte)).toEqual(['2026-03-02', '2026-03-04'])
    expect(datesDeLInterface(r.texte)).toEqual(['2026-03-02', '2026-03-04'])
    expect(r.retouchees).toEqual(['2026-03-02'])
  })

  it('une date corrigée à la main : l’en-tête qu’elle contredit est neutralisé, le bon ajouté', () => {
    const segments = [auto[0], { ...auto[1], date: '2026-03-05' }, auto[2]]
    const r = portfolioPourTwin9(texte, { segments })
    expect(r.texte).toContain('### 2026-03-05\n\n— ### 2026-03-03\nMardi.')
    expect(idsDeTwin9(r.texte)).toEqual(['2026-03-02', '2026-03-04', '2026-03-05'])
    expect(r.retouchees).toEqual(['2026-03-05'])
  })

  it('des segments qui ne sont pas ceux du texte (une fiche d’avant, des marques retirées depuis) : le découpage du site', () => {
    const autres = [{ date: '2026-03-02', texte: 'Lundi <mark data-twin9-code="1.01">marqué</mark>.' }, { date: '2026-03-09', texte: 'Ailleurs.' }]
    expect(portfolioPourTwin9(texte, { segments: autres })).toEqual({ texte, retouchees: [], sansDate: 0 })
  })
})

describe('portfolioPourTwin9 — passages sans date, cas limites', () => {
  it('un passage sans date reste en tête, ses dates neutralisées : Twin9 ne le lit pas, il est compté', () => {
    const texte = 'Mon introduction.\n### Retour sur la séance du 26.01.2026\nRien.\n\n#### 27.01.2026\nUn.\n\n#### 28.01.2026\nDeux.\n'
    const r = portfolioPourTwin9(texte)
    expect(r.sansDate).toBe(1)
    expect(r.texte.startsWith('Mon introduction.\n— ### Retour sur la séance du 26.01.2026\nRien.\n\n### 2026-01-27')).toBe(true)
    expect(idsDeTwin9(r.texte)).toEqual(['2026-01-27', '2026-01-28'])
    expect(datesDeLInterface(r.texte)).toEqual(['2026-01-27', '2026-01-28'])
  })

  it('moins de deux journées datées : le texte part tel quel (Twin9 ne date rien à moins de deux titres)', () => {
    for (const t of ['', 'Un texte sans date.\n', '#### 27.01.2026\nUn seul jour.\n', 'Sans date.\n\n### 2026-01-25\nUn.\n']) {
      expect(portfolioPourTwin9(t)).toEqual({ texte: t, retouchees: [], sansDate: 0 })
    }
    expect(portfolioPourTwin9(undefined)).toEqual({ texte: '', retouchees: [], sansDate: 0 })
  })

  it('un export Google Docs que Twin9 date déjà (une date seule, puis un trait « ___ ») part à l’octet', () => {
    const texte = '12.03.2026\n\n________________\n\nPremier.\n\n13.03.2026\n\n________________\n\nSecond.\n'
    expect(idsDeTwin9(texte)).toEqual(['2026-03-12', '2026-03-13'])
    expect(portfolioPourTwin9(texte)).toEqual({ texte, retouchees: [], sansDate: 0 })
  })

  it('« ## » seul, une date à la ligne suivante : Twin9 y lit un titre daté (ses blancs comprennent « \\n ») ; neutralisé jusqu’au bout', () => {
    expect(idsDeTwin9('##\nvu le 12.03.2026\n\n### 2026-03-11\nA.\n')).toEqual(['2026-03-11', '2026-03-12'])
    const texte = '### 2026-03-11\nA.\n##\n### 2026-03-12\nB.\n\n### 2026-03-13\nC.\n'
    const r = portfolioPourTwin9(texte, { segments: [{ date: '2026-03-11', texte: '### 2026-03-11\nA.\n##\n### 2026-03-12\nB.\n\n' }, { date: '2026-03-13', texte: '### 2026-03-13\nC.\n' }] })
    expect(r.texte).toBe('### 2026-03-11\nA.\n— ##\n— ### 2026-03-12\nB.\n\n### 2026-03-13\nC.\n')
    expect(idsDeTwin9(r.texte)).toEqual(['2026-03-11', '2026-03-13'])
  })

  it('les chiffres de toute écriture, comme Twin9 (« ### ０２.０３.２６ » est le 2026-03-02) ; une date qu’il lit autrement que l’interface', () => {
    expect(idsDeTwin9('### ０２.０３.２６\nA.\n\n### ٠٤.٠٣.٢٠٢٦\nB.\n')).toEqual(['2026-03-02', '2026-03-04'])
    // l'interface ne lit pas ces chiffres : rien n'y ouvre une journée, le texte part tel quel
    expect(portfolioPourTwin9('### ０２.０３.２６\nA.\n\n### ٠٤.٠٣.٢٠٢٦\nB.\n').retouchees).toEqual([])
  })

  it('fins de ligne Windows et BOM : le texte envoyé a des fins de ligne « \\n », ses journées celles de l’interface', () => {
    const texte = '﻿### 9.02.2026\r\nUn.\r\n\r\n### 1er.02.2026\r\nDeux.\r\n'
    const r = portfolioPourTwin9(texte)
    expect(r.texte).toBe('### 9.02.2026\nUn.\n\n### 2026-02-01\n\n### 1er.02.2026\nDeux.\n')
    expect(r.retouchees).toEqual(['2026-02-01', '2026-02-09'])
  })
})
