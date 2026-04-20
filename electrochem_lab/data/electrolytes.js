/**
 * data/electrolytes.js
 * ELECTROLYTE_DB — all electrolyte solutions available in the bottom panel.
 *
 * Ion concentration model
 * ───────────────────────
 * Each ion entry stores a `stoichFactor` — the moles of that ion produced per
 * mole of electrolyte dissolved. Actual ion concentration is:
 *
 *   [ion] = stoichFactor × electrolyte.concentration   (mol dm⁻³)
 *
 * This lets the concentration slider drive all ion concentrations consistently.
 *
 * Fields (electrolyte record):
 *   id             — unique key
 *   name           — display name for panel card
 *   formula        — Unicode formula string
 *   cations        — Array<{ ionId, stoichFactor }>  (ionId matches ION_DB key)
 *   anions         — Array<{ ionId, stoichFactor }>
 *   concentration  — default concentration in mol dm⁻³
 *   isConcentrated — true when concentration > ~2 mol dm⁻³ Cl⁻ (O-Level shorthand)
 *                    Re-evaluated dynamically by engine when slider moves.
 *   colour         — CSS colour for the beaker liquid fill
 *   pH             — default pH at stated concentration (used to derive [H⁺], [OH⁻])
 *   level          — 'O_LEVEL' | 'A_LEVEL'
 *   description    — tooltip text for bottom panel card
 *
 * Implicit ions always available to the engine (not listed in cations/anions):
 *   H⁺  — concentration = 10^(-pH)
 *   OH⁻ — concentration = 10^(-(14-pH))
 */

