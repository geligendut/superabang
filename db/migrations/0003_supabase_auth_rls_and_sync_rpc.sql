-- B4 operational backend choice for dogfood: Supabase Auth + Postgres/RLS.
-- This migration is provider-specific and should be applied only to the dogfood Supabase project.

-- Bind application profile identity to Supabase Auth.
alter table app_user
  drop constraint if exists app_user_auth_user_fk;

alter table app_user
  add constraint app_user_auth_user_fk
  foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_user(id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

 drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Backfill profiles for auth users created before this migration.
insert into public.app_user(id)
select id from auth.users
on conflict (id) do nothing;

alter table app_user enable row level security;
alter table program_version enable row level security;
alter table workout_session enable row level security;
alter table workout_set_log enable row level security;
alter table symptom_observation enable row level security;
alter table technique_observation enable row level security;
alter table recommendation_snapshot enable row level security;

-- Explicit user-scoped policies. Re-running the migration is safe.
drop policy if exists app_user_self on app_user;
create policy app_user_self on app_user
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists program_version_self on program_version;
create policy program_version_self on program_version
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists workout_session_self on workout_session;
create policy workout_session_self on workout_session
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists workout_set_log_self on workout_set_log;
create policy workout_set_log_self on workout_set_log
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists symptom_observation_self on symptom_observation;
create policy symptom_observation_self on symptom_observation
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists technique_observation_self on technique_observation;
create policy technique_observation_self on technique_observation
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists recommendation_snapshot_self on recommendation_snapshot;
create policy recommendation_snapshot_self on recommendation_snapshot
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One authenticated RPC writes a completed local workout snapshot atomically.
-- auth.uid() is the only accepted server identity; client-supplied user IDs are ignored.
create or replace function public.sync_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_recommendation jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_session_id := (p_payload->>'sessionId')::uuid;
  if v_session_id is null then
    raise exception 'SESSION_ID_REQUIRED';
  end if;

  insert into workout_session(
    id, user_id, prescribed_snapshot, started_at, completed_at,
    completion_status, created_at, updated_at
  ) values (
    v_session_id,
    v_user_id,
    p_payload->'prescribedSnapshot',
    (p_payload->>'startedAt')::timestamptz,
    nullif(p_payload->>'completedAt','')::timestamptz,
    nullif(p_payload->>'completionStatus',''),
    (p_payload->>'startedAt')::timestamptz,
    coalesce(nullif(p_payload->>'updatedAt','')::timestamptz, now())
  )
  on conflict (id) do update set
    prescribed_snapshot = excluded.prescribed_snapshot,
    completed_at = excluded.completed_at,
    completion_status = excluded.completion_status,
    updated_at = excluded.updated_at
  where workout_session.user_id = v_user_id;

  insert into workout_set_log(id, user_id, session_id, exercise_id, sequence, load_kg, reps, rpe, set_type, recorded_at)
  select
    (x->>'id')::uuid,
    v_user_id,
    v_session_id,
    x->>'exerciseId',
    (x->>'sequence')::int,
    (x->>'loadKg')::numeric,
    (x->>'reps')::int,
    nullif(x->>'rpe','')::numeric,
    (x->>'setType')::set_type,
    (x->>'recordedAt')::timestamptz
  from jsonb_array_elements(coalesce(p_payload->'sets','[]'::jsonb)) x
  on conflict (id) do update set
    load_kg = excluded.load_kg,
    reps = excluded.reps,
    rpe = excluded.rpe,
    recorded_at = excluded.recorded_at
  where workout_set_log.user_id = v_user_id;

  insert into symptom_observation(id, user_id, session_id, exercise_id, severity, location, onset, trigger, recorded_at)
  select
    (x->>'id')::uuid,
    v_user_id,
    v_session_id,
    nullif(x->>'exerciseId',''),
    (x->>'severity')::int,
    nullif(x->>'location',''),
    nullif(x->>'onset',''),
    nullif(x->>'trigger',''),
    (x->>'recordedAt')::timestamptz
  from jsonb_array_elements(coalesce(p_payload->'symptoms','[]'::jsonb)) x
  on conflict (id) do update set
    severity = excluded.severity,
    location = excluded.location,
    onset = excluded.onset,
    trigger = excluded.trigger,
    recorded_at = excluded.recorded_at
  where symptom_observation.user_id = v_user_id;

  insert into technique_observation(id, user_id, session_id, exercise_id, flag, note, recorded_at)
  select
    (x->>'id')::uuid,
    v_user_id,
    v_session_id,
    nullif(x->>'exerciseId',''),
    x->>'flag',
    nullif(x->>'note',''),
    (x->>'recordedAt')::timestamptz
  from jsonb_array_elements(coalesce(p_payload->'techniques','[]'::jsonb)) x
  on conflict (id) do update set
    flag = excluded.flag,
    note = excluded.note,
    recorded_at = excluded.recorded_at
  where technique_observation.user_id = v_user_id;

  v_recommendation := p_payload->'recommendation';
  if v_recommendation is not null and jsonb_typeof(v_recommendation) = 'object' then
    insert into recommendation_snapshot(
      id, user_id, session_id, recommendation_type, rule_version,
      input_snapshot, decision, evidence_refs, created_at, accepted_at, performed_at
    ) values (
      (v_recommendation->>'id')::uuid,
      v_user_id,
      v_session_id,
      'NEXT_EXPOSURE',
      v_recommendation->>'ruleVersion',
      coalesce(v_recommendation->'inputSnapshot','{}'::jsonb),
      coalesce(v_recommendation->'decision','{}'::jsonb),
      coalesce(v_recommendation->'evidenceRefs','[]'::jsonb),
      (v_recommendation->>'createdAt')::timestamptz,
      nullif(v_recommendation->>'acceptedAt','')::timestamptz,
      nullif(v_recommendation->>'performedAt','')::timestamptz
    )
    on conflict (id) do update set
      input_snapshot = excluded.input_snapshot,
      decision = excluded.decision,
      evidence_refs = excluded.evidence_refs,
      accepted_at = excluded.accepted_at,
      performed_at = excluded.performed_at
    where recommendation_snapshot.user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'userId', v_user_id,
    'syncedAt', now()
  );
end;
$$;

revoke all on function public.sync_workout_session(jsonb) from public;
grant execute on function public.sync_workout_session(jsonb) to authenticated;
