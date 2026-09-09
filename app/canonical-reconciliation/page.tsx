'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';

type ReconStatus = 'MATCH'|'MIGRATE'|'SUPERSEDE_DOGFOOD'|'PRESERVE_HISTORY'|'BLOCKED'|'PENDING';

interface ReconItem {
  domain: string;
  sourceKey: string;
  classification: ReconStatus;
  proposedAction: string;
  sourceSnapshot: Record<string, unknown>;
  targetSnapshot: Record<string, unknown>;
  notes: string;
}

const SOURCE_REF = 'Health & Fitness Master Record v0.1';
const SOURCE_REVISION = '2026-09-09T07:55:21.896Z';

const ITEMS: ReconItem[] = [
  {
    domain: 'PROGRAM',
    sourceKey: 'HLT-PRG-0001',
    classification: 'MIGRATE',
    proposedAction: 'Import canonical 12-Week Recomp + SBD Base v1.0 into a non-active canonical-candidate representation. Do not activate during staging.',
    sourceSnapshot: { status:'CURRENT', name:'12-Week Recomp + SBD Base', version:'v1.0', startDate:'2026-08-31', targetEndDate:'2026-11-22', weeklyFrequency:3, reviewDate:'2026-09-28' },
    targetSnapshot: { currentAppProgram:'M1 Synthetic Upper Session', appCurrentIsCanonical:false },
    notes: 'Canonical source contains the full 3-day program. The current app program is development dogfood only.'
  },
  {
    domain: 'PROGRAM',
    sourceKey: 'M1-SYNTHETIC-UPPER',
    classification: 'SUPERSEDE_DOGFOOD',
    proposedAction: 'Preserve all dogfood program/version lineage, but classify it as development history and prevent promotion to Health canonical state.',
    sourceSnapshot: { canonicalSourceProgram:'HLT-PRG-0001' },
    targetSnapshot: { appProgramName:'M1 Synthetic Upper Session', currentBenchWorkingKg:51, exercises:['Bench Press','Lat Pulldown'] },
    notes: 'The 50→51 kg progression remains valid engine-test evidence, not a canonical Health prescription.'
  },
  {
    domain: 'TRAINING_HISTORY',
    sourceKey: 'HLT-TRN-THROUGH-20260906',
    classification: 'MIGRATE',
    proposedAction: 'Import validated historical sessions from the Health Master Record with source identifiers and immutable provenance. Do not rewrite existing app dogfood sessions.',
    sourceSnapshot: { validatedSessions:['HLT-TRN-20260829-01','HLT-TRN-20260830-C','HLT-TRN-20260904-A','HLT-TRN-20260906-B'], latestCanonicalSessionDate:'2026-09-06' },
    targetSnapshot: { appCompletedDogfoodSessions:2 },
    notes: 'Historical source sessions and app dogfood sessions are different evidence populations and must both be retained.'
  },
  {
    domain: 'SAFETY',
    sourceKey: 'BENCH-55KG-20260906',
    classification: 'BLOCKED',
    proposedAction: 'Carry forward recurrent upper-left trapezius/superior-scapular symptom context and the problem-load regression rule before any canonical bench progression can be enabled.',
    sourceSnapshot: { exercise:'Flat Barbell Bench Press', loadKg:55, recurrence:true, finalSet:'3 reps of target 5', sourceDecision:'regress/rebuild; microload only if pain-free' },
    targetSnapshot: { appDogfoodProgression:'50→51 kg candidate from synthetic exposure' },
    notes: 'This safety context blocks automatic promotion of the synthetic progression to canonical programming.'
  },
  {
    domain: 'BODY',
    sourceKey: 'LATEST-APP-MEASUREMENT-20260908',
    classification: 'MATCH',
    proposedAction: 'Retain latest app measurement as current operational body data while preserving historical medical/body-composition measurements as historical evidence.',
    sourceSnapshot: { healthMasterCurrentProfileWeight:'DRAFT/blank', healthMasterCurrentProfileWaist:'DRAFT/blank', historicalMeasurementsPresent:true },
    targetSnapshot: { measuredAt:'2026-09-08', weightKg:86.8, waistCm:104.5 },
    notes: 'Latest app measurement is more current than historical medical measurements. Historical data must not overwrite it.'
  },
  {
    domain: 'NUTRITION',
    sourceKey: 'HLT-NUT-ACCEPTED-THROUGH-20260909',
    classification: 'MIGRATE',
    proposedAction: 'Import accepted Health nutrition observations as historical qualitative records while preserving estimate/confidence semantics. Do not fabricate missing calories/macros.',
    sourceSnapshot: { acceptedRecordsThrough:'2026-09-09', selectiveSample:true, estimatesNotMeasurements:true },
    targetSnapshot: { appDogfoodMeals:1, appNutritionBasis:'UNKNOWN' },
    notes: 'Migration must preserve partial/selective coverage and uncertainty; it must never turn estimates into exact daily totals.'
  }
];

