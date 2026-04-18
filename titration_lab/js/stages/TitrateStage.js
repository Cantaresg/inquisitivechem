/**
 * TitrateStage — owns the drop loop, swirl action, and run recording.
 *
 * Drop rates (§8.3):
 *   'drop' → 0.05 mL every 800 ms   (single drop — default near endpoint)
 *   'slow' → 0.10 mL every 300 ms   (slow stream — after rough run)
 *   'fast' → 0.40 mL every  80 ms   (fast stream — well before endpoint)
 *
 * Concordance rule (validate):
 *   At least 2 accurate (non-rough) runs with titres within 0.10 mL of
 *   each other.  This is the standard O-Level / A-Level requirement.
 *
 * labState.runs is kept in sync after every recordResult() so ResultsStage
 * can read it without a direct reference to TitrateStage.
 *
 * @typedef {{ runNumber: number, isRough: boolean, initialReading: number, finalReading: number, titre: number }} RunRecord
 */

import { Stage } from './Stage.js';

/** Drop sizes in mL per tick */
const DROP_SIZES = Object.freeze({ drop: 0.05, slow: 0.10, fast: 0.40 });
/** Interval periods in milliseconds */
const DROP_MS    = Object.freeze({ drop: 800,  slow: 300,  fast: 80  });

export class TitrateStage extends Stage {
  /** @type {ReturnType<typeof setInterval>|null} */
  #dropLoop = null;

  /** @type {RunRecord[]} */
  #runs = [];

  /** @type {number} Current run number (1-based; 0 = not started) */
  #runNumber = 0;

  /** @type {boolean} Tap has been closed or endpoint was auto-detected */
  #canRecord = false;

