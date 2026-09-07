# B4 Live Security Verification

Status: VERIFIED on Supabase live project — 2026-09-07.

## Applied

- Migrations 0001–0004 applied to the live Supabase project.
- RLS enabled on all seven current user-data tables.
- User ownership policies restricted to `authenticated` and use `(select auth.uid())`.
- `sync_workout_session(jsonb)` remains `SECURITY INVOKER` and executable by authenticated users.
- `handle_new_auth_user()` remains a trigger-only `SECURITY DEFINER` function; direct execute was revoked from `public`, `anon`, and `authenticated`.
- Covering indexes added for previously unindexed foreign keys.

## Verification

Supabase Security Advisor returned zero security lints after migration 0004.
Performance advisor no longer reports unindexed foreign keys or per-row `auth.uid()` initialization warnings. Remaining notices are only unused-index informational notices, expected on a new database with no workout traffic yet.

Privilege check:

- anon execute `handle_new_auth_user()`: false
- authenticated execute `handle_new_auth_user()`: false
- authenticated execute `sync_workout_session(jsonb)`: true

## Data state

No actual health/workout data was introduced as part of this verification. Canonical cutover remains out of scope for B4.
