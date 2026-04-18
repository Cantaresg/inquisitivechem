/**
 * StandardStage — standard solution preparation (guided / JC mode only).
 *
 * Simplified model: the student enters the mass of a primary standard
 * (default: anhydrous Na₂CO₃) and the simulation derives the exact
 * concentration.  In a real lab this covers weighing, dissolution, and
 * making up to the mark in a volumetric flask.
 *
 * Phase 3: mass is set programmatically via setMass().
 * Phase 4: UI will show a mass input field and a static SVG diagram.
 */

import { Stage }            from './Stage.js';
import { ChemicalDB, Mw }  from '../data/ChemicalDB.js';

/** Id of the primary standard used in guided mode. */
const PRIMARY_STANDARD_ID = 'na2co3';

/** Volume of the volumetric flask used to make up the standard (dm³). */
const FLASK_VOL_L = 0.250;   // 250 cm³

export class StandardStage extends Stage {
  /** @type {number} Grams entered by student */
  #massGrams = 0;

  constructor(deps) {
    super('standard', 'Standard Solution', deps);
  }

  // ── Programmatic API (console-testable) ───────────────────────────────────

  /**
   * Record the mass of primary standard weighed out and derive the
   * concentration, writing it into labState.
   *
   * @param {number} grams  Mass in grams (must be > 0)
   */
  setMass(grams) {
    this.#massGrams = grams;
    if (grams <= 0) return;

    const molarMass = Mw[PRIMARY_STANDARD_ID];   // g mol⁻¹
    const moles     = grams / molarMass;
    const conc      = moles / FLASK_VOL_L;        // mol dm⁻³

    // Write derived concentration to whichever role has the standard
    if (this._state.titrant?.id === PRIMARY_STANDARD_ID) {
      this._state.titrantConc = conc;
    } else {
      this._state.analyteConc = conc;
    }
  }

  get massGrams() { return this.#massGrams; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
  }

  exit() {
    this._cleanupBus();
  }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  renderArea(el) {
    const chem     = ChemicalDB.get(PRIMARY_STANDARD_ID);
    const molarMass = Mw[PRIMARY_STANDARD_ID];
    const targetConc = 0.1; // mol dm⁻³
    const targetMass = (targetConc * FLASK_VOL_L * molarMass).toFixed(3);
    const currentMass = this.#massGrams;
    const derived = currentMass > 0
      ? ((currentMass / molarMass) / FLASK_VOL_L).toFixed(4) + ' mol dm⁻³'
      : '—';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px;width:100%;max-width:500px;">

        <div style="text-align:center;">
          <div class="panel-section-title" style="margin-bottom:12px;">Standard Solution Preparation</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">
            Weigh out <strong>${chem?.formula ?? 'Na₂CO₃'}</strong> (M<sub>r</sub> = ${molarMass} g mol⁻¹)<br>
            into a ${(FLASK_VOL_L * 1000).toFixed(0)} mL volumetric flask.<br>
            Target: ~${targetMass} g for 0.10 mol dm⁻³
          </div>

          <!-- Balance display -->
          <div class="balance-body" style="width:280px;margin:0 auto;">
            <div class="balance-display" id="balance-display">${currentMass.toFixed(4)}</div>
          </div>

          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
            <button class="btn" id="scoop-small">+ Small scoop</button>
            <button class="btn" id="scoop-large">+ Large scoop</button>
            <button class="btn danger" id="scoop-reset">Reset</button>
          </div>
          ${currentMass > 0 ? `
          <div style="margin-top:8px;font-size:11px;">
            Derived concentration: <span style="color:var(--accent2);">${derived}</span>
          </div>` : ''}
        </div>

        <!-- Volumetric flask SVG -->
        <svg width="80" height="180" viewBox="0 0 80 180">
          <defs><clipPath id="vf-clip"><path d="M35,10 L35,90 L8,150 Q4,170 14,172 L66,172 Q76,170 72,150 L45,90 L45,10 Z"/></clipPath></defs>
          <path d="M35,10 L35,90 L8,150 Q4,170 14,172 L66,172 Q76,170 72,150 L45,90 L45,10 Z"
            fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.3)" stroke-width="1.5"/>
          ${currentMass > 0 ? `<rect x="0" y="${Math.max(40, 172 - Math.min(1.2, currentMass / parseFloat(targetMass)) * 100)}" width="80" height="172"
            clip-path="url(#vf-clip)" fill="rgba(92,255,184,0.22)"/>` : ''}
          <line x1="28" y1="68" x2="52" y2="68" stroke="var(--accent)" stroke-width="1.5"/>
          <rect x="33" y="2" width="14" height="12" rx="2" fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.3)" stroke-width="1.5"/>
          <text x="40" y="178" text-anchor="middle" font-size="8" fill="var(--muted)">${(FLASK_VOL_L * 1000).toFixed(0)} mL</text>
        </svg>

      </div>`;

    // Wire scoop buttons
    const refresh = () => {
      this.renderArea(el);
      this._bus.emit('stageAreaUpdated', { stageId: this.id });
    };
    const add = (amount) => {
      const noise = (Math.random() - 0.5) * amount * 0.25;
      this.setMass(this.#massGrams + Math.max(0, amount + noise));
      refresh();
    };
    el.querySelector('#scoop-small')?.addEventListener('click', () => add(0.015));
    el.querySelector('#scoop-large')?.addEventListener('click', () => add(0.080));
    el.querySelector('#scoop-reset')?.addEventListener('click', () => { this.setMass(0); refresh(); });
  }

  renderControls(el) {
    const molarMass  = Mw[PRIMARY_STANDARD_ID];
    const targetMass = (0.1 * FLASK_VOL_L * molarMass);
    const m          = this.#massGrams;
    el.innerHTML = '';
    if (m > 0 && m >= targetMass * 0.90 && m <= targetMass * 1.15) {
      el.innerHTML = `<span style="color:var(--accent3);font-size:12px;">✓ Acceptable mass (${m.toFixed(4)} g)</span>`;
    } else if (m > targetMass * 1.15) {
      el.innerHTML = `<span style="color:var(--danger);font-size:12px;">⚠ Overshot — dispose and restart (cannot remove solid)</span>`;
    } else if (m > 0) {
      el.innerHTML = `<span style="color:var(--muted);font-size:12px;">Current mass: ${m.toFixed(4)} g · Target: ~${targetMass.toFixed(3)} g</span>`;
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    if (this.#massGrams <= 0) {
      return { ok: false, reason: 'Enter the mass of primary standard weighed out.' };
    }
    this._markComplete();
    return { ok: true, reason: '' };
  }
}
