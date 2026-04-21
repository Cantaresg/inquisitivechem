/**
 * Stage — abstract base class for all lab stages.
 *
 * Each stage owns a slice of the lab workflow:
 *   enter()            — activate; subscribe to bus events; set up UI
 *   exit()             — deactivate; unsubscribe; always call _cleanupBus()
 *   validate()         — check if stage criteria are met for advancing
 *   renderArea(el)     — render centre-panel content (Phase 4: overridden)
 *   renderControls(el) — render bottom controls bar (Phase 4: overridden)
 *
 * Bus listener memory-leak prevention (§8.4):
 *   Subclasses push unsubscribe functions returned by bus.on() into
 *   this._unsubs[], then call _cleanupBus() at the end of exit().
 */

export class Stage {
  /** @type {string}  */
  #id;
  /** @type {string} */
  #label;
  /** @type {boolean} */
  #isComplete = false;

  /**
   * @param {string} id     Unique stable identifier (e.g. 'setup', 'titrate')
   * @param {string} label  Human-readable nav label
   * @param {Object} deps
   * @param {import('../EventBus.js').EventBus}                           deps.bus
   * @param {Object}                                                       deps.labState
   * @param {import('../simulation/BuretteSimulator.js').BuretteSimulator} deps.burette
   * @param {import('../simulation/FlaskSimulator.js').FlaskSimulator}     deps.flask
   * @param {Object|null}                                                  [deps.renderer]
   */
  constructor(id, label, { bus, labState, burette, flask, renderer = null }) {
    this.#id    = id;
    this.#label = label;

    /** @protected */
    this._bus      = bus;
    /** @protected */
    this._state    = labState;
    /** @protected */
    this._burette  = burette;
    /** @protected */
    this._flask    = flask;
    /** @protected */
    this._renderer = renderer;

    /**
     * Unsubscribe functions from bus.on() — call _cleanupBus() inside exit().
     * @protected
     * @type {Function[]}
     */
    this._unsubs = [];
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  get id()         { return this.#id; }
  get label()      { return this.#label; }
  get isComplete() { return this.#isComplete; }

  /** @protected — call when validate() confirms the stage criteria are fully met. */
  _markComplete() {
    this.#isComplete = true;
  }

  /** @protected — reset completion so the stage must be re-done (e.g. new run from pipette). */
  _resetComplete() {
    this.#isComplete = false;
  }

  // ── Lifecycle (override in subclasses) ────────────────────────────────────

  /** Activate this stage: subscribe to bus events, render UI. */
  enter() {}

  /**
   * Deactivate this stage: unsubscribe from bus, clean up timers.
   * Subclasses must always call _cleanupBus() (or call super.exit()).
   */
  exit() {
    this._cleanupBus();
  }

  /**
   * Check whether the stage criteria are met for advancing to the next stage.
   * @returns {{ ok: boolean, reason: string }}
   */
  validate() {
    return { ok: true, reason: '' };
  }

  /**
   * Render the centre panel for this stage into `el`.
   * No-op in Phase 3. Overridden by subclasses in Phase 4.
   * @param {HTMLElement} _el
   */
  renderArea(_el) {}

  /**
   * Render the bottom controls bar for this stage into `el`.
   * No-op in Phase 3. Overridden by subclasses in Phase 4.
   * @param {HTMLElement} _el
   */
  renderControls(_el) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Emit a toast notification via the renderer (no-op if renderer is null).
   * @param {string} msg
   * @param {'info'|'warn'|'error'} [level='info']
   * @protected
   */
  _toast(msg, level = 'info') {
    this._renderer?.toast?.(msg, level);
  }

  /**
   * Append a line to the observation log (no-op if renderer is null).
   * @param {string} type   e.g. 'obs', 'eq', 'warn'
   * @param {string} text
   * @param {'info'|'warn'|'error'} [level='info']
   * @protected
   */
  _log(type, text, level = 'info') {
    this._renderer?.log?.(type, text, level);
  }

  /**
   * Unsubscribe all bus listeners registered via bus.on() during enter().
   * @protected
   */
  _cleanupBus() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
