/**
 * BuretteStage — interactive burette preparation.
 *
 * Scene interactions:
 *   Reagent bottle  hold ↓ / release ↑  →  pour titrant; level depends on
 *                                           how long the student holds.
 *   Funnel          click               →  remove (pulsing glow affordance;
 *                                           NOT prompted — forgetting it is an
 *                                           intentional error path).
 *                                           If burette is above 0 mark when
 *                                           funnel is removed, a small drip is
 *                                           logged as a contamination error.
 *   Tap             click               →  open tap; first click while bubble
 *                                           present expels ~3 mL + clears it;
 *                                           subsequent clicks = 0.5 mL each.
 *                                           First tap click also fills the
 *                                           capillary/tip visually.
 *   Record button   click               →  opens reading modal.
 *
 * Funnel state is NOT checked in validate() — students may titrate without
 * removing it and discover inaccurate results for themselves.
 */

import { Stage } from './Stage.js';

// ── Tube geometry (SVG coords) ────────────────────────────────────────────────
const TUBE_X        = 46;
const TUBE_W        = 16;
const TUBE_Y        = 10;           // top of tube (including above-0 section)
const ABOVE_ZERO_ML = 3;            // mL of tube space above the 0 graduation
const ML_PX         = 7;            // pixels per mL
const ABOVE_ZERO_PX = ABOVE_ZERO_ML * ML_PX;       // 21 px
const TUBE_H        = 50 * ML_PX;                  // 350 px (0–50 mL section)
const TUBE_H_TOTAL  = ABOVE_ZERO_PX + TUBE_H;      // 371 px (full tube)
const MAX_POUR_ML   = 50 + ABOVE_ZERO_ML;          // 53 mL max fill
const ZERO_MARK_Y   = TUBE_Y + ABOVE_ZERO_PX;      // 31 — y of 0.00 mL line
const TUBE_BOTTOM_Y = TUBE_Y + TUBE_H_TOTAL;       // 381 — y of 50.00 mL line
const TAP_Y         = TUBE_BOTTOM_Y + 2;           // 383
const CAP_Y         = TAP_Y + 13;                  // 396 — top of capillary
const CAP_H         = 32;
const TIP_Y         = CAP_Y + CAP_H;               // 428
const SVG_H         = TIP_Y + 22;                  // 450
const SVG_W         = 110;

// ── Meniscus reading correction ───────────────────────────────────────────────
// Students read the BOTTOM of the concave meniscus, which sits slightly below
// the liquid–glass contact line.  This correction converts the raw level-based
// reading (top of meniscus) to the bottom-of-meniscus reading.
const MENISCUS_SAG_ML  = 0.10;   // mL below the glass-wall contact line
const MENISCUS_SAG_PX  = MENISCUS_SAG_ML * ML_PX;   // 0.7 px in main SVG

// ── Pour rate ─────────────────────────────────────────────────────────────────
const POUR_TICK_MS     = 50;
const POUR_ML_PER_TICK = 0.5;   // 10 mL/s

export class BuretteStage extends Stage {
  /** @type {boolean} */     #filled          = false;
  /** @type {boolean} */     #tipFilled       = false;  // true after first tap use
  /** @type {boolean} */     #funnelRemoved   = false;  // true once student explicitly removes funnel
  /** @type {number}  */     #pourLevel       = 0;
  /** @type {number}  */     #pourStartLevel  = 0;
  /** @type {number|null} */ #fillTimer       = null;

  constructor(deps) {
    super('burette', 'Fill Burette', deps);
  }

  // ── Programmatic API ──────────────────────────────────────────────────────

  /** Fill to an exact volume (defaults to full capacity). */
  fill(volumeML = null) {
    const { titrant, titrantConc } = this._state;
    if (!titrant) throw new Error('BuretteStage.fill(): no titrant set in labState');
    this._burette.fill(titrant, titrantConc ?? 0.1, volumeML);
    this.#filled = true;
  }

  removeFunnel() { this._burette.removeFunnel(); }
  expelBubble()  { this._burette.expelBubble(); }
  recordInitial(){ this._burette.recordInitial(); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
    this._state.funnelRemovedBeforeTitration = false;
  }

  /** Reset so student must re-fill the burette for a new run. */
  resetForNewRun() {
    this._stopPour();
    this.#filled        = false;
    this.#tipFilled     = false;
    this.#funnelRemoved = false;
    this._burette.reset();
    this._state.studentInitialReading = undefined;
    this._resetComplete();
  }

