-- B13 execution-candidate staging.
-- This file reconstructs the live migration that was previously applied directly.
-- It is intentionally idempotent and never mutates program_version or workout history.

create table if not exists public.canonical_program_candidate (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_batch_id uuid not null references public.canonical_reconciliation_batch(id) on delete cascade,
  source_program_id text not null,
  source_program_name text not null,
  source_version text not null,
  source_revision text not null,
  candidate_status text not null default 'STAGED'
    check (candidate_status in ('STAGED','VERIFIED','APPROVED','ACTIVATED','CANCELLED')),
  activation_allowed boolean not null default false,
  source_prescription_rows jsonb not null,
  executable_prescription jsonb,
  unresolved_fields jsonb not null default '[]'::jsonb,
  safety_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_program_id, source_revision)
);

create table if not exists public.health_source_session_stage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_batch_id uuid not null references public.canonical_reconciliation_batch(id) on delete cascade,
  source_session_id text not null,
  source_session_date date not null,
  source_program_id text,
  source_revision text not null,
  stage_status text not null default 'STAGED'
    check (stage_status in ('STAGED','VERIFIED','IMPORTED','REJECTED')),
  raw_rows jsonb not null,
  normalized_preview jsonb not null default '{}'::jsonb,
  imported_session_id uuid references public.workout_session(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, source_session_id, source_revision)
);

create table if not exists public.canonical_safety_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_batch_id uuid not null references public.canonical_reconciliation_batch(id) on delete cascade,
  source_key text not null,
  source_revision text not null,
  status text not null default 'ACTIVE_BLOCK'
    check (status in ('ACTIVE_BLOCK','RESOLVED','SUPERSEDED')),
  exercise text,
  trigger_load_kg numeric,
  location text,
  recurrence boolean,
  source_decision text,
  evidence_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_key, source_revision)
);

alter table public.canonical_program_candidate enable row level security;
alter table public.health_source_session_stage enable row level security;
alter table public.canonical_safety_context enable row level security;

drop policy if exists canonical_program_candidate_self on public.canonical_program_candidate;
create policy canonical_program_candidate_self on public.canonical_program_candidate
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists health_source_session_stage_self on public.health_source_session_stage;
create policy health_source_session_stage_self on public.health_source_session_stage
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists canonical_safety_context_self on public.canonical_safety_context;
create policy canonical_safety_context_self on public.canonical_safety_context
for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.canonical_program_candidate from anon, authenticated;
revoke all on table public.health_source_session_stage from anon, authenticated;
revoke all on table public.canonical_safety_context from anon, authenticated;
grant select on table public.canonical_program_candidate to authenticated;
grant select on table public.health_source_session_stage to authenticated;
grant select on table public.canonical_safety_context to authenticated;

create or replace function public.stage_b13_execution_candidate_v1(
  p_batch_id uuid,
  p_source_revision text,
  p_program_rows jsonb,
  p_unresolved_fields jsonb,
  p_sessions jsonb,
  p_safety jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch public.canonical_reconciliation_batch%rowtype;
  v_session jsonb;
  v_candidate_id uuid;
  v_safety_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_batch
  from public.canonical_reconciliation_batch
  where id = p_batch_id and user_id = v_user
  for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_batch.status <> 'DRAFT' then raise exception 'BATCH_NOT_DRAFT'; end if;
  if coalesce(v_batch.source_revision,'') <> coalesce(p_source_revision,'') then
    raise exception 'SOURCE_REVISION_MISMATCH';
  end if;

  insert into public.canonical_program_candidate(
    user_id,reconciliation_batch_id,source_program_id,source_program_name,source_version,source_revision,
    candidate_status,activation_allowed,source_prescription_rows,executable_prescription,unresolved_fields,safety_snapshot
  ) values (
    v_user,p_batch_id,'HLT-PRG-0001','12-Week Recomp + SBD Base','v1.0',p_source_revision,
    'STAGED',false,p_program_rows,null,coalesce(p_unresolved_fields,'[]'::jsonb),coalesce(p_safety,'{}'::jsonb)
  )
  on conflict(user_id,source_program_id,source_revision) do update set
    reconciliation_batch_id=excluded.reconciliation_batch_id,
    source_prescription_rows=excluded.source_prescription_rows,
    unresolved_fields=excluded.unresolved_fields,
    safety_snapshot=excluded.safety_snapshot,
    updated_at=now(),
    candidate_status='STAGED',
    activation_allowed=false,
    executable_prescription=null
  returning id into v_candidate_id;

  for v_session in
    select * from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb))
  loop
    insert into public.health_source_session_stage(
      user_id,reconciliation_batch_id,source_session_id,source_session_date,source_program_id,
      source_revision,stage_status,raw_rows,normalized_preview
    ) values (
      v_user,p_batch_id,v_session->>'sourceSessionId',(v_session->>'sourceSessionDate')::date,
      nullif(v_session->>'sourceProgramId',''),p_source_revision,'STAGED',
      coalesce(v_session->'rawRows','[]'::jsonb),coalesce(v_session->'normalizedPreview','{}'::jsonb)
    )
    on conflict(user_id,source_session_id,source_revision) do update set
      reconciliation_batch_id=excluded.reconciliation_batch_id,
      raw_rows=excluded.raw_rows,
      normalized_preview=excluded.normalized_preview,
      stage_status='STAGED';
  end loop;

  insert into public.canonical_safety_context(
    user_id,reconciliation_batch_id,source_key,source_revision,status,exercise,trigger_load_kg,
    location,recurrence,source_decision,evidence_snapshot
  ) values (
    v_user,p_batch_id,'BENCH-55KG-20260906',p_source_revision,'ACTIVE_BLOCK',
    p_safety->>'exercise',nullif(p_safety->>'triggerLoadKg','')::numeric,
    p_safety->>'location',coalesce((p_safety->>'recurrence')::boolean,false),
    p_safety->>'sourceDecision',p_safety
  )
  on conflict(user_id,source_key,source_revision) do update set
    reconciliation_batch_id=excluded.reconciliation_batch_id,
    status='ACTIVE_BLOCK',
    exercise=excluded.exercise,
    trigger_load_kg=excluded.trigger_load_kg,
    location=excluded.location,
    recurrence=excluded.recurrence,
    source_decision=excluded.source_decision,
    evidence_snapshot=excluded.evidence_snapshot
  returning id into v_safety_id;

  return jsonb_build_object(
    'candidateId',v_candidate_id,
    'safetyContextId',v_safety_id,
    'activationAllowed',false,
    'candidateStatus','STAGED'
  );
end;
$$;

revoke all on function public.stage_b13_execution_candidate_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)
from public, anon;
grant execute on function public.stage_b13_execution_candidate_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)
to authenticated;
