/**
 * circuit/CircuitValidator.js
 * BFS graph traversal to determine whether the electrolysis circuit is complete.
 *
 * A valid circuit requires:
 *   1. Battery is present (always true — it is pre-placed).
 *   2. Exactly two electrode nodes placed.
 *   3. Both electrodes are submerged in the beaker liquid.
 *   4. bat_pos is connected by wires to one electrode's rod_top (→ anode).
 *   5. bat_neg is connected by wires to the other electrode's rod_top (→ cathode).
 *   6. An electrolyte is selected.
 *
 * Polarity rule:
 *   Electrode reached from bat_pos = anode (oxidation, conventional current enters).
 *   Electrode reached from bat_neg = cathode (reduction, conventional current exits).
 */
export class CircuitValidator {
  /**
   * @param {object} params
   * @param {ComponentNode}           params.battery     — the BatteryNode
   * @param {Map<string,ElectrodeNode>} params.nodes     — electrode nodes only
   * @param {Map<string,WireSegment>} params.wires
   * @param {BeakerNode}              params.beaker
   * @param {object|null}             params.electrolyte — ELECTROLYTE_DB record or null
   * @returns {{ isValid: boolean, errors: string[],
   *             anode: ElectrodeNode|null, cathode: ElectrodeNode|null }}
   */
  static validate({ battery, nodes, wires, beaker, electrolyte }) {
    const errors  = [];
    const electrodes = [...nodes.values()];

    // ── 1. Electrode count ─────────────────────────────────────────────
    if (electrodes.length < 2) {
      errors.push(
        electrodes.length === 0
          ? 'Drag two electrodes onto the canvas.'
          : 'Add a second electrode to the canvas.'
      );
    }
    if (electrodes.length > 2) {
      errors.push('Only two electrodes can be used at once.');
    }

    // ── 2. Both electrodes in beaker ──────────────────────────────────
    const submergedCount = electrodes.filter(e => e.isSubmerged).length;
    if (electrodes.length === 2 && submergedCount < 2) {
      errors.push('Dip both electrodes into the electrolyte solution.');
    }

    // ── 3. Build wire adjacency graph ─────────────────────────────────
    // Node = terminal key "nodeId:terminalId"
    const adj = new Map();
    const addEdge = (a, b) => {
      (adj.get(a) ?? (adj.set(a, new Set()), adj.get(a))).add(b);
      (adj.get(b) ?? (adj.set(b, new Set()), adj.get(b))).add(a);
    };
    for (const wire of wires.values()) {
      const a = `${wire.from.nodeId}:${wire.from.terminalId}`;
      const b = `${wire.to.nodeId}:${wire.to.terminalId}`;
      addEdge(a, b);
    }

    // ── 4. BFS from each battery terminal ─────────────────────────────
    const batId       = battery.id;
    const reachPos    = CircuitValidator._bfs(adj, `${batId}:bat_pos`);
    const reachNeg    = CircuitValidator._bfs(adj, `${batId}:bat_neg`);

    let anodeNode   = null;
    let cathodeNode = null;

    for (const electrode of electrodes) {
      const topKey = `${electrode.id}:rod_top`;
      if (reachPos.has(topKey)) anodeNode   = electrode;
      if (reachNeg.has(topKey)) cathodeNode = electrode;
    }

    if (electrodes.length === 2) {
      if (!anodeNode || !cathodeNode) {
        errors.push('Connect both electrodes to the battery to run the simulation.');
      } else if (anodeNode === cathodeNode) {
        errors.push('Each electrode must connect to a different battery terminal.');
      }
    }

    // ── 5. Electrolyte ────────────────────────────────────────────────
    if (!electrolyte) {
      errors.push('Select an electrolyte from the bottom panel.');
    }

    // ── Result ────────────────────────────────────────────────────────
    const isValid =
      errors.length === 0 &&
      electrodes.length === 2 &&
      submergedCount === 2 &&
      anodeNode !== null &&
      cathodeNode !== null &&
      anodeNode !== cathodeNode &&
      !!electrolyte;

    return { isValid, errors, anode: anodeNode, cathode: cathodeNode };
  }

  /** BFS — returns Set of all terminal keys reachable from startKey. */
  static _bfs(adj, startKey) {
    const visited = new Set([startKey]);
    const queue   = [startKey];
    while (queue.length > 0) {
      for (const neighbour of (adj.get(queue.shift()) ?? [])) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    return visited;
  }
}
