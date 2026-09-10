import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import type { WorkoutPrescription } from '@/src/domain/reference';
import { withTimeout } from '@/src/backend/async-timeout';
import { listActiveWorkouts, listWorkoutHistory } from '@/src/offline/workout-store';
import {
  isCanonicalProgramSnapshot,
  isWorkoutPrescription,
  selectCanonicalWorkout,
  type CanonicalProgramSnapshot,
} from './canonical-rotation';

const CURRENT_PROGRAM_CACHE_VERSION = 'v1';

export interface ProgramVersionRow {
  id: string;
  program_id: string;
  version: number;
  status: 'CURRENT'|'PLANNED'|'COMPLETED'|'SUPERSEDED'|'PAUSED'|'ABANDONED';
  effective_from: string;
  effective_to: string | null;
  prescription_snapshot: WorkoutPrescription | CanonicalProgramSnapshot | null;
  based_on_version_id: string | null;
  source_session_id: string | null;
  source_recommendation_id: string | null;
  change_summary: unknown;
}

export async function loadCurrentProgram(): Promise<ProgramVersionRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await withTimeout(
    supabase
      .from('program_version')
      .select('id,program_id,version,status,effective_from,effective_to,prescription_snapshot,based_on_version_id,source_session_id,source_recommendation_id,change_summary')
      .eq('status','CURRENT')
      .maybeSingle(),
    8_000,
    'Current program lookup',
  );
  if (error) throw error;
  return (data as ProgramVersionRow | null) ?? null;
}

export async function loadPlannedProgram(): Promise<ProgramVersionRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await withTimeout(
    supabase
      .from('program_version')
      .select('id,program_id,version,status,effective_from,effective_to,prescription_snapshot,based_on_version_id,source_session_id,source_recommendation_id,change_summary')
      .eq('status','PLANNED')
      .maybeSingle(),
    8_000,
    'Planned program lookup',
  );
  if (error) throw error;
  return (data as ProgramVersionRow | null) ?? null;
}

function cacheKey(ownerUserId: string) {
  return `superabang:${CURRENT_PROGRAM_CACHE_VERSION}:current-program:${ownerUserId}`;
}

function readCachedCurrentProgram(ownerUserId: string | null): ProgramVersionRow | null {
  if (!ownerUserId || typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(ownerUserId)) ?? 'null') as ProgramVersionRow | null;
  } catch {
    return null;
  }
}

function cacheCurrentProgram(ownerUserId: string | null, current: ProgramVersionRow) {
  if (!ownerUserId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(ownerUserId), JSON.stringify(current));
  } catch {
    // IndexedDB workout logging remains available if browser storage quota blocks this small cache.
  }
}

export async function resolveWorkoutPrescription(
  fallback: WorkoutPrescription,
  ownerUserId: string | null = null,
): Promise<WorkoutPrescription> {
  let current: ProgramVersionRow | null = null;
  const online = typeof navigator === 'undefined' || navigator.onLine;

  if (online) {
    try {
      current = await loadCurrentProgram();
      if (current) cacheCurrentProgram(ownerUserId, current);
    } catch {
      current = readCachedCurrentProgram(ownerUserId);
    }
  } else {
    current = readCachedCurrentProgram(ownerUserId);
  }

  if (!current) return fallback;
  if (isWorkoutPrescription(current.prescription_snapshot)) {
    return { ...current.prescription_snapshot, programVersionRef: current.id };
  }
  if (!isCanonicalProgramSnapshot(current.prescription_snapshot)) return fallback;

  const [active, history] = await Promise.all([
    listActiveWorkouts(ownerUserId),
    listWorkoutHistory(ownerUserId),
  ]);
  const belongsToCurrent = (row: { prescribedSnapshot: WorkoutPrescription }) =>
    row.prescribedSnapshot.programVersionRef === current.id;
  const activeWorkoutId = active.find(belongsToCurrent)?.prescribedSnapshot.workoutId;
  const lastCompletedWorkoutId = history.find(belongsToCurrent)?.prescribedSnapshot.workoutId;
  return selectCanonicalWorkout(
    current.prescription_snapshot,
    current.id,
    activeWorkoutId,
    lastCompletedWorkoutId,
  );
}
