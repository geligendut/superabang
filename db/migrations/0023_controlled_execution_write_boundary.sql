-- Post-cutover stabilization: restore the controlled write boundary for execution
-- and recommendation evidence. The browser can read account-scoped rows, but all
-- writes must pass an RPC that validates auth.uid() and immutable identities.

alter function public.sync_workout_session(jsonb) security definer;
alter function public.sync_workout_session(jsonb) set search_path = public, pg_temp;

create or replace function public.create_nutrition_recommendation_snapshot(
  p_id uuid,
  p_rule_version text,
  p_input_snapshot jsonb,
  p_decision jsonb,
  p_evidence_refs jsonb,
  p_created_at timestamptz default now()
)
returns public.recommendation_snapshot
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.recommendation_snapshot%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_id is null then raise exception 'RECOMMENDATION_ID_REQUIRED'; end if;
  if coalesce(p_rule_version, '') = '' then raise exception 'RULE_VERSION_REQUIRED'; end if;

  insert into public.recommendation_snapshot(
    id,user_id,recommendation_type,rule_version,input_snapshot,decision,evidence_refs,
    created_at,accepted_at,performed_at
  ) values (
    p_id,v_user,'NUTRITION_CONTEXTUAL',p_rule_version,
    coalesce(p_input_snapshot,'{}'::jsonb),coalesce(p_decision,'{}'::jsonb),
    coalesce(p_evidence_refs,'[]'::jsonb),coalesce(p_created_at,now()),null,null
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke insert, update, delete, truncate on table public.workout_session from anon, authenticated;
revoke insert, update, delete, truncate on table public.workout_set_log from anon, authenticated;
revoke insert, update, delete, truncate on table public.symptom_observation from anon, authenticated;
revoke insert, update, delete, truncate on table public.technique_observation from anon, authenticated;
revoke insert, update, delete, truncate on table public.recommendation_snapshot from anon, authenticated;

grant select on table public.workout_session to authenticated;
grant select on table public.workout_set_log to authenticated;
grant select on table public.symptom_observation to authenticated;
grant select on table public.technique_observation to authenticated;
grant select on table public.recommendation_snapshot to authenticated;

revoke all on function public.sync_workout_session(jsonb) from public, anon;
grant execute on function public.sync_workout_session(jsonb) to authenticated;
revoke all on function public.create_nutrition_recommendation_snapshot(uuid,text,jsonb,jsonb,jsonb,timestamptz)
from public, anon;
grant execute on function public.create_nutrition_recommendation_snapshot(uuid,text,jsonb,jsonb,jsonb,timestamptz)
to authenticated;
