# B12 — Hardening & Cutover Readiness

Status: implementation candidate. Canonical Health cutover is NOT STARTED.

Verified production findings before this patch:
- all ten public application tables have RLS enabled;
- each table has an authenticated self/ownership policy using auth.uid();
- direct authenticated INSERT/UPDATE on program_version and recommendation_snapshot is revoked;
- program lifecycle writes remain behind guarded RPCs;
- Vercel production had no error/fatal runtime logs in the prior 24h at review time;
- Supabase advisor still warns about the intentionally callable SECURITY DEFINER program lifecycle RPCs and account-level leaked-password protection being disabled.

This patch adds `/cutover-readiness`, exact-one-CURRENT and unresolved-PLANNED checks, local/server completed-workout reconciliation, account-scoped JSON export, and an explicit PENDING Health canonical reconciliation gate.
