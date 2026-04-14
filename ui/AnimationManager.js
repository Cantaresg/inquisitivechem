/**
 * ui/AnimationManager.js
 * Central registry for all visual animations played on vessel cards.
 *
 * BUG-17: per-vessel boolean lock during test animations — subsequent test
 *         drags onto a locked vessel are rejected by TestBarUI.
 * TRAP-05: golden rain polygon cap — never exceeds MAX_RAIN_POLYGONS.
 */

/** Maximum SVG polygons for golden rain (TRAP-05). */
const MAX_RAIN_POLYGONS = 50;

export class AnimationManager {
  constructor() {
    /**
     * animId → function(vesselEl: HTMLElement, params: Object) → Promise<void>
     * @type {Map<string, function(HTMLElement, Object): Promise<void>>}
     */
    this._registry = new Map();

    /**
     * Set of vessel ids whose test animation is currently running (BUG-17).
     * @type {Set<string>}
     */
    this._testLocks = new Set();

    this._registerAll();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Play the animation identified by animId on the given vessel element.
   * Unknown animIds are silently ignored (returns resolved promise).
   *
   * @param {string} animId
   * @param {HTMLElement} vesselEl  — the .vessel-card DOM element
   * @param {Object} [params]       — optional parameters forwarded to animation fn
   *   params.colorTo      {string|null}  — CSS colour for redox/colour-fade
   *   params.pptColor     {string|null}  — CSS colour for precipitate particles
   *   params.flameColour  {string|null}  — CSS colour for flame test overlay (BUG-15)
   *   params.phColour     {string|null}  — CSS colour for indicator overlay
   * @returns {Promise<void>}
   */
  play(animId, vesselEl, params = {}) {
    if (!animId) return Promise.resolve();
    const fn = this._registry.get(animId);
    if (!fn) {
      console.warn(`AnimationManager: unknown animId "${animId}"`);
      return Promise.resolve();
    }
    return fn.call(this, vesselEl, params);
  }

  /**
   * Fire all animation ids from a ReactionEvent array simultaneously on one vessel.
   * Does NOT await between calls — all start in the same microtask.
   *
   * @param {import('../engine/ReactionEngine.js').ReactionEvent[]} events
   * @param {HTMLElement} vesselEl
   */
  playAll(events, vesselEl) {
    for (const ev of events) {
      if (!ev.animId) continue;
      this.play(ev.animId, vesselEl, {
        colorTo:     ev.colorChange?.to    ?? null,
        pptColor:    ev.pptAdded?.color    ?? null,
        flameColour: ev.flameColour        ?? null,
        phColour:    ev.phColour           ?? null,
      });
    }
  }

  /**
   * Returns true if a test animation is currently running for vesselId (BUG-17).
   * @param {string} vesselId
   * @returns {boolean}
   */
  isTestLocked(vesselId) {
    return this._testLocks.has(vesselId);
  }

  /**
   * Acquire or release the test animation lock for a vessel.
   * Called internally by test animation helpers.
   * @param {string} vesselId
   * @param {boolean} locked
   */
  setTestLock(vesselId, locked) {
    if (locked) {
      this._testLocks.add(vesselId);
    } else {
      this._testLocks.delete(vesselId);
    }
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  _registerAll() {
    // Reaction animations
    this._registry.set('anim_bubbles',        (v, p) => this._animBubbles(v, p));
    this._registry.set('anim_precipitate',    (v, p) => this._animPrecipitate(v, p));
    this._registry.set('anim_color_fade',     (v, p) => this._animColorFade(v, p));
    this._registry.set('anim_solid_dissolve', (v, p) => this._animSolidDissolve(v, p));
    this._registry.set('anim_golden_rain',    (v, p) => this._animGoldenRain(v, p));

    // Gas tests
    this._registry.set('anim_squeaky_pop',               (v, p) => this._animSqueakyPop(v, p));
    this._registry.set('anim_splint_extinguish',          (v, p) => this._animSplintExtinguish(v, p));
    this._registry.set('anim_splint_relight',             (v, p) => this._animSplintRelight(v, p));
    this._registry.set('anim_glowing_splint_extinguish',  (v, p) => this._animGlowingSplintExtinguish(v, p));
    this._registry.set('anim_limewater_milky',            (v, p) => this._animLimewaterMilky(v, p));
    this._registry.set('anim_limewater_clear',            (v, p) => this._animLimewaterClear(v, p));
    this._registry.set('anim_litmus_blue',                (v, p) => this._animLitmusBlue(v, p));
    this._registry.set('anim_litmus_red',                 (v, p) => this._animLitmusRed(v, p));
    this._registry.set('anim_litmus_unchanged',           (v, p) => this._animLitmusUnchanged(v, p));
    this._registry.set('anim_flame_colour',               (v, p) => this._animFlameColour(v, p));
    this._registry.set('anim_flame_no_colour',            (v, p) => this._animFlameNoColour(v, p));
    this._registry.set('anim_ion_ppt_white',              (v, p) => this._animIonPptWhite(v, p));
    this._registry.set('anim_ion_ppt_cream',              (v, p) => this._animIonPptCream(v, p));
    this._registry.set('anim_ion_ppt_yellow',             (v, p) => this._animIonPptYellow(v, p));
    this._registry.set('anim_drops_no_change',            (v, p) => this._animDropsNoChange(v, p));
    this._registry.set('anim_indicator_colour',           (v, p) => this._animIndicatorColour(v, p));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Returns the .vessel-liquid child element of vesselEl, or null.
   * @private
   */
  static _liquidEl(vesselEl) {
    return vesselEl.querySelector('.vessel-liquid');
  }

  /**
   * Helper for test overlays: creates a full-size overlay, acquires test lock,
   * plays a CSS animation and resolves after duration + cleanup.
   * @private
   */
  _testOverlay(vesselEl, animName, bgColor, duration) {
    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute; inset: 0;
      pointer-events: none; z-index: 12;
      background: ${bgColor};
      animation: ${animName} ${duration}ms ease forwards;
    `;
    vesselEl.appendChild(overlay);

    return new Promise(resolve => {
      setTimeout(() => {
        overlay.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, duration);
    });
  }

  // ─── Reaction animation implementations ───────────────────────────────────

  /**
   * Bubble column for gas evolution.
   * Uses SVG + internal clipPath so rising bubbles don't escape the flask's
   * clip-path polygon via compositor-layer promotion.
   * @private
   */
  _animBubbles(vesselEl, _params) {
    const DURATION = 3200;
    const COUNT    = 10;
    const SPACING  = 280;
    const svgNS    = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 9;
    `;
    svg.setAttribute('overflow', 'hidden');

    const bounds = vesselEl.getBoundingClientRect();
    const W = bounds.width  || 120;
    const H = bounds.height || 180;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const clipId = `bb-clip-${Math.random().toString(36).slice(2)}`;
    const defs   = document.createElementNS(svgNS, 'defs');
    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS(svgNS, 'rect');
    clipRect.setAttribute('x', '0'); clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', String(W)); clipRect.setAttribute('height', String(H));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('clip-path', `url(#${clipId})`);

    // Bubbles start near the bottom of the liquid and rise upward
    const liquidBottom = H * 0.96;
    for (let i = 0; i < COUNT; i++) {
      const circle = document.createElementNS(svgNS, 'circle');
      const r    = 1.5 + Math.random() * 2;
      const dur  = DURATION - i * 60;
      circle.setAttribute('cx', String(W * (0.12 + Math.random() * 0.76)));
      circle.setAttribute('cy', String(liquidBottom - Math.random() * H * 0.18));
      circle.setAttribute('r',  String(r));
      circle.setAttribute('fill', 'rgba(255,255,255,0.50)');
      circle.style.animation = `bubbleRise ${dur}ms ease-out ${i * SPACING}ms forwards`;
      g.appendChild(circle);
    }

    svg.appendChild(g);
    vesselEl.appendChild(svg);

    const total = DURATION + COUNT * SPACING + 150;
    return new Promise(resolve => {
      setTimeout(() => { svg.remove(); resolve(); }, total);
    });
  }

  /**
   * Precipitate particles falling through the solution.
   * Uses SVG + internal clipPath to prevent compositor-layer escape from the
   * parent's clip-path polygon (same technique as _animGoldenRain).
   * @private
   */
  _animPrecipitate(vesselEl, params) {
    const DURATION = 1400;
    const color    = params.pptColor ?? 'rgba(200,200,200,0.85)';
    const COUNT    = 14;
    const svgNS    = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 11;
    `;
    svg.setAttribute('overflow', 'hidden');

    const bounds = vesselEl.getBoundingClientRect();
    const W = bounds.width  || 120;
    const H = bounds.height || 180;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    // SVG-internal clipPath guarantees particles stay within the vessel viewport
    const clipId = `pp-clip-${Math.random().toString(36).slice(2)}`;
    const defs   = document.createElementNS(svgNS, 'defs');
    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS(svgNS, 'rect');
    clipRect.setAttribute('x', '0'); clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', String(W)); clipRect.setAttribute('height', String(H));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('clip-path', `url(#${clipId})`);

    // Liquid occupies bottom 55 % → top of liquid surface is at SVG y = 0.45 * H.
    // Particles start just below the surface and fall deeper.
    const liquidTop = H * 0.42;
    for (let i = 0; i < COUNT; i++) {
      const r    = document.createElementNS(svgNS, 'rect');
      const size = 3 + Math.random() * 4;
      const sx   = W * (0.15 + Math.random() * 0.68);
      const sy   = liquidTop + Math.random() * (H * 0.22);   // within liquid, not above
      r.setAttribute('x',      String(sx));
      r.setAttribute('y',      String(sy));
      r.setAttribute('width',  String(size));
      r.setAttribute('height', String(size));
      r.setAttribute('rx',     '1');
      r.setAttribute('fill',   color);
      // No will-change — avoids compositor-layer escape from SVG clipPath
      r.style.animation = `precipFall ${DURATION}ms ease-in ${i * 75}ms forwards`;
      g.appendChild(r);
    }

    svg.appendChild(g);
    vesselEl.appendChild(svg);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        resolve();
      }, DURATION + COUNT * 75 + 200);
    });
  }

