import test from 'node:test';
import assert from 'node:assert/strict';
import { metricTrend, validateBodyMeasurement, type BodyMeasurement } from '../src/domain/body-progress.ts';

test('body measurement permits partial observations but not an empty row', () => {
  assert.deepEqual(validateBodyMeasurement({ weightKg: 87.2, waistCm: null }), []);
  assert.deepEqual(validateBodyMeasurement({ weightKg: null, waistCm: 104 }), []);
  assert.ok(validateBodyMeasurement({ weightKg: null, waistCm: null }).includes('AT_LEAST_ONE_METRIC_REQUIRED'));
});

test('body measurement rejects implausible engineering input ranges', () => {
  assert.ok(validateBodyMeasurement({ weightKg: 10, waistCm: 100 }).includes('WEIGHT_OUT_OF_RANGE'));
  assert.ok(validateBodyMeasurement({ weightKg: 80, waistCm: 300 }).includes('WAIST_OUT_OF_RANGE'));
});

test('trend compares the latest two observations containing that metric only', () => {
  const rows: BodyMeasurement[] = [
    { id:'a', measuredAt:'2026-09-01T00:00:00Z', weightKg:88, waistCm:105, source:'MANUAL' },
    { id:'b', measuredAt:'2026-09-02T00:00:00Z', weightKg:null, waistCm:104, source:'MANUAL' },
    { id:'c', measuredAt:'2026-09-03T00:00:00Z', weightKg:87.5, waistCm:null, source:'MANUAL' },
  ];
  assert.deepEqual(metricTrend(rows,'weightKg'), { latest:87.5, previous:88, delta:-0.5 });
  assert.deepEqual(metricTrend(rows,'waistCm'), { latest:104, previous:105, delta:-1 });
});
