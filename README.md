# Superabang
Implementation repository for M1 — Training Loop Alpha.

## Canonical status
Product-facing name: **Superabang**. Internal implementation lineage remains Fitness App Dogfood / dogfood.

Development / parallel dogfood only. Existing Health workflow and Health & Fitness Master Record v0.1 remain authoritative until the Dogfood Cutover Gate is passed.

## Implementation status
- B0 — Foundation: IMPLEMENTED / LOCALLY VERIFIED
- B1 — Domain & Reference Seed: IMPLEMENTED / LOCALLY VERIFIED
- B2 — Workout Core: IMPLEMENTED / LOCALLY VERIFIED
- B3 — Safety & Decisioning: IMPLEMENTED / LOCALLY VERIFIED for M1 alpha; numeric thresholds remain PROVISIONAL
- B4 — Sync / Backend: SUPABASE INTEGRATION IMPLEMENTED; live environment not yet configured/verified
- B5 — iPhone Dogfood: DEPLOYMENT-READY IN CODE; blocked on live backend/configuration/build verification

## Critical behavior implemented
- Offline-first active workout logging in IndexedDB
- 20 kg Olympic empty-bar warm-up recorded as 20 kg / WARMUP
- Versioned prescribed snapshot retained with execution history
- Symptom and technique observations stored separately
- Normal completion requires all prescribed sets
- Early stop is explicit `STOPPED_FOR_SAFETY` and only permitted after deterministic safety block
- Deterministic safety rules precede AI and AI failure cannot block logging
- Recommendation provenance retains evidence references + rule version/status
- Workout completion atomically writes local history + persistent sync outbox
- Sync failure is retryable and does not remove local history
- Supabase Auth + RLS + atomic sync RPC implemented behind the persistent outbox
- Workout session IDs are real UUIDs; active sessions resume from IndexedDB

## Tests
`npm run test:foundation` — current local result: 15/15 passing

## Build prerequisites
Install dependencies in a network-enabled environment, then run `npm run build`.

## B4 live configuration
Apply `db/migrations/0001_foundation.sql`, `0002_workout_completion_and_sync.sql`, and `0003_supabase_auth_rls_and_sync_rpc.sql` to a private Supabase project. Set only the public project URL and anon key in the client deployment. See `docs/B4-SUPABASE-OPERATIONAL-BACKEND.md`.


## Live backend hardening

Supabase migrations `0001` through `0004` have been applied to the connected live backend. Migration `0004_security_and_rls_performance_hardening.sql` revokes direct access to the auth bootstrap trigger function, optimizes RLS auth lookup, and adds covering FK indexes. See `docs/B4-LIVE-SECURITY-VERIFICATION.md`.

## B5 deployment candidate

- Product name: **Superabang**.
- Supabase backend: live/hardened through migration `0005_append_only_sync_integrity.sql`.
- New deployments should use the Supabase publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); legacy anon key is supported only as a fallback.
- First account can be created from `/auth`; actual email-confirmation behavior follows live Supabase Auth configuration.
- Historical execution sync is append-only/idempotent; retries with conflicting entity content are rejected instead of overwriting prior observations.
- Vercel/iPhone preview remains a deployment gate, not yet verified.
