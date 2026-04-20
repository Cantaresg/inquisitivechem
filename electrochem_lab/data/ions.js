/**
 * data/ions.js
 * ION_DB — chemistry data for every ion that participates in electrolysis
 * or electrochemical cell reactions.
 *
 * All standard potentials are REDUCTION potentials (E°red, V vs SHE at 25 °C).
 * The engine uses E°red for Nernst calculations. For anode selection the engine
 * picks the anion with the LOWEST effective E°red (= most easily oxidised).
 *
 * overpotential — kinetic correction added to E°red before discharge selection.
 *   Most ions: 0 V.  O₂ evolution from OH⁻/H₂O: ~+0.50 V (well-established for
 *   carbon and platinum electrodes). This raises the effective E for OH⁻ above
 *   that of I⁻, Br⁻ and dilute Cl⁻, reproducing the empirical discharge series
 *   without hardcoding a special case.
 *
 * electronCount (n) — electrons transferred per formula unit as written in
 *   halfReactionReduction (used in Nernst equation).
 *
 * halfReactionReduction — Unicode string for A-Level display (reduction direction).
 * halfReactionOxidation — Unicode string for A-Level display (oxidation direction,
 *   used for anion / reactive-anode display in the equations tab).
 *
 * role — which electrode this ion is relevant to:
 *   'cathode' : discharged by reduction at the cathode
 *   'anode'   : discharged by oxidation at the anode (inert electrode)
 *   'both'    : H⁺ / OH⁻ can participate at either electrode
 */

// ─── Cation half-cells (cathode, reduction) ───────────────────────────────

const CATION_DATA = {
  'Ag+': {
    symbol:                 'Ag⁺',
    charge:                 +1,
    electronCount:          1,
    standardPotential:      +0.80,   // V vs SHE
    overpotential:          0,
    halfReactionReduction:  'Ag⁺(aq) + e⁻ → Ag(s)',
    halfReactionOxidation:  'Ag(s) → Ag⁺(aq) + e⁻',
    wordEquationReduction:  'silver ions are reduced to silver',
    role:                   'cathode',
    level:                  'A_LEVEL',  // A-Level extension electrode/electrolyte
  },

  'Cu2+': {
    symbol:                 'Cu²⁺',
    charge:                 +2,
    electronCount:          2,
    standardPotential:      +0.34,
    overpotential:          0,
    halfReactionReduction:  'Cu²⁺(aq) + 2e⁻ → Cu(s)',
    halfReactionOxidation:  'Cu(s) → Cu²⁺(aq) + 2e⁻',
    wordEquationReduction:  'copper(II) ions are reduced to copper',
    role:                   'cathode',
    level:                  'O_LEVEL',
  },

  'H+': {
    symbol:                 'H⁺',
    charge:                 +1,
    electronCount:          2,       // 2H⁺ + 2e⁻ → H₂ (n per H₂ molecule)
    standardPotential:      0.00,
    overpotential:          0,
    halfReactionReduction:  '2H⁺(aq) + 2e⁻ → H₂(g)',
    halfReactionOxidation:  'H₂(g) → 2H⁺(aq) + 2e⁻',
    wordEquationReduction:  'hydrogen ions are reduced to hydrogen gas',
    role:                   'cathode',
    level:                  'O_LEVEL',
    // NOTE: H⁺ is always implicitly present via water auto-ionisation or acid.
    // The engine injects it with concentration = 10^(-pH) for Nernst.
    implicit:               true,
  },

  'Fe2+': {
    symbol:                 'Fe²⁺',
    charge:                 +2,
    electronCount:          2,
    standardPotential:      -0.44,
    overpotential:          0,
    halfReactionReduction:  'Fe²⁺(aq) + 2e⁻ → Fe(s)',
    halfReactionOxidation:  'Fe(s) → Fe²⁺(aq) + 2e⁻',
    wordEquationReduction:  'iron(II) ions are reduced to iron',
    role:                   'cathode',
    level:                  'A_LEVEL',
  },

  'Zn2+': {
    symbol:                 'Zn²⁺',
    charge:                 +2,
    electronCount:          2,
    standardPotential:      -0.76,
    overpotential:          0,
    halfReactionReduction:  'Zn²⁺(aq) + 2e⁻ → Zn(s)',
    halfReactionOxidation:  'Zn(s) → Zn²⁺(aq) + 2e⁻',
    wordEquationReduction:  'zinc ions are reduced to zinc',
    role:                   'cathode',
    level:                  'O_LEVEL',
  },

  'Na+': {
    symbol:                 'Na⁺',
    charge:                 +1,
    electronCount:          1,
    standardPotential:      -2.71,
    overpotential:          0,
    halfReactionReduction:  'Na⁺(aq) + e⁻ → Na(s)',
    halfReactionOxidation:  'Na(s) → Na⁺(aq) + e⁻',
    wordEquationReduction:  'sodium ions are NOT discharged in aqueous solution — water is reduced instead',
    role:                   'cathode',
    level:                  'O_LEVEL',
    // Thermodynamically cannot deposit in water; engine will always select H+/H2O first.
  },

  'K+': {
    symbol:                 'K⁺',
    charge:                 +1,
    electronCount:          1,
    standardPotential:      -2.93,
    overpotential:          0,
    halfReactionReduction:  'K⁺(aq) + e⁻ → K(s)',
    halfReactionOxidation:  'K(s) → K⁺(aq) + e⁻',
    wordEquationReduction:  'potassium ions are NOT discharged in aqueous solution — water is reduced instead',
    role:                   'cathode',
    level:                  'O_LEVEL',
  },

  'Ca2+': {
    symbol:                 'Ca²⁺',
    charge:                 +2,
    electronCount:          2,
    standardPotential:      -2.87,
    overpotential:          0,
    halfReactionReduction:  'Ca²⁺(aq) + 2e⁻ → Ca(s)',
    halfReactionOxidation:  'Ca(s) → Ca²⁺(aq) + 2e⁻',
    wordEquationReduction:  'calcium ions are NOT discharged in aqueous solution — water is reduced instead',
    role:                   'cathode',
    level:                  'O_LEVEL',
  },
};

