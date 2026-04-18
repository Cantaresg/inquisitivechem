/**
 * data/tests.js
 * Confirmatory test definitions — all 10 tools shown in the top test bar.
 *
 * Each entry drives:
 *   - The icon and label rendered by TestBarUI
 *   - The detection logic used by GasTestEngine.runTest()
 *   - The animation played by AnimationManager
 *   - The observation text appended to ObservationLog
 *
 * Detection shapes (used by GasTestEngine):
 *   { gas: 'GAS_ID' }                — single gas must be present (pressure > 0.05)
 *   { gases: ['GAS1', 'GAS2', ...] } — ANY of these gases positive (OR)
 *   { ions: ['ION1', 'ION2', ...] }  — ANY of these ions positive (OR)
 *   { property: 'pH' }               — reads Solution.pH; pHObservations array used
 *
 * For tests that produce DIFFERENT observations depending on WHICH ion/gas is detected,
 * a detailObservations map is provided keyed by the matching ion or gas id.
 * The engine picks the first matching key; GasTestEngine falls back to positiveObservation
 * if the specific key is not found.
 *
 * Rules:
 *   • Animation shows a colour or a physical event — no element name, no formula label.
 *   • Negative results ALWAYS play negativeAnimId, even for pH and flame tests.
 *   • Flame test: animation shows only the flame colour; student interprets which cation.
 */

