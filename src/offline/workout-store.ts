import type { RecommendationSnapshot, SymptomObservation, TechniqueObservation, WorkoutSetLog } from '../domain/types';
import type { WorkoutPrescription } from '../domain/reference';
import { createOutboxOperation, type OutboxOperation } from '../sync/outbox';

export interface OfflineWorkoutSession {
  sessionId: string;
  /**
   * Local ownership boundary. null = signed-out/local-only guest.
   * Rows created before B5 local ownership hardening have this field undefined at runtime
   * and are deliberately quarantined from every account rather than silently claimed.
   */
  ownerUserId: string | null;
  prescribedSnapshot: WorkoutPrescription;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  completionStatus?: 'COMPLETED'|'STOPPED_FOR_SAFETY';
  syncState: 'PENDING'|'SYNCED'|'CONFLICT'|'FAILED';
  sets: WorkoutSetLog[];
  symptoms: SymptomObservation[];
  techniques: TechniqueObservation[];
  recommendation?: RecommendationSnapshot;
}

const DB_NAME = 'fitness-dogfood';
const DB_VERSION = 4;
const ACTIVE_STORE = 'active_workouts';
const HISTORY_STORE = 'workout_history';
const OUTBOX_STORE = 'sync_outbox';
const OWNER_INDEX = 'ownerUserId';

function ensureOwnerIndex(store: IDBObjectStore) {
  if (!store.indexNames.contains(OWNER_INDEX)) store.createIndex(OWNER_INDEX, OWNER_INDEX, { unique: false });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) throw new Error('INDEXEDDB_UPGRADE_TRANSACTION_MISSING');

      const active = db.objectStoreNames.contains(ACTIVE_STORE)
        ? tx.objectStore(ACTIVE_STORE)
        : db.createObjectStore(ACTIVE_STORE, { keyPath: 'sessionId' });
      const history = db.objectStoreNames.contains(HISTORY_STORE)
        ? tx.objectStore(HISTORY_STORE)
        : db.createObjectStore(HISTORY_STORE, { keyPath: 'sessionId' });
      const outbox = db.objectStoreNames.contains(OUTBOX_STORE)
        ? tx.objectStore(OUTBOX_STORE)
        : db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });

      ensureOwnerIndex(active);
      ensureOwnerIndex(history);
      ensureOwnerIndex(outbox);
      // Legacy rows are intentionally not rewritten. Missing ownerUserId = quarantined legacy data.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(store: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const rows = await new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}

function ownedBy<T extends { ownerUserId?: string | null }>(row: T, ownerUserId: string | null): boolean {
  // Undefined identifies pre-hardening legacy data and never matches an account or guest.
  return row.ownerUserId !== undefined && row.ownerUserId === ownerUserId;
}

export async function saveActiveWorkout(record: OfflineWorkoutSession): Promise<void> { return put(ACTIVE_STORE, record); }

export async function loadActiveWorkout(sessionId: string, ownerUserId: string | null): Promise<OfflineWorkoutSession | undefined> {
  const row = await get<OfflineWorkoutSession>(ACTIVE_STORE, sessionId);
  return row && ownedBy(row, ownerUserId) ? row : undefined;
}

