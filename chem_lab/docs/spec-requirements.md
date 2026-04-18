# ChemLab Virtual Lab — Requirements Specification
**Version:** 1.0  
**Date:** 2026-04-13  
**Curriculum scope:** Secondary / JC / High School inorganic chemistry only. No organic chemistry.

---

## 1. Project Overview

Two standalone HTML5 applications sharing the same chemistry engine and data layer:

| App | File | Purpose |
|-----|------|---------|
| Open Student Lab | `chem-lab.html` | Free exploration, no teacher session required |
| Teacher Dashboard | `chem-lab-teacher.html` | Create sessions, configure chemicals, set questions |
| Student Session Lab | `chem-lab-student.html` | Filtered lab loaded after joining a session code |

Backend: Supabase (PostgreSQL + Auth + RLS). Google Sheets sync is deferred to a later phase.

---

## 2. Chemistry Scope

### 2.1 Reagent List (editable, defined in `data/reagents.js`)

All entries are plain JS objects. New reagents can be added by editing the file — no engine changes required.

#### Liquids

**Acids**
| ID | Name | Key ions |
|----|------|---------|
| `hcl_dil` | Hydrochloric acid (dil.) | H⁺, Cl⁻ |
| `hcl_conc` | Hydrochloric acid (conc.) | H⁺, Cl⁻, dissolved HCl gas |
| `h2so4_dil` | Sulfuric acid (dil.) | H⁺, SO₄²⁻ |
| `h2so4_conc` | Sulfuric acid (conc.) | H⁺, SO₄²⁻ |
| `hno3_dil` | Nitric acid (dil.) | H⁺, NO₃⁻ |
| `hno3_conc` | Nitric acid (conc.) | H⁺, NO₃⁻ |
| `ch3cooh` | Ethanoic acid (dil.) | H⁺ (partial), CH₃COO⁻, CH₃COOH |

**Alkalis**
| ID | Name | Key ions |
|----|------|---------|
| `naoh` | Sodium hydroxide (aq) | Na⁺, OH⁻ |
| `koh` | Potassium hydroxide (aq) | K⁺, OH⁻ |
| `ca_oh2` | Calcium hydroxide (aq) | Ca²⁺, OH⁻ |
| `nh3_aq` | Ammonia solution | NH₄⁺ (partial), OH⁻, NH₃ |

**Aqueous Salts**
| ID | Name | Key ions |
|----|------|---------|
| `nacl_aq` | Sodium chloride (aq) | Na⁺, Cl⁻ |
| `na2so4_aq` | Sodium sulfate (aq) | Na⁺, SO₄²⁻ |
| `na2co3_aq` | Sodium carbonate (aq) | Na⁺, CO₃²⁻ |
| `na2s_aq` | Sodium sulfide (aq) | Na⁺, S²⁻ |
| `nai_aq` | Sodium iodide (aq) | Na⁺, I⁻ |
| `nabr_aq` | Sodium bromide (aq) | Na⁺, Br⁻ |
| `agno3_aq` | Silver nitrate (aq) | Ag⁺, NO₃⁻ |
| `bacl2_aq` | Barium chloride (aq) | Ba²⁺, Cl⁻ |
| `pb_no3_aq` | Lead(II) nitrate (aq) | Pb²⁺, NO₃⁻ |
| `cuso4_aq` | Copper(II) sulfate (aq) | Cu²⁺, SO₄²⁻ |
| `feso4_aq` | Iron(II) sulfate (aq) | Fe²⁺, SO₄²⁻ |
| `fecl3_aq` | Iron(III) chloride (aq) | Fe³⁺, Cl⁻ |
| `znso4_aq` | Zinc sulfate (aq) | Zn²⁺, SO₄²⁻ |
| `cacl2_aq` | Calcium chloride (aq) | Ca²⁺, Cl⁻ |
| `ki_aq` | Potassium iodide (aq) | K⁺, I⁻ |
| `k2cr2o7_aq` | Potassium dichromate (aq) | K⁺, Cr₂O₇²⁻ |

