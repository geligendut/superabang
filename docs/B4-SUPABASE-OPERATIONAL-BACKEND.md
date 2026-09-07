# B4 — Supabase Operational Backend

Status: IMPLEMENTED / NOT YET LIVE-VERIFIED

## Implementation decision B4-ID-01
For M1 dogfood, finalize the approved PostgreSQL/Supabase candidate as the operational backend:

- Supabase Postgres
- Supabase Auth (email/password for the first private dogfood account)
- Row Level Security on all user-owned health/fitness tables
- Next.js API boundary for sync
- client-held Supabase session token; no service-role key in the browser or repository
- one database RPC (`sync_workout_session`) for atomic, idempotent workout snapshot sync

This is an implementation choice within the approved stack direction, not a product redesign.

## Offline / sync behavior
Workout logging and completion remain local-first. Completion atomically writes local history and a persistent IndexedDB outbox operation. Backend failure changes sync state only; it does not roll back local workout history.

When authenticated and online, the sync transport sends the outbox operation to `/api/sync/workout-session`. The route validates the user JWT and forwards the payload to the RLS-protected database RPC. The RPC derives `user_id` exclusively from `auth.uid()` and ignores any client-provided user identity.

## UUID correction
Earlier synthetic navigation used a non-UUID session route (`synthetic-session-001`), while the approved relational schema uses UUID primary keys. B4 corrects this implementation mismatch: every new workout session now uses `crypto.randomUUID()`. A matching active workout is resumed from IndexedDB rather than relying on a fixed route ID.

## Required live configuration
1. Create a private Supabase project.
2. Apply migrations `0001`, `0002`, `0003` in order.
3. Create the dogfood auth user using minimum-necessary personal data.
4. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment.
5. Do not configure a Supabase service-role key in the client application.
6. Verify RLS with at least two synthetic test users before loading any actual Health data.

## Live verification gate
B4 is not live-verified until all of the following pass:

- authenticated login works on deployed PWA;
- offline completed session remains available after app restart;
- sync succeeds after connectivity returns;
- re-sending the same outbox operation is idempotent;
- user A cannot read/write user B records;
- local history remains available after 401/409/5xx/network failures;
- logout does not delete local workout history;
- no service-role secret is present in client bundles.
