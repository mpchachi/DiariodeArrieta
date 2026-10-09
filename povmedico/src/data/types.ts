export type AffectedSide = 'left' | 'right';
export type Hand = 'left' | 'right';
export type MobilityLevel = 'agile' | 'moderate' | 'reduced';
export type StrokeType = 'ischemic' | 'hemorrhagic';
export type GameId = 'slingshot' | 'flappy' | 'water';

export interface SlingshotMetrics {
  maxPinchOpen: number;
  maxPullDistance: number;
  pullTremor: number;
  accuracyRatio: number;
  totalShots: number;
}

export interface FlappyMetrics {
  maxExtension: number;
  maxFlexion: number;
  activationCount: number;
  fatigueIndex: number;
  smoothnessJerk: number;
}

export interface WaterMetrics {
  maxSupination: number;
  maxPronation: number;
  smoothnessJerk: number;
  waterAccuracy: number;
  poisonError: number;
  averagePouringTime: number;
}

export interface TelemetryFrame {
  timestamp: number;
  phase: string;
  fistStrength?: number;
  pitcherRotationZ?: number;
  glassCurrentVolume?: number;
  glassTargetVolume?: number;
  glassPoisonVolume?: number;
  round?: number;
  pullX?: number;
  pullY?: number;
  isPinching?: boolean;
  pinchRatio?: number;
  score?: number;
  birdsLeft?: number;
}

export interface EnrichedColumns {
  sparcMean: number | null;
  sparcCv: number | null;
  sparcWorst: number | null;
  bveValue: number | null;
  endpointAccuracy: number | null;
  fingerIndividuationMean: number | null;
  fingersExtendedMax: number | null;
  handOpeningSpeedP75: number | null;
  pinchDistanceMeanMm: number | null;
  palmSpeedP75: number | null;
  peakVelocityCv: number | null;
  durationCv: number | null;
  repCount: number | null;
  fatigueIndex: number | null;
  tremorFreqHz: number | null;
  tremorBand: 'none' | 'physiological' | 'pathological' | null;
  reactionTimeMeanMs: number | null;
  qualityFramesPct: number | null;
  meanDurationMs: number | null;
}

export interface GameResult {
  game: GameId;
  durationMs: number;
  metrics: SlingshotMetrics | FlappyMetrics | WaterMetrics;
  enriched?: EnrichedColumns;
  frames?: TelemetryFrame[];
}

export type TremorLevel = 'none' | 'physiological' | 'pathological';
export type VariabilityLevel = 'very-consistent' | 'consistent' | 'variable' | 'very-variable';

export interface DerivedClinical {
  tremorFlag: boolean;
  spasticityFlag: boolean;
  fatigueFlag: boolean;
  impulseControlFlag: boolean;
  tremorLevel: TremorLevel;
  variabilityLevel: VariabilityLevel;
  proximalGripScore: number;
  proximalComponents: { accuracy: number; pinch: number; velocity: number; tremor: number };
  distalFlexExtScore: number;
  distalComponents: { flexion: number; extension: number; activation: number; fatigue: number; smoothness: number };
  pronoSupScore: number;
  pronoSupComponents: { supination: number; pronation: number; accuracy: number; errors: number; smoothness: number; speed: number };
  globalMotorScore: number;
  scaleMetrics: ScaleMetricResult[];
}

export type ScaleName = 'FMA-UE' | 'DASH';

export interface ScaleMetricResult {
  id: string;
  technicalId: string;
  label: string;
  game: string;
  value: number;
  unit?: string;
  priority: 'CORE' | 'V2' | 'EXPL';
  status: 'Captured' | 'To be implemented' | 'Proxy';
  direction: 'higher-is-better' | 'lower-is-better';
  definition: string;
  scaleLinks: {
    scale: ScaleName;
    item: string;
    coverage?: 'Yes' | 'Partial' | 'Proxy' | 'Analogous' | 'No';
  }[];
}

export interface Session {
  id: string;
  patientId: string;
  date: string;
  handUsed: Hand;
  games: GameResult[];
  derived: DerivedClinical;
}

export interface PrescribedExercise {
  id: string;
  name: string;
  targetDomain: 'proximal-grip' | 'distal-flex-ext' | 'prono-supination';
  frequencyPerWeek: number;
  intensity: 'low' | 'medium' | 'high';
  startDate: string;
  endDate?: string;
  adherenceLog: { date: string; completed: boolean }[];
}

export interface EventMarker {
  id: string;
  date: string;
  type: 'medication' | 'exercise-change' | 'botox' | 'clinical-note' | 'other';
  label: string;
}

export interface Patient {
  id: string;
  pseudonym: string;
  age: number;
  sex: 'M' | 'F' | 'other';
  // 'healthy' = voluntario sano (grupo de referencia): sin datos de ictus.
  subjectType: 'patient' | 'healthy';
  // Datos clínicos: null = no consta (nunca se inventan).
  strokeType: StrokeType | null;
  strokeDate: string | null;
  affectedSide: AffectedSide | null;
  mobility: MobilityLevel | null;
  clinicianIds: string[];
  baselineSessionId: string;
  prescribedExercises: PrescribedExercise[];
  eventMarkers: EventMarker[];
}

export interface Clinician {
  id: string;
  name: string;
  role: 'physician' | 'physiotherapist' | 'occupational-therapist';
}

export interface PatientPrediction {
  patientId: string;
  metric: string;
  trajectory: { date: string; predicted: number; ciLow: number; ciHigh: number }[];
  milestoneProbability: { milestone: string; byWeek: { week: number; p: number }[] }[];
  plateauRisk: number;
  dropoutRisk: number;
  drivers: { feature: string; weight: number }[];
}
