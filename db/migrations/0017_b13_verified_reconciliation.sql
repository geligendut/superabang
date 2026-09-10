-- B13 verified reconciliation and persistent safety enforcement.
-- No canonical activation, source-of-truth change, or historical import occurs here.

alter table public.canonical_reconciliation_batch
  add column if not exists technical_status text not null default 'PENDING',
  add column if not exists source_digest text,
  add column if not exists technically_verified_at timestamptz;

alter table public.canonical_reconciliation_batch
  drop constraint if exists canonical_reconciliation_batch_technical_status_check;
alter table public.canonical_reconciliation_batch
  add constraint canonical_reconciliation_batch_technical_status_check
  check (technical_status in ('PENDING','READY','BLOCKED'));

alter table public.canonical_reconciliation_item
  add column if not exists technical_status text not null default 'PENDING',
  add column if not exists source_digest text;

alter table public.canonical_reconciliation_item
  drop constraint if exists canonical_reconciliation_item_technical_status_check;
alter table public.canonical_reconciliation_item
  add constraint canonical_reconciliation_item_technical_status_check
  check (technical_status in ('PENDING','VERIFIED','BLOCKED'));

alter table public.canonical_program_candidate
  add column if not exists source_digest text,
  add column if not exists verified_at timestamptz;

alter table public.health_source_session_stage
  add column if not exists source_range text,
  add column if not exists source_digest text,
  add column if not exists verified_at timestamptz;

alter table public.canonical_safety_context
  add column if not exists source_digest text,
  add column if not exists verified_at timestamptz;

create table if not exists public.health_source_nutrition_stage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_batch_id uuid not null references public.canonical_reconciliation_batch(id) on delete cascade,
  source_record_id text not null,
  source_row_number integer not null check (source_row_number > 1),
  source_date date not null,
  source_revision text not null,
  coverage_scope text not null check (coverage_scope in ('SELECTIVE_SAMPLE','UNKNOWN')),
  nutrition_basis text not null check (nutrition_basis in ('ESTIMATED','UNKNOWN')),
  source_type text not null,
  confidence text check (confidence in ('LOW','MEDIUM','HIGH')),
  estimated_calories numeric,
  estimated_protein_g numeric,
  estimated_carbs_g numeric,
  estimated_fat_g numeric,
  raw_row jsonb not null,
  source_digest text not null,
  stage_status text not null default 'STAGED'
    check (stage_status in ('STAGED','VERIFIED','IMPORTED','REJECTED')),
  imported_meal_id uuid references public.nutrition_meal(id) on delete set null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (user_id, source_record_id, source_revision)
);

alter table public.health_source_nutrition_stage enable row level security;
drop policy if exists health_source_nutrition_stage_self on public.health_source_nutrition_stage;
create policy health_source_nutrition_stage_self on public.health_source_nutrition_stage
for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.canonical_program_candidate from anon, authenticated;
revoke all on table public.health_source_session_stage from anon, authenticated;
revoke all on table public.canonical_safety_context from anon, authenticated;
revoke all on table public.health_source_nutrition_stage from anon, authenticated;
grant select on table public.canonical_program_candidate to authenticated;
grant select on table public.health_source_session_stage to authenticated;
grant select on table public.canonical_safety_context to authenticated;
grant select on table public.health_source_nutrition_stage to authenticated;

create index if not exists ix_canonical_program_candidate_batch
  on public.canonical_program_candidate(reconciliation_batch_id);
create index if not exists ix_health_source_session_stage_batch
  on public.health_source_session_stage(reconciliation_batch_id);
create index if not exists ix_health_source_session_stage_imported
  on public.health_source_session_stage(imported_session_id) where imported_session_id is not null;
create index if not exists ix_canonical_safety_context_batch
  on public.canonical_safety_context(reconciliation_batch_id);
create index if not exists ix_health_source_nutrition_stage_batch
  on public.health_source_nutrition_stage(reconciliation_batch_id);
create index if not exists ix_health_source_nutrition_stage_imported
  on public.health_source_nutrition_stage(imported_meal_id) where imported_meal_id is not null;

