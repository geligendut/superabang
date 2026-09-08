'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXERCISE_REFERENCE, type WorkoutPrescription } from '@/src/domain/reference';
import { SYNTHETIC_M1_WORKOUT } from '@/src/domain/synthetic-seed';
import { listActiveWorkouts } from '@/src/offline/workout-store';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { resolveWorkoutPrescription } from '@/src/program/current-program';

export default function TodayWorkout() {
  const router = useRouter();
  const exerciseById = useMemo(() => new Map(EXERCISE_REFERENCE.map(e => [e.id, e])), []);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [prescription, setPrescription] = useState<WorkoutPrescription>(SYNTHETIC_M1_WORKOUT);
  const [status, setStatus] = useState('Checking current program and local active workout…');

  useEffect(() => {
    Promise.all([getLocalOwnerUserId(), resolveWorkoutPrescription(SYNTHETIC_M1_WORKOUT)])
      .then(async ([ownerUserId, resolved]) => {
        setPrescription(resolved);
        const rows = await listActiveWorkouts(ownerUserId);
        const match = rows.find(row => row.prescribedSnapshot.workoutId === resolved.workoutId);
        setResumeId(match?.sessionId ?? null);
        setStatus('');
      }).catch(error => setStatus(String(error)));
  }, []);

  function startOrResume() {
    const sessionId = resumeId ?? crypto.randomUUID();
    router.push(`/workout/session/${sessionId}`);
  }

  const isSyntheticFallback = prescription.programVersionRef === SYNTHETIC_M1_WORKOUT.programVersionRef;

  return <main>
    <h1>Prescribed workout</h1>
    <p className="muted">
      {isSyntheticFallback
        ? 'Synthetic development seed — current Health workflow remains authoritative.'
        : 'Loaded from the account CURRENT app program version. Health canonical cutover has not occurred.'}
    </p>
    <div className="card">
      <strong>{prescription.name}</strong>
      <div className="muted">Program snapshot: {prescription.programVersionRef}</div>
    </div>
    {prescription.exercises.map((e) => <div className="card" key={e.exerciseId}>
      <strong>{exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</strong>
      <p className="muted">{e.note}</p>
      {e.sets.map((s, i) => <div className="set-line" key={s.id}>
        <span>Set {i + 1} · {s.setType}</span>
        <span>{s.targetLoadKg ?? '—'} kg × {s.targetReps}{s.targetRpeMax ? ` · RPE ≤ ${s.targetRpeMax}` : ''}</span>
      </div>)}
    </div>)}
    {status && <div className="card">{status}</div>}
    <button className="primary" onClick={startOrResume}>{resumeId ? 'Resume active session' : 'Start session'}</button>
  </main>;
}
