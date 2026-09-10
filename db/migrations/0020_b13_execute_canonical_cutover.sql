-- B13 explicit canonical cutover.
-- Approval received 2026-09-10 for the frozen, verified Health Master Record package.
-- This migration is intentionally one-way and non-destructive: the dogfood program is
-- superseded, never deleted, and all execution/history tables remain unchanged.

create table if not exists public.canonical_cutover_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_batch_id uuid not null unique references public.canonical_reconciliation_batch(id) on delete restrict,
  candidate_id uuid not null unique references public.canonical_program_candidate(id) on delete restrict,
  prior_program_version_id uuid not null references public.program_version(id) on delete restrict,
  canonical_program_version_id uuid not null unique references public.program_version(id) on delete restrict,
  source_system text not null check (source_system='HEALTH_MASTER_RECORD'),
  source_ref text not null,
  source_revision text not null,
  source_digest text not null,
  approval_kind text not null check (approval_kind='EXPLICIT_USER_APPROVAL'),
  approval_evidence jsonb not null,
  verification_snapshot jsonb not null,
  approved_at timestamptz not null,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.canonical_cutover_event enable row level security;
drop policy if exists canonical_cutover_event_self on public.canonical_cutover_event;
create policy canonical_cutover_event_self on public.canonical_cutover_event
for select to authenticated using (user_id=(select auth.uid()));
revoke all on table public.canonical_cutover_event from public, anon, authenticated;
grant select on table public.canonical_cutover_event to authenticated;
create index if not exists ix_canonical_cutover_event_user_performed
  on public.canonical_cutover_event(user_id,performed_at desc);

create or replace function public.guard_canonical_rotation_program_proposal()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if new.status='PLANNED' and exists(
    select 1 from public.program_version current_version
    where current_version.id=new.based_on_version_id
      and current_version.prescription_snapshot->>'schemaVersion'='canonical-program-candidate-0.1.0'
  ) then
    raise exception 'CANONICAL_ROTATION_PROPOSAL_REQUIRES_REVIEWED_ROTATION_UPDATE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_canonical_rotation_program_proposal on public.program_version;
create trigger guard_canonical_rotation_program_proposal
before insert or update of status,based_on_version_id,prescription_snapshot on public.program_version
for each row execute function public.guard_canonical_rotation_program_proposal();

revoke all on function public.guard_canonical_rotation_program_proposal() from public,anon,authenticated;

