-- B11 Program Change & Version Activation
-- Adds a versioned prescription payload plus controlled proposal/activation RPCs.
-- Existing Health workflow remains authoritative; this supports app dogfood only.

alter table public.program_version
  add column if not exists prescription_snapshot jsonb,
  add column if not exists based_on_version_id uuid references public.program_version(id),
  add column if not exists source_session_id uuid references public.workout_session(id),
  add column if not exists source_recommendation_id uuid references public.recommendation_snapshot(id),
  add column if not exists change_summary jsonb not null default '[]'::jsonb;

create index if not exists ix_program_version_user_status
  on public.program_version(user_id, status, effective_from desc);

-- Current/Planned versions used by B11 must carry a prescription snapshot.
-- Historical rows from before B11 are allowed to remain null.
alter table public.program_version
  drop constraint if exists ck_program_version_snapshot_for_effective_states;
alter table public.program_version
  add constraint ck_program_version_snapshot_for_effective_states
  check (
    status not in ('CURRENT','PLANNED')
    or prescription_snapshot is not null
  ) not valid;

-- Direct mutation of version lifecycle is intentionally removed from the browser.
revoke all on table public.program_version from anon;
revoke all on table public.program_version from authenticated;
grant select on table public.program_version to authenticated;

create or replace function public.bootstrap_current_program(
  p_program_id uuid,
  p_prescription_snapshot jsonb
)
returns public.program_version
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.program_version;
  v_id uuid := gen_random_uuid();
  v_snapshot jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_program_id is null then raise exception 'PROGRAM_ID_REQUIRED'; end if;
  if p_prescription_snapshot is null or jsonb_typeof(p_prescription_snapshot) <> 'object' then
    raise exception 'PRESCRIPTION_SNAPSHOT_REQUIRED';
  end if;
  if exists(select 1 from public.program_version where user_id=v_user_id and status='CURRENT') then
    raise exception 'CURRENT_PROGRAM_ALREADY_EXISTS';
  end if;

  v_snapshot := jsonb_set(
    p_prescription_snapshot,
    '{programVersionRef}',
    to_jsonb(v_id::text),
    true
  );

  insert into public.program_version(
    id,user_id,program_id,version,status,effective_from,prescription_snapshot,change_summary
  ) values (
    v_id,v_user_id,p_program_id,1,'CURRENT',now(),v_snapshot,
    jsonb_build_array(jsonb_build_object(
      'kind','BOOTSTRAP',
      'note','Initialized from current dogfood prescription; not canonical Health cutover.'
    ))
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_program_change_proposal(
  p_current_version_id uuid,
  p_prescription_snapshot jsonb,
  p_source_session_id uuid,
  p_source_assessment jsonb,
  p_evidence_refs jsonb default '[]'::jsonb
)
returns public.program_version
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.program_version;
  v_row public.program_version;
  v_new_id uuid := gen_random_uuid();
  v_recommendation_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_rule_version text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_prescription_snapshot is null or jsonb_typeof(p_prescription_snapshot) <> 'object' then
    raise exception 'PRESCRIPTION_SNAPSHOT_REQUIRED';
  end if;

  select * into v_current
  from public.program_version
  where id=p_current_version_id and user_id=v_user_id and status='CURRENT'
  for update;
  if not found then raise exception 'CURRENT_PROGRAM_NOT_FOUND_OR_STALE'; end if;

  if p_source_session_id is not null and not exists(
    select 1 from public.workout_session
    where id=p_source_session_id and user_id=v_user_id and completed_at is not null
  ) then
    raise exception 'SOURCE_SESSION_NOT_FOUND_OR_NOT_COMPLETED';
  end if;

  if exists(
    select 1 from public.program_version
    where user_id=v_user_id and program_id=v_current.program_id and status='PLANNED'
  ) then
    raise exception 'PLANNED_PROGRAM_ALREADY_EXISTS';
  end if;

  v_snapshot := jsonb_set(
    p_prescription_snapshot,
    '{programVersionRef}',
    to_jsonb(v_new_id::text),
    true
  );
  v_rule_version := coalesce(p_source_assessment->>'ruleVersion','B11_UNSPECIFIED');

  insert into public.recommendation_snapshot(
    id,user_id,session_id,recommendation_type,rule_version,
    input_snapshot,decision,evidence_refs,created_at
  ) values (
    v_recommendation_id,v_user_id,p_source_session_id,'PROGRAM_CHANGE',
    v_rule_version,
    jsonb_build_object(
      'basedOnVersionId',v_current.id,
      'sourceAssessment',coalesce(p_source_assessment,'{}'::jsonb)
    ),
    jsonb_build_object(
      'status','PROPOSED',
      'proposalVersionId',v_new_id,
      'version',v_current.version+1
    ),
    coalesce(p_evidence_refs,'[]'::jsonb),
    now()
  );

  insert into public.program_version(
    id,user_id,program_id,version,status,effective_from,
    prescription_snapshot,based_on_version_id,source_session_id,
    source_recommendation_id,change_summary
  ) values (
    v_new_id,v_user_id,v_current.program_id,v_current.version+1,'PLANNED',now(),
    v_snapshot,v_current.id,p_source_session_id,v_recommendation_id,
    coalesce(p_source_assessment->'changes','[]'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.activate_program_version(
  p_proposal_id uuid
)
returns public.program_version
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.program_version;
  v_current public.program_version;
  v_row public.program_version;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_proposal
  from public.program_version
  where id=p_proposal_id and user_id=v_user_id and status='PLANNED'
  for update;
  if not found then raise exception 'PLANNED_PROGRAM_NOT_FOUND'; end if;

  select * into v_current
  from public.program_version
  where user_id=v_user_id and status='CURRENT'
  for update;
  if not found then raise exception 'CURRENT_PROGRAM_NOT_FOUND'; end if;

  if v_proposal.based_on_version_id is distinct from v_current.id then
    raise exception 'STALE_PROGRAM_PROPOSAL';
  end if;
  if v_proposal.program_id <> v_current.program_id then
    raise exception 'PROGRAM_ID_MISMATCH';
  end if;

  update public.program_version
  set status='SUPERSEDED', effective_to=v_now
  where id=v_current.id and user_id=v_user_id;

  update public.program_version
  set status='CURRENT', effective_from=v_now, effective_to=null
  where id=v_proposal.id and user_id=v_user_id
  returning * into v_row;

  if v_proposal.source_recommendation_id is not null then
    update public.recommendation_snapshot
    set accepted_at=coalesce(accepted_at,v_now),
        performed_at=coalesce(performed_at,v_now),
        decision = decision || jsonb_build_object('status','ACTIVATED','activatedAt',v_now)
    where id=v_proposal.source_recommendation_id and user_id=v_user_id;
  end if;

  return v_row;
end;
$$;

revoke all on function public.bootstrap_current_program(uuid,jsonb) from public, anon;
revoke all on function public.create_program_change_proposal(uuid,jsonb,uuid,jsonb,jsonb) from public, anon;
revoke all on function public.activate_program_version(uuid) from public, anon;

grant execute on function public.bootstrap_current_program(uuid,jsonb) to authenticated;
grant execute on function public.create_program_change_proposal(uuid,jsonb,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.activate_program_version(uuid) to authenticated;
