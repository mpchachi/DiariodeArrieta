import { describe, it, expect } from 'vitest';
import { computeProximalGripScore, computeDistalFlexExtScore, computePronoSupScore, computeDerivedClinical } from './scores';
import type { SlingshotMetrics, FlappyMetrics, WaterMetrics, GameResult } from '../data/types';

describe('computeProximalGripScore', () => {
  it('returns high score for good metrics', () => {
    const m: SlingshotMetrics = { maxPinchOpen: 0.9, maxPullDistance: 450, pullTremor: 0.5, accuracyRatio: 0.9, totalShots: 15 };
    const { score } = computeProximalGripScore(m);
    expect(score).toBeGreaterThan(75);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns low score for poor metrics', () => {
    const m: SlingshotMetrics = { maxPinchOpen: 0.1, maxPullDistance: 60, pullTremor: 5.5, accuracyRatio: 0.1, totalShots: 15 };
    const { score } = computeProximalGripScore(m);
    expect(score).toBeLessThan(30);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('computeDistalFlexExtScore', () => {
  it('returns high score for good metrics', () => {
    const m: FlappyMetrics = { maxExtension: 0.9, maxFlexion: 0.9, activationCount: 50, fatigueIndex: -2, smoothnessJerk: 0.5 };
    const { score } = computeDistalFlexExtScore(m);
    expect(score).toBeGreaterThan(75);
  });

  it('penalizes high fatigue and jerk', () => {
    const good: FlappyMetrics = { maxExtension: 0.8, maxFlexion: 0.8, activationCount: 40, fatigueIndex: -2, smoothnessJerk: 1 };
    const bad: FlappyMetrics = { maxExtension: 0.8, maxFlexion: 0.8, activationCount: 40, fatigueIndex: -25, smoothnessJerk: 5 };
    expect(computeDistalFlexExtScore(good).score).toBeGreaterThan(computeDistalFlexExtScore(bad).score);
  });
});

describe('computePronoSupScore', () => {
  it('returns high score for good metrics', () => {
    const m: WaterMetrics = { maxSupination: 85, maxPronation: 80, smoothnessJerk: 0.5, waterAccuracy: 92, poisonError: 2, averagePouringTime: 800 };
    const { score } = computePronoSupScore(m);
    expect(score).toBeGreaterThan(75);
  });
});

describe('computeDerivedClinical', () => {
  it('sets tremorFlag when pullTremor > 3', () => {
    const games: GameResult[] = [
      { game: 'slingshot', durationMs: 120000, metrics: { maxPinchOpen: 0.5, maxPullDistance: 200, pullTremor: 4.0, accuracyRatio: 0.5, totalShots: 10 } as SlingshotMetrics },
      { game: 'flappy', durationMs: 120000, metrics: { maxExtension: 0.5, maxFlexion: 0.5, activationCount: 20, fatigueIndex: -5, smoothnessJerk: 2 } as FlappyMetrics },
      { game: 'water', durationMs: 120000, metrics: { maxSupination: 40, maxPronation: 40, smoothnessJerk: 2, waterAccuracy: 60, poisonError: 10, averagePouringTime: 2000 } as WaterMetrics },
    ];
    const derived = computeDerivedClinical(games);
    expect(derived.tremorFlag).toBe(true);
    expect(derived.spasticityFlag).toBe(false);
  });

  it('sets spasticityFlag when flappy smoothnessJerk > 3', () => {
    const games: GameResult[] = [
      { game: 'slingshot', durationMs: 120000, metrics: { maxPinchOpen: 0.5, maxPullDistance: 200, pullTremor: 1.0, accuracyRatio: 0.5, totalShots: 10 } as SlingshotMetrics },
      { game: 'flappy', durationMs: 120000, metrics: { maxExtension: 0.5, maxFlexion: 0.5, activationCount: 20, fatigueIndex: -5, smoothnessJerk: 4.5 } as FlappyMetrics },
      { game: 'water', durationMs: 120000, metrics: { maxSupination: 40, maxPronation: 40, smoothnessJerk: 2, waterAccuracy: 60, poisonError: 10, averagePouringTime: 2000 } as WaterMetrics },
    ];
    const derived = computeDerivedClinical(games);
    expect(derived.spasticityFlag).toBe(true);
  });

  it('legacy fatigueFlag uses a strict threshold below -20', () => {
    const games: GameResult[] = [
      { game: 'slingshot', durationMs: 120000, metrics: { maxPinchOpen: 0.5, maxPullDistance: 200, pullTremor: 1.0, accuracyRatio: 0.5, totalShots: 10 } as SlingshotMetrics },
      { game: 'flappy', durationMs: 120000, metrics: { maxExtension: 0.5, maxFlexion: 0.5, activationCount: 20, fatigueIndex: -20, smoothnessJerk: 2 } as FlappyMetrics },
      { game: 'water', durationMs: 120000, metrics: { maxSupination: 40, maxPronation: 40, smoothnessJerk: 2, waterAccuracy: 60, poisonError: 10, averagePouringTime: 2000 } as WaterMetrics },
    ];
    const derived = computeDerivedClinical(games);
    expect(derived.fatigueFlag).toBe(false);
    (games[1].metrics as FlappyMetrics).fatigueIndex = -21;
    expect(computeDerivedClinical(games).fatigueFlag).toBe(true);
  });

  it('sets impulseControlFlag when poisonError > threshold', () => {
    const games: GameResult[] = [
      { game: 'slingshot', durationMs: 120000, metrics: { maxPinchOpen: 0.5, maxPullDistance: 200, pullTremor: 1.0, accuracyRatio: 0.5, totalShots: 10 } as SlingshotMetrics },
      { game: 'flappy', durationMs: 120000, metrics: { maxExtension: 0.5, maxFlexion: 0.5, activationCount: 20, fatigueIndex: -5, smoothnessJerk: 2 } as FlappyMetrics },
      { game: 'water', durationMs: 120000, metrics: { maxSupination: 40, maxPronation: 40, smoothnessJerk: 2, waterAccuracy: 60, poisonError: 30, averagePouringTime: 2000 } as WaterMetrics },
    ];
    const derived = computeDerivedClinical(games);
    expect(derived.impulseControlFlag).toBe(true);
  });

  it('computes globalMotorScore as average of three domains', () => {
    const games: GameResult[] = [
      { game: 'slingshot', durationMs: 120000, metrics: { maxPinchOpen: 0.5, maxPullDistance: 250, pullTremor: 2.0, accuracyRatio: 0.5, totalShots: 10 } as SlingshotMetrics },
      { game: 'flappy', durationMs: 120000, metrics: { maxExtension: 0.5, maxFlexion: 0.5, activationCount: 30, fatigueIndex: -8, smoothnessJerk: 2.5 } as FlappyMetrics },
      { game: 'water', durationMs: 120000, metrics: { maxSupination: 45, maxPronation: 45, smoothnessJerk: 2.5, waterAccuracy: 55, poisonError: 15, averagePouringTime: 2500 } as WaterMetrics },
    ];
    const derived = computeDerivedClinical(games);
    const expected = (derived.proximalGripScore + derived.distalFlexExtScore + derived.pronoSupScore) / 3;
    expect(derived.globalMotorScore).toBeCloseTo(expected, 0);
  });
});
