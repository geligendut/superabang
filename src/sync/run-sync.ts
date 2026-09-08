'use client';

import { getLocalOwnerUserId } from '../backend/local-owner';
import { listOutboxOperations, markHistorySyncState, saveOutboxOperation } from '../offline/workout-store';
import { processOutbox } from './processor';
import { SupabaseApiTransport } from './supabase-transport';

export async function syncPendingWorkoutHistory() {
  const ownerUserId = await getLocalOwnerUserId();
  if (!ownerUserId) throw new Error('SIGN_IN_REQUIRED_FOR_SYNC');

  const operations = await listOutboxOperations(ownerUserId);
  return processOutbox({
    operations,
    expectedOwnerUserId: ownerUserId,
    transport: new SupabaseApiTransport(),
    persist: saveOutboxOperation,
    onAggregateSynced: async (id) => markHistorySyncState(id, ownerUserId, 'SYNCED'),
    onAggregateFailed: async (id) => markHistorySyncState(id, ownerUserId, 'FAILED'),
  });
}
