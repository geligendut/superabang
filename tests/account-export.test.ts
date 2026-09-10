import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_EXPORT_TABLES, ACCOUNT_EXPORT_VERSION } from '../src/export/account-export.ts';

test('post-cutover account export includes execution, safety, and canonical provenance', () => {
  assert.equal(ACCOUNT_EXPORT_VERSION, 'superabang-account-export-0.2.0');
  assert.equal(new Set(ACCOUNT_EXPORT_TABLES).size, ACCOUNT_EXPORT_TABLES.length);
  for (const table of [
    'program_version',
    'workout_session',
    'workout_set_log',
    'symptom_observation',
    'technique_observation',
    'recommendation_snapshot',
    'canonical_safety_context',
    'health_source_session_stage',
    'health_source_nutrition_stage',
    'canonical_cutover_event',
  ]) {
    assert.ok(ACCOUNT_EXPORT_TABLES.includes(table as typeof ACCOUNT_EXPORT_TABLES[number]), `${table} missing`);
  }
});
