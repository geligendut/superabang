create table if not exists public.cutover_evidence (
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null,
  status text not null check (status in ('PASS','PENDING','BLOCKED')),
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, evidence_type)
);

alter table public.cutover_evidence enable row level security;

drop policy if exists cutover_evidence_self on public.cutover_evidence;
create policy cutover_evidence_self on public.cutover_evidence
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on public.cutover_evidence to authenticated;
