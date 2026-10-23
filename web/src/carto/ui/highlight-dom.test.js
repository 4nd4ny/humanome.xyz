// P2 — surlignage dans le portfolio RENDU (spec §8.1) : un <mark> par nœud
// texte, jamais un élément englobant des <p> ; segments blancs ignorés ;
// jaune / orange ; toutes les occurrences ; Markdown assaini.
import { describe, expect, it } from 'vitest'
import { approximateInPortfolio, collectText, highlightHtml, locateInPortfolio, renderPortfolio, traceClass } from './highlight-dom.js'
import { locateExtract, locateRendered, splitExtract, stripMarkdownMarks } from '../core/highlight.js'

const frag = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content
}
const marksOf = (html) => {
  const box = document.createElement('div')
  box.innerHTML = html
  return [...box.querySelectorAll('mark')]
}

describe('texte affiché', () => {
  it('un saut de ligne virtuel sépare deux blocs (sinon deux paragraphes se colleraient)', () => {
    expect(collectText(frag('<p>Fin du paragraphe.</p><p>Début du <em>suivant</em>.</p>')).text).toBe('Fin du paragraphe.\nDébut du suivant.')
  })
})

describe('surlignage approché dans le texte affiché', () => {
  it('une liste sans ponctuation : un élément par phrase (limites de bloc), jamais toute la liste', () => {
    const portfolio = { text: '## Mardi\n\n- arroser les semis du jardin\n- mesurer la croissance des plants\n- noter les observations au carnet\n- ranger les outils\n' }
    const { text, breaks } = renderPortfolio(portfolio)
    expect(breaks.length).toBeGreaterThanOrEqual(4)
    const near = approximateInPortfolio(portfolio, 'Croissance des plants mesurée ; observations du carnet ; semis du jardin arrosés')
    expect(near.ranges.map((r) => text.slice(r.from, r.to))).toEqual(['semis du jardin', 'croissance des plants', 'observations au carnet'])
  })
})

