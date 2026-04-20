/**
 * engine/CurriculumConfig.js
 *
 * Controls what information is surfaced to students at each curriculum level.
 * The chemistry engine always computes Nernst-corrected potentials regardless
 * of level; CurriculumConfig only governs what the UI and observation log show.
 */

export class CurriculumConfig {
  /**
   * @param {object} opts
   * @param {'O_LEVEL'|'A_LEVEL'} opts.level
   * @param {boolean} opts.showElectrodePotentials   Show E° values on component cards
   * @param {boolean} opts.showNernstCorrection       Show corrected E in obs panel
   * @param {boolean} opts.showHalfEquations          Show full ionic half-equations (else word equations)
   * @param {'simplified'|'full'|'hidden'} opts.showDischargeOrder
   * @param {boolean} opts.enableECCellMode           Allow two-beaker galvanic cell mode
   * @param {number}  opts.temperature                Kelvin — passed to Nernst for A-Level T slider
   */
  constructor({
    level,
    showElectrodePotentials,
    showNernstCorrection,
    showHalfEquations,
    showDischargeOrder,
    enableECCellMode,
    temperature,
  }) {
    this.level                    = level;
    this.showElectrodePotentials  = showElectrodePotentials;
    this.showNernstCorrection     = showNernstCorrection;
    this.showHalfEquations        = showHalfEquations;
    this.showDischargeOrder       = showDischargeOrder;
    this.enableECCellMode         = enableECCellMode;
    this.temperature              = temperature;
  }

  get isOLevel() { return this.level === 'O_LEVEL'; }
  get isALevel() { return this.level === 'A_LEVEL'; }

  // ── Factory presets ───────────────────────────────────────────────────

  static O_LEVEL() {
    return new CurriculumConfig({
      level:                   'O_LEVEL',
      showElectrodePotentials: false,
      showNernstCorrection:    false,
      showHalfEquations:       false,
      showDischargeOrder:      'simplified',
      enableECCellMode:        false,
      temperature:             298.15,
    });
  }

  static A_LEVEL() {
    return new CurriculumConfig({
      level:                   'A_LEVEL',
      showElectrodePotentials: true,
      showNernstCorrection:    true,
      showHalfEquations:       true,
      showDischargeOrder:      'full',
      enableECCellMode:        true,
      temperature:             298.15,
    });
  }

  /** Return a copy with a different temperature (A-Level Nernst slider) */
  withTemperature(T) {
    return new CurriculumConfig({ ...this, temperature: T });
  }
}