export const ELECTROLYTE_DB = {

  // ── O-Level electrolytes ──────────────────────────────────────────────

  cuso4_aq: {
    id:             'cuso4_aq',
    name:           'Copper(II) sulfate',
    formula:        'CuSO₄(aq)',
    cations:        [{ ionId: 'Cu2+', stoichFactor: 1 }],
    anions:         [{ ionId: 'SO4²-', stoichFactor: 1 }],
    concentration:  0.5,
    isConcentrated: false,
    colour:         '#4a90d9',        // blue
    pH:             4.0,              // slightly acidic (Cu²⁺ hydrolysis)
    level:          'O_LEVEL',
    description:    'Blue solution. Cu²⁺ deposits at cathode; O₂ evolves at anode (inert electrodes).',
  },

  nacl_aq: {
    id:             'nacl_aq',
    name:           'Sodium chloride (dilute)',
    formula:        'NaCl(aq)',
    cations:        [{ ionId: 'Na+', stoichFactor: 1 }],
    anions:         [{ ionId: 'Cl-', stoichFactor: 1 }],
    concentration:  1.0,
    isConcentrated: false,
    colour:         'rgba(200,220,255,0.10)',   // near-colourless
    pH:             7.0,
    level:          'O_LEVEL',
    description:    'Dilute NaCl. H₂ at cathode; O₂ at anode (Cl⁻ not discharged preferentially).',
  },

  nacl_conc: {
    id:             'nacl_conc',
    name:           'Sodium chloride (concentrated)',
    formula:        'NaCl(aq) conc.',
    cations:        [{ ionId: 'Na+', stoichFactor: 1 }],
    anions:         [{ ionId: 'Cl-', stoichFactor: 1 }],
    concentration:  4.0,
    isConcentrated: true,            // [Cl⁻] > 2 mol dm⁻³
    colour:         'rgba(200,220,255,0.14)',
    pH:             7.0,
    level:          'O_LEVEL',
    description:    'Concentrated NaCl. H₂ at cathode; Cl₂ at anode (Cl⁻ preferentially discharged).',
  },

  h2so4_dil: {
    id:             'h2so4_dil',
    name:           'Sulfuric acid (dilute)',
    formula:        'H₂SO₄(aq)',
    cations:        [{ ionId: 'H+',    stoichFactor: 2 }],   // diprotic — 2 H⁺ per formula unit
    anions:         [{ ionId: 'SO4²-', stoichFactor: 1 }],
    concentration:  1.0,
    isConcentrated: false,
    colour:         'rgba(230,240,200,0.12)',   // faint straw/yellow tint
    pH:             0.0,              // 1 mol dm⁻³ H₂SO₄ ≈ 2 mol dm⁻³ H⁺ → pH ≈ −0.3, capped at 0
    level:          'O_LEVEL',
    description:    'Dilute H₂SO₄. H₂ at cathode; O₂ at anode (SO₄²⁻ not discharged).',
  },

  naoh_aq: {
    id:             'naoh_aq',
    name:           'Sodium hydroxide',
    formula:        'NaOH(aq)',
    cations:        [{ ionId: 'Na+', stoichFactor: 1 }],
    anions:         [{ ionId: 'OH-', stoichFactor: 1 }],
    concentration:  1.0,
    isConcentrated: false,
    colour:         'rgba(200,220,255,0.08)',   // colourless
    pH:             14.0,
    level:          'O_LEVEL',
    description:    'Alkaline NaOH. H₂ at cathode; O₂ at anode.',
  },

  cucl2_aq: {
    id:             'cucl2_aq',
    name:           'Copper(II) chloride',
    formula:        'CuCl₂(aq)',
    cations:        [{ ionId: 'Cu2+', stoichFactor: 1 }],
    anions:         [{ ionId: 'Cl-',  stoichFactor: 2 }],   // 2 Cl⁻ per CuCl₂
    concentration:  0.5,
    isConcentrated: false,           // [Cl⁻] = 1.0 mol dm⁻³ at default — dilute
    colour:         '#3da5c8',        // blue-green
    pH:             4.0,
    level:          'O_LEVEL',
    description:    'Blue-green solution. Cu²⁺ deposits at cathode; Cl₂ or O₂ at anode depending on [Cl⁻].',
  },

  // ── A-Level electrolytes ──────────────────────────────────────────────

  agno3_aq: {
    id:             'agno3_aq',
    name:           'Silver nitrate',
    formula:        'AgNO₃(aq)',
    cations:        [{ ionId: 'Ag+',  stoichFactor: 1 }],
    anions:         [{ ionId: 'NO3-', stoichFactor: 1 }],
    concentration:  0.5,
    isConcentrated: false,
    colour:         'rgba(200,220,255,0.10)',   // colourless
    pH:             6.5,
    level:          'A_LEVEL',
    description:    'Ag⁺ deposits at cathode; O₂ at anode (NO₃⁻ not discharged). (A-Level)',
  },

};

/** Ordered for the bottom panel (O-Level first, A-Level at end) */
export const ELECTROLYTE_ORDER = [
  'cuso4_aq',
  'nacl_aq',
  'nacl_conc',
  'h2so4_dil',
  'naoh_aq',
  'cucl2_aq',
  'agno3_aq',
];

/** Returns all electrolyte records visible at the given curriculum level */
export function getElectrolytesForLevel(level) {
  return ELECTROLYTE_ORDER
    .map(id => ELECTROLYTE_DB[id])
    .filter(e => level === 'A_LEVEL' || e.level === 'O_LEVEL');
}

/**
 * Determine whether the Cl⁻ concentration in an electrolyte record qualifies
 * as "concentrated" for O-Level discharge series purposes.
 * Called by the engine after the concentration slider updates.
 *
 * @param {object} electrolyte — record from ELECTROLYTE_DB
 * @param {number} concentration — current slider value (mol dm⁻³)
 * @returns {boolean}
 */
export function isChlorideConcentrated(electrolyte, concentration) {
  const clEntry = electrolyte.anions.find(a => a.ionId === 'Cl-');
  if (!clEntry) return false;
  return (clEntry.stoichFactor * concentration) >= 2.0;
}
