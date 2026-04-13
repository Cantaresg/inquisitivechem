# ChemLab Virtual Lab — Implementation Plan
**Version:** 1.0  
**Date:** 2026-04-13  
**Scope:** Phase 1 — Open Student Lab (`chem-lab.html`), fully offline, no Supabase required.  
**Phase 2** (teacher module) is a separate fall and is listed at the end for reference only.

---

## File Structure to Be Created

```
Chem_sim/
├── chem-lab.html
├── data/
│   ├── reagents.js
│   ├── reactions.js
│   ├── tests.js
│   └── easter-eggs.js
├── engine/
│   ├── Solution.js
│   ├── Vessel.js
│   ├── ReactionEngine.js
│   └── GasTestEngine.js
├── ui/
│   ├── main.js
│   ├── AnimationManager.js
│   ├── DragDropManager.js
│   ├── BenchUI.js
│   ├── VesselUI.js
│   ├── ChemStoreUI.js
│   ├── TestBarUI.js
│   └── ObservationLog.js
├── lib/
│   └── docx-export.js
└── css/
    ├── chem-lab.css
    └── animations.css
```

---

## Build Order — Bottom-Up by Dependency

### Sprint 1 — Data Layer

No dependencies. Plain JS objects and arrays. Human-editable chemistry knowledge.
No engine changes are ever needed to add new reagents or reactions — only these files.

| File | Content |
|------|---------|
| `data/reagents.js` | Full `REAGENTS` array — all 40+ reagents with `id`, `ions`, `color`, `category`, `subcategory`, `dissolvedGas`, `isHot` |
| `data/reactions.js` | `PRECIPITATION_TABLE`, `GAS_RULES`, `REDOX_RULES`, `COMPLEXATION_RULES`, `OBSERVATIONS` text strings |
| `data/tests.js` | `CONFIRMATORY_TESTS` — 10 tools with `positiveAnimId`, `negativeAnimId`, observation text |
| `data/easter-eggs.js` | `EASTER_EGGS` — golden rain override + open structure for future additions |

---

### Sprint 2 — Engine Layer

Pure logic. Zero DOM access. All methods that modify state operate on a cloned working
solution, never the live vessel. Fully testable in isolation.

| File | Key Responsibilities | Watchlist Items Addressed |
|------|---------------------|--------------------------|
| `engine/Solution.js` | Ion map, ppt list, gas list, pH, `clone()`, `tickGasPressure()`, derived colour property | BUG-03 (pH recalc after neutralisation), BUG-04 (colour computed from ions, not cached), BUG-06 (pressure decay via `tickGasPressure`) |
| `engine/Vessel.js` | Wraps `Solution`; vessel type (`beaker` / `test_tube` / `evaporating_dish`); `setHeat(on)` | BUG-08 (heat/cool toggle; mutually exclusive; `isHot` propagated to solution) |
| `engine/ReactionEngine.js` | `static process(vessel, reagent)` — full sweep collecting all events before any mutation; easter egg override applied last; returns `ReactionEvent[]` | BUG-01 (no early return on first match), BUG-02 (sweep on cloned solution), BUG-05 (complexation excess = ppt already present) |
| `engine/GasTestEngine.js` | `static runTest(vessel, testId)` — pressure threshold guard (`> 0.05`) for positive result | BUG-07 (zero-pressure gas treated as absent) |

#### `ReactionEvent` shape (returned by `ReactionEngine.process`)

```js
{
  id:          string,           // crypto.randomUUID() — dedup key for ObservationLog
  type:        'precipitation' | 'gas' | 'redox' | 'complexation' | 'no_reaction',
  animId:      string,           // registered in AnimationManager
  observation: string,           // plain English from OBSERVATIONS map
  equation:    string,           // balanced ionic equation for Reactions tab
  ionChanges:  { [symbol]: number | null },  // null = consumed
  pptAdded:    PptDescriptor | null,
  pptRemoved:  string | null,
  gasAdded:    { id, pressure } | null,
  colorChange: { from, to } | null,
}
```

---

### Sprint 3 — UI Layer

DOM-only. Reads engine state. No chemistry logic here.

#### 3a — CSS

