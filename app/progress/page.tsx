'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../src/backend/supabase-browser';
import { metricTrend, parseLocalizedDecimal, validateBodyMeasurement, type BodyMeasurement } from '../../src/domain/body-progress';

export default function ProgressPage() {
  const [rows, setRows] = useState<BodyMeasurement[]>([]);
  const [message, setMessage] = useState('Loading…');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.user) { setRows([]); setMessage('Sign in to log and view body progress.'); return; }
      const { data, error } = await supabase.from('body_measurement')
        .select('id, measured_at, weight_kg, waist_cm, source')
        .order('measured_at', { ascending: false }).limit(100);
      if (error) throw error;
      setRows((data ?? []).map(r => ({
        id: r.id, measuredAt: r.measured_at,
        weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
        waistCm: r.waist_cm === null ? null : Number(r.waist_cm), source: 'MANUAL'
      })));
      setMessage((data?.length ?? 0) ? '' : 'No body measurements yet.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load progress.'); }
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const weightTrend = useMemo(() => metricTrend(rows, 'weightKg'), [rows]);
  const waistTrend = useMemo(() => metricTrend(rows, 'waistCm'), [rows]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const weightKg = parseLocalizedDecimal(weight);
    const waistCm = parseLocalizedDecimal(waist);
    const errors = validateBodyMeasurement({ weightKg, waistCm });
    if (errors.length) { setMessage(errors.join(' · ')); return; }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (!user) throw new Error('SIGN_IN_REQUIRED');
      const { error } = await supabase.from('body_measurement').insert({
        id: crypto.randomUUID(), user_id: user.id, measured_at: new Date().toISOString(),
        weight_kg: weightKg, waist_cm: waistCm, source: 'MANUAL'
      });
      if (error) throw error;
      setWeight(''); setWaist(''); setMessage('Measurement saved.'); await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to save measurement.'); }
    finally { setSaving(false); }
  }

  const fmt = (value: number | null, unit: string) => value === null ? '—' : `${value} ${unit}`;
  const delta = (value: number | null, unit: string) => value === null ? 'Need ≥2 observations' : `${value > 0 ? '+' : ''}${value} ${unit} vs prior observation`;

  return <main>
    <div className="row"><Link href="/">← Home</Link><Link href="/auth">Account</Link></div>
    <h1>Body & Progress</h1>
    <p className="muted">Longitudinal observations. Weight and waist are independent; a missing metric is not inferred.</p>

    <div className="form-grid">
      <div className="card"><strong>Latest weight</strong><h2>{fmt(weightTrend.latest, 'kg')}</h2><p className="muted">{delta(weightTrend.delta, 'kg')}</p></div>
      <div className="card"><strong>Latest waist</strong><h2>{fmt(waistTrend.latest, 'cm')}</h2><p className="muted">{delta(waistTrend.delta, 'cm')}</p></div>
    </div>

    <form className="card" onSubmit={submit}>
      <h2>Log measurement</h2>
      <div className="form-grid">
        <label>Weight (kg)<input inputMode="decimal" type="text" autoComplete="off" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="e.g. 86,5" /></label>
        <label>Waist (cm)<input inputMode="decimal" type="text" autoComplete="off" value={waist} onChange={e=>setWaist(e.target.value)} placeholder="e.g. 104,5" /></label>
      </div>
      <p className="muted">Enter at least one metric. Decimal comma or point is accepted. Current time is stored as the observation time.</p>
      <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save measurement'}</button>
    </form>

    {message && <p className="muted">{message}</p>}
    <h2>Recent observations</h2>
    {rows.map(row => <div className="card" key={row.id}>
      <strong>{new Date(row.measuredAt).toLocaleString()}</strong>
      <div className="set-line"><span>Weight</span><span>{fmt(row.weightKg, 'kg')}</span></div>
      <div className="set-line"><span>Waist</span><span>{fmt(row.waistCm, 'cm')}</span></div>
      <p className="muted">Source: MANUAL</p>
    </div>)}
  </main>;
}