do $$
declare
  v_batch public.canonical_reconciliation_batch%rowtype;
  v_candidate public.canonical_program_candidate%rowtype;
  v_prior public.program_version%rowtype;
  v_cutover_at timestamptz := clock_timestamp();
  v_new_version_id uuid := gen_random_uuid();
  v_program_rows integer;
  v_source_sessions integer;
  v_training_rows integer;
  v_nutrition_rows integer;
  v_safety_blocks integer;
  v_imported_sessions integer;
  v_imported_meals integer;
  v_nutrition_semantics boolean;
  v_body_match boolean;
  v_export_ready boolean;
  v_history_snapshot jsonb;
  v_active_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('SUPERABANG_B13_CANONICAL_CUTOVER'));

  select * into v_batch
  from public.canonical_reconciliation_batch
  where source_system='HEALTH_MASTER_RECORD'
    and source_revision='2026-09-09T07:55:21.896Z'
    and source_digest='099d9e68afc9cec09aaaa2d3bbcac39ef7c9819aa1a9de8a9464f590a757071b'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'VERIFIED_B13_BATCH_NOT_FOUND'; end if;

  if exists(select 1 from public.canonical_cutover_event where reconciliation_batch_id=v_batch.id) then
    raise exception 'B13_CUTOVER_ALREADY_EXECUTED';
  end if;
  if v_batch.status<>'DRAFT' or v_batch.technical_status<>'READY'
     or v_batch.technically_verified_at is null then
    raise exception 'B13_BATCH_NOT_READY';
  end if;

  select * into strict v_candidate
  from public.canonical_program_candidate
  where user_id=v_batch.user_id
    and reconciliation_batch_id=v_batch.id
    and candidate_status='VERIFIED'
    and activation_allowed=false
    and source_digest='52734b8ff70a1fbadd6afa73514698a71f60c0bc0b859bb43a41b67468b48125'
  for update;

  if v_candidate.executable_prescription is null
     or v_candidate.executable_prescription->>'schemaVersion'<>'canonical-program-candidate-0.1.0'
     or jsonb_array_length(v_candidate.executable_prescription->'workouts')<>3
     or jsonb_array_length(v_candidate.executable_prescription->'rotation')<>3 then
    raise exception 'CANONICAL_EXECUTABLE_PRESCRIPTION_INVALID';
  end if;

  select jsonb_array_length(v_candidate.source_prescription_rows) into v_program_rows;
  if v_program_rows<>17 then raise exception 'CANONICAL_PROGRAM_ROW_COUNT_MISMATCH'; end if;

  select count(*),coalesce(sum(jsonb_array_length(raw_rows)),0),
         count(*) filter(where imported_session_id is not null)
  into v_source_sessions,v_training_rows,v_imported_sessions
  from public.health_source_session_stage
  where user_id=v_batch.user_id and reconciliation_batch_id=v_batch.id
    and stage_status='VERIFIED' and source_digest is not null;
  if v_source_sessions<>4 or v_training_rows<>72 or v_imported_sessions<>0 then
    raise exception 'HISTORICAL_TRAINING_EVIDENCE_MISMATCH';
  end if;

  select count(*),count(*) filter(where imported_meal_id is not null),coalesce(bool_and(
    coverage_scope='SELECTIVE_SAMPLE'
    and nutrition_basis='ESTIMATED'
    and confidence in ('LOW','MEDIUM','HIGH')
    and raw_row is not null
  ),false)
  into v_nutrition_rows,v_imported_meals,v_nutrition_semantics
  from public.health_source_nutrition_stage
  where user_id=v_batch.user_id and reconciliation_batch_id=v_batch.id and stage_status='VERIFIED';
  if v_nutrition_rows<>32 or v_imported_meals<>0 or not v_nutrition_semantics then
    raise exception 'NUTRITION_EVIDENCE_SEMANTICS_MISMATCH';
  end if;

  select count(*) into v_safety_blocks
  from public.canonical_safety_context
  where user_id=v_batch.user_id and reconciliation_batch_id=v_batch.id
    and source_key='BENCH-55KG-20260906'
    and status='ACTIVE_BLOCK' and trigger_load_kg=55 and recurrence=true
    and location='upper-left trapezius / superior scapular area'
    and verified_at is not null and source_digest is not null
    and not (evidence_snapshot ? 'diagnosis');
  if v_safety_blocks<>1 then raise exception 'ACTIVE_BENCH_SAFETY_BLOCK_MISMATCH'; end if;

  select exists(
    select 1
    from public.body_measurement m
    join public.canonical_reconciliation_item i
      on i.user_id=m.user_id and i.batch_id=v_batch.id
     and i.domain='BODY' and i.technical_status='VERIFIED'
    where m.user_id=v_batch.user_id
      and m.id=(select id from public.body_measurement where user_id=v_batch.user_id order by measured_at desc limit 1)
      and m.weight_kg=(i.target_snapshot->>'weightKg')::numeric
      and m.waist_cm=(i.target_snapshot->>'waistCm')::numeric
  ) into v_body_match;
  if not v_body_match then raise exception 'LATEST_APP_BODY_MEASUREMENT_MISMATCH'; end if;

  select exists(
    select 1 from public.cutover_evidence
    where user_id=v_batch.user_id and evidence_type='ACCOUNT_EXPORT_V1'
      and status='PASS' and metadata->>'phase'='CONFIRMED_SAVED'
  ) into v_export_ready;
  if not v_export_ready then raise exception 'ACCOUNT_EXPORT_NOT_CONFIRMED'; end if;

  if (select count(*) from public.program_version where user_id=v_batch.user_id and status='CURRENT')<>1 then
    raise exception 'CURRENT_PROGRAM_COUNT_MISMATCH';
  end if;
  if exists(select 1 from public.program_version where user_id=v_batch.user_id and status='PLANNED') then
    raise exception 'UNRESOLVED_PLANNED_PROGRAM';
  end if;

  select * into strict v_prior
  from public.program_version
  where user_id=v_batch.user_id and status='CURRENT'
  for update;

  select jsonb_build_object(
    'workoutSessions',count(distinct ws.id),
    'setLogs',(select count(*) from public.workout_set_log x where x.user_id=v_batch.user_id),
    'symptoms',(select count(*) from public.symptom_observation x where x.user_id=v_batch.user_id),
    'techniques',(select count(*) from public.technique_observation x where x.user_id=v_batch.user_id),
    'recommendations',(select count(*) from public.recommendation_snapshot x where x.user_id=v_batch.user_id)
  ) into v_history_snapshot
  from public.workout_session ws where ws.user_id=v_batch.user_id;

  v_active_snapshot := v_candidate.executable_prescription
    || jsonb_build_object(
      'sourceOfTruth','SUPERABANG',
      'activationAllowed',true,
      'requiresExplicitCutoverApproval',false,
      'canonicalProgramVersionId',v_new_version_id,
      'sourceProvenance',jsonb_build_object(
        'sourceSystem','HEALTH_MASTER_RECORD',
        'sourceRef',v_batch.source_ref,
        'sourceRevision',v_batch.source_revision,
        'sourceDigest',v_batch.source_digest,
        'candidateDigest',v_candidate.source_digest,
        'reconciliationBatchId',v_batch.id,
        'candidateId',v_candidate.id
      ),
      'cutover',jsonb_build_object(
        'approvalKind','EXPLICIT_USER_APPROVAL',
        'approvedAt',v_cutover_at,
        'performedAt',v_cutover_at
      )
    );

  update public.program_version
  set status='SUPERSEDED',effective_to=v_cutover_at
  where id=v_prior.id;

  insert into public.program_version(
    id,user_id,program_id,version,status,effective_from,effective_to,
    prescription_snapshot,based_on_version_id,change_summary
  ) values (
    v_new_version_id,v_batch.user_id,v_candidate.id,1,'CURRENT',v_cutover_at,null,
    v_active_snapshot,v_prior.id,
    jsonb_build_array(jsonb_build_object(
      'kind','B13_CANONICAL_CUTOVER',
      'sourceProgramId',v_candidate.source_program_id,
      'sourceRevision',v_batch.source_revision,
      'sourceDigest',v_batch.source_digest,
      'priorProgramVersionId',v_prior.id,
      'safetyBlockPreserved','BENCH-55KG-20260906'
    ))
  );

  update public.canonical_program_candidate
  set candidate_status='ACTIVATED',activation_allowed=true,updated_at=v_cutover_at
  where id=v_candidate.id;

  update public.canonical_reconciliation_item
  set status='EXECUTED'
  where user_id=v_batch.user_id and batch_id=v_batch.id and technical_status='VERIFIED';

  update public.canonical_reconciliation_batch
  set status='EXECUTED',updated_at=v_cutover_at,
      summary=summary || jsonb_build_object(
        'canonicalCutoverPerformed',true,
        'sourceOfTruth','SUPERABANG',
        'performedAt',v_cutover_at,
        'canonicalProgramVersionId',v_new_version_id,
        'priorProgramVersionId',v_prior.id
      )
  where id=v_batch.id;

  insert into public.canonical_cutover_event(
    user_id,reconciliation_batch_id,candidate_id,prior_program_version_id,
    canonical_program_version_id,source_system,source_ref,source_revision,source_digest,
    approval_kind,approval_evidence,verification_snapshot,approved_at,performed_at
  ) values (
    v_batch.user_id,v_batch.id,v_candidate.id,v_prior.id,v_new_version_id,
    'HEALTH_MASTER_RECORD',v_batch.source_ref,v_batch.source_revision,v_batch.source_digest,
    'EXPLICIT_USER_APPROVAL',
    jsonb_build_object(
      'channel','CHATGPT_WORK_MODE',
      'approvalText','approve',
      'approvalDate','2026-09-10',
      'scope','B13_CANONICAL_CUTOVER'
    ),
    jsonb_build_object(
      'canonicalProgramRows',v_program_rows,
      'verifiedSourceSessions',v_source_sessions,
      'verifiedTrainingRows',v_training_rows,
      'verifiedNutritionRows',v_nutrition_rows,
      'nutritionSemanticsPreserved',v_nutrition_semantics,
      'activeBenchSafetyBlock',v_safety_blocks=1,
      'latestAppBodyMeasurementPreserved',v_body_match,
      'historicalSourceNotImported',v_imported_sessions=0 and v_imported_meals=0,
      'accountExportConfirmed',v_export_ready,
      'dogfoodHistory',v_history_snapshot
    ),
    v_cutover_at,v_cutover_at
  );