create or replace function public.b13_cutover_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch public.canonical_reconciliation_batch%rowtype;
  v_candidate_count integer := 0;
  v_program_rows integer := 0;
  v_session_count integer := 0;
  v_training_rows integer := 0;
  v_nutrition_rows integer := 0;
  v_safety_count integer := 0;
  v_current_count integer := 0;
  v_imported_source_sessions integer := 0;
  v_imported_source_meals integer := 0;
  v_body_match boolean := false;
  v_nutrition_semantics boolean := false;
  v_ready boolean := false;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_batch
  from public.canonical_reconciliation_batch
  where user_id=v_user and source_system='HEALTH_MASTER_RECORD'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'technicalStatus','NOT_STAGED',
      'cutoverApproved',false,
      'canonicalCutoverPerformed',false
    );
  end if;

  select count(*),coalesce(max(jsonb_array_length(source_prescription_rows)),0)
    into v_candidate_count,v_program_rows
  from public.canonical_program_candidate
  where user_id=v_user
    and reconciliation_batch_id=v_batch.id
    and candidate_status='VERIFIED'
    and activation_allowed=false
    and executable_prescription is not null
    and source_digest is not null;

  select count(*),coalesce(sum(jsonb_array_length(raw_rows)),0),
         count(*) filter (where imported_session_id is not null)
    into v_session_count,v_training_rows,v_imported_source_sessions
  from public.health_source_session_stage
  where user_id=v_user
    and reconciliation_batch_id=v_batch.id
    and stage_status='VERIFIED'
    and source_digest is not null;

  select count(*),
         count(*) filter (where imported_meal_id is not null),
         coalesce(bool_and(
           coverage_scope='SELECTIVE_SAMPLE'
           and nutrition_basis='ESTIMATED'
           and confidence in ('LOW','MEDIUM','HIGH')
           and raw_row is not null
         ),false)
    into v_nutrition_rows,v_imported_source_meals,v_nutrition_semantics
  from public.health_source_nutrition_stage
  where user_id=v_user
    and reconciliation_batch_id=v_batch.id
    and stage_status='VERIFIED';

  select count(*) into v_safety_count
  from public.canonical_safety_context
  where user_id=v_user
    and reconciliation_batch_id=v_batch.id
    and status='ACTIVE_BLOCK'
    and trigger_load_kg=55
    and recurrence=true
    and location='upper-left trapezius / superior scapular area'
    and verified_at is not null
    and source_digest is not null
    and not (evidence_snapshot ? 'diagnosis');

  select count(*) into v_current_count
  from public.program_version
  where user_id=v_user and status='CURRENT';

  select exists(
    select 1
    from public.body_measurement m
    join public.canonical_reconciliation_item i
      on i.user_id=m.user_id
     and i.batch_id=v_batch.id
     and i.domain='BODY'
     and i.technical_status='VERIFIED'
    where m.user_id=v_user
      and m.id=(select id from public.body_measurement where user_id=v_user order by measured_at desc limit 1)
      and m.weight_kg=(i.target_snapshot->>'weightKg')::numeric
      and m.waist_cm=(i.target_snapshot->>'waistCm')::numeric
  ) into v_body_match;

  v_ready :=
    v_batch.technical_status='READY'
    and v_batch.source_digest is not null
    and v_batch.technically_verified_at is not null
    and v_batch.status='DRAFT'
    and v_candidate_count=1
    and v_program_rows=17
    and v_session_count=4
    and v_training_rows=72
    and v_nutrition_rows=32
    and v_safety_count=1
    and v_current_count=1
    and v_imported_source_sessions=0
    and v_imported_source_meals=0
    and v_body_match
    and v_nutrition_semantics;

  return jsonb_build_object(
    'technicalStatus',case when v_ready then 'CUTOVER_READY_AWAITING_APPROVAL' else 'BLOCKED' end,
    'cutoverApproved',false,
    'canonicalCutoverPerformed',false,
    'sourceOfTruth','HEALTH_MASTER_RECORD',
    'batchId',v_batch.id,
    'sourceRevision',v_batch.source_revision,
    'checks',jsonb_build_object(
      'oneCurrentDogfoodProgram',v_current_count=1,
      'nonActiveVerifiedCandidate',v_candidate_count=1,
      'canonicalProgramRows',v_program_rows,
      'verifiedSourceSessions',v_session_count,
      'verifiedTrainingRows',v_training_rows,
      'verifiedNutritionRows',v_nutrition_rows,
      'nutritionSemanticsPreserved',v_nutrition_semantics,
      'activeBenchSafetyBlock',v_safety_count=1,
      'latestAppBodyMeasurementPreserved',v_body_match,
      'historicalSourceNotImported',v_imported_source_sessions=0 and v_imported_source_meals=0
    )
  );
