/**
 * data/reagents.js
 * Full REAGENTS catalogue — the only file that needs editing to add new chemicals.
 *
 * Ion notation conventions used throughout the data layer:
 *   Single-charge:   'H+', 'Cl-', 'Na+', 'OH-', 'NH4+', 'Ag+', 'MnO4-'
 *   Divalent cation: 'Ca2+', 'Cu2+', 'Fe2+', 'Ba2+', 'Pb2+', 'Zn2+', 'Mg2+', 'Mn2+'
 *   Trivalent cation:'Fe3+', 'Al3+'
 *   Divalent anion:  'SO4²-', 'CO3²-', 'S²-', 'Cr2O7²-'
 *   Molecular:       'H2O2', 'NH3', 'CH3COOH', 'HCl' (dissolved gas species)
 *
 * Field definitions:
 *   id          — unique string; foreign key used in reactions.js, tests.js, easter-eggs.js
 *   label       — display name shown in the Chemical Store tree
 *   category    — top-level tree group: 'liquid' | 'solid'
 *   subcategory — second-level group driving the tree
 *   color       — CSS color string for the liquid layer or solid chip
 *   ions        — { ionSymbol: relativeConcentration } — relative mol/L (not exact);
 *                 used by ReactionEngine for reaction priority; empty {} for solids
 *   solids      — array of { id, amount } added to Solution.solids when reagent is placed
 *                 (only present on solid reagents)
 *   dissolvedGas — gas id released when mixed (e.g. 'HCl' for conc. HCl, 'NH3' for ammonia)
 *   isHot        — default heat state (always false; heat is toggled via vessel controls)
 */

