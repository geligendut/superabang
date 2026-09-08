import type { WorkoutPrescription } from './reference.ts';
import { EXERCISE_REFERENCE, VERIFIED_INCREMENTAL_PLATE_INVENTORY } from './reference.ts';
import { planBarbellLoad } from './load-feasibility.ts';
import type { ExposureAction } from './safety-decision.ts';
import type { OfflineWorkoutSession } from '../offline/workout-store.ts';

export type ProgressionDisposition = 'BLOCK'|'HOLD'|'REPEAT'|'PROGRESS_CANDIDATE';

export interface ExerciseProgressionDecision {
  exerciseId: string;
  disposition: ProgressionDisposition;
  currentTargetLoadKg?: number;
  suggestedLoadKg?: number;
  completedWorkingSets: number;
  prescribedWorkingSets: number;
  maxWorkingRpe?: number;
  reason: string;
  evidenceRefs: string[];
}

export interface TrainingProgressionAssessment {
  sessionId: string;
  ruleVersion: 'b7-progression-0.1.0';
  ruleStatus: 'PROVISIONAL';
  globalSafetyAction: ExposureAction;
  exercises: ExerciseProgressionDecision[];
}

export const B7_PROGRESSION_POLICY = {
  version: 'b7-progression-0.1.0' as const,
  status: 'PROVISIONAL' as const,
  minimumVerifiedBarbellIncrementKg: 1.0,
};

function safetyAction(session: OfflineWorkoutSession): ExposureAction {
  const decision = session.recommendation?.decision as { action?: ExposureAction } | undefined;
  return decision?.action ?? 'HOLD_LOAD';
}

function workingPrescription(prescription: WorkoutPrescription, exerciseId: string) {
  return prescription.exercises.find(e => e.exerciseId === exerciseId)?.sets.filter(s => s.setType === 'WORKING') ?? [];
}

export function assessTrainingProgression(session: OfflineWorkoutSession): TrainingProgressionAssessment {
  const globalSafetyAction = safetyAction(session);
  const exercises = session.prescribedSnapshot.exercises.map(exercise => {
    const prescribed = workingPrescription(session.prescribedSnapshot, exercise.exerciseId);
    const actual = session.sets.filter(s => s.exerciseId === exercise.exerciseId && s.setType === 'WORKING');
    const evidenceRefs = actual.map(s => `set:${s.id}`);
    const targetLoads = prescribed.map(s => s.targetLoadKg).filter((v): v is number => v !== undefined);
    const currentTargetLoadKg = targetLoads.length && targetLoads.every(v => v === targetLoads[0]) ? targetLoads[0] : undefined;
    const rpes = actual.map(s => s.rpe).filter((v): v is number => v !== undefined);
    const maxWorkingRpe = rpes.length ? Math.max(...rpes) : undefined;
    const targetRpeMaxes = prescribed.map(s => s.targetRpeMax).filter((v): v is number => v !== undefined);
    const strictestTargetRpeMax = targetRpeMaxes.length ? Math.min(...targetRpeMaxes) : undefined;

    const base = {
      exerciseId: exercise.exerciseId,
      currentTargetLoadKg,
      completedWorkingSets: actual.length,
      prescribedWorkingSets: prescribed.length,
      maxWorkingRpe,
      evidenceRefs,
    };

    if (globalSafetyAction === 'BLOCK_PROGRESSION') {
      return { ...base, disposition: 'BLOCK' as const, reason: 'Session safety gate blocks progression. No load increase is proposed.' };
    }
    if (globalSafetyAction === 'HOLD_LOAD') {
      return { ...base, disposition: 'HOLD' as const, reason: 'Session safety/technique gate requires load to be held.' };
    }
    if (!prescribed.length) {
      return { ...base, disposition: 'REPEAT' as const, reason: 'No working-set prescription is available for progression assessment.' };
    }
    if (actual.length < prescribed.length) {
      return { ...base, disposition: 'REPEAT' as const, reason: 'Not all prescribed working sets were completed.' };
    }

    const repsMet = prescribed.every((target, index) => (actual[index]?.reps ?? 0) >= target.targetReps);
    if (!repsMet) {
      return { ...base, disposition: 'REPEAT' as const, reason: 'At least one working set missed the prescribed repetition target.' };
    }

    const loadMet = currentTargetLoadKg === undefined || actual.every(set => set.loadKg >= currentTargetLoadKg);
    if (!loadMet) {
      return { ...base, disposition: 'REPEAT' as const, reason: 'At least one working set was performed below the prescribed target load.' };
    }

    if (strictestTargetRpeMax !== undefined && maxWorkingRpe !== undefined && maxWorkingRpe > strictestTargetRpeMax) {
      return { ...base, disposition: 'HOLD' as const, reason: 'Working-set RPE exceeded the prescribed ceiling; automatic load increase is withheld.' };
    }

    let suggestedLoadKg: number | undefined;
    let reason = 'Working sets met load, reps, and prescribed RPE ceiling with no deterministic safety block; progression is eligible for review.';
    const reference = EXERCISE_REFERENCE.find(r => r.id === exercise.exerciseId);
    if (reference?.loadModel === 'BARBELL_TOTAL' && currentTargetLoadKg !== undefined) {
      const incrementKg = B7_PROGRESSION_POLICY.minimumVerifiedBarbellIncrementKg;
      const incrementPlan = planBarbellLoad(20 + incrementKg, 20, VERIFIED_INCREMENTAL_PLATE_INVENTORY);
      if (incrementPlan.feasible) {
        const candidate = currentTargetLoadKg + incrementKg;
        suggestedLoadKg = candidate;
        reason = `Eligible barbell progression candidate: ${candidate} kg total load (+${incrementKg} kg). The increment is equipment-feasible from the verified 0.5 kg microplate pair, but progression magnitude remains a PROVISIONAL decision rule.`;
      } else {
        reason = 'Progression is eligible, but no next barbell increment is supported by the currently verified incremental plate inventory.';
      }
    } else if (reference?.loadModel === 'STACK') {
      reason = 'Progression is eligible, but no cable-stack increment has been configured; exact next load is intentionally not invented.';
    }

    return { ...base, disposition: 'PROGRESS_CANDIDATE' as const, suggestedLoadKg, reason };
  });

  return {
    sessionId: session.sessionId,
    ruleVersion: B7_PROGRESSION_POLICY.version,
    ruleStatus: B7_PROGRESSION_POLICY.status,
    globalSafetyAction,
    exercises,
  };
}
