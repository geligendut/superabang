'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { listWorkoutHistory, type OfflineWorkoutSession } from '@/src/offline/workout-store';
import { reconcileAuthenticatedServerHistory } from '@/src/sync/reconcile-history';
import { assessTrainingProgression, type TrainingProgressionAssessment } from '@/src/domain/training-progression';
import { buildProgramChangeDraft, type ProgramChangeDraft } from '@/src/domain/program-change';
import { SYNTHETIC_M1_WORKOUT } from '@/src/domain/synthetic-seed';
import { EXERCISE_REFERENCE } from '@/src/domain/reference';
import { loadCurrentProgram, loadPlannedProgram, type ProgramVersionRow } from '@/src/program/current-program';
import { isCanonicalProgramSnapshot, isWorkoutPrescription } from '@/src/program/canonical-rotation';
import {
  applyPersistentSafetyBlocks,
  blockProgressionWhenSafetyUnavailable,
  loadActiveCanonicalSafetyBlocks,
  type CanonicalSafetyBlock,
} from '@/src/program/canonical-safety';

const DOGFOOD_PROGRAM_ID = '9b11d000-0000-4000-8000-000000000001';

function exerciseName(id: string) {
  return EXERCISE_REFERENCE.find(e => e.id === id)?.name ?? id;
}

