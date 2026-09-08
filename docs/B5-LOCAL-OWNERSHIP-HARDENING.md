# B5 Local Ownership Hardening

Status: IMPLEMENTED LOCALLY / AWAITING DEPLOYMENT VERIFICATION

## Trigger
Real-device dogfood showed that IndexedDB history created under one Supabase account remained visible after switching to another account on the same iPhone. Server RLS was not implicated; the defect was in the local-first ownership boundary.

## Correction
- Every newly created local workout session stores `ownerUserId` from the locally persisted Supabase session; signed-out/local-only workouts use `null`.
- Active-workout lookup and workout history are filtered by the current local owner.
- Outbox operations persist the same owner id.
- Sync requires an authenticated local owner and processes only that owner's outbox operations.
- The sync processor independently blocks owner mismatch before transport.
- History sync-state updates also verify local ownership.
- IndexedDB schema version advances to 4 and adds non-unique owner indexes.

## Legacy local rows
Rows created before this hardening have no `ownerUserId`. They are deliberately quarantined: they are not silently claimed by the account that happens to open the upgraded app, are not displayed to any account, and are not eligible for sync. Existing server-side dogfood evidence remains unchanged.

This is intentional to avoid mis-attributing historical execution across accounts. A future authenticated server-history feature may reconcile or rehydrate those records if needed.

## Verification gate
1. Signed-in Account A creates a new synthetic session and completes or safety-stops it.
2. Account A History shows that session.
3. Sign out; sign in Account B on the same device.
4. Account B History must not show Account A's new session.
5. Account B sync must not send Account A's outbox payload.
6. Return to Account A; its new local session remains visible and syncable.
7. Server RLS isolation is verified independently.
