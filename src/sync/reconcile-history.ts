'use client';

import { getSupabaseBrowserClient } from '../backend/supabase-browser';
import { reconcileHistorySnapshotFromServer } from '../offline/workout-store';
import { mapServerWorkoutSession, type ServerWorkoutSessionRow } from './server-history';
import { withTimeout } from '../backend/async-timeout';

const SERVER_HISTORY_SELECT = `
  id,
  user_id,
  prescribed_snapshot,
  started_at,
  completed_at,
  completion_status,
  updated_at,
  workout_set_log(id,session_id,exercise_id,sequence,load_kg,reps,rpe,set_type,recorded_at),
  symptom_observation(id,session_id,exercise_id,severity,location,onset,trigger,recorded_at),
  technique_observation(id,session_id,exercise_id,flag,note,recorded_at),
  recommendation_snapshot(id,session_id,rule_version,input_snapshot,decision,evidence_refs,created_at,accepted_at,performed_at)
`;

export interface HistoryReconciliationResult {
  fetched: number;
  reconciled: number;
}

/**
 * Rebuilds account-scoped completed local history from the authenticated user's RLS-filtered server history.
 * This is recovery/cache reconciliation only; it does not make the app database the canonical Health record.
 */
export async function reconcileAuthenticatedServerHistory(): Promise<HistoryReconciliationResult> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    3_000,
    'History session lookup',
  );
  if (sessionError) throw sessionError;
  const ownerUserId = sessionData.session?.user.id;
  if (!ownerUserId) throw new Error('SIGN_IN_REQUIRED_FOR_HISTORY_RECONCILIATION');

  const { data, error } = await withTimeout(
    supabase
      .from('workout_session')
      .select(SERVER_HISTORY_SELECT)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }),
    8_000,
    'Server history lookup',
  );

  if (error) throw new Error(`SERVER_HISTORY_FETCH_FAILED:${error.message}`);

  const rows = (data ?? []) as unknown as ServerWorkoutSessionRow[];
  let reconciled = 0;
  for (const row of rows) {
    const snapshot = mapServerWorkoutSession(row, ownerUserId);
    await reconcileHistorySnapshotFromServer(snapshot, ownerUserId);
    reconciled += 1;
  }

  return { fetched: rows.length, reconciled };
}
