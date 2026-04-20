# Electrochemistry Simulation — Implementation Plan & Design Structure

## Overview

An interactive electrochemistry simulation for Singapore secondary (O-Level) and junior college (A-Level) students. Built with vanilla HTML/JS using OOP principles. A single chemistry engine powers both curriculum levels, with electrode potentials and Nernst equation calculations always running under the hood — the curriculum config controls what is surfaced to students.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer                         │
│   SimRenderer  │  TestPanel  │  TeacherDashboard    │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                SimController                        │
│   Manages UI state, curriculum config, activity     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              ChemistryEngine (core)                 │
│   Electrolysis  │  ECCell  │  NernstCalculator      │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                 Data Layer                          │
│   ElectrodeDB  │  ElectrolyteDB  │  ProductDB       │
└─────────────────────────────────────────────────────┘
```

---

## Data Layer

### Electrode

```javascript
class Electrode {
  constructor({
    id,           // string: "copper", "carbon", "zinc", "platinum"
    name,         // string: display name
    symbol,       // string: "Cu", "C", "Zn", "Pt"
    isInert,      // bool: true = carbon, platinum; false = copper, zinc
    standardPotential,  // float: E° in volts vs SHE (e.g., Cu = +0.34)
    oxidationProduct,   // string | null: ion produced if reactive anode (e.g., "Cu2+")
    colour,       // string: hex for rendering
  }) {}
}
```

**Initial electrode data:**

| Electrode | E° (V) | Inert | Notes |
|-----------|--------|-------|-------|
| Platinum  | —      | Yes   | Reference inert |
| Carbon (graphite) | — | Yes | Common inert |
| Copper    | +0.34  | No    | Reactive anode dissolves |
| Zinc      | −0.76  | No    | Reactive, used in ECCell |
| Silver    | +0.80  | No    | A-Level extension |
| Iron      | −0.44  | No    | A-Level extension |

---

### Electrolyte

```javascript
class Electrolyte {
  constructor({
    id,           // string: "cuso4_aq", "nacl_aq", "h2so4_dil"
    name,         // string: display name
    formula,      // string: "CuSO₄(aq)"
    cations,      // Array<Ion>: [{symbol: "Cu2+", charge: 2, concentration: 1.0}]
    anions,       // Array<Ion>: [{symbol: "SO42-", charge: -2, concentration: 1.0}]
    concentration,     // float: mol/dm³ — affects Nernst, and Cl⁻ product selectivity
    isConcentrated,    // bool: shorthand for >~2M Cl⁻ (O-Level simplified rule)
    colour,       // string: hex for beaker colour
    pH,           // float: for OH⁻ discharge calculation
  }) {}
}
```

**Discharge series for cations (cathode, reduction):**
Higher on list = preferentially discharged

```
Ag⁺  > Cu²⁺  > H⁺  > Zn²⁺  > Fe²⁺  > Na⁺  > Ca²⁺  > K⁺
```

**Discharge series for anions (anode, oxidation):**

```
I⁻ > Br⁻ > Cl⁻  (if concentrated) > OH⁻ > Cl⁻ (dilute) > SO₄²⁻ > NO₃⁻
```

---

### Ion

```javascript
class Ion {
  constructor({
    symbol,       // string: "Cu2+", "Cl-", "OH-"
    charge,       // int: +2, -1 etc.
    standardPotential, // float: E° for half-reaction (for Nernst)
    halfReaction, // string: human-readable (A-Level display)
    concentration, // float: mol/dm³ (mutable during simulation)
  }) {}
}
```

---

### Product

```javascript
class Product {
  constructor({
    id,           // string: "h2_gas", "cl2_gas", "cu_solid", "o2_gas"
    name,         // string
    formula,      // string: "H₂", "Cl₂"
    state,        // "gas" | "solid" | "aqueous"
    electrode,    // "cathode" | "anode"
    colour,       // string: gas bubble colour, deposit colour
    tests: {
      litmus,     // string | null: "red→bleached", "no change"
      splint,     // string | null: "pops", "relights", "no effect"
      flameTest,  // string | null: colour or null if not applicable
      smell,      // string | null: "pungent", "none"
    }
  }) {}
}
```

---

## Chemistry Engine

### NernstCalculator

Handles all electrode potential corrections. Used internally by both electrolysis and EC cell engines.

```javascript
class NernstCalculator {
  // Constants
  static R = 8.314;   // J mol⁻¹ K⁻¹
  static F = 96485;   // C mol⁻¹
  static T_DEFAULT = 298.15; // K (25°C)

