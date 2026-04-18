/**
 * ChemicalDB — frozen registry of all chemicals available in the lab.
 *
 * Ka / Kb constants are exported separately so PHEngine can import them
 * without creating a circular dependency.
 */

// ── Equilibrium constants (25 °C) ────────────────────────────────────────────

/** Acid dissociation constants */
export const Ka = Object.freeze({
  ethanoic:  1.8e-5,   // CH₃COOH
  oxalic1:   5.9e-2,   // H₂C₂O₄  → HC₂O₄⁻
  oxalic2:   6.4e-5,   // HC₂O₄⁻  → C₂O₄²⁻
  carbonic1: 4.3e-7,   // H₂CO₃   → HCO₃⁻
  carbonic2: 4.7e-11,  // HCO₃⁻   → CO₃²⁻
});

/** Base dissociation constants */
export const Kb = Object.freeze({
  nh3: 1.8e-5,   // NH₃
});

/** Molar masses (g mol⁻¹) */
export const Mw = Object.freeze({
  hcl:       36.46,
  h2so4_dil: 98.08,
  ethanoic:  60.05,
  naoh:      40.00,
  na2co3:   105.99,
  nh3:       17.03,
});

// ── Chemical records ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} Chemical
 * @property {string}   id
 * @property {string}   formula       Display formula (may contain HTML entities)
 * @property {string}   name          Full IUPAC / common name
 * @property {'acid'|'base'} type
 * @property {boolean}  strong
 * @property {string}   dot           CSS colour for the dot in the chemical list
 * @property {string}   group         'Acids' | 'Bases'
 * @property {string[]} indicator_ok  Indicator IDs that work for this analyte
 * @property {number}   Mw            Molar mass g mol⁻¹
 * @property {number}   [Ka]          Acid dissociation constant (weak acids only)
 * @property {number}   [Kb]          Base dissociation constant (weak bases only)
 */

/** @type {Readonly<Chemical[]>} */
const CHEMICALS = Object.freeze([
  // ── Acids ──
  {
    id: 'hcl',
    formula: 'HCl',
    name: 'Hydrochloric acid',
    type: 'acid',
    strong: true,
    dot: '#5cb8ff',
    group: 'Acids',
    indicator_ok: ['mo', 'smo', 'pp'],
    Mw: Mw.hcl,
  },
  {
    id: 'h2so4_dil',
    formula: 'H\u2082SO\u2084',
    name: 'Sulfuric acid (dil.)',
    type: 'acid',
    strong: true,
    dot: '#ff9f5c',
    group: 'Acids',
    indicator_ok: ['mo', 'smo', 'pp'],
    Mw: Mw.h2so4_dil,
  },
  {
    id: 'ethanoic',
    formula: 'CH\u2083COOH',
    name: 'Ethanoic acid',
    type: 'acid',
    strong: false,
    dot: '#a0d060',
    group: 'Acids',
    indicator_ok: ['pp'],
    Ka: Ka.ethanoic,
    Mw: Mw.ethanoic,
  },
  // ── Bases ──
  {
    id: 'naoh',
    formula: 'NaOH',
    name: 'Sodium hydroxide',
    type: 'base',
    strong: true,
    dot: '#5cffb8',
    group: 'Bases',
    indicator_ok: ['mo', 'smo', 'pp'],
    Mw: Mw.naoh,
  },
  {
    id: 'na2co3',
    formula: 'Na\u2082CO\u2083',
    name: 'Sodium carbonate',
    type: 'base',
    strong: false,
    dot: '#80c0f0',
    group: 'Bases',
    indicator_ok: ['mo', 'smo'],
    Mw: Mw.na2co3,
  },
  {
    id: 'nh3',
    formula: 'NH\u2083',
    name: 'Ammonia solution',
    type: 'base',
    strong: false,
    dot: '#c0f080',
    group: 'Bases',
    indicator_ok: ['mo', 'smo'],
    Kb: Kb.nh3,
    Mw: Mw.nh3,
  },
]);

// ── Valid titrant + analyte pairs (defines the pH model for each combination) ─

/**
 * @typedef {Object} ChemPair
 * @property {string} titrant  Chemical id in the burette
 * @property {string} analyte  Chemical id in the flask
 * @property {string} type     ReactionSystem type string
 */

/** @type {Readonly<ChemPair[]>} */
const VALID_PAIRS = Object.freeze([
  { titrant: 'naoh',      analyte: 'hcl',       type: 'SA_SB'      },
  { titrant: 'naoh',      analyte: 'h2so4_dil', type: 'SA_SB'      },
  { titrant: 'naoh',      analyte: 'ethanoic',  type: 'WA_SB'      },
  { titrant: 'hcl',       analyte: 'naoh',      type: 'SA_SB'      },
  { titrant: 'h2so4_dil', analyte: 'naoh',      type: 'SA_SB'      },
  { titrant: 'hcl',       analyte: 'nh3',       type: 'SA_WB'      },
  { titrant: 'h2so4_dil', analyte: 'nh3',       type: 'SA_WB'      },
  { titrant: 'hcl',       analyte: 'na2co3',    type: 'Na2CO3_SA'  },
  { titrant: 'h2so4_dil', analyte: 'na2co3',    type: 'Na2CO3_SA'  },
]);

// ── ChemicalDB class ─────────────────────────────────────────────────────────

export class ChemicalDB {
  /**
   * Look up a chemical by id.
   * @param {string} id
   * @returns {Chemical|null}
   */
  static get(id) {
    return CHEMICALS.find(c => c.id === id) ?? null;
  }

  /**
   * All chemicals in display order.
   * @returns {Chemical[]}
   */
  static all() {
    return [...CHEMICALS];
  }

  /**
   * All valid titrant+analyte combinations.
   * @returns {ChemPair[]}
   */
  static validPairs() {
    return [...VALID_PAIRS];
  }

  /**
   * Describe a titrant+analyte combination.
   * Returns null if the pair has no supported pH model.
   *
   * @param {string} titrantId
   * @param {string} analyteId
   * @returns {{ type: string, label: string, hasSecondEP: boolean }|null}
   */
  static describe(titrantId, analyteId) {
    const pair = VALID_PAIRS.find(
      p => p.titrant === titrantId && p.analyte === analyteId,
    );
    if (!pair) return null;

    const t = ChemicalDB.get(titrantId);
    const a = ChemicalDB.get(analyteId);
    return {
      type:         pair.type,
      label:        `${t.formula} vs ${a.formula}`,
      hasSecondEP:  pair.type === 'Na2CO3_SA',
    };
  }
}