// ─── Anion half-cells (anode, oxidation at inert electrode) ───────────────
// standardPotential and electronCount refer to the REDUCTION direction.
// The engine inverts for Nernst oxidation: selects the anion with the LOWEST
// (E°red + overpotential) as the preferentially discharged species.

const ANION_DATA = {
  'I-': {
    symbol:                 'I⁻',
    charge:                 -1,
    electronCount:          2,       // 2I⁻ → I₂ + 2e⁻ (n per I₂)
    standardPotential:      +0.54,   // I₂ + 2e⁻ → 2I⁻
    overpotential:          0,
    halfReactionReduction:  'I₂(aq) + 2e⁻ → 2I⁻(aq)',
    halfReactionOxidation:  '2I⁻(aq) → I₂(aq) + 2e⁻',
    wordEquationOxidation:  'iodide ions are oxidised to iodine',
    role:                   'anode',
    level:                  'A_LEVEL',
  },

  'Br-': {
    symbol:                 'Br⁻',
    charge:                 -1,
    electronCount:          2,
    standardPotential:      +1.07,   // Br₂ + 2e⁻ → 2Br⁻
    overpotential:          0,
    halfReactionReduction:  'Br₂(aq) + 2e⁻ → 2Br⁻(aq)',
    halfReactionOxidation:  '2Br⁻(aq) → Br₂(aq) + 2e⁻',
    wordEquationOxidation:  'bromide ions are oxidised to bromine',
    role:                   'anode',
    level:                  'A_LEVEL',
  },

  'Cl-': {
    symbol:                 'Cl⁻',
    charge:                 -1,
    electronCount:          2,
    standardPotential:      +1.36,   // Cl₂ + 2e⁻ → 2Cl⁻
    overpotential:          0,
    halfReactionReduction:  'Cl₂(g) + 2e⁻ → 2Cl⁻(aq)',
    halfReactionOxidation:  '2Cl⁻(aq) → Cl₂(g) + 2e⁻',
    wordEquationOxidation:  'chloride ions are oxidised to chlorine gas',
    role:                   'anode',
    level:                  'O_LEVEL',
    // Concentration effect: Nernst lowers effective E at high [Cl⁻], making Cl₂
    // discharge competitive with OH⁻/O₂. This reproduces the O-Level rule
    // (concentrated NaCl → Cl₂, dilute → O₂) without special-casing.
  },

  'OH-': {
    symbol:                 'OH⁻',
    charge:                 -1,
    electronCount:          4,       // 4OH⁻ → O₂ + 2H₂O + 4e⁻ (n per O₂)
    standardPotential:      +0.40,   // O₂ + 2H₂O + 4e⁻ → 4OH⁻
    overpotential:          +0.53,   // O₂ evolution overpotential on C/Pt
    // Effective E at pH 7 ≈ 0.814 + 0.53 = 1.344 V.
    // Cl⁻ at 1 mol dm⁻³ → E_nernst = 1.360 V > 1.344 → OH⁻ wins (O₂). ✓
    // Cl⁻ at 4 mol dm⁻³ → E_nernst = 1.324 V < 1.344 → Cl⁻ wins (Cl₂). ✓
    // Crossover occurs at ~2 mol dm⁻³, matching the O-Level simplified rule.
    halfReactionReduction:  'O₂(g) + 2H₂O(l) + 4e⁻ → 4OH⁻(aq)',
    halfReactionOxidation:  '4OH⁻(aq) → O₂(g) + 2H₂O(l) + 4e⁻',
    wordEquationOxidation:  'hydroxide ions are oxidised to oxygen gas',
    role:                   'anode',
    level:                  'O_LEVEL',
    // OH⁻ is always implicitly present via water auto-ionisation.
    // Engine injects it with concentration = 10^-(14-pH).
    implicit:               true,
  },

  'SO4²-': {
    symbol:                 'SO₄²⁻',
    charge:                 -2,
    electronCount:          2,       // 2SO₄²⁻ → S₂O₈²⁻ + 2e⁻
    standardPotential:      +2.01,   // S₂O₈²⁻ + 2e⁻ → 2SO₄²⁻
    overpotential:          0,
    halfReactionReduction:  'S₂O₈²⁻(aq) + 2e⁻ → 2SO₄²⁻(aq)',
    halfReactionOxidation:  '2SO₄²⁻(aq) → S₂O₈²⁻(aq) + 2e⁻',
    wordEquationOxidation:  'sulfate ions are NOT discharged — water/OH⁻ is oxidised instead',
    role:                   'anode',
    level:                  'O_LEVEL',
  },

  'NO3-': {
    symbol:                 'NO₃⁻',
    charge:                 -1,
    electronCount:          3,       // simplified: NO₃⁻ + 3H⁺ + 2e⁻ → HNO₂ + H₂O
    standardPotential:      +0.94,   // NO₃⁻/HNO₂ in acidic media (approx)
    overpotential:          +1.00,   // very high overpotential — effectively inert in this sim
    halfReactionReduction:  'NO₃⁻(aq) + 3H⁺(aq) + 2e⁻ → HNO₂(aq) + H₂O(l)',
    halfReactionOxidation:  '(NO₃⁻ is not oxidised at the anode)',
    wordEquationOxidation:  'nitrate ions are NOT discharged — water/OH⁻ is oxidised instead',
    role:                   'anode',
    level:                  'O_LEVEL',
  },
};