end;
$$;

revoke all on function public.b13_cutover_readiness_v1() from public, anon;
grant execute on function public.b13_cutover_readiness_v1() to authenticated;

-- Persistent source safety blocks override a session-derived bench progression proposal.
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

  if exists(
    select 1
    from public.canonical_safety_context s
    where s.user_id=v_user_id
      and s.status='ACTIVE_BLOCK'
      and s.source_key='BENCH-55KG-20260906'
      and exists(
        select 1 from jsonb_array_elements(coalesce(p_source_assessment->'changes','[]'::jsonb)) c
        where c->>'exerciseId'='bench-press'
      )
  ) then
    raise exception 'CANONICAL_SAFETY_BLOCK_ACTIVE';
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

  v_snapshot := jsonb_set(p_prescription_snapshot,'{programVersionRef}',to_jsonb(v_new_id::text),true);
  v_rule_version := coalesce(p_source_assessment->>'ruleVersion','B11_UNSPECIFIED');

  insert into public.recommendation_snapshot(
    id,user_id,session_id,recommendation_type,rule_version,input_snapshot,decision,evidence_refs,created_at
  ) values (
    v_recommendation_id,v_user_id,p_source_session_id,'PROGRAM_CHANGE',v_rule_version,
    jsonb_build_object('basedOnVersionId',v_current.id,'sourceAssessment',coalesce(p_source_assessment,'{}'::jsonb)),
    jsonb_build_object('status','PROPOSED','proposalVersionId',v_new_id,'version',v_current.version+1),
    coalesce(p_evidence_refs,'[]'::jsonb),now()
  );

  insert into public.program_version(
    id,user_id,program_id,version,status,effective_from,prescription_snapshot,based_on_version_id,
    source_session_id,source_recommendation_id,change_summary
  ) values (
    v_new_id,v_user_id,v_current.program_id,v_current.version+1,'PLANNED',now(),v_snapshot,
    v_current.id,p_source_session_id,v_recommendation_id,coalesce(p_source_assessment->'changes','[]'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.activate_program_version(p_proposal_id uuid)
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

  if exists(
    select 1
    from public.canonical_safety_context s
    where s.user_id=v_user_id
      and s.status='ACTIVE_BLOCK'
      and s.source_key='BENCH-55KG-20260906'
      and exists(
        select 1 from jsonb_array_elements(coalesce(v_proposal.change_summary,'[]'::jsonb)) c
        where c->>'exerciseId'='bench-press'
      )
  ) then
    raise exception 'CANONICAL_SAFETY_BLOCK_ACTIVE';
  end if;

  select * into v_current
  from public.program_version
  where user_id=v_user_id and status='CURRENT'
  for update;
  if not found then raise exception 'CURRENT_PROGRAM_NOT_FOUND'; end if;
  if v_proposal.based_on_version_id is distinct from v_current.id then raise exception 'STALE_PROGRAM_PROPOSAL'; end if;
  if v_proposal.program_id <> v_current.program_id then raise exception 'PROGRAM_ID_MISMATCH'; end if;

  update public.program_version set status='SUPERSEDED',effective_to=v_now
  where id=v_current.id and user_id=v_user_id;

  update public.program_version set status='CURRENT',effective_from=v_now,effective_to=null
  where id=v_proposal.id and user_id=v_user_id
  returning * into v_row;

  if v_proposal.source_recommendation_id is not null then
    update public.recommendation_snapshot
    set accepted_at=coalesce(accepted_at,v_now),
        performed_at=coalesce(performed_at,v_now),
        decision=decision || jsonb_build_object('status','ACTIVATED','activatedAt',v_now)
    where id=v_proposal.source_recommendation_id and user_id=v_user_id;
  end if;

  return v_row;
end;
$$;

revoke all on function public.create_program_change_proposal(uuid,jsonb,uuid,jsonb,jsonb) from public, anon;
revoke all on function public.activate_program_version(uuid) from public, anon;
grant execute on function public.create_program_change_proposal(uuid,jsonb,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.activate_program_version(uuid) to authenticated;