export async function listActiveWorkouts(ownerUserId: string | null): Promise<OfflineWorkoutSession[]> {
  const rows = await getAll<OfflineWorkoutSession>(ACTIVE_STORE);
  return rows.filter(row => ownedBy(row, ownerUserId)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createWorkoutSession(
  sessionId: string,
  prescribedSnapshot: WorkoutPrescription,
  ownerUserId: string | null
): Promise<OfflineWorkoutSession> {
  const rawExisting = await get<OfflineWorkoutSession>(ACTIVE_STORE, sessionId);
  if (rawExisting) {
    if (!ownedBy(rawExisting, ownerUserId)) throw new Error('LOCAL_SESSION_OWNER_MISMATCH');
    return rawExisting;
  }

  const now = new Date().toISOString();
  const session: OfflineWorkoutSession = {
    sessionId,
    ownerUserId,
    prescribedSnapshot,
    startedAt: now,
    updatedAt: now,
    syncState: 'PENDING',
    sets: [],
    symptoms: [],
    techniques: []
  };
  await saveActiveWorkout(session);
  return session;
}

export async function appendSet(
  sessionId: string,
  ownerUserId: string | null,
  set: WorkoutSetLog,
  symptom?: SymptomObservation,
  technique?: TechniqueObservation
): Promise<OfflineWorkoutSession> {
  const session = await loadActiveWorkout(sessionId, ownerUserId);
  if (!session) throw new Error('ACTIVE_SESSION_NOT_FOUND_OR_OWNER_MISMATCH');
  if (session.completedAt) throw new Error('SESSION_ALREADY_COMPLETED');
  const next = {
    ...session,
    sets: [...session.sets, set],
    symptoms: symptom ? [...session.symptoms, symptom] : session.symptoms,
    techniques: technique ? [...session.techniques, technique] : session.techniques,
    updatedAt: new Date().toISOString(),
    syncState: 'PENDING' as const
  };
  await saveActiveWorkout(next);
  return next;
}

export async function completeWorkoutSession(
  sessionId: string,
  ownerUserId: string | null,
  recommendation?: RecommendationSnapshot,
  completionStatus: 'COMPLETED'|'STOPPED_FOR_SAFETY' = 'COMPLETED'
): Promise<OfflineWorkoutSession> {
  const session = await loadActiveWorkout(sessionId, ownerUserId);
  if (!session) throw new Error('ACTIVE_SESSION_NOT_FOUND_OR_OWNER_MISMATCH');
  const now = new Date().toISOString();
  const completed: OfflineWorkoutSession = {
    ...session,
    completedAt: session.completedAt ?? now,
    completionStatus,
    updatedAt: now,
    recommendation,
    syncState: 'PENDING'
  };
  const outbox = createOutboxOperation({
    id: crypto.randomUUID(),
    aggregateId: sessionId,
    ownerUserId,
    payload: completed,
    createdAt: now,
  });

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE, OUTBOX_STORE], 'readwrite');
    tx.objectStore(HISTORY_STORE).put(completed);
    tx.objectStore(OUTBOX_STORE).put(outbox);
    tx.objectStore(ACTIVE_STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('COMPLETE_WORKOUT_TRANSACTION_ABORTED'));
  });
  db.close();
  return completed;
}

export async function listWorkoutHistory(ownerUserId: string | null): Promise<OfflineWorkoutSession[]> {
  const rows = await getAll<OfflineWorkoutSession>(HISTORY_STORE);
  return rows
    .filter(row => ownedBy(row, ownerUserId))
    .sort((a,b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
}

/**
 * Upserts a completed history snapshot only after server RLS has proven ownership.
 * This may safely replace a quarantined pre-hardening row with the same session id,
 * but never overwrites a row already owned by a different local account.
 */
export async function reconcileHistorySnapshotFromServer(
  record: OfflineWorkoutSession,
  expectedOwnerUserId: string
): Promise<void> {
  if (record.ownerUserId !== expectedOwnerUserId) throw new Error('SERVER_HISTORY_OWNER_MISMATCH');
  if (!record.completedAt) throw new Error('SERVER_HISTORY_SESSION_NOT_COMPLETED');

  const existing = await get<OfflineWorkoutSession>(HISTORY_STORE, record.sessionId);
  if (existing?.ownerUserId !== undefined && existing.ownerUserId !== expectedOwnerUserId) {
    throw new Error('LOCAL_HISTORY_OWNER_CONFLICT');
  }

  await put(HISTORY_STORE, { ...record, ownerUserId: expectedOwnerUserId, syncState: 'SYNCED' });
}

export async function listOutboxOperations(ownerUserId: string): Promise<OutboxOperation[]> {
  const rows = await getAll<OutboxOperation>(OUTBOX_STORE);
  return rows
    .filter(row => row.ownerUserId === ownerUserId)
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveOutboxOperation(operation: OutboxOperation): Promise<void> {
  return put(OUTBOX_STORE, operation);
}

export async function markHistorySyncState(
  sessionId: string,
  ownerUserId: string,
  syncState: OfflineWorkoutSession['syncState']
): Promise<void> {
  const history = await get<OfflineWorkoutSession>(HISTORY_STORE, sessionId);
  if (!history || !ownedBy(history, ownerUserId)) return;
  await put(HISTORY_STORE, { ...history, syncState, updatedAt: new Date().toISOString() });
}
