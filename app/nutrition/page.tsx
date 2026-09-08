'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import {
  parseOptionalNutritionNumber,
  summarizeLoggedNutrition,
  validateNutritionMeal,
  type MealCoverage,
  type MealType,
  type NutritionBasis,
  type NutritionConfidence,
  type NutritionMeal,
} from '@/src/domain/nutrition';

const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export default function NutritionPage() {
  const [rows, setRows] = useState<NutritionMeal[]>([]);
  const [message, setMessage] = useState('Loading…');
  const [saving, setSaving] = useState(false);

  const [mealType, setMealType] = useState<MealType>('OTHER');
  const [description, setDescription] = useState('');
  const [portionNote, setPortionNote] = useState('');
  const [coverage, setCoverage] = useState<MealCoverage>('PARTIAL');
  const [energy, setEnergy] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [basis, setBasis] = useState<NutritionBasis>('UNKNOWN');
  const [confidence, setConfidence] = useState<NutritionConfidence | ''>('');

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.user) { setRows([]); setMessage('Sign in to log and view nutrition.'); return; }
      const { data, error } = await supabase.from('nutrition_meal')
        .select('id, consumed_at, meal_type, description, portion_note, coverage, energy_kcal, protein_g, carbs_g, fat_g, nutrition_basis, confidence, source')
        .order('consumed_at', { ascending: false }).limit(100);
      if (error) throw error;
      setRows((data ?? []).map(r => ({
        id: r.id, consumedAt: r.consumed_at, mealType: r.meal_type as MealType,
        description: r.description, portionNote: r.portion_note, coverage: r.coverage as MealCoverage,
        energyKcal: r.energy_kcal === null ? null : Number(r.energy_kcal),
        proteinG: r.protein_g === null ? null : Number(r.protein_g),
        carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
        fatG: r.fat_g === null ? null : Number(r.fat_g),
        nutritionBasis: r.nutrition_basis as NutritionBasis,
        confidence: r.confidence as NutritionConfidence | null, source: 'MANUAL',
      })));
      setMessage((data?.length ?? 0) ? '' : 'No meals logged yet.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load nutrition.'); }
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const todayRows = useMemo(() => {
    const now = new Date();
    return rows.filter(r => {
      const d = new Date(r.consumedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
  }, [rows]);

  const subtotal = useMemo(() => summarizeLoggedNutrition(todayRows), [todayRows]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const energyKcal = parseOptionalNutritionNumber(energy);
    const proteinG = parseOptionalNutritionNumber(protein);
    const carbsG = parseOptionalNutritionNumber(carbs);
    const fatG = parseOptionalNutritionNumber(fat);
    const confidenceValue = confidence || null;
    const errors = validateNutritionMeal({
      description, energyKcal, proteinG, carbsG, fatG,
      nutritionBasis: basis, confidence: confidenceValue,
    });
    if (errors.length) { setMessage(errors.join(' · ')); return; }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (!user) throw new Error('SIGN_IN_REQUIRED');
      const { error } = await supabase.from('nutrition_meal').insert({
        id: crypto.randomUUID(), user_id: user.id, consumed_at: new Date().toISOString(),
        meal_type: mealType, description: description.trim(), portion_note: portionNote.trim() || null,
        coverage, energy_kcal: energyKcal, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG,
        nutrition_basis: basis, confidence: confidenceValue, source: 'MANUAL',
      });
      if (error) throw error;
      setDescription(''); setPortionNote(''); setEnergy(''); setProtein(''); setCarbs(''); setFat('');
      setBasis('UNKNOWN'); setConfidence(''); setCoverage('PARTIAL'); setMealType('OTHER');
      setMessage('Meal saved.'); await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to save meal.'); }
    finally { setSaving(false); }
  }

  const fmt = (v: number | null, unit: string) => v === null ? '—' : `${nf.format(v)} ${unit}`;

  return <main>
    <div className="row"><Link href="/">← Home</Link><Link href="/nutrition/decision">Contextual guidance</Link><Link href="/auth">Account</Link></div>
    <h1>Nutrition</h1>
    <p className="muted">Manual meal observations with explicit uncertainty. Partial meal logging is preserved and never promoted to a complete daily intake total.</p>

    <div className="card">
      <h2>Today — logged subtotal</h2>
      <p><strong>This is not a daily total.</strong> It only sums nutrition values actually entered for meals logged today.</p>
      <div className="set-line"><span>Energy</span><span>{fmt(subtotal.energyKcal, 'kcal')} · known in {subtotal.energyKnownCount}/{subtotal.mealCount} meals</span></div>
      <div className="set-line"><span>Protein</span><span>{fmt(subtotal.proteinG, 'g')} · known in {subtotal.proteinKnownCount}/{subtotal.mealCount} meals</span></div>
      <div className="set-line"><span>Carbs</span><span>{fmt(subtotal.carbsG, 'g')} · known in {subtotal.carbsKnownCount}/{subtotal.mealCount} meals</span></div>
      <div className="set-line"><span>Fat</span><span>{fmt(subtotal.fatG, 'g')} · known in {subtotal.fatKnownCount}/{subtotal.mealCount} meals</span></div>
      <p className="muted">{subtotal.mealCount} logged meal(s) today · {subtotal.partialMealCount} marked PARTIAL.</p>
    </div>

    <form className="card" onSubmit={submit}>
      <h2>Log meal</h2>
      <div className="form-grid">
        <label>Meal type<select value={mealType} onChange={e=>setMealType(e.target.value as MealType)}>
          <option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option><option value="OTHER">Other</option>
        </select></label>
        <label>Coverage<select value={coverage} onChange={e=>setCoverage(e.target.value as MealCoverage)}>
          <option value="PARTIAL">Partial / may be incomplete</option><option value="COMPLETE">Complete meal description</option>
        </select></label>
      </div>
      <label>Description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. eggs, banana, black coffee" /></label>
      <label>Portion note<input value={portionNote} onChange={e=>setPortionNote(e.target.value)} placeholder="optional" /></label>
      <h3>Nutrition values (optional)</h3>
      <div className="form-grid">
        <label>Energy (kcal)<input inputMode="decimal" type="text" value={energy} onChange={e=>setEnergy(e.target.value)} /></label>
        <label>Protein (g)<input inputMode="decimal" type="text" value={protein} onChange={e=>setProtein(e.target.value)} /></label>
        <label>Carbs (g)<input inputMode="decimal" type="text" value={carbs} onChange={e=>setCarbs(e.target.value)} /></label>
        <label>Fat (g)<input inputMode="decimal" type="text" value={fat} onChange={e=>setFat(e.target.value)} /></label>
      </div>
      <p className="muted">Decimal comma or point is accepted. Leave values blank rather than guessing.</p>
      <div className="form-grid">
        <label>Nutrition basis<select value={basis} onChange={e=>{ const next=e.target.value as NutritionBasis; setBasis(next); if(next==='UNKNOWN') setConfidence(''); }}>
          <option value="UNKNOWN">Unknown / no nutrition values</option><option value="ESTIMATED">Estimated</option><option value="PACKAGE_LABEL">Package label</option><option value="RESTAURANT_PUBLISHED">Restaurant-published</option>
        </select></label>
        <label>Confidence<select value={confidence} disabled={basis==='UNKNOWN'} onChange={e=>setConfidence(e.target.value as NutritionConfidence|'')}>
          <option value="">Select</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
        </select></label>
      </div>
      <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save meal'}</button>
    </form>

    {message && <p className="muted">{message}</p>}
    <h2>Recent meal observations</h2>
    {rows.map(row => <div className="card" key={row.id}>
      <strong>{row.mealType} · {new Date(row.consumedAt).toLocaleString('id-ID')}</strong>
      <p>{row.description}</p>
      {row.portionNote && <p className="muted">Portion: {row.portionNote}</p>}
      <div>{row.coverage} · basis {row.nutritionBasis}{row.confidence ? ` · confidence ${row.confidence}` : ''}</div>
      <div className="muted">Energy {fmt(row.energyKcal,'kcal')} · Protein {fmt(row.proteinG,'g')} · Carbs {fmt(row.carbsG,'g')} · Fat {fmt(row.fatG,'g')}</div>
    </div>)}
  </main>;
}
