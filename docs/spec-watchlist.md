# ChemLab Virtual Lab — Known Pitfalls & Implementation Watchlist
**Version:** 1.0  
**Date:** 2026-04-13  
**Purpose:** Every item here is a known bug from the previous failed build, or a foreseeable edge case that must be handled explicitly. Read this before writing any code.

---

## 1. Reaction Engine

### BUG-01 — Early return on first match (caused missed simultaneous reactions)
**What went wrong:** The previous engine found the first matching reaction rule and returned immediately.  
**Fix:** `ReactionEngine.process()` must run ALL rule sweeps (precipitation, gas, redox, complexation, easter eggs) against the working solution copy and collect every triggered event into an array **before** returning. Never `return` or `break` on the first match.

### BUG-02 — Mutating solution during sweep
**What went wrong:** The engine mutated `solution.ions` while checking rules in the same loop. A consumed ion was absent for a later check that needed it.  
**Fix:** Always work on a **cloned** working solution for the sweep. Apply all changes to the real vessel only after the full event array is assembled.

### BUG-03 — pH not recalculated after neutralisation
**What went wrong:** After adding alkali to acid, the `H+` ion count was reduced but `solution.pH` was never updated. The colour of universal indicator was then wrong.  
**Fix:** After applying ion changes, always call a `recalculatePH(solution)` helper that derives pH from `[H+]` and `[OH-]`. Simple approximation is fine for this level.

### BUG-04 — Redox colour change persisting after further reaction
**What went wrong:** When KMnO₄ was decolourised and then NaOH was added, the purple colour did not return even when it should have (no more reductant present, but the colour state was cached).  
**Fix:** Store solution colour as a **derived** property: compute it from current ion inventory on every render, not as a cached value that is set once. Use priority order: easter egg colour > ppt colour > ion colour > default.

### BUG-05 — Excess reagent complexation never triggered
**What went wrong:** The complexation rule for Cu(OH)₂ dissolving in excess NH₃ required an `excessNH3` flag that was never set because the engine had no concept of "excess".  
**Fix:** For complexation rules, "excess" means the ion is present AND the ppt that would dissolve is already in the ppt list. No need for a separate excess flag — just check both conditions simultaneously in `_checkComplexation`.

---

## 2. Gas System

### BUG-06 — Gas animation played once and never reflected disappearance
**What went wrong:** Bubbles were spawned once and ran on a CSS animation loop. They never stopped even after the gas had "left" the solution.  
**Fix:** Gas pressure in `solution.gases[]` must decay over real time. Use `requestAnimationFrame` loop in `AnimationManager` to call `solution.tickGasPressure(deltaSeconds)` and pass current `pressure` to the bubble animation driver. At pressure ≤ 0: stop spawning new bubbles, remove entry from `gases[]`.

### BUG-07 — Burning splint test had no gas → still showed positive
**What went wrong:** Gas test ran on a vessel that had already finished producing gas (pressure = 0) but since the gas ID was still in the array with 0 pressure, the test returned positive.  
**Fix:** `GasTestEngine.runTest()` must check `pressure > 0.05` (small threshold), not just `includes`. Zero-pressure gases should be pruned from the array by `tickGasPressure`.

### BUG-08 — Heating toggle did not increase gas rate; cooling did nothing
**What went wrong:** Heat toggle changed `vessel.isHot` but the bubble frequency animation was not connected to it. Cooling had no implementation.  
**Fix:**  
- `VesselUI` reads `vessel.isHot` and passes it to `AnimationManager.play('anim_bubbles', el, { pressure, isHot })`.  
- `isHot = true` → spawn rate multiplied (e.g. ×3). Not a different reaction product — just faster visual.  
- Cooling: `vessel.setHeat(false)`. If `isHot` transitions from `true` → `false`, trigger optional crystallisation check in `ReactionEngine`.  
- Both heat and cool buttons must be mutually exclusive toggled (one OFF when other is ON).

---

## 3. Drag and Drop

### BUG-09 — Drop zone detection failed at nested SVG boundaries
**What went wrong:** `dragover` events were captured by SVG child elements inside the vessel card, not the card itself. The `drop` event fired on the wrong element.  
**Fix:** Use **Pointer Events API** not HTML5 drag API. On `pointerup`, use `document.elementsFromPoint(x, y)` to find all elements under the pointer, then walk up to the first registered drop zone. This works through SVG, canvas, and any stacked elements.

