/**
 * data/reactions.js
 * All reaction rules and lookup tables. Edit here to modify chemistry — no engine changes needed.
 *
 * Exports:
 *   PRECIPITATION_TABLE   — cation × anion → PptDescriptor | null
 *   GAS_RULES             — conditions that trigger gas evolution
 *   DISSOLUTION_RULES     — solid oxide/hydroxide + acid neutralisation (no gas)
 *   SOLUBLE_SOLIDS        — solids that dissolve spontaneously in water
 *   SOLID_ION_PRODUCTS    — what ions each solid produces when it reacts
 *   REDOX_RULES           — redox colour-change / ion-transform rules
 *   COMPLEXATION_RULES    — complex ion formation (ppt re-dissolves)
 *   OBSERVATIONS          — plain English observation strings (no formulas, no names)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PRECIPITATION TABLE
// PRECIPITATION_TABLE[cation][anion] = PptDescriptor | null
// null  = no precipitate (soluble)
// Absent entry = no entry in the table = no precipitate expected
//
// PptDescriptor shape:
//   { id, color, label, formula, equation }
//   equation — balanced net ionic equation string (shown in Reactions tab)
// ─────────────────────────────────────────────────────────────────────────────

export const PRECIPITATION_TABLE = {

  'Ag+': {
    'Cl-':   { id: 'agcl',    color: '#f0f0f0', label: 'white',        formula: 'AgCl',     equation: 'Ag⁺(aq) + Cl⁻(aq) → AgCl(s)' },
    'Br-':   { id: 'agbr',    color: '#e8e2a0', label: 'cream',        formula: 'AgBr',     equation: 'Ag⁺(aq) + Br⁻(aq) → AgBr(s)' },
    'I-':    { id: 'agi',     color: '#f5e642', label: 'yellow',       formula: 'AgI',      equation: 'Ag⁺(aq) + I⁻(aq) → AgI(s)' },
    'CO3²-': { id: 'ag2co3',  color: '#e8e6c0', label: 'pale yellow',  formula: 'Ag₂CO₃',  equation: '2Ag⁺(aq) + CO₃²⁻(aq) → Ag₂CO₃(s)' },
    'S²-':   { id: 'ag2s',    color: '#1a1a1a', label: 'black',        formula: 'Ag₂S',    equation: '2Ag⁺(aq) + S²⁻(aq) → Ag₂S(s)' },
    'SO4²-': null,   // AgSO₄ is slightly soluble — treat as no visible ppt
    'NO3-':  null,
    'OH-':   { id: 'ag2o',    color: '#4a2800', label: 'brown',        formula: 'Ag₂O',    equation: '2Ag⁺(aq) + 2OH⁻(aq) → Ag₂O(s) + H₂O(l)' },
  },

  'Ba2+': {
    'SO4²-': { id: 'baso4',   color: '#f8f8f8', label: 'white',        formula: 'BaSO₄',   equation: 'Ba²⁺(aq) + SO₄²⁻(aq) → BaSO₄(s)' },
    'CO3²-': { id: 'baco3',   color: '#f5f5f5', label: 'white',        formula: 'BaCO₃',   equation: 'Ba²⁺(aq) + CO₃²⁻(aq) → BaCO₃(s)' },
    'SO4²-': { id: 'baso4',   color: '#f8f8f8', label: 'white',        formula: 'BaSO₄',   equation: 'Ba²⁺(aq) + SO₄²⁻(aq) → BaSO₄(s)' },
    'Cl-':   null,
    'NO3-':  null,
    'OH-':   null,   // Ba(OH)₂ is soluble
  },

  'Pb2+': {
    'Cl-':   { id: 'pbcl2',   color: '#f5f5f5', label: 'white',        formula: 'PbCl₂',   equation: 'Pb²⁺(aq) + 2Cl⁻(aq) → PbCl₂(s)' },
    'Br-':   { id: 'pbbr2',   color: '#f0f0f0', label: 'white',        formula: 'PbBr₂',   equation: 'Pb²⁺(aq) + 2Br⁻(aq) → PbBr₂(s)' },
    'I-':    { id: 'pbi2',    color: '#f5d800', label: 'golden yellow', formula: 'PbI₂',    equation: 'Pb²⁺(aq) + 2I⁻(aq) → PbI₂(s)',
               easterEgg: 'golden_rain' },
    'SO4²-': { id: 'pbso4',   color: '#f0f0ee', label: 'white',        formula: 'PbSO₄',   equation: 'Pb²⁺(aq) + SO₄²⁻(aq) → PbSO₄(s)' },
    'CO3²-': { id: 'pbco3',   color: '#f5f5f5', label: 'white',        formula: 'PbCO₃',   equation: 'Pb²⁺(aq) + CO₃²⁻(aq) → PbCO₃(s)' },
    'S²-':   { id: 'pbs',     color: '#0d0d0d', label: 'black',        formula: 'PbS',     equation: 'Pb²⁺(aq) + S²⁻(aq) → PbS(s)' },
    'OH-':   { id: 'pb_oh2',  color: '#f0f0f0', label: 'white',        formula: 'Pb(OH)₂', equation: 'Pb²⁺(aq) + 2OH⁻(aq) → Pb(OH)₂(s)' },
    'NO3-':  null,
  },

  'Ca2+': {
    'CO3²-': { id: 'caco3',   color: '#f8f8f8', label: 'white',        formula: 'CaCO₃',   equation: 'Ca²⁺(aq) + CO₃²⁻(aq) → CaCO₃(s)' },
    'SO4²-': { id: 'caso4',   color: '#f5f5f5', label: 'white',        formula: 'CaSO₄',   equation: 'Ca²⁺(aq) + SO₄²⁻(aq) → CaSO₄(s)',
               note: 'slightly_soluble' },
    'Cl-':   null,
    'NO3-':  null,
    'OH-':   null,   // Ca(OH)₂ slightly soluble but no visible ppt at school concentrations
  },

  'Cu2+': {
    'OH-':   { id: 'cu_oh2',  color: '#5090d0', label: 'blue',         formula: 'Cu(OH)₂', equation: 'Cu²⁺(aq) + 2OH⁻(aq) → Cu(OH)₂(s)' },
    'CO3²-': { id: 'cuco3',   color: '#4d8a5f', label: 'green',        formula: 'CuCO₃',   equation: 'Cu²⁺(aq) + CO₃²⁻(aq) → CuCO₃(s)' },
    'S²-':   { id: 'cus',     color: '#0d0d0d', label: 'black',        formula: 'CuS',     equation: 'Cu²⁺(aq) + S²⁻(aq) → CuS(s)' },
    'Cl-':   null,
    'SO4²-': null,
    'NO3-':  null,
  },

  'Fe2+': {
    'OH-':   { id: 'fe_oh2',  color: '#8aac6a', label: 'dirty green',  formula: 'Fe(OH)₂', equation: 'Fe²⁺(aq) + 2OH⁻(aq) → Fe(OH)₂(s)' },
    'CO3²-': { id: 'feco3',   color: '#6a8a50', label: 'green',        formula: 'FeCO₃',   equation: 'Fe²⁺(aq) + CO₃²⁻(aq) → FeCO₃(s)' },
    'S²-':   { id: 'fes',     color: '#1a1a22', label: 'black',        formula: 'FeS',     equation: 'Fe²⁺(aq) + S²⁻(aq) → FeS(s)' },
    'Cl-':   null,
    'SO4²-': null,
    'NO3-':  null,
  },

  'Fe3+': {
    'OH-':   { id: 'fe_oh3',  color: '#a04000', label: 'reddish brown', formula: 'Fe(OH)₃', equation: 'Fe³⁺(aq) + 3OH⁻(aq) → Fe(OH)₃(s)' },
    'Cl-':   null,
    'NO3-':  null,
    'SO4²-': null,
  },

  'Zn2+': {
    'OH-':   { id: 'zn_oh2',  color: '#f0f0f0', label: 'white',        formula: 'Zn(OH)₂', equation: 'Zn²⁺(aq) + 2OH⁻(aq) → Zn(OH)₂(s)' },
    'CO3²-': { id: 'znco3',   color: '#f0f0f0', label: 'white',        formula: 'ZnCO₃',   equation: 'Zn²⁺(aq) + CO₃²⁻(aq) → ZnCO₃(s)' },
    'S²-':   { id: 'zns',     color: '#f5f5f5', label: 'white',        formula: 'ZnS',     equation: 'Zn²⁺(aq) + S²⁻(aq) → ZnS(s)' },
    'Cl-':   null,
    'SO4²-': null,
    'NO3-':  null,
  },

  'Mg2+': {
    'OH-':   { id: 'mg_oh2',  color: '#f5f5f5', label: 'white',        formula: 'Mg(OH)₂', equation: 'Mg²⁺(aq) + 2OH⁻(aq) → Mg(OH)₂(s)' },
    'CO3²-': { id: 'mgco3',   color: '#f5f5f5', label: 'white',        formula: 'MgCO₃',   equation: 'Mg²⁺(aq) + CO₃²⁻(aq) → MgCO₃(s)',
               note: 'slightly_soluble' },
    'Cl-':   null,
    'SO4²-': null,
    'NO3-':  null,
  },

  'Al3+': {
    'OH-':   { id: 'al_oh3',  color: '#f0f0f5', label: 'white gelatinous', formula: 'Al(OH)₃', equation: 'Al³⁺(aq) + 3OH⁻(aq) → Al(OH)₃(s)' },
    'Cl-':   null,
    'SO4²-': null,
    'NO3-':  null,
  },

  'Mn2+': {
    // Mn²⁺ arises from KMnO₄ reduction
    'OH-':   { id: 'mn_oh2',  color: '#e8d8d8', label: 'pale pink',    formula: 'Mn(OH)₂', equation: 'Mn²⁺(aq) + 2OH⁻(aq) → Mn(OH)₂(s)' },
    'S²-':   { id: 'mns',     color: '#f0c8c8', label: 'pale pink',    formula: 'MnS',     equation: 'Mn²⁺(aq) + S²⁻(aq) → MnS(s)' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GAS RULES
// Checked during ReactionEngine._checkGasRules(workingSolution).
// All matching rules fire; no early return.
//
// Rule shape:
//   id             — unique identifier
//   requires       — { ions?, anySolid?, anyIon?, isHot? }
//                    ions:     ALL listed ions must be present (AND)
//                    anySolid: at least one of the listed solid ids must be present
//                    anyIon:   at least one of the listed ion symbols must be present (OR)
//                    isHot:    true = only fires when vessel is heated
//   excludesSolids — solid ids that block this rule when present
//   gas            — gas id produced ('H2', 'CO2', 'NH3', 'H2S', 'O2', 'HCl', 'SO2')
//   pressure       — initial pressure added to Solution.gases (0–1 scale)
//   observationKey — key into OBSERVATIONS map
//   equation       — balanced net ionic / overall equation string (for Reactions tab)
// ─────────────────────────────────────────────────────────────────────────────

export const GAS_RULES = [
  {
    id: 'h2_metal_acid',
    requires: {
      ions: ['H+'],
      anySolid: ['mg_s', 'zn_s', 'fe_s', 'al_s'],   // active metals only — NOT cu_s
    },
    gas: 'H2',
    pressure: 0.85,
    observationKey: 'obs_h2_metal_acid',
    // Equation depends on which metal is present; engine fills in details via SOLID_ION_PRODUCTS
    equation: 'M(s) + nH⁺(aq) → Mⁿ⁺(aq) + n/2 H₂(g)',
  },
  {
    id: 'co2_aqueous_carbonate_acid',
    requires: {
      ions: ['H+', 'CO3²-'],
    },
    gas: 'CO2',
    pressure: 0.70,
    observationKey: 'obs_co2_effervescence',
    equation: '2H⁺(aq) + CO₃²⁻(aq) → H₂O(l) + CO₂(g)',
  },
  {
    id: 'co2_solid_carbonate_acid',
    requires: {
      ions: ['H+'],
      anySolid: ['na2co3_s', 'mgco3_s', 'caco3_s', 'znco3_s', 'cuco3_s'],
    },
    gas: 'CO2',
    pressure: 0.70,
    observationKey: 'obs_co2_solid_carbonate',
    // Specific equation filled in by engine using SOLID_ION_PRODUCTS
    equation: 'MCO₃(s) + 2H⁺(aq) → M²⁺(aq) + H₂O(l) + CO₂(g)',
  },
  {
    id: 'co2_thermal_carbonate',
    requires: {
      isHot: true,
      anySolid: ['mgco3_s', 'caco3_s', 'znco3_s', 'cuco3_s'],
      // Na₂CO₃ does NOT thermally decompose at Bunsen temperatures — excluded
    },
    gas: 'CO2',
    pressure: 0.45,
    observationKey: 'obs_co2_thermal',
    equation: 'MCO₃(s) → MO(s) + CO₂(g)',
  },
  {
    id: 'nh3_ammonium_alkali',
    requires: {
      ions: ['NH4+', 'OH-'],
      isHot: true,
    },
    gas: 'NH3',
    pressure: 0.50,
    observationKey: 'obs_nh3_pungent',
    equation: 'NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)',
  },
  {
    id: 'nh3_thermal_ammonium',
    requires: {
      ions: ['NH4+'],
      isHot: true,
    },
    gas: 'NH3',
    pressure: 0.40,
    observationKey: 'obs_nh3_thermal',
    equation: 'NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)',
  },
  {
    id: 'nh3_nitrate_al_alkali',
    // Aluminium reduces nitrate in alkaline solution on heating — classic nitrate test route.
    // NOT the dedicated nitrate test; the route simply produces NH₃ as confirmable gas.
    requires: {
      ions: ['NO3-', 'OH-'],
      anySolid: ['al_s'],
      isHot: true,
    },
    gas: 'NH3',
    pressure: 0.45,
    overrideEquation: true,   // use rule.equation, not SOLID_ION_PRODUCTS equation
    observationKey: 'obs_nh3_nitrate_al',
    equation: '8Al(s) + 5NO₃⁻(aq) + 5OH⁻(aq) + 18H₂O(l) → 8[Al(OH)₄]⁻(aq) + 5NH₃(g)',
  },
  {
    id: 'h2s_sulfide_acid',
    requires: {
      ions: ['H+', 'S²-'],
    },
    gas: 'H2S',
    pressure: 0.60,
    observationKey: 'obs_h2s_rotten_eggs',
    equation: '2H⁺(aq) + S²⁻(aq) → H₂S(g)',
  },
  {
    id: 'o2_h2o2_kmno4',
    requires: {
      ions: ['H2O2', 'MnO4-'],
    },
    gas: 'O2',
    pressure: 0.65,
    observationKey: 'obs_o2_rapid',
    equation: '2H₂O₂(aq) → 2H₂O(l) + O₂(g)',
  },
  {
    id: 'o2_h2o2_fe3',
    requires: {
      ions: ['H2O2', 'Fe3+'],
    },
    gas: 'O2',
    pressure: 0.50,
    observationKey: 'obs_o2_moderate',
    equation: '2H₂O₂(aq) → 2H₂O(l) + O₂(g)',
  },
  {
    id: 'hcl_dissolved_gas',
    requires: {
      // Triggered when conc. HCl (with dissolvedGas:'HCl') is mixed into a vessel
      // Engine checks addedReagent.dissolvedGas === 'HCl'
      dissolvedGas: 'HCl',
    },
    gas: 'HCl',
    pressure: 0.40,
    observationKey: 'obs_hcl_fumes',
    equation: 'HCl(dissolved) → HCl(g)',
  },
  {
    id: 'nh3_dissolved_gas',
    requires: {
      dissolvedGas: 'NH3',
    },
    gas: 'NH3',
    pressure: 0.30,
    observationKey: 'obs_nh3_fumes',
    equation: 'NH₃(dissolved) → NH₃(g)',
  },
  {
    id: 'so2_cu_conc_h2so4',
    requires: {
      ions: ['H+', 'SO4²-'],
      anySolid: ['cu_s'],
      isHot: true,
    },
    gas: 'SO2',
    pressure: 0.55,
    observationKey: 'obs_so2_choking',
    equation: 'Cu(s) + 2H₂SO₄(conc) → CuSO₄(aq) + SO₂(g) + 2H₂O(l)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DISSOLUTION RULES
// For solid neutralisation reactions that produce NO gas.
// Solid oxide / hydroxide + excess acid → salt ions + water.
//
// Rule shape:
//   id             — unique identifier
//   requires       — { ions, anySolid }
//   observationMap — { solidId: observationKey } (observationKey per solid)
//   colorChangeMap — { solidId: { to } } (optional colour change for specific solids)
//   equation       — template; engine fills solid and ion names from SOLID_ION_PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

export const DISSOLUTION_RULES = [
  {
    id: 'oxide_acid_neutralisation',
    requires: {
      ions: ['H+'],
      anySolid: ['cao_s', 'mgo_s', 'cuo_s', 'fe2o3_s', 'zno_s'],
    },
    colorChangeMap: {
      // Only these two produce visibly coloured solutions
      cuo_s:   { to: 'rgba(30,100,220,0.45)' },
      fe2o3_s: { to: 'rgba(200,100,20,0.50)' },
    },
    observationMap: {
      cao_s:   'obs_oxide_dissolves_colourless',
      mgo_s:   'obs_oxide_dissolves_colourless',
      cuo_s:   'obs_cuo_dissolves_blue',
      fe2o3_s: 'obs_fe2o3_dissolves_brown',
      zno_s:   'obs_oxide_dissolves_colourless',
    },
    equation: 'MO(s) + 2H⁺(aq) → M²⁺(aq) + H₂O(l)',
  },
  {
    id: 'cao_water_slaking',
    requires: {
      // CaO + H₂O → Ca(OH)₂ — tracked via a pseudo-ion 'H2O' or simply by mixing with a water-based solution
      // Engine fires this rule when cao_s is in a solution that has no H+ but does have water (always true)
      anySolid: ['cao_s'],
      ions: [],   // empty = fires in any aqueous medium
    },
    colorChangeMap: {},
    observationMap: {
      cao_s: 'obs_cao_slaking',
    },
    equation: 'CaO(s) + H₂O(l) → Ca(OH)₂(aq)',
    // Engine adds Ca2+ and OH- to solution
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SOLUBLE SOLIDS
// Solids in this map dissolve spontaneously in water (no acid required).
// Engine checks this when a solid is added to a vessel with no H+ present.
// ─────────────────────────────────────────────────────────────────────────────

export const SOLUBLE_SOLIDS = {
  na2co3_s: {
    ions: { 'Na+': 0.2, 'CO3²-': 0.1 },
    observationKey: 'obs_solid_dissolves_colourless',
    equation: 'Na₂CO₃(s) → 2Na⁺(aq) + CO₃²⁻(aq)',
  },
  nacl_s: {
    ions: { 'Na+': 0.2, 'Cl-': 0.2 },
    observationKey: 'obs_solid_dissolves_colourless',
    equation: 'NaCl(s) → Na⁺(aq) + Cl⁻(aq)',
  },
  kcl_s: {
    ions: { 'K+': 0.2, 'Cl-': 0.2 },
    observationKey: 'obs_solid_dissolves_colourless',
    equation: 'KCl(s) → K⁺(aq) + Cl⁻(aq)',
  },
  k2co3_s: {
    ions: { 'K+': 0.4, 'CO3²-': 0.2 },
    observationKey: 'obs_solid_dissolves_colourless',
    equation: 'K₂CO₃(s) → 2K⁺(aq) + CO₃²⁻(aq)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SOLID ION PRODUCTS
// Lookup used by the engine when a solid reacts with acid (or thermally decomposes).
// Tells the engine which ion(s) to add after the solid is consumed.
//
// stoich — how many moles of the ion per mole of solid consumed
// ─────────────────────────────────────────────────────────────────────────────

export const SOLID_ION_PRODUCTS = {
  // Metals (react with acid → cation + H₂ gas)
  mg_s:     { ion: 'Mg2+',  stoich: 1, equation: 'Mg(s) + 2H⁺(aq) → Mg²⁺(aq) + H₂(g)' },
  zn_s:     { ion: 'Zn2+',  stoich: 1, equation: 'Zn(s) + 2H⁺(aq) → Zn²⁺(aq) + H₂(g)' },
  fe_s:     { ion: 'Fe2+',  stoich: 1, equation: 'Fe(s) + 2H⁺(aq) → Fe²⁺(aq) + H₂(g)' },
  al_s:     { ion: 'Al3+',  stoich: 1, equation: '2Al(s) + 6H⁺(aq) → 2Al³⁺(aq) + 3H₂(g)' },
  // Carbonates (react with acid → cation + CO₂ + H₂O)
  na2co3_s: { ion: 'Na+',   stoich: 2, equation: 'Na₂CO₃(s) + 2H⁺(aq) → 2Na⁺(aq) + H₂O(l) + CO₂(g)' },
  mgco3_s:  { ion: 'Mg2+',  stoich: 1, equation: 'MgCO₃(s) + 2H⁺(aq) → Mg²⁺(aq) + H₂O(l) + CO₂(g)' },
  caco3_s:  { ion: 'Ca2+',  stoich: 1, equation: 'CaCO₃(s) + 2H⁺(aq) → Ca²⁺(aq) + H₂O(l) + CO₂(g)' },
  znco3_s:  { ion: 'Zn2+',  stoich: 1, equation: 'ZnCO₃(s) + 2H⁺(aq) → Zn²⁺(aq) + H₂O(l) + CO₂(g)' },
  cuco3_s:  { ion: 'Cu2+',  stoich: 1, equation: 'CuCO₃(s) + 2H⁺(aq) → Cu²⁺(aq) + H₂O(l) + CO₂(g)' },
  // Oxides (react with acid → cation + H₂O)
  cao_s:    { ion: 'Ca2+',  stoich: 1, equation: 'CaO(s) + 2H⁺(aq) → Ca²⁺(aq) + H₂O(l)' },
  mgo_s:    { ion: 'Mg2+',  stoich: 1, equation: 'MgO(s) + 2H⁺(aq) → Mg²⁺(aq) + H₂O(l)' },
  cuo_s:    { ion: 'Cu2+',  stoich: 1, equation: 'CuO(s) + 2H⁺(aq) → Cu²⁺(aq) + H₂O(l)' },
  fe2o3_s:  { ion: 'Fe3+',  stoich: 2, equation: 'Fe₂O₃(s) + 6H⁺(aq) → 2Fe³⁺(aq) + 3H₂O(l)' },
  zno_s:    { ion: 'Zn2+',  stoich: 1, equation: 'ZnO(s) + 2H⁺(aq) → Zn²⁺(aq) + H₂O(l)' },
  // Cu reacts with conc. H₂SO₄ (hot) → CuSO₄ + SO₂ + H₂O
  cu_s:     { ion: 'Cu2+',  stoich: 1, equation: 'Cu(s) + 2H₂SO₄(conc,hot) → Cu²⁺(aq) + SO₄²⁻(aq) + SO₂(g) + 2H₂O(l)' },
  // Halide salts — dissolve in water; ion field used by flame-test detection only
  nacl_s:   { ion: 'Na+',   stoich: 1, equation: 'NaCl(s) → Na⁺(aq) + Cl⁻(aq)' },
  kcl_s:    { ion: 'K+',    stoich: 1, equation: 'KCl(s) → K⁺(aq) + Cl⁻(aq)' },
  k2co3_s:  { ion: 'K+',    stoich: 2, equation: 'K₂CO₃(s) → 2K⁺(aq) + CO₃²⁻(aq)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// REDOX RULES
// Checked during ReactionEngine._checkRedox(workingSolution).
// All matching rules fire (full sweep, no early return).
//
// Rule shape:
//   id             — unique identifier
//   requires       — { ions: [...must-all-be-present], anyOf: [...at-least-one] }
//   colorChange    — { from, to } (css colour strings); from may be null (computed by engine)
//   ionTransform   — { ionSymbol: newSymbol | null }
//                    null = ion is consumed / removed
//                    string = ion symbol is renamed (e.g. 'Fe2+' → 'Fe3+')
//   observationKey — key into OBSERVATIONS
//   equation       — balanced net ionic equation string
// ─────────────────────────────────────────────────────────────────────────────

export const REDOX_RULES = [
  {
    id: 'kmno4_decolour',
    // KMnO₄ decolourisation — purple solution becomes colourless (Mn²⁺)
    // Fires when acidified permanganate meets any common reducing agent
    requires: {
      ions: ['MnO4-', 'H+'],
      anyOf: ['Fe2+', 'I-', 'Br-', 'H2O2', 'CH3COOH'],
    },
    colorChange: { from: 'rgba(80,0,90,0.80)', to: 'rgba(200,220,255,0.10)' },
    ionTransform: {
      'MnO4-': null,    // permanganate consumed → Mn²⁺ formed
      'Fe2+':  'Fe3+',  // Fe²⁺ oxidised to Fe³⁺ (if present)
    },
    producesIon: { 'Mn2+': 0.02 },
    observationKey: 'obs_purple_decolour',
    equation: 'MnO₄⁻(aq) + 8H⁺(aq) + 5Fe²⁺(aq) → Mn²⁺(aq) + 5Fe³⁺(aq) + 4H₂O(l)',
  },
  {
    id: 'kmno4_neutral_decolour',
    // Permanganate decolourisation without acid (slower; becomes brown MnO₂)
    requires: {
      ions: ['MnO4-'],
      anyOf: ['Fe2+', 'I-', 'Br-', 'H2O2'],
    },
    colorChange: { from: 'rgba(80,0,90,0.80)', to: 'rgba(80,50,20,0.40)' },
    ionTransform: {
      'MnO4-': null,
      'Fe2+':  'Fe3+',
    },
    observationKey: 'obs_purple_to_brown',
    equation: 'MnO₄⁻(aq) + 2H₂O + 3e⁻ → MnO₂(s) + 4OH⁻(aq)',
  },
  {
    id: 'cr2o7_reduction',
    // Dichromate (orange) reduced to Cr³⁺ (green)
    requires: {
      ions: ['Cr2O7²-', 'H+'],
      anyOf: ['Fe2+', 'I-', 'Br-', 'H2O2'],
    },
    colorChange: { from: 'rgba(255,140,0,0.60)', to: 'rgba(0,120,0,0.40)' },
    ionTransform: {
      'Cr2O7²-': null,
      'Fe2+':    'Fe3+',
    },
    producesIon: { 'Cr3+': 0.02 },
    observationKey: 'obs_orange_to_green',
    equation: 'Cr₂O₇²⁻(aq) + 14H⁺(aq) + 6Fe²⁺(aq) → 2Cr³⁺(aq) + 6Fe³⁺(aq) + 7H₂O(l)',
  },
  {
    id: 'fe2_oxidation_kmno4',
    // Standalone Fe²⁺ → Fe³⁺ colour change (pale green → orange/yellow)
    // Triggered as part of kmno4 rules above; this rule fires when there's excess Fe²⁺
    requires: {
      ions: ['Fe2+', 'MnO4-'],
    },
    colorChange: { from: 'rgba(100,180,100,0.35)', to: 'rgba(200,100,20,0.50)' },
    ionTransform: { 'Fe2+': 'Fe3+' },
    observationKey: 'obs_green_to_orange',
    equation: 'Fe²⁺(aq) → Fe³⁺(aq) + e⁻',
  },
  {
    id: 'iodide_oxidation_cr2o7',
    // I⁻ oxidised to I₂ by acidified dichromate — produces brown/yellow solution
    requires: {
      ions: ['Cr2O7²-', 'H+', 'I-'],
    },
    colorChange: { from: null, to: 'rgba(100,60,0,0.50)' },
    ionTransform: {
      'Cr2O7²-': null,
      'I-':       null,
    },
    producesIon: { 'I2': 0.05 },
    observationKey: 'obs_iodine_brown',
    equation: 'Cr₂O₇²⁻(aq) + 14H⁺(aq) + 6I⁻(aq) → 2Cr³⁺(aq) + 3I₂(aq) + 7H₂O(l)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEXATION RULES
// Checked during ReactionEngine._checkComplexation(workingSolution).
// These rules dissolve an existing precipitate when excess ligand is present.
//
// Rule shape:
//   id             — unique identifier
//   requires       — { ppt: pptId, ions: [...], excessNH3?: bool, excessOH?: bool }
//   removesPpt     — ppt id consumed
//   colorChange    — { to } (new solution colour)
//   consumesIon    — ion consumed (e.g. 'NH3' or 'OH-')
//   producesIon    — { symbol: relativeConc } (the complex ion)
//   observationKey — key into OBSERVATIONS
//   equation       — balanced equation for Reactions tab
// ─────────────────────────────────────────────────────────────────────────────

export const COMPLEXATION_RULES = [
  {
    id: 'cu_nh3_complex',
    // Cu(OH)₂ (blue ppt) + excess NH₃ → deep blue tetraamine complex
    requires: {
      ppt: 'cu_oh2',
      ions: ['NH3'],
      excessNH3: true,
    },
    removesPpt: 'cu_oh2',
    colorChange: { to: '#1a4fa0' },
    consumesIon: 'NH3',
    producesIon: { 'Cu(NH3)4_2+': 0.05 },
    observationKey: 'obs_deep_blue_complex',
    equation: 'Cu(OH)₂(s) + 4NH₃(aq) → [Cu(NH₃)₄]²⁺(aq) + 2OH⁻(aq)',
  },
  {
    id: 'zn_oh_excess_naoh',
    // Zn(OH)₂ (white ppt) dissolves in excess NaOH → colourless zincate ion
    requires: {
      ppt: 'zn_oh2',
      ions: ['OH-'],
      excessOH: true,
    },
    removesPpt: 'zn_oh2',
    consumesIon: 'OH-',
    producesIon: { 'Zn(OH)4_2-': 0.05 },
    observationKey: 'obs_zn_ppt_dissolves',
    equation: 'Zn(OH)₂(s) + 2OH⁻(aq) → [Zn(OH)₄]²⁻(aq)',
  },
  {
    id: 'zn_nh3_complex',
    // Zn(OH)₂ (white ppt) dissolves in excess NH₃ → colourless tetraamine zinc
    requires: {
      ppt: 'zn_oh2',
      ions: ['NH3'],
      excessNH3: true,
    },
    removesPpt: 'zn_oh2',
    consumesIon: 'NH3',
    producesIon: { 'Zn(NH3)4_2+': 0.05 },
    observationKey: 'obs_zn_ppt_dissolves',
    equation: 'Zn(OH)₂(s) + 4NH₃(aq) → [Zn(NH₃)₄]²⁺(aq) + 2OH⁻(aq)',
  },
  {
    id: 'al_oh_excess_naoh',
    // Al(OH)₃ (white gelatinous ppt) dissolves in excess NaOH → colourless aluminate
    requires: {
      ppt: 'al_oh3',
      ions: ['OH-'],
      excessOH: true,
    },
    removesPpt: 'al_oh3',
    consumesIon: 'OH-',
    producesIon: { 'Al(OH)4-': 0.05 },
    observationKey: 'obs_al_ppt_dissolves',
    equation: 'Al(OH)₃(s) + OH⁻(aq) → [Al(OH)₄]⁻(aq)',
  },
  {
    id: 'pb_oh_excess_naoh',
    // Pb(OH)₂ dissolves in excess NaOH → colourless plumbate
    requires: {
      ppt: 'pb_oh2',
      ions: ['OH-'],
      excessOH: true,
    },
    removesPpt: 'pb_oh2',
    consumesIon: 'OH-',
    producesIon: { 'Pb(OH)4_2-': 0.05 },
    observationKey: 'obs_pb_ppt_dissolves',
    equation: 'Pb(OH)₂(s) + 2OH⁻(aq) → [Pb(OH)₄]²⁻(aq)',
  },

  // ── Carbonate ppts dissolve in acid (H⁺) → CO₂ effervescence ─────────────
  // BaSO₄ has NO rule here — it is acid-insoluble, confirming SO₄²⁻.

  {
    id: 'baco3_acid',
    requires: { ppt: 'baco3', ions: ['H+'] },
    removesPpt: 'baco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'BaCO₃(s) + 2H⁺(aq) → Ba²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'ag2co3_acid',
    requires: { ppt: 'ag2co3', ions: ['H+'] },
    removesPpt: 'ag2co3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'Ag₂CO₃(s) + 2H⁺(aq) → 2Ag⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'pbco3_acid',
    requires: { ppt: 'pbco3', ions: ['H+'] },
    removesPpt: 'pbco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'PbCO₃(s) + 2H⁺(aq) → Pb²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'caco3_acid',
    requires: { ppt: 'caco3', ions: ['H+'] },
    removesPpt: 'caco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'CaCO₃(s) + 2H⁺(aq) → Ca²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'cuco3_ppt_acid',
    requires: { ppt: 'cuco3', ions: ['H+'] },
    removesPpt: 'cuco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'CuCO₃(s) + 2H⁺(aq) → Cu²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'feco3_acid',
    requires: { ppt: 'feco3', ions: ['H+'] },
    removesPpt: 'feco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'FeCO₃(s) + 2H⁺(aq) → Fe²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'znco3_ppt_acid',
    requires: { ppt: 'znco3', ions: ['H+'] },
    removesPpt: 'znco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'ZnCO₃(s) + 2H⁺(aq) → Zn²⁺(aq) + CO₂(g) + H₂O(l)',
  },
  {
    id: 'mgco3_ppt_acid',
    requires: { ppt: 'mgco3', ions: ['H+'] },
    removesPpt: 'mgco3',
    gasAdded: { id: 'CO2', pressure: 0.40 },
    observationKey: 'obs_carbonate_ppt_acid',
    equation: 'MgCO₃(s) + 2H⁺(aq) → Mg²⁺(aq) + CO₂(g) + H₂O(l)',
  },

  // ── AgCl dissolves in dilute NH₃ → [Ag(NH₃)₂]⁺ ──────────────────────────
  // AgBr / AgI do NOT dissolve in dilute NH₃ — no rule needed (ppt persists).
  {
    id: 'agcl_nh3',
    requires: { ppt: 'agcl', ions: ['NH3'] },
    removesPpt: 'agcl',
    producesIon: { 'Ag(NH3)2+': 0.05, 'Cl-': 0.05 },
    observationKey: 'obs_agcl_nh3',
    equation: 'AgCl(s) + 2NH₃(aq) → [Ag(NH₃)₂]⁺(aq) + Cl⁻(aq)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DISPLACEMENT RULES
// Checked during ReactionEngine._checkDisplacement(workingSolution).
// A more-reactive metal solid reduces a metal cation in solution, depositing
// the less-reactive metal as a solid and releasing the reactive metal as an ion.
//
// Rule shape:
//   id             — unique identifier
//   requires       — { solid: solidId, ion: ionSymbol }
//                    solid: the reactive metal that must be present
//                    ion:   the metal cation being displaced (must be present)
//   ionChanges     — { displaced_ion: null, produced_ion: concentration }
//   solidRemoved   — solid id consumed
//   colorChange    — optional { to } (solution colour after reaction)
//   observationKey — key into OBSERVATIONS
//   equation       — balanced net ionic equation string
// ─────────────────────────────────────────────────────────────────────────────

export const DISPLACEMENT_RULES = [

  // ── Metal displaces Ag⁺ ──────────────────────────────────────────────────

  {
    id: 'al_displaces_ag',
    requires: { solid: 'al_s', ion: 'Ag+' },
    ionChanges: { 'Ag+': null, 'Al3+': 0.1 },
    solidRemoved: 'al_s',
    colorChange: null,
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Al(s) + 3Ag⁺(aq) → Al³⁺(aq) + 3Ag(s)',
  },
  {
    id: 'zn_displaces_ag',
    requires: { solid: 'zn_s', ion: 'Ag+' },
    ionChanges: { 'Ag+': null, 'Zn2+': 0.1 },
    solidRemoved: 'zn_s',
    colorChange: null,
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Zn(s) + 2Ag⁺(aq) → Zn²⁺(aq) + 2Ag(s)',
  },
  {
    id: 'fe_displaces_ag',
    requires: { solid: 'fe_s', ion: 'Ag+' },
    ionChanges: { 'Ag+': null, 'Fe2+': 0.1 },
    solidRemoved: 'fe_s',
    colorChange: null,
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Fe(s) + 2Ag⁺(aq) → Fe²⁺(aq) + 2Ag(s)',
  },
  {
    id: 'mg_displaces_ag',
    requires: { solid: 'mg_s', ion: 'Ag+' },
    ionChanges: { 'Ag+': null, 'Mg2+': 0.1 },
    solidRemoved: 'mg_s',
    colorChange: null,
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Mg(s) + 2Ag⁺(aq) → Mg²⁺(aq) + 2Ag(s)',
  },
  {
    id: 'cu_displaces_ag',
    requires: { solid: 'cu_s', ion: 'Ag+' },
    ionChanges: { 'Ag+': null, 'Cu2+': 0.1 },
    solidRemoved: 'cu_s',
    colorChange: { to: 'rgba(30,100,220,0.45)' },
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Cu(s) + 2Ag⁺(aq) → Cu²⁺(aq) + 2Ag(s)',
  },

  // ── Metal displaces Cu²⁺ ─────────────────────────────────────────────────

  {
    id: 'zn_displaces_cu',
    requires: { solid: 'zn_s', ion: 'Cu2+' },
    ionChanges: { 'Cu2+': null, 'Zn2+': 0.1 },
    solidRemoved: 'zn_s',
    colorChange: { to: 'rgba(200,220,255,0.10)' },
    observationKey: 'obs_displacement_pink_coat',
    equation: 'Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s)',
  },
  {
    id: 'fe_displaces_cu',
    requires: { solid: 'fe_s', ion: 'Cu2+' },
    ionChanges: { 'Cu2+': null, 'Fe2+': 0.1 },
    solidRemoved: 'fe_s',
    colorChange: { to: 'rgba(100,180,100,0.35)' },
    observationKey: 'obs_displacement_pink_coat',
    equation: 'Fe(s) + Cu²⁺(aq) → Fe²⁺(aq) + Cu(s)',
  },
  {
    id: 'mg_displaces_cu',
    requires: { solid: 'mg_s', ion: 'Cu2+' },
    ionChanges: { 'Cu2+': null, 'Mg2+': 0.1 },
    solidRemoved: 'mg_s',
    colorChange: { to: 'rgba(200,220,255,0.10)' },
    observationKey: 'obs_displacement_pink_coat',
    equation: 'Mg(s) + Cu²⁺(aq) → Mg²⁺(aq) + Cu(s)',
  },
  {
    id: 'al_displaces_cu',
    requires: { solid: 'al_s', ion: 'Cu2+' },
    ionChanges: { 'Cu2+': null, 'Al3+': 0.1 },
    solidRemoved: 'al_s',
    colorChange: { to: 'rgba(200,220,255,0.10)' },
    observationKey: 'obs_displacement_pink_coat',
    equation: '2Al(s) + 3Cu²⁺(aq) → 2Al³⁺(aq) + 3Cu(s)',
  },

  // ── Metal displaces Fe²⁺ ─────────────────────────────────────────────────

  {
    id: 'zn_displaces_fe2',
    requires: { solid: 'zn_s', ion: 'Fe2+' },
    ionChanges: { 'Fe2+': null, 'Zn2+': 0.1 },
    solidRemoved: 'zn_s',
    colorChange: { to: 'rgba(200,220,255,0.10)' },
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Zn(s) + Fe²⁺(aq) → Zn²⁺(aq) + Fe(s)',
  },
  {
    id: 'mg_displaces_fe2',
    requires: { solid: 'mg_s', ion: 'Fe2+' },
    ionChanges: { 'Fe2+': null, 'Mg2+': 0.1 },
    solidRemoved: 'mg_s',
    colorChange: { to: 'rgba(200,220,255,0.10)' },
    observationKey: 'obs_displacement_grey_coat',
    equation: 'Mg(s) + Fe²⁺(aq) → Mg²⁺(aq) + Fe(s)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATIONS
// Plain English description strings.
// Rules:
//   • No chemical names or formulae — ever.
//   • Describe what the student SEES or SMELLS.
//   • Written as past tense observations.
// ─────────────────────────────────────────────────────────────────────────────

export const OBSERVATIONS = {

  // ── Gas evolution ──────────────────────────────────
  obs_h2_metal_acid:
    'Colourless gas evolved rapidly with vigorous effervescence.',

  obs_co2_effervescence:
    'Effervescence observed immediately. Colourless gas evolved briskly.',

  obs_co2_solid_carbonate:
    'The solid began to dissolve and effervescence was observed. '
    + 'Colourless gas evolved briskly from the surface of the solid.',

  obs_co2_thermal:
    'On heating, the solid began to decompose and colourless gas was evolved slowly.',

  obs_nh3_pungent:
    'On warming, a pungent, sharp-smelling gas was evolved from the solution.',


  obs_nh3_thermal:
    'On heating, a pungent-smelling gas was evolved from the solution.',

  obs_nh3_nitrate_al:
    'On heating, a pungent-smelling gas was evolved. The solid gradually dissolved as the reaction proceeded.',

  obs_nh3_fumes:
    'A sharp, pungent odour was detected above the vessel.',

  obs_h2s_rotten_eggs:
    'A colourless gas with a strong, unpleasant odour reminiscent of rotten eggs was evolved.',

  obs_o2_rapid:
    'Vigorous effervescence occurred immediately. Colourless gas was evolved rapidly.',

  obs_o2_moderate:
    'Slow effervescence was observed. Colourless gas was evolved steadily.',

  obs_hcl_fumes:
    'Steamy, colourless fumes were visible above the solution.',

  obs_so2_choking:
    'A colourless gas with a sharp, choking odour was produced on heating.',

  // ── Precipitation (silver) ─────────────────────────
  obs_agcl_white:
    'A white precipitate formed immediately and was curdy in texture.',

  obs_agbr_cream:
    'A cream-coloured precipitate formed immediately.',

  obs_agi_yellow:
    'A pale yellow precipitate formed immediately.',

  // ── Precipitation (barium) ─────────────────────────
  obs_baso4_white:
    'A dense white precipitate formed immediately and was insoluble on warming.',

  obs_baco3_white:
    'A white precipitate formed.',

  // ── Precipitation (lead) ──────────────────────────
  obs_pbcl2_white:
    'A white precipitate formed.',

  obs_pbbr2_white:
    'A white precipitate formed.',

  obs_pbi2_golden:
    'A bright golden-yellow precipitate formed.',

  obs_pbso4_white:
    'A white precipitate formed immediately.',

  obs_pbco3_white:
    'A white precipitate formed.',

  obs_pbs_black:
    'A black precipitate appeared immediately.',

  obs_pb_oh2_white:
    'A white precipitate formed.',

  // ── Precipitation (calcium) ────────────────────────
  obs_caco3_white:
    'A white precipitate formed, making the solution turn milky/cloudy.',

  obs_caso4_white:
    'A fine white precipitate formed slowly.',

  // ── Precipitation (copper) ─────────────────────────
  obs_cu_oh2_blue:
    'A pale blue, gelatinous precipitate formed immediately.',

  obs_cuco3_green:
    'A green precipitate formed.',

  obs_cus_black:
    'A black precipitate formed immediately.',

  // ── Precipitation (iron) ──────────────────────────
  obs_fe_oh2_green:
    'A dirty green / greyish-green gelatinous precipitate formed, '
    + 'which slowly turned darker on standing.',

  obs_feco3_green:
    'A pale green precipitate formed.',

  obs_fes_black:
    'A dark grey / black precipitate formed immediately.',

  obs_fe_oh3_brown:
    'A reddish-brown gelatinous precipitate formed immediately.',

  // ── Precipitation (zinc, magnesium, aluminium) ─────
  obs_zn_oh2_white:
    'A white, gelatinous precipitate formed.',

  obs_znco3_white:
    'A white precipitate formed.',

  obs_zns_white:
    'A white precipitate formed.',

  obs_mg_oh2_white:
    'A white precipitate formed.',

  obs_mgco3_white:
    'A white precipitate formed.',

  obs_al_oh3_white:
    'A white, gelatinous precipitate formed.',

  obs_mn_oh2_pink:
    'A very pale pink / white precipitate formed.',

  obs_mns_pink:
    'A pink precipitate formed.',

  // ── Redox ──────────────────────────────────────────
  obs_purple_decolour:
    'The intense purple/violet colour of the solution disappeared entirely, '
    + 'leaving a colourless solution.',

  obs_purple_to_brown:
    'The purple colour lightened and the solution became a pale brown.',

  obs_orange_to_green:
    'The orange solution turned green.',

  obs_green_to_orange:
    'The pale green solution gradually turned orange/yellow.',

  obs_iodine_brown:
    'The solution turned a yellow-brown colour.',

  // ── Complexation ──────────────────────────────────
  obs_deep_blue_complex:
    'The pale blue precipitate dissolved and the solution turned a deep, intense blue.',

  obs_zn_ppt_dissolves:
    'The white precipitate dissolved and the solution became colourless.',

  obs_al_ppt_dissolves:
    'The white gelatinous precipitate dissolved and the solution became colourless.',

  obs_pb_ppt_dissolves:
    'The white precipitate dissolved and the solution became colourless.',

  // ── Dissolution / neutralisation ──────────────────
  obs_oxide_dissolves_colourless:
    'The solid slowly dissolved and the solution remained colourless.',

  obs_cuo_dissolves_blue:
    'The black solid dissolved slowly, and the solution turned a clear blue colour.',

  obs_fe2o3_dissolves_brown:
    'The rust-coloured solid dissolved slowly, and the solution turned a yellow-brown colour.',

  obs_cao_slaking:
    'The solid reacted vigorously with the water, producing considerable heat. '
    + 'A white cloudy suspension formed initially.',

  obs_solid_dissolves_colourless:
    'The solid dissolved to give a colourless solution.',

  // ── Silver / other ppt generic ─────────────────────
  obs_ag2co3_pale_yellow:
    'A pale yellow precipitate formed.',

  obs_ag2s_black:
    'A black precipitate formed.',

  obs_ag2o_brown:
    'A dark brown precipitate formed.',

  // ── Confirmatory acid / ligand steps ───────────────
  obs_carbonate_ppt_acid:
    'The white precipitate dissolved with effervescence on adding dilute acid, '
    + 'confirming the presence of a carbonate precipitate rather than a sulphate.',

  obs_agcl_nh3:
    'The white precipitate dissolved on adding ammonia solution, '
    + 'forming the colourless diamminesilver(I) complex ion. This confirms chloride.',

  // ── No reaction ────────────────────────────────────
  obs_no_visible_reaction:
    'No visible change was observed.',

  // ── Displacement ───────────────────────────────────
  obs_displacement_grey_coat:
    'The surface of the solid became coated with a grey, metallic deposit. '
    + 'The solid gradually dissolved as the reaction proceeded.',

  obs_displacement_pink_coat:
    'A pink, copper-coloured deposit formed on the surface of the solid. '
    + 'The blue colour of the solution faded as the reaction proceeded.',
};
