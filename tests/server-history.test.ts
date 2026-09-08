import assert from 'node:assert/strict';
import test from 'node:test';
import { mapServerWorkoutSession, type ServerWorkoutSessionRow } from '../src/sync/server-history.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

function serverRow(): ServerWorkoutSessionRow {
  return {
    id: sessionId,
    user_id: owner,
    prescribed_snapshot: { workoutId: 'w1', programVersionRef: 'p1', name: 'Server Recovery', exercises: [] },
    started_at: '2026-09-07T16:31:00.000Z',
    completed_at: '2026-09-07T16:38:00.000Z',
    completion_status: 'COMPLETED',
    updated_at: '2026-09-07T16:40:00.000Z',
    workout_set_log: [{
      id: '33333333-3333-4333-8333-333333333333', session_id: sessionId, exercise_id: 'bench-press',
      sequence: 1, load_kg: '20.00', reps: 10, rpe: '5.0', set_type: 'WARMUP', recorded_at: '2026-09-07T16:32:00.000Z'
    }],
    symptom_observation: [],
    technique_observation: [{
      id: '44444444-4444-4444-8444-444444444444', session_id: sessionId, exercise_id: 'bench-press',
      flag: 'OK', note: null, recorded_at: '2026-09-07T16:32:00.000Z'
    }],
    recommendation_snapshot: [{
      id: '55555555-5555-4555-8555-555555555555', session_id: sessionId, rule_version: 'm1-safety-0.2.0',
      input_snapshot: { maxRpe: 5 }, decision: { action: 'ELIGIBLE_TO_PROGRESS' }, evidence_refs: ['set:1'],
      created_at: '2026-09-07T16:38:00.000Z', accepted_at: null, performed_at: null
    }]
  };
}

test('server history maps to an account-scoped SYNCED local snapshot', () => {
  const mapped = mapServerWorkoutSession(serverRow(), owner);
  assert.equal(mapped.ownerUserId, owner);
  assert.equal(mapped.syncState, 'SYNCED');
  assert.equal(mapped.sets.length, 1);
  assert.equal(mapped.sets[0]?.loadKg, 20);
  assert.equal(mapped.recommendation?.ruleVersion, 'm1-safety-0.2.0');
});

test('server history refuses a cross-account row', () => {
  assert.throws(() => mapServerWorkoutSession(serverRow(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /SERVER_HISTORY_OWNER_MISMATCH/);
});

test('server history recovery only accepts completed sessions', () => {
  const row = serverRow();
  row.completed_at = null;
  assert.throws(() => mapServerWorkoutSession(row, owner), /SERVER_HISTORY_SESSION_NOT_COMPLETED/);
});
