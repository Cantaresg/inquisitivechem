# Electrochemistry Sim — Drag-and-Drop Implementation Plan

**Project:** InquisitiveChem — Electrochemistry Module  
**Version:** 2.0  
**Status:** Approved for Phase 1  
**Target Audience:** Singapore O-Level / A-Level students

---

## 1. Overview

A PhET-style drag-and-drop circuit builder for electrochemistry. Students assemble
a circuit by dragging components (battery, wires, electrodes) from the **left panel**
onto the **circuit canvas**, select an electrolyte from the **bottom panel**, run the
simulation, and apply chemical tests from the **right panel**. Observations and
equations accumulate in a collapsible **observation panel** on the far right, with
CSV / Word docx export.

The chemistry engine from `electrochemistry-sim-design.md` (NernstCalculator,
ElectrolysisEngine, ECCellEngine) is unchanged. This document specifies the UI
architecture only.

---

## 2. Layout

```
┌─ nav bar (52px fixed) ─────────────────────────────────────────────────────┐
├──────────┬──────────────────────────────────────┬────────────┬─────────────┤
│  LEFT    │              CIRCUIT CANVAS           │   TEST     │  OBS PANEL  │
│  PANEL   │         (SVG drag-drop area)          │   PANEL    │ (collapsible│
│  220 px  │              flex-grow                │  180 px    │  320 px)    │
│          │                                       │            │             │
│ Battery  │   ┌───────────────────────────────┐  │ • Litmus   │ Observations│
│ Wires    │   │         Beaker                │  │ • Splint   │ tab         │
│ Electrodes│  │  ┌─────────────────────────┐  │  │ • Flame    │             │
│          │   │  │  electrolyte liquid     │  │  │ • Smell    │ Equations   │
│          │   │  │  (animated)             │  │  │            │ tab         │
│          │   │  └─────────────────────────┘  │  │            │             │
│          │   └───────────────────────────────┘  │            │ Export      │
├──────────┴──────────────────────────────────────┴────────────┤ (CSV / docx)│
│              BOTTOM PANEL — Electrolytes (120 px)            │             │
└──────────────────────────────────────────────────────────────┴─────────────┘
```

- The **obs panel** starts **closed** (zero width). A toggle button `◀ / ▶` on the
  right edge of the test panel opens it with a CSS width transition.  
- For **EC Cell (A-Level)**, the beaker area expands to show two half-cells with a
  salt bridge; the left panel gains a **Voltmeter** component.  
- On small screens the bottom electrolyte panel becomes a horizontal scroll strip and
  the obs panel becomes a bottom sheet.

---

## 3. File Structure

```
Chem_sim/electrochem_lab/
├── index.html                    ← shell (nav, panel grid, canvas placeholder)
├── electrochem.css               ← layout, design tokens, animations
│
├── data/
│   ├── electrodes.js             ← ElectrodeDB (from existing design doc)
│   ├── electrolytes.js           ← ElectrolyteDB
│   ├── ions.js                   ← IonDB — E° values, half-reactions
│   └── products.js               ← ProductDB — product → test mappings
│
├── engine/
│   ├── NernstCalculator.js
│   ├── ElectrolysisEngine.js
│   ├── ECCellEngine.js
│   └── TestEngine.js
│
├── model/
│   ├── Electrode.js
│   ├── Electrolyte.js
│   ├── Ion.js
│   ├── Product.js
│   ├── ElectrolysisResult.js
│   ├── ECCellResult.js
│   └── CurriculumConfig.js
│
├── circuit/
│   ├── CircuitCanvas.js          ← SVG circuit board; owns all placed components
│   ├── ComponentNode.js          ← Abstract: a placed component with terminals
│   ├── BatteryNode.js            ← Battery symbol, +/− terminal positions
│   ├── ElectrodeNode.js          ← Electrode rod, one top terminal
│   ├── WireSegment.js            ← Path between two terminals
│   ├── BeakerNode.js             ← Beaker SVG + electrolyte fill; cathode/anode slots
│   ├── CircuitValidator.js       ← Detects closed loop: battery → anode → beaker → cathode → battery
│   └── WireManager.js            ← Wire-draw mode: start terminal → route → end terminal
│
├── ui/
│   ├── ComponentPanel.js         ← Left panel toolbox
│   ├── ElectrolytePanel.js       ← Bottom panel cards
│   ├── TestPanel.js              ← Right panel test tools
│   ├── ObsPanel.js               ← Far-right collapsible panel
│   ├── AnimationLayer.js         ← Canvas overlay for bubbles, deposits, ion arrows
│   └── ToastManager.js           ← Error/hint toasts
│
├── controller/
│   ├── SimController.js          ← Orchestrator
│   └── ActivityConfig.js         ← Teacher-defined locked/preset configurations
│
├── export/
│   ├── csv-export.js             ← Observation log → CSV string download
│   └── docx-export.js            ← Observation log → .docx via docx library (lazy-loaded)
│
└── activities/
    ├── act_01_inert.js
    ├── act_02_reactive.js
    ├── act_03_concentration.js
    ├── act_04_eccell.js
    └── act_05_nernst.js
```

