# B6 — Body & Progress Foundation

Status: IMPLEMENTED / PENDING LIVE DOGFOOD

Scope is intentionally narrow: authenticated manual longitudinal observations for weight and waist, recent history, and per-metric latest-vs-prior change. This does not redesign M1 training semantics and does not make the app database canonical.

## Data semantics
- Weight and waist are independent nullable observations; at least one must be present.
- Missing values are never imputed.
- Source is explicitly `MANUAL` in B6 foundation.
- Engineering input bounds prevent obvious data-entry errors; they are not medical thresholds.
- RLS scopes all rows to `auth.uid()`.
- Trend is descriptive only: latest observation minus prior observation containing the same metric. No health conclusion is inferred from a single change.

## Deferred
- target bands/staged goals
- rolling 7/30-day trend smoothing
- charts
- Apple Health ingestion
- measurement edit/audit semantics
- canonical cutover/reconciliation with Health & Fitness Master Record
