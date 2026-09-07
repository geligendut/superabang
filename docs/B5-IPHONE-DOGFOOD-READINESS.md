# B5 — iPhone Dogfood Readiness

Status: DEPLOYMENT READY IN CODE / BLOCKED ON LIVE BACKEND + DEPENDENCY INSTALL + DEPLOYMENT VERIFICATION

## Acceptance path
The first live M1 acceptance run must prove this exact sequence:

1. Open the deployed PWA on iPhone and add it to Home Screen.
2. Sign in to the private dogfood account.
3. Open the prescribed synthetic workout.
4. Start a new UUID-backed session.
5. Record the 20 kg Olympic empty-bar warm-up as `20 kg / WARMUP`.
6. Record working sets and RPE.
7. Record technique separately from symptom observation.
8. Disable connectivity during the active session.
9. Continue logging sets and complete the session locally.
10. Close/reopen the installed PWA and verify local history remains available.
11. Restore connectivity and run sync.
12. Verify the same completed session appears exactly once in Supabase.
13. Re-run sync and verify idempotency.
14. Verify the next-exposure recommendation cannot override a deterministic safety block.

## Security / privacy checks before actual Health data
- RLS negative test with a second synthetic user.
- No service-role secret in source, browser storage, or client bundle.
- Exact user identity derives from Supabase Auth, not client payload.
- Synthetic data only until the negative RLS test passes.
- Existing Health workflow and Health & Fitness Master Record v0.1 remain authoritative.

## Deployment dependencies
- Supabase plugin/project access or manually-created private Supabase project.
- Apply migrations 0001–0003.
- Configure Vercel environment variables.
- Install npm dependencies and obtain a clean `next build`.
- Deploy preview, execute smoke test, then promote only after M1 acceptance.
