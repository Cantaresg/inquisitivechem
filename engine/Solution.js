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
  { ion: 'MnO4-',    css: 'rgba(80,0,90,0.80)' },       // permanganate — deep purple
  { ion: 'Cr2O7²-',  css: 'rgba(255,140,0,0.60)' },      // dichromate — orange
  { ion: 'Cu(NH3)4_2+', css: '#1a4fa0' },                // tetraamine copper — deep blue
  { ion: 'Cu2+',     css: 'rgba(30,100,220,0.45)' },     // copper(II) — blue
  { ion: 'Fe3+',     css: 'rgba(200,100,20,0.50)' },     // iron(III) — yellow/orange
  { ion: 'Cr3+',     css: 'rgba(0,120,0,0.40)' },        // chromium(III) — green
  { ion: 'I2',       css: 'rgba(100,60,0,0.50)' },       // iodine — brown
  { ion: 'Fe2+',     css: 'rgba(100,180,100,0.35)' },    // iron(II) — pale green
  { ion: 'Mn2+',     css: 'rgba(200,220,255,0.10)' },    // manganese(II) — essentially colourless
];

/** Pressure lost per second (linear decay). 0.85 → threshold (0.05) in ~27 s. */
const GAS_DECAY_RATE = 0.03;

/** Threshold below which a gas is considered absent. See BUG-07. */
export const GAS_PRESSURE_THRESHOLD = 0.05;

export class Solution {
  constructor() {
    /** @type {Object.<string, number>} ion symbol → relative concentration */
    this.ions = {};

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
      if ((this.ions[entry.ion] ?? 0) > 0) return entry.css;
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
  addSolid(solidId, amount, color = null) {
    const existing = this.solids.find(s => s.id === solidId);
    if (existing) {
      existing.amount += amount;
    } else {
      this.solids.push({ id: solidId, amount, color });
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

  // ─── pH ───────────────────────────────────────────────────────────────────

  /**
   * Recalculate pH from the current [H⁺] and [OH⁻] ion concentrations.
   * Simple -log10 approximation — appropriate for school level.
   * BUG-03: must be called after every event application.
   */
  recalculatePH() {
    const h  = Math.max(0, this.ions['H+']  ?? 0);
    const oh = Math.max(0, this.ions['OH-'] ?? 0);

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
    c._colorOverride = this._colorOverride;
    c.pH             = this.pH;
    c.isHot          = this.isHot;
    c.isFiltered     = this.isFiltered;
    return c;
  }
}
