import type { NutritionMeal } from './nutrition.ts';

export type TrainingNutritionContext =
  | 'REST_DAY'
  | 'PRE_TRAINING'
  | 'POST_TRAINING'
  | 'RECOVERY_DAY'
  | 'UNSPECIFIED';

export type EatingOccasion = 'MAIN_MEAL'|'SNACK';

export interface NutritionDecisionInput {
  trainingContext: TrainingNutritionContext;
  eatingOccasion: EatingOccasion;
  loggedMeals: NutritionMeal[];
}

export interface NutritionDecision {
  ruleVersion: 'b9-contextual-nutrition-0.1.0';
  ruleStatus: 'PROVISIONAL';
  trainingContext: TrainingNutritionContext;
  eatingOccasion: EatingOccasion;
  priorities: string[];
  guardrails: string[];
  dataQuality: {
    mealCount: number;
    partialMealCount: number;
    energyKnownCount: number;
    proteinKnownCount: number;
    macrosCompleteForAllMeals: boolean;
  };
  evidenceRefs: string[];
}

export const B9_NUTRITION_POLICY = {
  version: 'b9-contextual-nutrition-0.1.0' as const,
  status: 'PROVISIONAL' as const,
};

/**
 * Deterministic qualitative decision support only.
 * No calorie/macro target is generated here.
 * Missing nutrition data remains unknown and never becomes inferred deficiency.
 */
export function buildContextualNutritionDecision(input: NutritionDecisionInput): NutritionDecision {
  const rows = input.loggedMeals;
  const energyKnownCount = rows.filter(r => r.energyKcal !== null).length;
  const proteinKnownCount = rows.filter(r => r.proteinG !== null).length;
  const macrosCompleteForAllMeals = rows.length > 0 && rows.every(r =>
    r.energyKcal !== null && r.proteinG !== null && r.carbsG !== null && r.fatG !== null
  );

  const priorities: string[] = [];
  const guardrails: string[] = [
    'Use this as qualitative decision support, not a calorie or macro prescription.',
    'Do not treat training as automatic justification for unrestricted eating.',
  ];

  if (input.eatingOccasion === 'SNACK') {
    priorities.push('Prefer a protein-forward snack with practical portion control.');
    priorities.push('Add fruit or another minimally processed carbohydrate source when useful for training/recovery demand.');
  } else {
    priorities.push('Anchor the meal with a meaningful protein source.');
    priorities.push('Include vegetables and/or fruit for food quality and fiber.');
  }

  switch (input.trainingContext) {
    case 'REST_DAY':
      priorities.push('Keep energy density and portion size appropriate for a lower-demand day.');
      priorities.push('Use carbohydrate portions according to hunger and activity rather than automatically increasing them.');
      break;
    case 'PRE_TRAINING':
      priorities.push('Include a practical carbohydrate source plus protein to support the upcoming session.');
      priorities.push('If eating close to training, avoid making the meal excessively high in fat or fiber if that impairs comfort.');
      break;
    case 'POST_TRAINING':
      priorities.push('Pair protein with carbohydrate appropriate to the session demand to support recovery.');
      priorities.push('Rehydrate and replace fluids according to thirst and training conditions.');
      break;
    case 'RECOVERY_DAY':
      priorities.push('Prioritize protein, overall food quality, and sufficient energy for recovery without forcing a surplus.');
      priorities.push('Scale carbohydrate intake to recovery demand and total activity.');
      break;
    case 'UNSPECIFIED':
      priorities.push('Training context is unspecified, so keep the recommendation conservative: protein, produce, practical portions, and hydration.');
      break;
  }

  if (rows.length === 0) {
    guardrails.push('No meals are logged today; no statement about daily intake adequacy can be made.');
  } else {
    if (rows.some(r => r.coverage === 'PARTIAL')) {
      guardrails.push('At least one logged meal is PARTIAL; logged nutrition is not a complete-day intake total.');
    }
    if (!macrosCompleteForAllMeals) {
      guardrails.push('Nutrition data are incomplete; do not infer a calorie or protein deficit from missing values.');
    }
    if (proteinKnownCount === 0) {
      guardrails.push('Logged protein quantity is unknown, so protein adequacy cannot be quantified from current data.');
    }
  }

  return {
    ruleVersion: B9_NUTRITION_POLICY.version,
    ruleStatus: B9_NUTRITION_POLICY.status,
    trainingContext: input.trainingContext,
    eatingOccasion: input.eatingOccasion,
    priorities,
    guardrails,
    dataQuality: {
      mealCount: rows.length,
      partialMealCount: rows.filter(r => r.coverage === 'PARTIAL').length,
      energyKnownCount,
      proteinKnownCount,
      macrosCompleteForAllMeals,
    },
    evidenceRefs: rows.map(r => `nutrition_meal:${r.id}`),
  };
}

export function nutritionDecisionInputSnapshot(input: NutritionDecisionInput) {
  return {
    trainingContext: input.trainingContext,
    eatingOccasion: input.eatingOccasion,
    mealEvidence: input.loggedMeals.map(r => ({
      id: r.id,
      consumedAt: r.consumedAt,
      mealType: r.mealType,
      coverage: r.coverage,
      nutritionBasis: r.nutritionBasis,
      confidence: r.confidence,
      energyKcal: r.energyKcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
    })),
    medicalConstraintsApplied: false,
    numericNutritionTargetApplied: false,
  };
}