export const CONFIRMATORY_TESTS = [

  // ── Gas tests ─────────────────────────────────────────────────────────────

  {
    id: 'test_burning_splint',
    label: 'Burning splint',
    icon: 'splint-burning.svg',
    detects: { gas: 'H2' },
    positiveAnimId: 'anim_squeaky_pop',
    negativeAnimId: 'anim_splint_burns',
    positiveObservation:
      'A loud squeaky pop was heard when the burning splint was brought near the mouth of the vessel.',
    negativeObservation:
      'The burning splint was held near the mouth of the vessel and remained burning. No sound was produced.',
  },

  {
    id: 'test_glowing_splint',
    label: 'Glowing splint',
    icon: 'splint-glowing.svg',
    detects: { gas: 'O2' },
    positiveAnimId: 'anim_splint_relight',
    negativeAnimId: 'anim_glowing_splint_extinguish',
    positiveObservation:
      'The glowing splint rekindled and burst into flame when brought near the mouth of the vessel.',
    negativeObservation:
      'The glowing splint was held near the mouth of the vessel and did not relight.',
  },

  {
    id: 'test_limewater',
    label: 'Limewater tube',
    icon: 'limewater.svg',
    detects: { gas: 'CO2' },
    positiveAnimId: 'anim_limewater_milky',
    negativeAnimId: 'anim_limewater_clear',
    positiveObservation:
      'A white precipitate formed in the colourless Ca(OH)₂ solution, confirming CO₂ is present.',
    negativeObservation:
      'The limewater remained colourless and clear. No CO₂ detected.',
    excessObservation:
      'A white precipitate initially formed in the Ca(OH)₂ solution, then dissolved again to give a colourless solution on continued bubbling of excess CO₂.',
  },

  {
    id: 'test_damp_red_litmus',
    label: 'Damp red litmus',
    icon: 'litmus-red.svg',
    detects: { gas: 'NH3' },
    positiveAnimId: 'anim_litmus_blue',
    negativeAnimId: 'anim_litmus_nochange_red',
    positiveObservation:
      'The damp red litmus paper turned blue when held in the gas above the vessel.',
    negativeObservation:
      'The damp red litmus paper remained red.',
  },

  {
    id: 'test_damp_blue_litmus',
    label: 'Damp blue litmus',
    icon: 'litmus-blue.svg',
    detects: { gases: ['HCl', 'Cl2', 'SO2', 'H2S', 'NO2', 'CO2'] },
    positiveAnimId: 'anim_litmus_red',
    negativeAnimId: 'anim_litmus_nochange_blue',
    positiveObservation:
      'The damp blue litmus paper turned red when held in the gas above the vessel.',
    negativeObservation:
      'The damp blue litmus paper remained blue.',
    // Specific observations per gas (no gas name shown — engine picks from detailObservations)
    detailObservations: {
      HCl:  'The damp blue litmus paper turned red. Steamy, acidic fumes were present.',
      Cl2:  'The damp blue litmus paper turned red, then was bleached white.',
      SO2:  'The damp blue litmus paper turned red slowly.',
      H2S:  'The damp blue litmus paper turned red. A pungent odour accompanied the change.',
      NO2:  'The damp blue litmus paper turned red.',
      CO2:  'The damp blue litmus paper turned red slowly.',
    },
    detailAnimIds: {
      Cl2: 'anim_litmus_bleached',
    },
  },

  {
    id: 'test_acidified_kmno4',
    label: 'Acidified KMnO₄ tube',
    icon: 'kmno4-tube.svg',
    detects: { gas: 'SO2' },
    positiveAnimId: 'anim_kmno4_tube_decolour',
    negativeAnimId: 'anim_kmno4_tube_negative',
    positiveObservation:
      'The purple/violet acidified potassium manganate(VII) solution was decolourised, '
      + 'turning colourless. This confirms the gas is a reducing agent.',
    negativeObservation:
      'The acidified potassium manganate(VII) solution remained purple. '
      + 'No reducing gas was detected.',
  },

  {
    id: 'test_acidified_k2cr2o7',
    label: 'Acidified K₂Cr₂O₇ tube',
    icon: 'k2cr2o7-tube.svg',
    detects: { gas: 'SO2' },
    positiveAnimId: 'anim_k2cr2o7_tube_green',
    negativeAnimId: 'anim_k2cr2o7_tube_negative',
    positiveObservation:
      'The orange acidified potassium dichromate(VI) solution turned green '
      + 'as the dichromate was reduced to chromium(III) ions.',
    negativeObservation:
      'The acidified potassium dichromate(VI) solution remained orange. '
      + 'No reducing gas was detected.',
  },

  {
    id: 'test_dual_litmus',
    label: 'Both litmus strips',
    icon: 'litmus-both.svg',
    detects: { gases: ['NH3', 'HCl', 'Cl2', 'SO2', 'H2S', 'NO2', 'CO2'] },
    positiveAnimId: 'anim_dual_litmus_nh3',
    negativeAnimId: 'anim_dual_litmus_negative',
    positiveObservation:
      'A litmus paper showed a change when held in the gas above the vessel.',
    negativeObservation:
      'Neither litmus paper changed colour. No acidic or alkaline gas detected.',
    detailObservations: {
      NH3: 'The damp red litmus paper turned blue. The damp blue litmus paper was unchanged.',
      HCl: 'The damp blue litmus paper turned red. The damp red litmus paper was unchanged.',
      Cl2: 'The damp blue litmus paper turned red, then was bleached white. The damp red litmus paper was unchanged.',
      SO2: 'The damp blue litmus paper turned red slowly. The damp red litmus paper was unchanged.',
      H2S: 'The damp blue litmus paper turned red. The damp red litmus paper was unchanged.',
      NO2: 'The damp blue litmus paper turned red. The damp red litmus paper was unchanged.',
      CO2: 'The damp blue litmus paper turned red slowly. The damp red litmus paper was unchanged.',
    },
    detailAnimIds: {
      NH3: 'anim_dual_litmus_nh3',
      HCl: 'anim_dual_litmus_acid',
      Cl2: 'anim_dual_litmus_cl2',
      SO2: 'anim_dual_litmus_acid',
      H2S: 'anim_dual_litmus_acid',
      NO2: 'anim_dual_litmus_acid',
      CO2: 'anim_dual_litmus_acid',
    },
  },

  // ── Flame test ────────────────────────────────────────────────────────────

  {
    id: 'test_flame',
    label: 'Flame test',
    icon: 'flame-wire.svg',
    // Detects metal cation ions in the solution via characteristic flame colour.
    // Animation shows ONLY the colour — no element name, no symbol displayed.
    detects: { ions: ['Na+', 'K+', 'Ca2+', 'Cu2+'] },
    positiveAnimId: 'anim_flame_colour',
    negativeAnimId: 'anim_flame_no_colour',
    positiveObservation:
      'The flame produced a distinct colour when the wire was held in it.',
    negativeObservation:
      'The wire produced no distinctive colour change in the flame.',
    // Per-ion colours used by AnimationManager to render the correct flame colour.
    // The OBSERVATION text does NOT name the ion — it only notes the colour.
    flameColours: {
      'Na+':  { cssColor: '#ffcc00', observationText: 'A persistent golden-yellow flame colour was observed.' },
      'K+':   { cssColor: '#d060ff', observationText: 'A fleeting lilac/pale violet flame colour was briefly visible.' },
      'Ca2+': { cssColor: '#e05020', observationText: 'A brick-red flame colour was observed.' },
      'Cu2+': { cssColor: '#40e0b0', observationText: 'A blue-green flame colour was observed.' },
    },
  },

  // ── Solution / ion tests ──────────────────────────────────────────────────

];
