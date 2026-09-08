-- B10 verified menu evidence store.
-- Google Places discovery response is not persisted here.
create table if not exists public.food_menu_evidence (
  id uuid primary key,
  user_id uuid not null references public.app_user(id) on delete cascade,
  provider_place_id text not null,
  restaurant_name text not null,
  item_name text not null,
  item_description text,
  portion_note text,
  suggested_modification text,
  evidence_url text not null,
  evidence_observed_at timestamptz not null,
  evidence_confidence text not null check (evidence_confidence in ('LOW','MEDIUM','HIGH')),
  meaningful_protein boolean not null default false,
  vegetables_or_fruit boolean not null default false,
  practical_carb_source boolean not null default false,
  fried_or_heavy boolean not null default false,
  portion_control_easy boolean not null default false,
  source text not null default 'USER_VERIFIED' check (source in ('USER_VERIFIED','RESTAURANT_PUBLISHED')),
  created_at timestamptz not null default now()
);

create index if not exists food_menu_evidence_user_place_idx
  on public.food_menu_evidence(user_id, provider_place_id, evidence_observed_at desc);

alter table public.food_menu_evidence enable row level security;
drop policy if exists food_menu_evidence_self on public.food_menu_evidence;
create policy food_menu_evidence_self on public.food_menu_evidence
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.food_menu_evidence from anon;
grant select, insert, update, delete on public.food_menu_evidence to authenticated;
