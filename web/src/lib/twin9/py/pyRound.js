// Formatage fixe « %.Nf » de Python (formatFixed) : arrondi half-to-even sur
// la représentation décimale EXACTE du double (David Gay) — '%.2f' % 2.675 ==
// '2.67' car 2.675 est en réalité 2.67499999… Seul formatFixed reste, pour le
// %f de pyFormat (pyStr.js) : round(), divmod et les autres sémantiques
// numériques de Python servaient le moteur du navigateur, retiré par T11, et
// sont partis avec leurs tests le 2026-10-22.
// BigInt utilisé en interne pour l'arithmétique rationnelle exacte (pur ESM,
// disponible dans tous les navigateurs cibles) — jamais exposé en sortie.

/**
 * Décompose un double fini non nul : |x| = m * 2^e avec m entier (BigInt).
 * @param {number} x fini, non nul
 * @returns {{ m: bigint, e: number, neg: boolean }}
 */
function decompose(x) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const neg = (hi >>> 31) === 1;
  const biased = (hi >>> 20) & 0x7ff;
  let m = BigInt(hi & 0xfffff) * 4294967296n + BigInt(lo);
  let e;
  if (biased === 0) {
    e = 1 - 1075; // dénormalisé
  } else {
    m += 4503599627370496n; // bit implicite 2^52
    e = biased - 1075;
  }
  return { m, e, neg };
}

/**
 * Arrondi half-to-even du rationnel num/den (BigInt ≥ 0, den > 0) vers un entier.
 * @param {bigint} num @param {bigint} den
 * @returns {bigint}
 */
function roundHalfEvenRational(num, den) {
  const q = num / den;
  const r = num % den;
  const twice = r * 2n;
  if (twice > den) return q + 1n;
  if (twice < den) return q;
  return q % 2n === 0n ? q : q + 1n; // égalité exacte : vers le pair
}

/**
 * |x| * 10^n sous forme rationnelle exacte num/den (n peut être négatif).
 * @param {number} x fini non nul @param {number} n entier
 */
function scaledRational(x, n) {
  const { m, e, neg } = decompose(x);
  let num = m;
  let den = 1n;
  if (n >= 0) num *= 10n ** BigInt(n);
  else den *= 10n ** BigInt(-n);
  if (e >= 0) num *= 2n ** BigInt(e);
  else den *= 2n ** BigInt(-e);
  return { num, den, neg };
}

/**
 * Formatage fixe « %.<prec>f » de Python (PyOS_double_to_string, arrondi
 * correct half-even sur la valeur exacte du double). prec ≥ 0.
 * '%.1f' % 0.25 → '0.2' ; '%.0f' % 2.5 → '2' ; -0.0 → '-0.0'.
 * @param {number} x
 * @param {number} prec
 * @returns {string}
 */
export function formatFixed(x, prec) {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  const neg = x < 0 || Object.is(x, -0);
  let digits;
  if (x === 0) {
    digits = "0";
  } else {
    const { num, den } = scaledRational(x, prec);
    digits = roundHalfEvenRational(num, den).toString();
  }
  if (prec === 0) return (neg ? "-" : "") + digits;
  if (digits.length <= prec) digits = "0".repeat(prec + 1 - digits.length) + digits;
  const cut = digits.length - prec;
  return (neg ? "-" : "") + digits.slice(0, cut) + "." + digits.slice(cut);
}
