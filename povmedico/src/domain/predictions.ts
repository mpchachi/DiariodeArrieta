import type { PatientPrediction, Session } from '../data/types';
import { linearSlope } from './priority';
import { addDays, format } from 'date-fns';

// Mínimo de sesiones para proyectar algo con sentido.
export const MIN_SESSIONS_FOR_PREDICTION = 3;

export function generatePrediction(
  patientId: string,
  sessions: Session[],
  metric: string = 'globalMotorScore',
  weeksAhead: number = 8
): PatientPrediction | null {
  if (sessions.length < MIN_SESSIONS_FOR_PREDICTION) return null;

  const values = sessions.map(s => {
    switch (metric) {
      case 'proximalGripScore': return s.derived.proximalGripScore;
      case 'distalFlexExtScore': return s.derived.distalFlexExtScore;
      case 'pronoSupScore': return s.derived.pronoSupScore;
      default: return s.derived.globalMotorScore;
    }
  });

  const slope = linearSlope(values);
  const lastValue = values[values.length - 1];
  const variance = computeVariance(values.slice(-10));
  const lastDate = sessions[sessions.length - 1].date;

  const trajectory: PatientPrediction['trajectory'] = [];
  for (let day = 1; day <= weeksAhead * 7; day++) {
    const predicted = clamp(lastValue + slope * (day / 7), 0, 100);
    const ciWidth = Math.sqrt(variance) * Math.sqrt(day / 7) * 1.5;
    trajectory.push({
      date: format(addDays(new Date(lastDate), day), 'yyyy-MM-dd'),
      predicted: round(predicted),
      ciLow: round(Math.max(0, predicted - ciWidth)),
      ciHigh: round(Math.min(100, predicted + ciWidth)),
    });
  }

  const currentScore = lastValue;
  const milestones = [
    { milestone: 'Puntuación 60', target: 60 },
    { milestone: 'Puntuación 75', target: 75 },
    { milestone: 'Puntuación 90', target: 90 },
  ];

  const milestoneProbability = milestones.map(m => ({
    milestone: m.milestone,
    byWeek: Array.from({ length: weeksAhead }, (_, i) => {
      const weekNum = i + 1;
      const projectedAtWeek = lastValue + slope * weekNum;
      const stdAtWeek = Math.sqrt(variance) * Math.sqrt(weekNum);
      const zScore = stdAtWeek > 0 ? (m.target - projectedAtWeek) / stdAtWeek : (projectedAtWeek >= m.target ? -10 : 10);
      const p = clamp(1 - normalCDF(zScore), 0, 1);
      return { week: weekNum, p: round(p) };
    }),
  }));

  const recentSlope = linearSlope(values.slice(-5));
  const plateauRisk = clamp(1 - Math.abs(recentSlope) / 2, 0, 1);
  const sessionsPerWeek = sessions.length / Math.max(1, weeksAhead);
  const dropoutRisk = clamp(1 - sessionsPerWeek / 5, 0, 1);

  const drivers = [
    { feature: 'Tendencia (pendiente)', weight: round(Math.abs(slope) * 20) },
    { feature: 'Variabilidad', weight: round(Math.sqrt(variance) * 5) },
    { feature: 'Frecuencia de sesiones', weight: round(sessionsPerWeek * 10) },
    { feature: 'Puntuación actual', weight: round(currentScore / 10) },
    { feature: 'Número de alertas', weight: round(countFlags(sessions) * 15) },
  ].sort((a, b) => b.weight - a.weight);

  return {
    patientId,
    metric,
    trajectory,
    milestoneProbability: milestoneProbability[0] ? milestoneProbability : [],
    plateauRisk: round(plateauRisk),
    dropoutRisk: round(dropoutRisk),
    drivers,
  };
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 4;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function countFlags(sessions: Session[]): number {
  const last = sessions[sessions.length - 1];
  if (!last) return 0;
  return [last.derived.tremorFlag, last.derived.spasticityFlag, last.derived.fatigueFlag, last.derived.impulseControlFlag].filter(Boolean).length;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
