revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop policy if exists app_user_self on public.app_user;
create policy app_user_self on public.app_user
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists program_version_self on public.program_version;
create policy program_version_self on public.program_version
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists workout_session_self on public.workout_session;
create policy workout_session_self on public.workout_session
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists workout_set_log_self on public.workout_set_log;
create policy workout_set_log_self on public.workout_set_log
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists symptom_observation_self on public.symptom_observation;
create policy symptom_observation_self on public.symptom_observation
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists technique_observation_self on public.technique_observation;
create policy technique_observation_self on public.technique_observation
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists recommendation_snapshot_self on public.recommendation_snapshot;
create policy recommendation_snapshot_self on public.recommendation_snapshot
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists ix_recommendation_snapshot_user on public.recommendation_snapshot(user_id);
create index if not exists ix_symptom_observation_session on public.symptom_observation(session_id);
create index if not exists ix_symptom_observation_user on public.symptom_observation(user_id);
create index if not exists ix_technique_observation_session on public.technique_observation(session_id);
create index if not exists ix_technique_observation_user on public.technique_observation(user_id);
create index if not exists ix_workout_session_program_version on public.workout_session(program_version_id);
create index if not exists ix_workout_set_log_user on public.workout_set_log(user_id);