  exit() {
    this._stopPour();
    const { titrant, titrantConc } = this._state;
    if (titrant) this._flask.setTitrant(titrant, titrantConc ?? 0.1);
    this._cleanupBus();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** y-coordinate of meniscus for a given level (mL remaining). */
  _menY(level) {
    return TUBE_Y + (MAX_POUR_ML - level) * ML_PX;
  }

  _refresh() {
    if (this.#fillTimer) return;
    const anim = document.getElementById('anim-content');
    if (anim) this.renderArea(anim);
    const ctrl = document.getElementById('stage-controls');
    if (ctrl) this.renderControls(ctrl);
    this._bus.emit('stageAreaUpdated', { stageId: this.id });
  }

  // ── Pour animation ────────────────────────────────────────────────────────

  _startPour() {
    if (this.#fillTimer) return;
    if (this._burette.level >= MAX_POUR_ML) return;

    // Show funnel above burette while pouring
    const placeholder = document.getElementById('bur-funnel-placeholder');
    if (placeholder) {
      placeholder.style.lineHeight = '0';
      placeholder.innerHTML = `
        <svg width="136" height="65" viewBox="0 0 80 38">
          <path d="M14,4 L66,4 L50,34 L30,34 Z"
            fill="rgba(180,220,255,0.12)" stroke="rgba(180,220,255,0.50)"
            stroke-width="1.5"/>
        </svg>`;
    }

    this.#pourStartLevel = this.#filled ? this._burette.level : 0;
    this.#pourLevel      = this.#pourStartLevel;

    this.#fillTimer = setInterval(() => {
      this.#pourLevel = Math.min(MAX_POUR_ML, this.#pourLevel + POUR_ML_PER_TICK);
      this._updatePourVisual(this.#pourLevel);
      if (this.#pourLevel >= MAX_POUR_ML) this._stopPour();
    }, POUR_TICK_MS);
  }

  _stopPour() {
    if (!this.#fillTimer) return;
    clearInterval(this.#fillTimer);
    this.#fillTimer = null;

    const finalLevel = this.#pourLevel;
    const addedML    = finalLevel - this.#pourStartLevel;
    this.#pourLevel  = 0;

    if (addedML < 0.4) { this._refresh(); return; }

    if (!this.#filled) {
      this.fill(finalLevel);
      if (this.#funnelRemoved) this._burette.removeFunnel();
      this._bus.emit('logAction', {
        action: 'Burette filled',
        detail: `${finalLevel.toFixed(2)} mL of ${this._state.titrant?.formula ?? 'titrant'} added via funnel`,
      });
    } else {
      this._burette.addVolume(addedML);
      this._bus.emit('logAction', {
        action: 'Burette topped up',
        detail: `${addedML.toFixed(2)} mL added — now ${this._burette.level.toFixed(2)} mL remaining`,
      });
    }
    this._refresh();
  }

  /**
   * Directly update SVG liquid elements during pour (avoids full innerHTML re-render).
   * During a fill, liquid rises from the tube bottom upward:
   *   pourLevel=0  → menY=TUBE_BOTTOM_Y  (empty, surface at bottom)
   *   pourLevel=50 → menY=ZERO_MARK_Y    (at 0 graduation line)
   *   pourLevel=53 → menY=TUBE_Y         (fully above the 0 mark)
   */
  _updatePourVisual(pourLevel) {
    const menY  = this._menY(pourLevel);
    const liqH  = Math.max(0, TUBE_BOTTOM_Y - menY);
    const vis        = pourLevel > 0.3;
    const aboveZero  = pourLevel > 50;

    const set = (id, attrs) => {
      const el = document.getElementById(id);
      if (!el) return;
      for (const [k, v] of Object.entries(attrs))
        k === 'text' ? (el.textContent = v) : el.setAttribute(k, v);
    };

    set('bur-liquid', {
      y:       menY.toFixed(1),
      height:  liqH.toFixed(1),
      opacity: vis ? '0.48' : '0',
    });
    set('bur-meniscus', {
      d: `M${TUBE_X + 1},${menY.toFixed(1)} Q${TUBE_X + TUBE_W / 2},${(menY + 3.5).toFixed(1)} ${TUBE_X + TUBE_W - 1},${menY.toFixed(1)}`,
      opacity: vis ? '0.9' : '0',
    });

    const lvl = document.getElementById('bur-level-text');
    if (lvl) {
      if (vis) {
        lvl.textContent = aboveZero
          ? `⚠ ${pourLevel.toFixed(2)} mL — above 0 mark`
          : `${pourLevel.toFixed(2)} mL remaining`;
        lvl.style.color = aboveZero ? 'var(--warning)' : 'var(--accent2)';
      } else {
        lvl.textContent = '';
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  renderArea(el) {
    const b         = this._burette;
    const liqCol    = this._state.titrant?.dot ?? 'rgba(92,184,255,0.55)';
    const formula   = this._state.titrant?.formula ?? '?';
    const concStr   = (this._state.titrantConc ?? 0.1).toFixed(4);
    const level      = b.level;
    const menY      = this._menY(level);
    const liqH      = Math.max(0, TUBE_BOTTOM_Y - menY);
    const aboveZero = level > 50;
    const bottleFull = b.level >= MAX_POUR_ML;

    const capFill   = this.#tipFilled
      ? `${liqCol.replace(/[\d.]+\)$/, '0.55)')}`
      : 'rgba(180,220,255,0.12)';
    const capStroke = this.#tipFilled
      ? liqCol.replace(/[\d.]+\)$/, '0.70)')
      : 'rgba(180,220,255,0.22)';

    el.innerHTML = `
      <div style="display:flex;height:100%;overflow:auto;
                  padding:12px 8px 12px 16px;gap:20px;align-items:center;">

        <!-- ── Left panel: reagent bottle ── -->
        <div id="bur-bottle"
             title="Hold to pour into burette"
             style="display:flex;flex-direction:column;align-items:center;gap:6px;
                    min-width:150px;user-select:none;padding-top:28px;
                    ${bottleFull
                      ? 'opacity:0.32;pointer-events:none;'
                      : !this.#filled
                        ? 'cursor:pointer;animation:funnelPulse 2s ease-in-out infinite;'
                        : 'cursor:pointer;opacity:0.82;'}">
          <svg width="109" height="163" viewBox="0 0 64 96">
            <defs>
              <clipPath id="btl-clip">
                <path d="M24,0 L24,16 Q8,22 7,38 L7,84 Q7,92 16,92 L48,92 Q57,92 57,84 L57,38 Q56,22 40,16 L40,0 Z"/>
              </clipPath>
            </defs>
            <path d="M24,0 L24,16 Q8,22 7,38 L7,84 Q7,92 16,92 L48,92 Q57,92 57,84 L57,38 Q56,22 40,16 L40,0 Z"
              fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.32)" stroke-width="1.5"/>
            <rect x="0" y="${this.#filled ? 76 : 36}" width="64"
                  height="${this.#filled ? 20 : 60}"
              clip-path="url(#btl-clip)" fill="${liqCol}"
              opacity="${this.#filled ? '0.20' : '0.48'}"/>
            <rect x="11" y="44" width="42" height="28" rx="2"
              fill="rgba(255,255,255,0.04)" stroke="rgba(180,220,255,0.18)" stroke-width="1"/>
            <text x="32" y="57" font-size="8.5" fill="var(--text)" text-anchor="middle"
                  font-family="monospace" font-weight="600">${formula}</text>
            <text x="32" y="68" font-size="6.5" fill="var(--muted)"
                  text-anchor="middle">${concStr} M</text>
          </svg>
          <div style="font-size:9px;color:var(--muted);text-align:center;">
            ${this._state.titrant?.name ?? 'Titrant'}
          </div>
          ${!bottleFull
            ? `<div style="font-size:8px;color:var(--accent);text-align:center;">▲ hold to pour</div>`
            : `<div style="font-size:8px;color:var(--muted);text-align:center;">burette full</div>`}
        </div>

        <!-- ── Right panel: burette ── -->
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;">

          <!-- Funnel (clickable, pulsing glow — no explicit reminder text) -->
          ${b.hasFunnel ? `
          <div id="bur-funnel" class="funnel-remove" title="Remove funnel"
               style="line-height:0;">
            <svg width="136" height="65" viewBox="0 0 80 38">
              <path d="M14,4 L66,4 L50,34 L30,34 Z"
                fill="rgba(180,220,255,0.12)" stroke="rgba(180,220,255,0.50)"
                stroke-width="1.5"/>
            </svg>
          </div>
          ` : `<div id="bur-funnel-placeholder" style="height:65px;"></div>`}

          <svg width="${Math.round(SVG_W*1.7)}" height="${Math.round(SVG_H*1.7)}" viewBox="0 0 ${SVG_W} ${SVG_H}"
               style="overflow:visible;">
            <defs>
              <clipPath id="bur-liq-clip">
                <rect x="${TUBE_X + 1}" y="${TUBE_Y}"
                      width="${TUBE_W - 2}" height="${TUBE_H_TOTAL}"/>
              </clipPath>
            </defs>

            <!-- Above-0-mark zone: faint amber tint to signal non-scale region -->
            <rect x="${TUBE_X}" y="${TUBE_Y}" width="${TUBE_W}" height="${ABOVE_ZERO_PX}"
              fill="rgba(255,200,50,0.05)" stroke="none"/>
            <text x="${TUBE_X + TUBE_W + 4}" y="${TUBE_Y + 9}"
              font-size="6" fill="var(--warning)" opacity="0.55" font-family="monospace">↑ above</text>
            <text x="${TUBE_X + TUBE_W + 4}" y="${TUBE_Y + 17}"
              font-size="6" fill="var(--warning)" opacity="0.55" font-family="monospace">0 mark</text>

            <!-- Glass tube (full height including above-0 section) -->
            <rect x="${TUBE_X}" y="${TUBE_Y}" width="${TUBE_W}" height="${TUBE_H_TOTAL}"
              fill="rgba(180,220,255,0.05)" stroke="rgba(180,220,255,0.28)"
              stroke-width="1.2" rx="1"/>

            <!-- Liquid fill -->
            <rect id="bur-liquid"
              x="${TUBE_X + 1}"
              y="${this.#filled ? menY.toFixed(1) : TUBE_BOTTOM_Y}"
              width="${TUBE_W - 2}"
              height="${this.#filled ? liqH.toFixed(1) : '0'}"
              fill="${liqCol}" opacity="${this.#filled ? '0.48' : '0'}"
              clip-path="url(#bur-liq-clip)"/>

            <!-- Meniscus curve -->
            <path id="bur-meniscus"
              d="M${TUBE_X + 1},${this.#filled ? menY.toFixed(1) : TUBE_BOTTOM_Y + 10}
                 Q${TUBE_X + TUBE_W / 2},${this.#filled ? (menY + 3.5).toFixed(1) : TUBE_BOTTOM_Y + 14}
                 ${TUBE_X + TUBE_W - 1},${this.#filled ? menY.toFixed(1) : TUBE_BOTTOM_Y + 10}"
              fill="none" stroke="${liqCol}" stroke-width="1.8"
              opacity="${this.#filled ? '0.9' : '0'}"/>

            <!-- Graduation marks (0 = top of scale, 50 = bottom) -->
            ${this._buildGradMarks()}


            <!-- Tap -->
            <g id="bur-tap"
               title="${this.#filled ? 'Open tap' : 'Fill burette first'}"
               style="cursor:${this.#filled ? 'pointer' : 'not-allowed'};">
              <!-- Tap body (horizontal) -->
              <rect x="${TUBE_X - 12}" y="${TAP_Y}"
                    width="${TUBE_W + 24}" height="11"
                fill="rgba(180,220,255,${this.#filled ? '0.22' : '0.07'})"
                stroke="rgba(180,220,255,${this.#filled ? '0.52' : '0.18'})"
                stroke-width="1.2" rx="3"/>
              <!-- Tap handle (vertical, overlapping body) -->
              <rect x="${TUBE_X + TUBE_W / 2 - 2.5}" y="${TUBE_BOTTOM_Y - 3}"
                    width="5" height="19"
                fill="rgba(180,220,255,${this.#filled ? '0.40' : '0.12'})"
                stroke="rgba(180,220,255,${this.#filled ? '0.55' : '0.20'})"
                stroke-width="1" rx="2"/>
            </g>

            <!-- Lower capillary -->
            <rect x="${TUBE_X + TUBE_W / 2 - 2}" y="${CAP_Y}"
                  width="4" height="${CAP_H}"
              fill="${capFill}" stroke="${capStroke}" stroke-width="1"/>

            <!-- Tip -->
            <path d="M${TUBE_X + TUBE_W / 2 - 2},${TIP_Y}
                     L${TUBE_X + TUBE_W / 2},${TIP_Y + 15}
                     L${TUBE_X + TUBE_W / 2 + 2},${TIP_Y} Z"
              fill="${capFill}" stroke="${capStroke}" stroke-width="1"/>
          </svg>

          <div style="font-size:10px;color:var(--muted);margin-top:2px;">50 mL burette</div>
          <div id="bur-level-text"
               style="font-size:10px;color:${aboveZero && this.#filled ? 'var(--warning)' : 'var(--accent2)'};
                      margin-top:1px;min-height:14px;">
            ${this.#filled
              ? aboveZero
                ? `⚠ ${level.toFixed(2)} mL — above 0 mark`
                : `${level.toFixed(2)} mL remaining`
              : ''}
          </div>
        </div>

      </div>`;

    this._bindAreaEvents(el);
    this._appendIndicatorBottle(el);
  }

  _appendIndicatorBottle(el) {
    if (!this._state.indicator) return;
    const indCol = this._state.indicator.acidCol ?? 'rgba(180,220,255,0.45)';
    el.style.position = 'relative';
    const indEl = document.createElement('div');
    indEl.id = 'ind-bottle';
    indEl.style.cssText = [
      'position:absolute', 'right:20px', 'bottom:20px',
      'cursor:grab', 'user-select:none',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:4px',
      'animation:funnelPulse 2s ease-in-out infinite',
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
    this._bindIndicatorDrag(indEl);
  }

  _bindIndicatorDrag(bottle) {
    let dragging = false;
    let ghost    = null;
    let startX   = 0;
    let startY   = 0;

    bottle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      startX   = e.clientX;
      startY   = e.clientY;
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
    });

    bottle.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      bottle.style.opacity   = '';
      bottle.style.animation = '';
      if (ghost) { ghost.remove(); ghost = null; }

      // Only log if the student dragged meaningfully (not an accidental touch)
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 12) {
        this._bus.emit('logAction', {
          action: '⚠ Indicator dropped during burette filling — error',
          detail: `${this._state.indicator?.name ?? 'Indicator'} should be added to the conical flask, not during the burette filling stage.`,
          level: 'warn',
        });
      }
    });
  }

  _buildGradMarks() {
    const xR    = TUBE_X + TUBE_W; // 62 — right edge of tube
    const marks = [];
    for (let i = 0; i <= 50; i++) {
      const y      = ZERO_MARK_Y + i * ML_PX;   // reading i at this y
      const isZero = i === 0;
      const maj    = i % 10 === 0;
      const mid    = i % 5  === 0;
      const len    = maj ? 11 : mid ? 7 : 4;
      const sw     = isZero ? '2.2' : maj ? '1.2' : '0.8';
      const col    = isZero
        ? 'var(--accent)'
        : `rgba(180,220,255,${maj ? '0.55' : mid ? '0.38' : '0.22'})`;
      // 0 mark: full-width line crossing the tube for emphasis
      if (isZero) {
        marks.push(
          `<line x1="${TUBE_X - 3}" y1="${y}" x2="${xR + len}" y2="${y}"
             stroke="${col}" stroke-width="${sw}"/>`,
          `<text x="${xR + 13}" y="${y + 3.5}"
             font-size="7.5" fill="var(--accent)" font-family="monospace"
             font-weight="600">0</text>`
        );
      } else {
        marks.push(
          `<line x1="${xR}" y1="${y.toFixed(1)}" x2="${xR + len}" y2="${y.toFixed(1)}"
             stroke="${col}" stroke-width="${sw}"/>`,
          maj
            ? `<text x="${xR + 13}" y="${(y + 3).toFixed(1)}"
                 font-size="7.5" fill="var(--muted)" font-family="monospace">${i}</text>`
            : ''
        );
      }
    }
    return marks.join('\n');
  }

  _bindAreaEvents(el) {
    const b = this._burette;

    // Bottle: pointerdown = start pour, pointerup/cancel = stop
    const bottle = el.querySelector('#bur-bottle');
    if (bottle && b.level < MAX_POUR_ML) {
      bottle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        bottle.setPointerCapture(e.pointerId);
        this._startPour();
      });
      bottle.addEventListener('pointerup',     () => this._stopPour());
      bottle.addEventListener('pointercancel', () => this._stopPour());
    }

    // Funnel: click to remove; log contamination error if above 0 mark
    el.querySelector('#bur-funnel')?.addEventListener('click', () => {
      const levelBefore = b.level;
      this.#funnelRemoved = true;
      this._state.funnelRemovedBeforeTitration = true;
      this.removeFunnel();
      if (levelBefore > 50) {
        const drip = 0.01 + Math.random() * 0.04;  // 0.01–0.05 mL
        this._burette.addVolume(drip);
        this._bus.emit('logAction', {
          action: 'Funnel removed — contamination error',
          detail: `Burette was ${levelBefore.toFixed(2)} mL (above 0 mark) when funnel was removed. ` +
                  `Funnel residue (~${drip.toFixed(2)} mL) may have dripped in, raising level above 0.00 mL.`,
        });
      } else {
        this._bus.emit('logAction', { action: 'Funnel removed' });
      }
      this._refresh();
    });

    // Tap: click to dispense; first use fills the capillary/tip
    const tapEl = el.querySelector('#bur-tap');
    if (tapEl && this.#filled) {
      tapEl.addEventListener('click', () => {
        this.#tipFilled = true;  // capillary/tip now shows liquid colour
        if (b.hasBubble) {
          this.expelBubble();
          this._bus.emit('logAction', {
            action: 'Air bubble expelled',
            detail: '~3 mL run off to waste',
          });
        } else {
          this._burette.addDrop(0.5);
          const nowReading = ((b.capacity || 50) - b.level).toFixed(2);
          this._bus.emit('logAction', {
            action: 'Tap opened',
            detail: `0.50 mL dispensed (reading now ${nowReading} mL)`,
          });
        }
        this._refresh();
      });
    }
  }

  renderControls(el) {
    this.validate(); // side-effect: sets isComplete → UIRenderer shows "Start Titrating →"
    const b = this._burette;
    el.innerHTML = '';

    if (!this.#filled) {
      el.innerHTML = `<span style="color:var(--muted);font-size:11px;">
        Hold the reagent bottle to pour titrant into the burette.</span>`;
    } else if (b.initialReading === null) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = '📏 Record initial reading';
      btn.addEventListener('click', () => this._showReadingModal());
      el.appendChild(btn);
    } else {
      const displayInit = (this._state.studentInitialReading ?? b.initialReading ?? 0).toFixed(2);
      el.innerHTML = `<span style="color:var(--accent3);font-size:12px;">
        ✓ Initial reading: ${displayInit} mL — ready to titrate.</span>`;
    }
  }

  // ── Reading modal ─────────────────────────────────────────────────────────

  _showReadingModal() {
    const b      = this._burette;
    // actual = bottom-of-meniscus reading (what the student physically reads)
    const actual = ((b.capacity || 50) - b.level) + MENISCUS_SAG_ML;
    const liqCol = this._state.titrant?.dot ?? 'rgba(92,184,255,0.6)';

    const modal = document.getElementById('reading-modal');
    if (!modal) return;

    document.getElementById('reading-title').textContent    = 'Initial Burette Reading';
    document.getElementById('reading-subtitle').textContent = 'Read the bottom of the meniscus. Burette readings are to the nearest 0.05 mL.';
    document.getElementById('reading-hint').textContent     = 'Readings increase downward: 0.00 is at the top of the scale.';
    document.getElementById('reading-feedback').textContent = '';

    const input       = document.getElementById('reading-input');
    input.value       = '';
    input.placeholder = 'e.g. 0.00';
    // Round to nearest 0.05 mL on blur
    input.onchange = () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) input.value = (Math.round(v / 0.05) * 0.05).toFixed(2);
    };

