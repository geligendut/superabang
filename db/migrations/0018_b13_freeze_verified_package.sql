-- Freeze legacy browser staging entry points after B13 technical verification.
-- Any future restaging must be an explicit reviewed migration; readiness remains read-only.

revoke all on function public.stage_health_master_reconciliation_v1(text,text,jsonb,jsonb)
from public, anon, authenticated;

revoke all on function public.stage_b13_execution_candidate_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)
from public, anon, authenticated;
