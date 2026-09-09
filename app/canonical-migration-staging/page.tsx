'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';

const SOURCE_REVISION = '2026-09-09T07:55:21.896Z';

const PROGRAM_ROWS = [
  {day:'Day A',exercise:'Back Squat',sets:3,reps:'5',intensity:'3×5 @ RPE 7–8',rpeTarget:8,progressionRule:'Increase only after clean sets within target RPE.',regressionRule:'Hold/reduce 5–10% if form/recovery deteriorates.',painModification:'Modify/stop for acute pain or worsening ankle instability.',warmup:'3–5 ramp-up sets.',prehab:'Ankle/hip/bracing prep.',recoveryRequirement:'1+ rest day between sessions.',successCriteria:'Waist down; definition up; SBD maintained/up; pain stable.',notes:'No routine grinders.'},
  {day:'Day A',exercise:'Incline Bench Press 15–30°',sets:4,reps:'6–10',intensity:'4×6–10 @ RPE 7–8',rpeTarget:8,progressionRule:'Double progression: reps first, then load.',regressionRule:'Hold/reduce if shoulder discomfort or anterior-delt dominance.',painModification:'Pain-free angle/ROM.',warmup:'2–3 ramp-up sets.',prehab:'Scapular setup.',recoveryRequirement:'Do not impair flat-bench recovery.',successCriteria:'Upper chest and incline performance improve pain-free.',notes:'Priority hypertrophy lift; rep range 6–10.'},
  {day:'Day A',exercise:'Lat Pulldown / Pull-up',sets:3,reps:'8–12',intensity:'3×8–12 @ RPE 8',rpeTarget:8,progressionRule:'Reps first, then load with full ROM.',regressionRule:'Reduce if swing/ROM loss.',painModification:'Pain-free grip/path.',warmup:'0–1 feeler set.',prehab:'Optional scapular prep.',recoveryRequirement:'Superset only if incline quality stays high.',successCriteria:'Back volume progresses pain-free.',notes:'Rep range 8–12.'},
  {day:'Day A',exercise:'Lateral Raise',sets:3,reps:'12–20',intensity:'3×12–20 @ RPE 8–9',rpeTarget:9,progressionRule:'Controlled reps before load.',regressionRule:'Reduce if shrug/swing dominates.',painModification:'Pain-free ROM.',warmup:'Optional feeler.',prehab:'General shoulder prep.',recoveryRequirement:'Can superset with triceps.',successCriteria:'Delt volume consistent pain-free.',notes:'Rep range 12–20.'},
  {day:'Day A',exercise:'Cable Triceps Extension',sets:2,reps:'10–15',intensity:'2×10–15 @ RPE 8',rpeTarget:8,progressionRule:'Reps first, then load.',regressionRule:'Reduce for elbow discomfort/swing.',painModification:'Pain-free elbow position.',warmup:'Usually none.',prehab:'None.',recoveryRequirement:'Can superset with lateral raise.',successCriteria:'Completed pain-free.',notes:'Rep range 10–15.'},
  {day:'Day B',exercise:'Flat Barbell Bench Press',sets:3,reps:'5',intensity:'3×5 @ RPE 7–8',rpeTarget:8,progressionRule:'Increase after clean sets within RPE.',regressionRule:'Hold/reduce if grinding or bar path degrades.',painModification:'Modify grip/ROM if shoulder pain.',warmup:'3–5 ramp-up sets.',prehab:'Scapular setup.',recoveryRequirement:'Keep 2–3 RIR.',successCriteria:'Bench maintained/up while waist trends down.',notes:'Strength anchor.'},
  {day:'Day B',exercise:'Romanian Deadlift',sets:3,reps:'6–8',intensity:'3×6–8 @ RPE 7–8',rpeTarget:8,progressionRule:'Progress with stable hinge.',regressionRule:'Reduce load/ROM if lumbar compensation.',painModification:'Stop/modify for sharp escalating back pain.',warmup:'2–3 ramp-up sets.',prehab:'Hinge rehearsal.',recoveryRequirement:'Do not turn into max deadlift.',successCriteria:'Recoverable posterior-chain stimulus.',notes:'Rep range 6–8.'},
  {day:'Day B',exercise:'Seated Cable Row',sets:3,reps:'8–12',intensity:'3×8–12 @ RPE 8',rpeTarget:8,progressionRule:'Reps first, then load.',regressionRule:'Reduce if torso momentum dominates.',painModification:'Pain-free shoulder path.',warmup:'0–1 feeler set.',prehab:'Optional scapular prep.',recoveryRequirement:'May superset with cable fly.',successCriteria:'Back volume progresses pain-free.',notes:'Rep range 8–12.'},
  {day:'Day B',exercise:'Low-to-high Cable Fly',sets:3,reps:'10–15',intensity:'3×10–15 @ RPE 8',rpeTarget:8,progressionRule:'Reps before load; upper-chest line of pull.',regressionRule:'Reduce if shoulder takes over.',painModification:'Pain-free ROM.',warmup:'Usually none.',prehab:'Shoulder prep.',recoveryRequirement:'May superset with row.',successCriteria:'Upper-chest isolation pain-free.',notes:'Rep range 10–15.'},
  {day:'Day B',exercise:'Rear Delt Fly / Face Pull',sets:3,reps:'12–20',intensity:'3×12–20 @ RPE 8–9',rpeTarget:9,progressionRule:'Controlled reps before load.',regressionRule:'Reduce if traps dominate.',painModification:'Pain-free.',warmup:'Optional feeler.',prehab:'None.',recoveryRequirement:'Can superset with biceps.',successCriteria:'Rear-delt volume progresses pain-free.',notes:'Rep range 12–20.'},
  {day:'Day B',exercise:'Biceps Curl',sets:2,reps:'10–15',intensity:'2×10–15 @ RPE 8',rpeTarget:8,progressionRule:'Reps before load.',regressionRule:'Reduce if swinging.',painModification:'Pain-free elbow/wrist.',warmup:'Usually none.',prehab:'None.',recoveryRequirement:'May superset with rear delt.',successCriteria:'Clean arm reps.',notes:'Rep range 10–15.'},
  {day:'Day C',exercise:'Deadlift',sets:3,reps:'1×5 top + 2×5 back-off',intensity:'1×5 top + 2×5 back-off @ RPE 7–8',rpeTarget:8,progressionRule:'Increase only when stable/recoverable.',regressionRule:'Hold/reduce if bracing/bar path deteriorates.',painModification:'Stop/modify for acute back pain/asymmetry.',warmup:'3–5 ramp-up sets.',prehab:'Brace + hinge rehearsal.',recoveryRequirement:'No routine grinders.',successCriteria:'Deadlift maintained/up without excessive fatigue.',notes:'Strength anchor.'},
  {day:'Day C',exercise:'Light Squat',sets:3,reps:'5',intensity:'3×5 @ ~70–75% Day A; RPE 6–7',rpeTarget:7,progressionRule:'Progress only if fast/symmetric/clean.',regressionRule:'Reduce if left-right instability.',painModification:'Modify if ankle instability worsens.',warmup:'2–3 ramp-up sets.',prehab:'Ankle/hip/bracing prep.',recoveryRequirement:'Technique practice, not fatigue.',successCriteria:'Stable technique; no increased ankle symptoms.',notes:'Secondary squat exposure.'},
  {day:'Day C',exercise:'Incline Press',sets:3,reps:'8–12',intensity:'3×8–12 @ RPE 8',rpeTarget:8,progressionRule:'Double progression: reps then load.',regressionRule:'Reduce if shoulder takes over/recovery poor.',painModification:'Pain-free angle/ROM.',warmup:'2 ramp-up sets.',prehab:'Scapular setup.',recoveryRequirement:'Hypertrophy focus; no max loading.',successCriteria:'Upper-chest volume progresses pain-free.',notes:'Rep range 8–12.'},
  {day:'Day C',exercise:'Lat Pulldown / Cable Row',sets:3,reps:'8–12',intensity:'3×8–12 @ RPE 8',rpeTarget:8,progressionRule:'Reps first, then load.',regressionRule:'Reduce if ROM/posture deteriorates.',painModification:'Pain-free shoulder path.',warmup:'0–1 feeler set.',prehab:'Optional scapular prep.',recoveryRequirement:'Can superset with lateral raise.',successCriteria:'Back volume supports V-taper without hurting SBD.',notes:'Rep range 8–12.'},
  {day:'Day C',exercise:'Lateral Raise',sets:3,reps:'12–20',intensity:'3×12–20 @ RPE 8–9',rpeTarget:9,progressionRule:'Controlled reps before load.',regressionRule:'Reduce if momentum dominates.',painModification:'Pain-free ROM.',warmup:'Optional feeler.',prehab:'None.',recoveryRequirement:'Can superset with arms.',successCriteria:'Consistent delt volume pain-free.',notes:'Rep range 12–20.'},
  {day:'Day C',exercise:'Biceps + Triceps',sets:2,reps:'10–15 each',intensity:'2×10–15 each @ RPE 8',rpeTarget:8,progressionRule:'Reps before load.',regressionRule:'Reduce for sloppy technique/joint discomfort.',painModification:'Pain-free elbow/wrist positions.',warmup:'Usually none.',prehab:'None.',recoveryRequirement:'Superset recommended.',successCriteria:'Arm work completed pain-free.',notes:'Rep range 10–15 each.'}
];

