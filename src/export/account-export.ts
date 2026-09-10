export const ACCOUNT_EXPORT_VERSION = 'superabang-account-export-0.2.0';

export const ACCOUNT_EXPORT_TABLES = [
  'app_user',
  'program_version',
  'workout_session',
  'workout_set_log',
  'symptom_observation',
  'technique_observation',
  'recommendation_snapshot',
  'body_measurement',
  'nutrition_meal',
  'food_menu_evidence',
  'cutover_evidence',
  'canonical_reconciliation_batch',
  'canonical_reconciliation_item',
  'canonical_program_candidate',
  'health_source_session_stage',
  'canonical_safety_context',
  'health_source_nutrition_stage',
  'canonical_cutover_event',
] as const;
