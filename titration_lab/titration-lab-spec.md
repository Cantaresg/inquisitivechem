# TitrationLab — OOP Redesign
## Design Specification & Implementation Plan

**Project:** InquisitiveChem — Titration Module  
**Version:** 1.0 (Pre-implementation)  
**Status:** Approved for Phase 1

---

## 1. Overview

The existing `titration-lab.html` is a single-file procedural implementation with a monolithic state object, interleaved chemistry logic and DOM manipulation, and index-based stage navigation. This redesign refactors it into a modular ES6 class architecture to improve debuggability, extensibility, and long-term maintainability.

### 1.1 Goals

- Separate chemistry simulation from UI rendering entirely
- Make each stage independently testable
- Support teacher-defined lab configurations via session keys (future: SQL-backed JSON)
- Allow IB/JC students to modify thermodynamic parameters (temperature, Kw)
- Enable future addition of new titration types without restructuring existing code

### 1.2 Non-Goals (Current Phase)

- Backend/API integration (mocked via sessionStorage)
- Full balance animation in Standard Solution stage
- Mobile responsive layout
- Multi-user / collaborative sessions

---

## 2. Project File Structure

```
titration-lab/
├── index.html                  ← Main menu (mode + chemical selection)
├── lab.html                    ← The lab itself
├── css/
│   └── theme.css               ← Shared dark theme, design tokens, animations
└── js/
    ├── SessionConfig.js         ← Config loading (sessionStorage now, API later)
    ├── TitrationLab.js          ← Top-level controller; wires all components
    ├── EventBus.js              ← Decoupled pub/sub between simulation and UI
    ├── data/
    │   ├── ChemicalDB.js        ← Chemical registry (frozen static data)
    │   └── IndicatorDB.js       ← Indicator registry with pH range data
    ├── engine/
    │   ├── PHEngine.js          ← pH computation (instance; temperature-aware)
    │   └── ReactionSystem.js    ← Classifies acid/base pairs; enum + logic
    ├── simulation/
    │   ├── BuretteSimulator.js  ← Drop mechanics, tap state, level tracking
    │   └── FlaskSimulator.js    ← Analyte volume, indicator colour, endpoint
    ├── stages/
    │   ├── Stage.js             ← Abstract base class
    │   ├── SetupStage.js        ← Chemical/indicator selection (practice mode)
    │   ├── StandardStage.js     ← Standard solution prep (JC/guided; simplified)
    │   ├── PipetteStage.js      ← Pipette analyte into flask
    │   ├── BuretteStage.js      ← Fill and check burette
    │   ├── TitrateStage.js      ← Drop loop, swirl, endpoint detection
    │   └── ResultsStage.js      ← Results table, concordance, calculation
    └── ui/
        ├── UIRenderer.js        ← Listens to EventBus; owns all DOM writes
        ├── BuretteRenderer.js   ← Burette SVG + level + drop animation
        ├── FlaskRenderer.js     ← Flask SVG + colour transition + swirl
        └── PHGraphRenderer.js   ← Canvas pH vs volume curve
```

---

## 3. Architecture

### 3.1 Layered Design

```
┌─────────────────────────────────────────────┐
│                index.html                    │  ← User selects mode + chemicals
│             (SessionConfig.save)             │
└──────────────────────┬──────────────────────┘
                       │ sessionStorage / session key
┌──────────────────────▼──────────────────────┐
│             TitrationLab.js                  │  ← Wires all components; owns reset/export
│         (reads SessionConfig.load)           │
└──┬──────────┬───────────┬───────────────────┘
   │          │           │
   ▼          ▼           ▼
EventBus  StageCtrl   PHEngine (instance)
   │          │           │
   │     [Stage[]]    BuretteSimulator
   │                  FlaskSimulator ──→ PHEngine
   │
   ▼ (all DOM writes go through here only)
UIRenderer
├── BuretteRenderer
├── FlaskRenderer
└── PHGraphRenderer
```

### 3.2 Data Flow — One Drop

```
User holds tap button
  → TitrateStage.#onTick()
  → BuretteSimulator.addDrop(ml)
      emits → bus: 'dropAdded' { level, volThisRun }
  → FlaskSimulator.addVolume(ml)
      → PHEngine.compute(...)
      emits → bus: 'phUpdated' { pH, color, volAdded }
      if endpoint: emits → bus: 'endpointReached' { pH, vol }
  → UIRenderer hears 'phUpdated'
      → BuretteRenderer.update(level)
      → FlaskRenderer.update(color, pH)
      → PHGraphRenderer.addPoint(vol, pH)
  → UIRenderer hears 'endpointReached'
      → FlaskRenderer.showEndpointGlow()
      → toast('Endpoint reached')
```

