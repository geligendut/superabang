# B5 — Superabang Deployment Gate

Status: PREVIEW DEPLOYMENT PENDING

## Required environment

- `NEXT_PUBLIC_APP_ENV=preview` (or `production` after promotion)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The publishable key is intentionally client-side. Do not place a Supabase `service_role` or secret key in the browser or this repository.

## Current live backend

Supabase migrations 0001–0005 are the expected schema. Migration 0005 hardens workout synchronization to append-only/idempotent semantics: historical set, symptom, technique, and recommendation rows cannot be silently rewritten by a retry using the same entity ID.

## Preview acceptance

1. Production build succeeds.
2. App loads on iPhone Safari.
3. Create/sign into dogfood account.
4. Start synthetic M1 workout.
5. Log 20 kg empty-bar warm-up (not 0 kg).
6. Continue logging with network disabled.
7. Complete normally or stop only through the deterministic safety gate.
8. Kill/reopen PWA; local history remains.
9. Reconnect and sync.
10. Re-run sync; database remains idempotent with no duplicate or rewritten historical observations.
11. Verify user-scoped RLS with a second synthetic account before any multi-user use.

Canonical Health cutover remains explicitly out of scope for B5.