---

## 4. Circuit Canvas — SVG Drag-and-Drop

### 4.1 Rendering Strategy

The circuit canvas is a **pure SVG** element. No canvas. All circuit components,
wires, the beaker, and electrolyte fill are SVG elements. A `<canvas>` element is
placed via `<foreignObject>` inside the SVG and used exclusively for particle
animations (bubbles, ion drift, electrode deposits).

```
<svg id="circuit-svg">
  <!-- static structure -->
  <g id="wires-layer">  ... WireSegment paths ... </g>
  <g id="components-layer">  ... BatteryNode, ElectrodeNode ... </g>
  <g id="beaker-layer">  ... BeakerNode ... </g>

  <!-- animation overlay -->
  <foreignObject id="anim-host" x="0" y="0" width="100%" height="100%">
    <canvas id="anim-canvas"></canvas>
  </foreignObject>
</svg>
```

### 4.2 Component Nodes

Every component placed on the canvas is a `ComponentNode`:

```javascript
class ComponentNode extends EventTarget {
  constructor({ id, type, svgGroup, terminals }) {
    // id: unique placed instance id, e.g. "electrode_anode_1"
    // type: "battery" | "electrode" | "wire" (virtual — managed by WireManager)
    // svgGroup: SVGGElement, already appended to components-layer
    // terminals: Array<Terminal>
  }

  // Terminal: { id: string, cx: number, cy: number, accepts: "wire" }
  // After the node is dragged to a new position, call updateTerminals()
  // which recalculates terminal positions and notifies WireManager to re-route
  // attached wires.

  get terminalPositions() { ... } // → Map<id, {x,y}>
  move(dx, dy)            { ... } // translate svgGroup, call updateTerminals()
  highlight(on)           { ... } // glow effect when circuit is valid
  destroy()               { ... } // remove svgGroup, detach wires
}
```

#### BatteryNode terminals
| Terminal id | Side |
|-------------|------|
| `bat_pos`   | right-top (positive pole) |
| `bat_neg`   | right-bottom (negative pole) |

The battery symbol is drawn as a pair of alternating long/short lines (standard
IEC symbol) plus a +/− label. The battery is **fixed** (not user-draggable) and
pre-placed in the top-left of the canvas, serving as the anchor of the circuit.

#### ElectrodeNode terminals
| Terminal id | Side |
|-------------|------|
| `rod_top`   | top of the rod (connects to wire) |
| `rod_bottom`| bottom tip (inserts into beaker) |

The `rod_bottom` terminal must be dragged into a **BeakerNode slot** to complete
the circuit. It snaps when within 20 px of a slot centre.

#### BeakerNode slots
| Slot id      | Role |
|-------------|------|
| `slot_anode`   | left electrode position  |
| `slot_cathode` | right electrode position |

Slots are SVG `<circle>` elements (dashed stroke, `r=14`) rendered as drop targets.
When an ElectrodeNode is snapped into a slot, the slot circle is hidden and the
electrode rod's bottom is clamped to that slot position.

### 4.3 Wire Drawing

Wire mode is activated when the user **clicks a free terminal** (unconnected end).
`WireManager` enters draw-mode:

