'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { listWorkoutHistory } from '@/src/offline/workout-store';

interface GateCheck {
  id: string;
  label: string;
  status: 'PASS'|'BLOCKED'|'PENDING';
  detail: string;
}

const TABLES = [
  'program_version', 'workout_session', 'workout_set_log',
  'symptom_observation', 'technique_observation', 'recommendation_snapshot',
  'body_measurement', 'nutrition_meal', 'food_menu_evidence',
] as const;

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

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const ownerUserId = await getLocalOwnerUserId();
      if (!ownerUserId) {
        setChecks([{ id:'auth', label:'Authenticated account', status:'BLOCKED', detail:'Sign in is required before cutover readiness can be evaluated.' }]);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const [
        { data: currentRows, error: currentError },
        { data: plannedRows, error: plannedError },
        { data: exportEvidence, error: exportEvidenceError },
        localHistory,
      ] = await Promise.all([
        supabase.from('program_version').select('id,version,status').eq('status','CURRENT'),
        supabase.from('program_version').select('id,version,status').eq('status','PLANNED'),
        supabase.from('cutover_evidence').select('status,observed_at,metadata').eq('evidence_type', EXPORT_EVIDENCE_TYPE).maybeSingle(),
        listWorkoutHistory(ownerUserId),
      ]);
      if (currentError) throw currentError;
      if (plannedError) throw plannedError;
      if (exportEvidenceError) throw exportEvidenceError;

      const { count: serverHistoryCount, error: historyError } = await supabase
        .from('workout_session')
        .select('id', { count:'exact', head:true })
        .not('completed_at','is',null);
      if (historyError) throw historyError;

      const currentCount = currentRows?.length ?? 0;
      const plannedCount = plannedRows?.length ?? 0;
      const localCount = localHistory.length;
      const serverCount = serverHistoryCount ?? 0;
      const exportPassed = exportEvidence?.status === 'PASS';
      const exportObservedAt = exportEvidence?.observed_at ? new Date(exportEvidence.observed_at).toLocaleString() : null;

      setChecks([
        { id:'auth', label:'Authenticated account', status:'PASS', detail:'Account-scoped evaluation is active.' },
        { id:'current', label:'Exactly one CURRENT program', status: currentCount === 1 ? 'PASS' : 'BLOCKED', detail:`CURRENT versions visible to this account: ${currentCount}.` },
        { id:'planned', label:'No unresolved PLANNED version', status: plannedCount === 0 ? 'PASS' : 'BLOCKED', detail:`PLANNED versions visible to this account: ${plannedCount}.` },
        { id:'sync', label:'Completed workout reconciliation', status: localCount === serverCount ? 'PASS' : 'BLOCKED', detail:`Local completed history: ${localCount}; server completed history: ${serverCount}.` },
        { id:'export', label:'Account export executed', status: exportPassed ? 'PASS' : 'PENDING', detail: exportPassed ? `Persistent account-scoped export evidence recorded${exportObservedAt ? ` at ${exportObservedAt}` : ''}.` : 'Generate and retain an account export before cutover.' },
        { id:'canonical', label:'Health canonical reconciliation', status:'PENDING', detail:'Existing Health workflow / Master Record remains authoritative until explicit reconciliation and cutover approval.' },
      ]);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const blocked = checks.filter(c => c.status === 'BLOCKED').length;
    const pending = checks.filter(c => c.status === 'PENDING').length;
    return blocked ? 'NOT READY' : pending ? 'PENDING GATES' : 'READY FOR CUTOVER REVIEW';
  }, [checks]);

  async function exportAccountData() {
    setMessage('Building account-scoped JSON export…');
    try {
      const ownerUserId = await getLocalOwnerUserId();
      if (!ownerUserId) throw new Error('AUTH_REQUIRED');

      const supabase = getSupabaseBrowserClient();
      const exportedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        exportVersion: 'superabang-account-export-0.1.0',
        exportedAt,
        canonicalStatus: 'DOGFOOD_NOT_CANONICAL',
      };

      for (const table of TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`${table}: ${error.message}`);
        payload[table] = data ?? [];
      }
      payload.localWorkoutHistory = await listWorkoutHistory(ownerUserId);

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `superabang-account-export-${exportedAt.slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const { error: evidenceError } = await supabase.rpc('record_cutover_export_evidence', {
        p_export_version: 'superabang-account-export-0.1.0',
        p_canonical_status: 'DOGFOOD_NOT_CANONICAL',
        p_observed_at: exportedAt,
      });
      if (evidenceError) throw evidenceError;

      setMessage('Account-scoped export generated and persistent evidence recorded. Keep the file until cutover/recovery testing is complete.');
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return <main>
    <h1>Cutover readiness</h1>
    <p className="muted">B12 hardening gate. This page does not perform canonical cutover.</p>
    <div className="card"><h2>{summary}</h2><p className="muted">Any BLOCKED or PENDING item prevents canonical Health cutover.</p></div>
    {checks.map(check => <div className="card" key={check.id}><h2>{check.status} — {check.label}</h2><p className="muted">{check.detail}</p></div>)}
    <div className="row">
      <button className="primary" onClick={exportAccountData} disabled={loading}>Generate account export</button>
      <button onClick={load} disabled={loading}>Refresh checks</button>
      <Link href="/"><button>Home</button></Link>
    </div>
    {message && <div className="card"><strong>{message}</strong></div>}
  </main>;
}
