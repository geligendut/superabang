'use client';

import { listOutboxOperations, markHistorySyncState, saveOutboxOperation } from '../offline/workout-store';
import { processOutbox } from './processor';
import { SupabaseApiTransport } from './supabase-transport';

export async function syncPendingWorkoutHistory() {
  const operations = await listOutboxOperations();
  return processOutbox({
    operations,
    transport: new SupabaseApiTransport(),
    persist: saveOutboxOperation,
    onAggregateSynced: async (id) => markHistorySyncState(id, 'SYNCED'),
    onAggregateFailed: async (id) => markHistorySyncState(id, 'FAILED'),
  });
}
