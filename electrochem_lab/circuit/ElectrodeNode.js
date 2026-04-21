/**
 * circuit/ElectrodeNode.js
 * A draggable electrode rod that detects immersion in the BeakerNode.
 *
 * Local coordinate origin is at rod_top (wire connection point).
 * Terminal positions (local):
 *   rod_top    — (0, 0)          top — wire attaches here
 *   rod_bottom — (0, ROD_LENGTH) bottom — checked for beaker immersion
 *
 * The node is spawned by CircuitCanvas.spawnComponent() when the user drops
 * an electrode card from the left panel onto the canvas.
 */
import { ComponentNode } from './ComponentNode.js';

const SVG_NS    = 'http://www.w3.org/2000/svg';
const ROD_W     = 16;   // rod width (px)  (12 × 1.3)
const ROD_LENGTH = 156; // local distance from rod_top to rod_bottom  (120 × 1.3)
const ROD_VISUAL_TOP = 10;
const ROD_VISUAL_BOTTOM = ROD_LENGTH + 2;

export { ROD_LENGTH, ROD_W, ROD_VISUAL_TOP, ROD_VISUAL_BOTTOM };

export class ElectrodeNode extends ComponentNode {
  /**
   * @param {object} opts
   * @param {string}       opts.id
   * @param {SVGGElement}  opts.componentsLayer  — parent <g> in the SVG
   * @param {object}       opts.electrodeData    — record from ELECTRODE_DB
   * @param {number}       opts.x                — initial SVG x (rod_top)
   * @param {number}       opts.y                — initial SVG y (rod_top)
   */
  constructor({ id, componentsLayer, electrodeData, x = 0, y = 0 }) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-node-id', id);
    g.classList.add('electrode-node', 'circuit-node');

    ElectrodeNode._buildSVG(g, electrodeData, ROD_LENGTH, ROD_W);

    const terminals = [
      { id: 'rod_top',    localX: 0, localY: 0,          connected: false, accepts: 'wire' },
      { id: 'rod_bottom', localX: 0, localY: ROD_LENGTH,  connected: false, accepts: 'slot' },
    ];

    super({ id, type: 'electrode', svgGroup: g, terminals, data: electrodeData });

    /** Whether this electrode is currently submerged in the beaker liquid. */
    this.isSubmerged = false;

    componentsLayer.appendChild(g);
    this.moveTo(x, y);
  }

  // ── Immersion state ───────────────────────────────────────────────────

  /**
   * Mark the electrode as submerged or not.
   * The electrode's position is NOT changed — the user places it freely.
   * @param {boolean} value
   */
  setSubmerged(value) {
    this.isSubmerged = value;
    this.svgGroup.classList.toggle('electrode-submerged', value);
  }

  // ── Polarity label (set by CircuitValidator / SimController) ──────────

  setPolarity(role) {
    // role: 'anode' | 'cathode' | null
    this.svgGroup.classList.remove('polarity-anode', 'polarity-cathode');
    if (role) this.svgGroup.classList.add(`polarity-${role}`);
    const lbl = this.svgGroup.querySelector('.polarity-label');
    if (lbl) lbl.textContent = role ? (role === 'anode' ? 'Anode (+)' : 'Cathode (−)') : '';
  }

  // ── SVG drawing ───────────────────────────────────────────────────────

  static _buildSVG(g, data, rodLength, rodW) {
    const half = rodW / 2;

    // Rod body (below the top terminal)
    const rod = document.createElementNS(SVG_NS, 'rect');
    rod.setAttribute('x',      -half);
    rod.setAttribute('y',      ROD_VISUAL_TOP);
    rod.setAttribute('width',  rodW);
    rod.setAttribute('height', rodLength - 14);
    rod.setAttribute('rx',     2);
    rod.setAttribute('fill',   data.colour);
    rod.classList.add('electrode-rod');
    g.appendChild(rod);

    // Bottom tip highlight
    const tip = document.createElementNS(SVG_NS, 'rect');
    tip.setAttribute('x',      -half);
    tip.setAttribute('y',      rodLength - 14);
    tip.setAttribute('width',  rodW);
    tip.setAttribute('height', 16);
    tip.setAttribute('rx',     2);
    tip.setAttribute('fill',   data.colour);
    tip.setAttribute('opacity', '0.7');
    g.appendChild(tip);

    // rod_top terminal dot (wire connects here)
    const topDot = document.createElementNS(SVG_NS, 'circle');
    topDot.setAttribute('cx', 0);
    topDot.setAttribute('cy', 0);
    topDot.setAttribute('r',  9);
    topDot.setAttribute('data-terminal', 'rod_top');
    topDot.classList.add('terminal-dot');
    g.appendChild(topDot);

    // Element symbol label (to the right of rod)
    const symLabel = document.createElementNS(SVG_NS, 'text');
    symLabel.setAttribute('x', half + 6);
    symLabel.setAttribute('y', 28);
    symLabel.classList.add('electrode-symbol-label');
    symLabel.textContent = data.symbol;
    g.appendChild(symLabel);

    // Full name label (smaller, below symbol)
    const nameLabel = document.createElementNS(SVG_NS, 'text');
    nameLabel.setAttribute('x', half + 6);
    nameLabel.setAttribute('y', 44);
    nameLabel.classList.add('electrode-name-label');
    nameLabel.textContent = data.name.replace('Carbon (graphite)', 'Carbon');
    g.appendChild(nameLabel);

    // Polarity label (empty until circuit closes)
    const polLabel = document.createElementNS(SVG_NS, 'text');
    polLabel.setAttribute('x', half + 6);
    polLabel.setAttribute('y', 60);
    polLabel.classList.add('polarity-label');
    polLabel.textContent = '';
    g.appendChild(polLabel);

    // Drag handle — transparent large hit area on the rod body
    const handle = document.createElementNS(SVG_NS, 'rect');
    handle.setAttribute('x',      -(half + 8));
    handle.setAttribute('y',      ROD_VISUAL_TOP);
    handle.setAttribute('width',  rodW + 16);
    handle.setAttribute('height', rodLength - 12);
    handle.setAttribute('fill',   'transparent');
    handle.classList.add('electrode-drag-handle');
    g.appendChild(handle);
  }
}
