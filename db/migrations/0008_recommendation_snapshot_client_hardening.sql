-- B9 recommendation provenance uses the existing generic recommendation_snapshot table.
-- Harden direct client access: anonymous clients do not need table privileges.
revoke all on public.recommendation_snapshot from anon;

-- Authenticated users may create/read their own recommendation snapshots under existing RLS.
-- Update is retained for future explicit accepted/performed transitions; delete is intentionally not granted.
revoke all on public.recommendation_snapshot from authenticated;
grant select, insert, update on public.recommendation_snapshot to authenticated;