end;
$$;

create or replace function public.b13_cutover_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch public.canonical_reconciliation_batch%rowtype;
  v_event public.canonical_cutover_event%rowtype;
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
  v_pre_ready boolean := false;
  v_cutover_ready boolean := false;
  v_history_preserved boolean := false;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_batch from public.canonical_reconciliation_batch
  where user_id=v_user and source_system='HEALTH_MASTER_RECORD'
  order by created_at desc limit 1;
  if not found then return jsonb_build_object(
    'technicalStatus','NOT_STAGED','cutoverApproved',false,'canonicalCutoverPerformed',false
  ); end if;

  select * into v_event from public.canonical_cutover_event
  where user_id=v_user and reconciliation_batch_id=v_batch.id;

  select count(*),coalesce(max(jsonb_array_length(source_prescription_rows)),0)
  into v_candidate_count,v_program_rows
  from public.canonical_program_candidate
  where user_id=v_user and reconciliation_batch_id=v_batch.id
    and executable_prescription is not null and source_digest is not null
    and ((candidate_status='VERIFIED' and activation_allowed=false)
      or (candidate_status='ACTIVATED' and activation_allowed=true));

  select count(*),coalesce(sum(jsonb_array_length(raw_rows)),0),
         count(*) filter(where imported_session_id is not null)
  into v_session_count,v_training_rows,v_imported_source_sessions
  from public.health_source_session_stage
  where user_id=v_user and reconciliation_batch_id=v_batch.id
    and stage_status='VERIFIED' and source_digest is not null;

  select count(*),count(*) filter(where imported_meal_id is not null),coalesce(bool_and(
    coverage_scope='SELECTIVE_SAMPLE' and nutrition_basis='ESTIMATED'
    and confidence in ('LOW','MEDIUM','HIGH') and raw_row is not null
  ),false)
  into v_nutrition_rows,v_imported_source_meals,v_nutrition_semantics
  from public.health_source_nutrition_stage
  where user_id=v_user and reconciliation_batch_id=v_batch.id and stage_status='VERIFIED';

  select count(*) into v_safety_count from public.canonical_safety_context
  where user_id=v_user and reconciliation_batch_id=v_batch.id
    and status='ACTIVE_BLOCK' and source_key='BENCH-55KG-20260906'
    and trigger_load_kg=55 and recurrence=true
    and location='upper-left trapezius / superior scapular area'
    and verified_at is not null and source_digest is not null
    and not (evidence_snapshot ? 'diagnosis');

  select count(*) into v_current_count from public.program_version
  where user_id=v_user and status='CURRENT';

  select exists(
    select 1 from public.body_measurement m
    join public.canonical_reconciliation_item i
      on i.user_id=m.user_id and i.batch_id=v_batch.id
     and i.domain='BODY' and i.technical_status='VERIFIED'
    where m.user_id=v_user
      and m.id=(select id from public.body_measurement where user_id=v_user order by measured_at desc limit 1)
      and m.weight_kg=(i.target_snapshot->>'weightKg')::numeric
      and m.waist_cm=(i.target_snapshot->>'waistCm')::numeric
  ) into v_body_match;

  if v_event.id is not null then
    select
      (select count(*) from public.workout_session where user_id=v_user)
        =(v_event.verification_snapshot#>>'{dogfoodHistory,workoutSessions}')::integer
      and (select count(*) from public.workout_set_log where user_id=v_user)
        =(v_event.verification_snapshot#>>'{dogfoodHistory,setLogs}')::integer
      and (select count(*) from public.symptom_observation where user_id=v_user)
        =(v_event.verification_snapshot#>>'{dogfoodHistory,symptoms}')::integer
      and (select count(*) from public.technique_observation where user_id=v_user)
        =(v_event.verification_snapshot#>>'{dogfoodHistory,techniques}')::integer
      and (select count(*) from public.recommendation_snapshot where user_id=v_user)
        =(v_event.verification_snapshot#>>'{dogfoodHistory,recommendations}')::integer
    into v_history_preserved;
  end if;

  v_pre_ready := v_event.id is null and v_batch.technical_status='READY'
    and v_batch.status='DRAFT' and v_candidate_count=1 and v_program_rows=17
    and v_session_count=4 and v_training_rows=72 and v_nutrition_rows=32
    and v_safety_count=1 and v_current_count=1
    and v_imported_source_sessions=0 and v_imported_source_meals=0
    and v_body_match and v_nutrition_semantics;

  v_cutover_ready := v_event.id is not null and v_batch.technical_status='READY'
    and v_batch.status='EXECUTED' and v_candidate_count=1 and v_program_rows=17
    and v_session_count=4 and v_training_rows=72 and v_nutrition_rows=32
    and v_safety_count=1 and v_current_count=1
    and v_imported_source_sessions=0 and v_imported_source_meals=0
    and v_body_match and v_nutrition_semantics and v_history_preserved
    and exists(select 1 from public.program_version where id=v_event.canonical_program_version_id
      and user_id=v_user and status='CURRENT'
      and prescription_snapshot->>'sourceOfTruth'='SUPERABANG'
      and prescription_snapshot->>'schemaVersion'='canonical-program-candidate-0.1.0')
    and exists(select 1 from public.program_version where id=v_event.prior_program_version_id
      and user_id=v_user and status='SUPERSEDED');

  return jsonb_build_object(
    'technicalStatus',case when v_cutover_ready then 'CUTOVER_EXECUTED'
      when v_pre_ready then 'CUTOVER_READY_AWAITING_APPROVAL' else 'BLOCKED' end,
    'cutoverApproved',v_event.id is not null,
    'canonicalCutoverPerformed',v_event.id is not null,
    'sourceOfTruth',case when v_event.id is not null then 'SUPERABANG' else 'HEALTH_MASTER_RECORD' end,
    'batchId',v_batch.id,
    'sourceRevision',v_batch.source_revision,
    'cutoverPerformedAt',v_event.performed_at,
    'canonicalProgramVersionId',v_event.canonical_program_version_id,
    'priorProgramVersionId',v_event.prior_program_version_id,
    'checks',jsonb_build_object(
      'oneCurrentDogfoodProgram',v_pre_ready and v_current_count=1,
      'oneCurrentProgram',v_current_count=1,
      'nonActiveVerifiedCandidate',v_pre_ready and v_candidate_count=1,
      'activeCanonicalProgram',v_cutover_ready,
      'dogfoodProgramSuperseded',v_event.id is not null and exists(
        select 1 from public.program_version where id=v_event.prior_program_version_id and status='SUPERSEDED'),
      'dogfoodHistoryPreserved',v_history_preserved,
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

revoke all on function public.b13_cutover_readiness_v1() from public,anon;
grant execute on function public.b13_cutover_readiness_v1() to authenticated;
