import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxOperation, isOutboxDue, markOutboxFailure, nextRetryDelayMs } from '../src/sync/outbox.ts';
import { processOutbox } from '../src/sync/processor.ts';

test('retry delay uses capped exponential backoff', () => {
  assert.equal(nextRetryDelayMs(0), 1000);
  assert.equal(nextRetryDelayMs(3), 8000);
  assert.equal(nextRetryDelayMs(99), 60000);
});

test('failed operation is retained with retry metadata', () => {
  const op = createOutboxOperation({ id:'o1', aggregateId:'s1', payload:{a:1}, createdAt:'2026-09-07T12:00:00.000Z' });
  const failed = markOutboxFailure(op, 'offline', Date.parse('2026-09-07T12:00:01.000Z'));
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'offline');
  assert.equal(isOutboxDue(failed, Date.parse(failed.nextAttemptAt)), true);
});

test('sync processor failure cannot delete the local operation', async () => {
  const op = createOutboxOperation({ id:'o1', aggregateId:'s1', payload:{sessionId:'s1'}, createdAt:'2026-09-07T12:00:00.000Z' });
  const persisted: unknown[] = [];
  const result = await processOutbox({
    operations:[op],
    transport:{ push: async () => ({ok:false as const,error:'network unavailable'}) },
    persist: async v => { persisted.push(v); },
    nowMs: Date.parse('2026-09-07T12:00:00.000Z')
  });
  assert.equal(result.failed, 1);
  assert.equal(result.operations[0]?.status, 'FAILED');
  assert.equal(persisted.length, 1);
});

test('sync processor marks successful operation synced without changing workout payload', async () => {
  const payload = { sessionId:'s1', sets:[{loadKg:20}] };
  const op = createOutboxOperation({ id:'o1', aggregateId:'s1', payload, createdAt:'2026-09-07T12:00:00.000Z' });
  const result = await processOutbox({
    operations:[op],
    transport:{ push: async () => ({ok:true as const}) },
    persist: async () => {},
    nowMs: Date.parse('2026-09-07T12:00:00.000Z')
  });
  assert.equal(result.synced, 1);
  assert.deepEqual(result.operations[0]?.payload, payload);
});
