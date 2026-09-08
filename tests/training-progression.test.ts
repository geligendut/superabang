import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrainingProgression } from '../src/domain/training-progression.ts';
import { SYNTHETIC_M1_WORKOUT } from '../src/domain/synthetic-seed.ts';
import type { OfflineWorkoutSession } from '../src/offline/workout-store.ts';

function session(action: 'BLOCK_PROGRESSION'|'HOLD_LOAD'|'ELIGIBLE_TO_PROGRESS', rpe = 8, reps = 5): OfflineWorkoutSession {
  const now = new Date().toISOString();
  return {
    sessionId: 's1', ownerUserId: 'u1', prescribedSnapshot: SYNTHETIC_M1_WORKOUT,
    startedAt: now, updatedAt: now, completedAt: now, completionStatus: 'COMPLETED', syncState: 'SYNCED',
    sets: [
      { id:'w', sessionId:'s1', exerciseId:'bench-press', sequence:1, loadKg:20, reps:10, rpe:5, setType:'WARMUP', recordedAt:now },
      ...[1,2,3].map(i => ({ id:`b${i}`, sessionId:'s1', exerciseId:'bench-press', sequence:i+1, loadKg:50, reps, rpe, setType:'WORKING' as const, recordedAt:now })),
      ...[1,2,3].map(i => ({ id:`l${i}`, sessionId:'s1', exerciseId:'lat-pulldown', sequence:i, loadKg:35, reps:10, rpe, setType:'WORKING' as const, recordedAt:now }))
    ], symptoms:[], techniques:[],
    recommendation: { id:'r1', ruleVersion:'m1-safety-0.2.0', createdAt:now, inputSnapshot:{}, decision:{action}, evidenceRefs:[] }
  };
}

test('global safety block prevents every exercise progression', () => {
  const result = assessTrainingProgression(session('BLOCK_PROGRESSION'));
  assert.ok(result.exercises.every(e => e.disposition === 'BLOCK'));
});

test('global hold prevents automatic progression', () => {
  const result = assessTrainingProgression(session('HOLD_LOAD'));
  assert.ok(result.exercises.every(e => e.disposition === 'HOLD'));
});

test('eligible bench session uses the smallest verified microplate-supported increment', () => {
  const bench = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS')).exercises.find(e => e.exerciseId === 'bench-press');
  assert.equal(bench?.disposition, 'PROGRESS_CANDIDATE');
  assert.equal(bench?.suggestedLoadKg, 51);
});

test('verified microplate pair is represented as +1 kg total barbell capability', () => {
  const bench = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS')).exercises.find(e => e.exerciseId === 'bench-press');
  assert.match(bench?.reason ?? '', /0\.5 kg microplate pair/);
});

test('cable stack exact increment is not invented', () => {
  const cable = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS')).exercises.find(e => e.exerciseId === 'lat-pulldown');
  assert.equal(cable?.disposition, 'PROGRESS_CANDIDATE');
  assert.equal(cable?.suggestedLoadKg, undefined);
});

test('RPE above prescribed ceiling holds load even when global safety action is eligible', () => {
  const result = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS', 8.5));
  assert.ok(result.exercises.every(e => e.disposition === 'HOLD'));
});

test('missed bench reps produce repeat rather than progression', () => {
  const bench = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS', 8, 4)).exercises.find(e => e.exerciseId === 'bench-press');
  assert.equal(bench?.disposition, 'REPEAT');
});

test('progression policy remains explicitly provisional', () => {
  const result = assessTrainingProgression(session('ELIGIBLE_TO_PROGRESS'));
  assert.equal(result.ruleStatus, 'PROVISIONAL');
  assert.equal(result.ruleVersion, 'b7-progression-0.1.0');
});
