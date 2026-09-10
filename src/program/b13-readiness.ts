import { withTimeout } from '@/src/backend/async-timeout';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';

export interface B13ReadinessChecks {
  oneCurrentDogfoodProgram: boolean;
  oneCurrentProgram?: boolean;
  nonActiveVerifiedCandidate: boolean;
  activeCanonicalProgram?: boolean;
  dogfoodProgramSuperseded?: boolean;
  dogfoodHistoryPreserved?: boolean;
  canonicalProgramRows: number;
  verifiedSourceSessions: number;
  verifiedTrainingRows: number;
  verifiedNutritionRows: number;
  nutritionSemanticsPreserved: boolean;
  activeBenchSafetyBlock: boolean;
  latestAppBodyMeasurementPreserved: boolean;
  historicalSourceNotImported: boolean;
}

export interface B13Readiness {
  technicalStatus: 'NOT_STAGED' | 'BLOCKED' | 'CUTOVER_READY_AWAITING_APPROVAL' | 'CUTOVER_EXECUTED';
  cutoverApproved: boolean;
  canonicalCutoverPerformed: boolean;
  sourceOfTruth?: 'HEALTH_MASTER_RECORD' | 'SUPERABANG';
  batchId?: string;
  sourceRevision?: string;
  cutoverPerformedAt?: string;
  canonicalProgramVersionId?: string;
  priorProgramVersionId?: string;
  checks?: B13ReadinessChecks;
}

export async function loadB13Readiness(): Promise<B13Readiness> {
  const { data, error } = await withTimeout(
    getSupabaseBrowserClient().rpc('b13_cutover_readiness_v1'),
    8_000,
    'B13 readiness lookup',
  );
  if (error) throw error;
  return data as B13Readiness;
}
