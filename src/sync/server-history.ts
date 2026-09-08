import type { WorkoutPrescription } from '../domain/reference';
import type { RecommendationSnapshot, SymptomObservation, TechniqueObservation, WorkoutSetLog } from '../domain/types';
import type { OfflineWorkoutSession } from '../offline/workout-store';

export interface ServerWorkoutSetRow {
  id: string;
  session_id: string;
  exercise_id: string;
  sequence: number;
  load_kg: number | string;
  reps: number;
  rpe: number | string | null;
  set_type: WorkoutSetLog['setType'];
  recorded_at: string;
}

export interface ServerSymptomRow {
  id: string;
  session_id: string;
  exercise_id: string | null;
  severity: number;
  location: string | null;
  onset: string | null;
  trigger: string | null;
  recorded_at: string;
}

export interface ServerTechniqueRow {
  id: string;
  session_id: string;
  exercise_id: string | null;
  flag: TechniqueObservation['flag'];
  note: string | null;
  recorded_at: string;
}

export interface ServerRecommendationRow {
  id: string;
  session_id: string | null;
  rule_version: string;
  input_snapshot: unknown;
  decision: unknown;
  evidence_refs: unknown;
  created_at: string;
  accepted_at: string | null;
  performed_at: string | null;
}

export interface ServerWorkoutSessionRow {
  id: string;
  user_id: string;
  prescribed_snapshot: WorkoutPrescription;
  started_at: string;
  completed_at: string | null;
  completion_status: OfflineWorkoutSession['completionStatus'] | null;
  updated_at: string | null;
  workout_set_log?: ServerWorkoutSetRow[] | null;
  symptom_observation?: ServerSymptomRow[] | null;
  technique_observation?: ServerTechniqueRow[] | null;
  recommendation_snapshot?: ServerRecommendationRow[] | null;
}

function numberValue(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function mapServerWorkoutSession(
  row: ServerWorkoutSessionRow,
  expectedOwnerUserId: string
): OfflineWorkoutSession {
  if (row.user_id !== expectedOwnerUserId) throw new Error('SERVER_HISTORY_OWNER_MISMATCH');
  if (!row.completed_at) throw new Error('SERVER_HISTORY_SESSION_NOT_COMPLETED');

  const sets: WorkoutSetLog[] = (row.workout_set_log ?? []).map(item => ({
    id: item.id,
    sessionId: item.session_id,
    exerciseId: item.exercise_id,
    sequence: item.sequence,
    loadKg: numberValue(item.load_kg) ?? 0,
    reps: item.reps,
    rpe: numberValue(item.rpe),
    setType: item.set_type,
    recordedAt: item.recorded_at,
  })).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const symptoms: SymptomObservation[] = (row.symptom_observation ?? []).map(item => ({
    id: item.id,
    sessionId: item.session_id,
    exerciseId: item.exercise_id ?? undefined,
    severity: item.severity,
    location: item.location ?? undefined,
    onset: item.onset ?? undefined,
    trigger: item.trigger ?? undefined,
    recordedAt: item.recorded_at,
  })).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const techniques: TechniqueObservation[] = (row.technique_observation ?? []).map(item => ({
    id: item.id,
    sessionId: item.session_id,
    exerciseId: item.exercise_id ?? undefined,
    flag: item.flag,
    note: item.note ?? undefined,
    recordedAt: item.recorded_at,
  })).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const recommendationRow = [...(row.recommendation_snapshot ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const recommendation: RecommendationSnapshot | undefined = recommendationRow ? {
    id: recommendationRow.id,
    ruleVersion: recommendationRow.rule_version,
    createdAt: recommendationRow.created_at,
    inputSnapshot: recommendationRow.input_snapshot,
    decision: recommendationRow.decision,
    evidenceRefs: stringArray(recommendationRow.evidence_refs),
    acceptedAt: recommendationRow.accepted_at ?? undefined,
    performedAt: recommendationRow.performed_at ?? undefined,
  } : undefined;

  return {
    sessionId: row.id,
    ownerUserId: expectedOwnerUserId,
    prescribedSnapshot: row.prescribed_snapshot,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completionStatus: row.completion_status ?? 'COMPLETED',
    updatedAt: row.updated_at ?? row.completed_at,
    syncState: 'SYNCED',
    sets,
    symptoms,
    techniques,
    recommendation,
  };
}
