/**
 * BuretteStage — fill the burette, remove the funnel, expel the air bubble,
 * and record the initial reading.
 *
 * Four explicit steps map to BuretteSimulator:
 *   fill()          → burette.fill(titrant, concentration)
 *   removeFunnel()  → burette.removeFunnel()
 *   expelBubble()   → burette.expelBubble()
 *   recordInitial() → burette.recordInitial()
 *
 * validate() ensures all four steps are done.  The forgotten funnel and
 * unchecked bubble are intentional error paths students can trigger.
 *
 * Side effect on advance:
 *   exit() calls flask.setTitrant() so that TitrateStage can compute pH
 *   correctly from the very first tick without needing an extra setup call.
 */

import { Stage } from './Stage.js';

export class BuretteStage extends Stage {
  /** @type {boolean} */
  #filled = false;

  constructor(deps) {
    super('burette', 'Fill Burette', deps);
  }

  // ── Programmatic API ──────────────────────────────────────────────────────

  /**
   * Fill the burette with the titrant from labState.
   * @throws {Error} if no titrant has been set in labState
   */
  fill() {
    const { titrant, titrantConc } = this._state;
    if (!titrant) throw new Error('BuretteStage.fill(): no titrant set in labState');
    this._burette.fill(titrant, titrantConc ?? 0.1);
    this.#filled = true;
  }

  /** Remove the funnel from the top of the burette. */
  removeFunnel() {
    this._burette.removeFunnel();
  }

  /**
   * Open the tap briefly to expel the air bubble from the tip.
   * No-op if no bubble is present.
   */
  expelBubble() {
    this._burette.expelBubble();
  }

  /** Snapshot the current burette level as the initial reading for run 1. */
  recordInitial() {
    this._burette.recordInitial();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
  }

  exit() {
    const { titrant, titrantConc } = this._state;
    if (titrant) this._flask.setTitrant(titrant, titrantConc ?? 0.1);
    this._cleanupBus();
  }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  renderArea(el) {
    const b       = this._burette;
    const liqCol  = this._state.titrant?.dot ?? 'rgba(92,184,255,0.55)';
    const fillPct = Math.max(0, Math.min(100, (b.volumeRemaining / 50) * 100));
    const tubH    = 240;
    const liqH    = (fillPct / 100) * tubH;

    const steps = [
      { done: this.#filled,              text: '① Fill burette with titrant via funnel' },
      { done: !b.hasFunnel,             text: '② Remove funnel before titrating' },
      { done: !b.hasBubble,             text: '③ Run off ~5 mL to expel air bubble' },
      { done: b.initialReading !== null, text: '④ Record initial burette reading' },
    ];

    el.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:40px;padding:30px;">

        <!-- Burette -->
        <div style="display:flex;flex-direction:column;align-items:center;position:relative;">
          ${b.hasFunnel ? `
          <svg width="50" height="36" viewBox="0 0 50 36" style="margin-bottom:-4px;">
            <path d="M5,5 L45,5 L30,32 L20,32 Z" fill="rgba(180,220,255,0.10)" stroke="rgba(180,220,255,0.35)" stroke-width="1.5"/>
          </svg>` : '<div style="height:32px;"></div>'}

          <!-- Tube -->
          <div style="position:relative;width:26px;height:${tubH}px;background:rgba(180,220,255,0.06);border:1px solid rgba(180,220,255,0.25);border-radius:3px 3px 0 0;overflow:hidden;">
            <div style="position:absolute;bottom:0;left:0;right:0;height:${liqH.toFixed(1)}px;background:${liqCol};border-radius:0 0 2px 2px;"></div>
          </div>
          <!-- Tap -->
          <div style="position:relative;width:26px;height:10px;">
            <div style="position:absolute;width:16px;height:6px;background:rgba(180,220,255,0.22);border:1px solid rgba(180,220,255,0.4);border-radius:3px;top:-3px;left:50%;transform:translateX(-50%);"></div>
          </div>
          <!-- Tip -->
          <div style="width:4px;height:28px;background:rgba(180,220,255,0.15);border:1px solid rgba(180,220,255,0.2);border-top:none;border-radius:0 0 2px 2px;"></div>

          <div style="font-size:10px;color:var(--muted);margin-top:4px;">50 mL burette</div>
          <div style="font-size:10px;color:var(--accent2);margin-top:2px;">${b.volumeRemaining?.toFixed(2) ?? '—'} mL remaining</div>
        </div>

        <!-- Checklist -->
        <div style="max-width:230px;font-size:11px;line-height:2.2;">
          ${steps.map(s => `<div style="color:${s.done ? 'var(--accent3)' : 'var(--muted)'};">${s.done ? '✓' : '○'} ${s.text}</div>`).join('')}
          ${b.hasBubble ? '<div style="color:var(--warning);margin-top:6px;">⚠ Air bubble visible in tip</div>' : ''}
          ${b.initialReading !== null ? `<div style="color:var(--accent);margin-top:6px;">Initial reading: ${b.initialReading.toFixed(2)} mL</div>` : ''}
        </div>

      </div>`;
  }

  renderControls(el) {
    const b = this._burette;
    el.innerHTML = '';

    const addBtn = (label, cls, handler) => {
      const btn = document.createElement('button');
      btn.className = `btn ${cls}`;
      btn.textContent = label;
      btn.addEventListener('click', handler);
      el.appendChild(btn);
    };

    const refresh = () => {
      const animContent = document.getElementById('anim-content');
      if (animContent) this.renderArea(animContent);
      this.renderControls(el);
      this._bus.emit('stageAreaUpdated', { stageId: this.id });
    };

    if (!this.#filled) {
      addBtn('Fill burette', 'primary', () => { this.fill(); this._bus.emit('logAction', { action: 'Burette filled', detail: `${this._state.titrant?.formula} added` }); refresh(); });
    }
    if (this.#filled && b.hasFunnel) {
      addBtn('Remove funnel', '', () => { this.removeFunnel(); this._bus.emit('logAction', { action: 'Funnel removed' }); refresh(); });
    }
    if (this.#filled && !b.hasFunnel && b.hasBubble) {
      addBtn('Run off air bubble (→ waste)', '', () => { this.expelBubble(); this._bus.emit('logAction', { action: 'Air bubble expelled', detail: '~3 mL run off to waste' }); refresh(); });
    }
    if (this.#filled && !b.hasFunnel && !b.hasBubble && b.initialReading === null) {
      addBtn('📏 Record initial reading', 'primary', () => {
        this.recordInitial();
        this._bus.emit('logAction', { action: 'Initial reading', detail: `${b.initialReading?.toFixed(2)} mL recorded` });
        refresh();
      });
    }
    if (b.initialReading !== null) {
      el.insertAdjacentHTML('beforeend', `<span style="color:var(--accent3);font-size:12px;">✓ Initial reading: ${b.initialReading.toFixed(2)} mL</span>`);
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    if (!this.#filled) {
      return { ok: false, reason: 'Fill the burette with titrant.' };
    }
    if (this._burette.hasFunnel) {
      return { ok: false, reason: 'Remove the funnel from the burette before titrating.' };
    }
    if (this._burette.hasBubble) {
      return { ok: false, reason: 'Expel the air bubble from the burette tip.' };
    }
    if (this._burette.initialReading === null) {
      return { ok: false, reason: 'Record the initial burette reading.' };
    }
    this._markComplete();
    return { ok: true, reason: '' };
  }
}
