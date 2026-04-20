/**
 * data/electrodes.js
 * ELECTRODE_DB — all electrode components available in the simulation.
 *
 * Fields:
 *   id                  — unique key used throughout the codebase
 *   name                — full display name
 *   symbol              — element symbol shown on component card
 *   isInert             — true: does NOT dissolve as anode (C, Pt)
 *                         false: DOES dissolve as anode (Cu, Zn, Ag, Fe)
 *   standardPotential   — E° (V vs SHE) for M^n+ + ne⁻ → M(s)
 *                         null for inert electrodes (no oxidation half-cell)
 *   oxidationProductId  — ion symbol produced when this reactive electrode acts
 *                         as the anode (matches ION_DB key). null for inert.
 *   dissolutionIonCharge — charge on the produced ion (e.g. 2 for Cu²⁺)
 *   dissolutionElectronCount — electrons released per atom dissolved
 *   colour              — CSS colour for the electrode rod in the SVG canvas
 *   level               — 'O_LEVEL' (available always) | 'A_LEVEL' (hidden in O-Level mode)
 *   description         — one-line tooltip / info text for the component panel
 */

export const ELECTRODE_DB = {

  carbon: {
    id:                       'carbon',
    name:                     'Carbon (graphite)',
    symbol:                   'C',
    isInert:                  true,
    standardPotential:        null,
    oxidationProductId:       null,
    dissolutionIonCharge:     null,
    dissolutionElectronCount: null,
    colour:                   '#2d2d2d',
    level:                    'O_LEVEL',
    description:              'Inert graphite electrode — does not dissolve as anode.',
  },

  platinum: {
    id:                       'platinum',
    name:                     'Platinum',
    symbol:                   'Pt',
    isInert:                  true,
    standardPotential:        null,
    oxidationProductId:       null,
    dissolutionIonCharge:     null,
    dissolutionElectronCount: null,
    colour:                   '#d4d4d4',
    level:                    'O_LEVEL',
    description:              'Inert platinum electrode — does not dissolve as anode.',
  },

  copper: {
    id:                       'copper',
    name:                     'Copper',
    symbol:                   'Cu',
    isInert:                  false,
    standardPotential:        +0.34,
    oxidationProductId:       'Cu2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Cu → Cu²⁺ + 2e⁻
    colour:                   '#b87333',
    level:                    'O_LEVEL',
    description:              'Reactive copper electrode — dissolves as anode, producing Cu²⁺ ions.',
  },

  zinc: {
    id:                       'zinc',
    name:                     'Zinc',
    symbol:                   'Zn',
    isInert:                  false,
    standardPotential:        -0.76,
    oxidationProductId:       'Zn2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Zn → Zn²⁺ + 2e⁻
    colour:                   '#7a7a8a',
    level:                    'O_LEVEL',
    description:              'Reactive zinc electrode — dissolves as anode, producing Zn²⁺ ions.',
  },

  silver: {
    id:                       'silver',
    name:                     'Silver',
    symbol:                   'Ag',
    isInert:                  false,
    standardPotential:        +0.80,
    oxidationProductId:       'Ag+',
    dissolutionIonCharge:     +1,
    dissolutionElectronCount: 1,    // Ag → Ag⁺ + e⁻
    colour:                   '#c0c0c0',
    level:                    'O_LEVEL',
    description:              'Reactive silver electrode — dissolves as anode, producing Ag⁺ ions.',
  },

  iron: {
    id:                       'iron',
    name:                     'Iron',
    symbol:                   'Fe',
    isInert:                  false,
    standardPotential:        -0.44,
    oxidationProductId:       'Fe2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Fe → Fe²⁺ + 2e⁻
    colour:                   '#6e6e6e',
    level:                    'O_LEVEL',
    description:              'Reactive iron electrode — dissolves as anode, producing Fe²⁺ ions.',
  },

  nickel: {
    id:                       'nickel',
    name:                     'Nickel',
    symbol:                   'Ni',
    isInert:                  false,
    standardPotential:        -0.25,
    oxidationProductId:       'Ni2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Ni → Ni²⁺ + 2e⁻
    colour:                   '#72944a',
    level:                    'O_LEVEL',
    description:              'Reactive nickel electrode — dissolves as anode, producing Ni²⁺ ions.',
  },

  tin: {
    id:                       'tin',
    name:                     'Tin',
    symbol:                   'Sn',
    isInert:                  false,
    standardPotential:        -0.14,
    oxidationProductId:       'Sn2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Sn → Sn²⁺ + 2e⁻
    colour:                   '#8a9eb0',
    level:                    'O_LEVEL',
    description:              'Reactive tin electrode — dissolves as anode, producing Sn²⁺ ions.',
  },

  lead: {
    id:                       'lead',
    name:                     'Lead',
    symbol:                   'Pb',
    isInert:                  false,
    standardPotential:        -0.13,
    oxidationProductId:       'Pb2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Pb → Pb²⁺ + 2e⁻
    colour:                   '#5a5a6a',
    level:                    'O_LEVEL',
    description:              'Reactive lead electrode — dissolves as anode, producing Pb²⁺ ions.',
  },

  magnesium: {
    id:                       'magnesium',
    name:                     'Magnesium',
    symbol:                   'Mg',
    isInert:                  false,
    standardPotential:        -2.37,
    oxidationProductId:       'Mg2+',
    dissolutionIonCharge:     +2,
    dissolutionElectronCount: 2,    // Mg → Mg²⁺ + 2e⁻
    colour:                   '#b8d0c8',
    level:                    'O_LEVEL',
    description:              'Highly reactive magnesium electrode — vigorous oxidation as anode.',
  },

  aluminium: {
    id:                       'aluminium',
    name:                     'Aluminium',
    symbol:                   'Al',
    isInert:                  false,
    standardPotential:        -1.66,
    oxidationProductId:       'Al3+',
    dissolutionIonCharge:     +3,
    dissolutionElectronCount: 3,    // Al → Al³⁺ + 3e⁻
    colour:                   '#c8d8e8',
    level:                    'O_LEVEL',
    description:              'Reactive aluminium electrode — dissolves as anode, producing Al³⁺ ions.',
  },

};

/** Ordered for the left component panel — reactivity series order (most reactive first) */
export const ELECTRODE_ORDER = [
  'carbon',
  'platinum',
  'magnesium',
  'aluminium',
  'zinc',
  'iron',
  'nickel',
  'tin',
  'lead',
  'copper',
  'silver',
];

/** Returns all electrode records visible at the given curriculum level */
export function getElectrodesForLevel(level) {
  return ELECTRODE_ORDER
    .map(id => ELECTRODE_DB[id])
    .filter(e => level === 'A_LEVEL' || e.level === 'O_LEVEL');
}
