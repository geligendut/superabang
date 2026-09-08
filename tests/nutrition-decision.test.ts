import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextualNutritionDecision, B9_NUTRITION_POLICY } from '../src/domain/nutrition-decision.ts';
import type { NutritionMeal } from '../src/domain/nutrition.ts';

function meal(overrides: Partial<NutritionMeal> = {}): NutritionMeal {
  return {
    id: crypto.randomUUID(),
    consumedAt: new Date().toISOString(),
    mealType: 'BREAKFAST',
    description: 'Synthetic meal',
    portionNote: null,
    coverage: 'COMPLETE',
    energyKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    nutritionBasis: 'UNKNOWN',
    confidence: null,
    source: 'MANUAL',
    ...overrides,
  };
}

test('rest-day guidance emphasizes protein, produce and appropriate portions', () => {
  const d = buildContextualNutritionDecision({ trainingContext: 'REST_DAY', eatingOccasion: 'MAIN_MEAL', loggedMeals: [] });
  assert.equal(d.ruleStatus, 'PROVISIONAL');
  assert.ok(d.priorities.some(p => p.toLowerCase().includes('protein')));
  assert.ok(d.priorities.some(p => p.toLowerCase().includes('lower-demand')));
  assert.ok(d.guardrails.some(p => p.includes('No meals are logged today')));
});

test('post-training guidance includes protein and carbohydrate without unrestricted-eating logic', () => {
  const d = buildContextualNutritionDecision({ trainingContext: 'POST_TRAINING', eatingOccasion: 'MAIN_MEAL', loggedMeals: [] });
  assert.ok(d.priorities.some(p => p.toLowerCase().includes('carbohydrate')));
  assert.ok(d.guardrails.some(p => p.toLowerCase().includes('unrestricted eating')));
});

test('unknown macros do not become a deficit claim', () => {
  const d = buildContextualNutritionDecision({ trainingContext: 'REST_DAY', eatingOccasion: 'MAIN_MEAL', loggedMeals: [meal()] });
  assert.equal(d.dataQuality.proteinKnownCount, 0);
  assert.ok(d.guardrails.some(p => p.includes('protein adequacy cannot be quantified')));
  assert.ok(d.guardrails.some(p => p.includes('do not infer a calorie or protein deficit')));
});

test('partial meals preserve incomplete-day warning', () => {
  const d = buildContextualNutritionDecision({
    trainingContext: 'UNSPECIFIED',
    eatingOccasion: 'SNACK',
    loggedMeals: [meal({ coverage: 'PARTIAL', nutritionBasis: 'ESTIMATED', confidence: 'LOW', proteinG: 10 })],
  });
  assert.equal(d.dataQuality.partialMealCount, 1);
  assert.ok(d.guardrails.some(p => p.includes('not a complete-day intake total')));
});

test('evidence refs preserve recommendation provenance', () => {
  const m = meal();
  const d = buildContextualNutritionDecision({ trainingContext: 'PRE_TRAINING', eatingOccasion: 'MAIN_MEAL', loggedMeals: [m] });
  assert.deepEqual(d.evidenceRefs, [`nutrition_meal:${m.id}`]);
  assert.equal(d.ruleVersion, B9_NUTRITION_POLICY.version);
});

test('B9 produces qualitative priorities and no numeric nutrition target', () => {
  const d = buildContextualNutritionDecision({ trainingContext: 'RECOVERY_DAY', eatingOccasion: 'MAIN_MEAL', loggedMeals: [] });
  const text = JSON.stringify(d);
  assert.equal(/calorieTarget|proteinTarget|macroTarget/.test(text), false);
});
