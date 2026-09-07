'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listWorkoutHistory, type OfflineWorkoutSession } from '@/src/offline/workout-store';
import { isSupabaseConfigured } from '@/src/backend/supabase-browser';
import { syncPendingWorkoutHistory } from '@/src/sync/run-sync';

export default function History() {
  const [rows, setRows] = useState<OfflineWorkoutSession[]>([]);
  const [status, setStatus] = useState('Loading local history…');
  const [syncStatus, setSyncStatus] = useState('');
  const configured = isSupabaseConfigured();

  async function refresh() {
    const v = await listWorkoutHistory();
    setRows(v);
    setStatus(v.length ? '' : 'No completed local sessions yet.');
  }

  useEffect(() => { refresh().catch(e => setStatus(String(e))); }, []);
  useEffect(() => {
    if (!configured) return;
    const onOnline = () => {
      syncPendingWorkoutHistory().then(refresh).catch(() => undefined);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [configured]);

  async function syncNow() {
    setSyncStatus('Syncing…');
    try {
      const result = await syncPendingWorkoutHistory();
      await refresh();
      setSyncStatus(`Sync attempted: ${result.attempted}; synced: ${result.synced}; failed: ${result.failed}.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return <main>
    <h1>History</h1>
    <p className="muted">Local execution snapshots remain usable regardless of backend availability. App database is not yet canonical.</p>
    <div className="row">
      {configured ? <button onClick={syncNow}>Sync now</button> : <Link href="/auth"><button>Configure / sign in</button></Link>}
      <Link href="/auth">Account</Link>
    </div>
    {syncStatus && <div className="card">{syncStatus}</div>}
    {status && <div className="card">{status}</div>}
    {rows.map(row => <div className="card" key={row.sessionId}>
      <strong>{row.prescribedSnapshot.name}</strong>
      <div>{row.sets.length} sets · {row.completionStatus ?? 'COMPLETED'} · {row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'}</div>
      <div className="muted">Sync: {row.syncState} · local history retained on sync failure</div>
      {row.recommendation && <p><strong>{String((row.recommendation.decision as {action?: string})?.action ?? 'Recommendation stored')}</strong></p>}
    </div>)}
  </main>;
}
