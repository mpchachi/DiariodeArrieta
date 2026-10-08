import type { SlingshotMetrics, FlappyMetrics, WaterMetrics, DerivedClinical, GameResult, TremorLevel, VariabilityLevel, EnrichedColumns } from '../data/types';
import { computeScaleMetricResults } from '../data/clinicalMetrics';
import { TREMOR_PATHOLOGICAL, SPASTICITY_JERK, FATIGUE_PCT } from './thresholds';

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return clamp(((value - min) / (max - min)) * 100);
}

function normalizeInverse(value: number, min: number, max: number): number {
  return 100 - normalize(value, min, max);
}

export function computeProximalGripScore(m: SlingshotMetrics): { score: number; components: { accuracy: number; pinch: number; velocity: number; tremor: number } } {
  const accuracy = normalize(m.accuracyRatio, 0, 1);
  const pinch = normalize(m.maxPinchOpen, 0, 1);
  const velocity = normalize(m.maxPullDistance, 0, 500);
  const tremor = normalizeInverse(m.pullTremor, 0, 6);
  const score = clamp((accuracy + pinch + velocity + tremor) / 4);
  return { score, components: { accuracy: Math.round(accuracy), pinch: Math.round(pinch), velocity: Math.round(velocity), tremor: Math.round(tremor) } };
}

export function computeDistalFlexExtScore(m: FlappyMetrics): { score: number; components: { flexion: number; extension: number; activation: number; fatigue: number; smoothness: number } } {
  const flexion = normalize(m.maxFlexion, 0, 1);
  const extension = normalize(m.maxExtension, 0, 1);
  const activation = normalize(m.activationCount, 0, 60);
  const fatigue = normalizeInverse(Math.abs(m.fatigueIndex), 0, 30);
  const smoothness = normalizeInverse(m.smoothnessJerk, 0, 6);
  const score = clamp((flexion + extension + activation + fatigue + smoothness) / 5);
  return { score, components: { flexion: Math.round(flexion), extension: Math.round(extension), activation: Math.round(activation), fatigue: Math.round(fatigue), smoothness: Math.round(smoothness) } };
}

export function computePronoSupScore(m: WaterMetrics): { score: number; components: { supination: number; pronation: number; accuracy: number; errors: number; smoothness: number; speed: number } } {
  const supination = normalize(m.maxSupination, 0, 90);
  const pronation = normalize(m.maxPronation, 0, 90);
  const accuracy = normalize(m.waterAccuracy, 0, 100);
  const errors = normalizeInverse(m.poisonError, 0, 50);
  const smoothness = normalizeInverse(m.smoothnessJerk, 0, 6);
  const speed = normalizeInverse(m.averagePouringTime, 500, 5000);
  const score = clamp((supination + pronation + accuracy + errors + smoothness + speed) / 6);
  return { score, components: { supination: Math.round(supination), pronation: Math.round(pronation), accuracy: Math.round(accuracy), errors: Math.round(errors), smoothness: Math.round(smoothness), speed: Math.round(speed) } };
}

function computeTremorLevel(sm: SlingshotMetrics | undefined, wm: WaterMetrics | undefined, enrichedSlingshot: EnrichedColumns | null): TremorLevel {
  if (enrichedSlingshot?.tremorBand != null) {
    return enrichedSlingshot.tremorBand;
  }
  const pullTremor = sm?.pullTremor ?? 0;
  const waterJerk = wm?.smoothnessJerk ?? 0;
  if (pullTremor > TREMOR_PATHOLOGICAL || waterJerk > SPASTICITY_JERK) return 'pathological';
  if (pullTremor > 1.5 || waterJerk > 2) return 'physiological';
  return 'none';
}

function computeVariabilityLevel(fm: FlappyMetrics | undefined, enriched: EnrichedColumns | null): VariabilityLevel {
  const realCv = enriched?.peakVelocityCv;
  if (realCv != null) {
    if (realCv < 0.15) return 'very-consistent';
    if (realCv < 0.30) return 'consistent';
    if (realCv < 0.50) return 'variable';
    return 'very-variable';
  }
  if (!fm) return 'consistent';
  const cv = fm.smoothnessJerk / 6;
  if (cv < 0.15) return 'very-consistent';
  if (cv < 0.30) return 'consistent';
  if (cv < 0.50) return 'variable';
  return 'very-variable';
}

export function computeDerivedClinical(
  games: GameResult[],
  poisonThreshold = 25
): DerivedClinical {
  const slingshot = games.find(g => g.game === 'slingshot');
  const flappy = games.find(g => g.game === 'flappy');
  const water = games.find(g => g.game === 'water');

  const sm = slingshot?.metrics as SlingshotMetrics | undefined;
  const fm = flappy?.metrics as FlappyMetrics | undefined;
  const wm = water?.metrics as WaterMetrics | undefined;

  const enrichedSlingshot = slingshot?.enriched ?? null;
  const enrichedFlappy = flappy?.enriched ?? null;

  const tremorLevel = computeTremorLevel(sm, wm, enrichedSlingshot);
  const tremorFlag = tremorLevel === 'pathological';
  const spasticityFlag = fm ? fm.smoothnessJerk > SPASTICITY_JERK : false;
  const fatigueFlag = enrichedFlappy?.fatigueIndex != null
    ? enrichedFlappy.fatigueIndex < FATIGUE_PCT
    : (fm ? fm.fatigueIndex < FATIGUE_PCT : false);
  const impulseControlFlag = wm ? wm.poisonError > poisonThreshold : false;
  const variabilityLevel = computeVariabilityLevel(fm, enrichedFlappy);

  const proximal = sm ? computeProximalGripScore(sm) : { score: 50, components: { accuracy: 50, pinch: 50, velocity: 50, tremor: 50 } };
  const distal = fm ? computeDistalFlexExtScore(fm) : { score: 50, components: { flexion: 50, extension: 50, activation: 50, fatigue: 50, smoothness: 50 } };
  const pronoSup = wm ? computePronoSupScore(wm) : { score: 50, components: { supination: 50, pronation: 50, accuracy: 50, errors: 50, smoothness: 50, speed: 50 } };
  const globalMotorScore = (proximal.score + distal.score + pronoSup.score) / 3;

  return {
    tremorFlag,
    spasticityFlag,
    fatigueFlag,
    impulseControlFlag,
    tremorLevel,
    variabilityLevel,
    proximalGripScore: Math.round(proximal.score * 10) / 10,
    proximalComponents: proximal.components,
    distalFlexExtScore: Math.round(distal.score * 10) / 10,
    distalComponents: distal.components,
    pronoSupScore: Math.round(pronoSup.score * 10) / 10,
    pronoSupComponents: pronoSup.components,
    globalMotorScore: Math.round(globalMotorScore * 10) / 10,
    scaleMetrics: computeScaleMetricResults(games),
  };
}