const UNRESOLVED_FIELDS = [
  {field:'startingLoadKg',scope:'Back Squat',reason:'Canonical program defines intensity/RPE but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Incline Bench Press 15–30°',reason:'Canonical program defines rep range/RPE but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Flat Barbell Bench Press',reason:'55 kg is a documented problem load; next load requires safety-aware resolution.'},
  {field:'startingLoadKg',scope:'Romanian Deadlift',reason:'Canonical program defines rep range/RPE but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Seated Cable Row',reason:'Canonical program defines rep range/RPE but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Low-to-high Cable Fly',reason:'Canonical program defines rep range/RPE but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Deadlift',reason:'Canonical program defines top/back-off structure but no numeric starting load.'},
  {field:'startingLoadKg',scope:'Light Squat',reason:'Relative prescription (~70–75% Day A) cannot resolve until Day A load is resolved.'},
  {field:'startingLoadKg',scope:'remaining accessories',reason:'No authoritative starting load is specified in the canonical program.'}
];

const SESSION_ENVELOPES = [
  {sourceSessionId:'HLT-TRN-20260829-01',sourceSessionDate:'2026-08-29',sourceProgramId:'',rawRows:[],normalizedPreview:{sourceRange:'03_Training_Log rows 2–10',sourceRowCount:9,status:'RAW_ROWS_PENDING_INGESTION'}},
  {sourceSessionId:'HLT-TRN-20260830-C',sourceSessionDate:'2026-08-30',sourceProgramId:'HLT-PRG-0001',rawRows:[],normalizedPreview:{sourceRange:'03_Training_Log rows 11–32',sourceRowCount:22,status:'RAW_ROWS_PENDING_INGESTION'}},
  {sourceSessionId:'HLT-TRN-20260904-A',sourceSessionDate:'2026-09-04',sourceProgramId:'HLT-PRG-0001',rawRows:[],normalizedPreview:{sourceRange:'03_Training_Log rows 33–51',sourceRowCount:19,status:'RAW_ROWS_PENDING_INGESTION'}},
  {sourceSessionId:'HLT-TRN-20260906-B',sourceSessionDate:'2026-09-06',sourceProgramId:'HLT-PRG-0001',rawRows:[],normalizedPreview:{sourceRange:'03_Training_Log rows 52–73',sourceRowCount:22,status:'RAW_ROWS_PENDING_INGESTION'}}
];