1. An in-progress `<polyline>` starts from the clicked terminal.
2. The polyline's last point follows the cursor.
3. Clicking a compatible free terminal **completes** the wire:
   - A `WireSegment` is created, routing a smooth orthogonal path (two right-angle
     bends) between the two terminals using A-to-B Manhattan routing.
   - The two terminals are marked `connected = true`.
4. Pressing `Escape` or clicking empty space cancels draw-mode.
5. Clicking an **existing wire** opens a context menu with a single option: **Remove
   wire**.

```javascript
class WireManager {
  constructor(svgEl, wiresLayer) { ... }

  startDraw(fromTerminal)          { ... }  // enter draw-mode
  updatePreview(x, y)              { ... }  // called on mousemove/pointermove
  completeDraw(toTerminal)         { ... }  // create WireSegment, exit draw-mode
  cancel()                         { ... }  // discard preview, exit draw-mode
  removeWire(wireId)               { ... }
  rerouteWire(wireId)              { ... }  // called when a node moves

  // Returns the routed polyline points: start → bend1 → bend2 → end
  static routeManhattan(p1, p2)    { ... }
}
```

**Wire visual states:**
| State | Stroke |
|-------|--------|
| In-progress preview | `--accent` dashed |
| Connected, circuit open | `#8899bb` solid 2 px |
| Connected, circuit closed (live) | `#4df0b0` solid 2 px + glow filter |
| Selected (hover) | `#ffdd55` |

### 4.4 Drag-and-Drop from Component Panel

Components in the left panel are **prototype cards** (not the actual SVG elements).
Dragging one starts a pointer-event drag; releasing over the circuit canvas creates
a new `ComponentNode` at the drop coordinates.

```javascript
class ComponentPanel {
  // Each card has data-component-type attribute.
  // On pointerdown → create ghost image → on pointerup over circuit-svg →
  //   CircuitCanvas.spawnComponent(type, x, y)
}

class CircuitCanvas {
  spawnComponent(type, x, y) {
    // type: "battery" | "carbon_electrode" | "copper_electrode" | "zinc_electrode"
    //       | "platinum_electrode"
    // Battery is limited to 1. Electrodes limited to 2 (one per slot).
    // Returns: ComponentNode
  }
}
```

**Snap grid:** 10 px. Components snap to grid when dropped and when dragged.

**Keyboard accessibility:** Each placed component has `tabindex="0"`. Arrow keys move
the selected component by 10 px. `Delete` removes it. `Tab` cycles components.

---

## 5. Left Panel — Component Toolbox

```
┌─────────────────────┐
│  COMPONENTS          │
├─────────────────────┤
│  [Power Supply]      │
│  ● DC Battery        │  ← drag to canvas (limit 1)
│                      │
│  [Electrodes]        │
│  ● Carbon (C)        │
│  ● Copper (Cu)       │
│  ● Zinc (Zn)         │
│  ● Platinum (Pt)     │
│  ● Silver (Ag) *     │  * A-Level only
│  ● Iron (Fe) *       │
│                      │
│  [Connections]       │
│  ● Wire              │  ← drag tip to terminal to start a wire
│                      │
│  [A-Level Extras] *  │
│  ● Voltmeter         │
│  ● Salt Bridge       │
└─────────────────────┘
```

Each card shows:
- Element symbol (large, using design-token font `DM Mono`)
- Full name
- E° value (hidden in O-Level mode, shown in A-Level mode)
- Small SVG icon preview of the component shape

---

