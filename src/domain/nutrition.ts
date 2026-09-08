export type MealType = 'BREAKFAST'|'LUNCH'|'DINNER'|'SNACK'|'OTHER';
export type MealCoverage = 'PARTIAL'|'COMPLETE';
export type NutritionBasis = 'UNKNOWN'|'ESTIMATED'|'PACKAGE_LABEL'|'RESTAURANT_PUBLISHED';
export type NutritionConfidence = 'LOW'|'MEDIUM'|'HIGH';

export interface NutritionMeal {
  id: string;
  consumedAt: string;
  mealType: MealType;
  description: string;
  portionNote: string | null;
  coverage: MealCoverage;
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  nutritionBasis: NutritionBasis;
  confidence: NutritionConfidence | null;
  source: 'MANUAL';
}

export interface NutritionLoggedSubtotal {
  mealCount: number;
  partialMealCount: number;
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  energyKnownCount: number;
  proteinKnownCount: number;
  carbsKnownCount: number;
  fatKnownCount: number;
  /** True when the logged data cannot be represented as a complete-day intake total. */
  isDailyTotal: false;
}

export function parseOptionalNutritionNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

export function validateNutritionMeal(input: {
  description: string;
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  nutritionBasis: NutritionBasis;
  confidence: NutritionConfidence | null;
}): string[] {
  const errors: string[] = [];
  if (!input.description.trim()) errors.push('Meal description is required.');

  const checks: Array<[string, number | null, number]> = [
    ['Energy', input.energyKcal, 10000],
    ['Protein', input.proteinG, 1000],
    ['Carbohydrate', input.carbsG, 2000],
    ['Fat', input.fatG, 1000],
  ];
  for (const [name, value, max] of checks) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
      errors.push(`${name} value is invalid.`);
    }
  }

  const hasNutrition = [input.energyKcal, input.proteinG, input.carbsG, input.fatG].some(v => v !== null);
  if (hasNutrition && input.nutritionBasis === 'UNKNOWN') {
    errors.push('Choose a nutrition basis when nutrition values are entered.');
  }
  if (input.nutritionBasis !== 'UNKNOWN' && !input.confidence) {
    errors.push('Choose confidence when nutrition values have a stated basis.');
  }
  if (input.nutritionBasis === 'UNKNOWN' && input.confidence !== null) {
    errors.push('Confidence must be blank when nutrition basis is UNKNOWN.');
  }
  return errors;
}

function sumKnown(rows: NutritionMeal[], key: 'energyKcal'|'proteinG'|'carbsG'|'fatG') {
  const values = rows.map(r => r[key]).filter((v): v is number => v !== null && Number.isFinite(v));
  return { value: values.length ? Math.round(values.reduce((a,b) => a+b, 0) * 100) / 100 : null, count: values.length };
}

/**
 * Summarizes only values that were actually logged.
 * Deliberately never labels the result a complete daily total.
 */
export function summarizeLoggedNutrition(rows: NutritionMeal[]): NutritionLoggedSubtotal {
  const energy = sumKnown(rows, 'energyKcal');
  const protein = sumKnown(rows, 'proteinG');
  const carbs = sumKnown(rows, 'carbsG');
  const fat = sumKnown(rows, 'fatG');
  return {
    mealCount: rows.length,
    partialMealCount: rows.filter(r => r.coverage === 'PARTIAL').length,
    energyKcal: energy.value,
    proteinG: protein.value,
    carbsG: carbs.value,
    fatG: fat.value,
    energyKnownCount: energy.count,
    proteinKnownCount: protein.count,
    carbsKnownCount: carbs.count,
    fatKnownCount: fat.count,
    isDailyTotal: false,
  };
}
