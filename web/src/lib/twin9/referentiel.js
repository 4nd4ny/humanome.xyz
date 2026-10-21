// Port de parse_pole (aurora/referentiel.py de Twin9) : le découpage d'une
// fiche de pôle P{n}.md — un préambule (avant la première compétence) puis des
// sections `## X.YY — Nom` (tiret U+2014 obligatoire). Le moteur Twin9 vit dans
// le dépôt privé Twin_v9 ; la plateforme n'en garde que ce parseur, avec lequel
// scripts/extract-fiches.mjs tire des P*.md les fiches du référentiel, que
// scripts/generate-fiches.mjs (prebuild du front) en régénère à l'octet, et
// scripts/twin9/import-protocole.mjs lit la structure des fichiers de pôle de
// la v9.8 (2026-10-21, à la place du Python de Twin_v9).

import { PY_WS_CLASS, pyStrip } from "./py/pyText.js";
import { pyFormat } from "./py/pyStr.js";

export const POLE_NOMS = {
  1: "TÊTE — Penser & Comprendre",
  2: "CŒUR — Relier & Naviguer",
  3: "MAIN — Créer & Incarner",
  4: "ÂME — Discerner & Juger",
  5: "RACINES — Évoluer & Résister",
  6: "CITÉ — Gouverner & S'ouvrir",
  7: "FLAMBEAU — Transmettre & Piloter",
};

// ^##\s+(\d\.\d{2})\s*—\s*(.+?)\s*$ MULTILINE — « . » Python → [^\n],
// \s Python → [PY_WS_CLASS] ; exactement ## (### ne matche pas : le 3e #
// n'est pas un espace).
const RE_COMP = new RegExp(
  "^##[" +
    PY_WS_CLASS +
    "]+(\\d\\.\\d{2})[" +
    PY_WS_CLASS +
    "]*—[" +
    PY_WS_CLASS +
    "]*([^\\n]+?)[" +
    PY_WS_CLASS +
    "]*$",
  "gm",
);

/**
 * @typedef {{code: string, nom: string, fiche_md: string}} Competence
 */

export class Pole {
  /**
   * @param {number} num
   * @param {string} header — préambule NON strippé (avant la 1re compétence).
   * @param {Competence[]} competences
   */
  constructor(num, header, competences) {
    this.num = num;
    this.nom = POLE_NOMS[num] !== undefined ? POLE_NOMS[num] : pyFormat("Pôle %d", num);
    this.header = header;
    this.competences = competences;
  }
}

/**
 * parse_pole porté : prend le CONTENU de la fiche (déjà lu par l'hôte ; la
 * normalisation universal newlines de read_text doit avoir été appliquée par
 * l'appelant si la source peut contenir des CRLF).
 * @param {string} text — contenu de P{num}.md (universal newlines déjà faites).
 * @param {number} num
 * @param {string} [label] — nom affiché dans l'erreur (défaut "P{num}.md").
 * @returns {Pole}
 */
export function parsePole(text, num, label) {
  const matches = Array.from(text.matchAll(RE_COMP));
  if (!matches.length) {
    throw new Error(
      pyFormat("Aucune section '## X.YY — Nom' dans %s", label !== undefined ? label : pyFormat("P%d.md", num)),
    );
  }
  const header = text.slice(0, /** @type {number} */ (matches[0].index));
  /** @type {Competence[]} */
  const comps = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = /** @type {number} */ (m.index);
    const end = i + 1 < matches.length ? /** @type {number} */ (matches[i + 1].index) : text.length;
    comps.push({ code: m[1], nom: pyStrip(m[2]), fiche_md: pyStrip(text.slice(start, end)) });
  }
  return new Pole(num, header, comps);
}