  /**
   * Quick colour flash on the liquid layer for redox / complexation.
   * If params.colorTo is provided, transitions to that colour.
   * @private
   */
  _animColorFade(vesselEl, params) {
    const liquid = AnimationManager._liquidEl(vesselEl);
    if (!liquid) return Promise.resolve();
    const DURATION = 950;

    if (params.colorTo) {
      liquid.style.transition = `background ${DURATION}ms ease`;
      liquid.style.background = params.colorTo;
    } else {
      liquid.style.animation = `liquidColorFlash ${DURATION}ms ease`;
      const cleanup = () => { liquid.style.animation = ''; };
      liquid.addEventListener('animationend', cleanup, { once: true });
    }
    return new Promise(resolve => setTimeout(resolve, DURATION + 50));
  }

  /**
   * Brief brightness flash when a solid dissolves.
   * @private
   */
  _animSolidDissolve(vesselEl, _params) {
    const liquid = AnimationManager._liquidEl(vesselEl);
    if (!liquid) return Promise.resolve();
    const DURATION = 750;
    liquid.style.animation = `liquidColorFlash ${DURATION}ms ease`;
    liquid.addEventListener('animationend', () => {
      liquid.style.animation = '';
    }, { once: true });
    return new Promise(resolve => setTimeout(resolve, DURATION + 50));
  }