| File | Content |
|------|---------|
| `css/chem-lab.css` | Three-column grid layout; vessel card layers (liquid, ppt, bubble, label, controls); left panel tree; top bar; right panel; toast styles |
| `css/animations.css` | All `@keyframe` definitions used by `AnimationManager` (bubbles, precipitate fall, colour fade, pour arc, flame, golden rain, crystallise) |

#### 3b — `ui/AnimationManager.js`

- Central registry `ANIM_REGISTRY` mapping `animId → function(vesselEl, params)`.
- `play(animId, vesselEl, params)` — dispatches to registered function.
- `playAll(animList, vesselEl)` — fires all simultaneously (no await between).
- Per-vessel boolean lock: while any test animation plays, subsequent test drags are queued or ignored.
- Golden rain: max 40–60 SVG `<polygon>` flakes; `will-change: transform`; elements removed from DOM on animation end.

Watchlist: BUG-17 (animation lock per vessel), TRAP-05 (golden rain polygon cap).

#### 3c — `ui/DragDropManager.js`

- Uses **Pointer Events API** (`pointerdown`, `pointermove`, `pointerup`) exclusively.
- Single `activeDrag` state: `{ type, id, ghostEl, originEl, sourceVesselId }`.
- `pointerdown`: create ghost div attached to `document.body`; call `event.setPointerCapture`.
- `pointermove`: translate ghost to follow pointer.
- `pointerup`: `document.elementsFromPoint(x, y)` hit-test; walk up to first registered drop zone; unconditionally remove ghost; fire `chemlab:drop` CustomEvent on target.
- Ignore drop zones whose `data-vessel-id` matches `sourceVesselId`.
- Keyboard fallback: Space/Enter on focused reagent enters pick mode; Space/Enter on bench slot places it; `aria-live` announcement.
- Do NOT attach `touchstart`/`touchmove`/`touchend` — pointer events cover touch; dual listeners cause double-firing.

Watchlist: BUG-09 (SVG boundary), BUG-10 (ghost always removed), BUG-11 (self-drop guard), TRAP-02 (pointer-only, no touch duplication).

#### 3d — `ui/VesselUI.js`

- One component per vessel card.
- Layered render: liquid layer → ppt layer → bubble layer → label → controls row.
- Controls: heat button (flame icon), cool button (snowflake icon), wash button (✕ with confirmation).
- Heat/cool buttons are mutually exclusive; clicking one disables the other.
- `render()` always reads directly from `vessel.solution` — no internal cached snapshot.
- Does **not** call `ReactionEngine` — only `BenchUI` does.

Watchlist: BUG-18 (no stale state cache).

#### 3e — `ui/BenchUI.js`

- Manages 6 vessel slots.
- `handleDrop(vesselId, dragDetail)`:
  1. Resolve reagent from `REAGENTS` by id.
  2. Call `ReactionEngine.process(vessel, reagent)` → `events[]`.
  3. Apply all event `ionChanges`, `pptAdded`, `pptRemoved`, `gasAdded`, `colorChange` to `vessel.solution`.
  4. Call `vesselUI.render()`.
  5. Call `animManager.playAll(events, vesselEl)`.
  6. Call `observationLog.append(entry)` for each event.
- `filterVessel(vesselId)`: check `vesselCount + 1 <= 6` before executing; abort with toast if not; remove source only after both new vessels confirmed to fit.
- Evaporating dish vessels (`type: 'evaporating_dish'`) reject reagent drops.
- Mixture counter: count vessels whose name starts with "Mixture" at time of naming; do not renumber on removal.
- `vesselCount` getter: returns current slot occupancy.

Watchlist: BUG-12 (filter limit), BUG-13 (mixture counter), BUG-14 (evaporating dish drop rejection), BUG-19 (dedup log entries by event UUID).

#### 3f — `ui/ChemStoreUI.js`

- Generates the nested hover-dropdown tree by iterating `REAGENTS` grouped by `category → subcategory`.
- Never hardcodes chemical names in HTML — new reagents in `reagents.js` appear automatically.
- Fires `DragDropManager` on click/drag of a chemical item.

Watchlist: TRAP-09 (dynamic generation from data).

#### 3g — `ui/TestBarUI.js`

- Renders draggable test tool icons from `CONFIRMATORY_TESTS`.
- On drop onto vessel: calls `GasTestEngine.runTest(vessel, testId)` → `{ animId, observation, isPositive }`.
- Passes resolved `animId` to `AnimationManager.play()`.
- Flame test animation shows colour only — no element name, no formula in SVG.
- Negative result plays `negativeAnimId` (e.g. splint extinguishes, limewater stays clear).