    // Zoom: 3.5 mL window centred on the actual reading (handle negative readings)
    // Width/height scaled 20 % larger than the original 100×130 base.
    const lo   = Math.max(-3,  Math.floor(actual * 2) / 2 - 1.5);
    const hi   = Math.min(50,  lo + 3.5);
    const zW   = 120;
    const zH   = 156;
    const pxML = zH / (hi - lo);
    // mYz = y-position of the BOTTOM of the meniscus in the zoom view
    const mYz    = (actual - lo) * pxML;
    // sagPx = depth of the meniscus curve in the zoom view (matches MENISCUS_SAG_ML)
    const sagPx  = MENISCUS_SAG_ML * pxML;

    // 0.1 mL increments — 10 divisions per cm³, matching a real burette.
    // Use integer tenths to avoid floating-point drift.
    const zMarks = [];
    const startTenth = Math.ceil(lo * 10);
    const endTenth   = Math.floor(hi * 10);
    for (let i = startTenth; i <= endTenth; i++) {
      const v    = i / 10;
      if (v < 0) continue;   // burette scale starts at 0.00 — no marks above zero
      const y    = (v - lo) * pxML;
      const isMaj = i % 10 === 0;   // whole mL
      const isMid = i % 5  === 0;   // 0.5 mL
      const isZ  = i === 0;
      const x2   = isMaj ? 58 : isMid ? 52 : 46;
      const sw   = isZ ? '1.8' : isMaj ? '1.2' : isMid ? '0.9' : '0.6';
      const col  = isZ
        ? 'var(--accent)'
        : `rgba(180,220,255,${isMaj ? '0.65' : isMid ? '0.45' : '0.28'})`;
      zMarks.push(
        `<line x1="26" y1="${y.toFixed(1)}" x2="${x2}" y2="${y.toFixed(1)}"
           stroke="${col}" stroke-width="${sw}"/>`,
        isMaj
          ? `<text x="61" y="${(y + 4).toFixed(1)}"
               font-size="10" fill="${isZ ? 'var(--accent)' : 'var(--text)'}"
               font-family="monospace">${v.toFixed(1)}</text>`
          : ''
      );
    }

