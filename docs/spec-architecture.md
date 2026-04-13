# ChemLab Virtual Lab — Architecture Specification
**Version:** 1.0  
**Date:** 2026-04-13

---

## 0. Architectural Mandate — OOP with ES6 Modules

**This project must be implemented using Object-Oriented Programming (OOP) with ES6 classes and ES6 modules (`import`/`export`).** This is a hard requirement, not a preference.

### Rationale

The previous build failed repeatedly due to **global state corruption**: multiple parts of the codebase shared mutable variables via `window.*` and bare module-level `let`/`var` declarations. Any module could overwrite any other module's state with no warning. This caused cascading bugs that were impossible to trace and ultimately made the project unrecoverable.

OOP with ES6 modules eliminates this class of bug by design:

| Previous pattern (forbidden) | Required pattern |
|-------------------------------|-----------------|
| `window.currentVessel = ...`  | `BenchUI` owns a private `vessels[]` array |
| `var ions = {}` (shared)      | `Solution` instance owns `this.ions` |
| Function modifies global gas array | `ReactionEngine.process()` returns events; caller applies them |
| Animation logic spread across files | Only `AnimationManager` touches SVG/CSS animations |

### Rules that must be enforced throughout

1. **No global variables.** No `window.*`, no bare module-level mutable state shared across files.
2. **Every stateful concept is a class.** `Solution`, `Vessel`, `BenchUI`, `VesselUI`, `ObservationLog`, `SessionManager` — all classes with `constructor` and methods.
3. **Static-only classes for pure logic.** `ReactionEngine` and `GasTestEngine` have no instance state — all methods are `static`. They receive inputs and return outputs. They never read from or write to anything outside their arguments.
4. **One class per file.** Each `engine/` and `ui/` file exports exactly one class as its default export.
5. **No DOM access in engine classes.** `Solution`, `Vessel`, `ReactionEngine`, `GasTestEngine` must have zero `document.*` calls. They are pure logic and must remain independently testable.
6. **Data files are not classes.** `data/reagents.js`, `data/reactions.js`, `data/tests.js`, `data/easter-eggs.js` export plain objects and arrays only — no class instances. This keeps chemistry knowledge human-editable.

---

## 1. File Layout

```
Chem_sim/
├── chem-lab.html                 ← Open student lab entry point
├── chem-lab-teacher.html         ← Teacher dashboard entry point
├── chem-lab-student.html         ← Student session-join entry point
│
├── data/                         ← EDITABLE chemistry knowledge (no logic)
│   ├── reagents.js               ← All reagents: ions, color, state, label
│   ├── reactions.js              ← Precipitation table, gas rules, redox rules
│   ├── tests.js                  ← Confirmatory tests: detection, animation, observation text
│   └── easter-eggs.js            ← Special reaction overrides + custom animation IDs
│
├── engine/                       ← Pure logic. Zero DOM access. Fully testable.
│   ├── Solution.js               ← Ion inventory, ppt list, gas list, pH, color, temperature
│   ├── Vessel.js                 ← Wraps Solution; adds name, heat state, vessel type
│   ├── ReactionEngine.js         ← Static: process(vessel, reagent) → ReactionEvent[]
│   └── GasTestEngine.js          ← Static: runTest(vessel, testId) → { animId, observation }
│
├── ui/                           ← DOM layer. Reads engine state, triggers animations.
│   ├── main.js                   ← Open lab wiring (imports all UI + engine, no logic)
│   ├── DragDropManager.js        ← Unified pointer-event drag/drop. Emits custom events.
│   ├── BenchUI.js                ← Renders 6 vessel slots. Orchestrates drops and reactions.
│   ├── VesselUI.js               ← One vessel card: liquid layer, ppt layer, bubbles, controls
│   ├── ChemStoreUI.js            ← Left panel hover-dropdown tree
│   ├── TestBarUI.js              ← Top bar draggable test tools
│   ├── ObservationLog.js         ← Right panel: timestamps, collapsible rows, docx export
│   └── AnimationManager.js       ← All animations registered here. Nothing else calls canvas/SVG directly.
│
├── teacher/                      ← Teacher + student-session UI
│   ├── teacher-main.js           ← Teacher dashboard wiring
│   ├── student-main.js           ← Student session lab wiring
│   ├── SessionManager.js         ← Supabase CRUD, code generation, event logging
│   ├── TeacherUI.js              ← Config dashboard, question builder
│   └── StudentJoinUI.js          ← Code entry, filtered lab loader, answer submission
│
├── lib/                          ← Third-party adapters
│   ├── supabase-client.js        ← Supabase client singleton (SUPABASE_URL + ANON_KEY here only)
│   └── docx-export.js            ← Builds .docx from ObservationLog data using docx CDN
│
└── css/
    ├── chem-lab.css              ← Open lab styles
    ├── teacher.css               ← Teacher dashboard styles
    └── animations.css            ← Keyframe definitions used by AnimationManager
```