  /**
   * E = E° - (RT/nF) * ln(Q)
   * @param {number} standardPotential - E° in volts
   * @param {number} n                 - electrons transferred
   * @param {number} Q                 - reaction quotient [products]/[reactants]
   * @param {number} T                 - temperature in Kelvin
   * @returns {number} corrected potential in volts
   */
  static calculate(standardPotential, n, Q, T = NernstCalculator.T_DEFAULT) {
    if (Q <= 0) return standardPotential;
    const correction = (NernstCalculator.R * T) / (n * NernstCalculator.F);
    return standardPotential - correction * Math.log(Q);
  }

  /**
   * Shorthand at 25°C: E = E° - (0.0592/n) * log10(Q)
   */
  static calculateAt25C(standardPotential, n, Q) {
    if (Q <= 0) return standardPotential;
    return standardPotential - (0.05916 / n) * Math.log10(Q);
  }

  /**
   * Compute reaction quotient Q from ion concentrations.
   * For reduction: Mn+ + ne- → M(s),  Q = 1 / [Mn+]
   * For oxidation: M(s) → Mn+ + ne-,  Q = [Mn+]
   */
  static computeQ_reduction(ionConcentration) {
    return 1 / ionConcentration;
  }

  static computeQ_oxidation(ionConcentration) {
    return ionConcentration;
  }
}
```

---

### ElectrolysisEngine

Core electrolysis logic. Always uses Nernst-corrected potentials for product selection internally; O-Level mode just applies the simplified discharge series rules without showing E° values.

```javascript
class ElectrolysisEngine {
  /**
   * @param {Electrolyte} electrolyte
   * @param {Electrode} anode
   * @param {Electrode} cathode
   * @param {CurriculumConfig} config
   * @returns {ElectrolysisResult}
   */
  static run(electrolyte, anode, cathode, config) {
    const cathodeProduct = this._selectCathodeProduct(electrolyte, cathode, config);
    const anodeProduct   = this._selectAnodeProduct(electrolyte, anode, config);
    return new ElectrolysisResult({ cathodeProduct, anodeProduct, config });
  }

  static _selectCathodeProduct(electrolyte, cathode, config) {
    // Step 1: Compute Nernst-corrected potentials for all cations + H+
    const candidates = electrolyte.cations.map(ion => ({
      ion,
      E: NernstCalculator.calculateAt25C(
        ion.standardPotential,
        Math.abs(ion.charge),
        NernstCalculator.computeQ_reduction(ion.concentration)
      )
    }));

    // H+ is always implicitly present (from water autoionisation or acid)
    const E_H = NernstCalculator.calculateAt25C(0.00, 2,
      NernstCalculator.computeQ_reduction(electrolyte.getHConcentration()));
    candidates.push({ ion: ION_DB.H_PLUS, E: E_H });

    // Step 2: Highest E → preferentially reduced (most easily discharged)
    candidates.sort((a, b) => b.E - a.E);

    const winner = candidates[0].ion;
    return PRODUCT_DB.getCathodeProduct(winner);
  }

