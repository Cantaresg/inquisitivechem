/**
 * engine/Solution.js
 * Owns all state for the liquid contents of one vessel.
 * Zero DOM access. No imports from data/.
 * BUG-03: pH recalculated on demand via recalculatePH().
 * BUG-04: colour is a computed getter — never stale.
 * BUG-06: gas pressure decays via tickGasPressure(deltaSeconds).
 */

/**
 * Ordered colour priority table used by the derived `color` getter.
 * First matching ion (concentration > 0) wins.
 * Deliberately module-scoped constant — not exported.
 */
const ION_COLOUR_MAP = [
  { ion: 'IndigoCarmine',  css: 'rgba(18, 45, 195, 0.78)' },     // indigo carmine — deep blue
  { ion: 'MnO4-',          css: 'rgba(80,0,90,0.80)' },        // permanganate — deep purple
  { ion: 'CrO4\u00b2-',   css: 'rgba(210,190,0,0.65)' },      // chromate — yellow
  { ion: 'Cr2O7\u00b2-',  css: 'rgba(255,140,0,0.60)' },      // dichromate — orange
  { ion: 'CrO5',           css: 'rgba(15,30,210,0.82)' },      // peroxochromate — vivid deep blue
  { ion: 'Cu(NH3)4_2+',   css: '#1a4fa0' },                   // tetraamine copper — deep blue
  { ion: 'Cu2+', alsoRequires: 'Cl-', css: 'rgba(0,160,80,0.55)' }, // CuCl₂ — green
  { ion: 'Cu2+',           css: 'rgba(30,100,220,0.45)' },     // copper(II) — blue
  { ion: 'Fe3+',           css: 'rgba(200,100,20,0.50)' },     // iron(III) — yellow/orange
  { ion: 'Cr3+',           css: 'rgba(0,120,0,0.40)' },        // chromium(III) — green
  { ion: 'Br2',            css: 'rgba(190,70,10,0.55)' },      // bromine water — orange-brown
  { ion: 'Cl2',            css: 'rgba(160,210,30,0.40)' },     // chlorine water — yellow-green
  { ion: 'I2',             css: 'rgba(100,60,0,0.50)' },       // iodine — brown
  { ion: 'Fe2+',           css: 'rgba(100,180,100,0.35)' },    // iron(II) — pale green
  { ion: 'Mn2+',           css: 'rgba(200,220,255,0.10)' },    // manganese(II) — essentially colourless
];

/** Pressure lost per second (linear decay). 0.80 → threshold (0.05) in ~12 s. */
const GAS_DECAY_RATE = 0.067;

/**
 * Fraction of Fe²⁺ moles converted to Fe³⁺ per second under aerial oxidation
 * (after the induction delay). 0.077/s → ~99 % converted in ~60 s.
 * Acid (pH < 6) suppresses the rate; heat triples it.
 */
const FE2_OXIDATION_RATE = 0.077;

/** Seconds of induction time before aerial oxidation of Fe²⁺ begins. */
const FE2_INDUCTION_DELAY = 10;

/** Threshold below which a gas is considered absent. See BUG-07. */
export const GAS_PRESSURE_THRESHOLD = 0.05;

export class Solution {
  constructor() {
    /** @type {Object.<string, number>} ion symbol → moles present in this solution */
    this.ions = {};

    /** Total volume of solution in litres (incremented by 0.001 per addition). */
    this.volumeL = 0;

    /**
     * Solid reagent chunks present in the vessel.
     * @type {Array<{ id: string, amount: number }>}
     */
    this.solids = [];

    /**
     * Precipitate descriptors — one entry per distinct ppt present.
     * @type {Array<{ id: string, color: string, formula: string, label: string }>}
     */
    this.ppts = [];

    /**
     * Dissolved / headspace gases.
     * @type {Array<{ id: string, pressure: number }>}  pressure: 0–1
     */
    this.gases = [];

    /**
     * Explicit colour override set by reaction events (redox, complexation, etc.).
     * null means colour is fully derived from ion inventory.
     * @type {string|null}
     */
    this._colorOverride = null;

    /**
     * Countdown (seconds) before aerial Fe²⁺ oxidation begins.
     * null = timer not yet started (Fe²⁺ not yet present).
     * Counts down to 0, at which point tickFe2Oxidation() starts converting.
     * @type {number|null}
     */
    this._fe2InductionTimer = null;

    /** Approximate pH — updated via recalculatePH(). */
    this.pH = 7;

    /** True while the vessel is being heated (propagated from Vessel.setHeat). */
    this.isHot = false;

    /** True after filter() is applied — evaporating dish residue. */
    this.isFiltered = false;
  }

  // ─── Derived colour (BUG-04) ───────────────────────────────────────────────

  /**
   * Computes the current liquid layer colour from first principles every time.
   * Priority: explicit override (set by event) → coloured ion → default.
   * @returns {string} CSS colour string
   */
  get color() {
    if (this._colorOverride !== null) return this._colorOverride;
    for (const entry of ION_COLOUR_MAP) {
      if ((this.ions[entry.ion] ?? 0) <= 0) continue;
      if (entry.alsoRequires && (this.ions[entry.alsoRequires] ?? 0) <= 0) continue;
      return entry.css;
    }
    return 'rgba(180,220,255,0.12)';  // colourless / default water
  }

