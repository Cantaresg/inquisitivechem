/**
 * circuit/CircuitCanvas.js
 * Owns the SVG element and orchestrates all circuit interactions:
 *   • Pre-places the BatteryNode and BeakerNode at layout time.
 *   • spawnComponent(electrodeData, dropX, dropY) — creates an ElectrodeNode.
 *   • Pointer-event handling: drag placed electrodes, draw wires.
 *   • Immersion detection: electrode rod_bottom inside beaker liquid zone.
 *   • Emits 'topology-changed' CustomEvent on the SVG when anything changes.
 *
 * The SVG uses screen-pixel coordinates (no viewBox) so clientToSVG is a
 * simple getBoundingClientRect() subtraction.
 */

import { BatteryNode }   from './BatteryNode.js';
import { ElectrodeNode, ROD_LENGTH } from './ElectrodeNode.js';
import { BeakerNode }   from './BeakerNode.js';
import { WireManager }   from './WireManager.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let _nodeIdCounter = 0;

export class CircuitCanvas {
  /**
   * @param {SVGElement} svgEl — the <svg id="circuit-svg"> element
   */
  constructor(svgEl) {
    this.svg = svgEl;

    // Layer groups (already in the SVG via index.html)
    this._beakerLayer     = svgEl.querySelector('#beaker-layer');
    this._wiresLayer      = svgEl.querySelector('#wires-layer');
    this._componentsLayer = svgEl.querySelector('#components-layer');

    /** Map<id, ElectrodeNode> — only electrode nodes (not battery/beaker) */
    this.nodes = new Map();
    /** Map<id, WireSegment> */
    this.wires = new Map();

    this._wireManager = new WireManager(svgEl, this._wiresLayer);

    /** Currently dragging: { node, offsetX, offsetY } | null */
    this._dragState = null;
    /** Whether the circuit is currently in the "live" (valid) state */
    this._isLive = false;

    // Wire-draw cursor state for the SVG element
    this._drawMode = false;

    // Initialise fixed components after a frame so SVG has a real size
    requestAnimationFrame(() => this._initLayout());

    this._bindEvents();
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Create a new ElectrodeNode at the given SVG world position.
   * Called when a card is dropped from the left panel onto the canvas.
   * @param {object} electrodeData — record from ELECTRODE_DB
   * @param {number} dropX         — SVG world x where the user released
   * @param {number} dropY         — SVG world y where the user released
   * @returns {ElectrodeNode}
   */
  spawnComponent(electrodeData, dropX, dropY) {
    if (this.nodes.size >= 2) {
      this._toast('Only two electrodes can be placed at once.');
      return null;
    }
    const id   = `electrode_${++_nodeIdCounter}`;
    const node = new ElectrodeNode({
      id,
      componentsLayer: this._componentsLayer,
      electrodeData,
      x: dropX - 6,  // centre rod on drop point
      y: dropY,
    });
    this.nodes.set(id, node);
    this._emitTopologyChange();
    return node;
  }

  /** Remove an electrode from the canvas. */
  removeComponent(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from beaker immersion tracking
    if (node.isSubmerged) {
      node.setSubmerged(false);
      this.beakerNode.removeSubmerged(node.id);
    }

    // Remove all wires touching this node
    for (const [wireId, wire] of this.wires) {
      if (wire.from.nodeId === nodeId || wire.to.nodeId === nodeId) {
        this._removeWire(wireId);
      }
    }

    node.destroy();
    this.nodes.delete(nodeId);
    this._emitTopologyChange();
  }

  /** Set/clear the active electrolyte (called by ElectrolytePanel in Phase 4). */
  setElectrolyte(electrolyteRecord) {
    this._electrolyte = electrolyteRecord;
    this.beakerNode.setElectrolyte(electrolyteRecord);
    this._emitTopologyChange();
  }

  /** Called by SimController to visually indicate a live circuit. */
  setLive(on) {
    this._isLive = on;
    this._wireManager.setAllLive(on);
    this.batteryNode.setLive(on);
    this.beakerNode.setLive(on);
    for (const node of this.nodes.values()) node.setLive(on);
  }

  /** Set the polarity labels on both electrode nodes. */
  setPolarity(anodeId, cathodeId) {
    for (const [id, node] of this.nodes) {
      if (id === anodeId)   node.setPolarity('anode');
      else if (id === cathodeId) node.setPolarity('cathode');
      else                  node.setPolarity(null);
    }
  }

  // ── Layout initialisation ─────────────────────────────────────────────

  _initLayout() {
    const rect = this.svg.getBoundingClientRect();
    const W    = rect.width  || 800;
    const H    = rect.height || 480;

    // Beaker: top-centre at ~50% width, ~40% height
    const bkrX = Math.round(W * 0.52);
    const bkrY = Math.round(H * 0.40);

    // Battery: centred horizontally above the beaker
    const batX = bkrX;
    const batY = Math.round(bkrY - 170);

    this.batteryNode = new BatteryNode({
      id:               'battery',
      componentsLayer:  this._componentsLayer,
    });
    this.batteryNode.moveTo(batX, batY);
    this.batteryNode.setHorizontal(true);

    this.beakerNode = new BeakerNode({
      id:          'beaker',
      beakerLayer: this._beakerLayer,
      cx:          bkrX,
      cy:          bkrY,
    });

    // Stash electrolyte state
    this._electrolyte = null;
  }

  // ── Event binding ─────────────────────────────────────────────────────

  _bindEvents() {
    this.svg.addEventListener('pointerdown',  this._onPointerDown.bind(this));
    this.svg.addEventListener('pointermove',  this._onPointerMove.bind(this));
    this.svg.addEventListener('pointerup',    this._onPointerUp.bind(this));
    this.svg.addEventListener('pointercancel',this._onPointerUp.bind(this));
    this.svg.addEventListener('keydown',      this._onKeyDown.bind(this));

    // Wire removal (emitted by WireManager on wire click)
    this.svg.addEventListener('wire:remove', (e) => {
      this._removeWire(e.detail.wireId);
      this._emitTopologyChange();
    });
  }

  // ── Pointer events ────────────────────────────────────────────────────

  _onPointerDown(e) {
    const svgPt = this._clientToSVG(e.clientX, e.clientY);

    // ── Terminal click → wire draw mode ──────────────────────────────
    const termEl = e.target.closest('[data-terminal]');
    if (termEl) {
      const nodeEl    = termEl.closest('[data-node-id]');
      const nodeId    = nodeEl?.dataset.nodeId;
      const termId    = termEl.dataset.terminal;
      const node      = this._findNode(nodeId);

      if (!node) return;

      const terminal = node.getTerminal(termId);
      // rod_bottom is a slot terminal, not a wire terminal
      if (!terminal || terminal.accepts !== 'wire') return;
      // Don't start a wire from an already-connected terminal
      if (terminal.connected) {
        this._toast('Disconnect the existing wire before drawing another.');
        return;
      }

      this._wireManager.startDraw(
        { nodeId: node.id, terminalId: termId },
        node.getTerminalPos(termId)
      );
      this.svg.style.cursor = 'crosshair';
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ── Electrode body → drag ──────────────────────────────────────────
    const nodeEl = e.target.closest('[data-node-id]');
    if (!nodeEl) return;

    const nodeId = nodeEl.dataset.nodeId;
    // Battery and beaker are not draggable
    if (nodeId === 'battery' || nodeId === 'beaker') return;

    const node = this.nodes.get(nodeId);
    if (!node) return;

    this._dragState = {
      node,
      offsetX: svgPt.x - node.x,
      offsetY: svgPt.y - node.y,
    };
    this.svg.setPointerCapture(e.pointerId);
    this.svg.style.cursor = 'grabbing';
    e.preventDefault();
  }

  _onPointerMove(e) {
    const svgPt = this._clientToSVG(e.clientX, e.clientY);

    // Wire draw mode: update preview
    if (this._wireManager.isDrawing) {
      this._wireManager.updatePreview(svgPt);
      this._highlightNearTerminals(svgPt);
      return;
    }

    // Electrode drag
    if (!this._dragState) return;
    const { node, offsetX, offsetY } = this._dragState;

    const newX = svgPt.x - offsetX;
    const newY = svgPt.y - offsetY;
    node.moveTo(newX, newY);

    // Reroute attached wires
    this._rerouteWiresForNode(node);

    // Check electrode immersion in beaker liquid
    this._checkImmersion(node);
  }

  _onPointerUp(e) {
    const svgPt = this._clientToSVG(e.clientX, e.clientY);

    // ── Complete wire draw ─────────────────────────────────────────────
    if (this._wireManager.isDrawing) {
      this.svg.style.cursor = '';
      this._clearTerminalHighlights();

      const termEl = document.elementFromPoint(e.clientX, e.clientY)
                              ?.closest('[data-terminal]');
      if (termEl) {
        const nodeEl  = termEl.closest('[data-node-id]');
        const nodeId  = nodeEl?.dataset.nodeId;
        const termId  = termEl.dataset.terminal;
        const toNode  = this._findNode(nodeId);

        if (toNode) {
          const toTerminal = toNode.getTerminal(termId);
          if (toTerminal && toTerminal.accepts === 'wire' && !toTerminal.connected) {
            const toPt  = toNode.getTerminalPos(termId);
            const wire  = this._wireManager.completeDraw(
              { nodeId: toNode.id, terminalId: termId }, toPt
            );
            if (wire) {
              // Mark both terminals as connected
              // (get the from info before completeDraw cleared it — WireManager
              //  already stored it in the returned WireSegment)
              this.wires.set(wire.id, wire);
              // Mark source terminal connected (WireManager stored from in wire.from)
              const fromNode = this._findNode(wire.from.nodeId);
              fromNode?.setTerminalConnected(wire.from.terminalId, true);
              toNode.setTerminalConnected(wire.to.terminalId, true);
              this._emitTopologyChange();
              return;
            }
          }
        }
      }
      // Drop on nothing — cancel
      this._wireManager.cancel();
      return;
    }

    // ── End electrode drag ─────────────────────────────────────────────
    if (this._dragState) {
      this.svg.style.cursor = '';
      this._dragState = null;
      this.svg.releasePointerCapture(e.pointerId);
      this._emitTopologyChange();
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Escape' && this._wireManager.isDrawing) {
      this._wireManager.cancel();
      this.svg.style.cursor = '';
      this._clearTerminalHighlights();
    }

    // Delete selected electrode (if one is focused)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const focused = document.activeElement?.closest('[data-node-id]');
      if (focused) {
        const id = focused.dataset.nodeId;
        if (id !== 'battery' && id !== 'beaker') {
          this.removeComponent(id);
        }
      }
    }
  }

  // ── Immersion detection ───────────────────────────────────────────────

  /**
   * Check whether rod_bottom of the given electrode is inside the beaker liquid
   * zone and update isSubmerged accordingly. Called during drag move.
   */
  _checkImmersion(electrodeNode) {
    const bottomPt = electrodeNode.getTerminalPos('rod_bottom');
    if (!bottomPt) return;

    const b = this.beakerNode.getLiquidBoundsWorld();
    const inside = bottomPt.x >= b.xMin && bottomPt.x <= b.xMax
                && bottomPt.y >= b.yMin && bottomPt.y <= b.yMax;

    if (inside && !electrodeNode.isSubmerged) {
      electrodeNode.setSubmerged(true);
      this.beakerNode.addSubmerged(electrodeNode.id);
      this._emitTopologyChange();
    } else if (!inside && electrodeNode.isSubmerged) {
      electrodeNode.setSubmerged(false);
      this.beakerNode.removeSubmerged(electrodeNode.id);
      this._emitTopologyChange();
    }
  }

  // ── Wire helpers ──────────────────────────────────────────────────────

  _removeWire(wireId) {
    const wire = this.wires.get(wireId);
    if (!wire) return;

    // Free both terminals
    const fromNode = this._findNode(wire.from.nodeId);
    const toNode   = this._findNode(wire.to.nodeId);
    fromNode?.setTerminalConnected(wire.from.terminalId, false);
    toNode?.setTerminalConnected(wire.to.terminalId,   false);

    wire.destroy();
    this.wires.delete(wireId);
  }

  _rerouteWiresForNode(node) {
    for (const wire of this.wires.values()) {
      const touchesNode =
        wire.from.nodeId === node.id || wire.to.nodeId === node.id;
      if (!touchesNode) continue;

      const fromNode = this._findNode(wire.from.nodeId);
      const toNode   = this._findNode(wire.to.nodeId);
      if (!fromNode || !toNode) continue;

      const fromPt = fromNode.getTerminalPos(wire.from.terminalId);
      const toPt   = toNode.getTerminalPos(wire.to.terminalId);
      if (fromPt && toPt) {
        this._wireManager.rerouteWire(wire, fromPt, toPt);
      }
    }
  }

  // ── Terminal highlight helpers ────────────────────────────────────────

  _highlightNearTerminals(svgPt) {
    const HIGHLIGHT_R = 40;
    for (const node of [this.batteryNode, ...this.nodes.values()]) {
      for (const [, tPos] of node.terminalPositions) {
        if (tPos.accepts !== 'wire' || tPos.connected) continue;
        const dist = Math.hypot(svgPt.x - tPos.x, svgPt.y - tPos.y);
        node.highlight(dist < HIGHLIGHT_R);
      }
    }
  }

  _clearTerminalHighlights() {
    this.batteryNode.highlight(false);
    for (const n of this.nodes.values()) n.highlight(false);
  }

  // ── Topology change ───────────────────────────────────────────────────

  _emitTopologyChange() {
    this.svg.dispatchEvent(
      new CustomEvent('topology-changed', { bubbles: false, detail: { canvas: this } })
    );
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  /** Convert browser clientX/Y to SVG viewport coordinates. */
  _clientToSVG(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * Find a node by id across battery, beaker, and electrode nodes.
   * @param {string} nodeId
   * @returns {ComponentNode | null}
   */
  _findNode(nodeId) {
    if (!nodeId) return null;
    if (nodeId === 'battery') return this.batteryNode;
    if (nodeId === 'beaker')  return this.beakerNode;
    return this.nodes.get(nodeId) ?? null;
  }

  _toast(msg) {
    this.svg.dispatchEvent(
      new CustomEvent('canvas:toast', { bubbles: false, detail: { msg } })
    );
  }
}
