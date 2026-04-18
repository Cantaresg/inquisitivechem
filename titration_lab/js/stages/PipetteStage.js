/**
 * PipetteStage — student pipettes analyte into the conical flask and adds indicator.
 *
 * Two explicit student actions are required:
 *   pipette()      → flask.fill(analyte, concentration)
 *   addIndicator() → flask.setIndicator(indicator)
 *
 * validate() blocks until both have been completed.
 */

import { Stage } from './Stage.js';

export class PipetteStage extends Stage {
  /** @type {boolean} */
  #filled = false;
  /** @type {boolean} */
  #indicatorAdded = false;

  constructor(deps) {
    super('pipette', 'Pipette Analyte', deps);
  }

  // ── Programmatic API ──────────────────────────────────────────────────────

  /**
   * Transfer analyte from the stock bottle into the conical flask.
   * Uses labState.analyte and labState.analyteConc.
   * @throws {Error} if no analyte has been set in labState
   */
  pipette() {
    const { analyte, analyteConc } = this._state;
    if (!analyte) throw new Error('PipetteStage.pipette(): no analyte set in labState');
    this._flask.fill(analyte, analyteConc ?? 0.1);
    this.#filled = true;
  }

  /**
   * Add a few drops of indicator to the flask.
   * Uses labState.indicator.
   * @throws {Error} if no indicator has been set in labState
   */
  addIndicator() {
    const { indicator } = this._state;
    if (!indicator) throw new Error('PipetteStage.addIndicator(): no indicator set in labState');
    this._flask.setIndicator(indicator);
    this.#indicatorAdded = true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
  }

  exit() {
    this._cleanupBus();
  }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  renderArea(el) {
    const s   = this._state;
    const ind = s.indicator;
    const liqCol   = s.analyte?.dot ?? 'rgba(180,220,255,0.35)';
    const indCol   = ind?.acidCol   ?? 'rgba(180,220,255,0.12)';
    const flaskCol = this.#filled && this.#indicatorAdded ? indCol
                   : this.#filled ? liqCol
                   : 'transparent';

    el.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:40px;padding:30px;">

        <!-- Pipette SVG -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <svg width="30" height="260" viewBox="0 0 30 260">
            <ellipse cx="15" cy="80" rx="13" ry="48" fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.3)" stroke-width="1.5"/>
            <ellipse cx="15" cy="94" rx="11" ry="32" fill="${liqCol}" opacity="0.7"/>
            <line x1="4" y1="50" x2="26" y2="50" stroke="var(--accent)" stroke-width="1.5"/>
            <text x="28" y="54" font-size="7" fill="var(--accent)">25.00</text>
            <rect x="13" y="10" width="4" height="40" fill="rgba(180,220,255,0.12)" stroke="rgba(180,220,255,0.25)" stroke-width="1"/>
            <rect x="13" y="128" width="4" height="110" fill="rgba(180,220,255,0.12)" stroke="rgba(180,220,255,0.25)" stroke-width="1"/>
            <path d="M13,238 L15,252 L17,238 Z" fill="rgba(180,220,255,0.3)"/>
          </svg>
          <div style="font-size:10px;color:var(--muted);">25.00 mL pipette</div>
        </div>

        <!-- Flask SVG -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <svg width="100" height="130" viewBox="0 0 100 130">
            <defs><clipPath id="pip-clip"><path d="M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z"/></clipPath></defs>
            <path d="M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z"
              fill="rgba(180,220,255,0.05)" stroke="rgba(180,220,255,0.30)" stroke-width="1.5"/>
            ${this.#filled ? `<rect x="0" y="60" width="100" height="70" clip-path="url(#pip-clip)" style="fill:${flaskCol};"/>` : ''}
            <rect x="42" y="2" width="16" height="12" rx="3" fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.25)" stroke-width="1.5"/>
          </svg>
          <div class="tile"></div>
          <div style="font-size:10px;color:var(--muted);">conical flask</div>
        </div>

      </div>`;
  }

  renderControls(el) {
    el.innerHTML = '';
    if (!this.#filled) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = '🧪 Pipette into flask';
      btn.addEventListener('click', () => {
        this.pipette();
        this._bus.emit('logAction', { action: 'Pipette', detail: `25.00 mL of ${this._state.analyte?.formula ?? 'analyte'} transferred to flask` });
        this.renderArea(el.closest('#app')?.querySelector('#anim-content') ?? el);
        this.renderControls(el);
        this._bus.emit('stageAreaUpdated', { stageId: this.id });
      });
      el.appendChild(btn);
    } else if (!this.#indicatorAdded) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = `💧 Add indicator (${this._state.indicator?.name ?? 'indicator'})`;
      btn.addEventListener('click', () => {
        this.addIndicator();
        this._bus.emit('logAction', { action: 'Indicator', detail: `3 drops of ${this._state.indicator?.name} added` });
        this.renderArea(el.closest('#app')?.querySelector('#anim-content') ?? el);
        this.renderControls(el);
        this._bus.emit('stageAreaUpdated', { stageId: this.id });
      });
      el.appendChild(btn);
    } else {
      el.innerHTML = `<div style="color:var(--accent3);font-size:12px;">✓ Flask ready — 25.00 mL ${this._state.analyte?.formula} + ${this._state.indicator?.name}</div>`;
    }
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
