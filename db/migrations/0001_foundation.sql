create extension if not exists pgcrypto;

create type program_status as enum ('CURRENT','PLANNED','COMPLETED','SUPERSEDED','PAUSED','ABANDONED');
create type set_type as enum ('WARMUP','WORKING','BACKOFF');

create table if not exists app_user (
  id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists program_version (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  program_id uuid not null,
  version int not null check (version > 0),
  status program_status not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, program_id, version)
);
create unique index if not exists ux_one_current_program_per_user on program_version(user_id) where status = 'CURRENT';

create table if not exists workout_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  program_version_id uuid references program_version(id),
  prescribed_snapshot jsonb not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists workout_set_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  session_id uuid not null references workout_session(id),
  exercise_id text not null,
  sequence int not null check (sequence > 0),
  load_kg numeric(7,2) not null check (load_kg >= 0),
  reps int not null check (reps > 0),
  rpe numeric(3,1) check (rpe between 1 and 10),
  set_type set_type not null,
  recorded_at timestamptz not null,
  unique(session_id, exercise_id, sequence)
);

create table if not exists symptom_observation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  session_id uuid not null references workout_session(id),
  exercise_id text,
  severity int not null check (severity between 0 and 10),
  location text,
  onset text,
  trigger text,
  recorded_at timestamptz not null
);

create table if not exists technique_observation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  session_id uuid not null references workout_session(id),
  exercise_id text,
  flag text not null check (flag in ('OK','CAUTION')),
  note text,
  recorded_at timestamptz not null
);

create table if not exists recommendation_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  recommendation_type text not null,
  rule_version text not null,
  input_snapshot jsonb not null,
  decision jsonb not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  performed_at timestamptz
);