export const REAGENTS = [

  // ═══════════════════════════════════════════════════════════
  // LIQUIDS
  // ═══════════════════════════════════════════════════════════

  // ── Acids ────────────────────────────────────────────────

  {
    id: 'hcl_dil',
    label: 'Hydrochloric acid (dil.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.12)',
    ions: { 'H+': 0.1, 'Cl-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'hcl_conc',
    label: 'Hydrochloric acid (conc.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.15)',
    ions: { 'H+': 0.5, 'Cl-': 0.5 },
    dissolvedGas: 'HCl',
    isHot: false,
  },
  {
    id: 'h2so4_dil',
    label: 'Sulfuric acid (dil.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.12)',
    ions: { 'H+': 0.2, 'SO4²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'h2so4_conc',
    label: 'Sulfuric acid (conc.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.20)',
    ions: { 'H+': 0.9, 'SO4²-': 0.45 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'hno3_dil',
    label: 'Nitric acid (dil.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.12)',
    ions: { 'H+': 0.1, 'NO3-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'hno3_conc',
    label: 'Nitric acid (conc.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(210,215,255,0.20)',
    ions: { 'H+': 0.5, 'NO3-': 0.5 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'ch3cooh',
    label: 'Ethanoic acid (dil.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(200,220,255,0.10)',
    // Weak acid — partial dissociation; CH3COOH tracks undissociated molecules
    ions: { 'H+': 0.02, 'CH3COO-': 0.02, 'CH3COOH': 0.08 },
    dissolvedGas: null,
    isHot: false,
  },

  // ── Alkalis ──────────────────────────────────────────────

  {
    id: 'naoh',
    label: 'Sodium hydroxide (aq)',
    category: 'liquid',
    subcategory: 'alkali',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.1, 'OH-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'koh',
    label: 'Potassium hydroxide (aq)',
    category: 'liquid',
    subcategory: 'alkali',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'K+': 0.1, 'OH-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'ca_oh2',
    label: 'Calcium hydroxide (aq)',
    category: 'liquid',
    subcategory: 'alkali',
    color: 'rgba(200,220,255,0.12)',
    // Slightly soluble — low concentrations
    ions: { 'Ca2+': 0.02, 'OH-': 0.04 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'nh3_aq',
    label: 'Ammonia solution',
    category: 'liquid',
    subcategory: 'alkali',
    color: 'rgba(200,220,255,0.10)',
    // Weak base — partial ionisation; NH3 tracks undissociated molecules
    ions: { 'NH4+': 0.02, 'OH-': 0.02, 'NH3': 0.08 },
    dissolvedGas: 'NH3',
    isHot: false,
  },

  // ── Aqueous Salts ────────────────────────────────────────

  {
    id: 'nacl_aq',
    label: 'Sodium chloride (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.1, 'Cl-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'na2so4_aq',
    label: 'Sodium sulfate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.2, 'SO4²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'na2co3_aq',
    label: 'Sodium carbonate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.2, 'CO3²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'na2s_aq',
    label: 'Sodium sulfide (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,225,210,0.12)',
    ions: { 'Na+': 0.2, 'S²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'nai_aq',
    label: 'Sodium iodide (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.1, 'I-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'nabr_aq',
    label: 'Sodium bromide (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Na+': 0.1, 'Br-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'agno3_aq',
    label: 'Silver nitrate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Ag+': 0.1, 'NO3-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'bacl2_aq',
    label: 'Barium chloride (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Ba2+': 0.1, 'Cl-': 0.2 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'pb_no3_aq',
    label: 'Lead(II) nitrate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Pb2+': 0.1, 'NO3-': 0.2 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'cuso4_aq',
    label: 'Copper(II) sulfate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(30,100,220,0.45)',
    ions: { 'Cu2+': 0.1, 'SO4²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'feso4_aq',
    label: 'Iron(II) sulfate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(100,180,100,0.35)',
    ions: { 'Fe2+': 0.1, 'SO4²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'fecl3_aq',
    label: 'Iron(III) chloride (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,100,20,0.50)',
    ions: { 'Fe3+': 0.1, 'Cl-': 0.3 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'znso4_aq',
    label: 'Zinc sulfate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Zn2+': 0.1, 'SO4²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'cacl2_aq',
    label: 'Calcium chloride (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'Ca2+': 0.1, 'Cl-': 0.2 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'ki_aq',
    label: 'Potassium iodide (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(200,220,255,0.10)',
    ions: { 'K+': 0.1, 'I-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'k2cr2o7_aq',
    label: 'Potassium dichromate (aq)',
    category: 'liquid',
    subcategory: 'aqueous_salt',
    color: 'rgba(255,140,0,0.60)',
    ions: { 'K+': 0.2, 'Cr2O7²-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },

  // ── Redox Reagents ───────────────────────────────────────

  {
    id: 'kmno4_aq',
    label: 'Potassium permanganate (aq)',
    category: 'liquid',
    subcategory: 'redox_reagent',
    color: 'rgba(80,0,90,0.80)',
    ions: { 'K+': 0.1, 'MnO4-': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'kmno4_acid',
    label: 'Acidified KMnO₄',
    category: 'liquid',
    subcategory: 'redox_reagent',
    color: 'rgba(80,0,90,0.80)',
    ions: { 'K+': 0.1, 'MnO4-': 0.1, 'H+': 0.2 },
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'h2o2_aq',
    label: 'Hydrogen peroxide (aq)',
    category: 'liquid',
    subcategory: 'redox_reagent',
    color: 'rgba(200,220,255,0.10)',
    // H2O2 tracked as a molecular species in the ion map
    ions: { 'H2O2': 0.1 },
    dissolvedGas: null,
    isHot: false,
  },

  // ═══════════════════════════════════════════════════════════
  // SOLIDS
  // ═══════════════════════════════════════════════════════════
  // Solids have ions: {} (no pre-dissolved ions).
  // The solids[] array is what gets added to Solution.solids.
  // ReactionEngine resolves dissolution via GAS_RULES / DISSOLUTION_RULES.

  // ── Metals ───────────────────────────────────────────────

  {
    id: 'mg_s',
    label: 'Magnesium',
    category: 'solid',
    subcategory: 'metal',
    color: '#b0b4b8',
    ions: {},
    solids: [{ id: 'mg_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'zn_s',
    label: 'Zinc',
    category: 'solid',
    subcategory: 'metal',
    color: '#9aadbb',
    ions: {},
    solids: [{ id: 'zn_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'fe_s',
    label: 'Iron',
    category: 'solid',
    subcategory: 'metal',
    color: '#4a4a55',
    ions: {},
    solids: [{ id: 'fe_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'cu_s',
    label: 'Copper',
    category: 'solid',
    subcategory: 'metal',
    color: '#b87033',
    ions: {},
    solids: [{ id: 'cu_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'al_s',
    label: 'Aluminium',
    category: 'solid',
    subcategory: 'metal',
    color: '#c8c8c8',
    ions: {},
    solids: [{ id: 'al_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },

  // ── Carbonates ───────────────────────────────────────────

  {
    id: 'na2co3_s',
    label: 'Sodium carbonate',
    category: 'solid',
    subcategory: 'carbonate',
    color: '#f0f0f2',
    ions: {},
    // Na₂CO₃ is soluble — dissolves in water; engine uses SOLUBLE_SOLIDS lookup
    solids: [{ id: 'na2co3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'mgco3_s',
    label: 'Magnesium carbonate',
    category: 'solid',
    subcategory: 'carbonate',
    color: '#f0f0f0',
    ions: {},
    solids: [{ id: 'mgco3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'caco3_s',
    label: 'Calcium carbonate',
    category: 'solid',
    subcategory: 'carbonate',
    color: '#f5f5f5',
    ions: {},
    solids: [{ id: 'caco3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'znco3_s',
    label: 'Zinc carbonate',
    category: 'solid',
    subcategory: 'carbonate',
    color: '#f0f0f0',
    ions: {},
    solids: [{ id: 'znco3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'cuco3_s',
    label: 'Copper(II) carbonate',
    category: 'solid',
    subcategory: 'carbonate',
    color: '#4d8a5f',
    ions: {},
    solids: [{ id: 'cuco3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },

  // ── Oxides ───────────────────────────────────────────────

  {
    id: 'cao_s',
    label: 'Calcium oxide',
    category: 'solid',
    subcategory: 'oxide',
    color: '#f0f0ee',
    ions: {},
    solids: [{ id: 'cao_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'mgo_s',
    label: 'Magnesium oxide',
    category: 'solid',
    subcategory: 'oxide',
    color: '#f5f5f5',
    ions: {},
    solids: [{ id: 'mgo_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'cuo_s',
    label: 'Copper(II) oxide',
    category: 'solid',
    subcategory: 'oxide',
    color: '#1a1a1a',
    ions: {},
    solids: [{ id: 'cuo_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'fe2o3_s',
    label: 'Iron(III) oxide',
    category: 'solid',
    subcategory: 'oxide',
    color: '#8b3000',
    ions: {},
    solids: [{ id: 'fe2o3_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
  {
    id: 'zno_s',
    label: 'Zinc oxide',
    category: 'solid',
    subcategory: 'oxide',
    color: '#f0f5f0',
    ions: {},
    solids: [{ id: 'zno_s', amount: 1.0 }],
    dissolvedGas: null,
    isHot: false,
  },
];

// ─── Display symbols (formula strings) ─────────────────────────────────────
// Used by ChemStoreUI and BenchUI to show chemical symbols instead of names.
// Only the id → symbol mapping lives here; reagent objects keep their label
// field for accessibility text and backward-compatibility.
// ─────────────────────────────────────────────────────────────────────────────
export const SYMBOL_MAP = {
  // Acids
  hcl_dil:     'HCl (dil.)',
  hcl_conc:    'HCl (conc.)',
  h2so4_dil:   'H₂SO₄ (dil.)',
  h2so4_conc:  'H₂SO₄ (conc.)',
  hno3_dil:    'HNO₃ (dil.)',
  hno3_conc:   'HNO₃ (conc.)',
  ch3cooh:     'CH₃COOH (dil.)',
  // Alkalis
  naoh:        'NaOH (aq)',
  koh:         'KOH (aq)',
  ca_oh2:      'Ca(OH)₂ (aq)',
  nh3_aq:      'NH₃ (aq)',
  // Aqueous salts
  nacl_aq:     'NaCl (aq)',
  na2so4_aq:   'Na₂SO₄ (aq)',
  na2co3_aq:   'Na₂CO₃ (aq)',
  na2s_aq:     'Na₂S (aq)',
  nai_aq:      'NaI (aq)',
  nabr_aq:     'NaBr (aq)',
  agno3_aq:    'AgNO₃ (aq)',
  bacl2_aq:    'BaCl₂ (aq)',
  pb_no3_aq:   'Pb(NO₃)₂ (aq)',
  cuso4_aq:    'CuSO₄ (aq)',
  feso4_aq:    'FeSO₄ (aq)',
  fecl3_aq:    'FeCl₃ (aq)',
  znso4_aq:    'ZnSO₄ (aq)',
  cacl2_aq:    'CaCl₂ (aq)',
  ki_aq:       'KI (aq)',
  k2cr2o7_aq:  'K₂Cr₂O₇ (aq)',
  // Redox reagents
  kmno4_aq:    'KMnO₄ (aq)',
  kmno4_acid:  'KMnO₄ / H₂SO₄ (aq)',
  h2o2_aq:     'H₂O₂ (aq)',
  // Metals
  mg_s:        'Mg (s)',
  zn_s:        'Zn (s)',
  fe_s:        'Fe (s)',
  cu_s:        'Cu (s)',
  al_s:        'Al (s)',
  // Carbonates
  na2co3_s:    'Na₂CO₃ (s)',
  mgco3_s:     'MgCO₃ (s)',
  caco3_s:     'CaCO₃ (s)',
  znco3_s:     'ZnCO₃ (s)',
  cuco3_s:     'CuCO₃ (s)',
  // Oxides
  cao_s:       'CaO (s)',
  mgo_s:       'MgO (s)',
  cuo_s:       'CuO (s)',
  fe2o3_s:     'Fe₂O₃ (s)',
  zno_s:       'ZnO (s)',
};