---

## 2. Data File Contracts

### 2.1 `data/reagents.js`

```js
// Export a plain array. Add new entries here without touching any engine file.
export const REAGENTS = [
  {
    id: 'hcl_dil',
    label: 'Hydrochloric acid (dil.)',
    category: 'liquid',
    subcategory: 'acid',
    color: 'rgba(180,200,255,0.15)',
    ions: { 'H+': 0.1, 'Cl-': 0.1 },        // mol/L approximations for relative reactivity
    dissolvedGas: null,                        // e.g. 'HCl' for conc. version
    isHot: false,                              // default state
  },
  // ... all other reagents
];
```

Key fields:
- `id` — unique string, used as foreign key everywhere
- `ions` — object `{ ionSymbol: concentration }`. Concentration is relative (not exact), used only for reaction priority ranking.
- `dissolvedGas` — for conc. acids that release acid gas on mixing
- `category` / `subcategory` — drives left-panel tree structure

### 2.2 `data/reactions.js`

```js
// Precipitation table: PRECIPITATION_TABLE[cation][anion] = PptDescriptor | null
export const PRECIPITATION_TABLE = {
  'Ag+': {
    'Cl-':  { id: 'agcl',   color: '#f0f0f0', label: 'white',  formula: 'AgCl' },
    'Br-':  { id: 'agbr',   color: '#ede8b0', label: 'cream',  formula: 'AgBr' },
    'I-':   { id: 'agi',    color: '#f5e642', label: 'yellow', formula: 'AgI' },
    'SO4²-':null,
  },
  'Ba2+': {
    'SO4²-': { id: 'baso4', color: '#f8f8f8', label: 'white',  formula: 'BaSO₄' },
  },
  'Pb2+': {
    'SO4²-': { id: 'pbso4',  color: '#f0f0ee', label: 'white',  formula: 'PbSO₄' },
    'Cl-':   { id: 'pbcl2',  color: '#f5f5f5', label: 'white',  formula: 'PbCl₂' },
    'I-':    { id: 'pbi2',   color: '#f5d800', label: 'golden yellow', formula: 'PbI₂',
               easterEgg: 'golden_rain' },  // triggers easter egg override
  },
  // ... all cations
};

// Gas evolution rules
export const GAS_RULES = [
  {
    id: 'h2_metal_acid',
    requires: { ions: ['H+'], solids: ['METAL_ACTIVE'] },
    excludes: { solids: ['cu_s'] },           // Cu doesn't react with dil. acid
    gas: 'H2',
    rateKey: 'metal_reactivity',              // looked up from reagents.js
    observationKey: 'obs_colourless_gas_rapid',
  },
  {
    id: 'co2_carbonate_acid',
    requires: { ions: ['H+', 'CO3²-'] },
    gas: 'CO2',
    observationKey: 'obs_colourless_gas_effervescence',
  },
  // ...
];

// Redox rules
export const REDOX_RULES = [
  {
    id: 'kmno4_decolour',
    requires: { ions: ['MnO4-', 'H+'], anyOf: ['Fe2+', 'I-', 'Br-', 'H2O2'] },
    colorChange: { from: '#8b008b', to: 'rgba(180,200,255,0.1)' },
    ionTransform: { 'MnO4-': null, 'Fe2+': 'Fe3+' },  // null = consumed
    observationKey: 'obs_purple_decolour',
  },
  // ...
];

// Complexation rules
export const COMPLEXATION_RULES = [
  {
    id: 'cu_nh3_complex',
    requires: { ppt: 'cu_oh2', ions: ['NH3', 'NH4+'], excessNH3: true },
    removesPpt: 'cu_oh2',
    colorChange: { to: '#1a4fa0' },
    observationKey: 'obs_deep_blue_solution',
  },
  // ...
];

// Observation text strings (plain English only, no formulas)
export const OBSERVATIONS = {
  obs_colourless_gas_rapid:      'Colourless gas evolved rapidly. Bubbling subsided after approximately 15–20 seconds.',
  obs_colourless_gas_effervescence: 'Effervescence observed. Colourless gas evolved.',
  obs_purple_decolour:           'The purple/violet colour of the solution disappeared, leaving a colourless solution.',
  obs_deep_blue_solution:        'The pale blue precipitate dissolved and the solution turned a deep, intense blue.',
  // ...
};
```