No class calls UIRenderer directly. No renderer reads simulation state.

---

## 4. Class Contracts

### 4.1 EventBus

```javascript
class EventBus {
  on(event, callback)
  off(event, callback)
  emit(event, data)
}
```

**Events emitted:**

| Event | Emitter | Payload |
|---|---|---|
| `stageChanged` | StageController | `{ prevId, nextId, stage }` |
| `dropAdded` | BuretteSimulator | `{ level, volThisRun }` |
| `levelChanged` | BuretteSimulator | `{ level }` |
| `phUpdated` | FlaskSimulator | `{ pH, color, volAdded }` |
| `endpointReached` | FlaskSimulator | `{ pH, vol }` |
| `overshot` | FlaskSimulator | `{ pH, vol }` |
| `runRecorded` | TitrateStage | `{ run, titre, isRough }` |
| `swirled` | FlaskSimulator | `{ count }` |

---

### 4.2 SessionConfig

```javascript
class SessionConfig {
  // Phase 1–7: reads/writes sessionStorage
  // Phase 8+:  swaps .load() to GET /api/session/:key
  //            No other class changes — TitrationLab is unaware of source

  static async load(key = null)
  // Returns config object:
  // {
  //   mode:        'guided' | 'practice' | 'openLab',
  //   level:       'jc' | 'o_level',
  //   titrant:     'naoh',
  //   analyte:     'hcl',
  //   indicator:   'mo',
  //   temperature: 25,     // °C
  //   Kw:          1e-14,
  //   sessionKey:  null | 'ABC123'
  // }

  static save(config)   // used by index.html before navigating to lab.html
}
```

---

### 4.3 ChemicalDB / IndicatorDB

```javascript
class ChemicalDB {
  static get(id)                          // → chemical object | null
  static all()                            // → array of all chemicals
  static validPairs()                     // → [{titrant, analyte}] with known pH model
  static describe(titrantId, analyteId)   // → { type, label, hasSecondEP }
}

class IndicatorDB {
  static get(id)
  static all()
  static validFor(titrantId, analyteId)   // → filtered indicators (pH range check)
}
```

---

### 4.4 ReactionSystem

```javascript
class ReactionSystem {
  // Enum-like constants
  static SA_SB     = 'SA_SB'
  static WA_SB     = 'WA_SB'
  static SA_WB     = 'SA_WB'
  static Na2CO3_SA = 'Na2CO3_SA'

  static classify(titrant, analyte)
  // → one of the above strings, or throws UnknownPairError

  static equivalencePointPH(system, { Ka, Kb, concAtEq })
  // → expected pH at equivalence point (for graph annotation)

  static hasSecondEquivalencePoint(system)
  // → bool (true only for Na2CO3_SA)
}
```

---

### 4.5 PHEngine

```javascript
class PHEngine {
  constructor({ temperature = 25, Kw = 1e-14 } = {})

  // IB students can adjust these:
  setTemperature(celsius)  // recalculates Kw via van't Hoff approximation
  setKw(value)

  get temperature()
  get Kw()

  compute(titrant, analyte, volTitrant_mL, volAnalyte_mL,
          concTitrant, concAnalyte)
  // → pH (number, clamped 0–14)

  // Private model methods (not accessible externally):
  // #pH_SA_SB, #pH_WA_SB, #pH_SA_WB, #pH_Na2CO3_SA
}
```

---

### 4.6 BuretteSimulator

```javascript
class BuretteSimulator extends EventEmitter {
  constructor(volumeML = 50)

  fill(chemical, concentration)
  expelBubble()
  removeFunnel()
  openTap() / closeTap()
  addDrop(dropSizeML)       // → { newLevel, volAdded }
                            // emits: 'dropAdded', 'levelChanged'

  recordInitial()           // snapshot level → #initial
  recordFinal()             // snapshot level → #final

  get level()               // mL remaining
  get volumeAdded()         // since recordInitial()
  get titre()               // #final - #initial
  get hasBubble()
  get hasFunnel()
  get isTapOpen()
  get chemical()
  get concentration()

  reset()
}
```

---

### 4.7 FlaskSimulator

