/**
 * BuretteSimulator — drop mechanics, level tracking, and burette state.
 *
 * Responsibilities
 * ────────────────
 * • Owns the burette's physical state: level, funnel, air bubble, tap.
 * • Tracks initial and final readings so TitrateStage can compute the titre.
 * • Emits bus events for every level change so UIRenderer stays in sync.
 *
 * The simulator does NOT know about the flask or the pH engine.
 * TitrateStage calls both BuretteSimulator.addDrop() and
 * FlaskSimulator.addVolume() in the same tick.
 *
 * Burette reading convention
 * ──────────────────────────
 * `level`   = mL of titrant REMAINING  (50 when full, 0 when empty)
 * `reading` = mL mark on the scale     (0 at top, 50 at bottom)
 *           = capacity − level
 * Students always read the physical scale (0 → 50), so `initialReading`
 * and `finalReading` are the values they write in their results table.
 *
 * Events emitted on EventBus
 * ──────────────────────────
 *   'dropAdded'    { level, volThisRun }
 *   'levelChanged' { level }
 */

export class BuretteSimulator {
  /** @type {import('../EventBus.js').EventBus} */
  #bus;

  /** @type {number} Total burette capacity in mL */
  #capacity;

  /** @type {number} mL of titrant remaining */
  #level = 0;

  /** @type {object|null} Chemical object from ChemicalDB */
  #chemical = null;

  /** @type {number} mol dm⁻³ */
  #concentration = 0;

  /** @type {boolean} Funnel still attached (forgotten funnel) */
  #hasFunnel = false;

  /** @type {boolean} Air bubble present in tip */
  #hasBubble = false;

  /** @type {boolean} Tap open (used by UI to decide whether to animate flow) */
  #isTapOpen = false;

  /** @type {number|null} Level (mL) at recordInitial() */
  #initial = null;

  /** @type {number|null} Level (mL) at recordFinal() */
  #final = null;

