/**
 * StandardStage — standard solution preparation (JC / guided mode).
 *
 * Procedure (mirrors real JC practical):
 *   1. Place evaporating dish on balance
 *   2. Tare balance (zero with dish)
 *   3. Add Na₂CO₃ solid by scooping (atmospheric fluctuations simulated)
 *   4. Pour weighed solid into 250 mL volumetric flask
 *
 * The derived concentration is written to labState.titrantConc for most
 * presets (Na₂CO₃ used to standardise the titrant), or labState.analyteConc
 * when Na₂CO₃ itself is the analyte (Na2CO3_SA preset).
 *
 * Uses wideLayout = true so UIRenderer collapses the side panels.
 */

import { Stage }           from './Stage.js';
import { ChemicalDB, Mw } from '../data/ChemicalDB.js';

const PRIMARY_STANDARD_ID = 'na2co3';
const FLASK_VOL_L          = 0.250;   // 250 cm³
const DISH_WEIGHT_G        = 52.3419; // fixed porcelain dish mass shown before tare

export class StandardStage extends Stage {
  /** @type {number} Net grams of Na₂CO₃ weighed out */
  #massGrams = 0;
  /** @type {'init'|'dish'|'tared'|'done'} */
  #phase = 'init';
  /** @type {number|null} setInterval handle for balance flicker */
  #flickerTimer = null;

  constructor(deps) {
    super('standard', 'Standard Solution', deps);
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  get wideLayout() { return true; }

  // ── Programmatic API ─────────────────────────────────────────────────────

  setMass(grams) {
    this.#massGrams = grams;
    if (grams <= 0) return;
    const moles = grams / Mw[PRIMARY_STANDARD_ID];
    const conc  = moles / FLASK_VOL_L;
    if (this._state.analyte?.id === PRIMARY_STANDARD_ID) {
      this._state.analyteConc = conc;
    } else {
      this._state.titrantConc = conc;
    }
  }

  get massGrams() { return this.#massGrams; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
    this.#massGrams = 0;
    this.#phase     = 'init';
  }

  exit() {
    this._stopFlicker();
    this._cleanupBus();
  }

  // ── Flicker (atmospheric fluctuation) ─────────────────────────────────────

  _startFlicker() {
    this._stopFlicker();
    this.#flickerTimer = setInterval(() => {
      const disp = document.getElementById('std-balance-disp');
      if (!disp) { this._stopFlicker(); return; }
      const noise = (Math.random() - 0.5) * 0.0004;
      if (this.#phase === 'dish') {
        disp.textContent = (DISH_WEIGHT_G + noise).toFixed(4);
      } else if (this.#phase === 'tared') {
        disp.textContent = Math.max(0, this.#massGrams + noise).toFixed(4);
      }
    }, 180);
  }

