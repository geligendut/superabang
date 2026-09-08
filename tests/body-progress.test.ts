import test from 'node:test';
import assert from 'node:assert/strict';
import { metricTrajectory, metricTrend, parseLocalizedDecimal, validateBodyMeasurement, type BodyMeasurement } from '../src/domain/body-progress.ts';

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

test('localized decimal parser accepts Indonesian comma and decimal point', () => {
  assert.equal(parseLocalizedDecimal('86,5'), 86.5);
  assert.equal(parseLocalizedDecimal('86.5'), 86.5);
  assert.equal(parseLocalizedDecimal('104,0'), 104);
  assert.equal(parseLocalizedDecimal(''), null);
  assert.ok(Number.isNaN(parseLocalizedDecimal('86,5,2') as number));
});

test('trajectory does not infer missing metric values and requires enough longitudinal data', () => {
  const rows: BodyMeasurement[] = [
    { id:'a', measuredAt:'2026-09-01T00:00:00Z', weightKg:88, waistCm:105, source:'MANUAL' },
    { id:'b', measuredAt:'2026-09-05T00:00:00Z', weightKg:null, waistCm:104.5, source:'MANUAL' },
    { id:'c', measuredAt:'2026-09-09T00:00:00Z', weightKg:87.2, waistCm:null, source:'MANUAL' },
  ];
  const weight = metricTrajectory(rows, 'weightKg');
  const waist = metricTrajectory(rows, 'waistCm');
  assert.equal(weight.observationCount, 2);
  assert.equal(weight.status, 'INSUFFICIENT_DATA');
  assert.equal(weight.weeklySlope, null);
  assert.equal(waist.observationCount, 2);
  assert.equal(waist.status, 'INSUFFICIENT_DATA');
});

test('trajectory estimates weekly slope only after at least 3 observations spanning 7 days', () => {
  const rows: BodyMeasurement[] = [
    { id:'a', measuredAt:'2026-09-01T00:00:00Z', weightKg:88, waistCm:105, source:'MANUAL' },
    { id:'b', measuredAt:'2026-09-05T00:00:00Z', weightKg:87.6, waistCm:104.8, source:'MANUAL' },
    { id:'c', measuredAt:'2026-09-09T00:00:00Z', weightKg:87.2, waistCm:104.6, source:'MANUAL' },
  ];
  const weight = metricTrajectory(rows, 'weightKg');
  const waist = metricTrajectory(rows, 'waistCm');
  assert.equal(weight.status, 'ESTIMATE_AVAILABLE');
  assert.equal(weight.observationCount, 3);
  assert.equal(weight.spanDays, 8);
  assert.equal(weight.weeklySlope, -0.7);
  assert.equal(weight.deltaFromFirst, -0.8);
  assert.equal(waist.status, 'ESTIMATE_AVAILABLE');
  assert.equal(waist.weeklySlope, -0.35);
});

test('trajectory remains unavailable when observations are too close together', () => {
  const rows: BodyMeasurement[] = [
    { id:'a', measuredAt:'2026-09-01T00:00:00Z', weightKg:88, waistCm:null, source:'MANUAL' },
    { id:'b', measuredAt:'2026-09-02T00:00:00Z', weightKg:87.8, waistCm:null, source:'MANUAL' },
    { id:'c', measuredAt:'2026-09-03T00:00:00Z', weightKg:87.5, waistCm:null, source:'MANUAL' },
  ];
  const result = metricTrajectory(rows, 'weightKg');
  assert.equal(result.observationCount, 3);
  assert.equal(result.spanDays, 2);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.weeklySlope, null);
});
