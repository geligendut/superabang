import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramChangeDraft } from '../src/domain/program-change.ts';

const prescription = {
  workoutId: 'w1',
  programVersionRef: 'v1',
  name: 'Test',
  exercises: [{
    exerciseId: 'bench-press', order: 1,
    sets: [
      { id:'wu', setType:'WARMUP', targetReps:10, targetLoadKg:20, targetRpeMax:5 },
      { id:'a', setType:'WORKING', targetReps:5, targetLoadKg:50, targetRpeMax:8 },
      { id:'b', setType:'WORKING', targetReps:5, targetLoadKg:50, targetRpeMax:8 },
      { id:'c', setType:'WORKING', targetReps:5, targetLoadKg:50, targetRpeMax:8 },
    ]
  }]
};

test('safety block produces no program change', () => {
  const assessment = {
    sessionId:'s1', ruleVersion:'b7-progression-0.1.0', ruleStatus:'PROVISIONAL',
    globalSafetyAction:'BLOCK_PROGRESSION',
    exercises:[{exerciseId:'bench-press', disposition:'BLOCK', currentTargetLoadKg:50, completedWorkingSets:0, prescribedWorkingSets:3, reason:'blocked', evidenceRefs:['set:x']}]
  };
  const draft = buildProgramChangeDraft(prescription, assessment);
  assert.equal(draft.status, 'NO_CHANGE');
  assert.equal(draft.prescription.exercises[0].sets[1].targetLoadKg, 50);
});

test('eligible progression changes only working-set load', () => {
  const assessment = {
    sessionId:'s2', ruleVersion:'b7-progression-0.1.0', ruleStatus:'PROVISIONAL',
    globalSafetyAction:'ELIGIBLE_TO_PROGRESS',
    exercises:[{exerciseId:'bench-press', disposition:'PROGRESS_CANDIDATE', currentTargetLoadKg:50, suggestedLoadKg:51, completedWorkingSets:3, prescribedWorkingSets:3, maxWorkingRpe:8, reason:'eligible', evidenceRefs:['set:a','set:b','set:c']}]
  };
  const draft = buildProgramChangeDraft(prescription, assessment);
  assert.equal(draft.status, 'PROPOSABLE');
  assert.equal(draft.prescription.exercises[0].sets[0].targetLoadKg, 20);
  assert.deepEqual(draft.prescription.exercises[0].sets.slice(1).map(s=>s.targetLoadKg), [51,51,51]);
  assert.equal(prescription.exercises[0].sets[1].targetLoadKg, 50, 'input remains immutable');
});

test('eligible assessment without exact suggested load does not invent change', () => {
  const assessment = {
    sessionId:'s3', ruleVersion:'b7-progression-0.1.0', ruleStatus:'PROVISIONAL',
    globalSafetyAction:'ELIGIBLE_TO_PROGRESS',
    exercises:[{exerciseId:'bench-press', disposition:'PROGRESS_CANDIDATE', currentTargetLoadKg:50, completedWorkingSets:3, prescribedWorkingSets:3, reason:'eligible', evidenceRefs:[]}]
  };
  const draft = buildProgramChangeDraft(prescription, assessment);
  assert.equal(draft.status, 'NO_CHANGE');
});