### 2.3 `data/tests.js`

```js
export const CONFIRMATORY_TESTS = [
  {
    id: 'test_burning_splint',
    label: 'Burning splint',
    icon: 'splint-burning.svg',
    detects: { gas: 'H2' },
    positiveAnimId: 'anim_squeaky_pop',
    negativeAnimId: 'anim_splint_extinguish',
    positiveObservation: 'A loud squeaky pop was heard. The flame was extinguished on contact.',
    negativeObservation: 'The burning splint was unaffected.',
  },
  {
    id: 'test_flame',
    label: 'Flame test',
    icon: 'flame-wire.svg',
    detects: { ions: ['Na+', 'K+', 'Ca2+', 'Cu2+'] },   // multiple — show first match, student decides
    positiveAnimId: 'anim_flame_colour',   // animation shows colour only
    positiveObservation: 'The flame produced a distinct colour.',  // deliberately vague
    negativeObservation: 'No distinctive flame colour was observed.',
  },
  // ...
];
```

### 2.4 `data/easter-eggs.js`

```js
export const EASTER_EGGS = [
  {
    id: 'golden_rain',
    triggerPpt: 'pbi2',                           // replaces normal precipitate anim
    customAnimId: 'anim_golden_rain',
    observationOverride: 'A dense golden-yellow crystalline precipitate formed slowly, appearing as golden flakes settling through the solution.',
  },
  // Add future easter eggs here
];
```

---

## 3. Engine Classes

### 3.1 `Solution`

```js
// engine/Solution.js
export class Solution {
  constructor() {
    this.ions       = {};     // { 'H+': 0.1, 'Cl-': 0.1, ... }
    this.solids     = [];     // [ { id: 'mg_s', amount: 1.0 } ]
    this.ppts       = [];     // [ { id: 'agcl', color: '#f0f0f0', formula: 'AgCl' } ]
    this.gases      = [];     // [ { id: 'H2', pressure: 1.0 } ]   pressure: 0→1
    this.color      = 'rgba(180,220,255,0.12)';   // current liquid colour
    this.pH         = 7;
    this.isHot      = false;
    this.isFiltered = false;
  }

  addIons(ionMap) { /* merge ionMap into this.ions */ }
  addSolid(solidId, amount) { /* push to solids */ }
  removeIon(symbol) { /* delete from this.ions */ }
  removeSolid(solidId) { /* splice from solids */ }
  addPpt(pptDescriptor) { /* push if not already present */ }
  removePpt(pptId) { /* splice by id */ }
  addGas(gasId, pressure) { /* push or increase pressure */ }
  tickGasPressure(deltaSeconds) { /* decay all gas pressures; remove at 0 */ }
  clone() { /* deep copy — used by ReactionEngine before mutating */ }
}
```

