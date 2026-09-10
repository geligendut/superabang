'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLocalOwnerUserId } from '@/src/backend/local-owner';
import { loadB13Readiness, type B13Readiness } from '@/src/program/b13-readiness';

const CHECK_LABELS: Record<string, string> = {
  oneCurrentDogfoodProgram: 'Exactly one dogfood CURRENT program preserved',
  nonActiveVerifiedCandidate: 'Canonical candidate verified and non-active',
  nutritionSemanticsPreserved: 'Nutrition uncertainty and selective coverage preserved',
  activeBenchSafetyBlock: 'Recurrent bench symptom carried as an active safety block',
  latestAppBodyMeasurementPreserved: 'Latest app body measurement preserved',
  historicalSourceNotImported: 'Dogfood history remains separate from staged source evidence',
};

const CUTOVER_CHECK_LABELS: Record<string, string> = {
  oneCurrentProgram: 'Exactly one CURRENT program',
  activeCanonicalProgram: 'Canonical A/B/C program is CURRENT',
  dogfoodProgramSuperseded: 'Prior dogfood program is retained as SUPERSEDED',
  dogfoodHistoryPreserved: 'Dogfood execution evidence remains unchanged',
  nutritionSemanticsPreserved: CHECK_LABELS.nutritionSemanticsPreserved,
  activeBenchSafetyBlock: CHECK_LABELS.activeBenchSafetyBlock,
  latestAppBodyMeasurementPreserved: CHECK_LABELS.latestAppBodyMeasurementPreserved,
  historicalSourceNotImported: CHECK_LABELS.historicalSourceNotImported,
};

export default function CanonicalReconciliationPage() {
  const [readiness, setReadiness] = useState<B13Readiness | null>(null);
  const [message, setMessage] = useState('Loading verified reconciliation state…');

  async function load() {
    setMessage('Loading verified reconciliation state…');
    try {
      if (!await getLocalOwnerUserId()) throw new Error('Sign in is required to view account-scoped reconciliation evidence.');
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
  const visibleChecks = cutoverPerformed ? CUTOVER_CHECK_LABELS : CHECK_LABELS;
  return <main>
    <h1>Health canonical reconciliation</h1>
    <p className="muted">Read-only B13 evidence. This page cannot activate a program or change the source of truth.</p>

    <div className="card">
      <h2>{readiness?.technicalStatus ?? 'UNAVAILABLE'}</h2>
      <p>Authoritative source: <strong>{readiness?.sourceOfTruth ?? 'Health Master Record'}</strong></p>
      {readiness?.sourceRevision && <p className="muted">Verified source revision: {readiness.sourceRevision}</p>}
      <p><strong>Cutover approved:</strong> {readiness?.cutoverApproved ? 'YES' : 'NO'}</p>
      <p><strong>Canonical cutover performed:</strong> {readiness?.canonicalCutoverPerformed ? 'YES' : 'NO'}</p>
    </div>

    {checks && Object.entries(visibleChecks).map(([key, label]) => {
      const passed = checks[key as keyof typeof checks] === true;
      return <div className="card" key={key}>
        <h2>{passed ? 'PASS' : 'BLOCKED'} — {label}</h2>
      </div>;
    })}

    <div className="card">
      <h2>{cutoverPerformed ? 'Cutover lineage' : 'Approval boundary'}</h2>
      <p className="muted">{cutoverPerformed
        ? 'Explicit approval has been performed. Superabang is authoritative; the source revision, original candidate, superseded dogfood versions, and immutable execution evidence remain retained.'
        : 'Technical readiness does not equal approval. The verified candidate remains non-active, dogfood remains CURRENT, and the Health Master Record remains authoritative.'}</p>
      {readiness?.cutoverPerformedAt && <p className="muted">Performed: {new Date(readiness.cutoverPerformedAt).toLocaleString()}</p>}
    </div>

    <div className="row">
      <button onClick={load}>Refresh</button>
      <Link href="/canonical-migration-staging"><button>Evidence summary</button></Link>
      <Link href="/cutover-readiness"><button>Cutover readiness</button></Link>
      <Link href="/"><button>Home</button></Link>
    </div>
    {message && <div className="card"><strong>{message}</strong></div>}
  </main>;
}
