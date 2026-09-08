'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import type { NutritionMeal, MealCoverage, MealType, NutritionBasis, NutritionConfidence } from '@/src/domain/nutrition';
import {
  buildContextualNutritionDecision,
  nutritionDecisionInputSnapshot,
  B9_NUTRITION_POLICY,
  type EatingOccasion,
  type NutritionDecision,
  type TrainingNutritionContext,
} from '@/src/domain/nutrition-decision';

export default function NutritionDecisionPage() {
  const [rows, setRows] = useState<NutritionMeal[]>([]);
  const [trainingContext, setTrainingContext] = useState<TrainingNutritionContext>('UNSPECIFIED');
  const [eatingOccasion, setEatingOccasion] = useState<EatingOccasion>('MAIN_MEAL');
  const [decision, setDecision] = useState<NutritionDecision | null>(null);
  const [message, setMessage] = useState('Loading today’s meal evidence…');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.user) {
        setRows([]);
        setDecision(null);
        setMessage('Sign in to use contextual nutrition decisioning.');
        return;
      }

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const { data, error } = await supabase.from('nutrition_meal')
        .select('id, consumed_at, meal_type, description, portion_note, coverage, energy_kcal, protein_g, carbs_g, fat_g, nutrition_basis, confidence, source')
        .gte('consumed_at', start.toISOString())
        .lt('consumed_at', end.toISOString())
        .order('consumed_at', { ascending: true });

      if (error) throw error;

      setRows((data ?? []).map(r => ({
        id: r.id,
        consumedAt: r.consumed_at,
        mealType: r.meal_type as MealType,
        description: r.description,
        portionNote: r.portion_note,
        coverage: r.coverage as MealCoverage,
        energyKcal: r.energy_kcal === null ? null : Number(r.energy_kcal),
        proteinG: r.protein_g === null ? null : Number(r.protein_g),
        carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
        fatG: r.fat_g === null ? null : Number(r.fat_g),
        nutritionBasis: r.nutrition_basis as NutritionBasis,
        confidence: r.confidence as NutritionConfidence | null,
        source: 'MANUAL',
      })));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load meal evidence.');
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const input = useMemo(() => ({
    trainingContext,
    eatingOccasion,
    loggedMeals: rows,
  }), [trainingContext, eatingOccasion, rows]);

  async function generate() {
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (!user) throw new Error('SIGN_IN_REQUIRED');

      const next = buildContextualNutritionDecision(input);
      const id = crypto.randomUUID();
      const { error } = await supabase.from('recommendation_snapshot').insert({
        id,
        user_id: user.id,
        recommendation_type: 'NUTRITION_CONTEXTUAL',
        rule_version: next.ruleVersion,
        input_snapshot: nutritionDecisionInputSnapshot(input),
        decision: next,
        evidence_refs: next.evidenceRefs,
      });
      if (error) throw error;

      setDecision(next);
      setMessage('Guidance generated and provenance snapshot saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to generate guidance.');
    } finally {
      setSaving(false);
    }
  }

  return <main>
    <div className="row"><Link href="/nutrition">← Nutrition</Link><Link href="/">Home</Link></div>
    <h1>Contextual nutrition</h1>
    <p className="muted">
      Deterministic qualitative guidance from explicit training context plus today&apos;s logged meal evidence.
      Rule {B9_NUTRITION_POLICY.version} · {B9_NUTRITION_POLICY.status}.
    </p>

    <div className="card">
      <h2>Current context</h2>
      <div className="form-grid">
        <label>Training context
          <select value={trainingContext} onChange={e => setTrainingContext(e.target.value as TrainingNutritionContext)}>
            <option value="UNSPECIFIED">Unspecified</option>
            <option value="REST_DAY">Rest day</option>
            <option value="PRE_TRAINING">Pre-training</option>
            <option value="POST_TRAINING">Post-training</option>
            <option value="RECOVERY_DAY">Recovery day</option>
          </select>
        </label>
        <label>Next eating occasion
          <select value={eatingOccasion} onChange={e => setEatingOccasion(e.target.value as EatingOccasion)}>
            <option value="MAIN_MEAL">Main meal</option>
            <option value="SNACK">Snack</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Training context is explicit in B9; the app does not infer it from synthetic workout history.
        Medical constraints and numeric nutrition targets are not yet applied in this rule.
      </p>
      <button className="primary" onClick={generate} disabled={saving}>
        {saving ? 'Generating…' : 'Generate guidance'}
      </button>
    </div>

    <div className="card">
      <h2>Evidence available today</h2>
      <div>{rows.length} logged meal(s)</div>
      <div>{rows.filter(r => r.coverage === 'PARTIAL').length} marked PARTIAL</div>
      <div>{rows.filter(r => r.proteinG !== null).length}/{rows.length} with known protein quantity</div>
      <p className="muted">Missing nutrition values remain unknown. They are not treated as zero or as evidence of deficiency.</p>
    </div>

    {message && <p className="muted">{message}</p>}

    {decision && <>
      <div className="card">
        <h2>Next-action priorities</h2>
        <ol>{decision.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
      </div>
      <div className="card">
        <h2>Guardrails / uncertainty</h2>
        <ul>{decision.guardrails.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <p className="muted">
          Recommendation only. Generating this snapshot does not mean it was accepted or performed.
        </p>
      </div>
    </>}
  </main>;
}
