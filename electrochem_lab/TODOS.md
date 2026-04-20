# Electrochemistry Lab — Phase 7 & 8 TODO

## Phase 7 — Guided Activities

### Files to create
- `controller/ActivityConfig.js` — ActivityConfig class with locked component sets, questions, hints
- `activities/act_01_inert.js`   — Inert electrodes (C/Pt) in NaCl, H₂SO₄
- `activities/act_02_reactive.js` — Reactive anode (Cu) in CuSO₄
- `activities/act_03_conc.js`    — Concentration effect (dilute vs concentrated NaCl)
- `activities/act_04_eccell.js`  — EC Cell intro: Zn/Cu Daniell cell (A-Level)
- `activities/act_05_nernst.js`  — Nernst equation: EMF vs concentration (A-Level)

### Changes to existing files
- `ui/ElectrolytePanel.js` — honour `ActivityConfig.lockedElectrolyte` (disable card selection)
- `controller/SimController.js` — accept `ActivityConfig`, skip engine when locked conditions not met
- `js/main.js` — add activity loader (modal or landing section)
- `index.html` — add `#activity-modal` or `/activities` landing page link
- `electrochem.css` — activity modal, hint overlay, question card styles

### Behaviour
- When an activity is loaded, the component panel and electrolyte panel are locked to the activity's allowed set
- A question/hint overlay appears over the circuit area
- The student can reveal hints one at a time
- Completing the circuit unlocks the "Check" button which validates the setup

---

## Phase 8 — Teacher Dashboard

### Files to create
- `teacher/TeacherDashboard.js`   — renders the dashboard UI (curriculum selector, lock panel, Q&A editor)
- `teacher/ActivityEditor.js`     — GUI to create/edit ActivityConfig (JSON-based)
- `teacher/index.html`            — standalone teacher dashboard page

### Changes to existing files
- `index.html` — add `?teacher` URL param detection that shows teacher controls overlay
- `controller/ActivityConfig.js` (Phase 7) — add `toJSON()` / `fromJSON()` for export/import

### Features
- Curriculum selector: O-Level / A-Level toggle + enable EC Cell mode per-activity
- Component lock panel: checkboxes to allow/deny specific electrodes and electrolytes
- Question/hint editor: textarea per step with "Add hint" button
- Activity export: downloads `activity_<name>.json`
- Activity import: file input to load a JSON activity
- Supabase integration (deferred): class session key, real-time student progress view

### Notes
- Matches the teacher module pattern from `Chem_sim/chem-lab-teacher-module.md`
- Supabase schema already drafted in `Chem_sim/supabase_teacher_schema.sql`

---

*Added: Phase 5+6 session — Phases 7 and 8 deferred to future sprint.*