export default function ProgramChangePage() {
  const [owner, setOwner] = useState<string|null>(null);
  const [history, setHistory] = useState<OfflineWorkoutSession[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [current, setCurrent] = useState<ProgramVersionRow|null>(null);
  const [planned, setPlanned] = useState<ProgramVersionRow|null>(null);
  const [assessment, setAssessment] = useState<TrainingProgressionAssessment|null>(null);
  const [draft, setDraft] = useState<ProgramChangeDraft|null>(null);
  const [status, setStatus] = useState('Loading program state…');
  const [busy, setBusy] = useState(false);
  const [safetyBlocks, setSafetyBlocks] = useState<CanonicalSafetyBlock[]>([]);
  const [safetyVerified, setSafetyVerified] = useState(false);

  const source = useMemo(() => history.find(h => h.sessionId === sourceId) ?? null, [history, sourceId]);
  const canonicalRotation = current?.prescription_snapshot && isCanonicalProgramSnapshot(current.prescription_snapshot)
    ? current.prescription_snapshot
    : null;

  async function refresh(ownerUserId = owner) {
    const [currentRow, plannedRow] = await Promise.all([loadCurrentProgram(), loadPlannedProgram()]);
    setCurrent(currentRow);
    setPlanned(plannedRow);
    const rows = await listWorkoutHistory(ownerUserId);
    setHistory(rows);
    if (!sourceId && rows.length) setSourceId(rows[0].sessionId);
    if (ownerUserId) {
      try {
        setSafetyBlocks(await loadActiveCanonicalSafetyBlocks(ownerUserId));
        setSafetyVerified(true);
      } catch {
        setSafetyBlocks([]);
        setSafetyVerified(false);
      }
    }
    setStatus('');
  }

  useEffect(() => {
    getLocalOwnerUserId().then(async userId => {
      setOwner(userId);
      if (!userId) {
        setStatus('Sign in is required for versioned program changes.');
        return;
      }
      if (navigator.onLine) {
        try { await reconcileAuthenticatedServerHistory(); } catch {}
      }
      await refresh(userId);
    }).catch(e => setStatus(String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!source || !current?.prescription_snapshot || !isWorkoutPrescription(current.prescription_snapshot)) {
      setAssessment(null);
      setDraft(null);
      return;
    }
    const sessionAssessment = assessTrainingProgression(source);
    const nextAssessment = safetyVerified
      ? applyPersistentSafetyBlocks(sessionAssessment, safetyBlocks)
      : blockProgressionWhenSafetyUnavailable(sessionAssessment);
    setAssessment(nextAssessment);
    setDraft(buildProgramChangeDraft(current.prescription_snapshot, nextAssessment));
  }, [source, current, safetyBlocks, safetyVerified]);

  async function bootstrap() {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc('bootstrap_current_program', {
        p_program_id: DOGFOOD_PROGRAM_ID,
        p_prescription_snapshot: SYNTHETIC_M1_WORKOUT,
      });
      if (error) throw error;
      setStatus('Dogfood current program initialized. This bootstrap path does not perform canonical cutover.');
      await refresh(owner);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function propose() {
    if (!current || !source || !assessment || !draft || draft.status !== 'PROPOSABLE') return;
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const sourceAssessment = {
        ruleVersion: assessment.ruleVersion,
        ruleStatus: assessment.ruleStatus,
        globalSafetyAction: assessment.globalSafetyAction,
        changes: draft.changes,
      };
      const { error } = await supabase.rpc('create_program_change_proposal', {
        p_current_version_id: current.id,
        p_prescription_snapshot: draft.prescription,
        p_source_session_id: source.sessionId,
        p_source_assessment: sourceAssessment,
        p_evidence_refs: draft.evidenceRefs,
      });
      if (error) throw error;
      setStatus('PLANNED program version created. Current program has not changed.');
      await refresh(owner);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function activate() {
    if (!planned) return;
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc('activate_program_version', { p_proposal_id: planned.id });
      if (error) throw error;
      setStatus('Program change explicitly approved and activated. Previous CURRENT version is SUPERSEDED.');
      await refresh(owner);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return <main>
    <h1>Program change</h1>
    <p className="muted">
      B11 dogfood: progression assessment → preview → PLANNED version → explicit activation.
      No recommendation mutates the current program automatically.
    </p>
    <div className="row">
      <Link href="/training-progression"><button>Training progression</button></Link>
      <Link href="/workout/today"><button>Today&apos;s workout</button></Link>
      <Link href="/"><button>Home</button></Link>
    </div>

    {status && <div className="card">{status}</div>}

    {!current && owner && <div className="card">
      <h2>No CURRENT app program yet</h2>
      <p className="muted">Initialize the existing synthetic dogfood prescription as version 1. This is not Health canonical cutover.</p>
      <button className="primary" disabled={busy} onClick={bootstrap}>Initialize current dogfood program</button>
    </div>}

    {current && <div className="card">
      <h2>CURRENT</h2>
      <div>Version {current.version}</div>
      <div className="muted">ID: {current.id}</div>
      <div>{current.prescription_snapshot && isWorkoutPrescription(current.prescription_snapshot)
        ? current.prescription_snapshot.name
        : canonicalRotation
          ? `${canonicalRotation.sourceProgramId} · ${canonicalRotation.workouts.length}-day canonical rotation`
          : 'Prescription unavailable'}</div>
    </div>}

    {canonicalRotation && <div className="card">
      <h2>Canonical rotation progression boundary</h2>
      <p className="muted">Single-workout dogfood proposals cannot replace the canonical A/B/C rotation. Session recommendations remain evidence only until a rotation-aware proposal is explicitly reviewed and accepted.</p>
    </div>}

    {current && !safetyVerified && <div className="card">
      <h2>BLOCKED — safety context unavailable</h2>
      <p className="muted">Program progression remains blocked until the persistent Health safety state can be verified.</p>
    </div>}

    {current && safetyBlocks.length > 0 && <div className="card">
      <h2>ACTIVE BLOCK — bench progression</h2>
      <p className="muted">The recurrent symptom context at the documented problem load is active. No diagnosis is inferred, and no bench increase can be proposed or activated.</p>
    </div>}

    {planned && <div className="card">
      <h2>PLANNED — approval required</h2>
      <div>Version {planned.version}</div>
      <p className="muted">Creating this proposal did not change CURRENT.</p>
      <button className="primary" disabled={busy} onClick={activate}>Approve & activate version {planned.version}</button>
    </div>}

    {current && !canonicalRotation && history.length > 0 && !planned && <>
      <div className="card">
        <label>Source completed exposure
          <select value={sourceId} onChange={e => setSourceId(e.target.value)}>
            {history.map(h => <option key={h.sessionId} value={h.sessionId}>
              {(h.completedAt ? new Date(h.completedAt).toLocaleString() : h.sessionId)} · {h.completionStatus ?? 'COMPLETED'}
            </option>)}
          </select>
        </label>
      </div>

      {assessment && draft && <div className="card">
        <h2>Preview</h2>
        <div>Safety action: <strong>{assessment.globalSafetyAction}</strong></div>
        <div>Rule: {assessment.ruleVersion} · {assessment.ruleStatus}</div>
        <p><strong>{draft.status}</strong></p>
        <p className="muted">{draft.reason}</p>
        {draft.changes.map(change => <div key={change.exerciseId}>
          {exerciseName(change.exerciseId)}: <strong>{change.fromLoadKg} → {change.toLoadKg} kg</strong>
        </div>)}
        {draft.status === 'PROPOSABLE' && <button className="primary" disabled={busy} onClick={propose}>
          Create PLANNED version
        </button>}
      </div>}
    </>}

    {current && !canonicalRotation && history.length === 0 && <div className="card">No completed workout history available for a program-change assessment.</div>}
    {!owner && <p className="muted">Program version lifecycle is account-scoped and unavailable to signed-out guests.</p>}
  </main>;
}
