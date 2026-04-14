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
      'The limewater turned milky / cloudy white when gas was bubbled through it.',
    negativeObservation:
      'The limewater remained colourless and clear.',
  },

  {
    id: 'test_damp_red_litmus',
    label: 'Damp red litmus',
    icon: 'litmus-red.svg',
    detects: { gas: 'NH3' },
    positiveAnimId: 'anim_litmus_blue',
    negativeAnimId: 'anim_litmus_unchanged',
    positiveObservation:
      'The damp red litmus paper turned blue when held in the gas above the vessel.',
    negativeObservation:
      'The damp red litmus paper remained red.',
  },

  {
    id: 'test_damp_blue_litmus',
    label: 'Damp blue litmus',
    icon: 'litmus-blue.svg',
    detects: { gases: ['HCl', 'Cl2', 'SO2', 'H2S', 'NO2'] },
    positiveAnimId: 'anim_litmus_red',
    negativeAnimId: 'anim_litmus_unchanged',
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

  {
    id: 'test_bacl2',
    label: 'BaCl₂ drops',
    icon: 'bacl2-drops.svg',
    detects: { ions: ['SO4²-'] },
    positiveAnimId: 'anim_ion_ppt_white',
    negativeAnimId: 'anim_drops_no_change',
    positiveObservation:
      'A dense white precipitate formed immediately on adding the drops. '
      + 'The precipitate was insoluble on addition of dilute acid.',
    negativeObservation:
      'No precipitate formed on adding the drops.',
  },

  {
    id: 'test_agno3',
    label: 'AgNO₃ drops',
    icon: 'agno3-drops.svg',
    // Detects halide ions; the precipitate colour differs per halide.
    detects: { ions: ['Cl-', 'Br-', 'I-'] },
    positiveAnimId: 'anim_ion_ppt_white',   // engine overrides to cream/yellow as needed
    negativeAnimId: 'anim_drops_no_change',
    positiveObservation:
      'A precipitate formed immediately on adding the drops.',
    negativeObservation:
      'No precipitate formed on adding the drops.',
    // Per-ion observations (colour only — no name)
    detailObservations: {
      'Cl-': 'A white, curdy precipitate formed immediately.',
      'Br-': 'A cream-coloured precipitate formed immediately.',
      'I-':  'A pale yellow precipitate formed immediately.',
    },
    // Per-ion animation ID overrides (AnimationManager picks colour from here)
    detailAnimIds: {
      'Cl-': 'anim_ion_ppt_white',
      'Br-': 'anim_ion_ppt_cream',
      'I-':  'anim_ion_ppt_yellow',
    },
  },

  // ── pH / indicator tests ──────────────────────────────────────────────────

  {
    id: 'test_universal_ind',
    label: 'Universal indicator',
    icon: 'universal-indicator.svg',
    detects: { property: 'pH' },
    positiveAnimId: 'anim_indicator_colour',
    negativeAnimId: 'anim_indicator_colour',   // always shows a colour
    positiveObservation:
      'The universal indicator changed colour, indicating the approximate pH.',
    negativeObservation:
      'The universal indicator remained green, suggesting a near-neutral solution.',
    // pH ranges — engine picks the first range whose [min, max] includes Solution.pH
    // min inclusive, max exclusive (except the last entry)
    pHObservations: [
      {
        range: [0, 3],
        cssColor: '#cc0000',
        observation: 'The indicator turned red, indicating a strongly acidic solution.',
      },
      {
        range: [3, 5],
        cssColor: '#ff6600',
        observation: 'The indicator turned orange, indicating a weakly acidic solution.',
      },
      {
        range: [5, 6.5],
        cssColor: '#ffcc00',
        observation: 'The indicator turned yellow, indicating a slightly acidic solution.',
      },
      {
        range: [6.5, 7.5],
        cssColor: '#00aa44',
        observation: 'The indicator remained green, indicating a neutral solution.',
      },
      {
        range: [7.5, 9],
        cssColor: '#0066cc',
        observation: 'The indicator turned blue, indicating a mildly alkaline solution.',
      },
      {
        range: [9, 11],
        cssColor: '#0022aa',
        observation: 'The indicator turned dark blue, indicating an alkaline solution.',
      },
      {
        range: [11, 14],
        cssColor: '#660099',
        observation: 'The indicator turned dark purple/violet, indicating a strongly alkaline solution.',
      },
    ],
  },

  {
    id: 'test_litmus',
    label: 'Litmus paper',
    icon: 'litmus-paper.svg',
    detects: { property: 'pH' },
    positiveAnimId: 'anim_litmus_colour',
    negativeAnimId: 'anim_litmus_neutral',
    positiveObservation:
      'The litmus paper changed colour.',
    negativeObservation:
      'The litmus paper remained purple, indicating a neutral solution.',
    pHObservations: [
      {
        range: [0, 6.5],
        cssColor: '#cc2222',
        observation: 'The litmus paper turned red, indicating an acidic solution.',
      },
      {
        range: [6.5, 7.5],
        cssColor: '#884488',
        observation: 'The litmus paper remained purple, indicating a neutral solution.',
      },
      {
        range: [7.5, 14],
        cssColor: '#2244cc',
        observation: 'The litmus paper turned blue, indicating an alkaline solution.',
      },
    ],
  },
];
