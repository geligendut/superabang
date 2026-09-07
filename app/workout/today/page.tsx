'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXERCISE_REFERENCE } from '@/src/domain/reference';
import { SYNTHETIC_M1_WORKOUT } from '@/src/domain/synthetic-seed';
import { listActiveWorkouts } from '@/src/offline/workout-store';

export default function TodayWorkout() {
  const router = useRouter();
  const exerciseById = useMemo(() => new Map(EXERCISE_REFERENCE.map(e => [e.id, e])), []);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [status, setStatus] = useState('Checking local active workout…');

  useEffect(() => {
    listActiveWorkouts().then(rows => {
      const match = rows.find(row => row.prescribedSnapshot.workoutId === SYNTHETIC_M1_WORKOUT.workoutId);
      setResumeId(match?.sessionId ?? null);
      setStatus('');
    }).catch(error => setStatus(String(error)));
  }, []);

  function startOrResume() {
    const sessionId = resumeId ?? crypto.randomUUID();
    router.push(`/workout/session/${sessionId}`);
  }

  return <main>
    <h1>Prescribed workout</h1>
    <p className="muted">Synthetic development seed — current Health workflow remains authoritative.</p>
    <div className="card">
      <strong>{SYNTHETIC_M1_WORKOUT.name}</strong>
      <div className="muted">Program snapshot: {SYNTHETIC_M1_WORKOUT.programVersionRef}</div>
    </div>
    {SYNTHETIC_M1_WORKOUT.exercises.map((e) => <div className="card" key={e.exerciseId}>
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