// ─── Water half-cells (implicit, always available) ────────────────────────
// Used when no other ion is preferentially discharged (e.g. very dilute H₂SO₄
// cathode → H₂ from water; alkaline anode → O₂ from water).

const WATER_DATA = {
  'H2O_cathode': {
    // 2H₂O + 2e⁻ → H₂ + 2OH⁻  (cathode in neutral/alkaline solution)
    symbol:                 'H₂O',
    electronCount:          2,
    standardPotential:      -0.83,   // at pH 7
    overpotential:          0,
    halfReactionReduction:  '2H₂O(l) + 2e⁻ → H₂(g) + 2OH⁻(aq)',
    halfReactionOxidation:  'H₂(g) + 2OH⁻(aq) → 2H₂O(l) + 2e⁻',
    wordEquationReduction:  'water molecules are reduced to hydrogen gas',
    role:                   'cathode',
    level:                  'O_LEVEL',
    implicit:               true,
  },

  'H2O_anode': {
    // 2H₂O → O₂ + 4H⁺ + 4e⁻  (anode in acidic/neutral solution)
    symbol:                 'H₂O',
    electronCount:          4,
    standardPotential:      +1.23,   // O₂/H₂O in acidic media
    overpotential:          +0.53,   // consistent with OH⁻ O₂ evolution overpotential
    halfReactionReduction:  'O₂(g) + 4H⁺(aq) + 4e⁻ → 2H₂O(l)',
    halfReactionOxidation:  '2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻',
    wordEquationOxidation:  'water molecules are oxidised to oxygen gas',
    role:                   'anode',
    level:                  'O_LEVEL',
    implicit:               true,
  },
};

// ─── Unified export ────────────────────────────────────────────────────────

export const ION_DB = {
  ...CATION_DATA,
  ...ANION_DATA,
  ...WATER_DATA,
};

/** All cation ids (cathode-relevant), excluding implicit water */
export const CATION_IDS = Object.keys(CATION_DATA);

/** All anion ids (anode-relevant), excluding implicit water */
export const ANION_IDS = Object.keys(ANION_DATA);

/**
 * Discharge series for O-Level simplified mode.
 * Engine uses these arrays as fallback when not computing Nernst.
 * Earlier index = preferentially discharged.
 */
export const CATHODE_DISCHARGE_ORDER = [
  'Ag+', 'Cu2+', 'H+', 'Fe2+', 'Zn2+', 'Na+', 'Ca2+', 'K+',
];

export const ANODE_DISCHARGE_ORDER = [
  'I-', 'Br-', 'Cl-', 'OH-', 'SO4²-', 'NO3-',
  // Note: Cl⁻ in concentrated solution effectively ranks above OH⁻.
  // The Nernst engine handles this automatically. In O-Level simplified mode
  // the engine checks electrolyte.isConcentrated to swap Cl⁻ above OH⁻.
];
