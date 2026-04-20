/**
 * ui/AnimationLayer.js
 * Canvas-based particle animation overlay for the circuit canvas.
 *
 * Inserts a <canvas> element as a direct child of #circuit-wrap with
 * position:absolute; pointer-events:none so it overlays the SVG without
 * blocking interaction. Stays in sync with the wrap's size via ResizeObserver.
 *
 * Animation types (driven by PRODUCT_DB state field):
 *   'gas'     — bubbles rise from rod_bottom of the electrode
 *   'solid'   — coloured deposit particles settle near rod_bottom (cathode deposits)
 *   'aqueous' — soft colour cloud drifts through the beaker liquid
 *
 * Coordinate system: wrap-local pixels. Since the SVG fills the wrap with
 * no viewBox, SVG viewport coordinates equal wrap-local pixels, so electrode
 * terminal positions can be passed in directly.
 */

const SPAWN_INTERVAL = 6;   // frames between particle spawns per electrode

export class AnimationLayer {
  /**
   * @param {HTMLElement} circuitWrap — #circuit-wrap (parent of the SVG)
   */
  constructor(circuitWrap) {
    this._wrap = circuitWrap;

    // Create and insert the overlay canvas
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'anim-canvas';
    Object.assign(this._canvas.style, {
      position:      'absolute',
      inset:         '0',
      pointerEvents: 'none',
      zIndex:        '5',
    });
    circuitWrap.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // State
    this._particles      = [];
    this._running        = false;
    this._frameId        = null;
    this._spawnTick      = 0;
    this._anodeProduct   = null;
    this._cathodeProduct = null;
    this._anodePos       = null;   // { x, y } wrap-local px
    this._cathodePos     = null;

    // Keep canvas sized to the wrap
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(circuitWrap);
    this._onResize();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start (or restart) the animation for the current electrolysis run.
   * @param {object} opts
   * @param {object}         opts.anodeProduct    — PRODUCT_DB record
   * @param {object}         opts.cathodeProduct  — PRODUCT_DB record
   * @param {{x,y}}          opts.anodePos        — wrap-local pixel position of rod_bottom
   * @param {{x,y}}          opts.cathodePos      — wrap-local pixel position of rod_bottom
   */
  start({ anodeProduct, cathodeProduct, anodePos, cathodePos }) {
    this._stop();
    this._particles      = [];
    this._anodeProduct   = anodeProduct;
    this._cathodeProduct = cathodeProduct;
    this._anodePos       = anodePos;
    this._cathodePos     = cathodePos;
    this._spawnTick      = 0;
    this._running        = true;
    this._loop();
  }

  /** Stop all animation and clear the canvas. */
  stop() {
    this._stop();
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  _stop() {
    this._running = false;
    if (this._frameId !== null) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
  }

  _onResize() {
    this._canvas.width  = this._wrap.clientWidth;
    this._canvas.height = this._wrap.clientHeight;
  }

  _loop() {
    if (!this._running) return;
    this._frameId = requestAnimationFrame(() => {
      this._update();
      this._draw();
      this._loop();
    });
  }

  _update() {
    this._spawnTick = (this._spawnTick + 1) % SPAWN_INTERVAL;
    if (this._spawnTick === 0) {
      this._spawnFor(this._cathodeProduct, this._cathodePos);
      this._spawnFor(this._anodeProduct,   this._anodePos);
    }
    // Age existing particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= 1;
      if (p.life <= 0) this._particles.splice(i, 1);
    }
  }

  _spawnFor(product, pos) {
    if (!product || !pos) return;

    switch (product.state) {
      case 'gas':
        // Bubbles rise from the tip of the electrode rod
        for (let i = 0; i < 2; i++) {
          this._particles.push({
            x:      pos.x + (Math.random() - 0.5) * 14,
            y:      pos.y - 4,
            vx:     (Math.random() - 0.5) * 0.55,
            vy:     -(1.0 + Math.random() * 0.9),
            r:      2.5 + Math.random() * 2.5,
            colour: product.colour,
            alpha:  0.65,
            type:   'bubble',
            life:   50 + Math.random() * 30,
          });
        }
        break;

      case 'solid':
        // Deposit — slow particles that settle near rod_bottom
        this._particles.push({
          x:      pos.x + (Math.random() - 0.5) * 20,
          y:      pos.y - Math.random() * 8,
          vx:     (Math.random() - 0.5) * 0.18,
          vy:     0.12 + Math.random() * 0.12,
          r:      1.8 + Math.random() * 2.2,
          colour: product.colour,
          alpha:  0.88,
          type:   'dot',
          life:   220 + Math.random() * 80,
        });
        break;

      case 'aqueous':
        // Soft colour blobs drift slowly through the electrolyte region
        this._particles.push({
          x:      pos.x + (Math.random() - 0.5) * 50,
          y:      pos.y + Math.random() * 40,
          vx:     (Math.random() - 0.5) * 0.22,
          vy:     0.08 + Math.random() * 0.1,
          r:      7 + Math.random() * 7,
          colour: product.colour,
          alpha:  0.25,
          type:   'dot',
          life:   160 + Math.random() * 60,
        });
        break;

      default:
        break;
    }
  }

  _draw() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    for (const p of this._particles) {
      // Fade out in the last 30 frames
      const fade = Math.min(1, p.life / 30);
      ctx.globalAlpha = p.alpha * fade;

      if (p.type === 'bubble') {
        // Outline only (hollow bubble look)
        ctx.strokeStyle = p.colour;
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny specular highlight
        ctx.globalAlpha = p.alpha * fade * 0.28;
        ctx.fillStyle   = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }
}
