// Sémantiques de chaînes Python (CPython 3) dont le parseur des fiches de pôle
// (../referentiel.js) a besoin : la classe regex \s de Python et str.strip(),
// en points de code. Les autres (lstrip, rstrip, splitlines, universal
// newlines, len et tranches en points de code) servaient le moteur du
// navigateur, retiré par T11, et sont parties avec leurs tests le 2026-10-22.
// L'ensemble de caractères ci-dessous a été énuméré en scannant tout l'espace
// Unicode avec CPython (0x0..0x10FFFF) — ne pas « simplifier ».

// Ensemble str.isspace() — IDENTIQUE à la classe \s du module re de Python
// (vérifié par énumération exhaustive : mêmes 29 points de code).
const PY_SPACE_CODEPOINTS = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];

const PY_SPACE_SET = new Set(PY_SPACE_CODEPOINTS.map((c) => String.fromCodePoint(c)));

/**
 * Classe de caractères regex équivalente au \s de Python (à insérer dans un
 * littéral de classe : `[${PY_WS_CLASS}]`). Le \s de JS diverge (pas de
 * U+001C–001F ni U+0085, mais U+FEFF en plus) : ne jamais utiliser \s dans
 * les regex portées.
 */
export const PY_WS_CLASS =
  "\\t\\n\\x0b\\f\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** @param {string} s @param {string|undefined} chars @returns {Set<string>|null} */
function stripSet(chars) {
  return chars === undefined ? null : new Set(Array.from(chars));
}

/** @param {string} ch @param {Set<string>|null} set */
function inStripSet(ch, set) {
  return set === null ? PY_SPACE_SET.has(ch) : set.has(ch);
}

/**
 * str.strip([chars]) Python : sans argument, retire les espaces au sens
 * isspace() ; avec `chars`, retire tout caractère de l'ensemble, répétitivement,
 * aux deux extrémités. Travaille en points de code.
 * @param {string} s @param {string} [chars] @returns {string}
 */
export function pyStrip(s, chars) {
  const cp = Array.from(s);
  const set = stripSet(chars);
  let i = 0;
  let j = cp.length;
  while (i < j && inStripSet(cp[i], set)) i++;
  while (j > i && inStripSet(cp[j - 1], set)) j--;
  return cp.slice(i, j).join("");
}
