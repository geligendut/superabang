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
  v_item jsonb;
  v_existing_session workout_session%rowtype;
  v_existing_set workout_set_log%rowtype;
  v_existing_symptom symptom_observation%rowtype;
  v_existing_technique technique_observation%rowtype;
  v_existing_recommendation recommendation_snapshot%rowtype;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_completion_status text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_session_id := nullif(p_payload->>'sessionId','')::uuid;
  if v_session_id is null then
    raise exception 'SESSION_ID_REQUIRED';
  end if;

  v_started_at := (p_payload->>'startedAt')::timestamptz;
  v_completed_at := nullif(p_payload->>'completedAt','')::timestamptz;
  v_completion_status := nullif(p_payload->>'completionStatus','');

  select * into v_existing_session
  from workout_session
  where id = v_session_id;

  if found then
    if v_existing_session.user_id <> v_user_id
       or v_existing_session.prescribed_snapshot is distinct from p_payload->'prescribedSnapshot'
       or v_existing_session.started_at is distinct from v_started_at then
      raise exception 'SESSION_IMMUTABLE_CONFLICT';
    end if;

    if v_existing_session.completed_at is not null then
      if v_existing_session.completed_at is distinct from v_completed_at
         or v_existing_session.completion_status is distinct from v_completion_status then
        raise exception 'SESSION_COMPLETION_CONFLICT';
      end if;
    elsif v_completed_at is not null then
      update workout_session
      set completed_at = v_completed_at,
          completion_status = v_completion_status,
          updated_at = now()
      where id = v_session_id and user_id = v_user_id;
    end if;
  else
    insert into workout_session(
      id, user_id, prescribed_snapshot, started_at, completed_at,
      completion_status, created_at, updated_at
    ) values (
      v_session_id,
      v_user_id,
      p_payload->'prescribedSnapshot',
      v_started_at,
      v_completed_at,
      v_completion_status,
      v_started_at,
      now()
    );
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'sets','[]'::jsonb))
  loop
    select * into v_existing_set from workout_set_log where id = (v_item->>'id')::uuid;
    if found then
      if v_existing_set.user_id <> v_user_id
         or v_existing_set.session_id <> v_session_id
         or v_existing_set.exercise_id is distinct from v_item->>'exerciseId'
         or v_existing_set.sequence is distinct from (v_item->>'sequence')::int
         or v_existing_set.load_kg is distinct from (v_item->>'loadKg')::numeric
         or v_existing_set.reps is distinct from (v_item->>'reps')::int
         or v_existing_set.rpe is distinct from nullif(v_item->>'rpe','')::numeric
         or v_existing_set.set_type is distinct from (v_item->>'setType')::set_type
         or v_existing_set.recorded_at is distinct from (v_item->>'recordedAt')::timestamptz then
        raise exception 'SET_LOG_IMMUTABLE_CONFLICT';
      end if;
    else
      insert into workout_set_log(id, user_id, session_id, exercise_id, sequence, load_kg, reps, rpe, set_type, recorded_at)
      values (
        (v_item->>'id')::uuid, v_user_id, v_session_id, v_item->>'exerciseId',
        (v_item->>'sequence')::int, (v_item->>'loadKg')::numeric, (v_item->>'reps')::int,
        nullif(v_item->>'rpe','')::numeric, (v_item->>'setType')::set_type,
        (v_item->>'recordedAt')::timestamptz
      );
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'symptoms','[]'::jsonb))
  loop
    select * into v_existing_symptom from symptom_observation where id = (v_item->>'id')::uuid;
    if found then
      if v_existing_symptom.user_id <> v_user_id
         or v_existing_symptom.session_id <> v_session_id
         or v_existing_symptom.exercise_id is distinct from nullif(v_item->>'exerciseId','')
         or v_existing_symptom.severity is distinct from (v_item->>'severity')::int
         or v_existing_symptom.location is distinct from nullif(v_item->>'location','')
         or v_existing_symptom.onset is distinct from nullif(v_item->>'onset','')
         or v_existing_symptom.trigger is distinct from nullif(v_item->>'trigger','')
         or v_existing_symptom.recorded_at is distinct from (v_item->>'recordedAt')::timestamptz then
        raise exception 'SYMPTOM_IMMUTABLE_CONFLICT';
      end if;
    else
      insert into symptom_observation(id, user_id, session_id, exercise_id, severity, location, onset, trigger, recorded_at)
      values (
        (v_item->>'id')::uuid, v_user_id, v_session_id, nullif(v_item->>'exerciseId',''),
        (v_item->>'severity')::int, nullif(v_item->>'location',''), nullif(v_item->>'onset',''),
        nullif(v_item->>'trigger',''), (v_item->>'recordedAt')::timestamptz
      );
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'techniques','[]'::jsonb))
  loop
    select * into v_existing_technique from technique_observation where id = (v_item->>'id')::uuid;
    if found then
      if v_existing_technique.user_id <> v_user_id
         or v_existing_technique.session_id <> v_session_id
         or v_existing_technique.exercise_id is distinct from nullif(v_item->>'exerciseId','')
         or v_existing_technique.flag is distinct from v_item->>'flag'
         or v_existing_technique.note is distinct from nullif(v_item->>'note','')
         or v_existing_technique.recorded_at is distinct from (v_item->>'recordedAt')::timestamptz then
        raise exception 'TECHNIQUE_IMMUTABLE_CONFLICT';
      end if;
    else
      insert into technique_observation(id, user_id, session_id, exercise_id, flag, note, recorded_at)
      values (
        (v_item->>'id')::uuid, v_user_id, v_session_id, nullif(v_item->>'exerciseId',''),
        v_item->>'flag', nullif(v_item->>'note',''), (v_item->>'recordedAt')::timestamptz
      );
    end if;
  end loop;

  v_recommendation := p_payload->'recommendation';
  if v_recommendation is not null and jsonb_typeof(v_recommendation) = 'object' then
    select * into v_existing_recommendation
    from recommendation_snapshot
    where id = (v_recommendation->>'id')::uuid;

    if found then
      if v_existing_recommendation.user_id <> v_user_id
         or v_existing_recommendation.session_id is distinct from v_session_id
         or v_existing_recommendation.recommendation_type is distinct from 'NEXT_EXPOSURE'
         or v_existing_recommendation.rule_version is distinct from v_recommendation->>'ruleVersion'
         or v_existing_recommendation.input_snapshot is distinct from coalesce(v_recommendation->'inputSnapshot','{}'::jsonb)
         or v_existing_recommendation.decision is distinct from coalesce(v_recommendation->'decision','{}'::jsonb)
         or v_existing_recommendation.evidence_refs is distinct from coalesce(v_recommendation->'evidenceRefs','[]'::jsonb)
         or v_existing_recommendation.created_at is distinct from (v_recommendation->>'createdAt')::timestamptz
         or v_existing_recommendation.accepted_at is distinct from nullif(v_recommendation->>'acceptedAt','')::timestamptz
         or v_existing_recommendation.performed_at is distinct from nullif(v_recommendation->>'performedAt','')::timestamptz then
        raise exception 'RECOMMENDATION_IMMUTABLE_CONFLICT';
      end if;
    else
      insert into recommendation_snapshot(
        id, user_id, session_id, recommendation_type, rule_version,
        input_snapshot, decision, evidence_refs, created_at, accepted_at, performed_at
      ) values (
        (v_recommendation->>'id')::uuid, v_user_id, v_session_id, 'NEXT_EXPOSURE',
        v_recommendation->>'ruleVersion', coalesce(v_recommendation->'inputSnapshot','{}'::jsonb),
        coalesce(v_recommendation->'decision','{}'::jsonb), coalesce(v_recommendation->'evidenceRefs','[]'::jsonb),
        (v_recommendation->>'createdAt')::timestamptz,
        nullif(v_recommendation->>'acceptedAt','')::timestamptz,
        nullif(v_recommendation->>'performedAt','')::timestamptz
      );
    end if;
  end if;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'userId', v_user_id,
    'syncedAt', now(),
    'idempotent', true
  );
end;
$$;

revoke all on function public.sync_workout_session(jsonb) from public, anon;
grant execute on function public.sync_workout_session(jsonb) to authenticated;
