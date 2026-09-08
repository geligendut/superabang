export type OutboxStatus = 'PENDING'|'IN_FLIGHT'|'SYNCED'|'FAILED';

export interface OutboxOperation {
  id: string;
  aggregateType: 'WORKOUT_SESSION';
  aggregateId: string;
  operation: 'UPSERT';
  /** Local ownership boundary. null = signed-out/local-only guest. */
  ownerUserId: string | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: OutboxStatus;
  nextAttemptAt: string;
  lastError?: string;
}

export function createOutboxOperation(input: {
  id: string;
  aggregateId: string;
  ownerUserId: string | null;
  payload: unknown;
  createdAt?: string;
}): OutboxOperation {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: input.id,
    aggregateType: 'WORKOUT_SESSION',
    aggregateId: input.aggregateId,
    operation: 'UPSERT',
    ownerUserId: input.ownerUserId,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: 'PENDING',
    nextAttemptAt: now,
  };
}

export function nextRetryDelayMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts));
}

export function markOutboxFailure(operation: OutboxOperation, error: string, nowMs = Date.now()): OutboxOperation {
  const attempts = operation.attempts + 1;
  const nextAttemptAt = new Date(nowMs + nextRetryDelayMs(attempts)).toISOString();
  return {
    ...operation,
    attempts,
    status: 'FAILED',
    lastError: error,
    nextAttemptAt,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function markOutboxSynced(operation: OutboxOperation, now = new Date().toISOString()): OutboxOperation {
  return {
    ...operation,
    status: 'SYNCED',
    lastError: undefined,
    updatedAt: now,
  };
}

export function isOutboxDue(operation: OutboxOperation, nowMs = Date.now()): boolean {
  return operation.status !== 'SYNCED' && new Date(operation.nextAttemptAt).getTime() <= nowMs;
}
