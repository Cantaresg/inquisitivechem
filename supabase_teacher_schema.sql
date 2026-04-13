-- ChemLab teacher module schema
-- Run in Supabase SQL editor

create table if not exists teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text unique not null,
  teacher_user_id uuid not null,
  title text not null default 'ChemLab Session',
  instructions text,
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists student_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references teacher_sessions(id) on delete cascade,
  student_name text not null,
  student_identifier text,
  joined_at timestamptz not null default now(),
  unique(session_id, student_name)
);

create table if not exists student_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references teacher_sessions(id) on delete cascade,
  participant_id uuid not null references student_participants(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists student_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references teacher_sessions(id) on delete cascade,
  participant_id uuid not null references student_participants(id) on delete cascade,
  question_id text not null,
  answer_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists sheet_sync_queue (
  id bigint generated always as identity primary key,
  target text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_teacher_sessions_code on teacher_sessions(session_code);
create index if not exists idx_student_events_session_time on student_events(session_id, created_at desc);
create index if not exists idx_student_answers_session_time on student_answers(session_id, created_at desc);

-- Optional updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_teacher_sessions_updated on teacher_sessions;
create trigger trg_teacher_sessions_updated
before update on teacher_sessions
for each row execute function set_updated_at();

drop trigger if exists trg_sheet_sync_updated on sheet_sync_queue;
create trigger trg_sheet_sync_updated
before update on sheet_sync_queue
for each row execute function set_updated_at();

-- RLS
alter table teacher_sessions enable row level security;
alter table student_participants enable row level security;
alter table student_events enable row level security;
alter table student_answers enable row level security;

-- Teacher can manage own sessions
create policy if not exists teacher_sessions_owner_all on teacher_sessions
for all
using (auth.uid() = teacher_user_id)
with check (auth.uid() = teacher_user_id);

-- Participants readable by owning teacher
create policy if not exists participants_read_teacher on student_participants
for select
using (
  exists (
    select 1 from teacher_sessions s
    where s.id = student_participants.session_id
      and s.teacher_user_id = auth.uid()
  )
);

-- Student join is typically handled through RPC or server function.
-- Direct insert policy can be tightened by session code checks in RPC.

-- Events readable by owning teacher
create policy if not exists events_read_teacher on student_events
for select
using (
  exists (
    select 1 from teacher_sessions s
    where s.id = student_events.session_id
      and s.teacher_user_id = auth.uid()
  )
);

-- Answers readable by owning teacher
create policy if not exists answers_read_teacher on student_answers
for select
using (
  exists (
    select 1 from teacher_sessions s
    where s.id = student_answers.session_id
      and s.teacher_user_id = auth.uid()
  )
);

-- Insert/update for student events/answers should be through RPC or Edge Function
-- that validates session code + participant.
