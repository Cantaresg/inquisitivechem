/**
 * circuit/ComponentNode.js
 * Abstract base class for every placed SVG component on the circuit canvas.
 *
 * Subclasses (BatteryNode, ElectrodeNode, BeakerNode) extend this and pass
 * a pre-built SVGGElement + terminal descriptor array to the constructor.
 *
 * Terminal descriptor:
 *   { id, localX, localY, connected, accepts }
 *   • localX/localY — position in the component's local coordinate space
 *     (before the group's transform is applied).
 *   • connected — bool: true once a wire is attached to this terminal.
 *   • accepts — 'wire' | 'slot' | 'none'
 */
export class ComponentNode extends EventTarget {
  /**
   * @param {object} opts
   * @param {string}       opts.id         — unique instance id
   * @param {string}       opts.type       — 'battery' | 'electrode'
   * @param {SVGGElement}  opts.svgGroup   — the <g> already appended to the SVG
   * @param {object[]}     opts.terminals  — terminal descriptors
   * @param {object}       [opts.data]     — electrode record or arbitrary payload
   */
  constructor({ id, type, svgGroup, terminals, data = {} }) {
    super();
    this.id        = id;
    this.type      = type;
    this.svgGroup  = svgGroup;
    this.data      = data;
    this._terminals = terminals.map(t => ({ ...t })); // shallow clone each
    this._x        = 0;
    this._y        = 0;
  }

  get x() { return this._x; }
  get y() { return this._y; }

  // ── Terminal access ───────────────────────────────────────────────────

  /** Returns a descriptor object (mutable) for the given terminal id. */
  getTerminal(id) {
    return this._terminals.find(t => t.id === id) ?? null;
  }

  /**
   * Returns Map<terminalId, { x, y, id, connected, accepts }> in SVG
   * viewport (world) coordinates.
   */
  get terminalPositions() {
    const map = new Map();
    const svg = this.svgGroup.ownerSVGElement;
    const ctm = this.svgGroup.getCTM();
    if (!ctm) return map;

    for (const t of this._terminals) {
      const pt  = svg.createSVGPoint();
      pt.x = t.localX;
      pt.y = t.localY;
      const world = pt.matrixTransform(ctm);
      map.set(t.id, {
        x: world.x, y: world.y,
        id: t.id,
        connected: t.connected,
        accepts:   t.accepts,
      });
    }
    return map;
  }

  /** Convenience: get a single terminal's world position. */
  getTerminalPos(terminalId) {
    return this.terminalPositions.get(terminalId) ?? null;
  }

  setTerminalConnected(terminalId, connected) {
    const t = this.getTerminal(terminalId);
    if (t) t.connected = connected;

    // Update the terminal dot visual state
    const dot = this.svgGroup.querySelector(`[data-terminal="${terminalId}"]`);
    if (dot) dot.classList.toggle('terminal-connected', connected);
  }

  // ── Positioning ───────────────────────────────────────────────────────

  /** Move the component so its local origin lands at (x, y) in SVG coords. */
  moveTo(x, y) {
    this._x = x;
    this._y = y;
    this.svgGroup.setAttribute('transform', `translate(${x},${y})`);
    this.svgGroup.ownerSVGElement?.dispatchEvent(
      new CustomEvent('node:moved', { bubbles: false, detail: { node: this } })
    );
  }

  // ── Visual state ──────────────────────────────────────────────────────

  /** Accent highlight (used when a valid wire draw targets this node). */
  highlight(on) {
    this.svgGroup.classList.toggle('node-highlight', on);
  }

  /** Green "live" glow when circuit is closed. */
  setLive(on) {
    this.svgGroup.classList.toggle('node-live', on);
  }

  /** Remove the SVG group from the DOM and reset terminal states. */
  destroy() {
    this.svgGroup.remove();
    this._terminals.forEach(t => { t.connected = false; });
  }
}
