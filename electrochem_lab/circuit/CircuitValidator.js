/**
 * circuit/CircuitValidator.js
 * BFS graph traversal to determine whether the electrolysis circuit is complete,
 * OR (when batteryEnabled is false) whether the galvanic cell is valid.
 *
 * A valid electrolysis circuit requires:
 *   1. Battery is present (always true — it is pre-placed).
 *   2. Exactly two electrode nodes placed.
 *   3. Both electrodes are submerged in the beaker liquid.
 *   4. bat_pos is connected by wires to one electrode's rod_top (→ anode).
 *   5. bat_neg is connected by wires to the other electrode's rod_top (→ cathode).
 *   6. An electrolyte is selected.
 *
 * A valid galvanic cell (battery removed) requires:
 *   1. Exactly two electrodes placed and submerged.
 *   2. An electrolyte is selected.
 *   3. Both electrodes have known standard reduction potentials.
 *   Polarity: higher E° → cathode (reduction), lower E° → anode (oxidation).
 *
 * Polarity rule (electrolysis):
 *   Electrode reached from bat_pos = anode (oxidation, conventional current enters).
 *   Electrode reached from bat_neg = cathode (reduction, conventional current exits).
 */
export class CircuitValidator {
  /**
   * @param {object} params
   * @param {ComponentNode}             params.battery       — the BatteryNode
   * @param {Map<string,ElectrodeNode>} params.nodes         — electrode nodes only
   * @param {Map<string,WireSegment>}   params.wires
   * @param {BeakerNode}                params.beaker
   * @param {object|null}               params.electrolyte   — ELECTROLYTE_DB record or null
   * @param {boolean}                   [params.batteryEnabled=true]
   * @returns {{ isValid: boolean, errors: string[],
   *             anode: ElectrodeNode|null, cathode: ElectrodeNode|null,
   *             isGalvanic: boolean }}
   */
  static validate({ battery, nodes, wires, beaker, electrolyte, batteryEnabled = true }) {
    // ── Galvanic-cell path (battery toggled off) ───────────────────────
    if (!batteryEnabled) {
      return CircuitValidator._validateGalvanic({ nodes, electrolyte });
    }

    // ── Electrolysis path (battery on) ────────────────────────────────
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
        // Neither electrode is reached from the battery terminals.
        // Check if the two electrodes are wired directly to each other —
        // that topology is a galvanic cell even when the battery toggle is on.
        const [a, b] = electrodes;
        const reachA = CircuitValidator._bfs(adj, `${a.id}:rod_top`);
        if (reachA.has(`${b.id}:rod_top`)) {
          return CircuitValidator._validateGalvanic({ nodes, electrolyte });
        }
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

    return { isValid, errors, anode: anodeNode, cathode: cathodeNode, isGalvanic: false };
  }

  // ── Galvanic-cell validation ───────────────────────────────────────────

  static _validateGalvanic({ nodes, electrolyte }) {
    const errors     = [];
    const electrodes = [...nodes.values()];

    if (electrodes.length < 2) {
      errors.push(
        electrodes.length === 0
          ? 'Drag two electrodes onto the beaker.'
          : 'Add a second electrode to the beaker.'
      );
    }
    if (electrodes.length > 2) {
      errors.push('Only two electrodes can be used at once.');
    }

    const submergedCount = electrodes.filter(e => e.isSubmerged).length;
    if (electrodes.length === 2 && submergedCount < 2) {
      errors.push('Dip both electrodes into the electrolyte solution.');
    }

    if (!electrolyte) {
      errors.push('Select an electrolyte from the bottom panel.');
    }

    let anodeNode   = null;
    let cathodeNode = null;

    if (electrodes.length === 2 && submergedCount === 2 && electrolyte) {
      const [a, b] = electrodes;
      const eA = a.data?.standardPotential;
      const eB = b.data?.standardPotential;

      if (eA == null || eB == null) {
        errors.push('Both electrodes need known reduction potentials for a galvanic cell.');
      } else if (Math.abs(eA - eB) < 1e-9) {
        errors.push('Electrodes have identical potentials — no EMF will be generated.');
      } else {
        // Higher reduction potential = cathode (reduced), lower = anode (oxidised)
        cathodeNode = eA > eB ? a : b;
        anodeNode   = eA > eB ? b : a;
      }
    }

    const isValid =
      errors.length === 0 &&
      electrodes.length === 2 &&
      submergedCount === 2 &&
      anodeNode !== null &&
      cathodeNode !== null &&
      !!electrolyte;

    return { isValid, errors, anode: anodeNode, cathode: cathodeNode, isGalvanic: true };
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
