/**
 * FlaskSimulator — analyte volume, indicator colour, pH tracking, endpoint detection.
 *
 * Responsibilities
 * ────────────────
 * • Stores the analyte and indicator.
 * • Accumulates titrant volume added each run and delegates pH computation
 *   to PHEngine every tick.
 * • Manages false-endpoint logic (§8.6): TitrateStage calls
 *   `notifyDropWithoutSwirl()` each tick; `swirl()` resets the counter and
 *   either confirms or dissipates the false colour change.
 * • Emits bus events so UIRenderer can update the flask colour and graph.
 *
 * Endpoint detection rules
 * ────────────────────────
 * • `pH ≥ indicator.pKin` triggers endpoint detection.
 * • If `dropsWithoutSwirl > 3` the endpoint is provisional (falseEndpointActive).
 *   `isAtEndpoint` is NOT set until `swirl()` confirms it.
 * • `swirl()` with falseEndpointActive:
 *     – pH > pKin + 0.5 → colour persists → true endpoint confirmed.
 *     – pH ≤ pKin + 0.5 → colour fades → false endpoint cleared.
 * • If the student has been swirling (dropsWithoutSwirl ≤ 3) the endpoint
 *   is confirmed immediately without the provisional step.
 * • Overshoot: pH > pKin + 3 after endpoint.
 *
 * No setTimeout is used — timing is the responsibility of TitrateStage and
 * UIRenderer, which lets this class stay synchronous and console-testable.
 *
 * Events emitted on EventBus
 * ──────────────────────────
 *   'phUpdated'       { pH, color, volAdded }
 *   'endpointReached' { pH, vol }
 *   'overshot'        { pH, vol }
 *   'swirled'         { count }
 */

export class FlaskSimulator {
  /** @type {import('../EventBus.js').EventBus} */
  #bus;

  /** @type {import('../engine/PHEngine.js').PHEngine} */
  #phEngine;

  /** @type {number} Initial analyte volume in mL */
  #capacity;

  // ── Analyte ───────────────────────────────────────────────────────────────
  /** @type {object|null} */
  #chemical = null;
  /** @type {number} mol dm⁻³ */
  #concentration = 0;
  /** @type {number} mL */
  #volume = 0;

  // ── Titrant (set via setTitrant before TitrateStage begins) ───────────────
  /** @type {object|null} */
  #titrant = null;
  /** @type {number} mol dm⁻³ */
  #titrantConc = 0;
  /** @type {number} mL of titrant added this run */
  #volAdded = 0;
  /**
   * True when the titrant is an acid (pH moves downward during the run).
   * Determines which side of `indicator.pKin` triggers the endpoint and
   * which colour is shown before/after the indicator transition.
   * @type {boolean}
   */
  #titrantIsAcid = false;

  // ── Indicator ─────────────────────────────────────────────────────────────
  /** @type {object|null} Indicator object from IndicatorDB */
  #indicator = null;

  // ── pH state ──────────────────────────────────────────────────────────────
  /** @type {number} Current pH */
  #pH = 7;
  /** @type {Array<{volAdded: number, pH: number}>} */
  #phHistory = [];

  // ── Endpoint state ────────────────────────────────────────────────────────
  /** @type {boolean} */
  #isAtEndpoint = false;
  /** @type {boolean} */
  #isOvershot = false;
  /** @type {boolean} Provisional colour change not yet confirmed by swirlling */
  #falseEndpointActive = false;
  /** @type {number} Drops added since last swirl */
  #dropsWithoutSwirl = 0;
  /** @type {number} Total swirls this run */
  #swirlCount = 0;

  /**
   * @param {import('../EventBus.js').EventBus}    bus
   * @param {import('../engine/PHEngine.js').PHEngine} phEngine
   * @param {number} [volumeML=25]  Analyte volume in mL (pipette volume)
   */
  constructor(bus, phEngine, volumeML = 25) {
    this.#bus      = bus;
    this.#phEngine = phEngine;
    this.#capacity = volumeML;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /**
   * Fill the flask with analyte, resetting all titration state.
   * @param {object} chemical      Chemical object from ChemicalDB
   * @param {number} concentration mol dm⁻³
   */
  fill(chemical, concentration) {
    this.#chemical      = chemical;
    this.#concentration = concentration;
    this.#volume        = this.#capacity;
    this.#indicator     = null;   // fresh flask has no indicator
    this._resetRunState();
  }

  /**
   * Set the indicator.  Can be called before or after `fill()`.
   * @param {object} indicator  Indicator object from IndicatorDB
   */
  setIndicator(indicator) {
    this.#indicator = indicator;
  }

  /**
   * Inform the flask which chemical is in the burette and at what
   * concentration.  Must be called before the first `addVolume()` each run.
   * Also recomputes the initial pH (before any titrant is added).
   *
   * @param {object} chemical      Chemical object from ChemicalDB
   * @param {number} concentration mol dm⁻³
   */
  setTitrant(chemical, concentration) {
    this.#titrant      = chemical;
    this.#titrantConc  = concentration;
    this.#titrantIsAcid = (chemical.type === 'acid');
    if (this.#chemical && this.#volume > 0) {
      this.#pH = this.#phEngine.compute(
        this.#titrant, this.#chemical,
        0, this.#volume,
        this.#titrantConc, this.#concentration,
      );
    }
  }

