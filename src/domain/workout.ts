import type { WorkoutPrescription } from './reference';
import type { WorkoutSetLog } from './types';

export interface WorkoutExecutionSummary {
  prescribedSets: number;
  loggedSets: number;
  completedPrescribedSets: number;
  isComplete: boolean;
}

export function summarizeExecution(prescription: WorkoutPrescription, sets: WorkoutSetLog[]): WorkoutExecutionSummary {
  const prescribedSets = prescription.exercises.reduce((n, e) => n + e.sets.length, 0);
  const completedPrescribedSets = Math.min(sets.length, prescribedSets);
  return {
    prescribedSets,
    loggedSets: sets.length,
    completedPrescribedSets,
    isComplete: sets.length >= prescribedSets
  };
}

export function nextPrescribedSet(prescription: WorkoutPrescription, sets: WorkoutSetLog[]) {
  const flat = prescription.exercises.flatMap(exercise =>
    exercise.sets.map(set => ({ exerciseId: exercise.exerciseId, exerciseOrder: exercise.order, ...set }))
  );
  return flat[sets.length];
}
