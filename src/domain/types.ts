export type ProgramStatus = 'CURRENT'|'PLANNED'|'COMPLETED'|'SUPERSEDED'|'PAUSED'|'ABANDONED';
export type SetType = 'WARMUP'|'WORKING'|'BACKOFF';
export type TechniqueFlag = 'OK'|'CAUTION';
export type SyncState = 'PENDING'|'SYNCED'|'CONFLICT'|'FAILED';

export interface ProgramVersion { id: string; programId: string; version: number; status: ProgramStatus; effectiveFrom: string; effectiveTo?: string; }
export interface WorkoutSetLog { id: string; sessionId: string; exerciseId: string; sequence: number; loadKg: number; reps: number; rpe?: number; setType: SetType; recordedAt: string; }
export interface SymptomObservation { id: string; sessionId: string; exerciseId?: string; severity: number; location?: string; onset?: string; trigger?: string; recordedAt: string; }
export interface TechniqueObservation { id: string; sessionId: string; exerciseId?: string; flag: TechniqueFlag; note?: string; recordedAt: string; }
export interface RecommendationSnapshot { id: string; ruleVersion: string; createdAt: string; inputSnapshot: unknown; decision: unknown; evidenceRefs: string[]; acceptedAt?: string; performedAt?: string; }
