/**
 * circuit/VoltmeterNode.js
 * Voltmeter display component for EC Cell mode.
 *
 * Fixed position, not user-draggable. Placed by ECCellCanvas above the two
 * beakers. Shows a live EMF reading that updates as concentrations change.
 *
 * Terminal positions (local, relative to centre of SVG group):
 *   vm_left  — (-HALF_W, +TERM_DY)  bottom-left  connects to left electrode top
 *   vm_right — (+HALF_W, +TERM_DY)  bottom-right connects to right electrode top
 */
import { ComponentNode } from './ComponentNode.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const RADIUS  = 28;
const HALF_W  = 42;    // horizontal spread of terminals from centre
const TERM_DY = 28;    // terminal Y below centre (places them on the leads)

export class VoltmeterNode extends ComponentNode {
  /**
   * @param {object} opts
   * @param {string}      opts.id
   * @param {SVGGElement} opts.componentsLayer
   */
  constructor({ id, componentsLayer }) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-node-id', id);
    g.classList.add('voltmeter-node', 'circuit-node');

    const emfText = VoltmeterNode._buildSVG(g, RADIUS, HALF_W, TERM_DY);

    const terminals = [
      { id: 'vm_left',  localX: -HALF_W, localY: TERM_DY, connected: false, accepts: 'wire' },
      { id: 'vm_right', localX: +HALF_W, localY: TERM_DY, connected: false, accepts: 'wire' },
    ];

    super({ id, type: 'voltmeter', svgGroup: g, terminals });

    this._emfText = emfText;
    componentsLayer.appendChild(g);
  }

  /**
   * Update the displayed EMF value.
   * @param {number|null} value  — voltage in volts, or null to show "—"
   */
  setEMF(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      this._emfText.textContent = '—';
      this.svgGroup.classList.remove('voltmeter-live');
    } else {
      this._emfText.textContent = `${value.toFixed(2)} V`;
      this.svgGroup.classList.add('voltmeter-live');
    }
  }

  // ── SVG construction ────────────────────────────────────────────────────

  static _buildSVG(g, r, halfW, termDy) {
    // Outer circle
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', 0);
    circle.setAttribute('cy', 0);
    circle.setAttribute('r', r);
    circle.classList.add('voltmeter-body');
    g.appendChild(circle);

    // "V" label (symbol)
    const vLabel = document.createElementNS(SVG_NS, 'text');
    vLabel.setAttribute('x', 0);
    vLabel.setAttribute('y', -6);
    vLabel.setAttribute('text-anchor', 'middle');
    vLabel.setAttribute('dominant-baseline', 'middle');
    vLabel.classList.add('voltmeter-symbol');
    vLabel.textContent = 'V';
    g.appendChild(vLabel);

    // EMF readout below symbol
    const emfText = document.createElementNS(SVG_NS, 'text');
    emfText.setAttribute('x', 0);
    emfText.setAttribute('y', 10);
    emfText.setAttribute('text-anchor', 'middle');
    emfText.setAttribute('dominant-baseline', 'middle');
    emfText.classList.add('voltmeter-emf');
    emfText.textContent = '— V';
    g.appendChild(emfText);

    // Left lead: from circle edge to terminal
    const leftLead = document.createElementNS(SVG_NS, 'line');
    leftLead.setAttribute('x1', -r * 0.7);
    leftLead.setAttribute('y1', r * 0.7);
    leftLead.setAttribute('x2', -halfW);
    leftLead.setAttribute('y2', termDy);
    leftLead.classList.add('voltmeter-lead');
    g.appendChild(leftLead);

    // Left terminal dot
    const leftDot = document.createElementNS(SVG_NS, 'circle');
    leftDot.setAttribute('cx', -halfW);
    leftDot.setAttribute('cy', termDy);
    leftDot.setAttribute('r', 5);
    leftDot.setAttribute('data-terminal', 'vm_left');
    leftDot.classList.add('terminal-dot');
    g.appendChild(leftDot);

    // Left polarity label (−)
    const leftLabel = document.createElementNS(SVG_NS, 'text');
    leftLabel.setAttribute('x', -halfW);
    leftLabel.setAttribute('y', termDy - 10);
    leftLabel.setAttribute('text-anchor', 'middle');
    leftLabel.classList.add('voltmeter-polarity');
    leftLabel.textContent = '−';
    g.appendChild(leftLabel);

    // Right lead
    const rightLead = document.createElementNS(SVG_NS, 'line');
    rightLead.setAttribute('x1', r * 0.7);
    rightLead.setAttribute('y1', r * 0.7);
    rightLead.setAttribute('x2', halfW);
    rightLead.setAttribute('y2', termDy);
    rightLead.classList.add('voltmeter-lead');
    g.appendChild(rightLead);

    // Right terminal dot
    const rightDot = document.createElementNS(SVG_NS, 'circle');
    rightDot.setAttribute('cx', halfW);
    rightDot.setAttribute('cy', termDy);
    rightDot.setAttribute('r', 5);
    rightDot.setAttribute('data-terminal', 'vm_right');
    rightDot.classList.add('terminal-dot');
    g.appendChild(rightDot);

    // Right polarity label (+)
    const rightLabel = document.createElementNS(SVG_NS, 'text');
    rightLabel.setAttribute('x', halfW);
    rightLabel.setAttribute('y', termDy - 10);
    rightLabel.setAttribute('text-anchor', 'middle');
    rightLabel.classList.add('voltmeter-polarity');
    rightLabel.textContent = '+';
    g.appendChild(rightLabel);

    return emfText;
  }
}
