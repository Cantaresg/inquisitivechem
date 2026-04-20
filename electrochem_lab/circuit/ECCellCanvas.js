/**
 * circuit/ECCellCanvas.js
 * Static SVG canvas for EC Cell (galvanic cell) mode.
 *
 * Manages two BeakerNodes, a SaltBridgeNode, a VoltmeterNode, and two static
 * electrode rods (visual-only, driven by ECCellPanel selection).
 *
 * The canvas shares the same SVG element as CircuitCanvas.  When EC Cell mode
 * is active, CircuitCanvas hides its layers and this canvas shows its layers.
 *
 * Public API:
 *   show()  / hide()
 *   setLeftHalfCell(halfCell)   — update left  beaker colour + electrode
 *   setRightHalfCell(halfCell)  — update right beaker colour + electrode
 *   setPolarity(anodeElId, cathodeElId) — label anode/cathode on rods
 *   voltmeter                   — getter returning the VoltmeterNode
 */

import { BeakerNode }     from './BeakerNode.js';
import { VoltmeterNode }  from './VoltmeterNode.js';
import { SaltBridgeNode } from './SaltBridgeNode.js';
import { ELECTRODE_DB }   from '../data/electrodes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Rod geometry (matches ElectrodeNode constants for visual consistency)
const ROD_W      = 16;   // (12 × 1.3)
const ROD_LENGTH = 156;  // (120 × 1.3)

export class ECCellCanvas {
  /**
   * @param {SVGElement} svg  — the shared circuit SVG
   */
  constructor(svg) {
    this._svg = svg;

    // Master group that wraps all EC Cell SVG elements
    this._layer = document.createElementNS(SVG_NS, 'g');
    this._layer.classList.add('eccell-canvas-layer');
    this._layer.setAttribute('aria-label', 'Galvanic cell diagram');
    svg.appendChild(this._layer);

    // Sub-layers (z-order: beakers → salt bridge → electrodes → voltmeter)
    this._beakerLayer   = this._mkLayer('eccell-beaker-layer');
    this._bridgeLayer   = this._mkLayer('eccell-bridge-layer');
    this._electrodeLayer = this._mkLayer('eccell-electrode-layer');
    this._vmLayer       = this._mkLayer('eccell-vm-layer');

    // Place everything once the SVG is visible (sizes are needed)
    this._placed = false;
    this._leftHalfCell  = null;
    this._rightHalfCell = null;

    this._initComponents();
    this.hide();   // hidden until A-Level EC Cell mode is enabled
  }

  // ── Public API ──────────────────────────────────────────────────────────

  show() {
    this._layer.removeAttribute('hidden');
    this._layer.style.display = '';
    if (!this._placed) this._placeLayout();
  }

  hide() {
    this._layer.style.display = 'none';
  }

  /** Show or hide the salt bridge (hidden at O-Level). */
  setLevel(level) {
    this._bridgeLayer.style.display = level === 'O_LEVEL' ? 'none' : '';
  }

  get voltmeter() { return this._voltmeterNode; }

  setLeftHalfCell(halfCell) {
    this._leftHalfCell = halfCell;
    if (halfCell) {
      this._leftBeaker.setElectrolyte({ colour: halfCell.colour });
      const elData = ELECTRODE_DB[halfCell.electrodeId];
      if (elData) this._updateRod(this._leftRod, elData, halfCell);
    }
  }

  setRightHalfCell(halfCell) {
    this._rightHalfCell = halfCell;
    if (halfCell) {
      this._rightBeaker.setElectrolyte({ colour: halfCell.colour });
      const elData = ELECTRODE_DB[halfCell.electrodeId];
      if (elData) this._updateRod(this._rightRod, elData, halfCell);
    }
  }

  /**
   * Mark which electrode ID is the anode vs cathode (for polarity labels).
   * @param {string} anodeElId    — ELECTRODE_DB key of the anode
   * @param {string} cathodeElId  — ELECTRODE_DB key of the cathode
   */
  setPolarity(anodeElId, cathodeElId) {
    this._setRodPolarity(this._leftRod,  this._leftHalfCell?.electrodeId,  anodeElId, cathodeElId);
    this._setRodPolarity(this._rightRod, this._rightHalfCell?.electrodeId, anodeElId, cathodeElId);
  }

  // ── Initialisation ──────────────────────────────────────────────────────

  _initComponents() {
    // Beakers (positions set in _placeLayout)
    this._leftBeaker  = new BeakerNode({ id: 'ec_left_beaker',  beakerLayer: this._beakerLayer,  cx: 0, cy: 0 });
    this._rightBeaker = new BeakerNode({ id: 'ec_right_beaker', beakerLayer: this._beakerLayer, cx: 0, cy: 0 });

    // Salt bridge
    this._saltBridge  = new SaltBridgeNode({ id: 'ec_salt_bridge', layer: this._bridgeLayer });

    // Voltmeter
    this._voltmeterNode = new VoltmeterNode({ id: 'ec_voltmeter', componentsLayer: this._vmLayer });

    // Static electrode rods (two <g> elements, one per half-cell)
    this._leftRod  = this._createRodGroup('ec_rod_left');
    this._rightRod = this._createRodGroup('ec_rod_right');
  }

