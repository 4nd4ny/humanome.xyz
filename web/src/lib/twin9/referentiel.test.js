// Vecteurs générés par CPython 3.14.3 (aurora/referentiel.py de Twin9 :
// parse_pole, POLE_NOMS) puis figés ici — jamais de python à l'exécution. La
// fiche testée est FACTICE (inventée, même format) : les vraies fiches P1..P7
// sont confidentielles.
import { describe, expect, it } from "vitest";
import { POLE_NOMS, Pole, parsePole } from "./referentiel.js";

const V = {
 "fake_fiche": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.  \n\n## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c.\n\n## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide\n\n## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche.\n",
 "pole": {
  "num": 3,
  "nom": "MAIN \u2014 Cr\u00e9er & Incarner",
  "header": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.  \n\n",
  "competences": [
   {
    "code": "3.01",
    "nom": "Alpha factice",
    "fiche_md": "## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c."
   },
   {
    "code": "3.02",
    "nom": "B\u00e9ta factice",
    "fiche_md": "## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide"
   },
   {
    "code": "3.03",
    "nom": "Gamma \u2014 avec tiret interne",
    "fiche_md": "## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche."
   }
  ]
 },
 "pole_noms": {
  "1": "T\u00caTE \u2014 Penser & Comprendre",
  "2": "C\u0152UR \u2014 Relier & Naviguer",
  "3": "MAIN \u2014 Cr\u00e9er & Incarner",
  "4": "\u00c2ME \u2014 Discerner & Juger",
  "5": "RACINES \u2014 \u00c9voluer & R\u00e9sister",
  "6": "CIT\u00c9 \u2014 Gouverner & S'ouvrir",
  "7": "FLAMBEAU \u2014 Transmettre & Piloter"
 },
 "pole_nom_fallback": "P\u00f4le 9"
};

describe("referentiel.parsePole — parité parse_pole (fiche factice)", () => {
  const pole = parsePole(V.fake_fiche, 3);

  it("header non strippé, compétences {code, nom, fiche_md}", () => {
    expect(pole.num).toBe(V.pole.num);
    expect(pole.nom).toBe(V.pole.nom);
    expect(pole.header).toBe(V.pole.header);
    expect(pole.competences).toEqual(V.pole.competences);
  });

  it("aucune section → erreur", () => {
    expect(() => parsePole("# Titre\nrien\n", 1)).toThrowError(
      "Aucune section '## X.YY — Nom' dans P1.md",
    );
  });
});

describe("referentiel — noms des pôles", () => {
  it("POLE_NOMS : octets identiques au Python (U+2014, apostrophe droite)", () => {
    for (const [k, nom] of Object.entries(V.pole_noms)) {
      expect(POLE_NOMS[k]).toBe(nom);
    }
    expect(Object.keys(POLE_NOMS).length).toBe(7);
    expect(new Pole(9, "", []).nom).toBe(V.pole_nom_fallback);
  });
});
