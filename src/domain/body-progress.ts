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
