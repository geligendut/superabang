export interface BodyMeasurement {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  waistCm: number | null;
  source: 'MANUAL';
}

export interface MetricTrend {
  latest: number | null;
  previous: number | null;
  delta: number | null;
}

export interface MetricTrajectory {
  observationCount: number;
  first: number | null;
  latest: number | null;
  deltaFromFirst: number | null;
  spanDays: number;
  weeklySlope: number | null;
  status: 'INSUFFICIENT_DATA' | 'ESTIMATE_AVAILABLE';
}

export const TRAJECTORY_MIN_OBSERVATIONS = 3;
export const TRAJECTORY_MIN_SPAN_DAYS = 7;

export function parseLocalizedDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function finitePositive(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

export function validateBodyMeasurement(input: Pick<BodyMeasurement, 'weightKg'|'waistCm'>): string[] {
  const errors: string[] = [];
  if (input.weightKg === null && input.waistCm === null) errors.push('AT_LEAST_ONE_METRIC_REQUIRED');
  if (!finitePositive(input.weightKg) || (input.weightKg !== null && (input.weightKg < 30 || input.weightKg > 350))) errors.push('WEIGHT_OUT_OF_RANGE');
  if (!finitePositive(input.waistCm) || (input.waistCm !== null && (input.waistCm < 40 || input.waistCm > 250))) errors.push('WAIST_OUT_OF_RANGE');
  return errors;
}

export function metricTrend(rows: BodyMeasurement[], metric: 'weightKg'|'waistCm'): MetricTrend {
  const values = [...rows]
    .sort((a,b) => b.measuredAt.localeCompare(a.measuredAt))
    .map(row => row[metric])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const latest = values[0] ?? null;
  const previous = values[1] ?? null;
  return { latest, previous, delta: latest !== null && previous !== null ? Number((latest - previous).toFixed(2)) : null };
}

function metricPoints(rows: BodyMeasurement[], metric: 'weightKg'|'waistCm') {
  return rows
    .map(row => ({ t: Date.parse(row.measuredAt), value: row[metric] }))
    .filter((point): point is { t: number; value: number } => Number.isFinite(point.t) && point.value !== null && Number.isFinite(point.value))
    .sort((a,b) => a.t - b.t);
}

export function metricTrajectory(rows: BodyMeasurement[], metric: 'weightKg'|'waistCm'): MetricTrajectory {
  const points = metricPoints(rows, metric);
  if (!points.length) {
    return { observationCount: 0, first: null, latest: null, deltaFromFirst: null, spanDays: 0, weeklySlope: null, status: 'INSUFFICIENT_DATA' };
  }

  const first = points[0].value;
  const latest = points[points.length - 1].value;
  const spanMs = points[points.length - 1].t - points[0].t;
  const spanDays = Number((spanMs / 86_400_000).toFixed(1));
  const deltaFromFirst = Number((latest - first).toFixed(2));

  if (points.length < TRAJECTORY_MIN_OBSERVATIONS || spanMs < TRAJECTORY_MIN_SPAN_DAYS * 86_400_000) {
    return { observationCount: points.length, first, latest, deltaFromFirst, spanDays, weeklySlope: null, status: 'INSUFFICIENT_DATA' };
  }

  // Ordinary least squares over all observations. Time is expressed in days from the
  // first observation. This is a descriptive estimate only; it is not a target or
  // medical interpretation.
  const t0 = points[0].t;
  const xs = points.map(point => (point.t - t0) / 86_400_000);
  const ys = points.map(point => point.value);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);

  if (denominator === 0) {
    return { observationCount: points.length, first, latest, deltaFromFirst, spanDays, weeklySlope: null, status: 'INSUFFICIENT_DATA' };
  }

  const weeklySlope = Number(((numerator / denominator) * 7).toFixed(2));
  return { observationCount: points.length, first, latest, deltaFromFirst, spanDays, weeklySlope, status: 'ESTIMATE_AVAILABLE' };
}
