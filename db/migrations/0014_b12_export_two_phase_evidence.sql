create or replace function public.prepare_cutover_export_evidence(
  p_export_version text,
  p_canonical_status text,
  p_observed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.cutover_evidence(user_id,evidence_type,status,observed_at,metadata)
  values (
    auth.uid(),
    'ACCOUNT_EXPORT_V1',
    'PENDING',
    coalesce(p_observed_at, now()),
    jsonb_build_object(
      'exportVersion', p_export_version,
      'canonicalStatus', p_canonical_status,
      'phase', 'PREPARED'
    )
  )
  on conflict (user_id,evidence_type)
  do update set
    status = excluded.status,
    observed_at = excluded.observed_at,
    metadata = excluded.metadata;
end;
$$;

create or replace function public.confirm_cutover_export_saved(
  p_confirmed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select metadata into v_metadata
  from public.cutover_evidence
  where user_id = auth.uid()
    and evidence_type = 'ACCOUNT_EXPORT_V1'
  for update;

  if v_metadata is null then
    raise exception 'EXPORT_EVIDENCE_NOT_PREPARED';
  end if;

  update public.cutover_evidence
  set status = 'PASS',
      observed_at = coalesce(p_confirmed_at, now()),
      metadata = coalesce(v_metadata, '{}'::jsonb) || jsonb_build_object(
        'phase', 'CONFIRMED_SAVED',
        'confirmedAt', coalesce(p_confirmed_at, now())
      )
  where user_id = auth.uid()
    and evidence_type = 'ACCOUNT_EXPORT_V1';
end;
$$;

revoke all on function public.prepare_cutover_export_evidence(text,text,timestamptz) from public, anon;
revoke all on function public.confirm_cutover_export_saved(timestamptz) from public, anon;
grant execute on function public.prepare_cutover_export_evidence(text,text,timestamptz) to authenticated;
grant execute on function public.confirm_cutover_export_saved(timestamptz) to authenticated;

revoke execute on function public.record_cutover_export_evidence(text,text,timestamptz) from authenticated;
