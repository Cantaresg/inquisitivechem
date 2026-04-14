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
    this._registry.set('anim_splint_burns',              (v, p) => this._animSplintBurns(v, p));
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

  /**
   * Build a burning-splint SVG scene and append it to containerEl.
   * The SVG coordinate space matches containerEl's bounding rect.
   * tipX/tipY are the flask-mouth coordinates in that space.
   * Returns { svg, flameEls, glowEl, ring }.
   * @private
   */
  _buildSplintScene(containerEl, W, H, tipX, tipY) {
    const svgNS = 'http://www.w3.org/2000/svg';

    // ── Geometry ──────────────────────────────────────────────────────────
    const FH    = Math.min(H * 0.20, 36);       // flame height
    const FW    = FH * 0.42;                    // flame half-width
    const ANGLE = 32 * Math.PI / 180;           // stick tilt
    const SLEN  = Math.min(W * 0.80, 100);      // stick length (extends off right)
    const SHALF = 2.5;                          // stick half-thickness
    const cosA  = Math.cos(ANGLE);
    const sinA  = Math.sin(ANGLE);
    const pDx   = sinA * SHALF;                 // perp offset x
    const pDy   = cosA * SHALF;                 // perp offset y
    // Far end extends to upper-right (eY < tipY because SVG y grows down)
    const eX    = tipX + SLEN * cosA;
    const eY    = tipY - SLEN * sinA;

    // ── SVG ───────────────────────────────────────────────────────────────
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox',             `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('overflow',            'visible');
    svg.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 15;
      animation: splintEnter 0.35s ease forwards;
    `;

    // ── Gaussian blur filter for glow halo ────────────────────────────────
    const gid  = `sg-${Math.random().toString(36).slice(2)}`;
    const defs = document.createElementNS(svgNS, 'defs');
    const filt = document.createElementNS(svgNS, 'filter');
    filt.setAttribute('id', gid);
    filt.setAttribute('x', '-80%');  filt.setAttribute('y', '-80%');
    filt.setAttribute('width', '260%'); filt.setAttribute('height', '260%');
    const blur = document.createElementNS(svgNS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '5');
    filt.appendChild(blur);
    defs.appendChild(filt);
    svg.appendChild(defs);

    // ── Stick body ────────────────────────────────────────────────────────
    const stick = document.createElementNS(svgNS, 'polygon');
    stick.setAttribute('points', [
      `${tipX - pDx},${tipY + pDy}`,
      `${tipX + pDx},${tipY - pDy}`,
      `${eX   + pDx},${eY   - pDy}`,
      `${eX   - pDx},${eY   + pDy}`,
    ].join(' '));
    stick.setAttribute('fill', '#b07830');
    svg.appendChild(stick);

    // Wood grain highlight
    const grain = document.createElementNS(svgNS, 'line');
    grain.setAttribute('x1', String(tipX + 8  * cosA));
    grain.setAttribute('y1', String(tipY - 8  * sinA - pDy * 0.45));
    grain.setAttribute('x2', String(eX   - 6  * cosA));
    grain.setAttribute('y2', String(eY   + 6  * sinA - pDy * 0.45));
    grain.setAttribute('stroke',       'rgba(205,155,65,0.30)');
    grain.setAttribute('stroke-width', '1');
    svg.appendChild(grain);

    // Charred tip — first 8 px of stick from the burning end
    const cLen    = 8;
    const charred = document.createElementNS(svgNS, 'polygon');
    charred.setAttribute('points', [
      `${tipX - pDx},${tipY + pDy}`,
      `${tipX + pDx},${tipY - pDy}`,
      `${tipX + pDx + cLen * cosA},${tipY - pDy - cLen * sinA}`,
      `${tipX - pDx + cLen * cosA},${tipY + pDy - cLen * sinA}`,
    ].join(' '));
    charred.setAttribute('fill', '#1e0e00');
    svg.appendChild(charred);

    // ── Glow halo ─────────────────────────────────────────────────────────
    const glowEl = document.createElementNS(svgNS, 'ellipse');
    glowEl.setAttribute('cx',     String(tipX));
    glowEl.setAttribute('cy',     String(tipY - FH * 0.40));
    glowEl.setAttribute('rx',     String(FW * 2.0));
    glowEl.setAttribute('ry',     String(FH * 0.72));
    glowEl.setAttribute('fill',   'rgba(255,115,0,0.45)');
    glowEl.setAttribute('filter', `url(#${gid})`);
    // Must match the ring: scale from the ellipse's own centre, not the SVG viewport centre.
    glowEl.style.transformBox    = 'fill-box';
    glowEl.style.transformOrigin = '50% 50%';
    svg.appendChild(glowEl);

    // ── Flame layers: outer dark-red → orange → yellow → near-white core ──
    // Teardrop helper: base at (cx, cy), tip at (cx, cy-h)
    function td(cx, cy, w, h) {
      return [
        `M${cx},${cy}`,
        `C${cx + w},${cy - h * 0.20} ${cx + w * 0.62},${cy - h * 0.76} ${cx},${cy - h}`,
        `C${cx - w * 0.62},${cy - h * 0.76} ${cx - w},${cy - h * 0.20} ${cx},${cy}`,
        'Z',
      ].join(' ');
    }

    const flameLayers = [
      [FW * 1.00, FH * 1.00,          0, 'rgba(165,30,0,0.82)' ],
      [FW * 0.72, FH * 0.85, -FH * 0.05, 'rgba(255,75,0,0.88)' ],
      [FW * 0.46, FH * 0.65, -FH * 0.10, 'rgba(255,170,10,0.93)'],
      [FW * 0.25, FH * 0.42, -FH * 0.16, 'rgba(255,248,185,0.97)'],
    ];

    const flameEls = flameLayers.map(([w, h, yo, fill], i) => {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', td(tipX, tipY + yo, w, h));
      p.setAttribute('fill', fill);
      // transform-box: fill-box scopes transform-origin to the element's own bbox
      // so 50% 100% = bottom-centre of THIS path (= flame base near tipY).
      p.style.transformBox    = 'fill-box';
      p.style.transformOrigin = '50% 100%';
      p.style.animation = `flameFlicker ${0.38 + i * 0.06}s ease-in-out infinite`;
      svg.appendChild(p);
      return p;
    });

    // ── Pop ring (hidden until needed) ────────────────────────────────────
    // Centred at the glow ellipse centre so ring and glow expand from the same point.
    const ring = document.createElementNS(svgNS, 'circle');
    ring.setAttribute('cx',           String(tipX));
    ring.setAttribute('cy',           String(tipY - FH * 0.40));
    ring.setAttribute('r',            String(FW * 2.8));
    ring.setAttribute('fill',         'none');
    ring.setAttribute('stroke',       'rgba(255,235,165,0.92)');
    ring.setAttribute('stroke-width', '2.5');
    ring.style.opacity         = '0';
    ring.style.transformBox    = 'fill-box';
    ring.style.transformOrigin = '50% 50%';
    svg.appendChild(ring);

    containerEl.appendChild(svg);
    return { svg, flameEls, glowEl, ring };
  }

  /**
   * H₂ burning splint — SVG splint at flask mouth + squeaky-pop burst.
   *
   * The SVG is mounted on the .vessel-container (not the card) so the flame
   * can extend above the card rim without being clipped by overflow:hidden.
   * @private
   */
  _animSqueakyPop(vesselEl, _params) {
    // POP_AT: flame pops at 1350 ms.
    // Pop anim (0.75 s) finishes at ~2100 ms, then burnt stick is held for 3 s.
    const POP_AT   = 1350;
    const TOTAL    = POP_AT + 750 + 3000;  // 5100 ms
    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    // Mount on container so flame is visible above the card rim
    const containerEl = vesselEl.closest('.vessel-container') ?? vesselEl.parentElement ?? vesselEl;
    const cRect   = containerEl.getBoundingClientRect();
    // Use the inner .vessel-card for position, not the outer container, so
    // tipY lands at the flask mouth rather than at the container/caption top.
    const cardRefEl = containerEl.querySelector('.vessel-card') ?? vesselEl;
    const vRect   = cardRefEl.getBoundingClientRect();

    const W = cRect.width  || 130;
    const H = cRect.height || 210;

    // Flask mouth in container-local SVG coordinates
    const tipX = (vRect.left - cRect.left) + vRect.width  * 0.50;
    const tipY = (vRect.top  - cRect.top)  + vRect.height * 0.03;

    const { svg, flameEls, glowEl, ring } = this._buildSplintScene(containerEl, W, H, tipX, tipY);

    // Phase 2 — squeaky pop burst
    setTimeout(() => {
      flameEls.forEach(el => {
        el.style.animation = 'flamePop 0.75s ease forwards';
      });
      glowEl.style.animation = 'flamePop 0.75s ease forwards';
      ring.style.opacity   = '1';
      ring.style.animation = 'popRing 0.75s ease forwards';
    }, POP_AT);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, TOTAL);
    });
  }

  /**
   * Burning splint burns steadily at the flask mouth — no pop (H₂ absent).
   * Splint slides in, flame flickers for ~1.4 s, then fades out gently.
   * @private
   */
  _animSplintBurns(vesselEl, _params) {
    const TOTAL      = 2200;
    const FADE_AT    = 1600;
    const vesselId   = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const containerEl = vesselEl.closest('.vessel-container') ?? vesselEl.parentElement ?? vesselEl;
    const cRect     = containerEl.getBoundingClientRect();
    const cardRefEl = containerEl.querySelector('.vessel-card') ?? vesselEl;
    const vRect     = cardRefEl.getBoundingClientRect();

    const W    = cRect.width  || 130;
    const H    = cRect.height || 210;
    const tipX = (vRect.left - cRect.left) + vRect.width  * 0.50;
    const tipY = (vRect.top  - cRect.top)  + vRect.height * 0.03;

    const { svg } = this._buildSplintScene(containerEl, W, H, tipX, tipY);

    // Fade the whole scene out gently — no pop
    setTimeout(() => {
      svg.style.transition = 'opacity 0.55s ease';
      svg.style.opacity    = '0';
    }, FADE_AT);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, TOTAL);
    });
  }

  /**
   * Burning splint extinguished by a non-H₂/non-O₂ gas.
   * Splint enters, flame is snuffed quickly, then the charred stick is held
   * on screen for ~3 s before fading out.
   * @private
   */
  _animSplintExtinguish(vesselEl, _params) {
    const SNUFF_AT  = 220;   // ms before snuffing starts
    const SNUFF_DUR = 350;   // ms for snuff fade
    const HOLD_DUR  = 1500;  // ms to display burnt stick after snuff
    const FADE_DUR  = 400;   // ms for final SVG fade-out
    const TOTAL     = SNUFF_AT + SNUFF_DUR + HOLD_DUR + FADE_DUR;

    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const containerEl = vesselEl.closest('.vessel-container') ?? vesselEl.parentElement ?? vesselEl;
    const cRect     = containerEl.getBoundingClientRect();
    const cardRefEl = containerEl.querySelector('.vessel-card') ?? vesselEl;
    const vRect     = cardRefEl.getBoundingClientRect();
    const W    = cRect.width  || 130;
    const H    = cRect.height || 210;
    const tipX = (vRect.left - cRect.left) + vRect.width  * 0.50;
    const tipY = (vRect.top  - cRect.top)  + vRect.height * 0.03;

    const { svg, flameEls, glowEl } = this._buildSplintScene(containerEl, W, H, tipX, tipY);

    // Snuff: stop flicker and fade flame + glow rapidly
    setTimeout(() => {
      const snuffTrans = `opacity ${SNUFF_DUR}ms ease`;
      flameEls.forEach(el => {
        el.style.animation  = 'none';
        el.style.transition = snuffTrans;
        el.style.opacity    = '0';
      });
      glowEl.style.animation  = 'none';
      glowEl.style.transition = snuffTrans;
      glowEl.style.opacity    = '0';
    }, SNUFF_AT);

    // Fade the whole SVG (stick disappears)
    setTimeout(() => {
      svg.style.transition = `opacity ${FADE_DUR}ms ease`;
      svg.style.opacity    = '0';
    }, SNUFF_AT + SNUFF_DUR + HOLD_DUR);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, TOTAL);
    });
  }

  /**
   * Build an SVG scene for the glowing splint: same stick geometry as
   * _buildSplintScene but the tip has only a small dim ember (no flame).
   * Flame layers and full glow halo are included but start at opacity 0
   * so _animSplintRelight can fade them in.
   * @private
   * @returns {{ svg, emberEl, glowEl, flameEls }}
   */
  _buildGlowingSplintScene(containerEl, W, H, tipX, tipY) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const FH    = Math.min(H * 0.20, 36);
    const FW    = FH * 0.42;
    const ANGLE = 32 * Math.PI / 180;
    const SLEN  = Math.min(W * 0.80, 100);
    const SHALF = 2.5;
    const cosA  = Math.cos(ANGLE);
    const sinA  = Math.sin(ANGLE);
    const pDx   = sinA * SHALF;
    const pDy   = cosA * SHALF;
    const eX    = tipX + SLEN * cosA;
    const eY    = tipY - SLEN * sinA;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox',             `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('overflow',            'visible');
    svg.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 15;
      animation: splintEnter 0.35s ease forwards;
    `;

    // Shared blur filter (used by both ember and glow halo)
    const gid  = `gg-${Math.random().toString(36).slice(2)}`;
    const defs = document.createElementNS(svgNS, 'defs');
    const filt = document.createElementNS(svgNS, 'filter');
    filt.setAttribute('id', gid);
    filt.setAttribute('x', '-80%');  filt.setAttribute('y', '-80%');
    filt.setAttribute('width', '260%'); filt.setAttribute('height', '260%');
    const blur = document.createElementNS(svgNS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '5');
    filt.appendChild(blur);
    defs.appendChild(filt);
    svg.appendChild(defs);

    // Stick
    const stick = document.createElementNS(svgNS, 'polygon');
    stick.setAttribute('points', [
      `${tipX - pDx},${tipY + pDy}`,
      `${tipX + pDx},${tipY - pDy}`,
      `${eX   + pDx},${eY   - pDy}`,
      `${eX   - pDx},${eY   + pDy}`,
    ].join(' '));
    stick.setAttribute('fill', '#b07830');
    svg.appendChild(stick);

    // Grain
    const grain = document.createElementNS(svgNS, 'line');
    grain.setAttribute('x1', String(tipX + 8  * cosA));
    grain.setAttribute('y1', String(tipY - 8  * sinA - pDy * 0.45));
    grain.setAttribute('x2', String(eX   - 6  * cosA));
    grain.setAttribute('y2', String(eY   + 6  * sinA - pDy * 0.45));
    grain.setAttribute('stroke',       'rgba(205,155,65,0.30)');
    grain.setAttribute('stroke-width', '1');
    svg.appendChild(grain);

    // Charred tip
    const cLen    = 8;
    const charred = document.createElementNS(svgNS, 'polygon');
    charred.setAttribute('points', [
      `${tipX - pDx},${tipY + pDy}`,
      `${tipX + pDx},${tipY - pDy}`,
      `${tipX + pDx + cLen * cosA},${tipY - pDy - cLen * sinA}`,
      `${tipX - pDx + cLen * cosA},${tipY + pDy - cLen * sinA}`,
    ].join(' '));
    charred.setAttribute('fill', '#1e0e00');
    svg.appendChild(charred);

    // Ember — small smoldering glow at the tip (dimmer/redder than full flame)
    const emberEl = document.createElementNS(svgNS, 'ellipse');
    emberEl.setAttribute('cx',     String(tipX));
    emberEl.setAttribute('cy',     String(tipY - FH * 0.12));
    emberEl.setAttribute('rx',     String(FW * 0.80));
    emberEl.setAttribute('ry',     String(FH * 0.22));
    emberEl.setAttribute('fill',   'rgba(255,55,0,0.80)');
    emberEl.setAttribute('filter', `url(#${gid})`);
    emberEl.style.transformBox    = 'fill-box';
    emberEl.style.transformOrigin = '50% 50%';
    svg.appendChild(emberEl);

    // Full glow halo — hidden; faded in by _animSplintRelight
    const glowEl = document.createElementNS(svgNS, 'ellipse');
    glowEl.setAttribute('cx',     String(tipX));
    glowEl.setAttribute('cy',     String(tipY - FH * 0.40));
    glowEl.setAttribute('rx',     String(FW * 2.0));
    glowEl.setAttribute('ry',     String(FH * 0.72));
    glowEl.setAttribute('fill',   'rgba(255,115,0,0.45)');
    glowEl.setAttribute('filter', `url(#${gid})`);
    glowEl.style.transformBox    = 'fill-box';
    glowEl.style.transformOrigin = '50% 50%';
    glowEl.style.opacity         = '0';
    svg.appendChild(glowEl);

    // Flame layers — hidden; faded in by _animSplintRelight
    function td(cx, cy, w, h) {
      return [
        `M${cx},${cy}`,
        `C${cx + w},${cy - h * 0.20} ${cx + w * 0.62},${cy - h * 0.76} ${cx},${cy - h}`,
        `C${cx - w * 0.62},${cy - h * 0.76} ${cx - w},${cy - h * 0.20} ${cx},${cy}`,
        'Z',
      ].join(' ');
    }
    const flameLayers = [
      [FW * 1.00, FH * 1.00,          0, 'rgba(165,30,0,0.82)' ],
      [FW * 0.72, FH * 0.85, -FH * 0.05, 'rgba(255,75,0,0.88)' ],
      [FW * 0.46, FH * 0.65, -FH * 0.10, 'rgba(255,170,10,0.93)'],
      [FW * 0.25, FH * 0.42, -FH * 0.16, 'rgba(255,248,185,0.97)'],
    ];
    const flameEls = flameLayers.map(([w, h, yo, fill], i) => {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', td(tipX, tipY + yo, w, h));
      p.setAttribute('fill', fill);
      p.style.transformBox    = 'fill-box';
      p.style.transformOrigin = '50% 100%';
      p.style.animation       = `flameFlicker ${0.38 + i * 0.06}s ease-in-out infinite`;
      p.style.opacity         = '0';
      svg.appendChild(p);
      return p;
    });

    containerEl.appendChild(svg);
    return { svg, emberEl, glowEl, flameEls };
  }

  /**
   * Glowing splint relights in O₂: ember glows briefly then bursts into flame.
   * @private
   */
  _animSplintRelight(vesselEl, _params) {
    const RELIGHT_AT = 450;   // ms — ember visible before relighting
    const FADE_AT    = 2000;  // ms — start fading full flame out
    const TOTAL      = 2500;

    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const containerEl = vesselEl.closest('.vessel-container') ?? vesselEl.parentElement ?? vesselEl;
    const cRect     = containerEl.getBoundingClientRect();
    const cardRefEl = containerEl.querySelector('.vessel-card') ?? vesselEl;
    const vRect     = cardRefEl.getBoundingClientRect();
    const W    = cRect.width  || 130;
    const H    = cRect.height || 210;
    const tipX = (vRect.left - cRect.left) + vRect.width  * 0.50;
    const tipY = (vRect.top  - cRect.top)  + vRect.height * 0.03;

    const { svg, emberEl, glowEl, flameEls } = this._buildGlowingSplintScene(containerEl, W, H, tipX, tipY);

    // Relight: ember fades, full flame + glow burst in
    setTimeout(() => {
      const trans = 'opacity 0.30s ease';
      emberEl.style.transition = trans;
      emberEl.style.opacity    = '0';
      glowEl.style.transition  = trans;
      glowEl.style.opacity     = '1';
      flameEls.forEach(el => {
        el.style.transition = trans;
        el.style.opacity    = '1';
      });
    }, RELIGHT_AT);

    // Fade out the whole scene
    setTimeout(() => {
      svg.style.transition = 'opacity 0.50s ease';
      svg.style.opacity    = '0';
    }, FADE_AT);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, TOTAL);
    });
  }

  /**
   * Glowing splint extinguished — no O₂: ember dims to nothing, charred
   * stick held on screen for 1.5 s, then fades out.
   * @private
   */
  _animGlowingSplintExtinguish(vesselEl, _params) {
    const SNUFF_AT  = 300;   // ms — show ember briefly
    const SNUFF_DUR = 400;   // ms — ember fade
    const HOLD_DUR  = 1500;  // ms — display charred stick
    const FADE_DUR  = 350;   // ms — SVG fade-out
    const TOTAL     = SNUFF_AT + SNUFF_DUR + HOLD_DUR + FADE_DUR;

    const vesselId = vesselEl.dataset.vesselId ?? '';
    this.setTestLock(vesselId, true);

    const containerEl = vesselEl.closest('.vessel-container') ?? vesselEl.parentElement ?? vesselEl;
    const cRect     = containerEl.getBoundingClientRect();
    const cardRefEl = containerEl.querySelector('.vessel-card') ?? vesselEl;
    const vRect     = cardRefEl.getBoundingClientRect();
    const W    = cRect.width  || 130;
    const H    = cRect.height || 210;
    const tipX = (vRect.left - cRect.left) + vRect.width  * 0.50;
    const tipY = (vRect.top  - cRect.top)  + vRect.height * 0.03;

    const { svg, emberEl } = this._buildGlowingSplintScene(containerEl, W, H, tipX, tipY);

    // Snuff the ember
    setTimeout(() => {
      emberEl.style.transition = `opacity ${SNUFF_DUR}ms ease`;
      emberEl.style.opacity    = '0';
    }, SNUFF_AT);

    // Fade out SVG after hold
    setTimeout(() => {
      svg.style.transition = `opacity ${FADE_DUR}ms ease`;
      svg.style.opacity    = '0';
    }, SNUFF_AT + SNUFF_DUR + HOLD_DUR);

    return new Promise(resolve => {
      setTimeout(() => {
        svg.remove();
        this.setTestLock(vesselId, false);
        resolve();
      }, TOTAL);
    });
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