## 6. Bottom Panel — Electrolytes

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ELECTROLYTES                                                            │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  CuSO₄(aq)   │  │  NaCl(aq)    │  │  H₂SO₄(dil)  │  │ NaOH(aq)   │ │
│  │  0.5 mol/dm³ │  │  1.0 mol/dm³ │  │  1.0 mol/dm³ │  │ ...        │ │
│  │  [blue]      │  │  [clear]     │  │  [clear]     │  │            │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                          │
│  Concentration: ──●────────── 1.0 mol/dm³     [selected: CuSO₄(aq)]   │
└──────────────────────────────────────────────────────────────────────────┘
```

- Cards are **click-to-select** (no drag needed) — clicking a card loads the
  electrolyte into the beaker with a liquid-fill animation.
- A **concentration slider** (0.1 – 4.0 mol/dm³) adjusts the active electrolyte's
  concentration. Positions above 2.0 mol/dm³ are labelled "concentrated" (relevant
  for Cl⁻ discharge selectivity).
- The beaker fill colour updates immediately when concentration or selection changes.
- The selected card is highlighted with `--accent` border.

**Initial electrolytes:**

| ID | Formula | Default conc | Colour |
|----|---------|-------------|--------|
| `cuso4_aq` | CuSO₄(aq) | 0.5 M | `#4a90d9` (blue) |
| `nacl_aq` | NaCl(aq) | 1.0 M | `#e8f4fd` (near-clear) |
| `h2so4_dil` | H₂SO₄(dil) | 1.0 M | `#f5f5dc` (clear-yellow) |
| `naoh_aq` | NaOH(aq) | 1.0 M | `#f0f0f0` (clear) |
| `cucl2_aq` | CuCl₂(aq) | 0.5 M | `#3da5c8` (blue-green) |
| `agno3_aq` | AgNO₃(aq) | 0.5 M | `#f0f0f0` (clear) |
| `nacl_conc` | NaCl(aq) conc | 4.0 M | `#e8f4fd` |

---

## 7. Right Panel — Chemical Tests

```
┌─────────────────────┐
│  TESTS               │
├─────────────────────┤
│                      │
│  Apply to:           │
│  ○ Anode gas         │
│  ○ Cathode gas       │
│  ○ Solution          │
│                      │
│  [Litmus paper]      │
│  [Glowing splint]    │
│  [Burning splint]    │
│  [Flame test]        │
│  [Smell]             │
│                      │
│  ─────────────────── │
│  Last result:        │
│  [result card here]  │
│                      │
│  [Log to Obs ▶]      │
└─────────────────────┘
```

- Test buttons are **disabled** until the simulation is running (circuit closed +
  electrolyte selected).
- Selecting "Anode gas" / "Cathode gas" / "Solution" changes which target the test
  applies to.
- Clicking a test runs `TestEngine.run(testType, target, result)` → returns a
  `TestResult` displayed inline as a result card.
- **[Log to Obs ▶]** appends the result to the obs panel and briefly opens it if
  it was closed.
- Each test button shows a small icon (matching the existing chem-lab icon set).

---

## 8. Observation Panel (Far Right, Collapsible)

### 8.1 Toggle

A `◀` / `▶` tab fixed to the right edge of the test panel. Clicking it toggles
`width: 0` ↔ `width: 320px` with a 250 ms CSS transition.

### 8.2 Content

```
┌─────────────────────────────────┐
│  OBSERVATION LOG            ✕   │
├──────────────────┬──────────────┤
│  Observations    │  Equations   │
├──────────────────┴──────────────┤
│                                  │
│  ▼ Run 1 — CuSO₄ | Cu | Cu      │
│    Anode: pink-brown deposit      │
│    Cathode: pink-brown deposit    │
│    Gas test (anode): none         │
│                                   │
│  ▼ Run 2 — NaCl | C | C          │
│    Cathode: bubbles (H₂)          │
│    Anode: yellow-green gas (Cl₂)  │
│    Litmus (anode gas): bleached   │
│                                   │
├───────────────────────────────────┤
│  Export:  [CSV ↓]   [Word ↓]     │
└───────────────────────────────────┘
```

- Two tabs: **Observations** (plain-English descriptions) and **Equations**
  (half-equations shown at A-Level; simplified word equations at O-Level).
- Each **run** is a collapsible `<details>/<summary>` block labelled with the
  configuration.
- Entries are appended with `append(runRecord)` — deduplicated by UUID
  (same pattern as `ObservationLog.js` in chem-lab).
- The panel is fully keyboard-navigable.

### 8.3 Export

