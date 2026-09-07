import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_M1_WORKOUT } from '../src/domain/synthetic-seed.ts';
import { nextPrescribedSet, summarizeExecution } from '../src/domain/workout.ts';
import type { WorkoutSetLog } from '../src/domain/types.ts';

test('first prescribed exposure is a 20kg warmup', () => {
  const next = nextPrescribedSet(SYNTHETIC_M1_WORKOUT, []);
  assert.equal(next?.setType, 'WARMUP');
  assert.equal(next?.targetLoadKg, 20);
});

test('execution summary does not claim complete before all prescribed sets are logged', () => {
  const sets: WorkoutSetLog[] = [{ id:'1', sessionId:'s', exerciseId:'bench-press', sequence:1, loadKg:20, reps:10, rpe:5, setType:'WARMUP', recordedAt:new Date().toISOString() }];
  const summary = summarizeExecution(SYNTHETIC_M1_WORKOUT, sets);
  assert.equal(summary.isComplete, false);
  assert.equal(summary.loggedSets, 1);
  assert.equal(summary.prescribedSets, 7);
});
