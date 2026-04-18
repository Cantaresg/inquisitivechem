/**
 * PipetteStage — student pipettes analyte into the conical flask and adds indicator.
 *
 * Two explicit student actions are required:
 *   pipette()      → flask.fill(analyte, concentration)
 *   addIndicator() → flask.setIndicator(indicator)
 *
 * validate() blocks until both have been completed.
 *
 * Animation sequence on "Pipette into flask":
 *   1. Pipette fills (liquid rises to calibration mark, ~900 ms)
 *   2. Meniscus flashes at the 25.00 mL line (~500 ms)
 *   3. Pipette drains + stream appears between tip and flask (~1000 ms)
 *   4. Flask fills (~700 ms)
 */

import { Stage } from './Stage.js';

export class PipetteStage extends Stage {
  /** @type {boolean} */
  #filled = false;
  /** @type {boolean} */
  #indicatorAdded = false;
  /** @type {boolean} */
  #animating = false;

  constructor(deps) {
    super('pipette', 'Pipette Analyte', deps);
  }

  // ── Programmatic API ──────────────────────────────────────────────────────

  pipette() {
    const { analyte, analyteConc } = this._state;
    if (!analyte) throw new Error('PipetteStage.pipette(): no analyte set in labState');
    this._flask.fill(analyte, analyteConc ?? 0.1);
    this.#filled = true;
  }

