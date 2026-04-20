/**
 * circuit/BatteryNode.js
 * The DC power supply — pre-placed fixed component.
 *
 * Local coordinate origin is the centre of the battery body.
 * Terminal positions (local):
 *   bat_pos — (0, -44)  top  [positive / conventional current out]
 *   bat_neg — (0, +44)  bottom [negative / conventional current in]
 *
 * The battery is not draggable; it is always placed at a fixed canvas position
 * set by CircuitCanvas._initLayout().
 */
import { ComponentNode } from './ComponentNode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Half-height of the battery body (px). Terminal pads sit just outside this. */
const BODY_H = 49;
/** Terminal y offset from centre (places the pad slightly outside the body). */
const TERM_Y = BODY_H + 6;   // 55 px

export class BatteryNode extends ComponentNode {
  /**
   * @param {object} opts
   * @param {string}       opts.id
   * @param {SVGGElement}  opts.componentsLayer — parent <g> in the SVG
   */
  constructor({ id, componentsLayer }) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-node-id', id);
    g.classList.add('battery-node', 'circuit-node');

    BatteryNode._buildSVG(g, TERM_Y);

    const terminals = [
      { id: 'bat_pos', localX: 0, localY: -TERM_Y, connected: false, accepts: 'wire' },
      { id: 'bat_neg', localX: 0, localY: +TERM_Y, connected: false, accepts: 'wire' },
    ];

    super({ id, type: 'battery', svgGroup: g, terminals, data: { isPower: true } });
    componentsLayer.appendChild(g);
  }

  /** Battery cannot be dragged — override moveTo to make it public but note it is
   *  called once during layout initialisation and then never again. */

  // ── SVG drawing ───────────────────────────────────────────────────────

  static _buildSVG(g, termY) {
    const W = 47, H = BODY_H * 2;

    // Body outline
    const body = document.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x',  -W / 2);
    body.setAttribute('y',  -BODY_H);
    body.setAttribute('width',  W);
    body.setAttribute('height', H);
    body.setAttribute('rx', 5);
    body.classList.add('battery-body');
    g.appendChild(body);

    // IEC battery lines (alternating long/short), centred on x=0
    const lines = [
      { y: -21, half: 18, cls: 'battery-line-long'  },
      { y: -11, half: 10, cls: 'battery-line-short' },
      { y:   0, half: 18, cls: 'battery-line-long'  },
      { y: +11, half: 10, cls: 'battery-line-short' },
      { y: +21, half: 18, cls: 'battery-line-long'  },
    ];
    for (const { y, half, cls } of lines) {
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', -half); ln.setAttribute('y1', y);
      ln.setAttribute('x2', +half); ln.setAttribute('y2', y);
      ln.classList.add(cls);
      g.appendChild(ln);
    }

    // "DC" label
    const dc = document.createElementNS(SVG_NS, 'text');
    dc.setAttribute('x', 0); dc.setAttribute('y', BODY_H - 4);
    dc.classList.add('battery-dc-label');
    dc.textContent = 'DC';
    g.appendChild(dc);

    // + / − pole labels
    const posLabel = document.createElementNS(SVG_NS, 'text');
    posLabel.setAttribute('x', 0); posLabel.setAttribute('y', -BODY_H - 7);
    posLabel.classList.add('battery-pole-label', 'pole-pos');
    posLabel.textContent = '+';
    g.appendChild(posLabel);

    const negLabel = document.createElementNS(SVG_NS, 'text');
    negLabel.setAttribute('x', 0); negLabel.setAttribute('y', BODY_H + 17);
    negLabel.classList.add('battery-pole-label', 'pole-neg');
    negLabel.textContent = '−';
    g.appendChild(negLabel);

    // Lead lines from body to terminal pads
    for (const [sign, poleCls] of [[-1, 'lead-pos'], [+1, 'lead-neg']]) {
      const lead = document.createElementNS(SVG_NS, 'line');
      lead.setAttribute('x1', 0); lead.setAttribute('y1', sign * BODY_H);
      lead.setAttribute('x2', 0); lead.setAttribute('y2', sign * (termY - 4));
      lead.classList.add('battery-lead', poleCls);
      g.appendChild(lead);
    }

    // Terminal pads (clickable)
    for (const [termId, sign] of [['bat_pos', -1], ['bat_neg', +1]]) {
      const pad = document.createElementNS(SVG_NS, 'circle');
      pad.setAttribute('cx', 0);
      pad.setAttribute('cy', sign * termY);
      pad.setAttribute('r',  9);
      pad.setAttribute('data-terminal', termId);
      pad.classList.add('terminal-dot');
      g.appendChild(pad);
    }

    // Fixed label below battery
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', 0);
    label.setAttribute('y', termY + 16);
    label.classList.add('node-label');
    label.textContent = 'Battery';
    g.appendChild(label);
  }

  // ── Orientation ───────────────────────────────────────────────────────

  /**
   * Override moveTo to include optional rotation so battery can be placed
   * horizontally (rotate -90°) with +/− terminals on left / right.
   */
  moveTo(x, y) {
    this._x = x;
    this._y = y;
    const rot = this._horizontal ? ' rotate(-90)' : '';
    this.svgGroup.setAttribute('transform', `translate(${x},${y})${rot}`);
    this.svgGroup.ownerSVGElement?.dispatchEvent(
      new CustomEvent('node:moved', { bubbles: false, detail: { node: this } })
    );
  }

  /** Orient the battery horizontally (bat_pos left, bat_neg right). */
  setHorizontal(on) {
    this._horizontal = !!on;
    this.moveTo(this._x ?? 0, this._y ?? 0);
  }
}