Watchlist: BUG-15 (flame anim no labels), BUG-16 (negative anim when no gas present).

#### 3h — `ui/ObservationLog.js`

- Right panel starts **collapsed** — no auto-open ever.
- `append(entry)`: deduplicates by `entry.id` (UUID) before inserting DOM row.
- Each row is a `<details>` element: `<summary>` = "Event at HH:MM:SS" (neutral), `<p>` = observation text.
- Equations tab: separate nested `<details>` per event that has an `equation`.
- `exportDocx()`: dynamically imports `docx.js` via `import()` (lazy, not top-level); generates H1/H2 document; triggers browser download.
- All teacher/user text rendered via `textContent` or sanitised Markdown — never raw `innerHTML`.

Watchlist: TRAP-04 (lazy docx), TRAP-08 (no auto-open), TRAP-10 (no innerHTML with external text).

---

### Sprint 4 — Entry Point Wiring

| File | Content |
|------|---------|
| `ui/main.js` | Imports all UI and engine classes; instantiates in dependency order; wires `chemlab:drop` CustomEvent listeners; no business logic |
| `chem-lab.html` | Three-column grid skeleton (left store, centre bench, right panel); top test bar strip; `<script type="module" src="ui/main.js">`; no inline JS |

---

## Architectural Invariants (Enforced Throughout)

| Rule | Source |
|------|--------|
| No `window.*`, no bare module-level mutable state | Architecture mandate, TRAP-01 |
| Every stateful concept is a class | Architecture mandate |
| `ReactionEngine` / `GasTestEngine` — static only, zero DOM | Architecture mandate |
| Engine imports only `data/`. UI imports `engine/` + `data/`. Teacher imports `lib/` + `ui/`. No circular imports. | Arch §7 |
| Data files export plain objects only — no class instances | Architecture mandate |
| `crypto.randomUUID()` with fallback: `Date.now().toString(36) + Math.random().toString(36).slice(2)` | TRAP-03 |
| All chemistry knowledge in `data/` only — no reagent/reaction data in engine or UI files | Arch mandate |

---

## Phase 2 — Teacher Module (Separate Fall)

When ready, the following files slot in without modifying any Phase 1 code:

| File | Purpose |
|------|---------|
| `lib/supabase-client.js` | Supabase client singleton (URL + anon key here only) |
| `teacher/SessionManager.js` | Session CRUD; unique code retry (BUG-21); load-before-render guard (BUG-20) |
| `teacher/TeacherUI.js` | Config dashboard; question builder; reagent checkbox grid (dynamic from `REAGENTS`) |
| `teacher/StudentJoinUI.js` | Code entry screen; filtered lab loader; answer submission |
| `teacher/teacher-main.js` | Teacher wiring entry point |
| `teacher/student-main.js` | Student wiring entry point — lab instantiated only after `SessionManager.loadSession()` resolves |
| `chem-lab-teacher.html` | Teacher entry point |
| `chem-lab-student.html` | Student entry point |
| `css/teacher.css` | Teacher dashboard styles |

Security boundary: Supabase anon key in frontend is intentional and safe; RLS policies in `supabase_teacher_schema.sql` are the security boundary. All teacher/student text rendered via `textContent` / sanitised Markdown (TRAP-10).

---

## Sprint Summary

| Sprint | Deliverable | Files |
|--------|-------------|-------|
| 1 | Data layer | `data/reagents.js`, `data/reactions.js`, `data/tests.js`, `data/easter-eggs.js` |
| 2 | Engine layer | `engine/Solution.js`, `engine/Vessel.js`, `engine/ReactionEngine.js`, `engine/GasTestEngine.js` |
| 3 | UI layer | `css/`, `ui/AnimationManager.js`, `ui/DragDropManager.js`, `ui/VesselUI.js`, `ui/BenchUI.js`, `ui/ChemStoreUI.js`, `ui/TestBarUI.js`, `ui/ObservationLog.js` |
| 4 | Entry point | `ui/main.js`, `chem-lab.html` |
| — | Phase 2 (future) | `lib/`, `teacher/`, `chem-lab-teacher.html`, `chem-lab-student.html`, `css/teacher.css` |
