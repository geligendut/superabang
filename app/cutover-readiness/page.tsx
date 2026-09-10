'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { listWorkoutHistory } from '@/src/offline/workout-store';
import { withTimeout } from '@/src/backend/async-timeout';
import { loadB13Readiness } from '@/src/program/b13-readiness';
import { ACCOUNT_EXPORT_TABLES, ACCOUNT_EXPORT_VERSION } from '@/src/export/account-export';

interface GateCheck {
  id: string;
  label: string;
  status: 'PASS'|'BLOCKED'|'PENDING';
  detail: string;
}

interface ExportEvidenceRow {
  status?: 'PASS'|'PENDING'|'BLOCKED';
  observed_at?: string;
  metadata?: {
    phase?: string;
    exportVersion?: string;
    canonicalStatus?: string;
    confirmedAt?: string;
  };
}

const EXPORT_EVIDENCE_TYPE = 'ACCOUNT_EXPORT_V1';

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const parts = [value.code, value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);
    if (parts.length) return parts.join(' · ');
    try { return JSON.stringify(error); } catch { return 'Unknown error object'; }
  }
  return String(error);
}

export default function CutoverReadinessPage() {
  const [checks, setChecks] = useState<GateCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [exportEvidence, setExportEvidence] = useState<ExportEvidenceRow | null>(null);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const ownerUserId = await getLocalOwnerUserId();
      if (!ownerUserId) {
        setChecks([{ id:'auth', label:'Authenticated account', status:'BLOCKED', detail:'Sign in is required before cutover readiness can be evaluated.' }]);
        setExportEvidence(null);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const [
        { data: currentRows, error: currentError },
        { data: plannedRows, error: plannedError },
        { data: evidence, error: exportEvidenceError },
        localHistory,
        b13Readiness,
      ] = await withTimeout(Promise.all([
        supabase.from('program_version').select('id,version,status').eq('status','CURRENT'),
        supabase.from('program_version').select('id,version,status').eq('status','PLANNED'),
        supabase.from('cutover_evidence').select('status,observed_at,metadata').eq('evidence_type', EXPORT_EVIDENCE_TYPE).maybeSingle(),
        listWorkoutHistory(ownerUserId),
        loadB13Readiness(),
      ]), 10_000, 'Cutover readiness checks');
      if (currentError) throw currentError;
      if (plannedError) throw plannedError;
      if (exportEvidenceError) throw exportEvidenceError;

      const { count: serverHistoryCount, error: historyError } = await supabase
        .from('workout_session')
        .select('id', { count:'exact', head:true })
        .not('completed_at','is',null);
      if (historyError) throw historyError;

      const typedEvidence = (evidence ?? null) as ExportEvidenceRow | null;
      setExportEvidence(typedEvidence);

      const currentCount = currentRows?.length ?? 0;
      const plannedCount = plannedRows?.length ?? 0;
      const localCount = localHistory.length;
      const serverCount = serverHistoryCount ?? 0;
      const exportPassed = typedEvidence?.status === 'PASS' && typedEvidence?.metadata?.phase === 'CONFIRMED_SAVED';
      const exportPrepared = typedEvidence?.status === 'PENDING' && typedEvidence?.metadata?.phase === 'PREPARED';
      const exportObservedAt = typedEvidence?.observed_at ? new Date(typedEvidence.observed_at).toLocaleString() : null;
      const canonicalComplete = b13Readiness.technicalStatus === 'CUTOVER_EXECUTED'
        && b13Readiness.canonicalCutoverPerformed;
      const canonicalTechnicallyValid = canonicalComplete
        || b13Readiness.technicalStatus === 'CUTOVER_READY_AWAITING_APPROVAL';

      setChecks([
        { id:'auth', label:'Authenticated account', status:'PASS', detail:'Account-scoped evaluation is active.' },
        { id:'current', label:'Exactly one CURRENT program', status: currentCount === 1 ? 'PASS' : 'BLOCKED', detail:`CURRENT versions visible to this account: ${currentCount}.` },
        { id:'planned', label:'No unresolved PLANNED version', status: plannedCount === 0 ? 'PASS' : 'BLOCKED', detail:`PLANNED versions visible to this account: ${plannedCount}.` },
        { id:'sync', label:'Completed workout reconciliation', status: localCount === serverCount ? 'PASS' : 'BLOCKED', detail:`Local completed history: ${localCount}; server completed history: ${serverCount}.` },
        {
          id:'export',
          label:'Account export executed',
          status: exportPassed ? 'PASS' : 'PENDING',
          detail: exportPassed
            ? `Export retention explicitly confirmed${exportObservedAt ? ` at ${exportObservedAt}` : ''}.`
            : exportPrepared
              ? 'Export was prepared and download was initiated. Confirm the file is saved on this device.'
              : 'Generate and retain an account export before cutover.'
        },
        {
          id:'canonical-technical',
          label:'Health canonical reconciliation',
          status: canonicalTechnicallyValid ? 'PASS' : 'BLOCKED',
          detail: canonicalComplete
            ? 'Canonical program, retained history, safety, body, nutrition semantics and provenance are verified after cutover.'
            : canonicalTechnicallyValid
              ? 'Candidate, historical evidence, safety, body, nutrition semantics and provenance are technically verified.'
            : `Technical reconciliation status: ${b13Readiness.technicalStatus}.`,
        },
        {
          id:'canonical-approval',
          label:'Explicit canonical cutover approval',
          status: canonicalComplete ? 'PASS' : 'PENDING',
          detail: canonicalComplete
            ? `Approved and performed${b13Readiness.cutoverPerformedAt ? ` at ${new Date(b13Readiness.cutoverPerformedAt).toLocaleString()}` : ''}. Superabang is authoritative.`
            : 'Not granted. Health Master Record remains authoritative and the verified candidate remains non-active.',
        },
      ]);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    if (loading) return 'CHECKING';
    const blocked = checks.filter(c => c.status === 'BLOCKED').length;
    const pending = checks.filter(c => c.status === 'PENDING').length;
    return blocked ? 'NOT READY' : pending ? 'PENDING GATES' : 'CUTOVER COMPLETE';
  }, [checks, loading]);

  async function exportAccountData() {
    setMessage('Building account-scoped JSON export…');
    try {
      const ownerUserId = await getLocalOwnerUserId();
      if (!ownerUserId) throw new Error('AUTH_REQUIRED');

      const supabase = getSupabaseBrowserClient();
      const exportedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        exportVersion: ACCOUNT_EXPORT_VERSION,
        exportedAt,
        canonicalStatus: 'SUPERABANG_CANONICAL',
      };

      for (const table of ACCOUNT_EXPORT_TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`${table}: ${error.message}`);
        payload[table] = data ?? [];
      }
      payload.localWorkoutHistory = await listWorkoutHistory(ownerUserId);

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });

      const { error: prepareError } = await supabase.rpc('prepare_cutover_export_evidence', {
        p_export_version: ACCOUNT_EXPORT_VERSION,
        p_canonical_status: 'SUPERABANG_CANONICAL',
        p_observed_at: exportedAt,
      });
      if (prepareError) throw prepareError;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `superabang-account-export-${exportedAt.slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage('Export prepared and download initiated. After saving the file, return here and confirm it is retained.');
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function confirmExportSaved() {
    setMessage('Confirming retained export…');
    try {
      const ownerUserId = await getLocalOwnerUserId();
      if (!ownerUserId) throw new Error('AUTH_REQUIRED');

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc('confirm_cutover_export_saved', {
        p_confirmed_at: new Date().toISOString(),
      });
      if (error) throw error;

      setMessage('Export retention confirmed and persistent evidence recorded.');
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  const exportPrepared = exportEvidence?.status === 'PENDING' && exportEvidence?.metadata?.phase === 'PREPARED';

  return <main>
    <h1>Cutover readiness</h1>
    <p className="muted">B12 hardening plus B13 canonical state and retained-evidence verification. This page is read-only for program authority.</p>
    <div className="card"><h2>{summary}</h2><p className="muted">Any BLOCKED or PENDING item indicates a reconciliation or operational follow-up.</p></div>
    {checks.map(check => <div className="card" key={check.id}><h2>{check.status} — {check.label}</h2><p className="muted">{check.detail}</p></div>)}
    <div className="row">
      <button className="primary" onClick={exportAccountData} disabled={loading}>Generate account export</button>
      {exportPrepared && <button onClick={confirmExportSaved} disabled={loading}>I saved the export</button>}
      <button onClick={load} disabled={loading}>Refresh checks</button>
      <Link href="/"><button>Home</button></Link>
    </div>
    {message && <div className="card"><strong>{message}</strong></div>}
  </main>;
}