  static _selectAnodeProduct(electrolyte, anode, config) {
    // Rule 1: If anode is reactive metal → it dissolves (overrides all)
    if (!anode.isInert) {
      return PRODUCT_DB.getAnodeDissolveProduct(anode);
    }

    // Step 2: Compute Nernst-corrected potentials for all anions + OH-
    const candidates = electrolyte.anions.map(ion => ({
      ion,
      E: NernstCalculator.calculateAt25C(
        ion.standardPotential,
        Math.abs(ion.charge),
        NernstCalculator.computeQ_oxidation(ion.concentration)
      )
    }));

    // OH- is always present (from water)
    const E_OH = NernstCalculator.calculateAt25C(
      ION_DB.OH_MINUS.standardPotential, 4,
      NernstCalculator.computeQ_oxidation(electrolyte.getOHConcentration()));
    candidates.push({ ion: ION_DB.OH_MINUS, E: E_OH });

    // Lowest E (least positive / most negative reduction potential) → 
    // most easily oxidised at anode
    candidates.sort((a, b) => a.E - b.E);

    const winner = candidates[0].ion;
    return PRODUCT_DB.getAnodeProduct(winner);
  }
}
```

**Note on concentration effects:**
The Nernst equation naturally handles the dilute vs concentrated Cl⁻ case. At high [Cl⁻], the corrected E for Cl⁻ oxidation becomes more favourable than OH⁻ oxidation — matching the O-Level rule-of-thumb without hardcoding it as a special case.

---

### ECCellEngine

For electrochemical cell (galvanic cell) mode — used in A-Level activities.

```javascript
class ECCellEngine {
  /**
   * @param {HalfCell} halfCellA - e.g., Zn | Zn²⁺
   * @param {HalfCell} halfCellB - e.g., Cu | Cu²⁺
   * @returns {ECCellResult}
   */
  static run(halfCellA, halfCellB) {
    const E_A = NernstCalculator.calculateAt25C(
      halfCellA.electrode.standardPotential,
      halfCellA.ion.charge,
      NernstCalculator.computeQ_reduction(halfCellA.ion.concentration)
    );
    const E_B = NernstCalculator.calculateAt25C(
      halfCellB.electrode.standardPotential,
      halfCellB.ion.charge,
      NernstCalculator.computeQ_reduction(halfCellB.ion.concentration)
    );

    // Cell with higher E = cathode (positive terminal)
    const [cathodeCell, anodeCell] = E_A > E_B
      ? [halfCellA, halfCellB]
      : [halfCellB, halfCellA];

    const EMF = Math.abs(E_A - E_B); // E_cathode - E_anode

    return new ECCellResult({
      cathodeCell,
      anodeCell,
      EMF,
      electronFlowDirection: `${anodeCell.electrode.name} → ${cathodeCell.electrode.name}`,
    });
  }
}
```

---

## Curriculum Config

```javascript
class CurriculumConfig {
  constructor({
    level,                    // "O_LEVEL" | "A_LEVEL"
    showElectrodePotentials,  // bool
    showNernstCorrection,     // bool (A-Level only)
    showHalfEquations,        // bool (A-Level: full; O-Level: simplified word equations)
    showDischargeOrder,       // "simplified" | "full" | "hidden"
    enableECCellMode,         // bool (A-Level only)
    temperature,              // float: K, default 298.15 (A-Level can vary this)
  }) {}

  static O_LEVEL() {
    return new CurriculumConfig({
      level: "O_LEVEL",
      showElectrodePotentials: false,
      showNernstCorrection: false,
      showHalfEquations: false,
      showDischargeOrder: "simplified",
      enableECCellMode: false,
      temperature: 298.15,
    });
  }

  static A_LEVEL() {
    return new CurriculumConfig({
      level: "A_LEVEL",
      showElectrodePotentials: true,
      showNernstCorrection: true,
      showHalfEquations: true,
      showDischargeOrder: "full",
      enableECCellMode: true,
      temperature: 298.15,
    });
  }
}
```

---

## Result Objects

```javascript
class ElectrolysisResult {
  constructor({ cathodeProduct, anodeProduct, config }) {
    this.cathodeProduct = cathodeProduct;  // Product
    this.anodeProduct   = anodeProduct;    // Product
    this.config         = config;
  }

  // Returns observation text appropriate to curriculum level
  getObservations() { ... }

  // Returns half-equations (full for A-Level, simplified for O-Level)
  getEquations() { ... }
}

class ECCellResult {
  constructor({ cathodeCell, anodeCell, EMF, electronFlowDirection }) {
    this.cathodeCell            = cathodeCell;
    this.anodeCell              = anodeCell;
    this.EMF                    = EMF;           // volts
    this.electronFlowDirection  = electronFlowDirection;
  }
}
```

---

## SimController

Central orchestrator between engine and UI.

```javascript
class SimController {
  constructor(config, activityConfig = null) {
    this.config         = config;          // CurriculumConfig
    this.activity       = activityConfig;  // ActivityConfig | null (free mode if null)
    this.state = {
      electrolyte: null,
      anode:       null,
      cathode:     null,
      isRunning:   false,
      result:      null,
      testResults: [],
    };
  }

