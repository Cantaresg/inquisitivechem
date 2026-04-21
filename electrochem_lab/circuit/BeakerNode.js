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
const LIQ_Y_TOP    = 52;   // matches liquid fill rect y (see _buildSVG)
const LIQ_Y_BOTTOM = BH;   // beaker interior bottom
const LIQ_HALF_W   = BW / 2 - WALL;  // 165 px either side of centre

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
    const outerLeft = -halfW;
    const outerRight = halfW;
    const wallFoot = 8;
    const wallPath = [
      `M ${outerLeft} 0`,
      `L ${outerLeft} ${bh - wallFoot}`,
      `Q ${outerLeft} ${bh} ${outerLeft + wallFoot} ${bh}`,
      `L ${outerRight - wallFoot} ${bh}`,
      `Q ${outerRight} ${bh} ${outerRight} ${bh - wallFoot}`,
      `L ${outerRight} 0`,
    ].join(' ');
    const innerLeft = outerLeft + 18;
    const innerRight = outerRight - 18;
    const innerBottom = bh - 18;
    const frontInnerLeft = outerLeft + 26;
    const frontInnerRight = outerRight - 26;
    const liquidInset = 10;
    const liquidLeft = outerLeft + liquidInset;
    const liquidRight = outerRight - liquidInset;
    const liquidBottom = bh - 10;
    const meniscusY = 52;
    const rearRimY = 18;
    const clipId = `beaker-clip-${Math.random().toString(36).slice(2, 7)}`;

    const rearRim = document.createElementNS(SVG_NS, 'path');
    rearRim.setAttribute(
      'd',
      `M ${innerLeft + 6} ${rearRimY} C ${-halfW * 0.42} ${rearRimY - 7}, ${halfW * 0.42} ${rearRimY - 7}, ${innerRight - 6} ${rearRimY}`,
    );
    rearRim.classList.add('beaker-back-rim');
    g.appendChild(rearRim);

    const backFrame = document.createElementNS(SVG_NS, 'path');
    backFrame.setAttribute('d', wallPath);
    backFrame.setAttribute('fill', 'none');
    backFrame.setAttribute('stroke-width', '8');
    backFrame.setAttribute('stroke-linecap', 'round');
    backFrame.setAttribute('stroke-linejoin', 'round');
    backFrame.classList.add('beaker-back-wall');
    g.appendChild(backFrame);

    // ── Liquid fill (clipped to beaker interior) ──────────────────────
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipShape = document.createElementNS(SVG_NS, 'path');
    clipShape.setAttribute(
      'd',
      [
        `M ${liquidLeft} 2`,
        `L ${liquidLeft} ${liquidBottom - wallFoot}`,
        `Q ${liquidLeft} ${liquidBottom} ${liquidLeft + wallFoot} ${liquidBottom}`,
        `L ${liquidRight - wallFoot} ${liquidBottom}`,
        `Q ${liquidRight} ${liquidBottom} ${liquidRight} ${liquidBottom - wallFoot}`,
        `L ${liquidRight} 2`,
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
    liquidFill.setAttribute('fill',   'transparent');
    liquidFill.setAttribute('opacity', '0');
    liquidFill.setAttribute('clip-path', `url(#${clipId})`);
    liquidFill.classList.add('beaker-liquid-fill');
    g.appendChild(liquidFill);

    const liquidSheen = document.createElementNS(SVG_NS, 'path');
    liquidSheen.setAttribute(
      'd',
      `M ${frontInnerLeft + 6} ${meniscusY + 5} C ${-halfW * 0.36} ${meniscusY - 1}, ${halfW * 0.36} ${meniscusY - 1}, ${frontInnerRight - 6} ${meniscusY + 5} `
      + `L ${frontInnerRight - 6} ${liquidBottom - 10} L ${frontInnerLeft + 6} ${liquidBottom - 10} Z`,
    );
    liquidSheen.setAttribute('clip-path', `url(#${clipId})`);
    liquidSheen.classList.add('beaker-liquid-sheen');
    g.appendChild(liquidSheen);

    const meniscus = document.createElementNS(SVG_NS, 'path');
    meniscus.setAttribute(
      'd',
      `M ${frontInnerLeft + 2} ${meniscusY} C ${-halfW * 0.34} ${meniscusY - 8}, ${halfW * 0.34} ${meniscusY - 8}, ${frontInnerRight - 2} ${meniscusY}`,
    );
    meniscus.classList.add('beaker-meniscus');
    g.appendChild(meniscus);

    const frontFrame = document.createElementNS(SVG_NS, 'path');
    frontFrame.setAttribute('d', wallPath);
    frontFrame.setAttribute('fill', 'none');
    frontFrame.setAttribute('stroke-width', '5');
    frontFrame.setAttribute('stroke-linecap', 'round');
    frontFrame.setAttribute('stroke-linejoin', 'round');
    frontFrame.classList.add('beaker-glass-wall');
    g.appendChild(frontFrame);

    const lipLeft = document.createElementNS(SVG_NS, 'path');
    lipLeft.setAttribute('d', `M ${-halfW - 4} 0 L ${-halfW + 16} 0`);
    lipLeft.classList.add('beaker-top-lip');
    g.appendChild(lipLeft);

    const lipRight = document.createElementNS(SVG_NS, 'path');
    lipRight.setAttribute('d', `M ${halfW - 16} 0 L ${halfW + 4} 0`);
    lipRight.classList.add('beaker-top-lip');
    g.appendChild(lipRight);

    const frontHighlights = document.createElementNS(SVG_NS, 'g');
    frontHighlights.classList.add('beaker-glass-highlights');

    const leftHighlight = document.createElementNS(SVG_NS, 'path');
    leftHighlight.setAttribute('d', `M ${outerLeft + 14} 18 L ${outerLeft + 14} ${bh - 20}`);
    leftHighlight.classList.add('beaker-glass-highlight', 'beaker-glass-highlight-left');
    frontHighlights.appendChild(leftHighlight);

    const rightHighlight = document.createElementNS(SVG_NS, 'path');
    rightHighlight.setAttribute('d', `M ${outerRight - 14} 18 L ${outerRight - 14} ${bh - 20}`);
    rightHighlight.classList.add('beaker-glass-highlight', 'beaker-glass-highlight-right');
    frontHighlights.appendChild(rightHighlight);

    const floorLine = document.createElementNS(SVG_NS, 'path');
    floorLine.setAttribute('d', `M ${frontInnerLeft + 12} ${innerBottom} L ${frontInnerRight - 12} ${innerBottom}`);
    floorLine.classList.add('beaker-floor-line');
    frontHighlights.appendChild(floorLine);

    g.appendChild(frontHighlights);

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
