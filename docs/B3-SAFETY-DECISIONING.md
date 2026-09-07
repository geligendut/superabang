# B3 — Safety & Decisioning
Status: IMPLEMENTED / LOCALLY VERIFIED for M1 alpha contract.

## Implemented
- Deterministic rule engine runs before any AI orchestration.
- Precedence is explicit: symptom safety block > technique hold > high-RPE hold > eligible.
- A blocked decision cannot be downgraded by lower-priority rules.
- Session-level assessment uses maximum symptom severity, maximum logged RPE, and any technique caution across the session.
- Recommendation provenance includes set, symptom, and technique evidence references.
- Early completion is permitted only as `STOPPED_FOR_SAFETY` when the deterministic gate returns `BLOCK_PROGRESSION`; missing prescribed sets remain missing.

## Important limitation
The numeric M1 thresholds remain `PROVISIONAL`. They are implementation scaffolding, not approved clinical guidance and not a replacement for the approved safety matrix. No baseline is changed by this implementation.