  addIndicator() {
    const { indicator } = this._state;
    if (!indicator) throw new Error('PipetteStage.addIndicator(): no indicator set in labState');
    this._flask.setIndicator(indicator);
    this.#indicatorAdded = true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() { this._cleanupBus(); }
  exit()  { this._cleanupBus(); }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  renderArea(el) {
    const s      = this._state;
    const liqCol = s.analyte?.dot ?? 'rgba(180,220,255,0.45)';
    const indCol = s.indicator?.acidCol ?? liqCol;
    const flaskLiqCol = this.#indicatorAdded ? indCol : liqCol;
    const flaskY = this.#filled ? 60 : 130;

    /*
     * Layout: stacked vertically — pipette tip faces the flask mouth.
     * The pipette is always rendered empty here; the animation handles
     * the fill/drain sequence via direct DOM attribute writes.
     */
    el.innerHTML = `
      <div id="pip-scene"
           style="display:flex;flex-direction:column;align-items:center;
                  gap:0;padding:16px 30px;height:100%;justify-content:center;">

        <!-- ── Volumetric pipette ── -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <svg id="pip-svg" width="44" height="268" viewBox="0 0 44 268"
               style="overflow:visible;">
            <defs>
              <!--
                Inner-wall clip used by the liquid rect.
                Upper capillary: x 19–25, y 0–74
                Bulb: widens to x 8–36, centre y 112
                Lower capillary: x 20–24, y 150–228
                Tip: narrows to point at (22, 262)
              -->
              <clipPath id="pip-inner-clip">
                <path d="
                  M22,2
                  L24,2  L24,76
                  Q35,84  35,112
                  Q35,140 24,148
                  L23,228 L22,260 L21,228 L20,148
                  Q9,140  9,112
                  Q9,84  20,76
                  L20,2 Z
                "/>
              </clipPath>
            </defs>

            <!-- Glass outline — one continuous path for a clean silhouette -->
            <path d="
              M18,0 L26,0 L26,74
              Q38,82  38,112
              Q38,142 26,150
              L25,230 L22,264 L19,230 L18,150
              Q6,142  6,112
              Q6,82  18,74 Z
            "
              fill="rgba(180,220,255,0.06)"
              stroke="rgba(180,220,255,0.32)"
              stroke-width="1.5"
              stroke-linejoin="round"/>

            <!-- Liquid fill — y animated during pipette sequence.
                 Pipette always starts empty (y=268). -->
            <rect id="pip-liquid"
              x="0" y="268" width="44" height="268"
              fill="${liqCol}" opacity="0.50"
              clip-path="url(#pip-inner-clip)"/>

            <!-- Calibration mark (25.00 mL) on upper capillary -->
            <line x1="14" y1="74" x2="30" y2="74"
              stroke="var(--accent)" stroke-width="1.5"/>
            <text x="32" y="78" font-size="7.5" fill="var(--accent)"
              font-family="monospace" font-weight="600">25.00</text>

            <!-- Meniscus highlight — shown during phase 2 -->
            <ellipse id="pip-meniscus"
              cx="22" cy="74" rx="9" ry="2.5"
              fill="rgba(255,212,92,0.18)"
              stroke="var(--warning)" stroke-width="1.5" opacity="0"/>

            <!-- Meniscus reading label — fades in during phase 2 -->
            <text id="pip-reading-label"
              x="22" y="68" font-size="7" fill="var(--warning)"
              text-anchor="middle" opacity="0">↓ meniscus</text>
          </svg>
          <div style="font-size:10px;color:var(--muted);">25.00 mL pipette</div>
        </div>

        <!-- Stream between tip and flask mouth (animated height) -->
        <div id="pip-stream"
             style="width:3px;height:0;
                    background:${liqCol};
                    border-radius:1.5px;opacity:0.85;
                    margin:0 auto;flex-shrink:0;"></div>

        <!-- ── Conical flask ── -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:4px;">
          <svg id="pip-flask-svg" width="100" height="130" viewBox="0 0 100 130">
            <defs>
              <clipPath id="pip-flask-clip">
                <path d="M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z"/>
              </clipPath>
            </defs>
            <path d="M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z"
              fill="rgba(180,220,255,0.05)" stroke="rgba(180,220,255,0.30)" stroke-width="1.5"/>
            <rect id="pip-flask-liquid"
              x="0" y="${flaskY}" width="100" height="70"
              clip-path="url(#pip-flask-clip)"
              fill="${this.#filled ? flaskLiqCol : 'transparent'}"
              opacity="0.55"/>
            <rect x="42" y="2" width="16" height="12" rx="3"
              fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.25)" stroke-width="1.5"/>
          </svg>
          <div class="tile"></div>
          <div style="font-size:10px;color:var(--muted);">conical flask</div>
        </div>

      </div>`;
  }

  renderControls(el) {
    // Mark complete as a side-effect so UIRenderer can show "Next →".
    this.validate();
    el.innerHTML = '';
    if (!this.#filled) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = '🧪 Pipette into flask';
      btn.disabled = this.#animating;
      btn.addEventListener('click', () => this._runPipetteAnimation(el));
      el.appendChild(btn);
    } else if (!this.#indicatorAdded) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = `💧 Add indicator (${this._state.indicator?.name ?? 'indicator'})`;
      btn.addEventListener('click', () => {
        this.addIndicator();
        this._bus.emit('logAction', { action: 'Indicator', detail: `3 drops of ${this._state.indicator?.name} added` });
        const animContent = el.closest('#app')?.querySelector('#anim-content') ?? el;
        this.renderArea(animContent);
        this.renderControls(el);
        this._bus.emit('stageAreaUpdated', { stageId: this.id });
      });
      el.appendChild(btn);
    } else {
      el.innerHTML = `<div style="color:var(--accent3);font-size:12px;">✓ Flask ready — 25.00 mL ${this._state.analyte?.formula} + ${this._state.indicator?.name}</div>`;
    }
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  /**
   * Four-phase animation:
   *   Phase 1 (0 – 900 ms)  : liquid rises in pipette to calibration mark (y: 268 → 74)
   *   Phase 2 (900 – 1400 ms): meniscus glow + reading label fade in/out
   *   Phase 3 (1400 – 2400 ms): pipette drains (y: 74 → 268) + stream grows/shrinks
   *   Phase 4 (2400 – 3100 ms): flask fills (liquid rect y: 130 → 60)
   */
  _runPipetteAnimation(ctrlEl) {
    if (this.#animating) return;
    this.#animating = true;
    ctrlEl.querySelector('button')?.setAttribute('disabled', 'true');

    const liqCol     = this._state.analyte?.dot ?? 'rgba(180,220,255,0.45)';
    const pipLiquid  = document.getElementById('pip-liquid');
    const meniscus   = document.getElementById('pip-meniscus');
    const readingLbl = document.getElementById('pip-reading-label');
    const stream     = document.getElementById('pip-stream');
    const flaskLiq   = document.getElementById('pip-flask-liquid');

    if (!pipLiquid || !flaskLiq) { this.#animating = false; return; }

    // Phase 1 — fill pipette
    this._tween(268, 74, 900, 'easeOut', (v) => {
      pipLiquid.setAttribute('y', v);
    }, () => {
      // Phase 2 — show meniscus
      if (meniscus)   meniscus.setAttribute('opacity', '1');
      if (readingLbl) readingLbl.setAttribute('opacity', '1');

      setTimeout(() => {
        if (meniscus)   meniscus.setAttribute('opacity', '0');
        if (readingLbl) readingLbl.setAttribute('opacity', '0');

        // Phase 3 — drain pipette + stream
        const STREAM_PEAK = 18; // px
        this._tween(74, 268, 1000, 'easeIn', (v, t) => {
          pipLiquid.setAttribute('y', v);
          // Stream: rises fast, stays, then shrinks in final 20 %
          const streamH = t < 0.8
            ? STREAM_PEAK * Math.min(t / 0.2, 1)
            : STREAM_PEAK * (1 - (t - 0.8) / 0.2);
          if (stream) stream.style.height = streamH + 'px';
        }, () => {
          if (stream) stream.style.height = '0px';

          // Phase 4 — fill flask
          flaskLiq.setAttribute('fill', liqCol);
          this._tween(130, 60, 700, 'easeOut', (v) => {
            flaskLiq.setAttribute('y', v);
          }, () => {
            this._finishPipette(ctrlEl);
          });
        });
      }, 500);
    });
  }

  _finishPipette(ctrlEl) {
    this.pipette();
    this.#animating = false;
    this._bus.emit('logAction', {
      action: 'Pipette',
      detail: `25.00 mL of ${this._state.analyte?.formula ?? 'analyte'} transferred to flask`,
    });
    this.renderControls(ctrlEl);
    this._bus.emit('stageAreaUpdated', { stageId: this.id });
  }

  /**
   * Generic rAF tween.
   * @param {number}   from
   * @param {number}   to
   * @param {number}   duration  ms
   * @param {'easeIn'|'easeOut'|'linear'} easing
   * @param {(value:number, progress:number)=>void} onStep
   * @param {()=>void} onDone
   */
  _tween(from, to, duration, easing, onStep, onDone) {
    const start = performance.now();
    const ease = (t) => {
      if (easing === 'easeOut') return 1 - Math.pow(1 - t, 3);
      if (easing === 'easeIn')  return t * t * t;
      return t;
    };
    const step = (now) => {
      const t  = Math.min((now - start) / duration, 1);
      const et = ease(t);
      onStep(from + (to - from) * et, t);
      if (t < 1) requestAnimationFrame(step);
      else        onDone?.();
    };
    requestAnimationFrame(step);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    if (!this.#filled) {
      return { ok: false, reason: 'Use the pipette to transfer analyte into the flask.' };
    }
    if (!this.#indicatorAdded) {
      return { ok: false, reason: 'Add a few drops of indicator to the flask.' };
    }
    this._markComplete();
    return { ok: true, reason: '' };
  }
}
