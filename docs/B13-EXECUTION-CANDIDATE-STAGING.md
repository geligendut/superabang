# B13 Execution Candidate Staging

This step stages and verifies a non-active canonical program candidate from HLT-PRG-0001, four validated Health training sessions, and accepted nutrition evidence.

Safety boundary:
- activation_allowed = false;
- executable_prescription is present for deterministic comparison, while activation remains disallowed;
- numeric starting loads that are not authoritative remain unresolved;
- BENCH-55KG-20260906 is carried as ACTIVE_BLOCK;
- no program_version CURRENT row is changed;
- no source workout is imported or rewritten in this step.

Historical evidence contains 4 validated source sessions / 72 source rows with digests and source provenance. It remains in staging: no source session is represented as accepted or performed app execution.

Nutrition staging contains 32 accepted source observations. `SELECTIVE_SAMPLE`, `ESTIMATED`, confidence, missing values and source rows are preserved. No staged record is imported into `nutrition_meal`.

The readiness function checks these counts and invariants against the live owner-scoped state. Technical verification sets the reconciliation batch's `technical_status` to `READY`; the workflow status remains `DRAFT` until explicit cutover approval.