```javascript
class FlaskSimulator extends EventEmitter {
  constructor(phEngine, volumeML = 25)

  fill(chemical, concentration)
  setIndicator(indicator)
  addVolume(ml)             // recomputes pH; emits 'phUpdated'
                            // may emit 'endpointReached', 'overshot'
  swirl()                   // emits 'swirled'; manages false endpoint counter

  get pH()
  get indicatorColor()      // CSS colour string
  get isAtEndpoint()
  get isOvershot()
  get volume()              // current total mL in flask
  get phHistory()           // [{volAdded, pH}]
  get totalVolAdded()

  reset()

  // Private: trueConcentration stored here for openLab mode
  // Only exposed via ResultsStage when mode === 'openLab'
}
```

---

### 4.8 Stage (Abstract Base)

```javascript
class Stage {
  constructor(id, label, { bus, labState, burette, flask, renderer })

  get id()
  get label()
  get isComplete()          // set true when validate() passes and stage exits

  // Lifecycle — all overridden by subclasses:
  enter()                   // called on activation; set up listeners
  exit()                    // called on deactivation; clean up listeners
  validate()                // → { ok: bool, reason: string }
  renderArea(el)            // renders into centre panel element
  renderControls(el)        // renders into bottom controls bar element

  // Helpers:
  _toast(msg, level)
  _log(type, text, level)
}
```

---

### 4.9 TitrateStage

```javascript
class TitrateStage extends Stage {
  enter()
  exit()                    // always calls stopDropping()

  startDropping(rate)       // 'drop' | 'slow' | 'fast'
  stopDropping()
  swirl()

  // Owns the setInterval drop loop:
  #dropLoop = null
  #dropRateMs = { drop: 800, slow: 300, fast: 80 }
  #onTick()                 // one tick: addDrop → flask.addVolume → check endpoint

  recordResult(isRough)     // saves RunRecord; emits 'runRecorded'
  newRun()                  // resets burette + flask for next run

  get canRecord()           // endpoint reached or manual stop
  get currentRunNumber()
  get runs()                // array of RunRecord
}
```

---

### 4.10 StageController

```javascript
class StageController {
  constructor(stages[], bus)

  get current()             // Stage instance
  get currentId()
  get currentIndex()

  advance()                 // validate() → if ok: exit() → next.enter(); emit 'stageChanged'
  back()                    // exit() → prev.enter(); emit 'stageChanged'
  jumpTo(id)                // only if isComplete(id) is true

  isComplete(id)
  isLocked(id)
}
```

---

### 4.11 UIRenderer

```javascript
class UIRenderer {
  constructor(bus, labState)
  // Subscribes on construction:
  //   'stageChanged'      → renderStageNav(), renderCurrentStage()
  //   'levelChanged'      → buretteRenderer.update()
  //   'phUpdated'         → flaskRenderer.update(), phGraphRenderer.addPoint()
  //   'endpointReached'   → flaskRenderer.showGlow(), toast()
  //   'runRecorded'       → renderResultsTable()

  renderStageNav()
  renderCurrentStage()
  renderResultsTable(runs)
  toast(msg, level)

  // Sub-renderer instances (created in constructor):
  buretteRenderer    // BuretteRenderer
  flaskRenderer      // FlaskRenderer
  phGraphRenderer    // PHGraphRenderer
}
```

---

### 4.12 TitrationLab (Top-Level Controller)

```javascript
class TitrationLab {
  constructor(config)
  // config from SessionConfig.load()
  // Instantiates and wires:
  //   phEngine      = new PHEngine({ temperature, Kw })
  //   burette       = new BuretteSimulator()
  //   flask         = new FlaskSimulator(phEngine)
  //   bus           = new EventBus()
  //   stages        = _buildStageList(mode, level)  // filtered array
  //   stageCtrl     = new StageController(stages, bus)
  //   renderer      = new UIRenderer(bus, this)

  reset()     // re-instantiates simulators; resets stageCtrl to stage 0
  exportCSV() // serialises runs[] to CSV blob + triggers download

  // Private:
  _buildStageList(mode, level)  // returns filtered Stage[] based on mode
}
```

---

## 5. Stage Activation by Mode

| Stage | `guided` (JC/IB) | `practice` (O-Level) | `openLab` |
|---|---|---|---|
| SetupStage | Skipped — config pre-loaded from session | Shown | Shown |
| StandardStage | Shown (simplified) | Skipped | Skipped |
| PipetteStage | Shown | Shown | Shown |
| BuretteStage | Shown | Shown | Shown |
| TitrateStage | Shown | Shown | Shown |
| ResultsStage | Shown | Shown | Shown (reveals true conc. after calc) |

