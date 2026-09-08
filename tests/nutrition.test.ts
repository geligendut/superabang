import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOptionalNutritionNumber,
  summarizeLoggedNutrition,
  validateNutritionMeal,
  type NutritionMeal,
} from '../src/domain/nutrition.ts';

function meal(overrides: Partial<NutritionMeal> = {}): NutritionMeal {
  return {
    id: crypto.randomUUID(),
    consumedAt: new Date().toISOString(),
    mealType: 'OTHER',
    description: 'Synthetic meal',
    portionNote: null,
    coverage: 'PARTIAL',
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

test('localized decimal parser accepts comma and point and preserves blank as null', () => {
  assert.equal(parseOptionalNutritionNumber('12,5'), 12.5);
  assert.equal(parseOptionalNutritionNumber('12.5'), 12.5);
  assert.equal(parseOptionalNutritionNumber(''), null);
  assert.ok(Number.isNaN(parseOptionalNutritionNumber('1,2,3')));
});

test('nutrition values require an explicit basis and confidence', () => {
  assert.ok(validateNutritionMeal({
    description: 'meal', energyKcal: 500, proteinG: null, carbsG: null, fatG: null,
    nutritionBasis: 'UNKNOWN', confidence: null
  }).length > 0);

  assert.equal(validateNutritionMeal({
    description: 'meal', energyKcal: 500, proteinG: 30, carbsG: null, fatG: null,
    nutritionBasis: 'ESTIMATED', confidence: 'LOW'
  }).length, 0);
});

test('unknown basis cannot carry a confidence', () => {
  assert.ok(validateNutritionMeal({
    description: 'meal', energyKcal: null, proteinG: null, carbsG: null, fatG: null,
    nutritionBasis: 'UNKNOWN', confidence: 'LOW'
  }).length > 0);
});

test('logged subtotal sums only known values and is never a daily total', () => {
  const summary = summarizeLoggedNutrition([
    meal({ coverage: 'COMPLETE', energyKcal: 500, proteinG: 30, nutritionBasis: 'PACKAGE_LABEL', confidence: 'HIGH' }),
    meal({ coverage: 'PARTIAL', energyKcal: null, proteinG: 20, nutritionBasis: 'ESTIMATED', confidence: 'LOW' }),
  ]);
  assert.equal(summary.energyKcal, 500);
  assert.equal(summary.proteinG, 50);
  assert.equal(summary.energyKnownCount, 1);
  assert.equal(summary.proteinKnownCount, 2);
  assert.equal(summary.partialMealCount, 1);
  assert.equal(summary.isDailyTotal, false);
});

test('all-unknown metric remains null instead of false zero', () => {
  const summary = summarizeLoggedNutrition([meal(), meal()]);
  assert.equal(summary.energyKcal, null);
  assert.equal(summary.proteinG, null);
});
