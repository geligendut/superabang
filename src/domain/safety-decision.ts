import type { OfflineWorkoutSession } from '../offline/workout-store';

export type ExposureAction = 'BLOCK_PROGRESSION'|'HOLD_LOAD'|'ELIGIBLE_TO_PROGRESS';
export type RuleStatus = 'PROVISIONAL'|'APPROVED';

export interface RuleHit {
  ruleId: string;
  action: ExposureAction;
  reason: string;
  priority: number;
}

export interface ExposureAssessment {
  action: ExposureAction;
  reason: string;
  ruleVersion: 'm1-safety-0.2.0';
  ruleStatus: RuleStatus;
  matchedRules: RuleHit[];
}

export interface ExposureInput {
  maxRpe?: number;
  maxSymptomSeverity: number;
  anyTechniqueCaution: boolean;
  formBreakdown: boolean;
}

/**
 * M1 alpha safety policy.
 * Thresholds remain PROVISIONAL until reconciled against the approved safety matrix.
 * Ordering is intentional: safety block > technique hold > exertion hold > eligibility.
 */
export const M1_SAFETY_POLICY = {
  version: 'm1-safety-0.2.0' as const,
  status: 'PROVISIONAL' as const,
  symptomBlockThreshold: 4,
  highRpeHoldThreshold: 9,
};

export function assessNextExposure(input: ExposureInput): ExposureAssessment {
  const hits: RuleHit[] = [];

  if (input.maxSymptomSeverity >= M1_SAFETY_POLICY.symptomBlockThreshold) {
    hits.push({
      ruleId: 'SYMPTOM_BLOCK',
      action: 'BLOCK_PROGRESSION',
      reason: 'Symptom severity reached the provisional safety block threshold.',
      priority: 100,
    });
  }

  if (input.anyTechniqueCaution || input.formBreakdown) {
    hits.push({
      ruleId: 'TECHNIQUE_HOLD',
      action: 'HOLD_LOAD',
      reason: 'Technique concern prevents progression.',
      priority: 80,
    });
  }

  if (input.maxRpe !== undefined && input.maxRpe >= M1_SAFETY_POLICY.highRpeHoldThreshold) {
    hits.push({
      ruleId: 'HIGH_RPE_HOLD',
      action: 'HOLD_LOAD',
      reason: 'High exertion prevents automatic progression.',
      priority: 60,
    });
  }

  const ordered = hits.sort((a, b) => b.priority - a.priority);
  const winner = ordered[0];

  if (!winner) {
    return {
      action: 'ELIGIBLE_TO_PROGRESS',
      reason: 'No deterministic safety gate blocks progression; progression magnitude remains a separate decision.',
      ruleVersion: M1_SAFETY_POLICY.version,
      ruleStatus: M1_SAFETY_POLICY.status,
      matchedRules: [],
    };
  }

  return {
    action: winner.action,
    reason: winner.reason,
    ruleVersion: M1_SAFETY_POLICY.version,
    ruleStatus: M1_SAFETY_POLICY.status,
    matchedRules: ordered,
  };
}

export function summarizeSessionForDecision(session: Pick<OfflineWorkoutSession, 'sets'|'symptoms'|'techniques'>): ExposureInput {
  const maxSymptomSeverity = Math.max(0, ...session.symptoms.map(s => s.severity));
  const rpes = session.sets.map(s => s.rpe).filter((v): v is number => v !== undefined);
  const maxRpe = rpes.length ? Math.max(...rpes) : undefined;
  const anyTechniqueCaution = session.techniques.some(t => t.flag === 'CAUTION');

  return {
    maxRpe,
    maxSymptomSeverity,
    anyTechniqueCaution,
    formBreakdown: anyTechniqueCaution,
  };
}

export function evidenceRefsForDecision(session: Pick<OfflineWorkoutSession, 'sets'|'symptoms'|'techniques'>): string[] {
  return [
    ...session.sets.map(s => `set:${s.id}`),
    ...session.symptoms.map(s => `symptom:${s.id}`),
    ...session.techniques.map(t => `technique:${t.id}`),
  ];
}
