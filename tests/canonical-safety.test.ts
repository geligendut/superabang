import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPersistentSafetyBlocks, blockProgressionWhenSafetyUnavailable } from '../src/program/canonical-safety.ts';
import type { TrainingProgressionAssessment } from '../src/domain/training-progression.ts';

const assessment: TrainingProgressionAssessment = {
  sessionId: 'dogfood-session',
  ruleVersion: 'b7-progression-0.1.0',
  ruleStatus: 'PROVISIONAL',
  globalSafetyAction: 'ELIGIBLE_TO_PROGRESS',
  exercises: [{
    exerciseId: 'bench-press',
    disposition: 'PROGRESS_CANDIDATE',
    currentTargetLoadKg: 51,
    suggestedLoadKg: 52,
    completedWorkingSets: 3,
    prescribedWorkingSets: 3,
    maxWorkingRpe: 8,
    reason: 'eligible',
    evidenceRefs: ['set:1'],
  }],
};

test('persistent canonical bench symptom block overrides progression', () => {
  const result = applyPersistentSafetyBlocks(assessment, [{
    sourceKey: 'BENCH-55KG-20260906',
    exercise: 'Flat Barbell Bench Press',
    triggerLoadKg: 55,
    location: 'upper-left trapezius / superior scapular area',
    recurrence: true,
  }]);
  assert.equal(result.globalSafetyAction, 'BLOCK_PROGRESSION');
  assert.equal(result.exercises[0].disposition, 'BLOCK');
  assert.equal(result.exercises[0].suggestedLoadKg, undefined);
});

test('unavailable persistent safety state fails closed', () => {
  const result = blockProgressionWhenSafetyUnavailable(assessment);
  assert.equal(result.globalSafetyAction, 'BLOCK_PROGRESSION');
  assert.equal(result.exercises[0].disposition, 'BLOCK');
  assert.equal(result.exercises[0].suggestedLoadKg, undefined);
});
