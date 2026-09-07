# Implementation Kickoff — Fitness App Dogfood
Date: 2026-09-07

## Authoritative implementation constraints used
The kickoff uses the CURRENT baseline names and critical invariants supplied in the implementation authorization, without redesigning them. Existing Health workflow + Health & Fitness Master Record v0.1 remains authoritative during parallel dogfood.

## Build sequence
B0 Foundation → B1 Domain/reference seed → B2 Workout Core → B3 Safety & Decisioning → B4 Migration/Reconciliation → later milestone domains.

## Immediate M1 acceptance path
1. Installable iPhone PWA shell.
2. Prescribed workout read model.
3. Start/resume active session.
4. Log 20 kg empty-bar WARMUP + working sets, reps/RPE.
5. Separate technique and symptom capture.
6. Finish session without connectivity dependency.
7. Deterministic safety gate produces next-exposure recommendation.
8. Persist immutable completed history remotely after sync.
9. Re-open history.
10. Prove offline logging and reconnection sync.

## Implementation-risk note
Detailed prior baseline artifacts were not returned by Project Files/Drive search in this kickoff session. Therefore B0 only implements decisions explicitly restated in the current authorization or non-material scaffolding. Any rule threshold or data-contract detail not explicitly available is treated as provisional until reconciled, not as a baseline change.
