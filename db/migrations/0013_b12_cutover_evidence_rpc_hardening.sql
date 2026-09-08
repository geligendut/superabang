create or replace function public.record_cutover_export_evidence(
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
    'PASS',
    coalesce(p_observed_at, now()),
    jsonb_build_object(
      'exportVersion', p_export_version,
      'canonicalStatus', p_canonical_status
    )
  )
  on conflict (user_id,evidence_type)
  do update set
    status = excluded.status,
    observed_at = excluded.observed_at,
    metadata = excluded.metadata;
end;
$$;

revoke all on function public.record_cutover_export_evidence(text,text,timestamptz) from public, anon;
grant execute on function public.record_cutover_export_evidence(text,text,timestamptz) to authenticated;

revoke insert, update, delete, truncate on public.cutover_evidence from anon, authenticated;
grant select on public.cutover_evidence to authenticated;
