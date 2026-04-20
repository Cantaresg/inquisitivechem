/**
 * circuit/SaltBridgeNode.js
 * Static SVG salt bridge connecting two beakers in EC Cell mode.
 *
 * Renders as an inverted U-tube path straddling the two beaker openings.
 * Not draggable; repositioned by calling setPositions().
 *
 * This component has no terminals — it is a visual-only element.
 */

const SVG_NS  = 'http://www.w3.org/2000/svg';
const TUBE_W  = 14;    // tube inner width in px
const ARCH_H  = 50;    // how far above the beaker tops the arch rises

export class SaltBridgeNode {
  /**
   * @param {object} opts
   * @param {string}      opts.id
   * @param {SVGGElement} opts.layer  — parent SVG layer to append to
   */
  constructor({ id, layer }) {
    this.id = id;

    this._g    = document.createElementNS(SVG_NS, 'g');
    this._g.setAttribute('data-node-id', id);
    this._g.classList.add('salt-bridge-node');

    // Outer tube path (filled)
    this._outerPath = document.createElementNS(SVG_NS, 'path');
    this._outerPath.classList.add('salt-bridge-outer');
    this._g.appendChild(this._outerPath);

    // Inner tube path (liquid fill)
    this._innerPath = document.createElementNS(SVG_NS, 'path');
    this._innerPath.classList.add('salt-bridge-inner');
    this._g.appendChild(this._innerPath);

    // Label
    this._label = document.createElementNS(SVG_NS, 'text');
    this._label.classList.add('salt-bridge-label');
    this._label.textContent = 'Salt Bridge';
    this._label.setAttribute('text-anchor', 'middle');
    this._g.appendChild(this._label);

    layer.prepend(this._g);   // render below electrodes
  }

  /**
   * Reposition the salt bridge to connect the tops of two beakers.
   * @param {{ x: number, y: number }} leftTop   — top-centre of left beaker
   * @param {{ x: number, y: number }} rightTop  — top-centre of right beaker
   */
  setPositions(leftTop, rightTop) {
    const lx = leftTop.x;
    const ly = leftTop.y;
    const rx = rightTop.x;
    const ry = rightTop.y;
    const mx = (lx + rx) / 2;
    const topY = Math.min(ly, ry) - ARCH_H;

    const hw = TUBE_W / 2;

    // Outer tube: left post + arch + right post (open bottom)
    // Uses a single path drawn clockwise then back up the inside.
    const outerD = [
      // left post outer edge → up to arch start
      `M ${lx - hw} ${ly}`,
      `L ${lx - hw} ${topY + 20}`,
      // arch (left outer edge, top, right outer edge)
      `Q ${lx - hw} ${topY} ${mx} ${topY}`,
      `Q ${rx + hw} ${topY} ${rx + hw} ${topY + 20}`,
      // right post outer edge → down
      `L ${rx + hw} ${ry}`,
      // right post inner edge → up
      `L ${rx - hw} ${ry}`,
      `L ${rx - hw} ${topY + 20}`,
      // arch (right inner edge, top, left inner edge)
      `Q ${rx - hw} ${topY + TUBE_W} ${mx} ${topY + TUBE_W}`,
      `Q ${lx + hw} ${topY + TUBE_W} ${lx + hw} ${topY + 20}`,
      // left post inner edge → down
      `L ${lx + hw} ${ly}`,
      'Z',
    ].join(' ');
    this._outerPath.setAttribute('d', outerD);

    // Inner fill path (slightly inset)
    const iw = hw * 0.5;
    const innerD = [
      `M ${lx - iw} ${ly}`,
      `L ${lx - iw} ${topY + 24}`,
      `Q ${lx - iw} ${topY + TUBE_W * 0.4} ${mx} ${topY + TUBE_W * 0.4}`,
      `Q ${rx + iw} ${topY + TUBE_W * 0.4} ${rx + iw} ${topY + 24}`,
      `L ${rx + iw} ${ry}`,
      `L ${rx - iw} ${ry}`,
      `L ${rx - iw} ${topY + 24}`,
      `Q ${rx - iw} ${topY + TUBE_W * 0.6} ${mx} ${topY + TUBE_W * 0.6}`,
      `Q ${lx + iw} ${topY + TUBE_W * 0.6} ${lx + iw} ${topY + 24}`,
      `L ${lx + iw} ${ly}`,
      'Z',
    ].join(' ');
    this._innerPath.setAttribute('d', innerD);

    // Label centred at arch top
    this._label.setAttribute('x', mx);
    this._label.setAttribute('y', topY - 6);
  }

  /** Remove from DOM. */
  destroy() {
    this._g.remove();
  }
}
