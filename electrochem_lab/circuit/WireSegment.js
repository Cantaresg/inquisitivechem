/**
 * circuit/WireSegment.js
 * One wire connecting two terminals.  Draws a 3-segment Manhattan (orthogonal)
 * polyline path inside the wires-layer SVG group.
 */
export class WireSegment {
  /**
   * @param {object} opts
   * @param {string}       opts.id         — unique wire id
   * @param {SVGGElement}  opts.layer      — the <g id="wires-layer"> element
   * @param {{ nodeId, terminalId }} opts.from
   * @param {{ nodeId, terminalId }} opts.to
   */
  constructor({ id, layer, from, to }) {
    this.id   = id;
    this.from = from;   // { nodeId, terminalId }
    this.to   = to;

    this._path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this._path.setAttribute('fill',              'none');
    this._path.setAttribute('stroke-linecap',    'round');
    this._path.setAttribute('stroke-linejoin',   'round');
    this._path.setAttribute('stroke-width',      '2.5');
    this._path.setAttribute('data-wire-id',      id);
    this._path.classList.add('wire-segment', 'wire-dead');
    layer.appendChild(this._path);

    // Clicking a wire selects/removes it
    this._path.style.cursor = 'pointer';
  }

  /** Recompute the SVG path given two world-coordinate points. */
  reroute(p1, p2) {
    this._path.setAttribute('d', WireSegment.routeManhattan(p1, p2));
  }

  setLive(on) {
    this._path.classList.toggle('wire-live', on);
    this._path.classList.toggle('wire-dead', !on);
  }

  setSelected(on) {
    this._path.classList.toggle('wire-selected', on);
  }

  destroy() {
    this._path.remove();
  }

  get svgPath() { return this._path; }

  /**
   * Three-segment Manhattan route (Z-shape):
   *   P1 → horizontal to midX → vertical → horizontal to P2
   * @param {{ x, y }} p1
   * @param {{ x, y }} p2
   * @returns {string} SVG path `d` attribute value
   */
  static routeManhattan(p1, p2) {
    const mx = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} L ${mx} ${p1.y} L ${mx} ${p2.y} L ${p2.x} ${p2.y}`;
  }
}