**Redox Reagents**
| ID | Name | Key ions |
|----|------|---------|
| `kmno4_aq` | Potassium permanganate (aq) | K⁺, MnO₄⁻ |
| `kmno4_acid` | Acidified KMnO₄ | K⁺, MnO₄⁻, H⁺ |
| `h2o2_aq` | Hydrogen peroxide (aq) | H₂O₂ (molecular) |

#### Solids

**Metals**
`mg_s`, `zn_s`, `fe_s`, `cu_s`, `al_s`

**Carbonates**
`na2co3_s`, `mgco3_s`, `caco3_s`, `znco3_s`, `cuco3_s`

**Oxides**
`cao_s`, `mgo_s`, `cuo_s`, `fe2o3_s`, `zno_s`

### 2.2 Reaction Classes

All defined in `data/reactions.js` (editable without touching engine logic).

1. **Acid + metal** → salt ions + H₂ gas (only metals above Cu in series)
2. **Acid + carbonate** → salt ions + H₂O + CO₂ gas
3. **Acid + metal oxide / hydroxide** → salt ions + H₂O (neutralisation)
4. **Acid + alkali** → salt ions + H₂O (neutralisation, pH change)
5. **Precipitation** — driven by an editable `PRECIPITATION_TABLE[cation][anion]` → ppt id, color, solubility note
6. **Redox** — MnO₄⁻ decolourised (purple → colourless), Cr₂O₇²⁻ (orange → green), Fe²⁺ → Fe³⁺
7. **Complexation** — NH₃ excess: Cu(OH)₂ dissolves → deep blue; Zn(OH)₂ dissolves; Al(OH)₃ dissolves in excess NaOH
8. **Easter egg overrides** — separate `data/easter-eggs.js`, each entry overrides a specific ion pair combination and specifies a custom animation ID

### 2.3 Key Special Reactions (Easter Egg layer)

All reactions below are in `easter-eggs.js`. Each has a `customAnimationId` pointing to a registered animation in `AnimationManager`.

| Name | Trigger | Visual |
|------|---------|--------|
| Golden Rain | Pb²⁺ + I⁻ (from KI) | PbI₂ crystallises slowly as golden flakes falling through solution |
| *(more can be added to file)* | | |

---

## 3. User Interface — Open Student Lab

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]   CONFIRMATORY TESTS BAR (top strip)               │
├──────────┬──────────────────────────────────┬───────────────┤
│          │                                  │               │
│ CHEMICAL │        BENCH (6 vessel slots)    │  RIGHT PANEL  │
│  STORE   │                                  │  (collapsed)  │
│ (left)   │                                  │               │
│          │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
```

### 3.2 Left Panel — Chemical Store

Nested hover-dropdown tree:

```
Liquids ▶
  Acids ▶
    Hydrochloric acid (dil.)
    Hydrochloric acid (conc.)
    ...
  Alkalis ▶
    ...
  Aqueous Salts ▶
    ...
  Redox Reagents ▶
    ...
Solids ▶
  Metals ▶
    ...
  Carbonates ▶
    ...
  Oxides ▶
    ...
