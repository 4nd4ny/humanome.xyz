import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  mergeSegments,
  segmentText,
  splitSegment,
  toArchiveSegmentation
} from './segment.js'

const FIXTURE_PATH = new URL(
  '../../../schemas/fixtures/portfolio-3-jours.md',
  import.meta.url
)
const fixture = readFileSync(FIXTURE_PATH, 'utf8')

const TODAY = { today: '2026-07-12' }

describe('segmentText — fixture portfolio-3-jours.md (gate P7)', () => {
  const segments = segmentText(fixture, TODAY)

  it('segmente en exactement 3 journées aux bonnes dates', () => {
    expect(segments).toHaveLength(3)
    expect(segments.map((s) => s.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07'
    ])
  })

  it('capture les titres des entêtes de journée', () => {
    expect(segments.map((s) => s.titre)).toEqual([
      'Lundi 5 janvier 2026',
      'Mardi 6 janvier 2026',
      'Mercredi 7 janvier 2026'
    ])
  })

  it('produit des offsets exacts couvrant tout le texte (contrat archive-export)', () => {
    expect(segments[0].debut).toBe(0) // titre de document rattaché au 1er jour
    expect(segments[2].fin).toBe(fixture.length)
    for (const segment of segments) {
      expect(segment.texte).toBe(fixture.slice(segment.debut, segment.fin))
    }
    // Couverture contiguë : aucune perte de texte entre les journées.
    expect(segments[0].fin).toBe(segments[1].debut)
    expect(segments[1].fin).toBe(segments[2].debut)
  })

  it('répartit le contenu dans la bonne journée', () => {
    expect(segments[0].texte).toContain('la classe de CM2 de Mme Ferrand')
    expect(segments[1].texte).toContain('Sofiane a lancé une vanne')
    expect(segments[2].texte).toContain('Le vernissage a eu lieu')
    // Les années seules du texte (1932, 1928, 1952, 1998) ne coupent pas.
    expect(segments[1].texte).toContain('datait la halle de 1932')
  })
})

