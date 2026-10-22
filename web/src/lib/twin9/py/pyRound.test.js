// formatFixed : le « %.Nf » de Python, cas figés d'après CPython (le %f
// complet de pyFormat est couvert par pyStr.test.js). Les vecteurs de round()
// et de divmod (script engine/test/twin9-vectors/gen_vectors.py, retiré avec le
// moteur du navigateur, T11, dans l'historique de Twin_v9) sont partis avec
// pyRound, pyDivmod et pyMod le 2026-10-22.
import { describe, expect, it } from "vitest";
import { formatFixed } from "./pyRound.js";

describe("formatFixed — arrondi correct de %.Nf (voir pyStr.test.js pour % complet)", () => {
  it("ties half-even sur la valeur exacte du double", () => {
    expect(formatFixed(0.25, 1)).toBe("0.2");
    expect(formatFixed(0.125, 2)).toBe("0.12");
    expect(formatFixed(2.675, 2)).toBe("2.67");
    expect(formatFixed(2.5, 0)).toBe("2");
    expect(formatFixed(-0, 1)).toBe("-0.0");
    expect(formatFixed(NaN, 2)).toBe("nan");
    expect(formatFixed(Infinity, 2)).toBe("inf");
    expect(formatFixed(-Infinity, 2)).toBe("-inf");
  });
});
