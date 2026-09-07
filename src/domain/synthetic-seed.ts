import type { WorkoutPrescription } from './reference';

export const SYNTHETIC_M1_WORKOUT: WorkoutPrescription = {
  workoutId: 'synthetic-workout-001',
  programVersionRef: 'synthetic-program-v1',
  name: 'M1 Synthetic Upper Session',
  exercises: [
    {
      exerciseId: 'bench-press',
      order: 1,
      note: 'Synthetic development prescription. Empty Olympic bar is recorded as 20 kg / WARMUP.',
      sets: [
        { id: 'bp-wu-1', setType: 'WARMUP', targetLoadKg: 20, targetReps: 10, targetRpeMax: 5 },
        { id: 'bp-w-1', setType: 'WORKING', targetLoadKg: 50, targetReps: 5, targetRpeMax: 8 },
        { id: 'bp-w-2', setType: 'WORKING', targetLoadKg: 50, targetReps: 5, targetRpeMax: 8 },
        { id: 'bp-w-3', setType: 'WORKING', targetLoadKg: 50, targetReps: 5, targetRpeMax: 8 }
      ]
    },
    {
      exerciseId: 'lat-pulldown',
      order: 2,
      note: 'Synthetic cable-stack prescription.',
      sets: [
        { id: 'lp-w-1', setType: 'WORKING', targetLoadKg: 35, targetReps: 10, targetRpeMax: 8 },
        { id: 'lp-w-2', setType: 'WORKING', targetLoadKg: 35, targetReps: 10, targetRpeMax: 8 },
        { id: 'lp-w-3', setType: 'WORKING', targetLoadKg: 35, targetReps: 10, targetRpeMax: 8 }
      ]
    }
  ]
};
