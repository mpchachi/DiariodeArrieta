import type { DerivedClinical } from '../data/types';

// Umbrales clínicos únicos: los usan scores.ts, las vistas y los tests.
export const TREMOR_PATHOLOGICAL = 3.5; // pullTremor
export const SPASTICITY_JERK = 4;       // smoothnessJerk (flappy)
export const FATIGUE_PCT = -20;         // fatigueIndex (%)

export type FlagKey = keyof Pick<DerivedClinical, 'impulseControlFlag' | 'spasticityFlag' | 'tremorFlag' | 'fatigueFlag'>;

// Etiquetas de cada alerta (mismo texto en todas las pantallas).
export const FLAG_LABELS: Record<FlagKey, string> = {
  impulseControlFlag: 'Control motor',
  spasticityFlag: 'Movimiento fragmentado',
  tremorFlag: 'Temblor',
  fatigueFlag: 'Fatiga',
};
