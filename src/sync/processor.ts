import { isOutboxDue, markOutboxFailure, markOutboxSynced, type OutboxOperation } from './outbox.ts';

export interface SyncTransport {
  push(operation: OutboxOperation): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface SyncProcessorResult {
  attempted: number;
  synced: number;
  failed: number;
  blocked: number;
  operations: OutboxOperation[];
}

/** Pure orchestration; persistence is injected so workout logging never depends on network/provider availability. */
export async function processOutbox(input: {
  operations: OutboxOperation[];
  /** Authenticated owner currently allowed to send operations. */
  expectedOwnerUserId: string;
  transport: SyncTransport;
  persist: (operation: OutboxOperation) => Promise<void>;
  onAggregateSynced?: (aggregateId: string) => Promise<void>;
  onAggregateFailed?: (aggregateId: string) => Promise<void>;
  nowMs?: number;
}): Promise<SyncProcessorResult> {
  const nowMs = input.nowMs ?? Date.now();
  const result: SyncProcessorResult = { attempted: 0, synced: 0, failed: 0, blocked: 0, operations: [] };

  for (const operation of input.operations) {
    if (operation.ownerUserId !== input.expectedOwnerUserId) {
      result.blocked += 1;
      result.operations.push(operation);
      continue;
    }

    if (!isOutboxDue(operation, nowMs)) {
      result.operations.push(operation);
      continue;
    }

    result.attempted += 1;
    let response: Awaited<ReturnType<SyncTransport['push']>>;
    try {
      response = await input.transport.push(operation);
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (response.ok) {
      const synced = markOutboxSynced(operation, new Date(nowMs).toISOString());
      await input.persist(synced);
      await input.onAggregateSynced?.(operation.aggregateId);
      result.synced += 1;
      result.operations.push(synced);
    } else {
      const failed = markOutboxFailure(operation, response.error, nowMs);
      await input.persist(failed);
      await input.onAggregateFailed?.(operation.aggregateId);
      result.failed += 1;
      result.operations.push(failed);
    }
  }

  return result;
}