`StageController` receives the pre-filtered list. It is never mode-aware itself.

---

## 6. Main Menu (index.html)

The menu decouples lab configuration from the lab itself. Students arrive at `index.html`, make their selections, and are routed to `lab.html` with a pre-configured session.

### 6.1 Selection Flow

1. **Choose mode:** Guided / Practice / Open Lab card
2. **Choose titrant** (burette chemical) — concentration shown if known
3. **Choose analyte** (flask chemical)
4. **Choose indicator** — filtered to chemically valid options only
5. **Optional (JC/IB):** Adjust temperature (15–40°C), override Kw
6. **Start Lab** → `SessionConfig.save(config)` → navigate to `lab.html`

### 6.2 Future: Session Key Flow

Teacher creates JSON config in school system → gets session key `ABC123`
Student enters `ABC123` on `index.html` → `SessionConfig.load('ABC123')` hits API → lab loads pre-configured

`lab.html` and all JS classes are unaware of whether config came from sessionStorage or the API.

---

## 7. Implementation Plan

### Phase 1 — Core Engine (No UI)
**Files:** `EventBus.js`, `ReactionSystem.js`, `PHEngine.js`, `ChemicalDB.js`, `IndicatorDB.js`

- Port all Ka/Kb constants and pH functions from `titration-lab.html`
- Wrap in `PHEngine` instance with `setTemperature()` using van't Hoff:
  `Kw(T) ≈ exp(-6908/T + 22.6)` where T is Kelvin
- Implement `ReactionSystem.classify()` replacing the current if-chain
- Verify with console assertions: test pH at 0%, 50%, 100%, 150% titration for all 4 reaction systems against published values

**Exit criteria:** All 4 × 4 pH spot-checks pass in browser console

---

### Phase 2 — Simulation Layer
**Files:** `BuretteSimulator.js`, `FlaskSimulator.js`

- `BuretteSimulator` extracts drop mechanics from current `startDrop`/`stopDrop`
- `FlaskSimulator.addVolume()` calls `PHEngine.compute()` and emits events
- Scripted console test: simulate 50 drops, verify pH curve shape, endpoint detection

**Exit criteria:** Full titration simulatable in console with no DOM

---

### Phase 3 — Stage System
**Files:** `Stage.js`, all 6 stage subclasses, `StageController.js`

- Port each `renderXxxStage()` function into its Stage subclass
- `StandardStage` simplified: mass input field only, static SVG diagram
- `TitrateStage` owns `setInterval` drop loop
- Each `validate()` tested independently with mock state

**Exit criteria:** `stageCtrl.advance()` cycles correctly through all stages in each mode

---

### Phase 4 — UI Layer
**Files:** `theme.css`, `BuretteRenderer.js`, `FlaskRenderer.js`, `PHGraphRenderer.js`, `UIRenderer.js`

- Port all CSS from existing file into `theme.css`
- Renderers subscribe to EventBus; never read simulation state directly
- `BuretteRenderer`: SVG tube + liquid height + drop animation
- `FlaskRenderer`: SVG flask + `fill` colour transition + swirl animation
- `PHGraphRenderer`: Canvas with gradient stroke, EP marker

**Exit criteria:** A titration run visually completes end-to-end with correct colour change

---

### Phase 5 — Integration
**Files:** `TitrationLab.js`, `lab.html`

- Wire all components in `TitrationLab` constructor
- `reset()` re-instantiates simulators without full page reload
- `exportCSV()` from `runs[]`
- `lab.html` skeleton with correct DOM targets

**Exit criteria:** Three concordant runs completable; CSV exports correctly

---

### Phase 6 — Entry Point
**Files:** `SessionConfig.js`, `index.html`

- Mode + chemical selection cards
- `IndicatorDB.validFor()` filters indicator list reactively
- `SessionConfig.save()` on start; `SessionConfig.load()` in `lab.html`
- Temperature/Kw controls shown only for `level === 'jc'`

**Exit criteria:** Full flow: menu → lab → results; back button re-loads same config

---

## 8. Potential Issues & Notes

### 8.1 PHEngine — Weak Acid/Base Numerical Stability

The current `pH_WA_SB` uses a simple square-root approximation near the equivalence point which can produce NaN or negative values when `nAcid ≈ nBase` and concentrations are very low. The Henderson-Hasselbalch equation also breaks down when `nSalt/nAcidLeft` approaches 0 or infinity (within ~0.1% of equivalence point).