  // ── Titration mechanics ───────────────────────────────────────────────────

  /**
   * Add `ml` of titrant to the flask.
   *
   * Recomputes pH via PHEngine, records the point to phHistory, and emits
   * 'phUpdated'.  May also emit 'endpointReached' or 'overshot'.
   *
   * @param {number} ml  Volume of titrant dispensed this tick (mL).
   */
  addVolume(ml) {
    if (!this.#titrant || !this.#chemical) return;

    this.#volAdded += ml;

    const newPH = this.#phEngine.compute(
      this.#titrant, this.#chemical,
      this.#volAdded, this.#volume,
      this.#titrantConc, this.#concentration,
    );
    this.#pH = newPH;
    this.#phHistory.push({ volAdded: this.#volAdded, pH: newPH });

    // preEndpointT: 0 = far from transition, 1 = at/past pKin
    let preEndpointT = 0;
    if (this.#indicator && !this.#isAtEndpoint && !this.#falseEndpointActive) {
      const pKin = this.#indicator.pKin;
      preEndpointT = this.#titrantIsAcid
        ? Math.max(0, Math.min(1, (pKin + 2 - newPH) / 2))
        : Math.max(0, Math.min(1, (newPH - (pKin - 2)) / 2));
    }

    // dropFlash: single-drop localized flash for indicators whose transition is
    // too sharp for preEndpointT to show gradual colour (e.g. phenolphthalein).
    // Fires when a drop causes a steep pH rise into the approach window.
    let dropFlash = false;
    if (this.#indicator?.flashNearEndpoint && !this.#isAtEndpoint && !this.#falseEndpointActive) {
      const hist = this.#phHistory;
      if (hist.length >= 2) {
        const prevPH = hist[hist.length - 2].pH;
        const pKin   = this.#indicator.pKin;
        // How much did pH move toward pKin this tick?
        const dpH = this.#titrantIsAcid ? (prevPH - newPH) : (newPH - prevPH);
        // Only within ±3 pH of pKin and not already past it
        const approaching = this.#titrantIsAcid
          ? (newPH < pKin + 1 && newPH > pKin - 2)
          : (newPH > pKin - 3 && newPH < pKin + 1);
        if (dpH > 0.4 && approaching) dropFlash = true;
      }
    }

    this.#bus.emit('phUpdated', {
      pH:            newPH,
      color:         this.indicatorColor,
      volAdded:      this.#volAdded,
      preEndpointT,
      falseEndpoint: this.#falseEndpointActive,
      dropFlash,
    });

    // ── Endpoint detection ────────────────────────────────────────────────
    if (!this.#isAtEndpoint && !this.#falseEndpointActive && this.#indicator) {
      const pKin    = this.#indicator.pKin;
      // Direction-aware: acid titrant → pH falls → trigger when pH drops to pKin
      //                  base titrant → pH rises → trigger when pH rises to pKin
      const crossed = this.#titrantIsAcid ? (newPH <= pKin) : (newPH >= pKin);
      if (crossed) {
        if (this.#dropsWithoutSwirl > 3) {
          // Student hasn't been swirling → provisional (false endpoint possible)
          this.#falseEndpointActive = true;
        } else {
          // Student has been swirling → confirm immediately
          this.#confirmEndpoint(newPH);
        }
      }
    }

    // ── Overshoot detection ───────────────────────────────────────────────
    if (this.#isAtEndpoint && this.#indicator && !this.#isOvershot) {
      const pKin = this.#indicator.pKin;
      const overshoot = this.#titrantIsAcid
        ? (newPH < pKin - 3)   // acid: too much acid added
        : (newPH > pKin + 3);  // base: too much base added
      if (overshoot) {
        this.#isOvershot = true;
        this.#bus.emit('overshot', { pH: newPH, vol: this.#volAdded });
      }
    }
  }

  /**
   * Called by TitrateStage each tick (§8.6) to track drops added without
   * swirlling.  Kept in FlaskSimulator because the counter is a property of
   * the flask contents (indicator fading is a flask-side phenomenon).
   */
  notifyDropWithoutSwirl() {
    this.#dropsWithoutSwirl++;
  }

  /**
   * Swirl the flask.
   *
   * • Resets the dropsWithoutSwirl counter.
   * • If a false endpoint is active, decides whether it's a true endpoint
   *   (colour persists → pH is solidly past pKin) or a false one (fades).
   * • Emits 'swirled'.
   */
  swirl() {
    this.#dropsWithoutSwirl = 0;
    this.#swirlCount++;

    if (this.#falseEndpointActive && this.#indicator) {
      const pKin = this.#indicator.pKin;
      // Colour persists if pH is solidly past the transition (in the correct direction)
      const persists = this.#titrantIsAcid
        ? (this.#pH < pKin - 0.5)   // acid titrant: pH well below pKin
        : (this.#pH > pKin + 0.5);  // base titrant: pH well above pKin
      if (persists) {
        // Colour persists on swirling → true endpoint
        this.#confirmEndpoint(this.#pH);
      } else {
        // Colour fades → false endpoint, not there yet
        this.#falseEndpointActive = false;
        this.#bus.emit('falseEndpointDissipated');
      }
    } else if (!this.#isAtEndpoint && this.#indicator) {
      // Pre-endpoint approach tint: revert colour on swirl so the student
      // can see it is not the endpoint yet (colour returns with the next drop).
      const pKin = this.#indicator.pKin;
      const preT = this.#titrantIsAcid
        ? Math.max(0, Math.min(1, (pKin + 2 - this.#pH) / 2))
        : Math.max(0, Math.min(1, (this.#pH - (pKin - 2)) / 2));
      if (preT > 0.01) {
        this.#bus.emit('falseEndpointDissipated');
      }
    }

    this.#bus.emit('swirled', { count: this.#swirlCount });
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  /** Current pH (clamped 0–14 by PHEngine) */
  get pH() { return this.#pH; }

  /**
   * CSS colour of the indicator at the current pH.
   *
   * • Returns the acid form below the transition range.
   * • Returns the alkaline form above pKin (or when a false endpoint is
   *   active — the provisional colour change for the UI to show).
   * • A smooth colour lerp is left to FlaskRenderer so this class stays
   *   DOM-free.
   */
  get indicatorColor() {
    if (!this.#indicator) return 'rgba(180,220,255,0.12)';
    const { pKin, acidCol, alkCol } = this.#indicator;
    if (this.#titrantIsAcid) {
      // pH starts high (alkCol) and falls to acidCol at the endpoint
      if (this.#falseEndpointActive) return acidCol;  // provisional colour change
      return this.#pH <= pKin ? acidCol : alkCol;
    }
    // pH starts low (acidCol) and rises to alkCol at the endpoint
    if (this.#falseEndpointActive) return alkCol;  // provisional colour change
    return this.#pH >= pKin ? alkCol : acidCol;
  }

  get isAtEndpoint()        { return this.#isAtEndpoint; }
  get isOvershot()          { return this.#isOvershot; }
  get falseEndpointActive() { return this.#falseEndpointActive; }
  get hasIndicator()        { return this.#indicator !== null; }

  /** Total analyte volume in the flask (mL) — does not change during titration */
  get volume()        { return this.#volume; }

  /** Snapshot of {volAdded, pH} pairs — returns a shallow copy */
  get phHistory()     { return [...this.#phHistory]; }

  /** mL of titrant added since the run began */
  get totalVolAdded() { return this.#volAdded; }

  get chemical()      { return this.#chemical; }
  get concentration() { return this.#concentration; }

  // ── Reset ─────────────────────────────────────────────────────────────────

  /**
   * Reset for a new run within the same titration (keeps chemical, indicator,
   * titrant, and capacity intact — just clears pH history and endpoint flags).
   *
   * Called by TitrateStage.newRun().
   */
  resetRun() {
    this._resetRunState();
    // Recompute initial pH with fresh run (volAdded = 0)
    if (this.#titrant && this.#chemical) {
      this.#pH = this.#phEngine.compute(
        this.#titrant, this.#chemical,
        0, this.#volume,
        this.#titrantConc, this.#concentration,
      );
    }
  }

  /**
   * Full reset — clears everything including chemical and titrant.
   * Called by TitrationLab.reset().
   */
  reset() {
    this.#chemical       = null;
    this.#concentration  = 0;
    this.#volume         = 0;
    this.#titrant        = null;
    this.#titrantConc    = 0;
    this.#titrantIsAcid  = false;
    this.#indicator      = null;
    this.#pH             = 7;
    this._resetRunState();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _resetRunState() {
    this.#volAdded            = 0;
    this.#phHistory           = [];
    this.#isAtEndpoint        = false;
    this.#isOvershot          = false;
    this.#falseEndpointActive = false;
    this.#dropsWithoutSwirl   = 0;
    this.#swirlCount          = 0;
  }

  /** @private */
  #confirmEndpoint(pH) {
    this.#isAtEndpoint        = true;
    this.#falseEndpointActive = false;
    this.#bus.emit('endpointReached', { pH, vol: this.#volAdded });
  }
}
