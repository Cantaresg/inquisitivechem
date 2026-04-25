/**
 * data/products.js
 * PRODUCT_DB — all observable products of electrolysis, with their test mappings.
 *
 * A product is everything a student can observe: gases, solid deposits,
 * colour changes in the solution, or electrode dissolution.
 *
 * Fields:
 *   id          — unique key
 *   name        — plain-English name
 *   formula     — Unicode formula string
 *   state       — 'gas' | 'solid' | 'aqueous'
 *   electrode   — 'cathode' | 'anode'
 *   colour      — CSS colour for animation rendering
 *                 gas:   bubble colour
 *                 solid: deposit / electrode surface colour
 *                 aqueous: solution tint change
 *   observation — plain-English observation for O-Level obs log
 *   tests       — results of applying each test to this product
 *     litmus        — 'no change' | 'turns red' | 'turns blue' | 'bleached'
 *     glowingSplint — 'no effect' | 'relights'
 *     burningSpliint — 'no effect' | 'pops' | 'extinguishes'
 *     flameColour   — CSS colour string | null
 *     smell         — string | null
 *
 * Lookup maps (exported separately):
 *   CATHODE_PRODUCT_BY_ION   — ionId → product id
 *   ANODE_PRODUCT_BY_ION     — ionId → product id
 *   ANODE_DISSOLVE_BY_ELECTRODE — electrodeId → product id
 */

