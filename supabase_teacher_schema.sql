-- ChemLab Teacher Mode schema (Phase 1: config authoring only, no student data)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS teacher_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        UNIQUE NOT NULL,     -- human-readable code, e.g. "CHEM-4832"
  config      JSONB       NOT NULL,            -- full SessionConfig JSON
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_sessions_code ON teacher_sessions (code);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teacher_sessions_updated ON teacher_sessions;
CREATE TRIGGER trg_teacher_sessions_updated
  BEFORE UPDATE ON teacher_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: anyone can read (session code is the access control mechanism);
--      anyone can insert (anonymous teachers); no browser deletes
ALTER TABLE teacher_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "public read"   ON teacher_sessions FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public insert" ON teacher_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "public update" ON teacher_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "no delete"     ON teacher_sessions FOR DELETE USING (false);