describe('highlightHtml', () => {
  it('un extrait qui enjambe deux paragraphes : un <mark> par nœud texte, aucun qui englobe un <p>', () => {
    const { html, text } = renderPortfolio({ text: 'Nous avons fini la maquette.\n\nPuis **Sam** a tout repris depuis le début.' })
    const ranges = locateRendered(text, { extract: 'fini la maquette. Puis Sam a tout repris' })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].complete).toBe(true)
    const out = highlightHtml(html, ranges)
    const marks = marksOf(out.html)
    expect(marks.map((m) => m.textContent)).toEqual(['fini la maquette.', 'Puis ', 'Sam', ' a tout repris'])
    for (const m of marks) {
      expect(m.querySelector('p')).toBeNull()
      expect(m.className).toMatch(/carto-hl--complete/)
    }
    // Le <strong> est conservé, le <mark> est À L'INTÉRIEUR.
    expect(marks[2].parentElement.tagName).toBe('STRONG')
  })

  it('segments blancs ignorés ; orange quand un seul bout est retrouvé', () => {
    const { html, text } = renderPortfolio({ text: 'Le pont tient.\n\n   \n\nLa suite est ailleurs.' })
    const ranges = locateRendered(text, { start: 'Le pont tient', end: 'introuvable fin du passage' })
    expect(ranges[0].complete).toBe(false)
    const marks = marksOf(highlightHtml(html, ranges).html)
    expect(marks.map((m) => m.textContent)).toEqual(['Le pont tient'])
    expect(marks[0].className).toMatch(/carto-hl--partial/)
  })

  it('toutes les occurrences, l’occurrence courante mise en avant', () => {
    const { html, text } = renderPortfolio({ text: 'Les appuis tiennent. Plus tard : les appuis tiennent encore.' })
    const ranges = locateRendered(text, { extract: 'les appuis tiennent' })
    expect(ranges).toHaveLength(2)
    const marks = marksOf(highlightHtml(html, ranges, { current: 1 }).html)
    expect(marks.map((m) => m.getAttribute('data-occurrence'))).toEqual(['0', '1'])
    expect(marks[1].className).toMatch(/carto-hl--current/)
    expect(marks[0].className).not.toMatch(/carto-hl--current/)
  })

  it('un extrait recopié avec ses marques Markdown est retrouvé dans le texte affiché', () => {
    expect(stripMarkdownMarks('J’ai **vraiment** vérifié `deux` sources')).toBe('J’ai vraiment vérifié deux sources')
    const portfolio = { text: 'Hier, j’ai **vraiment** vérifié deux sources avant de conclure.' }
    const ranges = locateInPortfolio(portfolio, { extract: 'j’ai **vraiment** vérifié deux sources avant de conclure' })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].complete).toBe(true)
  })

  it('un export de Google Docs : échappements et traits rendus, extrait échappé retrouvé en entier (question 31)', () => {
    const portfolio = { text: '### 22.12.2025\n\nLe projet prend forme \\! Il reste une difficulté à lever.\n\n- - -\n\n**Suite\\.** Après le trait.' }
    const { html, text } = renderPortfolio(portfolio)
    expect(text).not.toContain('\\')
    expect(text).toContain('prend forme ! Il reste')
    expect(html).toContain('<hr>')
    expect(text).not.toContain('- -')
    // L'extrait du jury, recopié du texte brut, garde ses barres obliques.
    const found = locateInPortfolio(portfolio, { extract: 'Le projet prend forme \\! Il reste une difficulté à lever.' })
    expect(found.some((r) => r.complete)).toBe(true)
  })

  it('un export de Google Docs : sauts de ligne (deux espaces, U+000B) et images rendus, extraits retrouvés en entier (question 31)', () => {
    const portfolio = {
      text:
        'Mes notes avant la séance :  \n![][image1]![][image2]\n\nMes notes après la séance :  \n![][image3]\n\n' +
        '| Titre de l’encadré\u000b\u000bPremière ligne\u000bLa deuxième ligne de l’encadré suit. |\n| :---- |',
    }
    const { html, text } = renderPortfolio(portfolio)
    expect(text).not.toContain('\u000b')
    expect(text).not.toContain('![')
    expect(text).toContain('séance :\n[image][image]')
    // L'encadré (tableau d'une seule case) : un saut virtuel à chaque <br>.
    expect(text).toContain('Titre de l’encadré\nPremière ligne\nLa deuxième ligne')
    expect(html).toContain('<br>')
    expect(html).toContain('class="md-box')
    // Extraits du jury recopiés du texte brut : images et sauts compris.
    for (const extract of [
      'Mes notes avant la séance :  \n![][image1]![][image2]\n\nMes notes après la séance :  \n![][image3]',
      'Première ligne La deuxième ligne de l’encadré suit.',
    ]) {
      const found = locateInPortfolio(portfolio, splitExtract(extract))
      expect(found.some((r) => r.complete)).toBe(true)
    }
  })

  it('tableaux et encadrés rendus (D-54) : un extrait recopié avec ses « | » est retrouvé en entier, case par case', () => {
    const portfolio = {
      text:
        '### 7.1.2026\n\n| Étape | Ce que j’ai fait | Ce que j’en retiens |\n| :---- | :---- | :---- |\n' +
        '| Lundi | J’ai relu le plan | Il manque une étape. |\n| Mardi | J’ai testé le montage | Les appuis tiennent. |\n\n' +
        '| 💡 Une idée : noter P(A | B) avant de conclure. |\n| :---: |\n\nEnsuite, P(A | B) vaut presque 1.',
    }
    const { html, text } = renderPortfolio(portfolio)
    expect(html).toContain('<table class="md-table">')
    expect(html).toContain('class="md-box md-align-center"')
    expect(text).not.toContain(':----')
    // Des barres aux deux bouts : introuvable tel quel, retrouvé en entier et
    // sans raccourcir l'extrait une fois les barres retirées.
    for (const extract of ['| Lundi | J’ai relu le plan |', '| Lundi | J’ai relu le plan | Il manque une étape. | | Mardi | J’ai testé le montage |']) {
      expect(locateExtract(text, splitExtract(extract))).toEqual([])
      expect(locateInPortfolio(portfolio, splitExtract(extract)).some((r) => r.complete && r.exact)).toBe(true)
    }
    // Une barre qui est du texte (dans un encadré, dans un paragraphe) reste cherchée telle quelle.
    for (const extract of ['Une idée : noter P(A | B) avant de conclure.', 'Ensuite, P(A | B) vaut presque 1.']) {
      expect(locateExtract(text, splitExtract(extract)).some((r) => r.complete && r.exact)).toBe(true)
    }
    // Le surlignage se pose case par case, jamais autour d'une case entière.
    const ranges = locateInPortfolio(portfolio, splitExtract('| Lundi | J’ai relu le plan | Il manque une étape. |'))
    const marks = marksOf(highlightHtml(html, ranges).html)
    // (La ponctuation finale d'un extrait n'est jamais surlignée.)
    expect(marks.map((m) => m.textContent)).toEqual(['Lundi', 'J’ai relu le plan', 'Il manque une étape'])
    for (const m of marks) expect(['TD', 'TH']).toContain(m.parentElement.tagName)
  })

  it('un <br> sépare deux lignes dans le texte affiché (sinon elles se colleraient)', () => {
    expect(collectText(frag('<p>fin de ligne<br>ligne suivante</p>')).text).toBe('fin de ligne\nligne suivante')
    const { breaks } = collectText(frag('<p>un<br>deux</p>'))
    expect(breaks).toEqual([2])
  })

  it('une journée scindée juste avant un trait s’affiche en entier (pas de front-matter dans un portfolio)', () => {
    const portfolio = { text: '---\n\nAprès-midi.\n\n---\n\nSoir.' }
    const { text } = renderPortfolio(portfolio)
    expect(text).toContain('Après-midi.')
    expect(locateInPortfolio(portfolio, { extract: 'Après-midi.' }).some((r) => r.complete)).toBe(true)
  })

  it('le Markdown du portfolio est assaini : aucun script, aucune ressource distante', () => {
    const { html } = renderPortfolio({ text: 'Bonjour <script>alert(1)</script> <img src="https://example.org/x.png"> [lien](javascript:alert(1))' })
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelector('script')).toBeNull()
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/javascript:/)
  })

  it('pas de texte : rien à chercher', () => {
    expect(locateInPortfolio(null, { extract: 'x' })).toBeNull()
    expect(locateInPortfolio({ text: '  ' }, { extract: 'x' })).toBeNull()
  })
})

