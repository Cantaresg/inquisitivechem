/**
 * engine/TestEngine.js
 *
 * Maps a student-chosen test type + target electrode/solution onto a TestResult,
 * by looking up the test field on the relevant PRODUCT_DB record or electrolyte
 * cation data.
 *
 * Public API:
 *   TestEngine.run(testType, target, electrolysisResult, electrolyte)
 *     → TestResult
 *
 * Parameters:
 *   testType   — 'litmus' | 'glowingSplint' | 'burningSplint' | 'smell' | 'flameTest'
 *   target     — 'cathode' | 'anode' | 'solution'
 *                 'cathode'  : apply test to the cathode product (typically a gas or solid deposit)
 *                 'anode'    : apply test to the anode product
 *                 'solution' : apply test to the electrolyte in the beaker (flame test, pH)
 *   electrolysisResult — ElectrolysisResult from ElectrolysisEngine.run()
 *   electrolyte        — ELECTROLYTE_DB record (needed for solution flame test)
 *
 * TestResult:
 *   .testType        — string
 *   .target          — string
 *   .productId       — string | null   (which product was tested)
 *   .productFormula  — string          (display formula)
 *   .observation     — string          (what the student sees)
 *   .animId          — string | null   (animation key for AnimationLayer)
 *   .flameColour     — string | null   (CSS colour — only for flameTest)
 *   .isPositive      — boolean         (was the result a definitive positive?)
 *   .isApplicable    — boolean         (false if test cannot be applied to this target)
 */

import { ION_DB }       from '../data/ions.js';
import { PRODUCT_DB }   from '../data/products.js';

// ─── Flame colour data for common cations ─────────────────────────────────
// Used when testType === 'flameTest' and target === 'solution'.
// Cations not listed → 'no characteristic colour' (isPositive: false).

const CATION_FLAME_COLOURS = {
  'Na+':   { colour: '#ffd700',  observation: 'Persistent golden-yellow flame.' },
  'K+':    { colour: '#c080ff',  observation: 'Lilac/violet flame (best seen through cobalt-blue glass).' },
  'Cu2+':  { colour: '#3ddc84',  observation: 'Green flame.' },
  'Ca2+':  { colour: '#ff6030',  observation: 'Brick-red/orange-red flame.' },
  'Fe2+':  { colour: '#f5a623',  observation: 'Faint orange flame (weak).' },
  'Zn2+':  { colour: null,       observation: 'No characteristic flame colour.' },
  'Ag+':   { colour: null,       observation: 'No characteristic flame colour.' },
};

// ─── Animation IDs for each test scenario ─────────────────────────────────
// Matched by AnimationLayer.js in Phase 4.

const ANIM_IDS = {
  litmus:        'litmus',
  glowingSplint: 'glowingSplint',
  burningSplint: 'burningSplint',
  smell:         null,             // text-only, no animation
  flameTest:     'flameTest',
};

// ─── TestResult class ──────────────────────────────────────────────────────

export class TestResult {
  constructor({
    testType,
    target,
    productId,
    productFormula,
    observation,
    animId,
    flameColour,
    isPositive,
    isApplicable,
  }) {
    this.testType       = testType;
    this.target         = target;
    this.productId      = productId;
    this.productFormula = productFormula;
    this.observation    = observation;
    this.animId         = animId;
    this.flameColour    = flameColour;
    this.isPositive     = isPositive;
    this.isApplicable   = isApplicable;
  }
}

// ─── TestEngine ───────────────────────────────────────────────────────────

export class TestEngine {
  /**
   * @param {'litmus'|'glowingSplint'|'burningSplint'|'smell'|'flameTest'} testType
   * @param {'cathode'|'anode'|'solution'} target
   * @param {import('./ElectrolysisEngine.js').ElectrolysisResult} electrolysisResult
   * @param {object} electrolyte  ELECTROLYTE_DB record
   * @returns {TestResult}
   */
  static run(testType, target, electrolysisResult, electrolyte) {
    if (target === 'solution') {
      return this._testSolution(testType, electrolysisResult, electrolyte);
    }
    return this._testProduct(testType, target, electrolysisResult);
  }

  // ── Gas / deposit tests ──────────────────────────────────────────────────

