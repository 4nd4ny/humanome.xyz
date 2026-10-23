// S3-3 — les marques du portfolio surligné de Twin9 ne vont jamais dans le
// texte analysé : chaque import les retire (sécurité : aucune trace forgée par
// le texte d'un fichier), et le reste du texte ne change pas.
import { describe, expect, it } from 'vitest'
import { plagesTwin9, retirerMarquesTwin9, sansMarquesTwin9 } from './marques.js'

describe('sansMarquesTwin9', () => {
  it('une marque de trace perd ses balises et garde son texte, ses trois attributs avec elle', () => {
    expect(sansMarquesTwin9('J’ai <mark data-twin9-code="1.01" data-incertitude="faible" data-intensite="1.42">monté le capteur</mark> hier.')).toBe(
      'J’ai monté le capteur hier.',
    )
  })

  it('quelle que soit la casse, les guillemets, l’ordre des attributs ou l’élément qui les porte', () => {
    const cas = [
      ['a <MARK DATA-TWIN9-CODE=1.01>b</Mark> c', 'a b c'],
      ["a <mark data-intensite='2.5' class=\"x\" data-twin9-code='1.01'>b</mark> c", 'a b c'],
      ['a <mark class="x" data-incertitude=faible>b</mark> c', 'a b c'],
      ['a <span data-twin9-autre="1" title="t">b</span> c', 'a b c'],
      ['a <mark data-twin9-code="1>2">b</mark> c', 'a b c'],
      ['a <br data-twin9-code="x"/> b <img data-incertitude="faible"> c', 'a  b  c'],
      ['a <mark\n  data-twin9-code="1.01"\n>b</mark> c', 'a b c'],
    ]
    for (const [avant, apres] of cas) expect(sansMarquesTwin9(avant), avant).toBe(apres)
  })

  it('un <mark> de la personne reste, à côté d’une marque, en elle ou autour d’elle', () => {
    expect(sansMarquesTwin9('Mon <mark>surlignage</mark> à moi.')).toBe('Mon <mark>surlignage</mark> à moi.')
    expect(sansMarquesTwin9('a <mark data-twin9-code="x"><mark>dedans</mark> b</mark> <mark>après</mark>')).toBe('a <mark>dedans</mark> b <mark>après</mark>')
    expect(sansMarquesTwin9('a <mark>autour <mark data-twin9-code="z">t</mark> u</mark>')).toBe('a <mark>autour t u</mark>')
    expect(sansMarquesTwin9('<span data-twin9-code="1"><span>x</span></span><span>y</span>')).toBe('<span>x</span><span>y</span>')
  })

  it('le tableau des traces d’une journée part en entier, avec les lignes blanches qui le précèdent', () => {
    const texte = 'Fin de la journée.\n\n<!-- twin9-traces -->\n\n**Traces**\n\n| Compétence | Passage |\n|---|---|\n| 1.01 | « monté » |\n\n<!-- /twin9-traces -->\n\n## 2026-01-06\nSuite.'
    expect(sansMarquesTwin9(texte)).toBe('Fin de la journée.\n\n## 2026-01-06\nSuite.')
    // une marque écrite dans le tableau part avec lui
    expect(sansMarquesTwin9('x\n<!-- twin9-traces --><mark data-twin9-code="1">y</mark><!-- /twin9-traces -->')).toBe('x')
    // sans sa fermeture, rien n'en part
    expect(sansMarquesTwin9('x\n<!-- twin9-traces -->\n| a |')).toBe('x\n<!-- twin9-traces -->\n| a |')
  })

  it('un tableau sans sa fermeture, suivi d’un tableau fermé : le texte entre eux reste, journées comprises', () => {
    // un portfolio surligné retouché à la main : le tableau du 05 a perdu ses lignes et sa fermeture
    const texte = [
      '## 2026-01-05', 'Jour 1, avec un passage.', '', '<!-- twin9-traces -->', '| a |', '',
      '## 2026-01-06', 'Jour 2 : tout ce texte doit rester.', '',
      '## 2026-01-07', 'Jour 3, avec son tableau.', '', '<!-- twin9-traces -->', '| b |', '<!-- /twin9-traces -->', '',
      '## 2026-01-08', 'Jour 4.', '',
    ].join('\n')
    const r = retirerMarquesTwin9(texte)
    expect(r.texte).toBe(
      '## 2026-01-05\nJour 1, avec un passage.\n\n<!-- twin9-traces -->\n| a |\n\n## 2026-01-06\nJour 2 : tout ce texte doit rester.\n\n' +
        '## 2026-01-07\nJour 3, avec son tableau.\n\n## 2026-01-08\nJour 4.\n',
    )
    // une marque d'après l'ouverture orpheline perd ses balises, comme ailleurs
    expect(sansMarquesTwin9('<!-- twin9-traces -->\nJour <mark data-twin9-code="1">x</mark>.\n<!-- twin9-traces -->\n| b |\n<!-- /twin9-traces -->')).toBe(
      '<!-- twin9-traces -->\nJour x.',
    )
    // une fermeture orpheline, avant un tableau entier, ne retire rien de plus que lui
    expect(sansMarquesTwin9('a\n<!-- /twin9-traces -->\nb\n<!-- twin9-traces -->\n| c |\n<!-- /twin9-traces -->\nd')).toBe('a\n<!-- /twin9-traces -->\nb\nd')
  })

  it('un texte sans marque revient tel quel', () => {
    const texte = '## 2026-01-05\n<mark>à moi</mark>, <span class="x">rien</span> de Twin9 ; data-autre="1".'
    expect(sansMarquesTwin9(texte)).toBe(texte)
    expect(plagesTwin9(texte)).toEqual([])
    expect(sansMarquesTwin9('')).toBe('')
    expect(sansMarquesTwin9(null)).toBe('')
  })

  it('les positions du texte d’origine tombent dans le nouveau (une archive y ramène les bornes de ses journées)', () => {
    const texte = 'ab<mark data-twin9-code="1">cd</mark>ef'
    const r = retirerMarquesTwin9(texte)
    expect(r.texte).toBe('abcdef')
    expect(r.retire).toBe(true)
    const ouverture = texte.indexOf('cd')
    expect([0, 2, ouverture, ouverture + 2, texte.indexOf('ef'), texte.length].map(r.position)).toEqual([0, 2, 2, 4, 4, 6])
    // une position dans une balise retirée tombe à son début
    expect(r.position(5)).toBe(2)
    expect(retirerMarquesTwin9('rien').position(3)).toBe(3)
  })
})
