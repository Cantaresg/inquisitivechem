/**
 * PHGraphRenderer — Canvas-based pH vs volume curve.
 *
 * Draws:
 *   • pH axis (0–14) and volume axis (auto-scaled)
 *   • Gradient stroke (green → yellow → red) representing pH
 *   • Endpoint vertical marker line
 *   • Current pH value readout
 *
 * Subscribes to EventBus events:
 *   phUpdated       → append data point and redraw
 *   endpointReached → draw endpoint marker
 *
 * @module PHGraphRenderer
 */

/** Canvas logical resolution */
const CANVAS_W = 260;
const CANVAS_H = 160;

/** Colours for pH gradient (low pH → high pH) */
const PH_GRADIENT = [
  { ph: 0,  colour: '#ff5c7a' },
  { ph: 4,  colour: '#ff9f5c' },
  { ph: 7,  colour: '#ffd45c' },
  { ph: 10, colour: '#5cffb8' },
  { ph: 14, colour: '#5cb8ff' },
];

/** Map pH 0–14 to a colour via the gradient table */
function phColour(pH) {
  const clamped = Math.max(0, Math.min(14, pH));
  for (let i = 1; i < PH_GRADIENT.length; i++) {
    const prev = PH_GRADIENT[i - 1];
    const curr = PH_GRADIENT[i];
    if (clamped <= curr.ph) {
      const t = (clamped - prev.ph) / (curr.ph - prev.ph);
      return lerpHex(prev.colour, curr.colour, t);
    }
  }
  return PH_GRADIENT[PH_GRADIENT.length - 1].colour;
}

function lerpHex(a, b, t) {
  const h = (s) => [
    parseInt(s.slice(1,3),16),
    parseInt(s.slice(3,5),16),
    parseInt(s.slice(5,7),16),
  ];
  const [r1,g1,b1] = h(a);
  const [r2,g2,b2] = h(b);
  const r = Math.round(r1 + (r2-r1)*t).toString(16).padStart(2,'0');
  const g = Math.round(g1 + (g2-g1)*t).toString(16).padStart(2,'0');
  const bv = Math.round(b1 + (b2-b1)*t).toString(16).padStart(2,'0');
  return `#${r}${g}${bv}`;
}

export class PHGraphRenderer {
  /** @type {HTMLElement} */
  #root;
  /** @type {HTMLCanvasElement} */
  #canvas;
  /** @type {CanvasRenderingContext2D} */
  #ctx;
  /** @type {{ vol: number, pH: number }[]} */
  #data = [];
  /** @type {number|null} */
  #epVol = null;
  /** @type {Function[]} */
  #unsubs = [];
  /** @type {import('../EventBus.js').EventBus} */
  #bus;
  /** @type {HTMLElement|null} */
  #readout = null;

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../EventBus.js').EventBus} bus
   */
  constructor(rootEl, bus) {
    this.#root = rootEl;
    this.#bus  = bus;
    this._build();
    this._subscribe();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.#root.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.id = 'ph-graph-wrap';

    this.#canvas = document.createElement('canvas');
    this.#canvas.width  = CANVAS_W;
    this.#canvas.height = CANVAS_H;
    this.#canvas.style.cssText = 'width:100%;border-radius:6px;display:block;';
    this.#ctx = this.#canvas.getContext('2d');

    this.#readout = document.createElement('div');
    this.#readout.style.cssText = 'font-size:10px;color:var(--muted);text-align:right;margin-top:3px;';
    this.#readout.textContent = 'pH —';

    wrap.appendChild(this.#canvas);
    wrap.appendChild(this.#readout);
    this.#root.appendChild(wrap);

    this._draw();
  }

  // ── Public API ─────────────────────────────────────────────

  /** Reset graph for a new run. */
  reset() {
    this.#data  = [];
    this.#epVol = null;
    this._draw();
  }

  /**
   * Append a data point and redraw.
   * @param {number} vol   mL added
   * @param {number} pH    0–14
   */
  addPoint(vol, pH) {
    this.#data.push({ vol, pH });
    if (this.#readout) {
      this.#readout.textContent = `pH ${pH.toFixed(2)}  ·  ${vol.toFixed(2)} mL`;
    }
    this._draw();
  }

  /**
   * Mark the endpoint volume with a vertical dashed line.
   * @param {number} vol
   */
  markEndpoint(vol) {
    this.#epVol = vol;
    this._draw();
  }

  // ── Drawing ────────────────────────────────────────────────

  _draw() {
    const ctx  = this.#ctx;
    const W    = CANVAS_W;
    const H    = CANVAS_H;
    const PAD  = { top: 10, right: 10, bottom: 22, left: 28 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#161b25';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 6);
    ctx.fill();

    // Grid & axes
    const maxVol = Math.max(30, ...(this.#data.map(d => d.vol)), (this.#epVol ?? 0) + 5);

    const toX = (vol) => PAD.left + (vol / maxVol) * plotW;
    const toY = (pH)  => PAD.top  + (1 - pH / 14) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(44,53,72,0.8)';
    ctx.lineWidth = 1;
    for (let ph = 0; ph <= 14; ph += 2) {
      const y = toY(ph);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
    }
    const volStep = maxVol <= 30 ? 5 : 10;
    for (let v = 0; v <= maxVol; v += volStep) {
      const x = toX(v);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(61,79,106,1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + plotH);
    ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#6b7a96';
    ctx.font = '7px Inconsolata, monospace';
    ctx.textAlign = 'right';
    for (let ph = 0; ph <= 14; ph += 2) {
      ctx.fillText(String(ph), PAD.left - 3, toY(ph) + 2.5);
    }
    ctx.textAlign = 'center';
    for (let v = 0; v <= maxVol; v += volStep) {
      ctx.fillText(String(v), toX(v), PAD.top + plotH + 10);
    }

    // Axis titles
    ctx.save();
    ctx.translate(8, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('pH', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillText('Vol added / mL', PAD.left + plotW / 2, H - 3);

    if (this.#data.length < 2) return;

    // pH curve — draw as series of coloured segments
    ctx.lineWidth = 2;
    ctx.lineJoin  = 'round';
    ctx.lineCap   = 'round';

    for (let i = 1; i < this.#data.length; i++) {
      const prev = this.#data[i - 1];
      const curr = this.#data[i];
      ctx.beginPath();
      ctx.strokeStyle = phColour((prev.pH + curr.pH) / 2);
      ctx.moveTo(toX(prev.vol), toY(prev.pH));
      ctx.lineTo(toX(curr.vol), toY(curr.pH));
      ctx.stroke();
    }

    // Endpoint marker
    if (this.#epVol !== null) {
      const x = toX(this.#epVol);
      ctx.strokeStyle = 'rgba(92,255,184,0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // EP label
      ctx.fillStyle = 'rgba(92,255,184,0.85)';
      ctx.font = '7px Inconsolata, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`EP ${this.#epVol.toFixed(2)}`, x + 3, PAD.top + 8);
    }

    // Dot at last point
    const last = this.#data[this.#data.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.vol), toY(last.pH), 3, 0, Math.PI * 2);
    ctx.fillStyle = phColour(last.pH);
    ctx.fill();
  }

  // ── EventBus subscription ──────────────────────────────────

  _subscribe() {
    this.#unsubs.push(
      this.#bus.on('phUpdated', ({ volAdded, pH }) => {
        this.addPoint(volAdded, pH);
      }),
      this.#bus.on('endpointReached', ({ volume }) => {
        if (volume !== undefined) this.markEndpoint(volume);
      }),
    );
  }

  destroy() {
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
  }
}
