'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { loadB13Readiness, type B13Readiness } from '@/src/program/b13-readiness';

export default function CanonicalMigrationStagingPage() {
  const [readiness, setReadiness] = useState<B13Readiness | null>(null);
  const [message, setMessage] = useState('Loading verified staging evidence…');

  async function load() {
    setMessage('Loading verified staging evidence…');
    try {
      if (!await getLocalOwnerUserId()) throw new Error('Sign in is required to view account-scoped staging evidence.');
      setReadiness(await loadB13Readiness());
      setMessage('');
    } catch (error) {
      setReadiness(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => { void load(); }, []);

  const checks = readiness?.checks;
  const cutoverPerformed = readiness?.canonicalCutoverPerformed === true;
  return <main>
    <h1>B13 verified staging evidence</h1>
    <p className="muted">Read-only, account-scoped summary. Source rows are not embedded in the client and cannot be restaged from this page.</p>

    <div className="card">
      <h2>{cutoverPerformed ? 'ACTIVATED VERIFIED CANDIDATE' : checks?.nonActiveVerifiedCandidate ? 'VERIFIED NON-ACTIVE CANDIDATE' : 'CANDIDATE NOT VERIFIED'}</h2>
      <p>Canonical prescription rows: <strong>{checks?.canonicalProgramRows ?? '—'}</strong></p>
      <p className="muted">Unspecified numeric starting loads remain unresolved rather than guessed. {cutoverPerformed ? 'The preserved candidate now identifies the active canonical program lineage.' : 'Activation remains disallowed.'}</p>
    </div>

    <div className="card">
      <h2>Validated historical training evidence</h2>
      <p>Source sessions: <strong>{checks?.verifiedSourceSessions ?? '—'}</strong></p>
      <p>Source rows: <strong>{checks?.verifiedTrainingRows ?? '—'}</strong></p>
      <p className="muted">Evidence is verified with source provenance and remains staged separately from immutable dogfood execution history.</p>
    </div>

    <div className="card">
      <h2>{checks?.activeBenchSafetyBlock ? 'ACTIVE BLOCK' : 'BLOCK NOT VERIFIED'} — bench safety</h2>
      <p className="muted">The recurrent symptom at the documented problem load remains a safety block. Symptoms stay separate from technique observations, and no diagnosis is inferred.</p>
    </div>

    <div className="card">
      <h2>Nutrition evidence</h2>
      <p>Verified records: <strong>{checks?.verifiedNutritionRows ?? '—'}</strong></p>
      <p className="muted">Selective coverage, estimated basis, confidence, and missing values are preserved. No daily total is fabricated.</p>
    </div>

    <div className="card">
      <h2>Non-destructive boundary</h2>
      <p>Historical source evidence imported into dogfood tables: <strong>{checks?.historicalSourceNotImported ? 'NO' : 'CHECK REQUIRED'}</strong></p>
      <p>Source of truth: <strong>{readiness?.sourceOfTruth ?? 'Health Master Record'}</strong></p>
      <p>Cutover approval: <strong>{readiness?.cutoverApproved ? 'APPROVED' : 'NOT GRANTED'}</strong></p>
      <p>Cutover performed: <strong>{cutoverPerformed ? 'YES' : 'NO'}</strong></p>
    </div>

    <div className="row">
      <button onClick={load}>Refresh</button>
      <Link href="/canonical-reconciliation"><button>Reconciliation</button></Link>
      <Link href="/cutover-readiness"><button>Cutover readiness</button></Link>
      <Link href="/"><button>Home</button></Link>
    </div>
    {message && <div className="card"><strong>{message}</strong></div>}
  </main>;
}