export default function CanonicalReconciliationPage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [existingBatchId, setExistingBatchId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('canonical_reconciliation_batch')
        .select('id,status,created_at,source_revision')
        .eq('source_system','HEALTH_MASTER_RECORD')
        .eq('source_revision', SOURCE_REVISION)
        .order('created_at', { ascending:false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setExistingBatchId(data?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const blockers = useMemo(() => ITEMS.filter(item => item.classification === 'BLOCKED'), []);
  const migrationItems = useMemo(() => ITEMS.filter(item => item.classification === 'MIGRATE'), []);

  async function stagePackage() {
    setLoading(true);
    setMessage('Staging reconciliation package…');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('stage_health_master_reconciliation_v1', {
        p_source_ref: SOURCE_REF,
        p_source_revision: SOURCE_REVISION,
        p_summary: {
          gate: 'B13_HEALTH_CANONICAL_RECONCILIATION',
          status: 'CUTOVER_BLOCKED',
          blockerCount: blockers.length,
          migrationItemCount: migrationItems.length,
          canonicalCutoverPerformed: false,
          sourceOfTruth: 'HEALTH_MASTER_RECORD'
        },
        p_items: ITEMS
      });
      if (error) throw error;
      setBatchId(String(data));
      setMessage('Reconciliation package staged as DRAFT. No canonical activation or source-of-truth cutover occurred.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return <main>
    <h1>Health canonical reconciliation</h1>
    <p className="muted">B13 staging only. No program activation, historical rewrite, or canonical cutover is performed here.</p>
    <div className="card"><h2>CUTOVER BLOCKED</h2><p className="muted">The app CURRENT is still a synthetic dogfood program. The authoritative Health Master Record has a different CURRENT program and safety context.</p></div>
    <div className="card"><h2>Authoritative source</h2><p><strong>{SOURCE_REF}</strong></p><p className="muted">Source revision: {SOURCE_REVISION}</p><p>Canonical program: <strong>HLT-PRG-0001 — 12-Week Recomp + SBD Base v1.0</strong></p></div>
    {ITEMS.map(item => <div className="card" key={`${item.domain}-${item.sourceKey}`}><h2>{item.classification} — {item.domain}</h2><p><strong>{item.sourceKey}</strong></p><p>{item.proposedAction}</p><p className="muted">{item.notes}</p></div>)}
    <div className="card"><h2>Staging boundary</h2><p>Staging stores the reconciliation plan and provenance only. It does not create a new CURRENT program, does not supersede Health Master Record, and does not modify historical workout evidence.</p><p className="muted">{existingBatchId ? `A DRAFT for this source revision already exists: ${existingBatchId}` : 'No staged batch found for this source revision yet.'}</p></div>
    <div className="row">
      <button className="primary" onClick={stagePackage} disabled={loading || Boolean(existingBatchId)}>{existingBatchId ? 'Package already staged' : 'Stage reconciliation package'}</button>
      <button onClick={load} disabled={loading}>Refresh</button>
      <Link href="/cutover-readiness"><button>Cutover readiness</button></Link>
      <Link href="/"><button>Home</button></Link>
    </div>
    {(batchId || message) && <div className="card">{batchId && <p><strong>Batch:</strong> {batchId}</p>}{message && <strong>{message}</strong>}</div>}
  </main>;
}
