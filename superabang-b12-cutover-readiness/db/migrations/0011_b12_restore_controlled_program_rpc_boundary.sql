-- B12 correction: preserve controlled lifecycle writes.
-- SECURITY INVOKER required direct table mutation privileges for authenticated clients,
-- which weakened the approved controlled-RPC boundary. Restore SECURITY DEFINER with
-- explicit auth.uid(), ownership and stale-proposal guards inside the existing RPCs,
-- and revoke direct writes again.
alter function public.bootstrap_current_program(uuid,jsonb) security definer;
alter function public.create_program_change_proposal(uuid,jsonb,uuid,jsonb,jsonb) security definer;
alter function public.activate_program_version(uuid) security definer;
revoke insert, update on public.program_version from authenticated;
revoke insert, update on public.recommendation_snapshot from authenticated;
grant select on public.program_version to authenticated;
grant select on public.recommendation_snapshot to authenticated;