  setElectrolyte(id) { ... }
  setAnode(id)       { ... }
  setCathode(id)     { ... }

  run() {
    if (!this._isReady()) return;
    this.state.result = ElectrolysisEngine.run(
      this.state.electrolyte,
      this.state.anode,
      this.state.cathode,
      this.config
    );
    this.state.isRunning = true;
    SimRenderer.update(this.state, this.config);
  }

  applyTest(testType) {
    // testType: "litmus" | "splint" | "flameTest" | "smell"
    const result = TestEngine.run(testType, this.state.result);
    this.state.testResults.push(result);
    SimRenderer.showTestResult(result, this.config);
  }

  reset() { ... }
}
```

---

## Activity System

### ActivityConfig

Allows teacher to lock/unlock components and embed questions.

```javascript
class ActivityConfig {
  constructor({
    id,
    title,
    level,              // "O_LEVEL" | "A_LEVEL"
    description,
    lockedComponents: {
      electrolytes,     // string[] | null: if set, only these IDs available
      anodes,           // string[] | null
      cathodes,         // string[] | null
    },
    presetComponents: {
      electrolyte,      // string | null: pre-selected and possibly locked
      anode,            // string | null
      cathode,          // string | null
    },
    questions,          // Question[]
    hints,              // string[]
    revealAnswers,      // bool: teacher toggle
  }) {}
}
```

### Built-in Activities (Phase 4+)

| ID | Title | Level | Key Concept |
|----|-------|-------|-------------|
| `act_01` | Inert Electrodes | O-Level | Carbon electrodes, CuSO₄ |
| `act_02` | Reactive Electrodes | O-Level | Copper electrodes, copper refining |
| `act_03` | Effect of Concentration | O-Level | Dilute vs concentrated NaCl |
| `act_04` | Electrochemical Cell | A-Level | Daniell cell, EMF |
| `act_05` | Nernst & Concentration | A-Level | Effect of [ion] on cell voltage |
| `act_06` | Teacher Custom | Both | Teacher-defined via dashboard |

---

## UI Layer

### Rendering Architecture

A two-layer stack inside a single `.sim-container` div:

```
┌─────────────────────────────────────────────────────┐
│  SVG layer  (z-index: 2, transparent, hitboxes only)│  ← click handling
│  Canvas     (z-index: 1, full rendering)            │  ← all drawing & animation
└─────────────────────────────────────────────────────┘
```

```css
.sim-container { position: relative; width: 800px; height: 600px; }

canvas {
  position: absolute; top: 0; left: 0;
}

svg {
  position: absolute; top: 0; left: 0;
  background: transparent;
  pointer-events: none;       /* SVG itself is passthrough... */
}

svg .hitbox {
  pointer-events: all;        /* ...except explicitly named hitboxes */
  fill: transparent;
  cursor: pointer;
}
```

**Canvas** does all visual work — beaker, electrodes, electrolyte colour, bubbles, deposits, ion migration arrows, current flow. **SVG** is invisible and contains only transparent `<rect>` or `<ellipse>` hitboxes positioned over interactive elements. No SVG drawing at all.

After each canvas render, `SimRenderer` publishes the bounding coordinates of every drawn object. `HitboxManager` reads these and repositions the SVG hitboxes to match:

```javascript
class HitboxManager {
  constructor(svgEl) {
    this.svg = svgEl;
    this.hitboxes = {};       // id → SVGElement
  }

  // Called by SimRenderer after every draw
  update(layoutMap) {
    // layoutMap: { anode: {x, y, w, h}, cathode: {x,y,w,h}, beaker: {...}, ... }
    for (const [id, rect] of Object.entries(layoutMap)) {
      if (!this.hitboxes[id]) this._create(id);
      this._position(id, rect);
    }
  }

