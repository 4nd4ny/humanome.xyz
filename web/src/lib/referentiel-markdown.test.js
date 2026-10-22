// UC-EPI-05 (S5, lot D) — un référentiel en Markdown : lecture, motifs déduits,
// écriture. Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
//
// Les allers-retours portent sur RESPIRE tel que la plateforme le publie
// (web/public/data/referentiel/, l'export statique, comme referentiel-v710.test.js)
// et sur la fixture FICTIVE à la forme Humanome du lot B
// (schemas/fixtures/referentiel-humanome-fictif*.json).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fichesDuReferentiel } from '@engine/twin6/fiches.js'
import { corpsDuHash } from '@engine/referentiel-humanome.js'
import { validateDocument } from '@engine/validation.js'
import {
  analyserMarkdown,
  deduireMotif,
  ErreurMarkdown,
  MODELE_JSON,
  MODELE_MARKDOWN,
  referentielDepuisMarkdown,
  referentielEnMarkdown,
  SOURCE_PAR_DEFAUT,
} from './referentiel-markdown.js'

const lire = (chemin) => JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'))
const RESPIRE_710 = lire('../../public/data/referentiel/respire-v7.1.0.json')
const RESPIRE_700 = lire('../../public/data/referentiel/respire-v7.0.0.json')
const HUMANOME = lire('../../../schemas/fixtures/referentiel-humanome-fictif.json')
const HUMANOME_FACETTE = lire('../../../schemas/fixtures/referentiel-humanome-fictif-facette.json')

/** Hash structurel gelé du référentiel RESPIRE v7 (referentiel-v710.test.js). */
const ORACLE_RESPIRE = 'b246101cab241ac3842bcdc8bc2d1672457d13b2cbff74cf734da67fa416b6b1'

const sha256 = (texte) => createHash('sha256').update(texte).digest('hex')
const CHAMPS = { id: 'fictif-md', version: '1.0.0', label: 'Fictif Markdown' }
const lireTexte = (texte, champs = CHAMPS) => referentielDepuisMarkdown(texte, champs)
const enLignes = (erreurs) => erreurs.map((e) => (e.ligne === null ? e.message : `${e.ligne} : ${e.message}`))

/** Le document sans ce que la page saisit ou que le serveur calcule. */
const corps = ({ poles, competences, source }) => ({ poles, competences, source })