  /**
   * Allows reaction events to set an explicit colour override.
   * Pass null to revert to derived colour.
   * @param {string|null} value
   */
  set color(value) {
    this._colorOverride = value;
  }

  // ─── Concentration helper ─────────────────────────────────────────────────

  /**
   * Molar concentration of an ion.  Safe when volumeL is zero.
   * @param {string} symbol
   * @returns {number}  mol / L
   */
  concentration(symbol) {
    return (this.ions[symbol] ?? 0) / Math.max(this.volumeL, 1e-6);
  }

  // ─── Ion methods ──────────────────────────────────────────────────────────

  /**
   * Merge a map of ions into this solution (additive).
   * @param {Object.<string, number>} ionMap
   */
  addIons(ionMap) {
    for (const [symbol, conc] of Object.entries(ionMap)) {
      this.ions[symbol] = (this.ions[symbol] ?? 0) + conc;
    }
  }

  /**
   * Remove a single ion entirely.
   * @param {string} symbol
   */
  removeIon(symbol) {
    delete this.ions[symbol];
  }

  /**
   * Set an ion's concentration (use 0 to effectively remove it; will be pruned).
   * @param {string} symbol
   * @param {number} value
   */
  setIon(symbol, value) {
    if (value <= 0) {
      delete this.ions[symbol];
    } else {
      this.ions[symbol] = value;
    }
  }

  // ─── Solid methods ────────────────────────────────────────────────────────

  /**
   * Add a solid chunk to the vessel.
   * @param {string} solidId
   * @param {number} amount  relative amount (1.0 = full portion)
   * @param {string|null} [color]  CSS colour for the solid chip in VesselUI
   */
  addSolid(solidId, amount, color = null, passivated = false) {
    const existing = this.solids.find(s => s.id === solidId);
    if (existing) {
      existing.amount += amount;
      // Once depassivated, always depassivated — oxide layer can't re-form instantly
      existing.passivated = existing.passivated && passivated;
    } else {
      this.solids.push({ id: solidId, amount, color, passivated });
    }
  }

  /**
   * Remove a solid entirely (consumed by reaction).
   * @param {string} solidId
   */
  removeSolid(solidId) {
    this.solids = this.solids.filter(s => s.id !== solidId);
  }

  // ─── Precipitate methods ──────────────────────────────────────────────────

  /**
   * Add a precipitate descriptor if one with the same id is not already present.
   * @param {{ id: string, color: string, formula: string, label: string }} pptDescriptor
   */
  addPpt(pptDescriptor) {
    if (!this.ppts.some(p => p.id === pptDescriptor.id)) {
      this.ppts.push({ ...pptDescriptor });
    }
  }

  /**
   * Remove a precipitate by id.
   * @param {string} pptId
   */
  removePpt(pptId) {
    this.ppts = this.ppts.filter(p => p.id !== pptId);
  }

  // ─── Gas methods ──────────────────────────────────────────────────────────

  /**
   * Add a gas or increase pressure of an existing gas.
   * @param {string} gasId
   * @param {number} pressure  0–1 scale
   */
  addGas(gasId, pressure) {
    const existing = this.gases.find(g => g.id === gasId);
    if (existing) {
      existing.pressure = Math.min(1, existing.pressure + pressure);
    } else {
      this.gases.push({ id: gasId, pressure: Math.min(1, pressure) });
    }
  }

  /**
   * Decay all gas pressures and remove gases that have fallen to/below zero.
   * Called by AnimationManager on each rAF tick.
   * BUG-06: connects gas pressure to animation bubble rate.
   * @param {number} deltaSeconds  elapsed seconds since last tick
   */
  tickGasPressure(deltaSeconds) {
    for (const g of this.gases) {
      g.pressure -= GAS_DECAY_RATE * deltaSeconds;
    }
    this.gases = this.gases.filter(g => g.pressure > 0);
  }

