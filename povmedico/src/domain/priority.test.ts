import { describe, it, expect } from 'vitest';
import { computePriorityScore, linearSlope, computeAdherenceDeficit7d } from './priority';
import type { DerivedClinical, Session } from '../data/types';
import { computeDerivedClinical } from './scores';

describe('linearSlope', () => {
  it('returns positive slope for increasing values', () => {
    expect(linearSlope([10, 20, 30, 40, 50])).toBeCloseTo(10, 1);
  });

  it('returns negative slope for decreasing values', () => {
    expect(linearSlope([50, 40, 30, 20, 10])).toBeCloseTo(-10, 1);
  });

  it('returns 0 for constant values', () => {
    expect(linearSlope([5, 5, 5, 5, 5])).toBeCloseTo(0, 5);
  });

  it('returns 0 for single value', () => {
    expect(linearSlope([42])).toBe(0);
  });
});

describe('computeAdherenceDeficit7d', () => {
  it('returns 0 when all sessions present', () => {
    const sessions: Pick<Session, 'date'>[] = [
      { date: '2026-05-22' },
      { date: '2026-05-23' },
      { date: '2026-05-24' },
      { date: '2026-05-25' },
      { date: '2026-05-26' },
    ];
    const deficit = computeAdherenceDeficit7d(sessions as Session[], 5, new Date('2026-05-28'));
    expect(deficit).toBe(0);
  });

  it('returns 1 when no sessions in window', () => {
    const sessions: Pick<Session, 'date'>[] = [
      { date: '2026-05-01' },
    ];
    const deficit = computeAdherenceDeficit7d(sessions as Session[], 5, new Date('2026-05-28'));
    expect(deficit).toBe(1);
  });

  it('returns proportional deficit', () => {
    const sessions: Pick<Session, 'date'>[] = [
      { date: '2026-05-24' },
      { date: '2026-05-26' },
    ];
    const deficit = computeAdherenceDeficit7d(sessions as Session[], 5, new Date('2026-05-28'));
    expect(deficit).toBeCloseTo(0.6, 1);
  });
});

describe('computePriorityScore', () => {
  it('returns 0 for patient with no flags, flat trend, full adherence', () => {
    const derived: DerivedClinical = {
      ...computeDerivedClinical([]),
      tremorFlag: false, spasticityFlag: false, fatigueFlag: false, impulseControlFlag: false,
      proximalGripScore: 70, distalFlexExtScore: 70, pronoSupScore: 70, globalMotorScore: 70,
      scaleMetrics: [],
    };
    const score = computePriorityScore(derived, [70, 70, 70, 70, 70], 0);
    expect(score).toBe(0);
  });

  it('increases with flags', () => {
    const derived: DerivedClinical = {
      ...computeDerivedClinical([]),
      tremorFlag: true, spasticityFlag: true, fatigueFlag: false, impulseControlFlag: false,
      proximalGripScore: 50, distalFlexExtScore: 50, pronoSupScore: 50, globalMotorScore: 50,
      scaleMetrics: [],
    };
    const score = computePriorityScore(derived, [50, 50, 50, 50, 50], 0);
    expect(score).toBe(4); // 2 * 2 flags
  });

  it('increases with regression', () => {
    const derived: DerivedClinical = {
      ...computeDerivedClinical([]),
      tremorFlag: false, spasticityFlag: false, fatigueFlag: false, impulseControlFlag: false,
      proximalGripScore: 50, distalFlexExtScore: 50, pronoSupScore: 50, globalMotorScore: 50,
      scaleMetrics: [],
    };
    const score = computePriorityScore(derived, [60, 55, 50, 45, 40], 0);
    expect(score).toBeGreaterThan(5); // slope is -5, penalty = 1.5 * 5 = 7.5
  });

  it('increases with adherence deficit', () => {
    const derived: DerivedClinical = {
      ...computeDerivedClinical([]),
      tremorFlag: false, spasticityFlag: false, fatigueFlag: false, impulseControlFlag: false,
      proximalGripScore: 50, distalFlexExtScore: 50, pronoSupScore: 50, globalMotorScore: 50,
      scaleMetrics: [],
    };
    const score = computePriorityScore(derived, [50, 50, 50, 50, 50], 0.8);
    expect(score).toBeCloseTo(0.8, 1);
  });
});