  /**
   * @param {import('../EventBus.js').EventBus} bus
   * @param {number} [volumeML=50]  Burette capacity in mL
   */
  constructor(bus, volumeML = 50) {
    this.#bus = bus;
    this.#capacity = volumeML;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /**
   * Fill the burette with a chemical, resetting all state.
   * Randomly introduces an air bubble (60 % probability, matching the
   * frequency seen in the original lab).
   *
   * @param {object} chemical      Chemical object from ChemicalDB
   * @param {number} concentration mol dm⁻³
   */
  fill(chemical, concentration, volumeML = null) {
    this.#chemical      = chemical;
    this.#concentration = concentration;
    // Allow up to capacity + 5 mL so the tube can be filled above the 0 mark
    this.#level         = volumeML !== null
                          ? Math.min(volumeML, this.#capacity + 5)
                          : this.#capacity;
    this.#hasFunnel     = true;
    this.#hasBubble     = Math.random() < 0.60;
    this.#isTapOpen     = false;
    this.#initial       = null;
    this.#final         = null;
    this.#bus.emit('levelChanged', { level: this.#level });
  }

  /**
   * Remove the funnel from the top of the burette.
   * Students must do this before titrating (forgotten funnel = systematic error).
   */
  /**
   * Add liquid to an already-filled burette (top-up after running off some).
   * Does NOT reset funnel, bubble, or reading snapshots.
   * @param {number} volumeML
   */
  addVolume(volumeML) {
    this.#level = Math.min(this.#level + volumeML, this.#capacity + 5);
    this.#bus.emit('levelChanged', { level: this.#level });
  }

  removeFunnel() {
    this.#hasFunnel = false;
  }

  /**
   * Open the tap and run off enough liquid to expel the air bubble from the tip.
   * Dispenses 3–4 mL to waste.  No-op if no bubble present.
   */
  expelBubble() {
    if (!this.#hasBubble) return;
    const expelled  = 3 + Math.random();          // 3.0 – 4.0 mL
    this.#level     = Math.max(0, this.#level - expelled);
    this.#hasBubble = false;
    this.#bus.emit('levelChanged', { level: this.#level });
  }

  /**
   * Silently expel a small tip bubble (0.05–0.20 mL) during the start of
   * titration.  Called by TitrateStage after recordInitial() so the level
   * drops after the snapshot — the student's recorded reading is unaffected
   * but the actual level is lower, inflating the apparent titre.
   *
   * @returns {number} Volume expelled (0 if no bubble)
   */
  expelTipBubble() {
    if (!this.#hasBubble) return 0;
    const vol       = +(0.05 + Math.random() * 0.15).toFixed(2);
    this.#level     = Math.max(0, this.#level - vol);
    this.#hasBubble = false;
    this.#bus.emit('levelChanged', { level: this.#level });
    return vol;
  }

  /** Open the tap (cosmetic state — actual dispensing is via addDrop). */
  openTap()  { this.#isTapOpen = true;  }

  /** Close the tap. */
  closeTap() { this.#isTapOpen = false; }

  // ── Reading snapshots ─────────────────────────────────────────────────────

  /**
   * Snapshot the current level as the initial reading for this run.
   * Must be called before the first drop of each run.
   */
  recordInitial() {
    this.#initial = this.#level;
  }

  /**
   * Snapshot the current level as the final reading (at endpoint).
   * Must be called after stopDropping() when the run ends.
   */
  recordFinal() {
    this.#final = this.#level;
  }

  // ── Drop mechanics ────────────────────────────────────────────────────────

  /**
   * Dispense one drop (or a defined micro-volume) of titrant.
   *
   * Returns `null` if the burette is empty.
   * Emits `'dropAdded'` and `'levelChanged'` on the bus.
   *
   * @param {number} dropSizeML  Volume to dispense (mL).  Typical values:
   *                              0.05 (single drop) | 0.10 (slow stream) | 0.40 (fast)
   * @returns {{ newLevel: number, volAdded: number }|null}
   */
  addDrop(dropSizeML) {
    if (this.#level < dropSizeML) return null;

    this.#level -= dropSizeML;
    const volThisRun = this.#initial !== null
      ? this.#initial - this.#level
      : dropSizeML;

    this.#bus.emit('dropAdded',    { level: this.#level, volThisRun });
    this.#bus.emit('levelChanged', { level: this.#level });

    return { newLevel: this.#level, volAdded: dropSizeML };
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  /** mL of titrant remaining in the burette */
  get level()         { return this.#level; }

  /** mL dispensed since recordInitial() (0 if not yet called) */
  get volumeAdded()   {
    return this.#initial !== null ? this.#initial - this.#level : 0;
  }

  /**
   * Titre = mL dispensed between recordInitial() and recordFinal().
   * Returns 0 if either snapshot is missing.
   */
  get titre() {
    return (this.#initial !== null && this.#final !== null)
      ? this.#initial - this.#final
      : 0;
  }

  /**
   * Physical scale reading at the start of the run (what a student reads off
   * the burette markings).  Null if recordInitial() has not been called.
   * @type {number|null}
   */
  get initialReading() {
    return this.#initial !== null ? this.#capacity - this.#initial : null;
  }

  /**
   * Physical scale reading at the end of the run.
   * Null if recordFinal() has not been called.
   * @type {number|null}
   */
  get finalReading() {
    return this.#final !== null ? this.#capacity - this.#final : null;
  }

  get hasBubble()     { return this.#hasBubble; }
  get hasFunnel()     { return this.#hasFunnel; }
  get isTapOpen()     { return this.#isTapOpen; }
  get chemical()      { return this.#chemical; }
  get concentration() { return this.#concentration; }
  get capacity()      { return this.#capacity; }

  // ── Reset ─────────────────────────────────────────────────────────────────

  /** Full reset — clears all state including chemical and concentration. */
  reset() {
    this.#level         = 0;
    this.#chemical      = null;
    this.#concentration = 0;
    this.#hasFunnel     = false;
    this.#hasBubble     = false;
    this.#isTapOpen     = false;
    this.#initial       = null;
    this.#final         = null;
  }
}
