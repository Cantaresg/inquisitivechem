/**
 * TitrateStage — owns the drop loop, swirl action, and run recording.
 *
 * Drop rates (§8.3):
 *   'drop' → 0.05 mL every 800 ms   (single drop — default near endpoint)
 *   'slow' → 0.10 mL every 300 ms   (slow stream — after rough run)
 *   'fast' → 0.40 mL every  80 ms   (fast stream — well before endpoint)
 *
 * Concordance rule (validate):
 *   At least 2 accurate (non-rough) runs with titres within 0.20 mL of
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

  /** @type {boolean} Set by prepareNextRun() — triggers _startNewRun() on next enter() */
  #needsNewRun = false;

  constructor(deps) {
    super('titrate', 'Titration', deps);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    // Route flask-gesture swirls through our swirl() logic
    this._unsubs.push(
      this._bus.on('swirlRequested', () => {
        this.swirl();
        this._bus.emit('swirled');
        // Re-render controls in case canRecord changed
        const ctrlEl = document.getElementById('stage-controls');
        if (ctrlEl) this.renderControls(ctrlEl);
      }),
    );

    // First entry or returning after a "new run from pipette" request
    if (this.#runNumber === 0 || this.#needsNewRun) {
      this.#needsNewRun = false;

      // Funnel forgotten: residue drips silently into the burette.
      // The student's recorded initial reading is now wrong — their titre will
      // be off by the drip amount.  Logged to the action log for discovery.
      if (this._burette.hasFunnel) {
        const drip = 0.10 + Math.random() * 0.10;   // 0.10 – 0.20 mL
        this._burette.addVolume(drip);
        this._bus.emit('logAction', {
          action: '⚠ Funnel residue — initial reading affected',
          detail: `Funnel was not removed before titrating. ` +
                  `~${drip.toFixed(2)} mL of residue drained into the burette unnoticed. ` +
                  `The actual initial reading is now lower than recorded.`,
          level: 'warn',
        });
      }

      this._startNewRun();
    }
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
    this._bus.emit('stageAreaUpdated', { stageId: this.id });
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
    if (spread > 0.20) {
      return {
        ok:     false,
        reason: `Titres not concordant (spread ${spread.toFixed(2)} mL > 0.20 mL). Repeat.`,
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

  /** Mark a "new run from pipette" so next enter() increments the run counter. */
  prepareNextRun() {
    this.#needsNewRun = true;
  }

  /**
   * Increment run counter and snapshot the initial burette reading.
   * If a tip bubble is present it is silently expelled AFTER the snapshot,
   * so the student's recorded initial is correct but the level is now lower —
   * the apparent titre will be inflated by the bubble volume.
   * @protected
   */
  _startNewRun() {
    this.#runNumber++;
    this.#canRecord = false;
    this._burette.recordInitial();
    const bubbleVol = this._burette.expelTipBubble();
    if (bubbleVol > 0) {
      this._bus.emit('logAction', {
        action: '⚠ Air bubble expelled at start of run',
        detail: `A small air bubble (~${bubbleVol.toFixed(2)} mL) exited the tip at the start of Run ${this.#runNumber}. ` +
                `The apparent titre will be inflated by ~${bubbleVol.toFixed(2)} mL.`,
        level: 'warn',
      });
    }
    this._bus.emit('newRunStarted', { runNumber: this.#runNumber });
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
        <div id="scene-wrap" style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;transform-origin:center center;">
          <div id="burette-renderer-host" style="display:flex;flex-direction:column;align-items:center;"></div>
          <div id="flask-renderer-host"   style="display:flex;flex-direction:column;align-items:center;"></div>
        </div>
      </div>
      <div id="drop-container" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>`;
    if (!this._flask.hasIndicator) {
      el.style.position = 'relative';
      this._appendIndicatorBottle(el);
    }
  }

  _appendIndicatorBottle(el) {
    if (!this._state.indicator) return;
    const indCol = this._state.indicator.acidCol ?? 'rgba(180,220,255,0.45)';
    const indEl  = document.createElement('div');
    indEl.id = 'ind-bottle';
    indEl.style.cssText = [
      'position:absolute', 'right:20px', 'bottom:20px',
      'cursor:grab', 'user-select:none',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:4px',
      'animation:funnelPulse 2s ease-in-out infinite', 'z-index:10',
    ].join(';');
    indEl.innerHTML = `
      <svg width="32" height="58" viewBox="0 0 32 58">
        <rect x="13" y="2" width="6" height="10" rx="2"
          fill="rgba(180,220,255,0.08)" stroke="rgba(180,220,255,0.35)" stroke-width="1"/>
        <path d="M6,12 L6,46 Q6,54 16,54 Q26,54 26,46 L26,12 Z"
          fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.28)" stroke-width="1.2"/>
        <path d="M7,22 L7,46 Q7,53 16,53 Q25,53 25,46 L25,22 Z"
          fill="${indCol}" opacity="0.45"/>
        <rect x="8" y="26" width="16" height="10" rx="1"
          fill="rgba(255,255,255,0.03)" stroke="rgba(180,220,255,0.18)" stroke-width="0.8"/>
      </svg>
      <div style="font-size:8px;color:var(--muted);text-align:center;max-width:48px;">
        ${this._state.indicator.name}
      </div>`;
    el.appendChild(indEl);
    this._bindIndicatorDrag(el, indEl);
  }

  _bindIndicatorDrag(sceneEl, bottle) {
    const flaskHostEl = () => document.getElementById('flask-renderer-host');
    const buretteHostEl = () => document.getElementById('burette-renderer-host');

    let dragging = false;
    let ghost    = null;

    bottle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      bottle.setPointerCapture(e.pointerId);
      bottle.style.opacity   = '0.35';
      bottle.style.animation = 'none';
      ghost = bottle.cloneNode(true);
      ghost.style.cssText = [
        'position:fixed', 'pointer-events:none', 'opacity:0.75',
        'transform:translate(-50%,-50%)', 'z-index:9999',
        `left:${e.clientX}px`, `top:${e.clientY}px`,
      ].join(';');
      document.body.appendChild(ghost);
    });

    bottle.addEventListener('pointermove', (e) => {
      if (!dragging || !ghost) return;
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = e.clientY + 'px';
      const fh = flaskHostEl();
      if (fh) {
        const fr   = fh.getBoundingClientRect();
        const over = e.clientX >= fr.left && e.clientX <= fr.right &&
                     e.clientY >= fr.top  && e.clientY <= fr.bottom;
        fh.style.filter = over ? 'drop-shadow(0 0 8px var(--accent))' : '';
      }
    });

    bottle.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      bottle.style.opacity   = '';
      bottle.style.animation = '';
      if (ghost) { ghost.remove(); ghost = null; }
      const fh = flaskHostEl();
      if (fh) fh.style.filter = '';

      // Check drop target
      const inRect = (hostEl) => {
        if (!hostEl) return false;
        const r = hostEl.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right &&
               e.clientY >= r.top  && e.clientY <= r.bottom;
      };

      if (inRect(fh)) {
        const { indicator } = this._state;
        this._flask.setIndicator(indicator);
        this._bus.emit('logAction', {
          action: 'Indicator added',
          detail: `3 drops of ${indicator?.name ?? 'indicator'} added to flask`,
        });
        bottle.remove();
        // Re-emit phUpdated so flask colour updates
        this._bus.emit('phUpdated', {
          pH:       this._flask.pH,
          color:    this._flask.indicatorColor,
          volAdded: this._flask.totalVolAdded,
        });
      } else if (inRect(buretteHostEl())) {
        this._bus.emit('logAction', {
          action: '⚠ Indicator added to burette — error',
          detail: `${this._state.indicator?.name ?? 'Indicator'} was dropped on the burette. It should be added to the conical flask only.`,
          level: 'warn',
        });
        bottle.style.opacity   = '1';
        bottle.style.animation = 'funnelPulse 2s ease-in-out infinite';
      }
    });
  }

  renderControls(el) {
    const canRec   = this.#canRecord;
    const runLabel = `Run ${this.#runNumber}`;

    el.innerHTML = '';

    // Drop buttons (hold-to-drop via mousedown/up + touchstart/end)
    const addHoldBtn = (label, rate, cls = '') => {
      const btn = document.createElement('button');
      btn.className = `btn ${cls}`;
      btn.textContent = label;
      const start = () => this.startDropping(rate);
      const stop  = () => this.stopDropping();
      btn.addEventListener('mousedown',  start);
      btn.addEventListener('mouseup',    stop);
      btn.addEventListener('mouseleave', stop);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
      btn.addEventListener('touchend',   stop);
      el.appendChild(btn);
    };

    addHoldBtn('+ 1 Drop',    'drop', 'primary');
    addHoldBtn('Slow stream', 'slow');
    addHoldBtn('Fast stream', 'fast');

    const swirlBtn = document.createElement('button');
    swirlBtn.className = 'btn';
    swirlBtn.textContent = '🔄 Swirl';
    swirlBtn.addEventListener('click', () => {
      this.swirl();
      this._bus.emit('swirled');
    });
    el.appendChild(swirlBtn);

    // Status readout (no volume — student reads burette themselves)
    const status = document.createElement('div');
    status.style.cssText = 'margin-left:auto;display:flex;gap:16px;align-items:center;font-size:11px;';
    status.innerHTML = `
      <span style="color:var(--muted);">Run: <span style="color:var(--accent);">${runLabel}</span></span>`;
    el.appendChild(status);

    // Record & new-run buttons appear once tap closed / endpoint reached
    if (canRec) {
      const recBtn = document.createElement('button');
      recBtn.className = 'btn primary';
      recBtn.textContent = '📏 Record & save';
      recBtn.addEventListener('click', () => this._showFinalReadingModal(el));
      el.appendChild(recBtn);

      const newBtn = document.createElement('button');
      newBtn.className = 'btn';
      newBtn.textContent = 'New run';
      newBtn.addEventListener('click', () => {
        this._bus.emit('requestNewRun');
      });
      el.appendChild(newBtn);
    }

    // Show "View Results →" once concordance is achieved
    if (this.#runs.length >= 2) {
      const v = this.validate();
      if (v.ok) {
        const resBtn = document.createElement('button');
        resBtn.className = 'btn primary';
        resBtn.textContent = 'View Results →';
        resBtn.style.cssText = 'background:var(--success,#2e7d32);border-color:var(--success,#2e7d32);';
        resBtn.addEventListener('click', () => this._bus.emit('requestAdvance'));
        el.appendChild(resBtn);
      } else if (!canRec) {
        // Show concordance hint so student knows where they stand
        const hint = document.createElement('span');
        hint.style.cssText = 'font-size:10px;color:var(--danger);margin-left:4px;';
        hint.textContent = v.reason;
        el.appendChild(hint);
      }
    }
  }

  /**
   * Show a modal asking the student to read the burette and enter the final
   * reading and volume used.  Logs discrepancies, then calls recordResult().
   * @param {HTMLElement} ctrlEl  Controls bar element for post-modal re-render
   */
  _showFinalReadingModal(ctrlEl) {
    const b         = this._burette;
    const actual    = ((b.capacity ?? 50) - b.level) + 0.10;  // bottom-of-meniscus reading
    const actualVol = b.volumeAdded;
    const liqCol    = this._state.titrant?.dot ?? 'rgba(92,184,255,0.6)';

    // Remove any stale modal
    document.getElementById('final-reading-modal')?.remove();

    // Build zoom SVG centred on current reading
    const lo     = Math.max(-0.5, Math.floor(actual * 2) / 2 - 1.5);
    const hi     = Math.min(50.5, lo + 3.5);
    const zW     = 120;
    const zH     = 156;
    const pxML   = zH / (hi - lo);
    const mYz    = (actual - lo) * pxML;
    const sagPx  = 0.10 * pxML;

    const zMarks = [];
    const startTenth = Math.ceil(lo * 10);
    const endTenth   = Math.floor(hi * 10);
    for (let i = startTenth; i <= endTenth; i++) {
      const v     = i / 10;
      const y     = (v - lo) * pxML;
      const isMaj = i % 10 === 0;
      const isMid = i % 5  === 0;
      const isZ   = i === 0;
      const x2    = isMaj ? 58 : isMid ? 52 : 46;
      const sw    = isZ ? '1.8' : isMaj ? '1.2' : isMid ? '0.9' : '0.6';
      const col   = isZ ? 'var(--accent)' : `rgba(180,220,255,${isMaj ? '0.65' : isMid ? '0.45' : '0.28'})`;
      zMarks.push(
        `<line x1="26" y1="${y.toFixed(1)}" x2="${x2}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="${sw}"/>`,
        isMaj ? `<text x="61" y="${(y + 4).toFixed(1)}" font-size="10" fill="${isZ ? 'var(--accent)' : 'var(--text)'}" font-family="monospace">${v.toFixed(1)}</text>` : ''
      );
    }

    // Use the student's recorded initial reading (rounded to 0.05) as the reference
    const initReading = this._state.studentInitialReading ?? (b.initialReading ?? 0);

    const modal = document.createElement('div');
    modal.id = 'final-reading-modal';
    modal.className = 'reading-modal';
    modal.innerHTML = `
      <div class="reading-box">
        <h3>Final Burette Reading</h3>
        <p style="color:var(--muted);font-size:11px;">Read the bottom of the meniscus, then enter both values below.</p>
        <div style="display:flex;justify-content:center;margin:8px 0;">
          <svg width="${zW}" height="${zH}" viewBox="0 0 ${zW} ${zH}"
               style="background:rgba(0,0,0,0.15);border-radius:4px;">
            <rect x="26" y="0" width="14" height="${zH}"
              fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.25)" stroke-width="1"/>
            <rect x="27" y="${(mYz - sagPx).toFixed(1)}" width="12" height="${zH}"
              fill="${liqCol}" opacity="0.42"/>
            <path d="M27,${(mYz - sagPx).toFixed(1)} Q33,${mYz.toFixed(1)} 39,${(mYz - sagPx).toFixed(1)}"
              fill="none" stroke="${liqCol}" stroke-width="2" opacity="0.9"/>
            ${zMarks.join('\n')}
          </svg>
        </div>
        <p style="color:var(--muted);font-size:10px;">Scale reads 0.00 at the top and increases downward.</p>
        <div class="reading-input-row" style="margin-bottom:4px;">
          <label style="font-size:11px;color:rgba(255,200,50,0.80);min-width:90px;">Initial reading:</label>
          <span style="font-family:monospace;font-size:12px;color:rgba(255,200,50,0.90);">${initReading.toFixed(2)} mL</span>
        </div>
        <div class="reading-input-row">
          <label style="font-size:11px;color:var(--muted);min-width:90px;">Final reading:</label>
          <input type="number" id="frm-final" step="0.01" min="0" max="50" placeholder="0.00" />
          <span style="font-size:11px;color:var(--muted);">mL</span>
        </div>
        <div class="reading-input-row" style="margin-top:6px;">
          <label style="font-size:11px;color:var(--muted);min-width:90px;">Volume used:</label>
          <input type="number" id="frm-vol" step="0.01" min="0" max="50" placeholder="0.00" />
          <span style="font-size:11px;color:var(--muted);">mL</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:10px;">
          <input type="checkbox" id="frm-rough" />
          <label for="frm-rough" style="font-size:11px;color:var(--muted);cursor:pointer;">
            Mark as rough / preliminary run (excluded from concordance)
          </label>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
          <button class="btn" id="frm-cancel">Cancel</button>
          <button class="btn primary" id="frm-submit">Record</button>
        </div>
        <div id="frm-feedback" style="color:var(--danger);font-size:10px;margin-top:6px;min-height:14px;"></div>
      </div>`;
    document.body.appendChild(modal);

    const finalInput = document.getElementById('frm-final');
    const volInput   = document.getElementById('frm-vol');
    const feedback   = document.getElementById('frm-feedback');

    const close = () => modal.remove();
    document.getElementById('frm-cancel').addEventListener('click', close);

    const roundTo05 = (v) => Math.round(v / 0.05) * 0.05;

    [finalInput, volInput].forEach(inp => {
      if (inp) inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) inp.value = roundTo05(v).toFixed(2);
      });
    });

    document.getElementById('frm-submit').addEventListener('click', () => {
      const rawFinal = parseFloat(finalInput.value);
      const rawVol   = parseFloat(volInput.value);
      feedback.textContent = '';

      if (isNaN(rawFinal) || rawFinal < 0 || rawFinal > 50) {
        feedback.textContent = 'Enter a valid final reading (0.00 – 50.00 mL).';
        return;
      }
      if (isNaN(rawVol) || rawVol <= 0 || rawVol > 50) {
        feedback.textContent = 'Enter a valid volume used (0.01 – 50.00 mL).';
        return;
      }
      const enteredFinal = roundTo05(rawFinal);
      const enteredVol   = roundTo05(rawVol);
      const isRough      = document.getElementById('frm-rough')?.checked ?? false;
      close();

      const finalErr = Math.abs(enteredFinal - actual);
      const volErr   = Math.abs(enteredVol - actualVol);
      if (finalErr > 0.05) {
        this._bus.emit('logAction', {
          action: '⚠ Final reading — possible error',
          detail: `Student recorded ${enteredFinal.toFixed(2)} mL; actual reading was ${actual.toFixed(2)} mL. Difference: ${finalErr.toFixed(2)} mL.`,
          level: 'warn',
        });
      } else {
        this._bus.emit('logAction', {
          action: 'Final reading',
          detail: `${enteredFinal.toFixed(2)} mL recorded${isRough ? ' (rough run)' : ''}`,
        });
      }
      if (volErr > 0.05) {
        this._bus.emit('logAction', {
          action: '⚠ Volume used — possible error',
          detail: `Student recorded ${enteredVol.toFixed(2)} mL; actual volume was ${actualVol.toFixed(2)} mL. Difference: ${volErr.toFixed(2)} mL.`,
          level: 'warn',
        });
      }

      this.recordResult(isRough);
      this.renderControls(ctrlEl);
      this._bus.emit('stageAreaUpdated', { stageId: this.id });
    });

    finalInput?.focus();
  }
}
