# ChemLab Teacher Configurable Module (Separate Build)

## Goal
Build a separate teacher-facing version based on the current simulation.

- Teacher creates a session code.
- Teacher selects available chemicals/tools for the session.
- Teacher writes lab instructions and optional assessment questions.
- Students join by session code.
- Student observations and exports are logged.
- Session data is stored in Supabase (PostgreSQL).
- Optional Google Sheets sync for teacher reporting.

## Recommended File Split
- `Chem_sim/chem-lab-teacher.html`: teacher dashboard + student join flow.
- `Chem_sim/chem-lab-teacher.js`: Supabase queries, session state, role logic.
- `Chem_sim/chem-lab-teacher.css`: teacher UI styles.
- `Chem_sim/supabase_teacher_schema.sql`: database schema and RLS.

## Supabase Setup Steps
1. Create a Supabase project.
2. Run SQL from `supabase_teacher_schema.sql`.
3. Enable Email/Auth providers you need (or anonymous + session code only).
4. Add RLS policies exactly as defined in SQL.
5. In the teacher build, configure:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Session Lifecycle
1. Teacher signs in.
2. Teacher clicks "Create Session".
3. App generates a human-readable code (for example: `CHEM-4832`).
4. Teacher configures:
   - allowed reagents
   - allowed test tools
   - instructions markdown
   - optional rubric/questions
5. Session is persisted as JSON config.
6. Student enters session code and display name.
7. Student lab loads with filtered reagent/tool list.
8. Student observations/actions are written as event logs.
9. Teacher can view live feed and export CSV.

## Suggested Config JSON Shape
```json
{
  "title": "Acid-carbonate practical",
  "instructions": "Identify unknown anions and justify each test.",
  "allowedReagents": ["hcl_d", "na2co3", "agno3", "pb_no3", "nai", "nh3"],
  "allowedTools": ["gas_tests", "flame_tests", "indicators"],
  "questions": [
    {"id": "q1", "type": "short_text", "prompt": "Write the ionic equation for carbonate + acid."},
    {"id": "q2", "type": "mcq", "prompt": "Which test confirms CO2?", "choices": ["Burning splint", "Limewater", "Damp red litmus"], "answer": 1}
  ]
}
```

## Google Sheets Logging (Step-by-step)
Use a safe server-side bridge. Do not call Google APIs directly from browser with secret keys.

1. Create a Google Sheet with tabs:
   - `sessions`
   - `students`
   - `events`
   - `answers`
2. In Google Cloud:
   - Enable Google Sheets API.
   - Create Service Account.
   - Download service account JSON key.
3. Share the target Sheet with service account email (Editor).
4. Create a small webhook service (Cloud Run, Vercel function, or Supabase Edge Function) that:
   - verifies teacher JWT/session token
   - accepts batched logs
   - appends rows to Sheets
5. Add webhook URL to Supabase project secrets.
6. Trigger sync:
   - on each insert to `student_events` and `student_answers`, OR
   - via scheduled batch every 30 to 60 seconds.
7. Add retry/dead-letter strategy:
   - failed writes stored in `sheet_sync_queue`
   - automatic retries with exponential backoff
8. Add teacher button: "Sync now" + status indicator.

## Classroom Safety Controls
- Block hazardous combinations via config if needed.
- Limit unknown-mode reagents for exam scenarios.
- Freeze session after submission deadline.
- Mask gas labels until a valid test is run.

## Rollout Plan
1. Build database and session CRUD.
2. Build teacher config UI and code generator.
3. Build student join flow and filtered lab loader.
4. Add event logging and basic dashboard.
5. Add Google Sheets bridge and export tools.
6. Add analytics and rubric auto-mark support.
