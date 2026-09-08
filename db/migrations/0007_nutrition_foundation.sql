-- B8 Nutrition Foundation.
-- Meal logging preserves uncertainty and partial coverage. Logged subtotals must not be represented as complete daily intake totals.
create table if not exists public.nutrition_meal (
  id uuid primary key,
  user_id uuid not null references public.app_user(id) on delete cascade,
  consumed_at timestamptz not null,
  meal_type text not null check (meal_type in ('BREAKFAST','LUNCH','DINNER','SNACK','OTHER')),
  description text not null check (length(btrim(description)) > 0),
  portion_note text,
  coverage text not null check (coverage in ('PARTIAL','COMPLETE')),
  energy_kcal numeric(7,2),
  protein_g numeric(7,2),
  carbs_g numeric(7,2),
  fat_g numeric(7,2),
  nutrition_basis text not null default 'UNKNOWN'
    check (nutrition_basis in ('UNKNOWN','ESTIMATED','PACKAGE_LABEL','RESTAURANT_PUBLISHED')),
  confidence text check (confidence in ('LOW','MEDIUM','HIGH')),
  source text not null default 'MANUAL' check (source in ('MANUAL')),
  created_at timestamptz not null default now(),

  constraint nutrition_meal_energy_range check (energy_kcal is null or energy_kcal between 0 and 10000),
  constraint nutrition_meal_protein_range check (protein_g is null or protein_g between 0 and 1000),
  constraint nutrition_meal_carbs_range check (carbs_g is null or carbs_g between 0 and 2000),
  constraint nutrition_meal_fat_range check (fat_g is null or fat_g between 0 and 1000),
  constraint nutrition_meal_basis_confidence check (
    (nutrition_basis = 'UNKNOWN' and confidence is null and
      energy_kcal is null and protein_g is null and carbs_g is null and fat_g is null)
    or
    (nutrition_basis <> 'UNKNOWN' and confidence is not null)
  )
);

create index if not exists nutrition_meal_user_consumed_idx
  on public.nutrition_meal(user_id, consumed_at desc);

alter table public.nutrition_meal enable row level security;

drop policy if exists nutrition_meal_self on public.nutrition_meal;
create policy nutrition_meal_self on public.nutrition_meal
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.nutrition_meal from anon;
grant select, insert, update, delete on public.nutrition_meal to authenticated;
