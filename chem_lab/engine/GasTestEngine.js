/**
 * engine/GasTestEngine.js
 * Static logic for confirmatory test tools.
 * Zero DOM access. Reads vessel.solution state only.
 *
 * BUG-07: positive gas result requires pressure > GAS_PRESSURE_THRESHOLD (never just id presence).
 * BUG-16: negative animId is returned when gas pressure is zero or gas is absent.
 */

import { CONFIRMATORY_TESTS } from '../data/tests.js';
import { GAS_PRESSURE_THRESHOLD } from './Solution.js';
import { SOLID_ION_PRODUCTS } from '../data/reactions.js';

/**
 * CO₂ pressure must exceed this to trigger the "excess CO₂ dissolves CaCO₃" result.
 * Higher than GAS_PRESSURE_THRESHOLD so that gas which has significantly decayed
 * (i.e. production long since ended) gives a simple positive (ppt stays) rather than
 * the excess result (ppt forms then redissolves).
 * At GAS_DECAY_RATE 0.067/s from an initial 0.70: ~5 s window before dropping below this.
 */
const CO2_EXCESS_THRESHOLD = 0.35;

export class GasTestEngine {

  /**
   * Run a confirmatory test against the current vessel state.
   *
   * @param {import('./Vessel.js').Vessel} vessel
   * @param {string} testId  — one of the ids from CONFIRMATORY_TESTS
   * @returns {{
   *   animId:      string,
   *   observation: string,
   *   isPositive:  boolean,
   *   matchedKey:  string|null,   // which ion / gas id triggered the positive result
   *   flameColour: string|null,   // CSS colour string for flame test animation only
   *   phColour:    string|null,   // CSS colour string for indicator tests only
   * }}
   * @throws {Error} if testId is not registered
   */
  static runTest(vessel, testId) {
    const test = CONFIRMATORY_TESTS.find(t => t.id === testId);
    if (!test) throw new Error(`GasTestEngine: unknown test id "${testId}"`);

    const sol = vessel.solution;

    let isPositive  = false;
    let matchedKey  = null;
    let flameColour = null;
    let phColour    = null;
    let animId      = test.negativeAnimId;
    let observation = test.negativeObservation;

    const detects = test.detects;

    // ── Single gas ────────────────────────────────────────────────────────────
    if (detects.gas !== undefined) {
      const gas = sol.gases.find(g => g.id === detects.gas);
      isPositive = gas !== undefined && gas.pressure > GAS_PRESSURE_THRESHOLD;
      if (isPositive) matchedKey = detects.gas;
    }

    // ── Array of gases (any match, OR) ─────────────────────────────────────
    else if (detects.gases !== undefined) {
      for (const gasId of detects.gases) {
        const gas = sol.gases.find(g => g.id === gasId);
        if (gas && gas.pressure > GAS_PRESSURE_THRESHOLD) {
          isPositive = true;
          matchedKey = gasId;
          break;
        }
      }
    }

    // ── Ions (any match, OR) ───────────────────────────────────────────────
    else if (detects.ions !== undefined) {
      // Build the set of detectable ions from dissolved ions + solid cations.
      // Solid cations are included so the flame test fires when the substance
      // is present as an undissolved solid (e.g. CaCO₃ chips, CuO powder).
      const ionPool = new Set(Object.keys(sol.ions).filter(k => (sol.ions[k] ?? 0) > 0));
      if (test.id === 'test_flame') {
        for (const solid of sol.solids) {
          const product = SOLID_ION_PRODUCTS[solid.id];
          if (product) ionPool.add(product.ion);
        }
      }
      for (const ionSym of detects.ions) {
        if (ionPool.has(ionSym)) {
          isPositive = true;
          matchedKey = ionSym;
          break;
        }
      }
    }

    // ── pH / indicator property ────────────────────────────────────────────
    else if (detects.property === 'pH') {
      const ranges = test.pHObservations ?? [];
      const match  = ranges.find(
        r => sol.pH >= r.range[0] && sol.pH < r.range[1],
      );
      // Treat as "positive" when pH is not neutral (7 ± 0.5)
      isPositive = match !== undefined && !(sol.pH >= 6.5 && sol.pH < 7.5);
      if (match) {
        phColour    = match.cssColor;
        observation = match.observation;
      }
      // pH test always plays an animation (even neutral) — use positiveAnimId
      animId = test.positiveAnimId;
      return { animId, observation, isPositive, matchedKey, flameColour, phColour };
    }

    // ── Burning splint negative: extinguish when a non-H₂/non-O₂ gas is present ──
    // H₂  → positive (squeaky pop, handled above).
    // O₂  → burning splint burns more vigorously — keep anim_splint_burns.
    // Any other gas → flame is extinguished immediately.
    if (!isPositive && test.id === 'test_burning_splint') {
      const hasExtinguishGas = sol.gases.some(
        g => g.id !== 'H2' && g.id !== 'O2' && g.pressure > GAS_PRESSURE_THRESHOLD,
      );
      if (hasExtinguishGas) {
        animId      = 'anim_splint_extinguish';
        observation = 'The burning splint was extinguished when brought near the mouth of the vessel.';
      }
    }

    // ── Resolve final animId and observation ─────────────────────────────────
    if (isPositive) {
      animId = test.positiveAnimId;
      observation = test.positiveObservation;

      // Per-key overrides (AgNO₃ test: different colour per halide; litmus: per gas)
      if (matchedKey && test.detailAnimIds?.[matchedKey]) {
        animId = test.detailAnimIds[matchedKey];
      }
      if (matchedKey && test.detailObservations?.[matchedKey]) {
        observation = test.detailObservations[matchedKey];
      }

      // Flame test: resolve the specific flame colour for AnimationManager (BUG-15)
      if (test.id === 'test_flame' && matchedKey && test.flameColours?.[matchedKey]) {
        flameColour = test.flameColours[matchedKey].cssColor;
        observation = test.flameColours[matchedKey].observationText;
      }
    }

    // ── Limewater: excess CO₂ — override AFTER the main resolve so it isn't clobbered ──
    // Only fires when CO₂ pressure is still genuinely high (CO2_EXCESS_THRESHOLD),
    // not merely detectable. If production ended a while ago and pressure has
    // decayed, the CaCO₃ precipitate stays (simple positive result).
    if (isPositive && test.id === 'test_limewater') {
      const co2 = sol.gases.find(g => g.id === 'CO2');
      if (co2 && co2.pressure > CO2_EXCESS_THRESHOLD) {
        animId      = 'anim_limewater_excess';
        observation = test.excessObservation ?? observation;
      }
    }

    // ── Limewater: expose remaining CO₂ pressure so AnimationManager can
    // scale the pre-ppt bubbling phase proportionally.
    const co2Pressure = (isPositive && test.id === 'test_limewater')
      ? (sol.gases.find(g => g.id === 'CO2')?.pressure ?? 0)
      : null;

    return { animId, observation, isPositive, matchedKey, flameColour, phColour, co2Pressure };
  }
}
