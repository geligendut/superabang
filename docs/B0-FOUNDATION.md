# B0 — Foundation
Status: IMPLEMENTED / NOT YET DEPLOYED
Milestone: M1 — Training Loop Alpha
Date: 2026-09-07

## Concrete M1 stack choices
- Mobile-first installable PWA: Next.js App Router + React + TypeScript.
- Offline active workout: native IndexedDB; service worker app-shell cache. No third-party offline dependency in B0.
- Remote persistence target: PostgreSQL/Supabase with user-scoped RLS to be wired in B1/B2. SQL foundation migration included; no live provider credentials committed.
- Decisioning: deterministic TypeScript functions first; AI remains server-side and non-blocking later.
- Deployment target: Vercel candidate; deployment intentionally not claimed until dependency installation/build and environment configuration are verified.

## Invariants implemented in foundation
1. One CURRENT program per user enforced by partial unique DB index.
2. Program version/history is append/version oriented; workout session stores prescribed snapshot.
3. Active workout has IndexedDB persistence and shell service worker.
4. Core logging imports no AI dependency.
5. Symptom and technique observations are separate domain/table concepts.
6. Recommendation snapshot separates recommendation from accepted/performed timestamps and stores rule version/evidence refs/input snapshot.
7. Barbell load feasibility includes bar weight; 20 kg empty bar is representable as WARMUP.
8. Synthetic data is used in UI scaffold.

## Deliberately deferred
- Supabase project/auth/RLS policy wiring.
- Sync conflict protocol and server outbox endpoint.
- Full workout set collection and immutable history query.
- Final safety thresholds from the approved rule baseline; B0 rule values are implementation placeholders and must not silently replace an approved rule matrix.
- AI recommendation orchestration.
- Health Master Record migration/reconciliation and cutover.
- Nutrition/Food Finder/map provider spike.

## Gate to B1
- Recover/verify detailed approved baseline text where available.
- Install dependencies and run Next build in a network-enabled environment.
- Configure private development environment and Supabase project (or approved alternative).