#### CSV
```javascript
// csv-export.js
export function exportCSV(runs) {
  const header = ["Run", "Electrolyte", "Anode", "Cathode",
                  "Cathode Product", "Anode Product", "Tests", "Equations"];
  const rows = runs.map(r => [
    r.runNumber, r.electrolyte, r.anode, r.cathode,
    r.cathodeProduct, r.anodeProduct,
    r.tests.map(t => `${t.type}: ${t.result}`).join("; "),
    r.equations.join("; ")
  ]);
  const csv = [header, ...rows].map(r => r.map(quoteCSV).join(",")).join("\n");
  downloadBlob(csv, "electrochem-observations.csv", "text/csv");
}
```

#### Word (.docx)
Uses the same **lazy-import** pattern as `chem-lab`'s `ObservationLog.js`:
```javascript
// docx-export.js
export async function exportDocx(runs) {
  const { Document, Packer, Paragraph, Table, ... } = await import(
    "https://cdn.jsdelivr.net/npm/docx@8/build/index.min.js"
  );
  // Build a Document with a heading, a summary table, then per-run sections
  // with observation text and (A-Level) half-equation tables.
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, "electrochem-observations.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
```

The docx output contains:
1. **Title:** "Electrochemistry Observations — [date]"
2. **Config table:** Electrolyte, Anode, Cathode, Concentration
3. **Observations:** bulleted list per run
4. **Equations section:** (A-Level only) numbered half-equations with E° values

---

## 9. CircuitValidator

Called after every topology change (component added/removed, wire added/removed,
electrolyte selected). Returns a `ValidationResult`.

```javascript
class CircuitValidator {
  /**
   * A valid electrolysis circuit requires:
   *   1. Exactly one BatteryNode placed.
   *   2. Exactly two ElectrodeNodes placed, each snapped into a beaker slot.
   *   3. battery.bat_pos connected (via wires) to one electrode's rod_top.
   *   4. battery.bat_neg connected (via wires) to the other electrode's rod_top.
   *   5. An electrolyte is selected in the beaker.
   *
   * Graph traversal: build adjacency from terminals+wires, then BFS from
   * bat_pos. Circuit is closed if the BFS path reaches back to bat_neg.
   */
  static validate(circuitCanvas, beakerNode, electrolyte) {
    const errors = [];
    // ... checks ...
    return { isValid: boolean, errors: string[], anode: ElectrodeNode|null, cathode: ElectrodeNode|null };
  }
}
```

**Polarity assignment:** whichever electrode is connected to `bat_pos` becomes the
**anode** (conventional current enters); the other becomes the **cathode**.

**Error toasts (non-blocking):**
- "Connect both electrodes to the battery to run the simulation."
- "Insert both electrodes into the beaker."
- "Select an electrolyte."
- "Only two electrodes can be placed at once."

---

## 10. SimController

```javascript
class SimController {
  constructor(config) {
    this.config = config;                   // CurriculumConfig
    this.activity = null;                   // ActivityConfig | null
    this._canvas   = new CircuitCanvas();
    this._beaker   = new BeakerNode();
    this._electrolyte = null;
    this._result   = null;
    this._isRunning = false;
    this._runLog   = [];                    // RunRecord[]
  }

  // Called by CircuitCanvas after every topology change
  onTopologyChange() {
    const v = CircuitValidator.validate(this._canvas, this._beaker, this._electrolyte);
    if (v.isValid) this._run(v.anode, v.cathode);
    else           this._stop();
  }

  _run(anode, cathode) {
    this._result = ElectrolysisEngine.run(
      this._electrolyte, anode.data, cathode.data, this.config
    );
    this._isRunning = true;
    AnimationLayer.start(this._result);
    TestPanel.enable();
    this._beaker.setLive(true);  // green glow on beaker
    this._canvas.setWiresLive(true);
  }

  _stop() {
    if (!this._isRunning) return;
    this._isRunning = false;
    AnimationLayer.stop();
    TestPanel.disable();
    this._beaker.setLive(false);
    this._canvas.setWiresLive(false);
  }

  applyTest(testType, target) {
    if (!this._isRunning) return;
    const testResult = TestEngine.run(testType, target, this._result);
    TestPanel.showResult(testResult);
    return testResult;
  }

  logRun(notes = "") {
    const record = {
      uuid:           crypto.randomUUID(),
      runNumber:      this._runLog.length + 1,
      electrolyte:    this._electrolyte.name,
      anode:          this._canvas.anode.data.name,
      cathode:        this._canvas.cathode.data.name,
      concentration:  this._electrolyte.concentration,
      cathodeProduct: this._result.cathodeProduct,
      anodeProduct:   this._result.anodeProduct,
      tests:          [...this._pendingTests],
      equations:      this._result.getEquations(this.config),
      notes,
    };
    this._runLog.push(record);
    ObsPanel.append(record);
    this._pendingTests = [];
  }

  reset() {
    this._stop();
    this._canvas.clear();
    this._electrolyte = null;
    this._result = null;
  }
}
```

