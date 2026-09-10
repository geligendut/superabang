import type { WorkoutPrescription } from '@/src/domain/reference';

export interface CanonicalProgramSnapshot {
  schemaVersion: 'canonical-program-candidate-0.1.0';
  sourceProgramId: string;
  rotation: string[];
  workouts: Array<Omit<WorkoutPrescription, 'programVersionRef'> & { day: string }>;
  [key: string]: unknown;
}

export function isWorkoutPrescription(value: unknown): value is WorkoutPrescription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkoutPrescription>;
  return typeof candidate.workoutId === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.exercises);
}

export function isCanonicalProgramSnapshot(value: unknown): value is CanonicalProgramSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CanonicalProgramSnapshot>;
  return candidate.schemaVersion === 'canonical-program-candidate-0.1.0'
    && Array.isArray(candidate.rotation)
    && candidate.rotation.length > 0
    && Array.isArray(candidate.workouts)
    && candidate.workouts.length > 0
    && candidate.workouts.every(workout => isWorkoutPrescription(workout) && typeof workout.day === 'string');
}

function materialize(
  snapshot: CanonicalProgramSnapshot,
  programVersionRef: string,
  index: number,
): WorkoutPrescription {
  const workout = snapshot.workouts[index];
  return {
    workoutId: workout.workoutId,
    programVersionRef,
    name: workout.name,
    exercises: workout.exercises,
  };
}

export function selectCanonicalWorkout(
  snapshot: CanonicalProgramSnapshot,
  programVersionRef: string,
  activeWorkoutId?: string,
  lastCompletedWorkoutId?: string,
): WorkoutPrescription {
  if (activeWorkoutId) {
    const activeIndex = snapshot.workouts.findIndex(workout => workout.workoutId === activeWorkoutId);
    if (activeIndex >= 0) return materialize(snapshot, programVersionRef, activeIndex);
  }

  const completedIndex = lastCompletedWorkoutId
    ? snapshot.workouts.findIndex(workout => workout.workoutId === lastCompletedWorkoutId)
    : -1;
  const nextIndex = completedIndex >= 0 ? (completedIndex + 1) % snapshot.workouts.length : 0;
  return materialize(snapshot, programVersionRef, nextIndex);
}
