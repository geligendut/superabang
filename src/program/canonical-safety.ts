import { withTimeout } from '../backend/async-timeout.ts';
import { getSupabaseBrowserClient } from '../backend/supabase-browser.ts';
import type { TrainingProgressionAssessment } from '../domain/training-progression.ts';

export interface CanonicalSafetyBlock {
  sourceKey: string;
  exercise: string | null;
  triggerLoadKg: number | null;
  location: string | null;
  recurrence: boolean | null;
}

const cacheKey = (ownerUserId: string) => `superabang:canonical-safety:${ownerUserId}`;

function readCachedBlocks(ownerUserId: string): CanonicalSafetyBlock[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(cacheKey(ownerUserId));
  if (!raw) return null;
  try { return JSON.parse(raw) as CanonicalSafetyBlock[]; } catch { return null; }
}

export async function loadActiveCanonicalSafetyBlocks(ownerUserId: string): Promise<CanonicalSafetyBlock[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = readCachedBlocks(ownerUserId);
    if (cached) return cached;
    throw new Error('PERSISTENT_SAFETY_CONTEXT_UNAVAILABLE_OFFLINE');
  }
  const { data, error } = await withTimeout(
    getSupabaseBrowserClient()
      .from('canonical_safety_context')
      .select('source_key,exercise,trigger_load_kg,location,recurrence')
      .eq('status','ACTIVE_BLOCK'),
    8_000,
    'Persistent safety lookup',
  );
  if (error) throw error;
  const blocks = (data ?? []).map(row => ({
    sourceKey: row.source_key,
    exercise: row.exercise,
    triggerLoadKg: row.trigger_load_kg === null ? null : Number(row.trigger_load_kg),
    // Do not persist anatomical detail in the offline safety cache.
    location: null,
    recurrence: row.recurrence,
  }));
  if (typeof window !== 'undefined') {
    if (blocks.length) {
      window.localStorage.setItem(cacheKey(ownerUserId), JSON.stringify(blocks));
    } else {
      window.localStorage.removeItem(cacheKey(ownerUserId));
    }
  }
  return blocks;
}

export function applyPersistentSafetyBlocks(
  assessment: TrainingProgressionAssessment,
  blocks: CanonicalSafetyBlock[],
): TrainingProgressionAssessment {
  const benchBlocked = blocks.some(block =>
    block.sourceKey === 'BENCH-55KG-20260906' && block.recurrence === true
  );
  if (!benchBlocked) return assessment;

  return {
    ...assessment,
    globalSafetyAction: 'BLOCK_PROGRESSION',
    exercises: assessment.exercises.map(exercise => exercise.exerciseId === 'bench-press'
      ? {
          ...exercise,
          disposition: 'BLOCK',
          suggestedLoadKg: undefined,
          reason: 'Persistent Health safety context blocks bench progression. The recurrent 55 kg symptom remains active; no diagnosis is inferred.',
        }
      : exercise),
  };
}

export function blockProgressionWhenSafetyUnavailable(
  assessment: TrainingProgressionAssessment,
): TrainingProgressionAssessment {
  return {
    ...assessment,
    globalSafetyAction: 'BLOCK_PROGRESSION',
    exercises: assessment.exercises.map(exercise => ({
      ...exercise,
      disposition: 'BLOCK',
      suggestedLoadKg: undefined,
      reason: 'Persistent safety context could not be verified. Progression is blocked until the safety state is available.',
    })),
  };
}
