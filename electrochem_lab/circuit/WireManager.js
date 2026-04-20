/**
 * circuit/WireManager.js
 * Manages wire-drawing interaction on the SVG circuit canvas.
 *
 * Flow:
 *   1. CircuitCanvas calls startDraw({ nodeId, terminalId }, worldPt)
 *      when the user clicks a free terminal.
 *   2. updatePreview(worldPt) is called on pointermove to animate
 *      the in-progress wire.
 *   3. completeDraw({ nodeId, terminalId }) finalises the wire, returns
 *      the new WireSegment, or null if the target is invalid.
 *   4. cancel() aborts draw mode.
 *
 * WireManager also owns the click-to-remove interaction on finished wires:
 *   wire.svgPath fires click → WireManager emits 'wire:remove' CustomEvent
 *   on the SVG element so CircuitCanvas can handle it.
 */
import { WireSegment } from './WireSegment.js';

let _wireIdCounter = 0;

export class WireManager {
  /**
   * @param {SVGElement}   svgEl      — the root <svg> element
   * @param {SVGGElement}  wiresLayer — the <g id="wires-layer"> group
   */
  constructor(svgEl, wiresLayer) {
    this._svg   = svgEl;
    this._layer = wiresLayer;

    /** Currently drawing: { fromNodeId, fromTerminalId, previewPath } | null */
    this._draw  = null;

    // In-progress preview path (dashed)
    this._preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this._preview.setAttribute('fill',         'none');
    this._preview.setAttribute('stroke-width', '2.5');
    this._preview.setAttribute('stroke-linecap', 'round');
    this._preview.classList.add('wire-preview');
    this._preview.style.display = 'none';
    wiresLayer.appendChild(this._preview);
  }

  get isDrawing() { return this._draw !== null; }

  // ── Draw mode ─────────────────────────────────────────────────────────

  /**
   * Begin drawing from a terminal.
   * @param {{ nodeId, terminalId }} from
   * @param {{ x, y }}              worldPt — current cursor position
   */
  startDraw(from, worldPt) {
    this._draw = { from, startPt: worldPt };
    this._preview.style.display = '';
    this._preview.setAttribute('d',
      `M ${worldPt.x} ${worldPt.y} L ${worldPt.x} ${worldPt.y}`);
  }

  /** Update the preview path as the cursor moves. */
  updatePreview(worldPt) {
    if (!this._draw) return;
    const s = this._draw.startPt;
    this._preview.setAttribute('d', WireSegment.routeManhattan(s, worldPt));
  }

  /**
   * Finalise the wire.
   * @param {{ nodeId, terminalId }} to
   * @param {{ x, y }}              worldPt — terminal world position
   * @returns {WireSegment | null}  — the new wire, or null if invalid
   */
  completeDraw(to, worldPt) {
    if (!this._draw) return null;
    const { from, startPt } = this._draw;
    this._cancelPreview();

    // Guard: cannot wire a terminal to itself
    if (from.nodeId === to.nodeId && from.terminalId === to.terminalId) return null;
    // Guard: cannot wire a terminal back to the same node's other terminal
    // (short-circuit directly on the battery, etc.) — allowed in real life but
    // confusing in O-Level; we do allow it so the validator can catch it.

    const id  = `wire_${++_wireIdCounter}`;
    const seg = new WireSegment({ id, layer: this._layer, from, to });
    seg.reroute(startPt, worldPt);

    // Click-to-remove listener
    seg.svgPath.addEventListener('click', (e) => {
      e.stopPropagation();
      this._svg.dispatchEvent(
        new CustomEvent('wire:remove', { bubbles: false, detail: { wireId: id } })
      );
    });

    return seg;
  }

  /** Abort draw mode without creating a wire. */
  cancel() {
    this._cancelPreview();
  }

  _cancelPreview() {
    this._draw = null;
    this._preview.style.display = 'none';
    this._preview.setAttribute('d', '');
  }

  // ── Rerouting ────────────────────────────────────────────────────────

  /**
   * Recompute a wire's path after one of its endpoint nodes has moved.
   * Caller provides the updated world positions of both terminals.
   * @param {WireSegment} wire
   * @param {{ x, y }}    fromPt
   * @param {{ x, y }}    toPt
   */
  rerouteWire(wire, fromPt, toPt) {
    wire.reroute(fromPt, toPt);
  }

  // ── Live state ───────────────────────────────────────────────────────

  setAllLive(on) {
    // Called by CircuitCanvas when the circuit is validated
    for (const path of this._layer.querySelectorAll('.wire-segment')) {
      path.classList.toggle('wire-live', on);
      path.classList.toggle('wire-dead', !on);
    }
  }
}
