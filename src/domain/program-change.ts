import type { WorkoutPrescription } from './reference';
import type { TrainingProgressionAssessment } from './training-progression';

export interface ProgramLoadChange {
  exerciseId: string;
  fromLoadKg: number;
  toLoadKg: number;
  setIds: string[];
}

export interface ProgramChangeDraft {
  status: 'NO_CHANGE' | 'PROPOSABLE';
  prescription: WorkoutPrescription;
  changes: ProgramLoadChange[];
  reason: string;
  evidenceRefs: string[];
}

function clonePrescription(p: WorkoutPrescription): WorkoutPrescription {
  return {
    ...p,
    exercises: p.exercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(set => ({ ...set })),
    })),
  };
}

export function buildProgramChangeDraft(
  current: WorkoutPrescription,
  assessment: TrainingProgressionAssessment
): ProgramChangeDraft {
  const next = clonePrescription(current);

  if (assessment.globalSafetyAction !== 'ELIGIBLE_TO_PROGRESS') {
    return {
      status: 'NO_CHANGE',
      prescription: next,
      changes: [],
      reason: `Safety action ${assessment.globalSafetyAction} prevents program progression.`,
      evidenceRefs: assessment.exercises.flatMap(e => e.evidenceRefs),
    };
  }

  const changes: ProgramLoadChange[] = [];
  for (const decision of assessment.exercises) {
    if (decision.disposition !== 'PROGRESS_CANDIDATE' || decision.suggestedLoadKg === undefined) continue;
    const exercise = next.exercises.find(e => e.exerciseId === decision.exerciseId);
    if (!exercise) continue;

    const working = exercise.sets.filter(s => s.setType === 'WORKING' && s.targetLoadKg !== undefined);
    if (!working.length) continue;

    const fromLoads = [...new Set(working.map(s => s.targetLoadKg as number))];
    if (fromLoads.length !== 1) continue;
    const fromLoadKg = fromLoads[0];
    if (decision.suggestedLoadKg <= fromLoadKg) continue;

    for (const set of working) set.targetLoadKg = decision.suggestedLoadKg;
    changes.push({
      exerciseId: decision.exerciseId,
      fromLoadKg,
      toLoadKg: decision.suggestedLoadKg,
      setIds: working.map(s => s.id),
    });
  }

  return {
    status: changes.length ? 'PROPOSABLE' : 'NO_CHANGE',
    prescription: next,
    changes,
    reason: changes.length
      ? 'Eligible load changes are available for explicit review. No program mutation has occurred.'
      : 'No deterministic load change is available from this exposure.',
    evidenceRefs: assessment.exercises.flatMap(e => e.evidenceRefs),
  };
}
