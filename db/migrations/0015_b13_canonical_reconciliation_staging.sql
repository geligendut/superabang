create table if not exists public.canonical_reconciliation_batch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null,
  source_ref text not null,
  source_revision text,
  status text not null default 'DRAFT' check (status in ('DRAFT','REVIEWED','APPROVED','EXECUTED','CANCELLED')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canonical_reconciliation_item (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.canonical_reconciliation_batch(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  source_key text not null,
  classification text not null check (classification in ('MATCH','MIGRATE','SUPERSEDE_DOGFOOD','PRESERVE_HISTORY','BLOCKED','PENDING')),
  proposed_action text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  target_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','EXECUTED')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.canonical_reconciliation_batch enable row level security;
alter table public.canonical_reconciliation_item enable row level security;

drop policy if exists canonical_reconciliation_batch_self on public.canonical_reconciliation_batch;
create policy canonical_reconciliation_batch_self on public.canonical_reconciliation_batch
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists canonical_reconciliation_item_self on public.canonical_reconciliation_item;
create policy canonical_reconciliation_item_self on public.canonical_reconciliation_item
for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.canonical_reconciliation_batch from anon, authenticated;
revoke insert, update, delete, truncate on public.canonical_reconciliation_item from anon, authenticated;
grant select on public.canonical_reconciliation_batch to authenticated;
grant select on public.canonical_reconciliation_item to authenticated;

create or replace function public.stage_health_master_reconciliation_v1(
  p_source_ref text,
  p_source_revision text,
  p_summary jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch uuid;
  v_item jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.canonical_reconciliation_batch(user_id,source_system,source_ref,source_revision,status,summary)
  values (v_user,'HEALTH_MASTER_RECORD',p_source_ref,p_source_revision,'DRAFT',coalesce(p_summary,'{}'::jsonb))
  returning id into v_batch;

  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    insert into public.canonical_reconciliation_item(
      batch_id,user_id,domain,source_key,classification,proposed_action,source_snapshot,target_snapshot,status,notes
    ) values (
      v_batch,v_user,
      coalesce(v_item->>'domain','UNKNOWN'),
      coalesce(v_item->>'sourceKey','UNKNOWN'),
      coalesce(v_item->>'classification','PENDING'),
      coalesce(v_item->>'proposedAction','REVIEW'),
      coalesce(v_item->'sourceSnapshot','{}'::jsonb),
      coalesce(v_item->'targetSnapshot','{}'::jsonb),
      'PENDING',
      v_item->>'notes'
    );
  end loop;

  return v_batch;
end;
$$;

revoke all on function public.stage_health_master_reconciliation_v1(text,text,jsonb,jsonb) from public, anon;
grant execute on function public.stage_health_master_reconciliation_v1(text,text,jsonb,jsonb) to authenticated;