  static _testProduct(testType, target, result) {
    const product = target === 'cathode'
      ? result.cathodeProduct
      : result.anodeProduct;

    const testValue = product.tests[testType];

    // Solid deposits and aqueous products cannot be tested with gas tests.
    if (product.state !== 'gas' && testType !== 'flameTest' && testType !== 'smell') {
      return new TestResult({
        testType,
        target,
        productId:      product.id,
        productFormula: product.formula,
        observation:    `${product.formula} is a ${product.state} — this test is not applicable at the ${target} in this setup.`,
        animId:         null,
        flameColour:    null,
        isPositive:     false,
        isApplicable:   false,
      });
    }

    if (testValue === null || testValue === undefined) {
      return new TestResult({
        testType,
        target,
        productId:      product.id,
        productFormula: product.formula,
        observation:    `Test not applicable for ${product.formula}.`,
        animId:         null,
        flameColour:    null,
        isPositive:     false,
        isApplicable:   false,
      });
    }

    const observation = this._buildGasObservation(testType, product, testValue);
    const isPositive  = this._isPositiveResult(testType, testValue);

    return new TestResult({
      testType,
      target,
      productId:      product.id,
      productFormula: product.formula,
      observation,
      animId:         ANIM_IDS[testType] ?? null,
      flameColour:    testType === 'flameTest' ? testValue : null,
      isPositive,
      isApplicable:   true,
    });
  }

  /**
   * Build the observation string for a gas/product test.
   */
  static _buildGasObservation(testType, product, testValue) {
    switch (testType) {
      case 'litmus':
        return `Damp litmus paper held at the ${product.electrode}: ${testValue}.`;
      case 'glowingSplint':
        return `Glowing splint held at the ${product.electrode}: ${testValue}.`;
      case 'burningSplint':
        return `Burning splint held at the ${product.electrode}: ${testValue}.`;
      case 'smell':
        return testValue
          ? `Smell at the ${product.electrode}: ${testValue}.`
          : `No characteristic smell at the ${product.electrode}.`;
      default:
        return testValue;
    }
  }

  /**
   * Returns true when the test result is a definitive positive (not 'no change' etc.)
   */
  static _isPositiveResult(testType, testValue) {
    if (!testValue) return false;
    const negatives = ['no change', 'no effect', null];
    return !negatives.includes(testValue);
  }

  // ── Solution tests (flame test + pH) ────────────────────────────────────

  static _testSolution(testType, result, electrolyte) {
    if (testType !== 'flameTest') {
      // Only flame test applies to the solution in this simulation.
      return new TestResult({
        testType,
        target:         'solution',
        productId:      null,
        productFormula: electrolyte.formula,
        observation:    `${testType} is not applicable to the bulk solution. Apply it to a gas at the electrode instead.`,
        animId:         null,
        flameColour:    null,
        isPositive:     false,
        isApplicable:   false,
      });
    }

    // Flame test on the electrolyte solution — tests for characteristic cation colour.
    // If multiple cations are present, the most intense (first listed) takes priority
    // for display, which matches O-Level expectations (dominant cation).
    let flameColour   = null;
    let observation   = 'No characteristic flame colour observed.';
    let isPositive    = false;
    let cationFormula = electrolyte.formula;

    for (const { ionId } of electrolyte.cations) {
      const entry = CATION_FLAME_COLOURS[ionId];
      if (!entry) continue;

      const ionData = ION_DB[ionId];
      cationFormula = ionData?.symbol ?? ionId;

      if (entry.colour) {
        flameColour = entry.colour;
        isPositive  = true;
      }
      observation = entry.observation;
      break;    // Use the first matching cation (dominant colour)
    }

    // Also check if Cu²⁺ entered solution from a reactive copper anode.
    if (!isPositive && result.isReactiveAnode && result.anodeWinnerIonId === 'Cu2+') {
      const entry       = CATION_FLAME_COLOURS['Cu2+'];
      flameColour       = entry.colour;
      observation       = `Green flame — Cu²⁺ ions have entered solution from the dissolving anode.`;
      isPositive        = true;
      cationFormula     = 'Cu²⁺';
    }

    return new TestResult({
      testType:       'flameTest',
      target:         'solution',
      productId:      null,
      productFormula: cationFormula,
      observation,
      animId:         ANIM_IDS.flameTest,
      flameColour,
      isPositive,
      isApplicable:   true,
    });
  }
}