---

## 11. Animation Layer

A `<canvas>` element (via `<foreignObject>` inside the SVG, z-index above circuit
elements) handles particle animations. It does **not** draw any circuit structure.

```javascript
class AnimationLayer {
  // Animations triggered by ElectrolysisResult:
  static start(result) {
    // cathodeProduct.state === "gas"   → spawnBubbles(cathodeElectrodePos, product.colour)
    // cathodeProduct.state === "solid" → spawnDeposit(cathodeElectrodePos, product.colour)
    // anodeProduct.state === "gas"     → spawnBubbles(anodeElectrodePos, product.colour)
    // Always:                          → spawnIonDrift(electrolyte)
  }

  static spawnBubbles(pos, colour)   { ... }  // rising circles, random offset
  static spawnDeposit(pos, colour)   { ... }  // growing crystalline patch on rod
  static spawnIonDrift(electrolyte)  { ... }  // cation→cathode, anion→anode arrows
  static stop()                      { ... }  // clear canvas, cancel rAF
}
```

Ion drift is rendered as moving labelled dots (e.g., "Cu²⁺" drifting right, "SO₄²⁻"
drifting left) to visually reinforce ion migration. Speed scales with current
(cosmetic — not tied to actual Faraday calculations).

---

## 12. Curriculum Config Integration

All UI elements check `CurriculumConfig` before rendering details:

| Feature | O-Level | A-Level |
|---------|---------|---------|
| E° values on component cards | Hidden | Shown |
| Nernst correction info in obs panel | Hidden | Shown |
| Half-equations tab in obs panel | Word equations only | Full ionic half-equations |
| EC Cell mode (two beakers) | Not available | Available |
| Voltmeter component | Not available | Available |
| Salt Bridge component | Not available | Available |
| Concentration slider effect label | "dilute / concentrated" | E° correction shown |
| Discharge order tooltip | Simplified series | Nernst-ranked table |

The **O-Level / A-Level selector** is a toggle in the nav bar (or locked by
`ActivityConfig` if in guided mode).

---

## 13. Build Phases

### Phase 1 — Data Layer *(start here)*
- [ ] `data/electrodes.js` — ElectrodeDB (6 electrodes, all fields)
- [ ] `data/electrolytes.js` — ElectrolyteDB (7 electrolytes, with ions + pH)
- [ ] `data/ions.js` — IonDB (all E° values, half-reactions)
- [ ] `data/products.js` — ProductDB (cathode/anode products, test mappings)
- **Deliverable:** all data importable, no UI

### Phase 2 — Chemistry Engine *(port from design doc)*
- [ ] `engine/NernstCalculator.js`
- [ ] `engine/ElectrolysisEngine.js` (cathode + anode selection, Nernst-based)
- [ ] `engine/ECCellEngine.js`
- [ ] `engine/TestEngine.js` (litmus, splint, flame, smell)
- **Deliverable:** `ElectrolysisEngine.run()` returns correct products for all 7
  electrolytes × 4 electrode pairs. Verified by manual console tests.

### Phase 3 — Circuit Canvas (Core Drag-and-Drop)
- [ ] `index.html` shell (CSS grid, nav, panel placeholders)
- [ ] `electrochem.css` (design tokens matching existing InquisitiveChem theme)
- [ ] `circuit/ComponentNode.js`, `BatteryNode.js`, `ElectrodeNode.js`
- [ ] `circuit/BeakerNode.js` (SVG beaker with two slots)
- [ ] `circuit/WireSegment.js` + `WireManager.js`
- [ ] `circuit/CircuitCanvas.js` (spawn, move, delete components; pointer events)
- [ ] `circuit/CircuitValidator.js`
- **Deliverable:** Can drag battery + two electrodes onto canvas, draw wires between
  terminals. Console logs `"circuit valid"` when loop is closed.

