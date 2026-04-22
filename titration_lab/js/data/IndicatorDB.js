/**
 * IndicatorDB — registry of acid-base indicators.
 *
 * `validFor()` filters indicators to those conventionally correct for a
 * given titrant/analyte pair, so the UI can grey out inappropriate choices.
 */
import { ChemicalDB } from './ChemicalDB.js';

// ── Indicator records ────────────────────────────────────────────────────────

/**
 * @typedef {Object} Indicator
 * @property {string}   id
 * @property {string}   name
 * @property {string}   acidCol      CSS colour in acid form
 * @property {string}   alkCol       CSS colour in alkaline form
 * @property {number}   pKin         pKa of the indicator (mid-point of transition)
 * @property {[number,number]} range pH transition range [low, high]
 * @property {string}   desc         One-line description for the UI
 * @property {string[]} works_with   ReactionSystem type strings this indicator suits
 */

/** @type {Readonly<Indicator[]>} */
const INDICATORS = Object.freeze([
  {
    id:         'mo',
    name:       'Methyl orange',
    acidCol:    '#e85040',
    alkCol:     '#f0c040',
    pKin:       3.7,
    range:      [3.1, 4.4],
    desc:       'Red (acid) \u2192 Yellow (alkali). Use for strong acid / carbonate titrations.',
    works_with: ['SA_SB', 'SA_WB', 'Na2CO3_SA'],
  },
  {
    id:         'smo',
    name:       'Screened methyl orange',
    acidCol:    '#8050a0',
    alkCol:     '#4a8040',
    pKin:       3.7,
    range:      [3.1, 4.4],
    desc:       'Purple (acid) \u2192 Green (alkali). Sharper endpoint than plain methyl orange.',
    works_with: ['SA_SB', 'SA_WB', 'Na2CO3_SA'],
  },
  {
    id:         'pp',
    name:       'Phenolphthalein',
    acidCol:    'rgba(180,200,255,0.12)',
    alkCol:     '#e060c0',
    pKin:       9.1,
    range:      [8.2, 10.0],
    desc:       'Colourless (acid) \u2192 Pink (alkali). Use for weak acid / strong base.',
    works_with:        ['WA_SB', 'SA_SB'],
    flashNearEndpoint: true,
  },
]);

// ── IndicatorDB class ────────────────────────────────────────────────────────

export class IndicatorDB {
  /**
   * Look up an indicator by id.
   * @param {string} id
   * @returns {Indicator|null}
   */
  static get(id) {
    return INDICATORS.find(i => i.id === id) ?? null;
  }

  /**
   * All indicators in display order.
   * @returns {Indicator[]}
   */
  static all() {
    return [...INDICATORS];
  }

  /**
   * Indicators that are chemically appropriate for the given titrant/analyte pair.
   * Returns an empty array if the pair is unknown.
   *
   * The filter is based on conventional indicator choice:
   *   • SA_SB      — any indicator works (use MO for routine, PP acceptable)
   *   • WA_SB      — phenolphthalein only (EP at pH ~8.7)
   *   • SA_WB      — methyl orange / screened MO (EP at pH ~5.3)
   *   • Na2CO3_SA  — methyl orange / screened MO (EP2 at pH ~3.9)
   *
   * @param {string} titrantId
   * @param {string} analyteId
   * @returns {Indicator[]}
   */
  static validFor(titrantId, analyteId) {
    const desc = ChemicalDB.describe(titrantId, analyteId);
    if (!desc) return [];
    return INDICATORS.filter(ind => ind.works_with.includes(desc.type));
  }
}
