import type { RecommendationSnapshot, SymptomObservation, TechniqueObservation, WorkoutSetLog } from '../domain/types';
import type { WorkoutPrescription } from '../domain/reference';
import { createOutboxOperation, type OutboxOperation } from '../sync/outbox';

export interface OfflineWorkoutSession {
  sessionId: string;
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
const DB_VERSION = 3;
const ACTIVE_STORE = 'active_workouts';
const HISTORY_STORE = 'workout_history';
const OUTBOX_STORE = 'sync_outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) db.createObjectStore(ACTIVE_STORE, { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
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

export async function saveActiveWorkout(record: OfflineWorkoutSession): Promise<void> { return put(ACTIVE_STORE, record); }
export async function loadActiveWorkout(sessionId: string): Promise<OfflineWorkoutSession | undefined> { return get<OfflineWorkoutSession>(ACTIVE_STORE, sessionId); }

export async function listActiveWorkouts(): Promise<OfflineWorkoutSession[]> {
  const db = await openDb();
  const rows = await new Promise<OfflineWorkoutSession[]>((resolve, reject) => {
    const req = db.transaction(ACTIVE_STORE, 'readonly').objectStore(ACTIVE_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createWorkoutSession(sessionId: string, prescribedSnapshot: WorkoutPrescription): Promise<OfflineWorkoutSession> {
  const existing = await loadActiveWorkout(sessionId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const session: OfflineWorkoutSession = {
    sessionId,
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

export async function appendSet(sessionId: string, set: WorkoutSetLog, symptom?: SymptomObservation, technique?: TechniqueObservation): Promise<OfflineWorkoutSession> {
  const session = await loadActiveWorkout(sessionId);
  if (!session) throw new Error('ACTIVE_SESSION_NOT_FOUND');
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
  recommendation?: RecommendationSnapshot,
  completionStatus: 'COMPLETED'|'STOPPED_FOR_SAFETY' = 'COMPLETED'
): Promise<OfflineWorkoutSession> {
  const session = await loadActiveWorkout(sessionId);
  if (!session) throw new Error('ACTIVE_SESSION_NOT_FOUND');
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

export async function listWorkoutHistory(): Promise<OfflineWorkoutSession[]> {
  const db = await openDb();
  const rows = await new Promise<OfflineWorkoutSession[]>((resolve, reject) => {
    const req = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a,b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
}

export async function listOutboxOperations(): Promise<OutboxOperation[]> {
  const db = await openDb();
  const rows = await new Promise<OutboxOperation[]>((resolve, reject) => {
    const req = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveOutboxOperation(operation: OutboxOperation): Promise<void> {
  return put(OUTBOX_STORE, operation);
}

export async function markHistorySyncState(sessionId: string, syncState: OfflineWorkoutSession['syncState']): Promise<void> {
  const history = await get<OfflineWorkoutSession>(HISTORY_STORE, sessionId);
  if (!history) return;
  await put(HISTORY_STORE, { ...history, syncState, updatedAt: new Date().toISOString() });
}