  _create(id) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    el.classList.add("hitbox");
    el.dataset.id = id;
    this.svg.appendChild(el);
    this.hitboxes[id] = el;
  }

  _position(id, { x, y, w, h }) {
    const el = this.hitboxes[id];
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", w);
    el.setAttribute("height", h);
  }

  on(id, event, handler) {
    // Attach listener once at creation; handler receives the logical id
    this.hitboxes[id]?.addEventListener(event, () => handler(id));
  }
}
```

**Key benefit:** Canvas has full rendering control and smooth animation. SVG hit detection is native DOM — no manual coordinate math on click events. The only coupling point is the `layoutMap` that `SimRenderer` emits after each frame.

### SimRenderer

Responsible for all canvas drawing and emitting the layout map for hitbox sync.

```
SimRenderer
├── drawBeaker(electrolyte)
├── drawElectrodes(anode, cathode)
├── animateBubbles(electrode, product)     // gas products
├── animateDeposit(electrode, product)     // solid deposits
├── animateIonMigration(electrolyte)       // cation → cathode, anion → anode
├── drawCurrentFlow(direction)             // electron flow arrow
├── update(state, config) → layoutMap     // master redraw, returns bounding boxes
└── _emitLayout(layoutMap)                // triggers HitboxManager.update()
```

### TestPanel

```
TestPanel
├── LitmusPaper    → dip animation, colour change
├── GlowingSplint  → ignite animation with result ("pops" / "relights" / "no effect")
├── FlameTest      → swab + Bunsen animation, flame colour
└── SmellTest      → text-only observation card
```

Test panel items are unlocked based on activity config — teacher can restrict which tests are available.

### TeacherDashboard (Phase 5)

```
TeacherDashboard
├── CurriculumSelector      (O-Level / A-Level)
├── ComponentLock panel     (check/uncheck which electrodes/electrolytes visible)
├── PresetSelector          (choose starting configuration)
├── QuestionEditor          (add guiding questions)
├── HintEditor
├── RevealAnswersToggle
└── ExportActivity          (save config as JSON for sharing)
```

---

## File Structure

```
electrochemistry-sim/
├── index.html
├── style.css
│
├── data/
│   ├── electrodes.js       // ElectrodeDB — all electrode data
│   ├── electrolytes.js     // ElectrolyteDB — all electrolyte data
│   ├── ions.js             // IonDB — half-reaction data, E° values
│   └── products.js         // ProductDB — product → test result mappings
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
├── controller/
│   ├── SimController.js
│   └── ActivityConfig.js
│
├── ui/
│   ├── SimRenderer.js
│   ├── HitboxManager.js
│   ├── TestPanel.js
│   └── TeacherDashboard.js
│
└── activities/
    ├── act_01_inert.js
    ├── act_02_reactive.js
    ├── act_03_concentration.js
    ├── act_04_eccell.js
    └── act_05_nernst.js
```

---

## Build Phases

### Phase 1 — Core Electrolysis Engine *(start here)*
- Electrode, Electrolyte, Ion, Product data classes
- NernstCalculator
- ElectrolysisEngine (cathode + anode product selection)
- Basic beaker UI — dropdown selectors, run button, text output of products

### Phase 2 — Visual Rendering
- Canvas beaker with electrode rendering
- Bubble animations for gas products
- Deposit animations for solid products
- Ion migration arrows

### Phase 3 — Test Panel
- Litmus, splint, flame test interactions
- Animated test result feedback
- Observation log

### Phase 4 — EC Cell Mode (A-Level)
- ECCellEngine
- HalfCell UI — two beakers with salt bridge
- EMF readout (hide/show E° values per config)
- Nernst concentration slider

### Phase 5 — Guided Activities
- ActivityConfig system
- Built-in activities (act_01–act_05)
- Question/hint UI overlay

### Phase 6 — Teacher Dashboard
- Component lock panel
- Question editor
- Activity export/import (JSON)

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Nernst always computed under the hood | Ensures scientific accuracy; O-Level just doesn't display it |
| Concentration effect emergent from Nernst | Avoids hardcoding "dilute vs concentrated Cl⁻" as a special case |
| Single engine, CurriculumConfig skin | No code duplication between O/A level; easy to extend |
| OOP over React | Matches existing sim codebase; state is centralised, not component-scattered |
| ActivityConfig as plain JSON-serialisable object | Teacher dashboard can export/import activities as files |
| Canvas + transparent SVG hitbox layer | Canvas handles all rendering/animation; SVG provides native DOM click handling without manual hit detection. Coupling point is a `layoutMap` emitted by SimRenderer after each frame. |
