import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWorkoutSyncPayload, isWorkoutSyncPayload } from '../src/sync/workout-payload.ts';

const valid = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  prescribedSnapshot: { workoutId: 'w1', programVersionRef: 'p1', name: 'Synthetic', exercises: [] },
  startedAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:10:00.000Z',
  syncState: 'PENDING',
  sets: [],
  symptoms: [],
  techniques: [],
};

test('workout sync payload requires stable session and execution arrays', () => {
  assert.equal(isWorkoutSyncPayload(valid), true);
  assert.equal(isWorkoutSyncPayload({ ...valid, sets: undefined }), false);
});

test('invalid workout payload fails closed', () => {
  assert.throws(() => assertWorkoutSyncPayload({ sessionId: 'x' }), /INVALID_WORKOUT_SYNC_PAYLOAD/);
});
