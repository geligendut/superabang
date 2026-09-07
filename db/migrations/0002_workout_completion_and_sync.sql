-- B3/B4 foundation: preserve completion semantics and recommendation traceability.
-- Provider-neutral PostgreSQL only; authentication/RLS policy is intentionally deferred
-- until the backend/auth provider is selected and configured.

alter table workout_session
  add column if not exists completion_status text
  check (completion_status in ('COMPLETED','STOPPED_FOR_SAFETY'));

alter table workout_session
  add column if not exists updated_at timestamptz not null default now();

alter table recommendation_snapshot
  add column if not exists session_id uuid references workout_session(id);

create index if not exists ix_recommendation_snapshot_session
  on recommendation_snapshot(session_id, created_at desc);

-- The client outbox uses workout_session.id as the stable aggregate identity.
-- Repeated server UPSERTs must therefore remain idempotent on the session primary key.
create index if not exists ix_workout_session_user_completed
  on workout_session(user_id, completed_at desc);
