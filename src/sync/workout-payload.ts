import type { OfflineWorkoutSession } from '../offline/workout-store';

export interface WorkoutSyncPayload extends OfflineWorkoutSession {}

export function isWorkoutSyncPayload(value: unknown): value is WorkoutSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkoutSyncPayload>;
  return Boolean(
    typeof v.sessionId === 'string' &&
    v.sessionId.length > 0 &&
    v.prescribedSnapshot &&
    typeof v.startedAt === 'string' &&
    Array.isArray(v.sets) &&
    Array.isArray(v.symptoms) &&
    Array.isArray(v.techniques)
  );
}

export function assertWorkoutSyncPayload(value: unknown): WorkoutSyncPayload {
  if (!isWorkoutSyncPayload(value)) throw new Error('INVALID_WORKOUT_SYNC_PAYLOAD');
  return value;
}