### BUG-10 — Ghost element left on screen after failed drop
**What went wrong:** If a `pointerup` fired outside any drop zone, the ghost div was not removed.  
**Fix:** `DragDropManager` must always remove the ghost in `pointerup` handler unconditionally, regardless of whether a valid drop zone was found.

### BUG-11 — Vessel-to-vessel transfer looped (vessel dropped into itself)
**What went wrong:** The pointer hit-test found the source vessel as a valid drop zone and merged it with itself, producing infinite ions.  
**Fix:** In `DragDropManager`, ignore drop zones whose `data-vessel-id` matches `activeDrag.sourceVesselId`.

---

## 4. Vessel and Bench Management

### BUG-12 — Filter produced 2 new vessels but did not check the limit first
**What went wrong:** Filtering called `BenchUI.addVessel()` twice (filtrate + residue dish) without checking `vesselCount` beforehand. When the bench was at 5 the limit was exceeded.  
**Fix:** In `BenchUI.filterVessel()`: check `this.vesselCount + 1 >= 6` before executing (filter removes 1, adds 2, so net +1). If limit would be exceeded, show toast and abort. Do NOT remove the source vessel until both new ones are confirmed to fit.

### BUG-13 — Mixture counter never reset, grew monotonically
**What went wrong:** A global mixture counter was incremented on every combination. After removing vessels and creating new ones, the number jumped to e.g. "Mixture 14" confusingly.  
**Fix:** Counter is maintained in `BenchUI` and reflects only the current count of unnamed vessels on the bench (i.e. count vessels whose name starts with "Mixture"). When a vessel is removed, other mixtures do not renumber (avoid confusion mid-session); if all mixture vessels are washed the counter resets.

### BUG-14 — Evaporating dish accepted liquid drops (it shouldn't)
**What went wrong:** Filter residue vessels accepted further reagent drops, creating invalid states.  
**Fix:** Evaporating dish vessels have `type: 'evaporating_dish'`. DragDropManager/BenchUI should reject reagent drops onto type `evaporating_dish`.

---

## 5. Confirmatory Test Animations

### BUG-15 — Flame test showed the element name in the animation
**What went wrong:** The SVG flame animation had a text label showing "Sodium" that appeared during the animation.  
**Fix:** Flame animation SVG must show only the colour of the flame (yellow, lilac, brick red, blue-green). No text, no labels. The colour must be observable but ambiguous if multiple cations are present. Show primary cation colour only (highest concentration ion that has a flame colour).

### BUG-16 — Limewater test animation played even with no CO₂
**What went wrong:** The test tool was dragged without checking for CO₂ in gases. The limewater-turns-milky animation always played.  
**Fix:** `GasTestEngine.runTest()` must resolve to `negativeAnimId` when gas pressure is zero. `BenchUI` plays the correct resolved animation.

### BUG-17 — Multiple gas tests queued and played sequentially, overlapping prior test
**What went wrong:** Dragging the splint test three times in quick succession queued three animation callbacks that all played in sequence, breaking vessel state display.  
**Fix:** `AnimationManager` tracks an `activeTests` set per vessel. If a test animation is already running for a vessel, ignore the new drag or queue it. Use a simple boolean lock per vessel: `vesselLocks[vesselId] = true` while any test plays; release on animation end.

---

## 6. State Synchronisation

### BUG-18 — VesselUI rendered stale state after reaction
**What went wrong:** `BenchUI` applied reaction events to `vessel.solution` but `VesselUI` re-rendered lazily from a cached snapshot. The displayed colour/ppt was outdated.  
**Fix:** `BenchUI` must call `vesselUI.render()` **after** all events are applied and animations are triggered — not before, not during. `VesselUI.render()` always reads directly from `vessel.solution` (no cache).

### BUG-19 — ObservationLog appended duplicate entries on rapid drops
**What went wrong:** Multiple identical `ReactionEvent` objects caused duplicate observation rows.  
**Fix:** Each `ReactionEvent` is assigned a unique ID (`crypto.randomUUID()`). `ObservationLog.append()` deduplicates by event ID before inserting a DOM row.

