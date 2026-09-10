'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { isSupabaseConfigured } from '@/src/backend/supabase-browser';
import { listWorkoutHistory, type OfflineWorkoutSession } from '@/src/offline/workout-store';
import { reconcileAuthenticatedServerHistory } from '@/src/sync/reconcile-history';
import { assessTrainingProgression, type TrainingProgressionAssessment } from '@/src/domain/training-progression';
import { EXERCISE_REFERENCE } from '@/src/domain/reference';
import {
  applyPersistentSafetyBlocks,
  blockProgressionWhenSafetyUnavailable,
  loadActiveCanonicalSafetyBlocks,
} from '@/src/program/canonical-safety';

function exerciseName(exerciseId: string) {
  return EXERCISE_REFERENCE.find(e => e.id === exerciseId)?.name ?? exerciseId;
}

export default function TrainingProgressionPage() {
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [session, setSession] = useState<OfflineWorkoutSession | null>(null);
  const [assessment, setAssessment] = useState<TrainingProgressionAssessment | null>(null);
  const [status, setStatus] = useState('Loading latest completed session…');

  async function load(owner: string | null) {
    if (owner && navigator.onLine && isSupabaseConfigured()) {
      try {
        await reconcileAuthenticatedServerHistory();
      } catch {
        // Local-first: server reconciliation failure must not block local review.
      }
    }

    const history = await listWorkoutHistory(owner);
    const latest = history[0] ?? null;
    setSession(latest);
    if (latest) {
      let nextAssessment = assessTrainingProgression(latest);
      if (owner) {
        try {
          const blocks = await loadActiveCanonicalSafetyBlocks(owner);
          nextAssessment = applyPersistentSafetyBlocks(nextAssessment, blocks);
        } catch {
          nextAssessment = blockProgressionWhenSafetyUnavailable(nextAssessment);
        }
      }
      setAssessment(nextAssessment);
    } else {
      setAssessment(null);
    }
    setStatus(latest ? '' : owner
      ? 'No completed sessions are available for this signed-in account.'
      : 'No completed guest sessions are available on this device.');
  }

  useEffect(() => {
    getLocalOwnerUserId()
      .then(owner => {
        setOwnerUserId(owner);
        return load(owner);
      })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  return <main>
    <h1>Training progression</h1>
    <p className="muted">
      Deterministic review of the latest completed workout. Safety, symptom, technique and exertion gates take precedence.
      Progression rules remain PROVISIONAL and never mutate the current program automatically.
    </p>

    <div className="row">
      <Link href="/history"><button>History</button></Link>
      <Link href="/workout/today"><button>Today&apos;s workout</button></Link>
      <Link href="/"><button>Home</button></Link>
    </div>

    {status && <div className="card">{status}</div>}

    {session && assessment && <>
      <div className="card">
        <strong>{session.prescribedSnapshot.name}</strong>
        <div>{session.completionStatus ?? 'COMPLETED'} · {session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'}</div>
        <div className="muted">
          Safety action: {assessment.globalSafetyAction} · rule {assessment.ruleVersion} · {assessment.ruleStatus}
        </div>
      </div>

      {assessment.exercises.map(exercise => <div className="card" key={exercise.exerciseId}>
        <h2>{exerciseName(exercise.exerciseId)}</h2>
        <p><strong>{exercise.disposition}</strong></p>
        <div>
          Working sets: {exercise.completedWorkingSets}/{exercise.prescribedWorkingSets}
          {exercise.maxWorkingRpe !== undefined ? ` · max RPE ${exercise.maxWorkingRpe}` : ''}
        </div>
        {exercise.currentTargetLoadKg !== undefined && <div>Current target: {exercise.currentTargetLoadKg} kg</div>}
        {exercise.suggestedLoadKg !== undefined && <div><strong>Candidate next load: {exercise.suggestedLoadKg} kg</strong></div>}
        <p className="muted">{exercise.reason}</p>
      </div>)}
    </>}

    {!ownerUserId && <p className="muted">Signed-out review is limited to guest history stored on this device.</p>}
  </main>;
}
