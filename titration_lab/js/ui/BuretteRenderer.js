/**
 * BuretteRenderer — SVG-based burette visualisation.
 *
 * Manages:
 *   • Liquid level (fills from the top down as volume is dispensed)
 *   • Drop animation (CSS-animated .drop element)
 *   • Tap open/closed state
 *   • Funnel visibility
 *   • Burette reading text
 *
 * Subscribes to EventBus events:
 *   levelChanged  → update liquid height
 *   dropAdded     → animate a falling drop
 *   tapOpened     → rotate tap handle
 *   tapClosed     → restore tap handle
 *
 * @module BuretteRenderer
 */

/** Burette SVG height in px (the tube only, not the tip) */
const TUBE_H = 260;
/** Total burette volume in mL */
const TOTAL_VOL = 50;

export class BuretteRenderer {
  /** @type {HTMLElement} */
  #root;
  /** @type {HTMLElement|null} */
  #liquidEl = null;
  /** @type {HTMLElement|null} */
  #tapEl = null;
  /** @type {HTMLElement|null} */
  #readingEl = null;
  /** @type {HTMLElement|null} */
  #dropContainer = null;
  /** @type {HTMLElement|null} */
  #funnelEl = null;
  /** @type {string} */
  #colour;
  /** @type {Function[]} */
  #unsubs = [];
  /** @type {import('../EventBus.js').EventBus} */
  #bus;