const SAFETY = {
  exercise:'Flat Barbell Bench Press',
  triggerLoadKg:55,
  location:'upper-left trapezius / superior scapular area',
  recurrence:true,
  sourceSessionId:'HLT-TRN-20260906-B',
  evidenceRows:[55,56,57],
  finalWorkingSet:{loadKg:55,reps:3,targetReps:5,rpe:8,completionStatus:'PARTIAL'},
  sourceDecision:'55 kg treated as current problem load; next bench exposure to regress and rebuild with microloading only if pain-free.',
  appDogfoodProgression:'50→51 kg is engine-test evidence only and is not eligible for canonical promotion.'
};

export default function CanonicalMigrationStagingPage() {
  const [batchId,setBatchId]=useState<string|null>(null);
  const [candidate,setCandidate]=useState<any>(null);
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);

  async function load() {
    setLoading(true); setMessage('');
    try {
      const supabase=getSupabaseBrowserClient();
      const {data:batch,error:batchError}=await supabase.from('canonical_reconciliation_batch')
        .select('id,status,source_revision').eq('source_system','HEALTH_MASTER_RECORD')
        .eq('source_revision',SOURCE_REVISION).eq('status','DRAFT')
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(batchError) throw batchError;
      setBatchId(batch?.id ?? null);

      const {data:c,error:cError}=await supabase.from('canonical_program_candidate')
        .select('id,candidate_status,activation_allowed,unresolved_fields,created_at')
        .eq('source_program_id','HLT-PRG-0001').eq('source_revision',SOURCE_REVISION)
        .maybeSingle();
      if(cError) throw cError;
      setCandidate(c ?? null);
    } catch(error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }

  useEffect(()=>{load();},[]);

  async function stage() {
    if(!batchId) return;
    setLoading(true); setMessage('Staging non-active candidate and evidence envelopes…');
    try {
      const supabase=getSupabaseBrowserClient();
      const {data,error}=await supabase.rpc('stage_b13_execution_candidate_v1',{
        p_batch_id:batchId,
        p_source_revision:SOURCE_REVISION,
        p_program_rows:PROGRAM_ROWS,
        p_unresolved_fields:UNRESOLVED_FIELDS,
        p_sessions:SESSION_ENVELOPES,
        p_safety:SAFETY
      });
      if(error) throw error;
      setMessage(`Staged successfully. ${JSON.stringify(data)}`);
      await load();
    } catch(error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }

  return <main>
    <h1>B13 canonical migration staging</h1>
    <p className="muted">Non-active candidate + evidence envelopes only. No source-of-truth cutover occurs here.</p>
    <div className="card"><h2>{candidate ? 'STAGED' : 'NOT YET STAGED'} — HLT-PRG-0001</h2><p>12-Week Recomp + SBD Base v1.0</p><p className="muted">17 canonical exercise prescriptions preserved from the Health Master Record.</p><p><strong>Activation allowed:</strong> {candidate?.activation_allowed ? 'YES' : 'NO'}</p></div>
    <div className="card"><h2>Prescription resolution</h2><p><strong>{UNRESOLVED_FIELDS.length} unresolved load groups</strong></p><p className="muted">No starting load is guessed. Relative or RPE-based prescriptions remain unresolved until supported by authoritative evidence and safety review.</p></div>
    <div className="card"><h2>Historical evidence envelopes</h2><p>{SESSION_ENVELOPES.length} validated source sessions identified; 72 source rows total.</p><p className="muted">This stage records source identity/ranges only. Raw-row ingestion is the next verification step and is required before any session can become IMPORTED.</p></div>
    <div className="card"><h2>ACTIVE_BLOCK — Bench safety</h2><p>55 kg recurrent upper-left trapezius / superior-scapular symptom context.</p><p className="muted">Synthetic 50→51 kg dogfood progression remains excluded from canonical promotion.</p></div>
    <div className="card"><h2>Boundary</h2><p>No program_version CURRENT row is created or modified. No dogfood workout is rewritten. No historical source session is imported yet.</p><p className="muted">{batchId ? `Reconciliation DRAFT: ${batchId}` : 'No eligible reconciliation DRAFT found.'}</p></div>
    <div className="row"><button className="primary" onClick={stage} disabled={loading || !batchId || Boolean(candidate)}>{candidate ? 'Candidate already staged' : 'Stage candidate + evidence'}</button><button onClick={load} disabled={loading}>Refresh</button><Link href="/canonical-reconciliation"><button>Reconciliation</button></Link><Link href="/cutover-readiness"><button>Cutover readiness</button></Link></div>
    {message && <div className="card"><strong>{message}</strong></div>}
  </main>;
}