describe('UC-EPI-05 — un référentiel en Markdown', () => {
  it.each([
    ['7.1.0, avec ses définitions', RESPIRE_710],
    ['7.0.0, sans description', RESPIRE_700],
  ])('UC-EPI-05-U15 — RESPIRE %s : les fiches du moteur, aller-retour exact, même empreinte', (_, respire) => {
    const texte = referentielEnMarkdown(respire)
    // le corps est, pôle par pôle, la fiche que le moteur écrit, sa couleur sous son titre
    const fiches = fichesDuReferentiel(respire)
    const attendu = respire.poles
      .map((p) => fiches[String(p.num)].replace('\n', `\n<!-- couleur : ${p.couleur} -->\n`))
      .join('\n')
    expect(texte).toBe(`<!-- source : ${respire.source} -->\n\n${attendu}`)

    const lu = lireTexte(texte)
    expect(lu.erreurs).toEqual([])
    expect(lu.niveaux).toEqual([{ nom: 'compétence', motif: '[1-7]\\.[0-1]\\d' }])
    // JSON → Markdown → JSON : les mêmes pôles (couleurs comprises), compétences et provenance
    expect(corps(lu.document)).toEqual(corps(respire))
    expect(sha256(corpsDuHash(lu.document))).toBe(ORACLE_RESPIRE)
    expect(validateDocument('referentiel', { ...lu.document, contentHash: respire.contentHash }).valid).toBe(true)
    // Markdown → JSON → Markdown : octet pour octet
    expect(referentielEnMarkdown(lu.document)).toBe(texte)
  })

  it('UC-EPI-05-U16 — la fixture Humanome, aux niveaux capacité et facette : aller-retour exact, niveaux nommés', () => {
    for (const fixture of [HUMANOME, HUMANOME_FACETTE]) {
      const texte = referentielEnMarkdown(fixture)
      const noms = fixture.niveaux.map((n) => n.nom).join(', ')
      expect(texte.startsWith(`<!-- source : ${fixture.source} -->\n<!-- niveaux : ${noms} -->\n\n# Pôle 1 — A · Observer le fictif\n`)).toBe(true)
      const champs = { id: fixture.id, version: fixture.version, label: fixture.label }
      const lu = lireTexte(texte, champs)
      expect(lu.erreurs).toEqual([])
      expect(lu.niveaux.map((n) => n.nom)).toEqual(fixture.niveaux.map((n) => n.nom))
      expect(corps(lu.document)).toEqual(corps(fixture))
      expect(referentielEnMarkdown(lu.document)).toBe(texte)
      // les motifs saisis à la place des déduits, le document est celui de la fixture, hors son empreinte
      const { contentHash, ...sansEmpreinte } = fixture
      expect(lireTexte(texte, { ...champs, niveaux: fixture.niveaux }).document).toEqual(sansEmpreinte)
      expect(sha256(corpsDuHash(lu.document))).toBe(contentHash)
    }
    // les facettes sont des éléments, un titre plus bas que leur capacité
    expect(referentielEnMarkdown(HUMANOME)).toContain('\n## A2 — Deuxième capacité fictive\n')
    expect(referentielEnMarkdown(HUMANOME)).toContain('\n### A2.4 — Facette fictive A2.4\n')
    const lu = lireTexte(referentielEnMarkdown(HUMANOME), CHAMPS)
    expect(lu.niveaux).toEqual([
      { nom: 'capacité', motif: '[A-B][1-2]' },
      { nom: 'facette', motif: '[A-B][1-2]\\.[1-4]' },
    ])
  })

  it('UC-EPI-05-U17 — le motif déduit est le plus étroit que suivent tous les codes du niveau', () => {
    const lettres = ['A', 'B', 'C', 'D', 'E']
    const capacites = lettres.flatMap((l) => [1, 2, 3, 4].map((n) => `${l}${n}`))
    const cas = [
      [capacites, '[A-E][1-4]'],
      [capacites.flatMap((c) => [`${c}.1`, `${c}.2`, `${c}.3`]), '[A-E][1-4]\\.[1-3]'],
      [RESPIRE_710.competences.map((c) => c.code), '[1-7]\\.[0-1]\\d'],
      [['1.01', '1.02', '1.03'], '1\\.0[1-3]'],
      [['1.00', '2.19', '3.99'], '[1-3]\\.[0-19][09]'],
      [Array.from({ length: 100 }, (_, i) => `1.${String(i).padStart(2, '0')}`), '1\\.\\d{2}'],
      [['A1', 'B2', 'D3'], '[A-BD][1-3]'],
      [['A2', 'A10'], 'A[0-2]{1,2}'],
      [['c-1', 'c-2'], 'c-[1-2]'],
      [['X_1', 'Y_2'], '[X-Y]_[1-2]'],
      [['A1', '1A'], '(?:A1|1A)'],
      [['seul'], 'seul'],
    ]
    for (const [codes, motif] of cas) {
      expect(deduireMotif(codes), codes.join(' ')).toBe(motif)
      const regex = new RegExp(`^(?:${motif})$`)
      expect(codes.every((code) => regex.test(code))).toBe(true)
    }
    expect(new RegExp('^(?:[A-E][1-4])$').test('A9')).toBe(false) // la faute de frappe que l'étroitesse attrape
    // des formes trop nombreuses pour 100 caractères : la forme générale d'un code
    const disparates = ['A', '1', 'a', 'A.1', '1.A', 'a.a', 'A-1', '1-A', 'a-a', 'A_1', '1_A', 'a_a', 'Aa1', '1aA',
      'a1A', 'A1a', '1Aa', 'aA1', 'A.a', 'a.A', '1.a', 'a.1', 'A-a', 'a-A', '1-a', 'a-1']
    const motif = deduireMotif(disparates)
    expect(motif).toBe('[A-Za-z0-9._-]{1,8}')
    for (const m of [motif, ...cas.map(([codes]) => deduireMotif(codes))]) {
      expect(m.length).toBeLessThanOrEqual(100)
      expect(m).not.toContain('(*')
    }
  })

  it('UC-EPI-05-U18 — chaque erreur à sa ligne : titres mal formés, niveau sauté, doublon, pôle vide, code hors motif', () => {
    const texte = [
      'Un texte avant le premier pôle.', //  1
      '## A0 — Compétence sans pôle', //     2
      '# Pôle 1 — A · Premier', //           3
      '<!-- couleur : rouge -->', //         4
      '## A1 — Première', //                 5
      '#### A1.1.1 — Trop bas', //           6
      '## A2 Sans tiret', //                 7
      '## A1 — Doublon', //                  8
      '## ABCDEFGHI — Code trop long', //    9
      '# Pôle 3 — Numéro sauté', //          10
      '## B1 — Seule', //                    11
      '# Pôle sans numéro', //               12
      '# Pôle 4 — Vide', //                  13
    ].join('\n')
    expect(enLignes(analyserMarkdown(texte).erreurs)).toEqual([
      '1 : texte avant le premier pôle (« # Pôle 1 — Nom » ouvre le premier)',
      '2 : « ## A0 — Compétence sans pôle » avant le premier pôle (« # Pôle 1 — Nom » ouvre le premier)',
      '4 : couleur illisible « <!-- couleur : rouge --> » (attendu « <!-- couleur : #rrggbb --> »)',
      '6 : niveau sauté : « #### » ici, « ### » au plus',
      '7 : titre mal formé « ## A2 Sans tiret » (attendu « ## CODE — Nom »)',
      '8 : code en double « A1 » (déjà ligne 5)',
      '9 : code invalide « ABCDEFGHI » : 1 à 8 caractères, lettres, chiffres, « . », « _ » ou « - », le premier lettre ou chiffre',
      '10 : pôle 3 : les pôles se numérotent 1, 2, 3… dans l’ordre, le pôle 2 est attendu ici',
      '12 : titre de pôle mal formé « # Pôle sans numéro » (attendu « # Pôle 3 — Nom »)',
      '12 : le pôle 3 « Pôle sans numéro » n’a aucune compétence (« ## CODE — Nom »)',
      '13 : le pôle 4 « Vide » n’a aucune compétence (« ## CODE — Nom »)',
    ])
    // sous un titre refusé, ses éléments plus fins ne font pas d'autre erreur ; son pôle n'est pas « vide »
    const refuse = analyserMarkdown('# Pôle 1 — A\n## A1 sans tiret\n### A1.1 — Fine\n#### A1.1.1 — Plus fine\n# Pôle 2 — B\n## B1 — Bonne')
    expect(enLignes(refuse.erreurs)).toEqual(['2 : titre mal formé « ## A1 sans tiret » (attendu « ## CODE — Nom »)'])
    expect(refuse.competences).toEqual([{ code: 'B1', nom: 'Bonne', pole: 2 }])
    expect(enLignes(analyserMarkdown('').erreurs)).toEqual(['aucun pôle : « # Pôle 1 — Nom » ouvre le premier'])
    expect(enLignes(analyserMarkdown('<!-- source : jamais refermé\n# Pôle 1 — A\n## A1 — x').erreurs)).toEqual([
      '1 : commentaire jamais refermé (« --> » manque)',
      'aucun pôle : « # Pôle 1 — Nom » ouvre le premier',
    ])

    // un code hors du motif saisi, un motif illisible, un nom de niveau en double
    const bon = '# Pôle 1 — A · Pôle\n\n## A1 — Une\n\n### A1.1 — Fine\n\n## A9 — Deux\n'
    expect(lireTexte(bon).erreurs).toEqual([])
    expect(enLignes(lireTexte(bon, { ...CHAMPS, niveaux: [{ nom: 'capacité', motif: '[A-E][1-4]' }] }).erreurs)).toEqual([
      '7 : « A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »',
    ])
    expect(enLignes(lireTexte(bon, { ...CHAMPS, niveaux: [{ motif: 'A)|(B' }, { nom: 'compétence', motif: '' }] }).erreurs)).toEqual([
      'Niveau 1 (« compétence ») : motif illisible : A)|(B',
      'Niveau 2 : un autre niveau s’appelle déjà « compétence »',
      'Niveau 2 (« compétence ») : motif vide',
    ])
    expect(enLignes(lireTexte(bon, { ...CHAMPS, niveaux: [{ motif: '(*ACCEPT)A' }, { nom: ' ' }] }).erreurs)).toEqual([
      'Niveau 1 (« compétence ») : motif illisible : (*ACCEPT)A',
      'Niveau 2 : nom requis',
    ])
    expect(lireTexte(bon, { ...CHAMPS, niveaux: [{ motif: '[A-E][1-9]' }] }).document.niveaux).toEqual([
      { nom: 'compétence', motif: '[A-E][1-9]' },
      { nom: 'élément', motif: 'A1\\.1' },
    ])

    // les trois champs : ce que le serveur refuserait, ou qui lui ferait répondre 500 (UC-EPI-04 AN2)
    const champs = (id, version, label) => enLignes(lireTexte(bon, { id, version, label }).erreurs)
    expect(champs('', '', '')).toEqual(['Identifiant : requis', 'Version : requise', 'Libellé : requis'])
    expect(champs('respire', '7.2.0', 'RESPIRE')).toEqual([
      'Identifiant : RESPIRE s’édite compétence par compétence dans son atelier, il ne s’importe pas',
    ])
    expect(champs('Fictif MD', 'v1', 'x'.repeat(191))).toEqual([
      'Identifiant : minuscules, chiffres, « . », « _ » ou « - », le premier lettre ou chiffre, 64 caractères au plus',
      'Version : un semver, par exemple 1.0.0',
      'Libellé : 190 caractères au plus',
    ])
    expect(champs('fictif', `1.0.0-${'a'.repeat(27)}`, 'Fictif')).toEqual(['Version : 32 caractères au plus'])
    expect(lireTexte(bon, { id: ' fictif ', version: ' 1.0.0', label: ' Fictif ' }).document).toMatchObject({
      id: 'fictif', version: '1.0.0', label: 'Fictif',
    })
    // une erreur, et pas de document à envoyer
    expect(lireTexte(bon, { ...CHAMPS, id: '' }).document).toBeNull()
  })

  it('UC-EPI-05-U19 — BOM, fins de ligne CRLF, tirets, séparateurs, lignes échappées : le même document', () => {
    const lf = '# Pôle 1 — A · Pôle\n\nLe pôle.\n\n## A1 — Une\n\nLa première.\n\n---\n\n## A2 — Deux\n'
    const attendu = lireTexte(lf).document
    expect(attendu.poles).toEqual([{ num: 1, nom: 'A · Pôle', couleur: null, description: 'Le pôle.' }])
    expect(attendu.competences).toEqual([
      { code: 'A1', nom: 'Une', pole: 1, description: 'La première.' },
      { code: 'A2', nom: 'Deux', pole: 1 },
    ])
    expect(attendu.source).toBe(SOURCE_PAR_DEFAUT)
    expect(lireTexte(`﻿${lf}`).document).toEqual(attendu)
    expect(lireTexte(lf.replace(/\n/g, '\r\n')).document).toEqual(attendu)
    expect(lireTexte(lf.replace(/\n/g, '\r')).document).toEqual(attendu)
    // « – » et « - » pour « — », sans « --- », d'autres lignes vides : même lecture
    expect(lireTexte('# Pôle 1 - A · Pôle\nLe pôle.\n## A1 – Une\nLa première.\n\n\n## A2 - Deux').document).toEqual(attendu)
    // l'écriture est celle des fiches, et la relecture la redonne
    expect(referentielEnMarkdown(attendu)).toBe(`<!-- source : ${SOURCE_PAR_DEFAUT} -->\n\n${lf}`)

    // une description dont des lignes se liraient comme un titre ou un séparateur
    const doc = structuredClone(attendu)
    doc.competences[0].description = '# Pas un titre\n\nTexte.\n\n---\n\\## Déjà échappé\n#motclé\n---'
    doc.poles[0].description = '--- en tête'
    const texte = referentielEnMarkdown(doc)
    expect(texte).toContain('\n\\# Pas un titre\n\nTexte.\n\n\\---\n\\\\## Déjà échappé\n#motclé\n\\---\n\n---\n\n## A2')
    expect(lireTexte(texte).document).toEqual(doc)
    expect(referentielEnMarkdown(lireTexte(texte).document)).toBe(texte)

    // le Markdown n'a que six niveaux de titre
    const profond = structuredClone(attendu)
    let noeud = profond.competences[0]
    for (const code of ['A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5']) {
      noeud.elements = [{ code, nom: code }]
      ;[noeud] = noeud.elements
    }
    expect(() => referentielEnMarkdown(profond)).toThrow(ErreurMarkdown)
  })

  it('UC-EPI-05-U20 — les modèles se lisent sans erreur ; un pôle au nom d’un pôle de RESPIRE est signalé', () => {
    const modele = lireTexte(MODELE_MARKDOWN, { id: 'mon-referentiel', version: '1.0.0', label: 'Mon référentiel' })
    expect(modele.erreurs).toEqual([])
    expect(modele.avertissements).toEqual([])
    expect(modele.niveaux.map((n) => n.nom)).toEqual(['capacité', 'facette'])
    expect(modele.document.poles.map((p) => [p.num, p.couleur])).toEqual([[1, '#2563eb'], [2, '#10b981']])
    expect(modele.document.competences.map((c) => c.code)).toEqual(['A1', 'A2', 'B1'])
    // le modèle JSON est le même référentiel, valide au schéma une fois son empreinte calculée
    const json = JSON.parse(MODELE_JSON)
    expect(json).toEqual(modele.document)
    expect(json).not.toHaveProperty('contentHash')
    expect(validateDocument('referentiel', { ...json, contentHash: sha256(corpsDuHash(json)) }).valid).toBe(true)

    // la clé de jury d'un pôle est le premier mot de son nom, sans accents, en capitales (Twin_v9, Referentiel::cle)
    const avertis = (noms) =>
      enLignes(lireTexte(noms.map((nom, i) => `# Pôle ${i + 1} — ${nom}\n## Z${i + 1} — z`).join('\n')).avertissements)
    expect(avertis(['TÊTE et mains', 'Cœur', 'CŒUR battant'])).toEqual([
      '1 : pôle 1 « TÊTE et mains » : son premier mot (TETE) est celui d’un pôle de RESPIRE ; l’analyse approfondie (Twin9) lui donnera les jurés de ce pôle de RESPIRE',
      '5 : pôle 3 « CŒUR battant » : son premier mot (COEUR) est celui d’un pôle de RESPIRE ; l’analyse approfondie (Twin9) lui donnera les jurés de ce pôle de RESPIRE',
    ])
    // deux pôles de même clé : le moteur les numérote tous (P1, P2…), aucun juré de RESPIRE
    expect(avertis(['MAIN gauche', 'MAIN droite'])).toEqual([])
    expect(lireTexte(referentielEnMarkdown(RESPIRE_710)).avertissements).toHaveLength(7)
  })
})