    document.getElementById('reading-zoom').innerHTML = `
      <svg width="200" height="260" viewBox="0 0 ${zW} ${zH}"
           style="background:rgba(0,0,0,0.15);border-radius:4px;">
        <rect x="26" y="0" width="14" height="${zH}"
          fill="rgba(180,220,255,0.06)" stroke="rgba(180,220,255,0.25)" stroke-width="1"/>
        <!-- Liquid fills from top-of-meniscus (mYz - sagPx) downward -->
        <rect x="27" y="${(mYz - sagPx).toFixed(1)}" width="12" height="${zH}"
          fill="${liqCol}" opacity="0.42"/>
        <!-- Meniscus curve: walls at top, centre at bottom (mYz) -->
        <path d="M27,${(mYz - sagPx).toFixed(1)} Q33,${mYz.toFixed(1)} 39,${(mYz - sagPx).toFixed(1)}"
          fill="none" stroke="${liqCol}" stroke-width="2" opacity="0.9"/>
        ${zMarks.join('\n')}
      </svg>`;

    // Replace submit button to clear stale listeners
    const oldBtn = document.getElementById('reading-submit');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      const raw     = parseFloat(document.getElementById('reading-input').value);
      const fb      = document.getElementById('reading-feedback');
      if (isNaN(raw) || raw < -3 || raw > 50) {
        fb.style.color = 'var(--danger)';
        fb.textContent = 'Enter a valid reading between −3.00 and 50.00 mL.';
        return;
      }
      const entered = Math.round(raw / 0.05) * 0.05;   // enforce 0.05 mL precision
      modal.classList.add('hidden');
      this.recordInitial();
      // Store student's entered reading for display (not the computer's exact value)
      this._state.studentInitialReading = entered;
      if (b.hasBubble) {
        this._bus.emit('logAction', {
          action: '⚠ Air bubble present at initial reading',
          detail: 'Initial reading was recorded while an air bubble remained in the burette tip. Titration results may be inaccurate.',
          level: 'warn',
        });
      }
      const readingError = Math.abs(entered - actual) > 0.10;
      this._bus.emit('logAction', {
        action: readingError ? '⚠ Initial reading — possible error' : 'Initial reading',
        detail: readingError
          ? `Student recorded ${entered.toFixed(2)} mL; actual reading was ${actual.toFixed(2)} mL (bottom of meniscus). Difference: ${Math.abs(entered - actual).toFixed(2)} mL.`
          : `${entered.toFixed(2)} mL recorded`,
        level: readingError ? 'warn' : 'action',
      });
      this._refresh();
    });

    modal.classList.remove('hidden');
    input.focus();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    if (!this.#filled)                         return { ok: false, reason: 'Fill the burette with titrant.' };
    if (this._burette.initialReading === null) return { ok: false, reason: 'Record the initial burette reading.' };
    this._markComplete();
    return { ok: true, reason: '' };
  }
}
