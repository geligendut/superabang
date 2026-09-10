'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { appendSet, completeWorkoutSession, createWorkoutSession, type OfflineWorkoutSession } from '@/src/offline/workout-store';
import { assessNextExposure, evidenceRefsForDecision, summarizeSessionForDecision, type ExposureAssessment } from '@/src/domain/safety-decision';
import { SYNTHETIC_M1_WORKOUT } from '@/src/domain/synthetic-seed';
import { EXERCISE_REFERENCE, type WorkoutPrescription } from '@/src/domain/reference';
import { nextPrescribedSet, summarizeExecution } from '@/src/domain/workout';
import type { RecommendationSnapshot, SymptomObservation, TechniqueObservation, WorkoutSetLog } from '@/src/domain/types';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { resolveWorkoutPrescription } from '@/src/program/current-program';

const newId = () => crypto.randomUUID();

export default function WorkoutSessionRunner({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<OfflineWorkoutSession | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [ownerResolved, setOwnerResolved] = useState(false);
  const [prescription, setPrescription] = useState<WorkoutPrescription | null>(null);
  const [loadKg, setLoadKg] = useState(20);
  const [reps, setReps] = useState(10);
  const [rpe, setRpe] = useState(5);
  const [symptomSeverity, setSymptomSeverity] = useState(0);
  const [symptomLocation, setSymptomLocation] = useState('');
  const [techniqueFlag, setTechniqueFlag] = useState<'OK'|'CAUTION'>('OK');
  const [techniqueNote, setTechniqueNote] = useState('');
  const [message, setMessage] = useState('Preparing local workout…');
  const [assessment, setAssessment] = useState<ExposureAssessment | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    getLocalOwnerUserId().catch(() => null).then(async owner => {
      const resolved = await resolveWorkoutPrescription(SYNTHETIC_M1_WORKOUT, owner);
      setOwnerUserId(owner);
      setPrescription(resolved);
      setOwnerResolved(true);
    }).catch(error => {
      setOwnerResolved(true);
      setPrescription(SYNTHETIC_M1_WORKOUT);
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !ownerResolved || !prescription) return;
    createWorkoutSession(sessionId, prescription, ownerUserId)
      .then(row => { setSession(row); setMessage(''); })
      .catch(error => setMessage(error instanceof Error ? error.message : String(error)));
  }, [sessionId, ownerResolved, ownerUserId, prescription]);

  const exerciseById = useMemo(() => new Map(EXERCISE_REFERENCE.map(e => [e.id, e])), []);
  const next = session ? nextPrescribedSet(session.prescribedSnapshot, session.sets) : undefined;
  const summary = session ? summarizeExecution(session.prescribedSnapshot, session.sets) : null;

  useEffect(() => {
    if (!next) return;
    setLoadKg(next.targetLoadKg ?? 20);
    setReps(next.targetReps);
    setRpe(Math.min(next.targetRpeMax ?? 8, 8));
    setSymptomSeverity(0);
    setSymptomLocation('');
    setTechniqueFlag('OK');
    setTechniqueNote('');
  }, [session?.sets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function logSet() {
    if (!session || !next) return;
    const now = new Date().toISOString();
    const set: WorkoutSetLog = {
      id: newId(), sessionId, exerciseId: next.exerciseId,
      sequence: session.sets.filter(s => s.exerciseId === next.exerciseId).length + 1,
      loadKg, reps, rpe, setType: next.setType, recordedAt: now,
    };
    const symptom: SymptomObservation | undefined = symptomSeverity > 0 ? {
      id: newId(), sessionId, exerciseId: next.exerciseId, severity: symptomSeverity,
      location: symptomLocation || undefined, recordedAt: now,
    } : undefined;
    const technique: TechniqueObservation = {
      id: newId(), sessionId, exerciseId: next.exerciseId, flag: techniqueFlag,
      note: techniqueNote || undefined, recordedAt: now,
    };
    const updated = await appendSet(sessionId, ownerUserId, set, symptom, technique);
    setSession(updated);
    const decision = assessNextExposure({
      maxRpe: rpe,
      maxSymptomSeverity: symptomSeverity,
      anyTechniqueCaution: techniqueFlag === 'CAUTION',
      formBreakdown: techniqueFlag === 'CAUTION',
    });
    setAssessment(decision);
    setMessage(`Saved locally: ${exerciseById.get(next.exerciseId)?.name ?? next.exerciseId} — ${loadKg} kg × ${reps}, RPE ${rpe}, ${next.setType}`);
  }

  async function finishSession() {
    if (!session || !summary) return;
    const decisionInput = summarizeSessionForDecision(session);
    const decision = assessNextExposure(decisionInput);
    const stoppedForSafety = !summary.isComplete && decision.action === 'BLOCK_PROGRESSION';

    if (!summary.isComplete && !stoppedForSafety) {
      setAssessment(decision);
      setMessage('Cannot finish normally: prescribed sets are still missing. Continue logging, or stop early only when the deterministic safety gate blocks progression.');
      return;
    }

    const recommendation: RecommendationSnapshot = {
      id: newId(), ruleVersion: decision.ruleVersion, createdAt: new Date().toISOString(),
      inputSnapshot: { ...decisionInput, sessionId, prescribedSets: summary.prescribedSets, loggedSets: summary.loggedSets },
      decision,
      evidenceRefs: evidenceRefsForDecision(session),
    };
    await completeWorkoutSession(sessionId, ownerUserId, recommendation, stoppedForSafety ? 'STOPPED_FOR_SAFETY' : 'COMPLETED');
    setAssessment(decision);
    setFinished(true);
    setMessage(stoppedForSafety
      ? 'Session stopped locally for safety. Missing prescribed sets remain missing; sync is queued independently.'
      : 'Session completed locally. History remains available without network; server sync is queued independently.');
  }

  if (finished) return <main>
    <h1>Workout completed</h1>
    <div className="card"><strong>{message}</strong></div>
    {assessment && <div className="card"><h2>Next-exposure recommendation</h2><p>{assessment.action}</p><p className="muted">{assessment.reason}</p><p className="muted">Rule: {assessment.ruleVersion} · {assessment.ruleStatus}</p></div>}
    <Link href="/history"><button className="primary">Open history</button></Link>
  </main>;

  return <main>
    <h1>Active workout</h1>
    <p className="muted">Offline-first set logging. AI and network access are not required for logging or completion.</p>
    {session && <div className="card"><div className="muted">Program snapshot: {session.prescribedSnapshot.programVersionRef}</div></div>}
    {summary && <div className="card"><strong>{summary.loggedSets} / {summary.prescribedSets} prescribed sets logged</strong></div>}

    {next ? <>
      <div className="card">
        <h2>{exerciseById.get(next.exerciseId)?.name ?? next.exerciseId}</h2>
        <p><strong>{next.setType}</strong> · target {next.targetLoadKg ?? '—'} kg × {next.targetReps}{next.targetRpeMax ? ` · RPE ≤ ${next.targetRpeMax}` : ''}</p>
        {next.setType === 'WARMUP' && next.targetLoadKg === 20 && <p className="muted">Empty Olympic bar is recorded as total load 20 kg, not 0 kg.</p>}
      </div>
      <div className="card form-grid">
        <label>Load (kg)<input value={loadKg} type="number" min="0" step="0.5" onChange={e => setLoadKg(Number(e.target.value))}/></label>
        <label>Reps<input value={reps} type="number" min="1" onChange={e => setReps(Number(e.target.value))}/></label>
        <label>RPE<input value={rpe} type="number" min="1" max="10" step="0.5" onChange={e => setRpe(Number(e.target.value))}/></label>
        <label>Symptom severity 0–10<input value={symptomSeverity} type="number" min="0" max="10" onChange={e => setSymptomSeverity(Number(e.target.value))}/></label>
        <label>Symptom location (optional)<input value={symptomLocation} onChange={e => setSymptomLocation(e.target.value)} placeholder="e.g. upper trapezius"/></label>
        <label>Technique<select value={techniqueFlag} onChange={e => setTechniqueFlag(e.target.value as 'OK'|'CAUTION')}><option>OK</option><option>CAUTION</option></select></label>
        <label className="span-2">Technique note (optional)<textarea value={techniqueNote} onChange={e => setTechniqueNote(e.target.value)} /></label>
      </div>
      <button className="primary" onClick={logSet}>Log set locally</button>
    </> : session
      ? <div className="card"><strong>All prescribed sets logged.</strong><p className="muted">You can complete the session. Completion remains independent of AI availability.</p></div>
      : <div className="card"><strong>{message || 'Preparing local workout…'}</strong></div>}

    {message && session && <div className="card"><strong>{message}</strong></div>}
    {assessment && <div className="card"><h2>Deterministic safety gate</h2><p>{assessment.action}</p><p className="muted">{assessment.reason}</p></div>}
    <div className="row"><button onClick={finishSession} disabled={!session}>Finish session</button><Link href="/history">History</Link></div>
  </main>;
}