```

- **Mouseover** on category opens submenu.
- **Mouseover** on subcategory opens chemical list.
- **Click** on a chemical initiates a drag ghost (shows a vial/beaker icon with name).
- **Drop onto empty bench slot** → places new vessel containing that reagent.
- **Drop onto existing vessel** → adds reagent to vessel. Vessel name becomes "Mixture 1" (auto-incrementing). Ion list is merged and `ReactionEngine.process()` is called immediately.

### 3.3 Top Bar — Confirmatory Tests

Draggable test tools. Each is a small icon with a label.

| Tool ID | Label | Detects |
|---------|-------|---------|
| `test_burning_splint` | Burning splint | H₂ gas (squeaky pop) |
| `test_glowing_splint` | Glowing splint | O₂ gas (relights) |
| `test_limewater` | Limewater tube | CO₂ gas (milky) |
| `test_damp_red_litmus` | Damp red litmus | NH₃ (turns blue) |
| `test_damp_blue_litmus` | Damp blue litmus | HCl, Cl₂, SO₂ (turns red) |
| `test_flame_na` | Flame test (wire) | Na⁺ (yellow), K⁺ (lilac), Ca²⁺ (brick red), Cu²⁺ (blue-green) — animation shows flame colour only, student identifies which cation |
| `test_bacl2` | BaCl₂ drops | SO₄²⁻ (white ppt) |
| `test_agno3` | AgNO₃ drops | Cl⁻ (white), Br⁻ (cream), I⁻ (yellow) |
| `test_universal_ind` | Universal indicator | pH → color band |
| `test_litmus` | Litmus paper | Acid/alkali qualitative |

Behaviour when dragged onto a vessel:
- Animation plays (see §3.6).
- **No label, no formula shown anywhere on screen.**
- An observation entry is appended to the Observation Log automatically (plain English).
- Gas tests can only usefully run if gas is currently present in the vessel's `gases[]` array.

### 3.4 The Bench

- **6 vessel slots** arranged in a row.
- Vessel types rendered automatically: beaker (liquids), test tube (small volumes), evaporating dish (filter residue).
- **Limit**: attempting to add a 7th vessel shows a non-blocking toast: *"Bench is full — wash (remove) a vessel first."*
- **Wash button**: small ✕ on each vessel. Clicking it asks "Remove this vessel?" confirmation → removes and frees slot.
- **Transfer**: drag one vessel and drop onto another → contents of dragged vessel pour into target (with pour animation), dragged vessel removed. ReactionEngine runs on merged solution.
- **Heat toggle**: flame icon on vessel footer. Click to toggle ON (vessel glows orange rim). Click again to toggle OFF (cool). Temperature affects: decomposition reactions (e.g. CuCO₃ → CuO + CO₂), rate of gas evolution shown as bubble frequency.
- **Cool toggle**: snowflake icon. Toggles off heat. Crystallisation animations can be triggered at cool state for oversaturation.
- Vessels cannot be dragged to re-order (simplification for v1).

### 3.5 Reaction Engine Behaviour

When `ReactionEngine.process(vessel, addedReagent)` is called:

1. Merge ions from `addedReagent` into vessel's `solution.ions`.
2. Run a **full sweep** — collect ALL triggered rule matches before modifying state:
   - Check precipitation table for every cation×anion pair.
   - Check gas evolution rules.
   - Check redox rules.
   - Check complexation rules.
   - Check easter egg overrides last (highest priority).
3. Apply all collected changes simultaneously to the Solution.
4. Return an array of `ReactionEvent` objects (used by BenchUI to trigger animations and by ObservationLog to append entries).
5. Two reactions from the same addition are **both** animated and **both** logged without one cancelling the other.

### 3.6 Animations

Managed by `AnimationManager` only. No animation logic anywhere else.

| Type | Description |
|------|-------------|
| `bubbles` | Rising circles from vessel base. Density proportional to gas pressure. Fades automatically over 15–20s as pressure drops in Solution state. |
| `precipitate` | Coloured particles coalesce from top and settle at vessel bottom. Color from `reactions.js` ppt entry. |
| `color_fade` | Smooth CSS transition on vessel liquid layer. From old color to new. |
| `pour` | Vessel tilts, liquid arc flows into target. |
| `gas_test_squeaky_pop` | Splint gif/SVG near vessel mouth, flash and sound cue (optional). |
| `gas_test_limewater` | Liquid in tube transitions from clear to milky white. |
| `gas_test_litmus` | Paper strip colour changes. |
| `flame_test` | Flame SVG at wire tip transitions through colour sequence. |
| `golden_rain` | Custom: golden flake particles crystallise and slowly descend. Particles are SVG `<polygon>` elements animated via GSAP or CSS keyframes. |
| `cool_crystallise` | Slow crystal growth at vessel bottom on cooling. |

### 3.7 Right Panel — Observations & Reactions

Default state: **collapsed**. Click chevron to open.

**Observations tab**
- Each entry is a collapsed row showing only a timestamp and a neutral label ("Event at 14:32").
- Student must **click the row to expand** and read the observation.
- Observation text: plain English only. Examples:
  - "A white precipitate formed immediately."
  - "Colourless gas evolved rapidly. Bubbling subsided after approximately 18 seconds."
  - "The solution became colourless."
  - "A dense golden-yellow crystalline precipitate formed slowly."
- No chemical name, no formula, no hint to identity. Ever.

**Reactions tab**
- Auto-populates the balanced ionic equation for each reaction event.
- Each entry is also collapsed by default — student toggles individually.
- Only appears after a reaction has occurred.

**Export button**
- "Download Lab Report (.docx)" — generates a `.docx` via `docx-export.js` (uses the `docx` npm library bundled, or the CDN version).
- Document includes: timestamp, all observations (fully expanded), all reaction equations, any downloaded test observations.

---

## 4. Teacher Module

### 4.1 Teacher Dashboard (`chem-lab-teacher.html`)

Requires Supabase Auth (email/password). No anonymous sessions for teachers.

**Workflow:**
1. Teacher signs in.
2. Clicks "New Session" → app generates `CHEM-XXXX` code (4-digit alphanumeric).
3. Teacher configures:
   - Session title
   - Instructions (Markdown textarea, rendered as preview)
   - Chemical selection (checkbox grid of full reagent list, grouped same as left panel)
   - Tool selection (checkbox list of confirmatory tests)
   - Questions (add/remove rows):
     - Short answer: prompt text
     - MCQ: prompt + up to 5 choices + correct answer (hidden from students)
4. Save session → persisted to `teacher_sessions` table as `config_json`.
5. Session goes live. Teacher shares the `CHEM-XXXX` code.

### 4.2 Student Join Flow (`chem-lab-student.html`)

1. Student enters `CHEM-XXXX` code + display name.
2. App queries Supabase for session config.
3. Lab loads with only the teacher-allowed reagents and tools visible.
4. Instructions text appears in a top dismissible banner.
5. Questions appear in the right panel below Observations (additional tab).
6. On submit: answers written to `student_answers` table.

### 4.3 Teacher Session View

- Teacher can open a session from their dashboard.
- See a list of joined students.
- Click a student → see a **snapshot** of their bench state (reconstructed from `student_events` log, not a live feed).
- Export all answers as CSV.

### 4.4 Supabase Tables (schema already in `supabase_teacher_schema.sql`)

- `teacher_sessions` — session config + code
- `student_participants` — joined students
- `student_events` — action log per student (reagent added, test run, etc.)
- `student_answers` — submitted question answers
- `sheet_sync_queue` — deferred; used when Google Sheets sync is added

---

## 5. Non-functional Requirements

| Requirement | Detail |
|-------------|--------|
| Platform | HTML5, runs entirely in browser, no server-side render |
| Module system | ES6 modules (`type="module"`), no global variables |
| Browser support | Evergreen (Chrome, Firefox, Edge, Safari latest) |
| Accessibility | Keyboard-accessible drag-drop alternative (click-to-select, click-bench-to-place) |
| Responsive | Desktop-first. Minimum viewport 1024px wide |
| Offline | Chemistry engine works offline. Supabase features degrade gracefully |
| Security | Supabase anon key in frontend is acceptable. No secret keys in frontend. Teacher auth via Supabase JWT |
| Data editability | All chemistry knowledge in `data/` files only — editable without touching engine classes |