describe('segmentText — variantes de formats de dates', () => {
  it('entête markdown ISO « ## 2025-12-22 »', () => {
    const text = '## 2025-12-22\n\nJournée A.\n\n## 2025-12-23\n\nJournée B.\n'
    const segments = segmentText(text, TODAY)
    expect(segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23'])
  })

  it('ISO en ligne nue « 2025-12-22 »', () => {
    const segments = segmentText('2025-12-22\nMatin studieux.\n2025-12-23\nSoir calme.', TODAY)
    expect(segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23'])
  })

  it('numérique FR « 22/12/2025 », « 22.12.2025 » et « 22-12-2025 »', () => {
    expect(segmentText('22/12/2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22.12.2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22-12-2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
  })

  it('numérique FR au premier du mois « 1er.01.2026 », « ### 1er/02/2026 » ; jamais « 11er » ni « 2er »', () => {
    expect(segmentText('1er.01.2026\ntexte', TODAY)[0].date).toBe('2026-01-01')
    expect(segmentText('### 1er/02/2026\ntexte', TODAY)[0].date).toBe('2026-02-01')
    const twoDays = segmentText('### 2.01.2026\nun\n\n### 1er.01.2026\ndeux', TODAY)
    expect(twoDays.map((s) => s.date)).toEqual(['2026-01-02', '2026-01-01'])
    for (const notADate of ['11er.01.2026', '2er.01.2026']) {
      expect(segmentText(`avant\n${notADate}\ntexte`, TODAY).map((s) => s.date)).not.toContain('2026-01-11')
      expect(segmentText(`avant\n${notADate}\ntexte`, TODAY)).toHaveLength(1)
    }
  })

  it('texte FR « 22 décembre 2025 », avec ou sans accent, et « 1er janvier 2026 »', () => {
    expect(segmentText('22 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22 decembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('1er janvier 2026\ntexte', TODAY)[0].date).toBe('2026-01-01')
    expect(segmentText('15 août 2025\ntexte', TODAY)[0].date).toBe('2025-08-15')
  })

  it('jour de semaine + date : « Lundi 22 décembre 2025 », « Mardi, le 23 décembre 2025 »', () => {
    expect(segmentText('Lundi 22 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('Mardi, le 23 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-23')
  })

  it('« Lundi 22 décembre » sans année : coupe, mais date inconnue (null)', () => {
    const segments = segmentText('Intro libre.\n\nLundi 22 décembre\nJournée sans année.', TODAY)
    const last = segments[segments.length - 1]
    expect(last.date).toBe(null)
    expect(last.titre).toBe('Lundi 22 décembre')
  })

  it('titre court après la date : « ## 2025-12-22 — Retour à l’atelier », « 22/12/2025 : bilan »', () => {
    const a = segmentText('## 2025-12-22 — Retour à l’atelier\ntexte', TODAY)
    expect(a[0].date).toBe('2025-12-22')
    expect(a[0].titre).toBe('2025-12-22 — Retour à l’atelier')
    const b = segmentText('22/12/2025 : bilan de la semaine\ntexte', TODAY)
    expect(b[0].date).toBe('2025-12-22')
  })

  it('rejette les dates hors calendrier (« 45/13/2025 », « 2025-02-30 »)', () => {
    expect(segmentText('45/13/2025\ntexte', TODAY)).toHaveLength(1)
    expect(segmentText('45/13/2025\ntexte', TODAY)[0].date).toBe('2026-07-12')
    expect(segmentText('## 2025-02-30\ntexte', TODAY)[0].date).toBe('2026-07-12')
  })
})

// Un portfolio synthétique aux titres de tous niveaux, années sur deux chiffres :
// Twin9 n'en date que les titres ## et ### non indentés (02, 06 et 14 ; le 4,
// sous ####, reste dans la journée du 2).
const MIXED_LEVELS =
  '### 02.03.26\n\nun\n\n#### 04.03.26\n\ndeux\n\n### 06.03.26\n\ntrois\n\n# 08.03.26\n\nquatre\n\n' +
  '   ### 10.03.26\n\ncinq\n\n###### 12.03.26\n\nsix\n\n## 14.03.26\n\nsept\n'
const NO_DATE = '0000-00-00'
const interfaceDates = (text) =>
  segmentText(text, { today: NO_DATE })
    .map((s) => s.date)
    .filter((d) => d !== null && d !== NO_DATE)
    .sort()

describe('segmentText — années à deux chiffres, comme Twin9 (carto, sprint 4)', () => {
  it('« ### 02.03.26 » est le 2026-03-02 ; « ## 9.3.26 », « ### Lundi 02.03.26 — Atelier » aussi', () => {
    const text = '### 02.03.26\n\nun\n\n## 9.3.26\n\ndeux\n\n### Lundi 16.03.26 — Atelier\n\ntrois\n'
    expect(segmentText(text, TODAY).map((s) => s.date)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16'])
    expect(segmentText('### **27.03.26**\ntexte', TODAY)[0].date).toBe('2026-03-27')
  })

  it('là où Twin9 ne lit pas la date, elle reste du texte : ligne nue, titre # ou #### à ######, titre indenté, « / » ou « - », « 1er », trois chiffres, hors calendrier', () => {
    const lines = ['02.03.26', '1.2.10', '# 02.03.26', '#### 02.03.26', '###### 02.03.26', '   ### 02.03.26', ' ## 02.03.26']
    for (const line of [...lines, '### 02/03/26', '### 02-03-26', '### 1er.03.26', '### 12.03.202', '### 31.02.26', '### 02.03.26abc']) {
      const segments = segmentText(`### 2026-03-01\navant\n${line}\naprès`, TODAY)
      expect(segments.map((s) => s.date), line).toEqual(['2026-03-01'])
    }
  })

  // Twin9 (Portfolio.php) : `^#{2,3}` suivi d'un blanc, en début de ligne.
  it('titres de niveaux mêlés : seuls ## et ###, en début de ligne, ouvrent une journée', () => {
    expect(interfaceDates(MIXED_LEVELS)).toEqual(['2026-03-02', '2026-03-06', '2026-03-14'])
  })

  it('l’année à quatre chiffres ne change pas', () => {
    expect(segmentText('22.12.2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('### 02.03.2026\ntexte', TODAY)[0].date).toBe('2026-03-02')
  })
})

// Les cinq portfolios fictifs du moteur Twin9 (dépôt privé : `TWIN_V9_DIR`,
// par défaut cloné à côté de celui-ci, ../Twin_v9 ; sans lui, sauté — jamais
// recopiés ici, le dépôt alimente un miroir public). Les journées de
// l'interface sont celles de Twin9 : mêmes dates, triées (Twin9 trie ses
// feuilles), sans la date de repli de l'interface (un texte sans en-tête
// daté : Twin9 n'en a aucune).
const TWIN_V9_DIR = process.env.TWIN_V9_DIR || join(dirname(fileURLToPath(import.meta.url)), '../../../../Twin_v9')
const TWIN9_PORTFOLIOS = join(TWIN_V9_DIR, 'tests/portfolios')
const hasTwin9 = existsSync(TWIN9_PORTFOLIOS)
// Dates de `Portfolio::splitFile` (PHP) et `split_portfolio` (Python) de
// Twin_v9 (9eea3a1) sur ces fichiers, relevées le 2026-10-22.
const TWIN9_DATES = {
  'PLANT-01.md': ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09', '2026-03-11', '2026-03-13', '2026-03-16', '2026-03-19', '2026-03-23', '2026-03-27'],
  'SYNTH-01.md': [],
  'SYNTH-02.md': [],
  'SYNTH-06.md': [],
  'SYNTH-08.md': []
}
describe.skipIf(!hasTwin9)('segmentText — les portfolios fictifs de Twin9 : mêmes journées', () => {
  it('les cinq portfolios sont là', () => {
    expect(readdirSync(TWIN9_PORTFOLIOS).filter((f) => f.endsWith('.md')).sort()).toEqual(Object.keys(TWIN9_DATES))
  })

  for (const [file, dates] of Object.entries(TWIN9_DATES)) {
    it(`${file} : ${dates.length ? `${dates.length} journées, du ${dates[0]} au ${dates.at(-1)}` : 'aucune date (titres sans date)'}`, () => {
      expect(interfaceDates(readFileSync(join(TWIN9_PORTFOLIOS, file), 'utf8'))).toEqual(dates)
    })
  }

  // Le moteur lui-même, quand PHP et ses dépendances sont là : la table ci-dessus est bien la sienne.
  const php = (() => {
    if (!existsSync(join(TWIN_V9_DIR, 'php/vendor/autoload.php'))) return false
    try {
      execFileSync('php', ['-v'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()
  it.skipIf(!php)('Twin9 (PHP) donne ces dates', () => {
    const code = 'require $argv[1] . "/php/vendor/autoload.php"; $o = []; foreach (glob($argv[1] . "/tests/portfolios/*.md") as $f) { $d = array_values(array_filter(array_column(\\Twin9\\Portfolio::splitFile($f)["feuilles"], "date"))); sort($d); $o[basename($f)] = $d; } echo json_encode($o);'
    expect(JSON.parse(execFileSync('php', ['-r', code, TWIN_V9_DIR], { encoding: 'utf8' }))).toEqual(TWIN9_DATES)
  })

  it.skipIf(!php)('Twin9 (PHP) : titres de niveaux mêlés, les mêmes journées que l’interface', () => {
    const code = 'require $argv[1] . "/php/vendor/autoload.php"; $d = array_values(array_filter(array_column(\\Twin9\\Portfolio::split($argv[2], "niveaux.md")["feuilles"], "date"))); sort($d); echo json_encode($d);'
    const twin9 = JSON.parse(execFileSync('php', ['-r', code, TWIN_V9_DIR, MIXED_LEVELS], { encoding: 'utf8' }))
    expect(twin9).toEqual(['2026-03-02', '2026-03-06', '2026-03-14'])
    expect(interfaceDates(MIXED_LEVELS)).toEqual(twin9)
  })
})

describe('segmentText — séparateurs et repli', () => {
  it('coupe sur « --- » et « === » (segments non datés)', () => {
    const text = 'Premier jour au marché.\n---\nDeuxième jour au four.\n===\nTroisième jour au moulin.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(3)
    expect(segments.map((s) => s.date)).toEqual([null, null, null])
    expect(segments[1].texte).toContain('Deuxième jour')
    for (const segment of segments) {
      expect(segment.texte).toBe(text.slice(segment.debut, segment.fin))
    }
  })

  it('après une entête datée, un trait ne coupe plus : il reste dans sa journée (journal carto D-55)', () => {
    // Un journal exporté de Google Docs : des traits dans les journées, et entre elles.
    const text =
      '# Journal\n\n### 22.12.2025\n\nMatin.\n\n---\n\nAprès-midi.\n\n***\n\nSoir.\n\n---\n\n' +
      '### 23.12.2025\n\nLendemain.\n\n---\n\nFin du journal.\n'
    const segments = segmentText(text, TODAY)
    expect(segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23'])
    expect(segments[0].texte).toContain('Matin.\n\n---\n\nAprès-midi.\n\n***\n\nSoir.\n\n---\n\n')
    expect(segments[1].texte.endsWith('Lendemain.\n\n---\n\nFin du journal.\n')).toBe(true)
    // Couverture contiguë, sans perte : le texte entier, journée après journée.
    expect(segments[0].debut).toBe(0)
    expect(segments[0].fin).toBe(segments[1].debut)
    expect(segments[1].fin).toBe(text.length)
    for (const segment of segments) expect(segment.texte).toBe(text.slice(segment.debut, segment.fin))
    // Avant la première entête datée, le trait coupe encore : passages sans date.
    const avant = segmentText('Introduction.\n\n---\n\nAvertissement.\n\n## 2025-12-22\nJournée.\n---\nSuite.', TODAY)
    expect(avant.map((s) => s.date)).toEqual([null, null, '2025-12-22'])
    expect(avant[2].texte).toBe('## 2025-12-22\nJournée.\n---\nSuite.')
  })

  it('un souligné « === » collé sous une entête datée est décoratif, pas une coupe', () => {
    const text = '22 décembre 2025\n================\nJournée soulignée.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2025-12-22')
    expect(segments[0].texte).toContain('Journée soulignée.')
  })

  it('texte sans aucune date : bloc unique daté du jour', () => {
    const segments = segmentText('Un texte réflexif sans la moindre date dedans.', TODAY)
    expect(segments).toEqual([
      {
        date: '2026-07-12',
        texte: 'Un texte réflexif sans la moindre date dedans.',
        debut: 0,
        fin: 46
      }
    ])
  })

  it('texte vide ou blanc : aucun segment', () => {
    expect(segmentText('', TODAY)).toEqual([])
    expect(segmentText('   \n\n  ', TODAY)).toEqual([])
  })

  it('préambule réel (non titre) : segment non daté conservé en tête', () => {
    const text = 'Quelques notes générales avant le journal.\n\n## 2025-12-22\nJournée A.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(2)
    expect(segments[0].date).toBe(null)
    expect(segments[0].debut).toBe(0)
    expect(segments[1].date).toBe('2025-12-22')
  })
})

describe('segmentText — dates dupliquées et faux positifs', () => {
  it('fusionne les journées consécutives portant la même date', () => {
    const text = '## 2025-12-22\nMatin.\n\n## 2025-12-22\nSoir.\n\n## 2025-12-23\nLendemain.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(2)
    expect(segments[0].date).toBe('2025-12-22')
    expect(segments[0].texte).toContain('Matin.')
    expect(segments[0].texte).toContain('Soir.')
    expect(segments[1].date).toBe('2025-12-23')
  })

  it('une date au milieu d’une phrase ne coupe PAS', () => {
    const text =
      '## 2026-01-05\nNous avons prévu de nous revoir le 22 décembre 2025 au marché de Noël, ' +
      'puis le 03/01/2026 chez Camille.\nFin de la journée.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2026-01-05')
  })

  it('une ligne qui COMMENCE par une date mais continue en prose ne coupe pas', () => {
    const text =
      'Notes du stage.\n\n22 décembre 2025, nous sommes partis tôt vers la montagne pour la ' +
      'collecte des récits sonores du village.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2026-07-12') // repli bloc unique
  })

  it('« 22 décembre » nu (sans année ni ancre) ne coupe pas', () => {
    const segments = segmentText('Rendez-vous pris.\n22 décembre\nOn verra bien.', TODAY)
    expect(segments).toHaveLength(1)
  })
})

describe('mergeSegments', () => {
  const text = '## 2025-12-22\nJournée A.\n## 2025-12-23\nJournée B.\n## 2025-12-24\nJournée C.'
  const segments = segmentText(text, TODAY)

  it('fusionne une journée avec la précédente (offsets et texte exacts)', () => {
    const merged = mergeSegments(segments, 1, text)
    expect(merged).toHaveLength(2)
    expect(merged[0].date).toBe('2025-12-22')
    expect(merged[0].debut).toBe(segments[0].debut)
    expect(merged[0].fin).toBe(segments[1].fin)
    expect(merged[0].texte).toBe(text.slice(merged[0].debut, merged[0].fin))
    expect(merged[0].texte).toContain('Journée A.')
    expect(merged[0].texte).toContain('Journée B.')
    expect(merged[1].date).toBe('2025-12-24')
  })

  it('sans fullText, concatène les textes (segments contigus)', () => {
    const merged = mergeSegments(segments, 2)
    expect(merged[1].texte).toBe(segments[1].texte + segments[2].texte)
  })

  it('hérite de la date suivante quand la précédente est nulle', () => {
    const undated = segmentText('Préambule réel.\n\n## 2025-12-22\nJournée A.', TODAY)
    expect(undated[0].date).toBe(null)
    const merged = mergeSegments(undated, 1)
    expect(merged).toHaveLength(1)
    expect(merged[0].date).toBe('2025-12-22')
  })

  it('ne mute pas le tableau d’entrée et valide l’index', () => {
    const before = JSON.parse(JSON.stringify(segments))
    mergeSegments(segments, 1, text)
    expect(segments).toEqual(before)
    expect(() => mergeSegments(segments, 0)).toThrow(RangeError)
    expect(() => mergeSegments(segments, 3)).toThrow(RangeError)
    expect(() => mergeSegments(segments, 1.5)).toThrow(RangeError)
  })
})

describe('splitSegment', () => {
  const text = '## 2025-12-22\nMatin au four.\nSoir au moulin.'
  const segments = segmentText(text, TODAY)
  const offset = segments[0].texte.indexOf('Soir')

  it('scinde au curseur : offsets contigus, seconde partie non datée', () => {
    const split = splitSegment(segments, 0, offset)
    expect(split).toHaveLength(2)
    expect(split[0].date).toBe('2025-12-22')
    expect(split[0].fin).toBe(split[1].debut)
    expect(split[0].texte).toContain('Matin au four.')
    expect(split[1].date).toBe(null)
    expect(split[1].texte).toBe('Soir au moulin.')
    expect(split[1].fin).toBe(text.length)
    for (const segment of split) {
      expect(segment.texte).toBe(text.slice(segment.debut, segment.fin))
    }
  })

  it('est l’inverse de mergeSegments', () => {
    const roundTrip = mergeSegments(splitSegment(segments, 0, offset), 1, text)
    expect(roundTrip).toEqual(segments)
  })

  it('rejette un offset hors du texte du segment', () => {
    expect(() => splitSegment(segments, 0, 0)).toThrow(RangeError)
    expect(() => splitSegment(segments, 0, segments[0].texte.length)).toThrow(RangeError)
    expect(() => splitSegment(segments, 5, 3)).toThrow(RangeError)
  })
})

describe('toArchiveSegmentation', () => {
  it('projette les segments datés sur le contrat {date, debut, fin}', () => {
    const segments = segmentText(fixture, TODAY)
    const archive = toArchiveSegmentation(segments)
    expect(archive).toHaveLength(3)
    expect(archive[0]).toEqual({ date: '2026-01-05', debut: 0, fin: segments[0].fin })
    for (const entry of archive) {
      expect(Object.keys(entry).sort()).toEqual(['date', 'debut', 'fin'])
    }
  })

  it('écarte les segments non datés', () => {
    const segments = segmentText('jour un\n---\njour deux', TODAY)
    expect(toArchiveSegmentation(segments)).toEqual([])
  })
})