**Mitigation:** Add epsilon guards around the equivalence transition. Consider a small numerical solver (Newton-Raphson, 3–5 iterations) for the equivalence point itself rather than the analytic approximation.

---

### 8.2 Na₂CO₃ Two-Equivalence-Point Curve

The carbonate system has two equivalence points. The current code handles this but the pH jump at EP1 (CO₃²⁻ → HCO₃⁻) is much smaller than EP2 and is easily missed with coarse drop sizes. The indicator choice (methyl orange) is correct for EP2 but students may confuse EP1 colour change for the endpoint.

**Mitigation:** In `ResultsStage`, annotate both EPs on the graph. Add a tooltip/warning if the student stops at EP1 volume.

---

### 8.3 Drop Rate vs Accuracy

Fast drop mode (`dropRateMs = 80ms`) at 0.1 mL/drop means ~1.25 mL/sec, which can jump 2–3 pH units in a single tick near the equivalence point — realistic, but the colour change animation may lag behind the pH computation and appear jarring.

**Mitigation:** Decouple drop tick rate from animation frame rate. `#onTick()` updates state; `requestAnimationFrame` drives rendering. The EventBus already supports this naturally.

---

### 8.4 EventBus Memory Leaks

If `Stage.enter()` registers listeners on the bus and `Stage.exit()` fails to remove them (e.g., due to an exception mid-titration), stale handlers accumulate across runs.

**Mitigation:** Each Stage should store its listener references and `exit()` must always clean up. Consider a pattern where `enter()` returns a cleanup function (similar to React `useEffect`), called automatically by `StageController.advance()`.

---

### 8.5 SessionConfig — sessionStorage Scope

`sessionStorage` is per-tab. If a student opens `lab.html` directly (e.g., from browser history) without going through `index.html`, `SessionConfig.load()` returns null and the lab has no config.

**Mitigation:** `TitrationLab` should detect a null config and redirect to `index.html` with a user-friendly message, not throw a silent error.

---

### 8.6 Indicator False Endpoint (Swirl Logic)

The current file tracks `dropsWithoutSwirl` to simulate the fading colour that appears before a proper endpoint in phenolphthalein titrations. This state lives in the global `state` object today. In the new design it should live in `FlaskSimulator` (it's a property of the flask contents) but be triggered by `TitrateStage` (it's a function of user behaviour).

**Mitigation:** `FlaskSimulator` exposes `falseEndpointActive` as a getter. `TitrateStage.#onTick()` calls `flask.notifyDropWithoutSwirl()` to increment the counter, and `swirl()` resets it. This keeps the chemistry model in the simulator but behaviour coupling in the stage.

---

### 8.7 IB Temperature Feature — van't Hoff Accuracy

The van't Hoff approximation for Kw over temperature is a simplification. At 15°C Kw ≈ 4.5×10⁻¹⁵ and at 37°C Kw ≈ 2.1×10⁻¹⁴. The approximation is adequate for IB purposes but diverges significantly above 40°C.

**Mitigation:** Clamp `setTemperature()` to 5–40°C range with a UI warning. Document the approximation in the IB help text.

---

### 8.8 Module Loading in Single HTML Context

Using `<script type="module">` means each file is loaded as a true ES6 module. This requires either a local server (CORS blocks file:// module imports) or bundling. Students opening `lab.html` directly as a file will see a blank page.

**Mitigation:** Document that the project must be served (e.g., `python -m http.server` or via GitHub Pages / Netlify). Alternatively, use a bundler (Vite or esbuild) as a build step that produces a single `bundle.js` for distribution — the source stays modular but the output is a single file compatible with direct file:// access.

---

## 9. Open Questions (To Resolve Before Phase 3)

1. **Results concordance rule:** Current code uses ±0.10 mL as the concordant threshold. Is this correct for both JC and O-Level, or should it be configurable per level?

2. **Rough titration:** Should `TitrateStage` enforce that the first run is always rough (fast drop allowed, result excluded from mean), or is this optional based on mode?

3. **Open Lab reveal:** When does the true analyte concentration get revealed in `openLab` mode — immediately on results page, or only after the student submits their calculated value?

4. **Pipette stage depth:** Currently the pipette stage is largely instructional (click through). Should it include a drag-and-drop pipette animation, or stay as illustrated steps for Phase 1?

---

*Document prepared for InquisitiveChem development. Corresponds to chem-lab OOP refactor in progress at github.com/Cantaresg/inquisitivechem*