export const PRODUCT_DB = {

  // ──────────────────────────────────────────────────────────────────────
  // CATHODE PRODUCTS (reduction)
  // ──────────────────────────────────────────────────────────────────────

  cu_deposit: {
    id:          'cu_deposit',
    name:        'Copper',
    formula:     'Cu(s)',
    state:       'solid',
    electrode:   'cathode',
    colour:      '#b87333',           // copper-brown
    observation: 'Pink-brown solid deposit forms on the cathode.',
    tests: {
      litmus:         null,           // solid, not tested directly
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    '#3ddc84',      // green (Cu flame) — if heated in flame test
      smell:          null,
    },
  },

  ag_deposit: {
    id:          'ag_deposit',
    name:        'Silver',
    formula:     'Ag(s)',
    state:       'solid',
    electrode:   'cathode',
    colour:      '#c8c8c8',           // silver-grey
    observation: 'Shiny silver-white solid deposit forms on the cathode.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  zn_deposit: {
    id:          'zn_deposit',
    name:        'Zinc',
    formula:     'Zn(s)',
    state:       'solid',
    electrode:   'cathode',
    colour:      '#8a8a9a',           // blue-grey
    observation: 'Grey spongy deposit forms on the cathode.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  fe_deposit: {
    id:          'fe_deposit',
    name:        'Iron',
    formula:     'Fe(s)',
    state:       'solid',
    electrode:   'cathode',
    colour:      '#6e6e6e',
    observation: 'Dark grey solid deposit forms on the cathode.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  h2_gas: {
    id:          'h2_gas',
    name:        'Hydrogen',
    formula:     'H₂(g)',
    state:       'gas',
    electrode:   'cathode',
    colour:      'rgba(200,230,255,0.6)',   // near-colourless bubbles
    observation: 'Colourless gas bubbles form at the cathode.',
    tests: {
      litmus:         'no change',
      glowingSplint:  'no effect',
      burningSplint:  'pops',               // squeaky pop with burning splint
      flameColour:    null,
      smell:          null,
    },
  },

  na_liquid: {
    id:          'na_liquid',
    name:        'Sodium (molten)',
    formula:     'Na(l)',
    state:       'liquid',
    floats:      true,           // Na (~0.97 g/cm³) is less dense than molten NaCl (~1.56 g/cm³)
    electrode:   'cathode',
    colour:      '#d9e4ef',
    observation: 'Silvery molten sodium metal floats on the surface of the melt.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    '#f8d74a',
      smell:          null,
    },
  },

  pb_liquid: {
    id:          'pb_liquid',
    name:        'Lead (molten)',
    formula:     'Pb(l)',
    state:       'liquid',
    floats:      false,          // Pb (~10.5 g/cm³) is denser than molten PbBr₂ (~5.7 g/cm³)
    electrode:   'cathode',
    colour:      '#8590a0',
    observation: 'Silvery liquid lead sinks to the bottom of the melt.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  zn_liquid: {
    id:          'zn_liquid',
    name:        'Zinc (molten)',
    formula:     'Zn(l)',
    state:       'liquid',
    floats:      false,          // Zn (~6.6 g/cm³) is denser than molten ZnCl₂ (~2.5 g/cm³)
    electrode:   'cathode',
    colour:      '#9ba8b0',
    observation: 'Silvery liquid zinc sinks to the bottom of the melt.',
    tests: {
      litmus:         null,
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // ANODE PRODUCTS — oxidation of electrolyte ions (inert electrode)
  // ──────────────────────────────────────────────────────────────────────

  cl2_gas: {
    id:          'cl2_gas',
    name:        'Chlorine',
    formula:     'Cl₂(g)',
    state:       'gas',
    electrode:   'anode',
    colour:      'rgba(200,230,100,0.55)',  // pale yellow-green
    observation: 'Pale yellow-green gas with a pungent bleach smell forms at the anode.',
    tests: {
      litmus:         'bleached',           // damp red litmus turns then bleaches
      glowingSplint:  'no effect',
      burningSplint:  'extinguishes',
      flameColour:    null,
      smell:          'pungent bleach smell',
    },
  },

  o2_gas: {
    id:          'o2_gas',
    name:        'Oxygen',
    formula:     'O₂(g)',
    state:       'gas',
    electrode:   'anode',
    colour:      'rgba(220,240,255,0.5)',   // colourless bubbles
    observation: 'Colourless gas bubbles form at the anode.',
    tests: {
      litmus:         'no change',
      glowingSplint:  'relights',
      burningSplint:  'no effect',
      flameColour:    null,
      smell:          null,
    },
  },

  br2_aq: {
    id:          'br2_aq',
    name:        'Bromine',
    formula:     'Br₂(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      '#c4602a',                // orange-brown
    observation: 'Orange-brown colour appears in solution at the anode.',
    tests: {
      litmus:         'bleached',          // Br₂ also bleaches slowly
      glowingSplint:  'no effect',
      burningSplint:  'no effect',
      flameColour:    null,
      smell:          'pungent, similar to chlorine but less sharp',
    },
  },

  i2_aq: {
    id:          'i2_aq',
    name:        'Iodine',
    formula:     'I₂(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      '#5c3d1e',                // brown
    observation: 'Brown colour appears in solution at the anode.',
    tests: {
      litmus:         'no change',
      glowingSplint:  'no effect',
      burningSplint:  'no effect',
      flameColour:    null,
      smell:          null,
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // ANODE PRODUCTS — reactive electrode dissolution
  // ──────────────────────────────────────────────────────────────────────
  // These represent the electrode material dissolving into the solution
  // rather than a gas/deposit forming. The 'colour' here is the tint
  // added to the electrolyte as the ion enters solution.

  cu_dissolve: {
    id:          'cu_dissolve',
    name:        'Copper(II) ions enter solution',
    formula:     'Cu²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      '#4a90d9',                // blue
    observation: 'The copper anode decreases in mass. The solution gradually turns blue as Cu²⁺ ions form.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    '#3ddc84',           // green flame (Cu²⁺ solution flame test)
      smell:          null,
    },
  },

  zn_dissolve: {
    id:          'zn_dissolve',
    name:        'Zinc ions enter solution',
    formula:     'Zn²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.12)', // colourless
    observation: 'The zinc anode decreases in mass. Zn²⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  ag_dissolve: {
    id:          'ag_dissolve',
    name:        'Silver ions enter solution',
    formula:     'Ag⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.10)', // colourless
    observation: 'The silver anode decreases in mass. Ag⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  fe_dissolve: {
    id:          'fe_dissolve',
    name:        'Iron(II) ions enter solution',
    formula:     'Fe²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      '#c8dfa0',               // pale green
    observation: 'The iron anode decreases in mass. The solution turns pale green as Fe²⁺ ions form.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    '#f5a623',          // orange flame (Fe²⁺ flame test — weak)
      smell:          null,
    },
  },

  mg_dissolve: {
    id:          'mg_dissolve',
    name:        'Magnesium ions enter solution',
    formula:     'Mg²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.10)', // colourless
    observation: 'The magnesium anode decreases in mass. Mg²⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    '#f5f5dc',          // bright white flame (Mg)
      smell:          null,
    },
  },

  al_dissolve: {
    id:          'al_dissolve',
    name:        'Aluminium ions enter solution',
    formula:     'Al³⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.10)', // colourless
    observation: 'The aluminium anode decreases in mass. Al³⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  ni_dissolve: {
    id:          'ni_dissolve',
    name:        'Nickel(II) ions enter solution',
    formula:     'Ni²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      '#a8d8a0',               // pale green
    observation: 'The nickel anode decreases in mass. The solution turns pale green as Ni²⁺ ions form.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  sn_dissolve: {
    id:          'sn_dissolve',
    name:        'Tin(II) ions enter solution',
    formula:     'Sn²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.10)', // colourless
    observation: 'The tin anode decreases in mass. Sn²⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

  pb_dissolve: {
    id:          'pb_dissolve',
    name:        'Lead(II) ions enter solution',
    formula:     'Pb²⁺(aq)',
    state:       'aqueous',
    electrode:   'anode',
    colour:      'rgba(200,220,255,0.10)', // colourless
    observation: 'The lead anode decreases in mass. Pb²⁺ ions enter the solution.',
    tests: {
      litmus:         'no change',
      glowingSplint:  null,
      burningSplint:  null,
      flameColour:    null,
      smell:          null,
    },
  },

};

// ──────────────────────────────────────────────────────────────────────────
// Lookup maps — used by the engine to resolve products from ion/electrode ids
// ──────────────────────────────────────────────────────────────────────────

/**
 * Maps cathode ion id → product id.
 * Engine calls: CATHODE_PRODUCT_BY_ION[winnerIonId]
 */
export const CATHODE_PRODUCT_BY_ION = {
  'Ag+':  'ag_deposit',
  'Cu2+': 'cu_deposit',
  'H+':   'h2_gas',
  'Zn2+': 'zn_deposit',
  'Fe2+': 'fe_deposit',
  // Na+, K+, Ca2+ → also map to h2_gas because they cannot deposit in water.
  // The engine's discharge selection will never pick them over H⁺ anyway,
  // but mapping them here makes the ProductDB self-documenting.
  'Na+':  'h2_gas',
  'K+':   'h2_gas',
  'Ca2+': 'h2_gas',
  // Implicit water reduction at cathode
  'H2O_cathode': 'h2_gas',
};

/**
 * Maps anode anion id → product id (inert electrode only).
 * Engine calls: ANODE_PRODUCT_BY_ION[winnerIonId]
 */
export const ANODE_PRODUCT_BY_ION = {
  'I-':    'i2_aq',
  'Br-':   'br2_aq',
  'Cl-':   'cl2_gas',
  'OH-':   'o2_gas',
  'SO4²-': 'o2_gas',    // SO₄²⁻ not discharged → water/OH⁻ always wins
  'NO3-':  'o2_gas',    // NO₃⁻ not discharged → water/OH⁻ always wins
  'H2O_anode': 'o2_gas',
};

/**
 * Maps reactive electrode id → dissolution product id.
 * Engine calls: ANODE_DISSOLVE_BY_ELECTRODE[electrodeId]
 * Only relevant when anode.isInert === false.
 */
export const ANODE_DISSOLVE_BY_ELECTRODE = {
  'copper':    'cu_dissolve',
  'zinc':      'zn_dissolve',
  'silver':    'ag_dissolve',
  'iron':      'fe_dissolve',
  'magnesium': 'mg_dissolve',
  'aluminium': 'al_dissolve',
  'nickel':    'ni_dissolve',
  'tin':       'sn_dissolve',
  'lead':      'pb_dissolve',
};

/**
 * Half-equations for each product, keyed by product id.
 * Used by ObsPanel equations tab and docx export.
 *
 * Format:
 *   reduction  — written as reduction (cathode direction)
 *   oxidation  — written as oxidation (anode direction)
 *   n          — electrons transferred per formula unit shown
 */
export const PRODUCT_EQUATIONS = {
  cu_deposit:  { reduction: 'Cu²⁺(aq) + 2e⁻ → Cu(s)',                             oxidation: 'Cu(s) → Cu²⁺(aq) + 2e⁻',                     n: 2 },
  ag_deposit:  { reduction: 'Ag⁺(aq) + e⁻ → Ag(s)',                               oxidation: 'Ag(s) → Ag⁺(aq) + e⁻',                        n: 1 },
  zn_deposit:  { reduction: 'Zn²⁺(aq) + 2e⁻ → Zn(s)',                             oxidation: 'Zn(s) → Zn²⁺(aq) + 2e⁻',                     n: 2 },
  fe_deposit:  { reduction: 'Fe²⁺(aq) + 2e⁻ → Fe(s)',                             oxidation: 'Fe(s) → Fe²⁺(aq) + 2e⁻',                     n: 2 },
  h2_gas:      { reduction: '2H⁺(aq) + 2e⁻ → H₂(g)',                              oxidation: 'H₂(g) → 2H⁺(aq) + 2e⁻',                      n: 2 },
  cl2_gas:     { reduction: 'Cl₂(g) + 2e⁻ → 2Cl⁻(aq)',                            oxidation: '2Cl⁻(aq) → Cl₂(g) + 2e⁻',                    n: 2 },
  o2_gas:      { reduction: 'O₂(g) + 2H₂O(l) + 4e⁻ → 4OH⁻(aq)',                  oxidation: '4OH⁻(aq) → O₂(g) + 2H₂O(l) + 4e⁻',          n: 4 },
  br2_aq:      { reduction: 'Br₂(aq) + 2e⁻ → 2Br⁻(aq)',                           oxidation: '2Br⁻(aq) → Br₂(aq) + 2e⁻',                   n: 2 },
  i2_aq:       { reduction: 'I₂(aq) + 2e⁻ → 2I⁻(aq)',                             oxidation: '2I⁻(aq) → I₂(aq) + 2e⁻',                     n: 2 },
  cu_dissolve: { reduction: 'Cu²⁺(aq) + 2e⁻ → Cu(s)',                             oxidation: 'Cu(s) → Cu²⁺(aq) + 2e⁻',                     n: 2 },
  zn_dissolve: { reduction: 'Zn²⁺(aq) + 2e⁻ → Zn(s)',                             oxidation: 'Zn(s) → Zn²⁺(aq) + 2e⁻',                     n: 2 },
  ag_dissolve: { reduction: 'Ag⁺(aq) + e⁻ → Ag(s)',                               oxidation: 'Ag(s) → Ag⁺(aq) + e⁻',                        n: 1 },
  fe_dissolve: { reduction: 'Fe²⁺(aq) + 2e⁻ → Fe(s)',                             oxidation: 'Fe(s) → Fe²⁺(aq) + 2e⁻',                     n: 2 },
  mg_dissolve: { reduction: 'Mg²⁺(aq) + 2e⁻ → Mg(s)',                             oxidation: 'Mg(s) → Mg²⁺(aq) + 2e⁻',                     n: 2 },
  al_dissolve: { reduction: 'Al³⁺(aq) + 3e⁻ → Al(s)',                             oxidation: 'Al(s) → Al³⁺(aq) + 3e⁻',                     n: 3 },
  ni_dissolve: { reduction: 'Ni²⁺(aq) + 2e⁻ → Ni(s)',                             oxidation: 'Ni(s) → Ni²⁺(aq) + 2e⁻',                     n: 2 },
  sn_dissolve: { reduction: 'Sn²⁺(aq) + 2e⁻ → Sn(s)',                             oxidation: 'Sn(s) → Sn²⁺(aq) + 2e⁻',                     n: 2 },
  pb_dissolve: { reduction: 'Pb²⁺(aq) + 2e⁻ → Pb(s)',                             oxidation: 'Pb(s) → Pb²⁺(aq) + 2e⁻',                     n: 2 },
  na_liquid:   { reduction: 'Na⁺ + e⁻ → Na(l)',                                    oxidation: 'Na(l) → Na⁺ + e⁻',                            n: 1 },
  pb_liquid:   { reduction: 'Pb²⁺(l) + 2e⁻ → Pb(l)',                               oxidation: 'Pb(l) → Pb²⁺(l) + 2e⁻',                       n: 2 },
  zn_liquid:   { reduction: 'Zn²⁺(l) + 2e⁻ → Zn(l)',                               oxidation: 'Zn(l) → Zn²⁺(l) + 2e⁻',                       n: 2 },
};