---

## 7. Teacher / Supabase

### BUG-20 — Student lab loaded before session config was fetched
**What went wrong:** `student-main.js` began rendering the lab immediately on page load. When session config arrived, it tried to filter an already-rendered reagent list — partial re-render broke the DOM.  
**Fix:** `student-main.js` must show only a loading/join screen initially. Full lab instantiation happens **only after** `SessionManager.loadSession()` resolves and config is validated.

### BUG-21 — Session code collision not handled
**What went wrong:** Two teachers creating sessions simultaneously could get the same code (small alphabet, 4 chars).  
**Fix:** `SessionManager.createSession()` uses Supabase `UNIQUE` constraint on `session_code`. Wrap INSERT in a try/catch; on unique violation, regenerate code and retry (max 3 attempts). Log a warning if all fail.

### BUG-22 — Supabase anon key visible in source — design intent
**This is intentional and safe** — the anon key is a publishable client key by Supabase design. The RLS policies in `supabase_teacher_schema.sql` are the security boundary. Ensure all RLS policies are applied before going live:
- Teachers can only read/write their own sessions.
- Students can only write events/answers to sessions they joined.
- Students cannot read other students' answers.

---

## 8. General Code Quality

### TRAP-01 — ES module loading order
All `data/` files must be ready before any engine class method is called. Since ES modules are statically resolved, import order is predictable — but do not initialise `ReactionEngine` at module parse time if it depends on dynamic imports. Keep engine classes stateless (static methods only); data is imported at the top of the file.

### TRAP-02 — Pointer events on mobile/tablet
`pointerdown` / `pointermove` / `pointerup` work for mouse and touch. Do NOT also attach `touchstart`/`touchmove`/`touchend` — this causes double-firing. Call `event.preventDefault()` in `pointerdown` to prevent the browser generating synthetic mouse events.

### TRAP-03 — `crypto.randomUUID()` availability
Available in all evergreen browsers over HTTPS. If testing on `localhost` over HTTP, it may be unavailable in some environments. Fallback: `Date.now().toString(36) + Math.random().toString(36).slice(2)`.

### TRAP-04 — `docx` library bundle size
The CDN version of `docx.js` is large (~1 MB). Load it **lazily** inside `ObservationLog.exportDocx()` using a dynamic import, not a top-level script tag. This prevents it from blocking lab initialisation.

### TRAP-05 — Golden Rain animation performance
Animating many `<polygon>` SVG elements simultaneously can cause jank. Limit to ~40–60 flake elements. Use `will-change: transform` on each. Remove flake elements from DOM after animation ends (do not accumulate).

### TRAP-06 — Heating decomposition reactions
Heating a carbonate (e.g. CuCO₃) should produce CO₂ + an oxide. But this only makes chemical sense for a **solid** carbonate in a vessel being heated directly, not a carbonate in solution. Gate decomposition gas rules with `solution.isHot === true && solids.includes(carbonateId)`. Do not fire decomposition for aqueous carbonate ions on heating (thermally stable at lab scale).

### TRAP-07 — Cooling crystallisation trigger
Cooling must only trigger crystallisation if there is a supersaturated ppt candidate. Do not trigger it on heating→cooling of a plain salt solution — the visual is confusing and chemically unjustified at this level.

### TRAP-08 — Right panel starts closed — do not auto-open it
Previous builds helpfully auto-opened the right panel on first reaction. This reveals to the student that a reaction has occurred, which is a pedagogical breach. The panel opens **only** on explicit user click. No auto-open. No toast saying "Observation added!". Silence is the correct behaviour.

### TRAP-09 — Teacher config checkbox list must reflect `reagents.js` dynamically
Do not hardcode the checkbox list in `TeacherUI.html`. Generate it by iterating `REAGENTS` grouped by `category > subcategory`. This ensures new reagents added to the data file automatically appear in the teacher config — no UI code change needed.

### TRAP-10 — Do not use innerHTML with user-supplied text
Teacher instructions and question prompts are written by teachers and stored in Supabase. When rendering them, use `textContent` or a safe Markdown renderer (e.g. `marked.js` with default sanitizer enabled). Never use `innerHTML` with raw Supabase string values.