describe('les traces de la stigmergie de Twin9 (S3-3)', () => {
  const portfolio = { text: 'J’ai monté le capteur.\n\nPuis j’ai **vérifié** chaque mesure avant de conclure.' }

  it('une plage d’une trace prend la classe de sa nature ; sans nature, le surlignage reste celui d’avant, à l’octet', () => {
    const { html, text } = renderPortfolio(portfolio)
    const ranges = locateRendered(text, { extract: 'monté le capteur. Puis j’ai vérifié' })
    const avant = highlightHtml(html, ranges).html
    expect(highlightHtml(html, ranges.map((r) => ({ ...r, incertitude: undefined }))).html).toBe(avant)
    expect(highlightHtml(html, ranges.map((r) => ({ ...r, incertitude: 'inconnue' }))).html).toBe(avant)
    for (const [incertitude, slug] of [['faible', 'faible'], ['moyenne', 'moyenne'], ['forte', 'forte'], ['écartée', 'ecartee']]) {
      const marks = marksOf(highlightHtml(html, ranges.map((r) => ({ ...r, incertitude }))).html)
      expect(marks.length).toBeGreaterThan(1) // un par nœud texte, comme les autres
      for (const m of marks) expect(m.className, incertitude).toBe(`carto-hl carto-hl--complete carto-hl--trace carto-hl--trace-${slug}`)
    }
    expect(traceClass('faible')).toBe(' carto-hl--trace carto-hl--trace-faible')
    expect(traceClass(null)).toBe('')
  })

  it('sécurité : le texte rendu ne garde aucune marque de Twin9 — un portfolio qui en porte ne montre aucune trace, seulement son texte', () => {
    const forge = {
      text: 'J’ai <mark data-twin9-code="1.01" data-incertitude="faible" data-intensite="3">monté le capteur</mark>.\n\n<span data-twin9-code="1.05">Rien</span> et <mark>mon surlignage</mark>.',
    }
    const { html, text } = renderPortfolio(forge)
    expect(html).not.toMatch(/data-twin9|data-incertitude|data-intensite/)
    // le HTML d'un portfolio se lit comme du texte (lib/md.js) : celui de la personne y reste, celui de Twin9 n'y est plus
    expect(marksOf(html)).toEqual([])
    expect(text).toContain('<mark>mon surlignage</mark>')
    expect(text).toContain('J’ai monté le capteur.')
    expect(text).toContain('Rien et')
    // retrouvé tel quel, il ne se surligne qu'à la demande d'une trace
    expect(locateInPortfolio(forge, { extract: 'J’ai monté le capteur.' }).some((r) => r.complete)).toBe(true)
  })
})
