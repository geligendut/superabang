import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import type { WorkoutPrescription } from '@/src/domain/reference';

export interface ProgramVersionRow {
  id: string;
  program_id: string;
  version: number;
  status: 'CURRENT'|'PLANNED'|'COMPLETED'|'SUPERSEDED'|'PAUSED'|'ABANDONED';
  effective_from: string;
  effective_to: string | null;
  prescription_snapshot: WorkoutPrescription | null;
  based_on_version_id: string | null;
  source_session_id: string | null;
  source_recommendation_id: string | null;
  change_summary: unknown;
}

export async function loadCurrentProgram(): Promise<ProgramVersionRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('program_version')
    .select('id,program_id,version,status,effective_from,effective_to,prescription_snapshot,based_on_version_id,source_session_id,source_recommendation_id,change_summary')
    .eq('status','CURRENT')
    .maybeSingle();
  if (error) throw error;
  return (data as ProgramVersionRow | null) ?? null;
}

export async function loadPlannedProgram(): Promise<ProgramVersionRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('program_version')
    .select('id,program_id,version,status,effective_from,effective_to,prescription_snapshot,based_on_version_id,source_session_id,source_recommendation_id,change_summary')
    .eq('status','PLANNED')
    .maybeSingle();
  if (error) throw error;
  return (data as ProgramVersionRow | null) ?? null;
}

export async function resolveWorkoutPrescription(fallback: WorkoutPrescription): Promise<WorkoutPrescription> {
  try {
    const current = await loadCurrentProgram();
    return current?.prescription_snapshot ?? fallback;
  } catch {
    return fallback;
  }
}
