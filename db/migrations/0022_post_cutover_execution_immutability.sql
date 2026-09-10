-- Post-cutover stabilization: preserve workout execution as append-only evidence.
-- Existing rows are not rewritten. A session may transition exactly once from
-- active to completed/stopped; completed sessions and child evidence are immutable.

create or replace function public.guard_workout_session_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'WORKOUT_SESSION_DELETE_FORBIDDEN';
  end if;

  if old.completed_at is not null then
    if new is distinct from old then
      raise exception 'COMPLETED_WORKOUT_SESSION_IMMUTABLE';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.program_version_id is distinct from old.program_version_id
     or new.prescribed_snapshot is distinct from old.prescribed_snapshot
     or new.started_at is distinct from old.started_at
     or new.created_at is distinct from old.created_at then
    raise exception 'WORKOUT_SESSION_EXECUTION_SNAPSHOT_IMMUTABLE';
  end if;

  if new.completed_at is null
     or new.completion_status not in ('COMPLETED', 'STOPPED_FOR_SAFETY') then
    raise exception 'WORKOUT_SESSION_ONLY_COMPLETION_TRANSITION_ALLOWED';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_workout_session_immutability on public.workout_session;
create trigger guard_workout_session_immutability
before update or delete on public.workout_session
for each row execute function public.guard_workout_session_immutability();

create or replace function public.guard_workout_execution_child_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'WORKOUT_EXECUTION_EVIDENCE_APPEND_ONLY';
end;
$$;

drop trigger if exists guard_workout_set_log_append_only on public.workout_set_log;
create trigger guard_workout_set_log_append_only
before update or delete on public.workout_set_log
for each row execute function public.guard_workout_execution_child_append_only();

drop trigger if exists guard_symptom_observation_append_only on public.symptom_observation;
create trigger guard_symptom_observation_append_only
before update or delete on public.symptom_observation
for each row execute function public.guard_workout_execution_child_append_only();

drop trigger if exists guard_technique_observation_append_only on public.technique_observation;
create trigger guard_technique_observation_append_only
before update or delete on public.technique_observation
for each row execute function public.guard_workout_execution_child_append_only();

revoke delete, truncate on table public.workout_session from anon, authenticated;
revoke update, delete, truncate on table public.workout_set_log from anon, authenticated;
revoke update, delete, truncate on table public.symptom_observation from anon, authenticated;
revoke update, delete, truncate on table public.technique_observation from anon, authenticated;

revoke all on function public.guard_workout_session_immutability() from public, anon, authenticated;
revoke all on function public.guard_workout_execution_child_append_only() from public, anon, authenticated;