  /**
   * @param {HTMLElement} rootEl  Container element to render into
   * @param {import('../EventBus.js').EventBus} bus
   * @param {string} [colour='rgba(92,184,255,0.6)']  Liquid colour
   */
  constructor(rootEl, bus, colour = 'rgba(92,184,255,0.6)') {
    this.#root   = rootEl;
    this.#bus    = bus;
    this.#colour = colour;
    this._build();
    this._subscribe();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.#root.innerHTML = '';
    this.#root.className = 'burette-scene';

    // Funnel
    this.#funnelEl = document.createElement('div');
    this.#funnelEl.className = 'burette-funnel hidden';
    this.#funnelEl.innerHTML = `
      <svg width="50" height="36" viewBox="0 0 50 36">
        <path d="M5,5 L45,5 L30,32 L20,32 Z"
          fill="rgba(180,220,255,0.10)" stroke="rgba(180,220,255,0.35)" stroke-width="1.5"/>
      </svg>`;
    this.#root.appendChild(this.#funnelEl);

    // Tube wrapper
    const tube = document.createElement('div');
    tube.className = 'burette-tube';
    tube.style.height = TUBE_H + 'px';
    tube.style.position = 'relative';

    // Liquid
    this.#liquidEl = document.createElement('div');
    this.#liquidEl.className = 'burette-liquid';
    this.#liquidEl.style.background = this.#colour;
    this.#liquidEl.style.height = '100%'; // full at start (50mL)

    // Meniscus
    const meniscus = document.createElement('div');
    meniscus.className = 'burette-meniscus';
    meniscus.style.background = this.#colour;

    // Markings SVG — 10 tick marks at 5mL intervals
    const markSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    markSvg.setAttribute('width', '26');
    markSvg.setAttribute('height', String(TUBE_H));
    markSvg.setAttribute('viewBox', `0 0 26 ${TUBE_H}`);
    markSvg.classList.add('burette-markings');
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * TUBE_H;
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', '18'); tick.setAttribute('x2', '24');
      tick.setAttribute('y1', String(y)); tick.setAttribute('y2', String(y));
      tick.setAttribute('stroke', 'rgba(180,220,255,0.3)');
      tick.setAttribute('stroke-width', '1');
      markSvg.appendChild(tick);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '0');
      label.setAttribute('y', String(y + 3));
      label.setAttribute('font-size', '6');
      label.setAttribute('fill', 'rgba(180,220,255,0.4)');
      label.textContent = String(i * 5);
      markSvg.appendChild(label);
    }

    tube.appendChild(this.#liquidEl);
    tube.appendChild(meniscus);
    tube.appendChild(markSvg);
    this.#root.appendChild(tube);

    // Tap area
    const tapWrap = document.createElement('div');
    tapWrap.style.cssText = 'position:relative;width:26px;height:12px;margin-top:-1px;';
    this.#tapEl = document.createElement('div');
    this.#tapEl.className = 'burette-tap';
    tapWrap.appendChild(this.#tapEl);
    this.#root.appendChild(tapWrap);

    // Tip
    const tip = document.createElement('div');
    tip.className = 'burette-tip';
    this.#root.appendChild(tip);

    // Reading
    this.#readingEl = document.createElement('div');
    this.#readingEl.className = 'burette-reading';
    this.#readingEl.textContent = '0.00 mL';
    this.#root.appendChild(this.#readingEl);

    // Drop container — sibling to root, positioned absolutely over scene
    // (caller is responsible for positioning; we store a ref set by setDropContainer)
    this.#dropContainer = null;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Point to an element used as the drop animation container.
   * Should cover the entire animation area and be position:relative/absolute.
   * @param {HTMLElement} el
   */
  setDropContainer(el) {
    this.#dropContainer = el;
  }

  /**
   * Update liquid colour (e.g. when titrant changes).
   * @param {string} colour CSS colour string
   */
  setColour(colour) {
    this.#colour = colour;
    if (this.#liquidEl) this.#liquidEl.style.background = colour;
  }

  /** Show or hide the funnel. */
  setFunnel(visible) {
    this.#funnelEl?.classList.toggle('hidden', !visible);
  }

  /**
   * Update burette level immediately (no animation — use for init).
   * @param {number} volumeRemaining mL remaining in burette (0–50)
   */
  setLevel(volumeRemaining) {
    const pct = Math.max(0, Math.min(1, volumeRemaining / TOTAL_VOL));
    if (this.#liquidEl) this.#liquidEl.style.height = (pct * 100) + '%';
  }

  /**
   * Update the reading display.
   * @param {number} initial mL
   * @param {number} current mL dispensed so far (cumulative)
   */
  setReading(initial, current) {
    if (this.#readingEl) {
      this.#readingEl.textContent = `${initial.toFixed(2)} → ${(initial + current).toFixed(2)} mL`;
    }
  }

  /**
   * Animate a drop falling from the burette tip to a target element.
   * @param {HTMLElement} targetEl  The flask element (used for geometry)
   */
  animateDrop(targetEl) {
    const container = this.#dropContainer;
    if (!container || !targetEl) return;

    const tipEl = this.#root.querySelector('.burette-tip');
    if (!tipEl) return;

    const cRect  = container.getBoundingClientRect();
    const tRect  = tipEl.getBoundingClientRect();
    const fRect  = targetEl.getBoundingClientRect();

    const startX = tRect.left + tRect.width  / 2 - cRect.left;
    const startY = tRect.bottom               - cRect.top;
    const endY   = fRect.top + fRect.height * 0.55 - cRect.top;
    const dist   = endY - startY;

    const dur = Math.max(0.3, dist / 450);

    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.style.cssText = [
      `left:${startX - 3}px`,
      `top:${startY}px`,
      `background:${this.#colour}`,
      `--drop-dist:${dist}px`,
      `--drop-dur:${dur}s`,
    ].join(';');
    container.appendChild(drop);

    setTimeout(() => drop.remove(), dur * 1000 + 50);
  }

  // ── EventBus subscription ──────────────────────────────────

  _subscribe() {
    this.#unsubs.push(
      this.#bus.on('levelChanged', ({ volumeRemaining }) => {
        this.setLevel(volumeRemaining);
      }),
      this.#bus.on('dropAdded', ({ volumeRemaining }) => {
        this.setLevel(volumeRemaining);
      }),
      this.#bus.on('tapOpened', () => {
        this.#tapEl?.classList.add('open');
      }),
      this.#bus.on('tapClosed', () => {
        this.#tapEl?.classList.remove('open');
      }),
    );
  }

  /** Release all bus subscriptions. Call when tearing down the stage. */
  destroy() {
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
  }
}
