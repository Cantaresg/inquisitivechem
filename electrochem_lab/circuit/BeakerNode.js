/**
 * circuit/BeakerNode.js
 * The electrolysis beaker — fixed, pre-placed component.
 *
 * Local coordinate origin is at the top-centre of the beaker opening.
 * Electrodes are detected as submerged when their rod_bottom falls inside
 * the liquid zone (localX ±LIQ_HALF_W, localY LIQ_Y_TOP–LIQ_Y_BOTTOM).
 *
 * The beaker has no wire terminals.
 */
import { ComponentNode } from './ComponentNode.js';

const SVG_NS      = 'http://www.w3.org/2000/svg';
const BW          = 338;   // beaker internal width  (260 × 1.3)
const BH          = 221;   // beaker internal height (170 × 1.3)
const WALL        = 4;     // glass wall thickness
const SLOT_OFFSET = 91;    // kept for backwards-compat export only  (70 × 1.3)
const SNAP_RADIUS  = 40;   // no longer used for snap, kept for import compat
const SLOT_DEPTH   = 130;  // kept for compat export  (100 × 1.3)

// Liquid interior bounds in local (beaker-origin) coordinates
const LIQ_Y_TOP    = 80;        // matches liquid fill rect y (see _buildSVG)
const LIQ_Y_BOTTOM = BH - 14;   // beaker interior bottom
const LIQ_HALF_W   = BW / 2 - 42;

export { SNAP_RADIUS, SLOT_OFFSET };

export class BeakerNode extends ComponentNode {
  /**
   * @param {object} opts
   * @param {string}       opts.id
   * @param {SVGGElement}  opts.beakerLayer   — parent <g> in the SVG
   * @param {number}       opts.cx            — SVG world x of beaker origin
   * @param {number}       opts.cy            — SVG world y of beaker origin
   */
  constructor({ id, beakerLayer, cx, cy }) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-node-id', id);
    g.classList.add('beaker-node');

    BeakerNode._buildSVG(g, BW, BH, SLOT_OFFSET);

    // Beaker has no wire terminals — terminal array is only for API consistency
    super({ id, type: 'beaker', svgGroup: g, terminals: [], data: {} });

    // Track which electrode IDs are currently submerged
    this._submergedIds = new Set();

    // Track current electrolyte for visual fill
    this._electrolyte = null;

    beakerLayer.appendChild(g);
    this.moveTo(cx, cy);
  }

  // ── Immersion management ───────────────────────────────────────────────

  /**
   * Returns the beaker's liquid zone in SVG world coordinates.
   * The beaker group has no rotation, only a translate, so world = local + origin.
   */
  getLiquidBoundsWorld() {
    return {
      xMin: this._x - LIQ_HALF_W,
      xMax: this._x + LIQ_HALF_W,
      yMin: this._y + LIQ_Y_TOP,
      yMax: this._y + LIQ_Y_BOTTOM,
    };
  }

  /** Record that an electrode is submerged. */
  addSubmerged(electrodeNodeId) {
    this._submergedIds.add(electrodeNodeId);
  }

  /** Release an electrode from the submerged set. */
  removeSubmerged(electrodeNodeId) {
    this._submergedIds.delete(electrodeNodeId);
  }

  /** How many electrodes are currently submerged. */
  get submergedCount() { return this._submergedIds.size; }

  // ── Electrolyte fill ──────────────────────────────────────────────────

  setElectrolyte(electrolyteRecord) {
    this._electrolyte = electrolyteRecord;
    const fill = this.svgGroup.querySelector('.beaker-liquid-fill');
    if (!fill) return;
    fill.setAttribute('fill', electrolyteRecord ? electrolyteRecord.colour : 'transparent');
    fill.setAttribute('opacity', electrolyteRecord ? '1' : '0');

    const label = this.svgGroup.querySelector('.beaker-electrolyte-label');
    if (label) label.textContent = electrolyteRecord ? electrolyteRecord.formula : '';
  }

  setLive(on) {
    this.svgGroup.classList.toggle('beaker-live', on);
  }

  // ── SVG drawing ───────────────────────────────────────────────────────

  static _buildSVG(g, bw, bh, slotOffset) {
    const halfW = bw / 2;
    const bodyWidth = bw - 78;
    const left = -Math.round(bodyWidth / 2);
    const right = Math.round(bodyWidth / 2);
    const lipRearY = 24;
    const lipHighlightY = 30;
    const bodyTopY = 36;
    const bottomY = bh;
    const cornerR = 13;

    const liquidInset = 10;
    const liquidLeft = left + liquidInset;
    const liquidRight = right - liquidInset;
    const liquidBottom = bottomY - 14;
    const meniscusY = LIQ_Y_TOP;
    const clipId = `beaker-clip-${Math.random().toString(36).slice(2, 7)}`;

    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipShape = document.createElementNS(SVG_NS, 'path');
    clipShape.setAttribute(
      'd',
      [
        `M ${liquidLeft} ${bodyTopY + 4}`,
        `L ${liquidLeft} ${liquidBottom - cornerR}`,
        `Q ${liquidLeft} ${liquidBottom} ${liquidLeft + cornerR} ${liquidBottom}`,
        `L ${liquidRight - cornerR} ${liquidBottom}`,
        `Q ${liquidRight} ${liquidBottom} ${liquidRight} ${liquidBottom - cornerR}`,
        `L ${liquidRight} ${bodyTopY + 4}`,
        'Z',
      ].join(' '),
    );
    clip.appendChild(clipShape);
    defs.appendChild(clip);
    g.appendChild(defs);

    const liquidFill = document.createElementNS(SVG_NS, 'rect');
    liquidFill.setAttribute('x', liquidLeft);
    liquidFill.setAttribute('y', meniscusY);
    liquidFill.setAttribute('width', liquidRight - liquidLeft);
    liquidFill.setAttribute('height', liquidBottom - meniscusY);
    liquidFill.setAttribute('fill', 'transparent');
    liquidFill.setAttribute('opacity', '0');
    liquidFill.setAttribute('clip-path', `url(#${clipId})`);
    liquidFill.classList.add('beaker-liquid-fill');
    g.appendChild(liquidFill);

    const bodyFront = document.createElementNS(SVG_NS, 'path');
    bodyFront.setAttribute(
      'd',
      [
        `M ${left} ${bodyTopY}`,
        `L ${left} ${bottomY - cornerR}`,
        `Q ${left} ${bottomY} ${left + cornerR} ${bottomY}`,
        `L ${right - cornerR} ${bottomY}`,
        `Q ${right} ${bottomY} ${right} ${bottomY - cornerR}`,
        `L ${right} ${bodyTopY}`,
      ].join(' '),
    );
    bodyFront.classList.add('beaker-body-front');
    g.appendChild(bodyFront);

    // ── Electrolyte label inside beaker ──────────────────────────────
    const eLabel = document.createElementNS(SVG_NS, 'text');
    eLabel.setAttribute('x', 0);
    eLabel.setAttribute('y', bh - 20);
    eLabel.classList.add('beaker-electrolyte-label');
    eLabel.textContent = '';
    g.appendChild(eLabel);

    // ── Beaker label at top ───────────────────────────────────────────
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', 0);
    label.setAttribute('y', bh + 28);
    label.classList.add('node-label');
    label.textContent = 'Electrolytic cell';
    g.appendChild(label);
  }
}