### 3.2 `Vessel`

```js
// engine/Vessel.js
export class Vessel {
  constructor(sourceName, type = 'beaker') {
    this.id       = crypto.randomUUID();
    this.name     = sourceName;       // "Hydrochloric acid (dil.)" → auto "Mixture 1"
    this.type     = type;             // 'beaker' | 'test_tube' | 'evaporating_dish'
    this.solution = new Solution();
    this.isHot    = false;
    this.mixtureCount = 0;
  }

  setHeat(on) { this.isHot = on; this.solution.isHot = on; }

  renameMixture(counter) {
    this.name = `Mixture ${counter}`;
  }
}
```

### 3.3 `ReactionEngine`

```js
// engine/ReactionEngine.js
// STATIC only. No state. Takes a Vessel, returns events. Caller applies them.

import { PRECIPITATION_TABLE, GAS_RULES, REDOX_RULES,
         COMPLEXATION_RULES, OBSERVATIONS } from '../data/reactions.js';
import { EASTER_EGGS } from '../data/easter-eggs.js';

export class ReactionEngine {

  /**
   * Process all possible reactions after a reagent is added to a vessel.
   * Returns an array of ReactionEvent objects. Does NOT mutate the vessel —
   * caller is responsible for applying events to vessel.solution.
   *
   * @param {Vessel} vessel
   * @param {Object} addedReagent  — from REAGENTS array
   * @returns {ReactionEvent[]}
   */
  static process(vessel, addedReagent) {
    const events = [];

    // 1. Merge ions into a working copy
    const workingSolution = vessel.solution.clone();
    workingSolution.addIons(addedReagent.ions ?? {});
    if (addedReagent.solids) addedReagent.solids.forEach(s => workingSolution.addSolid(s));

    // 2. Full sweep — collect all matches (do NOT return early)
    events.push(...ReactionEngine._checkPrecipitation(workingSolution));
    events.push(...ReactionEngine._checkGasRules(workingSolution));
    events.push(...ReactionEngine._checkRedox(workingSolution));
    events.push(...ReactionEngine._checkComplexation(workingSolution));

    // 3. Easter egg overrides (replace matching event's animId if easter egg exists)
    ReactionEngine._applyEasterEggOverrides(events);

    return events;   // caller applies all of them
  }

  static _checkPrecipitation(sol) { /* iterate ions, check PRECIPITATION_TABLE */ }
  static _checkGasRules(sol)      { /* iterate GAS_RULES */ }
  static _checkRedox(sol)         { /* iterate REDOX_RULES */ }
  static _checkComplexation(sol)  { /* iterate COMPLEXATION_RULES */ }
  static _applyEasterEggOverrides(events) { /* mutate event animIds */ }
}

/**
 * ReactionEvent shape:
 * {
 *   type:        'precipitation' | 'gas' | 'redox' | 'complexation' | 'no_reaction',
 *   animId:      string,          // registered in AnimationManager
 *   observation: string,          // from OBSERVATIONS map (plain English)
 *   equation:    string,          // balanced ionic equation for Reactions tab
 *   ionChanges:  { [symbol]: number | null },   // null = consumed, number = new value
 *   pptAdded:    PptDescriptor | null,
 *   pptRemoved:  string | null,
 *   gasAdded:    { id, pressure } | null,
 *   colorChange: { from, to } | null,
 * }
 */
```

### 3.4 `GasTestEngine`