### Phase 4 — Panel UIs
- [ ] `ui/ComponentPanel.js` — left toolbox (drag-to-spawn)
- [ ] `ui/ElectrolytePanel.js` — bottom cards + concentration slider
- [ ] `ui/TestPanel.js` — test buttons, target selector, result card
- [ ] `ui/ObsPanel.js` — collapsible panel, tabs, append/render runs
- [ ] `ui/AnimationLayer.js` — bubbles + deposit + ion drift
- [ ] `ui/ToastManager.js` — circuit error hints
- **Deliverable:** Fully playable O-Level electrolysis sim. Can assemble circuit,
  select electrolyte, watch animation, apply tests, view obs, export CSV.

### Phase 5 — Export
- [ ] `export/csv-export.js`
- [ ] `export/docx-export.js` (lazy-loaded docx library)
- **Deliverable:** Both export buttons produce correct files.

### Phase 6 — EC Cell Mode (A-Level)
- [ ] Two-beaker SVG layout with salt bridge component
- [ ] Voltmeter SVG component (reads EMF from ECCellEngine)
- [ ] ECCellEngine wired to SimController
- [ ] Half-cell configuration in obs panel
- [ ] Concentration slider → live Nernst EMF recalculation
- **Deliverable:** A-Level Daniell cell works end-to-end with EMF readout.

### Phase 7 — Guided Activities
- [ ] `controller/ActivityConfig.js`
- [ ] `activities/act_01` – `act_05`
- [ ] Activity loader UI (landing page or modal selector)
- [ ] Component lock enforcement in ComponentPanel + ElectrolytePanel
- [ ] Question/hint overlay UI

### Phase 8 — Teacher Dashboard *(Phase 5 from original design doc)*
- [ ] Curriculum selector
- [ ] Component lock panel
- [ ] Question/hint editor
- [ ] Activity export / import (JSON)
- [ ] Supabase session key integration (deferred, matches chem-lab pattern)

---

## 14. Design Token Reference

Matches the existing InquisitiveChem theme (from `chem-lab-v1-refactor.md`):

```css
:root {
  --bg:           #07090f;
  --panel-bg:     #0d1117;
  --panel-border: #1e2535;
  --accent:       #4df0b0;
  --text:         #eef2ff;
  --text-muted:   #8899bb;
  --font-serif:   'Instrument Serif', serif;   /* logo only */
  --font-body:    'DM Sans', sans-serif;
  --font-mono:    'DM Mono', monospace;

  /* Electrochem-specific */
  --wire-live:    #4df0b0;
  --wire-dead:    #8899bb;
  --wire-preview: rgba(77, 240, 176, 0.5);
  --slot-empty:   rgba(136, 153, 187, 0.4);
  --slot-filled:  rgba(77, 240, 176, 0.3);
  --beaker-glass: rgba(200, 220, 255, 0.12);
}
```

---

## 15. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SVG circuit canvas (not canvas element) | SVG elements are inherently draggable/selectable via pointer events; no manual hit detection; scales cleanly |
| Canvas via foreignObject for animations only | Particle effects need rAF loop and pixel-level control; SVG animations would be too complex for bubbles/ion drift |
| Manhattan wire routing | Cleaner circuit-diagram aesthetic than curved splines; matches PhET/CircuitLab style |
| Battery fixed, electrodes draggable | Reduces user confusion; battery is the reference point of the circuit |
| Electrolyte via click (not drag) | Electrolyte goes "into" the beaker, not onto the canvas — a click model is more intuitive |
| Polarity from wire connection side | Users learn the convention by connecting correctly; anode = connected to + terminal |
| Nernst always computed under the hood | Concentration slider updates are instant; O-Level just doesn't show the numbers |
| Lazy docx import | Avoids loading a ~400 kB library until the user clicks Export Word |
| Same design tokens as chem-lab | Visual consistency across the InquisitiveChem suite |
