-- B6 Body & Progress foundation: user-entered longitudinal measurements.
-- Partial observations are allowed: weight and waist are independent measurements.
create table if not exists public.body_measurement (
  id uuid primary key,
  user_id uuid not null references public.app_user(id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5,2),
  waist_cm numeric(5,2),
  source text not null default 'MANUAL' check (source in ('MANUAL')),
  created_at timestamptz not null default now(),
  constraint body_measurement_has_value check (weight_kg is not null or waist_cm is not null),
  constraint body_measurement_weight_range check (weight_kg is null or weight_kg between 30 and 350),
  constraint body_measurement_waist_range check (waist_cm is null or waist_cm between 40 and 250)
);

create index if not exists body_measurement_user_measured_idx
  on public.body_measurement(user_id, measured_at desc);

alter table public.body_measurement enable row level security;

drop policy if exists body_measurement_self on public.body_measurement;
create policy body_measurement_self on public.body_measurement
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.body_measurement from anon;
grant select, insert, update, delete on public.body_measurement to authenticated;