  // ─── Golden rain (TRAP-05) ────────────────────────────────────────────────

  /**
   * Golden rain easter egg — hexagonal SVG flakes falling into the vessel.
   * Polygon count capped at MAX_RAIN_POLYGONS (50). `will-change: transform` on each.
   * All nodes removed from DOM on animation end.
   * @private
   */
  _animGoldenRain(vesselEl, _params) {
    const DURATION = 2400;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 16;
    `;
    // SVG overflow attribute (not just CSS) ensures child polygons are clipped
    // to the viewport even when browser compositor layers bypass CSS overflow.
    svg.setAttribute('overflow', 'hidden');

    const rect = vesselEl.getBoundingClientRect();
    const W = rect.width  || 120;
    const H = rect.height || 180;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    // SVG-internal clipPath guarantees compositing-layer-safe clipping.
    const clipId = `gr-clip-${Math.random().toString(36).slice(2)}`;
    const defs   = document.createElementNS(svgNS, 'defs');
    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS(svgNS, 'rect');
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', String(W));
    clipRect.setAttribute('height', String(H));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    // Group all polygons inside a clipped <g>
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('clip-path', `url(#${clipId})`);

    for (let i = 0; i < MAX_RAIN_POLYGONS; i++) {
      const poly = document.createElementNS(svgNS, 'polygon');
      const cx   = 4 + Math.random() * (W - 8);   // start within bounds
      const cy   = 2 + Math.random() * 12;         // just inside top edge
      const r    = 4 + Math.random() * 6;
      poly.setAttribute('points', _hexPoints(cx, cy, r));
      poly.setAttribute('fill', `hsl(${44 + Math.random() * 14}, 100%, ${52 + Math.random() * 22}%)`);
      // No will-change: transform — avoids compositor-layer escape from clip
      poly.style.animation = `goldenRainFall ${DURATION}ms ease-in ${Math.random() * 700}ms forwards`;
      g.appendChild(poly);
    }

    svg.appendChild(g);
    vesselEl.appendChild(svg);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        resolve();
      }, DURATION + 800);
    });
  }

  // ─── Test animation implementations ──────────────────────────────────────

  /** H₂ burning splint — loud squeaky pop. @private */
  _animSqueakyPop(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'squeakyPop', 'rgba(255,220,50,0.22)', 1700);
  }

  /** Burning splint — extinguished; no squeak. @private */
  _animSplintExtinguish(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'splintOut', 'rgba(80,50,30,0.10)', 1500);
  }

  /** Glowing splint relights in O₂. @private */
  _animSplintRelight(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'splintRelight', 'rgba(255,110,0,0.18)', 1700);
  }

  /** Glowing splint — extinguished. @private */
  _animGlowingSplintExtinguish(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'splintOut', 'rgba(70,50,20,0.10)', 1500);
  }

  /** Limewater goes milky — CO₂ positive. @private */
  _animLimewaterMilky(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'limewaterMilky', 'rgba(200,220,255,0.12)', 1900);
  }

  /** Limewater stays clear — negative. @private */
  _animLimewaterClear(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'limewaterClear', 'rgba(195,215,255,0.09)', 900);
  }

  /** Red litmus turns blue — NH₃ positive. @private */
  _animLitmusBlue(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'litmusToBlue', 'rgba(180,30,30,0.38)', 1500);
  }

  /** Blue litmus turns red — acidic gas positive. @private */
  _animLitmusRed(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'litmusToRed', 'rgba(25,70,220,0.38)', 1500);
  }

  /** Litmus paper unchanged — negative. @private */
  _animLitmusUnchanged(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'litmusUnchanged', 'rgba(0,0,0,0.06)', 900);
  }

  /**
   * Flame test — shows ONLY the flame colour overlay.
   * No text label, no element name (BUG-15).
   * @private
   */
  _animFlameColour(vesselEl, params) {
    // flameColour comes from GasTestEngine → TestBarUI → AnimationManager.play params
    const colour = params.flameColour ?? '#ffcc00';
    return this._testOverlay(vesselEl, 'flameColorShow', colour + '44', 2100);
  }

  /** Flame test — no distinctive colour; negative. @private */
  _animFlameNoColour(vesselEl, _params) {
    return this._testOverlay(vesselEl, 'flamePulse', 'rgba(255,170,70,0.06)', 1200);
  }

  /** AgNO₃ / BaCl₂ drop tests ─── */
  _animIonPptWhite(vesselEl, _params) {
    return this._testPptDrops(vesselEl, 'rgba(240,240,240,0.90)');
  }
  _animIonPptCream(vesselEl, _params) {
    return this._testPptDrops(vesselEl, 'rgba(240,228,196,0.90)');
  }
  _animIonPptYellow(vesselEl, _params) {
    return this._testPptDrops(vesselEl, 'rgba(238,218,60,0.90)');
  }
  _animDropsNoChange(vesselEl, _params) {
    return this._testPptDrops(vesselEl, null);
  }

  /**
   * Ion test drops fall in; optionally small ppt particles form.
   * @private
   */
  _testPptDrops(vesselEl, pptColor) {
    const DURATION = 1500;
    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const trash = [];

    // 5 drop shapes
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.style.cssText = `
        position: absolute; z-index: 14;
        width: 5px; height: 8px;
        border-radius: 0 0 50% 50%;
        background: rgba(170,215,255,0.82);
        left: ${38 + i * 6 + Math.random() * 8}%;
        top: 5px;
        animation: dropsFall 560ms ease-in ${i * 90}ms forwards;
        pointer-events: none;
        opacity: 0;
      `;
      vesselEl.appendChild(d);
      trash.push(d);
    }

    // Ppt particles (only if positive colour given)
    if (pptColor) {
      for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        const sz = 4 + Math.random() * 5;
        p.style.cssText = `
          position: absolute; z-index: 13;
          width: ${sz}px; height: ${sz}px;
          border-radius: 2px;
          background: ${pptColor};
          left: ${16 + Math.random() * 65}%;
          top: ${28 + Math.random() * 32}%;
          animation: testPptForm 950ms ease ${350 + i * 55}ms forwards;
          pointer-events: none;
          opacity: 0;
        `;
        vesselEl.appendChild(p);
        trash.push(p);
      }
    }

    return new Promise(resolve => {
      setTimeout(() => {
        trash.forEach(el => el.remove());
        this.setTestLock(vesselId, false);
        resolve();
      }, DURATION);
    });
  }

  /**
   * Universal indicator — pH colour overlay with reveal animation.
   * No text label (BUG-15 spirit applies here too).
   * @private
   */
  _animIndicatorColour(vesselEl, params) {
    const colour = params.phColour ?? 'rgba(0,180,0,0.55)';
    const colourWithAlpha = colour.startsWith('rgba') ? colour
      : colour.startsWith('#') ? colour + '88'
      : colour;
    return this._testOverlay(vesselEl, 'indicatorColorReveal', colourWithAlpha, 1700);
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

/**
 * Returns SVG polygon points string for a regular hexagon centred at (cx, cy)
 * with circumradius r.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {string}
 */
function _hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}