  _placeLayout() {
    const rect = this._svg.getBoundingClientRect();
    const W    = rect.width  || 800;
    const H    = rect.height || 480;

    // Beaker centres
    const bkrY  = Math.round(H * 0.50);
    const leftX  = Math.round(W * 0.28);
    const rightX = Math.round(W * 0.72);

    this._leftBeaker.moveTo(leftX,  bkrY);
    this._rightBeaker.moveTo(rightX, bkrY);

    // Salt bridge between beaker tops (openings are at beaker origin Y)
    this._saltBridge.setPositions(
      { x: leftX,  y: bkrY },
      { x: rightX, y: bkrY },
    );

    // Electrode rods: each sits in slot_left of its own beaker (centred)
    // slot_left is at local (-SLOT_OFFSET, 0) — but for EC cell each beaker
    // has one electrode, centred at localX=0 (between the slots)
    const rodX = 0;                      // local: centred in beaker
    const rodTopY = bkrY - ROD_LENGTH;   // rod top hangs above beaker
    this._placeRod(this._leftRod,  leftX  + rodX, rodTopY);
    this._placeRod(this._rightRod, rightX + rodX, rodTopY);

    // Voltmeter above, centred between the two beakers
    const vmX = Math.round(W * 0.50);
    const vmY = Math.round(H * 0.18);
    this._voltmeterNode.moveTo(vmX, vmY);

    // Wire lines: voltmeter terminals to electrode rod tops
    this._drawWire('ec_wire_left',  vmX - 42, vmY + 28, leftX,  rodTopY);
    this._drawWire('ec_wire_right', vmX + 42, vmY + 28, rightX, rodTopY);

    this._placed = true;
  }

  // ── Rod helpers ─────────────────────────────────────────────────────────

  _createRodGroup(id) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-node-id', id);
    g.classList.add('eccell-rod');

    // Rod rectangle
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', -(ROD_W / 2));
    rect.setAttribute('y', 0);
    rect.setAttribute('width',  ROD_W);
    rect.setAttribute('height', ROD_LENGTH);
    rect.setAttribute('rx', 3);
    rect.classList.add('eccell-rod-rect');
    g.appendChild(rect);

    // Symbol label (centred on the rod)
    const sym = document.createElementNS(SVG_NS, 'text');
    sym.setAttribute('x', 0);
    sym.setAttribute('y', ROD_LENGTH / 2);
    sym.setAttribute('text-anchor', 'middle');
    sym.setAttribute('dominant-baseline', 'middle');
    sym.classList.add('eccell-rod-symbol');
    sym.textContent = '?';
    g.appendChild(sym);

    // Polarity label above rod
    const polLabel = document.createElementNS(SVG_NS, 'text');
    polLabel.setAttribute('x', 0);
    polLabel.setAttribute('y', -12);
    polLabel.setAttribute('text-anchor', 'middle');
    polLabel.classList.add('eccell-rod-polarity');
    g.appendChild(polLabel);

    this._electrodeLayer.appendChild(g);
    return g;
  }

  _placeRod(rodGroup, x, y) {
    rodGroup.setAttribute('transform', `translate(${x},${y})`);
  }

  _updateRod(rodGroup, electrodeData, halfCell) {
    const rect = rodGroup.querySelector('.eccell-rod-rect');
    const sym  = rodGroup.querySelector('.eccell-rod-symbol');
    if (rect) rect.setAttribute('fill', electrodeData.colour ?? '#888');
    if (sym)  sym.textContent = electrodeData.symbol;
  }

  _setRodPolarity(rodGroup, thisElId, anodeElId, cathodeElId) {
    const label = rodGroup.querySelector('.eccell-rod-polarity');
    if (!label) return;
    if (thisElId === anodeElId)   { label.textContent = '− (anode)';  rodGroup.classList.add('eccell-rod--anode');   rodGroup.classList.remove('eccell-rod--cathode'); }
    else if (thisElId === cathodeElId) { label.textContent = '+ (cathode)'; rodGroup.classList.add('eccell-rod--cathode'); rodGroup.classList.remove('eccell-rod--anode'); }
    else { label.textContent = ''; rodGroup.classList.remove('eccell-rod--anode', 'eccell-rod--cathode'); }
  }

  // ── Wire lines ──────────────────────────────────────────────────────────

  _drawWire(id, x1, y1, x2, y2) {
    // Remove any existing wire with this id first
    this._layer.querySelector(`[data-wire-id="${id}"]`)?.remove();

    // Simple two-segment wire: horizontal then vertical
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('data-wire-id', id);
    path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${y1 - 20} L ${x2} ${y1 - 20} L ${x2} ${y2}`);
    path.classList.add('eccell-wire');
    this._vmLayer.appendChild(path);
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  _mkLayer(className) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add(className);
    this._layer.appendChild(g);
    return g;
  }
}