  /**
   * Slowly oxidise Fe²⁺ → Fe³⁺, mimicking aerial oxidation by O₂.
   * A 10 s induction delay runs first (timer starts on the first call where
   * dissolved Fe²⁺ or the Fe(OH)₂ precipitate is present).
   * After the delay:
   *   • Dissolved Fe²⁺ is converted to Fe³⁺; ~99 % done after 60 s at neutral pH.
   *   • Fe(OH)₂ ppt (green) colour-transitions to Fe(OH)₃ (reddish-brown) over
   *     the same window, mirroring the classic bench-top observation.
   * Rate is suppressed in acid and accelerated when hot.
   * Called by BenchUI.tick() on each animation frame.
   * @param {number} deltaSeconds  elapsed seconds since last tick
   * @returns {boolean}  true if the liquid/ppt colour may have changed
   */
  tickFe2Oxidation(deltaSeconds) {
    const fe2     = this.ions['Fe2+'] ?? 0;
    const fe_oh2  = this.ppts.find(p => p.id === 'fe_oh2');
    if (fe2 <= 0 && !fe_oh2) return false;

    // Start the induction countdown the first time Fe²⁺ (or Fe(OH)₂) is present.
    if (this._fe2InductionTimer === null) {
      this._fe2InductionTimer = FE2_INDUCTION_DELAY;
    }

    // Tick down the delay; don't convert yet.
    if (this._fe2InductionTimer > 0) {
      this._fe2InductionTimer = Math.max(0, this._fe2InductionTimer - deltaSeconds);
      return false;
    }

    let rate = FE2_OXIDATION_RATE;
    if (this.pH < 4)      rate *= 0.15;  // strongly acidic — very slow
    else if (this.pH < 6) rate *= 0.45;  // weakly acidic — slower
    if (this.isHot)       rate *= 3;     // heat accelerates oxidation

    let changed = false;

    // ── Dissolved Fe²⁺ → Fe³⁺ ─────────────────────────────────────────────
    if (fe2 > 0) {
      const converted = fe2 * rate * deltaSeconds;
      this.ions['Fe2+'] = fe2 - converted;
      this.ions['Fe3+'] = (this.ions['Fe3+'] ?? 0) + converted;
      if (this.ions['Fe2+'] < 1e-6) delete this.ions['Fe2+'];
      changed = true;
    }

    // ── Fe(OH)₂ ppt (green) → Fe(OH)₃ (reddish-brown) ───────────────────
    // Progress 0→1 at the same rate (linear, capped at 1).
    // Color interpolates #8aac6a (green) → #a04000 (reddish-brown).
    if (fe_oh2) {
      if (fe_oh2._oxProgress === undefined) fe_oh2._oxProgress = 0;
      fe_oh2._oxProgress = Math.min(1, fe_oh2._oxProgress + rate * deltaSeconds);
      const t = fe_oh2._oxProgress;
      const r = Math.round(138 + (160 - 138) * t);
      const g = Math.round(172 + ( 64 - 172) * t);
      const b = Math.round(106 + (  0 - 106) * t);
      fe_oh2.color = `rgb(${r},${g},${b})`;
      if (fe_oh2._oxProgress >= 0.99) {
        fe_oh2.id      = 'fe_oh3';
        fe_oh2.color   = '#a04000';
        fe_oh2.formula = 'Fe(OH)₃';
        fe_oh2.label   = 'reddish brown';
        delete fe_oh2._oxProgress;
      }
      changed = true;
    }

    return changed;
  }

  // ─── pH ───────────────────────────────────────────────────────────────────

  /**
   * Recalculate pH from the current [H⁺] and [OH⁻] ion concentrations.
   * Simple -log10 approximation — appropriate for school level.
   * BUG-03: must be called after every event application.
   */
  recalculatePH() {
    const h  = Math.max(0, this.concentration('H+'));
    const oh = Math.max(0, this.concentration('OH-'));

    if (h > 1e-9) {
      this.pH = -Math.log10(h);
    } else if (oh > 1e-9) {
      this.pH = 14 + Math.log10(oh);
    } else {
      this.pH = 7;
    }
    // Clamp to [0, 14] and round to 1 decimal place
    this.pH = Math.round(Math.max(0, Math.min(14, this.pH)) * 10) / 10;
  }

  // ─── Neutral acid-base cancellation ──────────────────────────────────────

  /**
   * Instantly cancel any co-present H⁺ and OH⁻ (strong acid-base neutralisation).
   * Used internally by ReactionEngine on the working solution to get a clean
   * state before running ion-dependent sweeps.
   */
  _neutraliseAcidBase() {
    const h  = this.ions['H+']  ?? 0;
    const oh = this.ions['OH-'] ?? 0;
    if (h <= 0 || oh <= 0) return;

    const remaining = h - oh;
    if (remaining > 0) {
      this.ions['H+'] = remaining;
      delete this.ions['OH-'];
    } else if (remaining < 0) {
      this.ions['OH-'] = -remaining;
      delete this.ions['H+'];
    } else {
      delete this.ions['H+'];
      delete this.ions['OH-'];
    }
    this.recalculatePH();
  }

  // ─── Clone ────────────────────────────────────────────────────────────────

  /**
   * Deep-copy this Solution.
   * Used by ReactionEngine: the sweep runs on the clone, never the live vessel.
   * BUG-02: prevents mid-sweep state corruption.
   * @returns {Solution}
   */
  clone() {
    const c = new Solution();
    c.ions           = { ...this.ions };
    c.solids         = this.solids.map(s => ({ ...s }));
    c.ppts           = this.ppts.map(p => ({ ...p }));
    c.gases          = this.gases.map(g => ({ ...g }));
    c._colorOverride      = this._colorOverride;
    c._fe2InductionTimer  = this._fe2InductionTimer;
    c.pH                  = this.pH;
    c.isHot               = this.isHot;
    c.isFiltered          = this.isFiltered;
    c.volumeL             = this.volumeL;
    return c;
  }
}
