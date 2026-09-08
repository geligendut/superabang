'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listWorkoutHistory, type OfflineWorkoutSession } from '@/src/offline/workout-store';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/src/backend/supabase-browser';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { reconcileAuthenticatedServerHistory } from '@/src/sync/reconcile-history';
import { syncPendingWorkoutHistory } from '@/src/sync/run-sync';

export default function History() {
  const [rows, setRows] = useState<OfflineWorkoutSession[]>([]);
  const [status, setStatus] = useState('Loading local history…');
  const [syncStatus, setSyncStatus] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [ownerResolved, setOwnerResolved] = useState(false);
  const configured = isSupabaseConfigured();

  async function refresh(owner = ownerUserId) {
    const v = await listWorkoutHistory(owner);
    setRows(v);
    setStatus(v.length ? '' : owner
      ? 'No completed local sessions for this signed-in account.'
      : 'No completed local guest sessions on this device.');
  }

  async function reconcileThenRefresh(owner: string) {
    if (!navigator.onLine) return refresh(owner);
    try {
      await reconcileAuthenticatedServerHistory();
    } catch {
      // Local-first invariant: server recovery failure must not hide or block local history.
    }
    await refresh(owner);
  }

  useEffect(() => {
    getLocalOwnerUserId()
      .then(async owner => {
        setOwnerUserId(owner);
        setOwnerResolved(true);
        await refresh(owner);
        if (owner) await reconcileThenRefresh(owner);
      })
      .catch(e => { setOwnerResolved(true); setStatus(String(e)); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const owner = session?.user.id ?? null;
      setOwnerUserId(owner);
      setSyncStatus('');
      refresh(owner)
        .then(() => owner ? reconcileThenRefresh(owner) : undefined)
        .catch(e => setStatus(String(e)));
    });
    return () => listener.subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const onOnline = () => {
      if (!ownerUserId) return;
      syncPendingWorkoutHistory()
        .then(() => reconcileAuthenticatedServerHistory())
        .then(() => refresh(ownerUserId))
        .catch(() => undefined);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, ownerUserId]);

  async function syncNow() {
    if (!ownerUserId) {
      setSyncStatus('Sign in before server sync. Local guest history remains on this device.');
      return;
    }
    setSyncStatus('Syncing…');
    try {
      const result = await syncPendingWorkoutHistory();
      const recovery = await reconcileAuthenticatedServerHistory();
      await refresh(ownerUserId);
      setSyncStatus(`Sync attempted: ${result.attempted}; synced: ${result.synced}; failed: ${result.failed}; blocked: ${result.blocked}. Server history reconciled: ${recovery.reconciled}.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return <main>
    <h1>History</h1>
    <p className="muted">Local execution snapshots are account-scoped on this device. Signed-in server history can rebuild the local cache. App database is not yet canonical.</p>
    <div className="row">
      {configured && ownerResolved && ownerUserId
        ? <button onClick={syncNow}>Sync now</button>
        : <Link href="/auth"><button>{configured ? 'Sign in to sync' : 'Configure / sign in'}</button></Link>}
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