```js
// engine/GasTestEngine.js
import { CONFIRMATORY_TESTS } from '../data/tests.js';

export class GasTestEngine {
  /**
   * Run a confirmatory test against a vessel's current state.
   * Returns the animation ID and plain English observation string.
   *
   * @param {Vessel} vessel
   * @param {string} testId
   * @returns {{ animId: string, observation: string, isPositive: boolean }}
   */
  static runTest(vessel, testId) {
    const test = CONFIRMATORY_TESTS.find(t => t.id === testId);
    if (!test) throw new Error(`Unknown test: ${testId}`);

    const sol = vessel.solution;
    let isPositive = false;

    if (test.detects.gas) {
      isPositive = sol.gases.some(g => g.id === test.detects.gas && g.pressure > 0.05);
    } else if (test.detects.ions) {
      isPositive = test.detects.ions.some(ion => sol.ions[ion] > 0);
    }

    return {
      animId:      isPositive ? test.positiveAnimId : test.negativeAnimId,
      observation: isPositive ? test.positiveObservation : test.negativeObservation,
      isPositive,
    };
  }
}
```

---

## 4. UI Layer

### 4.1 `DragDropManager`

- Uses **Pointer Events API** (`pointerdown`, `pointermove`, `pointerup`) — not deprecated mouse events, works for touch too.
- Maintains a single `activeDrag` state object: `{ type: 'reagent'|'test'|'vessel', id, ghostEl, originEl }`.
- On `pointerdown` on a draggable element: create ghost div, attach to body, begin tracking.
- On `pointermove`: translate ghost to follow pointer.
- On `pointerup`: hit-test against registered drop zones. Fire a custom `chemlab:drop` CustomEvent on the target element with `detail: { dragType, id, sourceVesselId? }`.
- All drop handling is done in listeners on BenchUI/TestBarUI — DragDropManager emits only, never acts.
- **Keyboard fallback**: pressing Space/Enter on a focused reagent enters "pick" mode; pressing Space/Enter on a bench slot places it. Announced via `aria-live`.

### 4.2 `BenchUI`

```js
export class BenchUI {
  constructor(containerEl, animManager, observationLog) { ... }

  addVessel(vessel) { ... }           // creates VesselUI, appends to slots
  removeVessel(vesselId) { ... }      // with confirmation
  handleDrop(vesselId, dragDetail) {  // called by chemlab:drop listener
    // 1. Find target vessel
    // 2. Get reagent from REAGENTS by id
    // 3. Call ReactionEngine.process(vessel, reagent)
    // 4. Apply all returned events to vessel.solution
    // 5. Tell VesselUI to re-render
    // 6. Tell AnimationManager to play all event anims simultaneously
    // 7. Append all observations to ObservationLog
    // 8. Check vessel limit before adding new vessel
  }
  transferVessels(fromId, toId) { ... }
  filterVessel(vesselId) { ... }      // split into filtrate + residue dish; check limit
  get vesselCount() { ... }
}
```

### 4.3 `VesselUI`

One component per vessel card. Responsible only for rendering a single vessel.

- Renders layers stacked in a CSS grid: liquid layer, ppt layer, bubble layer, label, controls row.
- Controls row: heat button, cool button, transfer icon, wash (remove) button.
- Heat/cool toggle calls `vessel.setHeat(on)` and re-renders rim color (orange = hot, blue = cold, none = ambient).
- Does not call `ReactionEngine` itself — only `BenchUI` does that.
- Re-render is triggered by `BenchUI` after events are applied, not by internal timers.

### 4.4 `AnimationManager`

All animations are registered in a central map:

```js
const ANIM_REGISTRY = {
  anim_bubbles:           (vesselEl, params) => { /* CSS keyframe burst */ },
  anim_precipitate:       (vesselEl, params) => { /* particle fall */ },
  anim_color_fade:        (vesselEl, params) => { /* CSS transition */ },
  anim_squeaky_pop:       (vesselEl, params) => { /* splint SVG + optional audio */ },
  anim_golden_rain:       (vesselEl, params) => { /* SVG polygon flake animation */ },
  // ...
};

export class AnimationManager {
  play(animId, vesselEl, params = {}) {
    const fn = ANIM_REGISTRY[animId];
    if (fn) fn(vesselEl, params);
  }

  // Play multiple animations on the same vessel simultaneously (no await between)
  playAll(animList, vesselEl) {
    animList.forEach(({ animId, params }) => this.play(animId, vesselEl, params));
  }
}
```

