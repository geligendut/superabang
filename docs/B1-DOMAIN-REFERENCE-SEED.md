# B1 — Domain & Reference Seed

Status: IMPLEMENTED / LOCALLY VERIFIED (2026-09-07)

## Scope implemented
- Explicit equipment reference model with 20 kg Olympic bar semantics.
- Exercise reference model with load model (`BARBELL_TOTAL`, `STACK`, etc.).
- Version-referenced workout prescription contract.
- Prescribed set contract with set type, target load/reps and RPE ceiling.
- Synthetic M1 prescription only; no current Health plan has been migrated.
- Synthetic plate inventory is clearly marked non-canonical.
- Deterministic execution helper for next prescribed set and completion summary.

## B2 started in the same batch
- IndexedDB schema upgraded to v2.
- Active session stores full prescribed snapshot plus multiple set logs.
- Symptom and technique observations remain distinct collections.
- Session completion moves the snapshot to local history.
- Recommendation provenance is stored with the completed session.
- History can be reopened from local persistence.

## Invariants preserved
- Empty Olympic bar = 20 kg total load / WARMUP.
- AI is not required for logging or workout completion.
- Recommendation is stored separately from performed execution.
- Current Health workflow remains canonical; this seed is synthetic.

## Deferred
- Server auth and user-scoped Supabase persistence.
- Outbox replay and conflict resolution.
- Exact approved safety thresholds beyond the currently provisional deterministic Alpha gate.
- Migration/reconciliation against Health & Fitness Master Record.
