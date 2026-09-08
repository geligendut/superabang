import type { SetType } from './types';

export type EquipmentKind = 'BARBELL' | 'PLATE' | 'BENCH' | 'RACK' | 'CABLE';

export interface EquipmentReference {
  id: string;
  name: string;
  kind: EquipmentKind;
  loadKg?: number;
  quantity?: number;
  verification?: 'VERIFIED_USER_REPORTED' | 'DEVELOPMENT_ONLY';
  active: boolean;
}

export interface ExerciseReference {
  id: string;
  name: string;
  primaryEquipment: EquipmentKind[];
  loadModel: 'BARBELL_TOTAL' | 'STACK' | 'BODYWEIGHT' | 'OTHER';
  active: boolean;
}

export interface PrescribedSet {
  id: string;
  setType: SetType;
  targetReps: number;
  targetLoadKg?: number;
  targetRpeMax?: number;
}

export interface PrescribedExercise {
  exerciseId: string;
  order: number;
  sets: PrescribedSet[];
  note?: string;
}

export interface WorkoutPrescription {
  workoutId: string;
  programVersionRef: string;
  name: string;
  exercises: PrescribedExercise[];
}

export const EQUIPMENT_REFERENCE: EquipmentReference[] = [
  { id: 'olympic-bar-20', name: 'Olympic Barbell 20 kg', kind: 'BARBELL', loadKg: 20, verification: 'VERIFIED_USER_REPORTED', active: true },
  { id: 'microplate-0_5-pair', name: 'Microplate 0.5 kg', kind: 'PLATE', loadKg: 0.5, quantity: 2, verification: 'VERIFIED_USER_REPORTED', active: true },
  { id: 'flat-adjustable-bench', name: 'Bench', kind: 'BENCH', active: true },
  { id: 'squat-rack', name: 'Squat Rack', kind: 'RACK', active: true },
  { id: 'cable-station', name: 'Cable Station', kind: 'CABLE', active: true }
];

export const EXERCISE_REFERENCE: ExerciseReference[] = [
  { id: 'bench-press', name: 'Bench Press', primaryEquipment: ['BARBELL','BENCH','RACK'], loadModel: 'BARBELL_TOTAL', active: true },
  { id: 'lat-pulldown', name: 'Lat Pulldown', primaryEquipment: ['CABLE'], loadModel: 'STACK', active: true }
];

/**
 * Synthetic plate inventory for development only. Do not treat as Anton's canonical inventory.
 */
export const VERIFIED_INCREMENTAL_PLATE_INVENTORY = [
  { weightKg: 0.5, quantity: 2 }
];

export const SYNTHETIC_PLATE_INVENTORY = [
  { weightKg: 20, quantity: 2 },
  { weightKg: 10, quantity: 2 },
  { weightKg: 5, quantity: 2 },
  { weightKg: 2.5, quantity: 2 },
  { weightKg: 1.25, quantity: 2 }
];