Key design rule: **Never call `AnimationManager.play()` from engine classes**. Only `BenchUI` and `TestBarUI` call it, after receiving events.

### 4.5 `ObservationLog`

```js
export class ObservationLog {
  constructor(panelEl) { ... }

  append(entry) {
    // entry: { timestamp, observation, equation? }
    // Creates a collapsed <details> row: <summary> = "Event at HH:MM:SS"
    // <p> inside = observation text (plain English)
    // If equation present, separate nested <details> for Reactions tab copy
  }

  exportDocx() {
    // Collects all entries (expanded and collapsed)
    // Uses docx.js to build Document:
    //   - H1: "Lab Report"
    //   - H2: "Observations" → paragraph per entry
    //   - H2: "Reactions" → equation per entry that has one
    // Triggers browser download
  }
}
```

---

## 5. Teacher / Session Layer

### 5.1 `SessionManager`

```js
export class SessionManager {
  constructor(supabaseClient) { ... }

  async createSession(teacherConfig) {
    const code = SessionManager._generateCode();   // 'CHEM-' + 4 random alphanum
    // INSERT into teacher_sessions
    return { sessionId, code };
  }

  async loadSession(code) {
    // SELECT from teacher_sessions WHERE session_code = code AND is_active = true
    // Returns config_json
  }

  async joinStudent(sessionId, studentName) {
    // INSERT into student_participants
    return participantId;
  }

  async logEvent(sessionId, participantId, eventType, payload) {
    // INSERT into student_events
  }

  async submitAnswers(sessionId, participantId, answers) {
    // UPSERT into student_answers
  }

  async getStudentSnapshot(participantId) {
    // SELECT all events for participantId, ordered by created_at
    // Returns event array; TeacherUI reconstructs bench state from it
  }

  static _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no ambiguous chars
    return 'CHEM-' + Array.from({length: 4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  }
}
```

### 5.2 `lib/supabase-client.js`

```js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL  = 'YOUR_SUPABASE_URL';     // replace before deploy
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';     // anon key only — safe in browser

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

Only this file knows the URL and key. Every module that needs Supabase imports `supabase` from here.

---

## 6. HTML Entry Points

### `chem-lab.html`
```html
<script type="module" src="ui/main.js"></script>
```
`main.js` imports all UI classes, instantiates them, wires events. No logic in HTML.

### `chem-lab-teacher.html`
```html
<script type="module" src="teacher/teacher-main.js"></script>
```

### `chem-lab-student.html`
```html
<script type="module" src="teacher/student-main.js"></script>
```

---

## 7. Module Dependency Graph

```
chem-lab.html
  └─ ui/main.js
       ├─ data/ (reagents, reactions, tests, easter-eggs)   ← read-only
       ├─ engine/ (Solution, Vessel, ReactionEngine, GasTestEngine)
       └─ ui/ (BenchUI, ChemStoreUI, TestBarUI, ObservationLog,
               AnimationManager, DragDropManager, VesselUI)

chem-lab-teacher.html
  └─ teacher/teacher-main.js
       ├─ lib/supabase-client.js
       └─ teacher/ (SessionManager, TeacherUI)

chem-lab-student.html
  └─ teacher/student-main.js
       ├─ lib/supabase-client.js
       ├─ teacher/ (SessionManager, StudentJoinUI)
       └─ ui/ (all open lab UI, filtered by session config)
```

No circular imports. `data/` has no imports. `engine/` imports only `data/`. `ui/` imports `engine/` and `data/`. `teacher/` imports `lib/` and `ui/`.
```