  constructor(deps) {
    super('titrate', 'Titration', deps);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    // Initialise run 1 on first entry; resume silently on re-entry
    if (this.#runNumber === 0) this._startNewRun();
  }

  exit() {
    this.stopDropping();
    this._cleanupBus();
  }

  // ── Drop loop ─────────────────────────────────────────────────────────────

  /**
   * Start (or switch) the drop rate.
   * @param {'drop'|'slow'|'fast'} rate
   */
  startDropping(rate) {
    if (!(rate in DROP_SIZES)) throw new RangeError(`Unknown drop rate: "${rate}"`);
    if (this.#dropLoop !== null) clearInterval(this.#dropLoop);
    const size = DROP_SIZES[rate];
    const ms   = DROP_MS[rate];
    this.#dropLoop = setInterval(() => this._onTick(size), ms);
    this._burette.openTap();
  }

  /** Close the tap and stop dispensing. Sets canRecord = true. */
  stopDropping() {
    if (this.#dropLoop !== null) {
      clearInterval(this.#dropLoop);
      this.#dropLoop = null;
    }
    this._burette.closeTap();
    this.#canRecord = true;
  }

  /**
   * Swirl the flask.  Propagated to FlaskSimulator for false-endpoint logic.
   * If the flask auto-confirms the endpoint on swirl, dropping is stopped.
   */
  swirl() {
    this._flask.swirl();
    if (this._flask.isAtEndpoint && this.#dropLoop !== null) {
      this.stopDropping();
    }
  }

  // ── Run management ────────────────────────────────────────────────────────

  /**
   * Record this run's result.
   * @param {boolean} [isRough=false]  True for the first rough/preliminary run
   * @returns {RunRecord}
   */
  recordResult(isRough = false) {
    this._burette.recordFinal();
    /** @type {RunRecord} */
    const record = {
      runNumber:      this.#runNumber,
      isRough,
      initialReading: this._burette.initialReading ?? 0,
      finalReading:   this._burette.finalReading   ?? 0,
      titre:          this._burette.titre,
    };
    this.#runs.push(record);
    this._state.runs = [...this.#runs];   // sync to labState for ResultsStage
    this._bus.emit('runRecorded', { run: record, titre: record.titre, isRough });
    return record;
  }

  /**
   * Reset flask and burette for the next run.
   * The burette is refilled with the same titrant so consecutive runs are
   * possible regardless of remaining volume.
   */
  newRun() {
    this.#canRecord = false;
    this._flask.resetRun();
    const { titrant, titrantConc } = this._state;
    this._flask.setTitrant(titrant, titrantConc ?? 0.1);
    // Refill burette (same chemical, resets to full capacity, no funnel/bubble)
    this._burette.fill(titrant, titrantConc ?? 0.1);
    this._burette.removeFunnel();
    // expelBubble is a no-op if hasBubble === false, so always safe to call
    this._burette.expelBubble();
    this._startNewRun();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  /** True if the student may record this run (endpoint reached or tap closed manually). */
  get canRecord()        { return this.#canRecord; }
  get currentRunNumber() { return this.#runNumber; }
  /** Shallow copy of runs array. */
  get runs()             { return [...this.#runs]; }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    const accurate = this.#runs.filter(r => !r.isRough);
    if (accurate.length < 2) {
      return {
        ok:     false,
        reason: `Need at least 2 accurate runs (${accurate.length} recorded).`,
      };
    }
    const titres = accurate.map(r => r.titre);
    const spread = Math.max(...titres) - Math.min(...titres);
    if (spread > 0.10) {
      return {
        ok:     false,
        reason: `Titres not concordant (spread ${spread.toFixed(2)} mL > 0.10 mL). Repeat.`,
      };
    }
    this._markComplete();
    return { ok: true, reason: '' };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Single drop tick: dispense from burette → add to flask → check endpoint.
   * Exposed as a protected method (underscore prefix) so phase3-checks.js can
   * drive the simulation synchronously without the setInterval timer.
   * @param {number} dropSizeMl
   * @protected
   */
  _onTick(dropSizeMl) {
    const result = this._burette.addDrop(dropSizeMl);
    if (!result) {
      this.stopDropping();
      this._toast('Burette empty — refill before continuing.', 'warn');
      return;
    }
    this._flask.addVolume(result.volAdded);
    this._flask.notifyDropWithoutSwirl();

    if (this._flask.isAtEndpoint) {
      this.stopDropping();
      this._toast('Endpoint reached — swirl and record.', 'info');
    }
  }

  /**
   * Increment run counter and snapshot the initial burette reading.
   * @protected
   */
  _startNewRun() {
    this.#runNumber++;
    this.#canRecord = false;
    this._burette.recordInitial();
  }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  /**
   * Render the titration scene.
   * Creates host elements for BuretteRenderer, FlaskRenderer, and the drop
   * animation container.  UIRenderer.mountSubRenderers() detects these by id
   * and instantiates the sub-renderers.
   */
  renderArea(el) {
    el.innerHTML = `
      <div class="titration-scene">
        <div id="burette-renderer-host" style="display:flex;flex-direction:column;align-items:center;"></div>
        <div id="flask-renderer-host"   style="display:flex;flex-direction:column;align-items:center;"></div>
      </div>
      <div id="drop-container" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>`;
  }

  renderControls(el) {
    const isRoughRun   = this.#runNumber <= 1;
    const atEndpoint   = this._flask.isAtEndpoint;
    const canRec       = this.#canRecord;
    const vol          = this._burette.volumeDispensed?.toFixed(2) ?? '—';
    const runLabel     = isRoughRun ? 'Rough' : `Run ${this.#runNumber}`;

    el.innerHTML = '';

    // Drop buttons (hold-to-drop via mousedown/up + touchstart/end)
    const addHoldBtn = (label, rate, cls = '') => {
      const btn = document.createElement('button');
      btn.className = `btn ${cls}`;
      btn.textContent = label;
      const start = () => { if (!atEndpoint) this.startDropping(rate); };
      const stop  = () => this.stopDropping();
      btn.addEventListener('mousedown',  start);
      btn.addEventListener('mouseup',    stop);
      btn.addEventListener('mouseleave', stop);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
      btn.addEventListener('touchend',   stop);
      el.appendChild(btn);
    };

    if (!atEndpoint) {
      addHoldBtn('+ 1 Drop',    'drop', 'primary');
      addHoldBtn('Slow stream', 'slow');
      if (isRoughRun) addHoldBtn('Fast stream', 'fast');

      const swirlBtn = document.createElement('button');
      swirlBtn.className = 'btn';
      swirlBtn.textContent = '🔄 Swirl';
      swirlBtn.addEventListener('click', () => {
        this.swirl();
        this._bus.emit('swirled');
      });
      el.appendChild(swirlBtn);
    }

    // Status readout
    const status = document.createElement('div');
    status.style.cssText = 'margin-left:auto;display:flex;gap:16px;align-items:center;font-size:11px;';
    status.innerHTML = `
      <span style="color:var(--muted);">Added: <span style="color:var(--accent2);">${vol} mL</span></span>
      <span style="color:var(--muted);">Run: <span style="color:var(--accent);">${runLabel}</span></span>
      ${atEndpoint ? '<span style="color:var(--accent3);">✓ Endpoint!</span>' : ''}`;
    el.appendChild(status);

    // Record / new run buttons
    if (atEndpoint || canRec) {
      const recBtn = document.createElement('button');
      recBtn.className = 'btn primary';
      recBtn.textContent = '📏 Record & save';
      recBtn.addEventListener('click', () => {
        this.recordResult(isRoughRun);
        this.renderControls(el);
        this._bus.emit('stageAreaUpdated', { stageId: this.id });
      });
      el.appendChild(recBtn);

      const newBtn = document.createElement('button');
      newBtn.className = 'btn';
      newBtn.textContent = 'New run';
      newBtn.addEventListener('click', () => {
        this.newRun();
        this.renderControls(el);
        // Reset graph for new run
        this._bus.emit('newRunStarted');
      });
      el.appendChild(newBtn);
    }
  }
}
