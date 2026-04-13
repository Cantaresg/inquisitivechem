/**
 * engine/Vessel.js
 * Wraps a Solution with vessel-level metadata: identity, type, name, heat state.
 * Zero DOM access. One class per file.
 * BUG-08: heat/cool are mutually exclusive; isHot is propagated to solution.
 */

import { Solution } from './Solution.js';

/** crypto.randomUUID() with a fallback for HTTP localhost. TRAP-03 */
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class Vessel {
  /**
   * @param {string} sourceName  Initial label — the reagent name or 'Mixture N'
   * @param {'conical_flask'|'beaker'|'test_tube'|'evaporating_dish'} [type='conical_flask']
   */
  constructor(sourceName, type = 'conical_flask') {
    /** Stable unique id used as DOM data-vessel-id and log dedup key. */
    this.id = uuid();

    /** Display label shown on the vessel card. */
    this.name = sourceName;

    /**
     * Vessel shape determines what animations are possible and whether
     * reagent drops are accepted.
     * 'evaporating_dish' vessels reject reagent drops (BUG-14).
     * @type {'conical_flask'|'beaker'|'test_tube'|'evaporating_dish'}
     */
    this.type = type;

    /** The liquid contents of this vessel. */
    this.solution = new Solution();

    /**
     * Mirror of solution.isHot — kept in sync by setHeat().
     * VesselUI reads vessel.isHot to style the heat glow.
     */
    this.isHot = false;
  }

  // ─── Heat / cool toggle ───────────────────────────────────────────────────

  /**
   * Toggle heating on or off.
   * Propagates to solution.isHot (BUG-08).
   * Cooling (on=false) is the inverse; both buttons are mutually exclusive
   * — enforced in VesselUI by calling setHeat(false) when cool is clicked.
   * @param {boolean} on
   */
  setHeat(on) {
    this.isHot          = Boolean(on);
    this.solution.isHot = Boolean(on);
  }

  // ─── Naming ───────────────────────────────────────────────────────────────

  /**
   * Rename this vessel to 'Mixture N' after a combination event.
   * Counter is provided by BenchUI (BUG-13).
   * @param {number} counter
   */
  renameMixture(counter) {
    this.name = `Mixture ${counter}`;
  }
}
