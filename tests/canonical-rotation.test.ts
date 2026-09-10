import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanonicalProgramSnapshot } from '../src/program/canonical-rotation.ts';
import { isCanonicalProgramSnapshot, selectCanonicalWorkout } from '../src/program/canonical-rotation.ts';

const snapshot: CanonicalProgramSnapshot = {
  schemaVersion: 'canonical-program-candidate-0.1.0',
  sourceProgramId: 'HLT-PRG-0001',
  rotation: ['Day A', 'Day B', 'Day C'],
  workouts: ['A', 'B', 'C'].map(day => ({
    day: `Day ${day}`,
    workoutId: `canonical-day-${day.toLowerCase()}`,
    name: `Day ${day}`,
    exercises: [{ exerciseId: 'bench-press', order: 1, sets: [{ id: `${day}-1`, setType: 'WORKING', targetReps: 5 }] }],
  })),
};

test('recognizes and materializes a canonical rotation snapshot', () => {
  assert.equal(isCanonicalProgramSnapshot(snapshot), true);
  const selected = selectCanonicalWorkout(snapshot, 'version-1');
  assert.equal(selected.workoutId, 'canonical-day-a');
  assert.equal(selected.programVersionRef, 'version-1');
});

test('resumes an active canonical day instead of advancing', () => {
  const selected = selectCanonicalWorkout(snapshot, 'version-1', 'canonical-day-b', 'canonical-day-a');
  assert.equal(selected.workoutId, 'canonical-day-b');
});

test('advances and wraps only after completed canonical sessions', () => {
  assert.equal(selectCanonicalWorkout(snapshot, 'version-1', undefined, 'canonical-day-a').workoutId, 'canonical-day-b');
  assert.equal(selectCanonicalWorkout(snapshot, 'version-1', undefined, 'canonical-day-c').workoutId, 'canonical-day-a');
});
