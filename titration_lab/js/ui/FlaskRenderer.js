/**
 * FlaskRenderer — SVG conical flask with colour-transition and swirl animation.
 *
 * Manages:
 *   • Liquid colour (gradual transition on endpoint / pH change)
 *   • Swirl animation (CSS class toggle)
 *   • Ripple effect on each drop landing
 *   • Endpoint glow pulse
 *   • Overshoot flash
 *
 * Subscribes to EventBus events:
 *   phUpdated       → smooth colour interpolation toward indicator colour
 *   endpointReached → snap to alkali colour, trigger endpoint glow
 *   overshot        → flash red overlay
 *   swirled         → run swirl animation once
 *
 * @module FlaskRenderer
 */

/**
 * Linear-interpolate two hex colours.
 * @param {string} from  e.g. '#aabbcc' or 'rgba(...)' — treated as CSS colour
 * @param {string} to
 * @param {number} t  0–1
 * @returns {string}  interpolated rgba() string
 */
function lerpColour(from, to, t) {
  const parse = (col) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const [r1,g1,b1,a1] = parse(from);
  const [r2,g2,b2,a2] = parse(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = (a1 + (a2 - a1) * t).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
}

export class FlaskRenderer {
  /** @type {HTMLElement} */
  #root;
  /** @type {SVGElement|null} */
  #liquidEl = null;
  /** @type {SVGElement|null} */
  #meniscusEl = null;
  /** @type {string} */
  #currentColour = 'rgba(180,220,255,0.12)';
  /** @type {string} */
  #acidColour  = 'rgba(180,220,255,0.12)';
  /** @type {string} */
  #alkColour   = 'rgba(255,92,122,0.55)';
  /** @type {boolean} True once true endpoint has been confirmed — locks colour changes from phUpdated */
  #endpointConfirmed = false;
  /** @type {Function[]} */
  #unsubs = [];
  /** @type {import('../EventBus.js').EventBus} */
  #bus;

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../EventBus.js').EventBus} bus
   * @param {{ acidColour?: string, alkColour?: string }} [colours]
   */
  constructor(rootEl, bus, colours = {}) {
    this.#root      = rootEl;
    this.#bus       = bus;
    this.#acidColour  = colours.acidColour ?? this.#acidColour;
    this.#alkColour   = colours.alkColour  ?? this.#alkColour;
    this.#currentColour = this.#acidColour;
    this._build();
    this._subscribe();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.#root.innerHTML = '';
    this.#root.className = 'flask-scene';

    const wrap = document.createElement('div');
    wrap.className = 'flask-wrap';
    wrap.id = 'flask-wrap';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Conical flask');

    // SVG flask
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '170');
    svg.setAttribute('height', '221');
    svg.setAttribute('viewBox', '0 0 100 130');
    svg.classList.add('flask-svg');

    // Clip path so liquid stays inside flask
    const defs = document.createElementNS(svgNS, 'defs');
    const clip = document.createElementNS(svgNS, 'clipPath');
    clip.id = 'flask-clip';
    const clipPath = document.createElementNS(svgNS, 'path');
    clipPath.setAttribute('d', 'M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z');
    clip.appendChild(clipPath);
    defs.appendChild(clip);
    svg.appendChild(defs);

    // Flask body outline (glass)
    const glass = document.createElementNS(svgNS, 'path');
    glass.setAttribute('d', 'M42,10 L42,52 L10,98 Q4,115 14,118 L86,118 Q96,115 90,98 L58,52 L58,10 Z');
    glass.setAttribute('fill', 'rgba(180,220,255,0.05)');
    glass.setAttribute('stroke', 'rgba(180,220,255,0.30)');
    glass.setAttribute('stroke-width', '1.5');

    // Liquid fill (clipped)
    this.#liquidEl = document.createElementNS(svgNS, 'rect');
    this.#liquidEl.setAttribute('x', '0');
    this.#liquidEl.setAttribute('y', '60');   // ~25mL fill level
    this.#liquidEl.setAttribute('width', '100');
    this.#liquidEl.setAttribute('height', '70');
    this.#liquidEl.setAttribute('clip-path', 'url(#flask-clip)');
    this.#liquidEl.style.fill = this.#currentColour;
    this.#liquidEl.style.transition = 'fill 0.6s ease';

    // Meniscus curve on top of liquid
    this.#meniscusEl = document.createElementNS(svgNS, 'ellipse');
    this.#meniscusEl.setAttribute('cx', '50');
    this.#meniscusEl.setAttribute('cy', '60');
    this.#meniscusEl.setAttribute('rx', '35');
    this.#meniscusEl.setAttribute('ry', '4');
    this.#meniscusEl.style.fill = this.#currentColour;
    this.#meniscusEl.style.transition = 'fill 0.6s ease';
    this.#meniscusEl.setAttribute('clip-path', 'url(#flask-clip)');

    // Neck
    const neck = document.createElementNS(svgNS, 'rect');
    neck.setAttribute('x', '42'); neck.setAttribute('y', '2');
    neck.setAttribute('width', '16'); neck.setAttribute('height', '12');
    neck.setAttribute('rx', '3');
    neck.setAttribute('fill', 'rgba(180,220,255,0.06)');
    neck.setAttribute('stroke', 'rgba(180,220,255,0.25)');
    neck.setAttribute('stroke-width', '1.5');

    // Glass sheen
    const sheen = document.createElementNS(svgNS, 'path');
    sheen.setAttribute('d', 'M44,14 L44,50 L20,90');
    sheen.setAttribute('fill', 'none');
    sheen.setAttribute('stroke', 'rgba(255,255,255,0.06)');
    sheen.setAttribute('stroke-width', '2');

    svg.appendChild(glass);
    svg.appendChild(this.#liquidEl);
    svg.appendChild(this.#meniscusEl);
    svg.appendChild(neck);
    svg.appendChild(sheen);

    wrap.appendChild(svg);
    this.#root.appendChild(wrap);

    // White tile
    const tile = document.createElement('div');
    tile.className = 'tile';
    this.#root.appendChild(tile);

    // Label
    const label = document.createElement('div');
    label.style.cssText = 'font-size:10px;color:var(--muted);margin-top:4px;';
    label.textContent = 'Click / drag to swirl';
    this.#root.appendChild(label);

    // Swirl gesture
    this._setupSwirlGesture(wrap);
  }

  // ── Gesture handling ────────────────────────────────────────

  _setupSwirlGesture(wrap) {
    let dragging = false;
    let points = [];

    const getXY = (e) => {
      if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    wrap.addEventListener('mousedown',  () => { dragging = true; points = []; });
    wrap.addEventListener('touchstart', (e) => { e.preventDefault(); dragging = true; points = []; });

    const onMove = (e) => {
      if (!dragging) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top  + rect.height / 2;
      const { x, y } = getXY(e);
      points.push(Math.atan2(y - cy, x - cx));
      if (points.length > 20) {
        const span = Math.abs(points[points.length - 1] - points[0]);
        if (span > Math.PI) { this._triggerSwirl(); points = []; }
      }
    };

    wrap.addEventListener('mousemove',  onMove);
    wrap.addEventListener('touchmove',  onMove);
    wrap.addEventListener('mouseup',    () => { dragging = false; points = []; });
    wrap.addEventListener('touchend',   () => { dragging = false; points = []; });
    wrap.addEventListener('click',      () => this._triggerSwirl());
  }

  /** Emit swirl via bus (so TitrateStage logic also fires). */
  _triggerSwirl() {
    this.#bus.emit('swirlRequested');
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Update indicator colours (call when indicator is chosen).
   * @param {{ acidCol: string, alkCol: string }} indicator
   */
  setIndicator(indicator) {
    this.#acidColour  = indicator.acidCol;
    this.#alkColour   = indicator.alkCol;
    this.#currentColour = this.#acidColour;
    this._applyColour(this.#currentColour);
  }

  /**
   * Directly set the liquid colour (no transition).
   * @param {string} colour
   */
  setColour(colour) {
    this.#currentColour = colour;
    this._applyColour(colour);
  }

  /** Add a ripple animation at the liquid surface. */
  addRipple() {
    const wrap = this.#root.querySelector('.flask-wrap');
    if (!wrap) return;
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.cssText = 'position:absolute;bottom:35%;left:50%;transform:translate(-50%,-50%);pointer-events:none;';
    wrap.style.position = 'relative';
    wrap.appendChild(r);
    setTimeout(() => r.remove(), 450);
  }

  /** Pulse endpoint glow. */
  glowEndpoint() {
    const wrap = this.#root.querySelector('.flask-wrap');
    if (!wrap) return;
    const glow = document.createElement('div');
    glow.className = 'endpoint-glow';
    wrap.style.position = 'relative';
    wrap.appendChild(glow);
    setTimeout(() => glow.remove(), 900);
  }

  /** Flash overshoot red. */
  flashOvershoot() {
    const wrap = this.#root.querySelector('.flask-wrap');
    if (!wrap) return;
    const flash = document.createElement('div');
    flash.className = 'overshoot-flash';
    flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    wrap.style.position = 'relative';
    wrap.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }

  /** Run the swirl CSS animation. */
  runSwirlAnimation() {
    const wrap = this.#root.querySelector('.flask-wrap');
    if (!wrap) return;
    wrap.classList.remove('swirling');
    void wrap.offsetWidth; // force reflow
    wrap.classList.add('swirling');
    setTimeout(() => wrap.classList.remove('swirling'), 450);
  }

  // ── Private helpers ────────────────────────────────────────

  _applyColour(colour) {
    if (this.#liquidEl)   this.#liquidEl.style.fill   = colour;
    if (this.#meniscusEl) this.#meniscusEl.style.fill = colour;
  }

  // ── EventBus subscription ──────────────────────────────────

  _subscribe() {
    this.#unsubs.push(
      this.#bus.on('phUpdated', ({ preEndpointT = 0, falseEndpoint = false }) => {
        if (this.#endpointConfirmed) return;
        if (falseEndpoint) {
          // Provisional endpoint: snap to full alkColour
          this._applyColour(this.#alkColour);
          this.#currentColour = this.#alkColour;
        } else if (preEndpointT > 0.01) {
          // Approaching endpoint: gradually blend (max 40 % of full alkColour tint)
          const blended = lerpColour(this.#acidColour, this.#alkColour, preEndpointT * 0.4);
          this._applyColour(blended);
          this.#currentColour = blended;
        }
      }),

      this.#bus.on('endpointReached', () => {
        this.#endpointConfirmed = true;
        this._applyColour(this.#alkColour);
        this.#currentColour = this.#alkColour;
        this.glowEndpoint();
      }),

      this.#bus.on('overshot', () => {
        this.flashOvershoot();
      }),

      this.#bus.on('swirled', () => {
        this.runSwirlAnimation();
      }),

      // If a false endpoint was dissipated by swirl, revert colour
      this.#bus.on('falseEndpointDissipated', () => {
        this._applyColour(this.#acidColour);
        this.#currentColour = this.#acidColour;
      }),

      // New run started: reset endpoint lock and revert to acidColour
      this.#bus.on('newRunStarted', () => {
        this.#endpointConfirmed = false;
        this._applyColour(this.#acidColour);
        this.#currentColour = this.#acidColour;
      }),
    );
  }

  destroy() {
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
  }
}
