// Vecteurs générés par CPython 3.14.3 (str.strip) puis figés ici — script :
// engine/test/twin9-vectors/gen_noyau_vectors.py, retiré avec le moteur du
// navigateur (T11), dans l'historique de Twin_v9 ; jamais de python à
// l'exécution. Ceux de lstrip, rstrip et splitlines sont partis avec ces
// fonctions le 2026-10-22.
import { describe, expect, it } from "vitest";
import { PY_WS_CLASS, pyStrip } from "./pyText.js";

const V = {
 "strip": [
  {
   "s": "   x\ty\u001c",
   "chars": null,
   "out": "x\ty"
  },
  {
   "s": "  bonjour  ",
   "chars": null,
   "out": "bonjour"
  },
  {
   "s": "\u001c\u001d\u001e\u001f\u0085 zut \u3000 ",
   "chars": null,
   "out": "zut"
  },
  {
   "s": "\u00a0\u202f\u2028 mixte \u2029",
   "chars": null,
   "out": "mixte"
  },
  {
   "s": "\u00ab\u00bb\"' test \u00ab\u00bb\"'",
   "chars": "\u00ab\u00bb\"' ",
   "out": "test"
  },
  {
   "s": "__a_b__",
   "chars": "_",
   "out": "a_b"
  },
  {
   "s": "",
   "chars": null,
   "out": ""
  },
  {
   "s": "  ",
   "chars": null,
   "out": ""
  }
 ]
};

// Les 29 points de code de str.isspace() — identiques à la classe \s du module
// re — énumérés avec CPython (vérifié à la génération de pyText.js).
const ISSPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

describe("pyText — sémantiques de chaînes Python", () => {
  it("pyStrip reproduit str.strip([chars])", () => {
    for (const c of V.strip) {
      expect(pyStrip(c.s, c.chars === null ? undefined : c.chars)).toBe(c.out);
    }
  });

  it("pyStrip sans argument retire les 29 points de code isspace() de Python, et eux seuls", () => {
    for (let cp = 0; cp <= 0x3100; cp++) {
      const ch = String.fromCodePoint(cp);
      expect(pyStrip(ch)).toBe(ISSPACE.has(cp) ? "" : ch);
    }
    // U+FEFF : \s en JS mais PAS isspace() en Python.
    expect(pyStrip("\ufeff")).toBe("\ufeff");
  });

  it("PY_WS_CLASS matche exactement l'ensemble isspace()", () => {
    const re = new RegExp("^[" + PY_WS_CLASS + "]$");
    for (let cp = 0; cp <= 0x3100; cp++) {
      expect(re.test(String.fromCodePoint(cp))).toBe(ISSPACE.has(cp));
    }
    expect(re.test("\ufeff")).toBe(false);
  });
});