  _stopFlicker() {
    if (this.#flickerTimer !== null) {
      clearInterval(this.#flickerTimer);
      this.#flickerTimer = null;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  renderArea(el) {
    const chem       = ChemicalDB.get(PRIMARY_STANDARD_ID);
    const molarMass  = Mw[PRIMARY_STANDARD_ID];
    const targetMass = 0.1 * FLASK_VOL_L * molarMass;   // grams for 0.10 mol dm⁻³
    const m          = this.#massGrams;
    const overshot   = m > targetMass * 1.15;
    const accepted   = m >= targetMass * 0.90 && m <= targetMass * 1.15;
    const derived    = m > 0 ? ((m / molarMass) / FLASK_VOL_L) : null;

    const isAnalyte  = this._state.analyte?.id === PRIMARY_STANDARD_ID;
    const purposeNote = isAnalyte
      ? `Na₂CO₃ will be your <strong>analyte</strong> — its concentration is set directly by your mass.`
      : `Na₂CO₃ is the primary standard used to set the exact concentration of your <strong>titrant (${this._state.titrant?.formula ?? 'titrant'})</strong>.`;

    const solidFrac = Math.min(1, m / targetMass);

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;height:100%;width:100%;overflow:hidden;">

        <!-- ═══ LEFT: Balance scene ═══ -->
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    padding:28px 20px;border-right:1px solid var(--border);gap:18px;overflow:hidden;">

          <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);">
            Electronic Balance
          </div>

          ${this._balanceSvg(solidFrac)}

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;width:100%;max-width:300px;">
            ${this._actionButtons(m, targetMass, overshot, accepted)}
          </div>
        </div>

        <!-- ═══ RIGHT: Info + steps ═══ -->
        <div style="display:flex;flex-direction:column;padding:28px;gap:22px;overflow-y:auto;">

          <!-- Chemical identity -->
          <div>
            <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">
              Primary Standard
            </div>
            <div style="font-size:24px;font-family:var(--font-heading);margin-bottom:6px;">
              ${chem?.formula ?? 'Na₂CO₃'}
            </div>
            <div style="font-size:11px;color:var(--muted);line-height:1.7;">
              ${chem?.name ?? 'Anhydrous sodium carbonate'}<br>
              M<sub>r</sub> = ${molarMass} g mol⁻¹ &nbsp;·&nbsp; White crystalline solid<br>
              <span style="color:var(--accent);margin-top:6px;display:block;">${purposeNote}</span>
            </div>
          </div>

          <!-- Step checklist -->
          <div>
            <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">
              Procedure
            </div>
            ${this._steps(m, targetMass, accepted).map((s, i) => `
              <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
                <div style="width:18px;height:18px;border-radius:50%;flex-shrink:0;margin-top:1px;
                  display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;
                  ${s.done
                    ? 'background:var(--accent3);color:#051a10;'
                    : 'background:var(--surface2);border:1px solid var(--border2);color:var(--muted);'}">
                  ${s.done ? '✓' : (i + 1)}
                </div>
                <div style="font-size:11px;color:${s.done ? 'var(--text)' : 'var(--muted)'};padding-top:2px;line-height:1.5;">
                  ${s.label}
                </div>
              </div>`).join('')}
          </div>

          <!-- Derived concentration (shown once mass > 0) -->
          ${derived !== null ? `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
            <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">
              Derived Concentration
            </div>
            <div class="info-row"><span>Mass weighed</span><span>${m.toFixed(4)} g</span></div>
            <div class="info-row"><span>Moles of Na₂CO₃</span><span>${(m / molarMass).toFixed(5)} mol</span></div>
            <div class="info-row"><span>Flask volume</span><span>250.0 mL</span></div>
            <div class="info-row" style="border-bottom:none;padding-top:8px;">
              <span style="color:var(--accent2);">Concentration</span>
              <span style="color:var(--accent2);font-weight:700;">${derived.toFixed(4)} mol dm⁻³</span>
            </div>
          </div>` : ''}

          <!-- Volumetric flask -->
          <div style="display:flex;align-items:center;gap:16px;">
            ${this._flaskSvg(m, targetMass)}
            <div style="font-size:11px;color:var(--muted);line-height:1.7;">
              250 mL volumetric flask<br>
              ${this.#phase === 'done'
                ? `<span style="color:var(--accent3);">Solution ready: ${derived?.toFixed(4) ?? '—'} mol dm⁻³</span>`
                : 'Awaiting solid transfer'}
            </div>
          </div>

        </div><!-- /right -->
      </div>`;

    this._wireButtons(el, targetMass, overshot, accepted);

    if (this.#phase === 'dish' || this.#phase === 'tared') {
      this._startFlicker();
    }
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────

  _balanceSvg(solidFrac) {
    const phase = this.#phase;
    const dishShown = phase !== 'init';
    const hasSolid  = this.#massGrams > 0;

    const dispText = phase === 'init'  ? '0.0000'
                   : phase === 'dish'  ? DISH_WEIGHT_G.toFixed(4)
                   : this.#massGrams.toFixed(4);
    const dispCol  = phase === 'init' ? 'var(--muted)' : 'var(--accent3)';
    const tareBorderCol = phase === 'dish' ? 'var(--accent)' : 'var(--border2)';
    const tareTextCol   = phase === 'dish' ? 'var(--accent)' : 'var(--muted)';

    // Evaporating dish (2.5-D side view)
    const dishSvg = dishShown ? `
      <!-- Evaporating dish rim (outer ellipse) -->
      <ellipse cx="150" cy="110" rx="68" ry="8"
        fill="var(--surface2)" stroke="rgba(200,215,235,0.45)" stroke-width="1.5"/>
      <!-- Dish bowl curve -->
      <path d="M82,110 Q86,126 150,129 Q214,126 218,110"
        fill="var(--surface)" stroke="rgba(180,200,220,0.25)" stroke-width="1.2"/>
      <!-- Rim inner highlight -->
      <ellipse cx="150" cy="110" rx="60" ry="6"
        fill="rgba(180,210,240,0.04)" stroke="rgba(180,210,240,0.18)" stroke-width="1"/>
      ${hasSolid ? `
        <!-- Na₂CO₃ powder mound (white crystalline solid) -->
        <ellipse cx="150" cy="${119 - solidFrac * 6}" rx="${56 * solidFrac}" ry="${5.5 * solidFrac}"
          fill="rgba(230,240,255,0.55)"/>
        <ellipse cx="150" cy="${118 - solidFrac * 6}" rx="${44 * solidFrac}" ry="${3.5 * solidFrac}"
          fill="rgba(248,252,255,0.80)"/>
        <!-- powder texture dots -->
        <ellipse cx="${132 + solidFrac * 4}" cy="${117 - solidFrac * 5}" rx="${3 * solidFrac}" ry="${1.5 * solidFrac}"
          fill="rgba(255,255,255,0.55)" opacity="0.7"/>
        <ellipse cx="${163 - solidFrac * 3}" cy="${117 - solidFrac * 4}" rx="${2.5 * solidFrac}" ry="${1.2 * solidFrac}"
          fill="rgba(255,255,255,0.45)" opacity="0.6"/>
      ` : ''}
    ` : '';

    return `
    <svg width="300" height="250" viewBox="0 0 300 265" style="max-width:100%;flex-shrink:0;">

      <!-- Pan support pillar -->
      <rect x="143" y="125" width="14" height="37"
        fill="var(--surface2)" stroke="rgba(180,200,220,0.15)" stroke-width="1"/>

      <!-- Balance pan (flat circular plate) -->
      <ellipse cx="150" cy="125" rx="84" ry="11"
        fill="var(--surface2)" stroke="rgba(180,210,240,0.40)" stroke-width="1.5"/>
      <!-- Pan surface sheen -->
      <ellipse cx="137" cy="121" rx="24" ry="4"
        fill="rgba(255,255,255,0.04)" transform="rotate(-10 137 121)"/>

      ${dishSvg}

      <!-- Balance body -->
      <rect x="12" y="162" width="276" height="90" rx="9"
        fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>

      <!-- LCD display window -->
      <rect x="22" y="173" width="192" height="56" rx="5"
        fill="#050d14" stroke="var(--border)" stroke-width="1"/>

      <!-- Display text (id targeted by flicker timer) -->
      <text id="std-balance-disp"
        x="208" y="210" text-anchor="end"
        font-family="'Inconsolata','Courier New',monospace"
        font-size="28" letter-spacing="3"
        fill="${dispCol}">${dispText}</text>
      <!-- Unit label -->
      <text x="216" y="210"
        font-family="'Inconsolata',monospace" font-size="12"
        fill="var(--muted)">g</text>

      <!-- Model label -->
      <text x="32" y="220"
        font-family="monospace" font-size="9" letter-spacing="0.5"
        fill="rgba(100,120,150,0.6)">InquisiveLab AX-200</text>

      <!-- TARE button -->
      <rect x="222" y="174" width="56" height="28" rx="5"
        fill="var(--surface2)" stroke="${tareBorderCol}" stroke-width="1.5"/>
      <text x="250" y="192" text-anchor="middle"
        font-family="monospace" font-size="11" font-weight="700"
        fill="${tareTextCol}">TARE</text>

      <!-- Balance feet -->
      <rect x="22"  y="248" width="28" height="7" rx="3" fill="var(--surface2)"/>
      <rect x="250" y="248" width="28" height="7" rx="3" fill="var(--surface2)"/>
    </svg>`;
  }

  _flaskSvg(m, targetMass) {
    const fillFrac = m > 0 ? Math.min(1, m / targetMass) : 0;
    const fillY    = Math.max(38, 172 - fillFrac * 102);
    return `
    <svg width="68" height="155" viewBox="0 0 80 180" style="flex-shrink:0;">
      <defs>
        <clipPath id="std-vf-clip">
          <path d="M35,10 L35,90 L8,150 Q4,170 14,172 L66,172 Q76,170 72,150 L45,90 L45,10 Z"/>
        </clipPath>
      </defs>
      <!-- Flask glass -->
      <path d="M35,10 L35,90 L8,150 Q4,170 14,172 L66,172 Q76,170 72,150 L45,90 L45,10 Z"
        fill="rgba(180,220,255,0.04)" stroke="rgba(180,220,255,0.25)" stroke-width="1.5"/>
      <!-- Solution fill -->
      ${m > 0 ? `<rect x="0" y="${fillY}" width="80" height="172"
        clip-path="url(#std-vf-clip)" fill="rgba(92,255,184,0.20)"/>` : ''}
      <!-- 250 mL calibration line -->
      <line x1="28" y1="68" x2="52" y2="68"
        stroke="var(--accent)" stroke-width="1.5"/>
      <!-- Neck + stopper -->
      <rect x="33" y="2" width="14" height="12" rx="2"
        fill="rgba(180,220,255,0.04)" stroke="rgba(180,220,255,0.25)" stroke-width="1.5"/>
      <text x="40" y="178" text-anchor="middle" font-size="8"
        fill="var(--muted)">250 mL</text>
    </svg>`;
  }

  // ── Action buttons ────────────────────────────────────────────────────────

  _actionButtons(m, targetMass, overshot, accepted) {
    switch (this.#phase) {
      case 'init':
        return `<button class="btn primary" id="std-place" style="width:100%;max-width:260px;">
                  Place evaporating dish on balance
                </button>`;

      case 'dish':
        return `
          <div style="font-size:10px;color:var(--muted);text-align:center;">
            Reading settling… dish on pan
          </div>
          <button class="btn primary" id="std-tare" style="width:100%;max-width:260px;">
            Tare balance (zero with dish)
          </button>`;

      case 'tared':
        return `
          <div style="display:flex;gap:8px;width:100%;justify-content:center;">
            <button class="btn" id="std-small">+ Small scoop</button>
            <button class="btn" id="std-large">+ Large scoop</button>
            <button class="btn danger" id="std-reset">Reset</button>
          </div>
          ${overshot
            ? `<div style="font-size:10px;color:var(--danger);text-align:center;margin-top:4px;">
                 ⚠ Overshot — cannot remove solid. Reset and weigh again.
               </div>`
            : m > 0 && !accepted
              ? `<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:4px;">
                   Target ~${targetMass.toFixed(3)} g &nbsp;·&nbsp; Current: ${m.toFixed(4)} g
                 </div>`
              : ''}
          ${accepted
            ? `<button class="btn primary" id="std-pour" style="width:100%;max-width:260px;margin-top:4px;">
                 Pour into 250 mL volumetric flask →
               </button>`
            : ''}`;

      case 'done':
        return `<div style="font-size:12px;color:var(--accent3);text-align:center;">
                  ✓ Standard solution prepared
                </div>`;
    }
    return '';
  }

  _steps(m, targetMass, accepted) {
    const phase = this.#phase;
    return [
      { label: 'Place evaporating dish on balance',
        done: phase !== 'init' },
      { label: 'Tare balance (zero display with dish on pan)',
        done: phase === 'tared' || phase === 'done' },
      { label: `Scoop Na₂CO₃ into dish — target ~${targetMass.toFixed(3)} g (0.10 mol dm⁻³ in 250 mL)`,
        done: m > 0 && accepted },
      { label: 'Pour weighed solid into 250 mL volumetric flask, dissolve and make up to mark',
        done: phase === 'done' },
    ];
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _wireButtons(el, targetMass, overshot, accepted) {
    const refresh = () => {
      this.renderArea(el);
      this._bus.emit('stageAreaUpdated', { stageId: this.id });
    };

    el.querySelector('#std-place')?.addEventListener('click', () => {
      this.#phase = 'dish';
      refresh();
    });

    el.querySelector('#std-tare')?.addEventListener('click', () => {
      this.#phase = 'tared';
      refresh();
    });

    const scoop = (amount) => {
      if (this.#phase !== 'tared') return;
      const noise = (Math.random() - 0.5) * amount * 0.22;
      this.setMass(this.#massGrams + Math.max(0, amount + noise));
      refresh();
    };
    // Target is ~2.65 g (0.10 mol dm⁻³ in 250 mL).
    // Large scoop ≈ 0.40 g → ~6-7 clicks to target; small ≈ 0.05 g for fine-tuning.
    el.querySelector('#std-small')?.addEventListener('click', () => scoop(0.050));
    el.querySelector('#std-large')?.addEventListener('click', () => scoop(0.400));

    el.querySelector('#std-reset')?.addEventListener('click', () => {
      this.setMass(0);
      this.#phase = 'tared';
      refresh();
    });

    el.querySelector('#std-pour')?.addEventListener('click', () => {
      this.#phase = 'done';
      this._stopFlicker();
      this._markComplete();
      refresh();
    });
  }

  // ── Controls bar ──────────────────────────────────────────────────────────

  renderControls(el) {
    // Proactively call validate() so UIRenderer can check isComplete and show "Next →"
    this.validate();
    const molarMass  = Mw[PRIMARY_STANDARD_ID];
    const targetMass = 0.1 * FLASK_VOL_L * molarMass;
    const m          = this.#massGrams;
    el.innerHTML = '';
    if (this.#phase === 'done') {
      el.innerHTML = `<span style="color:var(--accent3);font-size:12px;">
        ✓ ${m.toFixed(4)} g Na₂CO₃ weighed · ${((m / molarMass) / FLASK_VOL_L).toFixed(4)} mol dm⁻³
      </span>`;
    } else if (m > targetMass * 1.15) {
      el.innerHTML = `<span style="color:var(--danger);font-size:12px;">
        ⚠ Overshot — reset and weigh again
      </span>`;
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    const targetMass = 0.1 * FLASK_VOL_L * Mw[PRIMARY_STANDARD_ID];
    if (this.#phase === 'init')
      return { ok: false, reason: 'Place the evaporating dish on the balance.' };
    if (this.#phase === 'dish')
      return { ok: false, reason: 'Tare the balance before adding the solid.' };
    if (this.#massGrams <= 0)
      return { ok: false, reason: 'Scoop Na₂CO₃ into the evaporating dish.' };
    if (this.#massGrams > targetMass * 1.15)
      return { ok: false, reason: 'Overshot — reset and weigh again (cannot remove solid).' };
    if (this.#phase !== 'done')
      return { ok: false, reason: 'Pour the weighed solid into the volumetric flask.' };
    this._markComplete();
    return { ok: true, reason: '' };
  }
}
