type Row = Record<string, unknown>;
export const MEASUREMENT_VERSION = 'fox-observation-2.0.0';
export interface Observation {
  id: string;
  stage: string;
  status: 'completed' | 'incomplete' | 'unmeasurable' | 'not-performed';
  sampleCount: number;
  usableCount: number;
  p05: number | null;
  p95: number | null;
  excursion: number | null;
}
export interface Measurement {
  version: string;
  game: string;
  selectedHand: 'Right' | 'Left';
  handConvention: string;
  source: string;
  protocol: string;
  algorithm: string;
  config: Row;
  completed: boolean;
  comparable: boolean;
  capture: { frames: number; usable: number; usablePct: number | null; maxGapMs: number; truncated: boolean; nonMonotonic: number; dimensions: string[]; issues: Record<string, number> };
  observations: Observation[];
  adaptation: { threshold: number; target?: string }[];
  calibration?: { stable: boolean } | null;
  summary: { upper: number | null; lower: number | null; excursion: number | null; opportunities: number };
}
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
export function measurementOf(row: Row | null): Measurement | null {
  const m = object(object(row?.outcome).measurement), c = object(m.capture), s = object(m.summary);
  if (m.version !== MEASUREMENT_VERSION || !['Right', 'Left'].includes(String(m.selectedHand)) ||
    !['game', 'handConvention', 'source', 'protocol', 'algorithm'].every(k => typeof m[k] === 'string') ||
    !Array.isArray(m.observations) || !Array.isArray(m.adaptation) || !Array.isArray(c.dimensions) ||
    !['upper', 'lower', 'excursion'].every(k => s[k] === null || typeof s[k] === 'number' && Number.isFinite(s[k])) ||
    !['frames', 'usable', 'maxGapMs', 'nonMonotonic'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k])) ||
    !m.config || typeof m.config !== 'object') return null;
  if (!c.dimensions.every(v => typeof v === 'string') ||
    !m.adaptation.every(v => Number.isFinite(object(v).threshold)) ||
    typeof m.completed !== 'boolean' || typeof m.comparable !== 'boolean' ||
    !m.observations.every(v => {
      const o = object(v);
      return typeof o.id === 'string' && typeof o.stage === 'string' && Number.isFinite(o.usableCount) && Number.isFinite(o.sampleCount) &&
        ['p05', 'p95', 'excursion'].every(k => o[k] === null || typeof o[k] === 'number' && Number.isFinite(o[k])) &&
        ['completed', 'incomplete', 'unmeasurable', 'not-performed'].includes(String(o.status));
    })) return null;
  return m as unknown as Measurement;
}
const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Row)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};
export function comparisonReason(current: Row | null, previous: Row | null): string | null {
  const a = measurementOf(current), b = measurementOf(previous);
  if (!a || !b) return 'Histórico sin versión compatible de medición';
  if (a.selectedHand !== b.selectedHand || a.handConvention !== b.handConvention) return 'Mano o convención de lateralidad diferente';
  if (a.game !== b.game || a.source !== b.source || a.protocol !== b.protocol || a.algorithm !== b.algorithm) return 'Método o protocolo diferente';
  if (stable(a.config) !== stable(b.config)) return 'Configuración de juego diferente';
  if (!a.completed || !b.completed) return 'Ejercicio interrumpido o no realizado';
  if (a.game === 'fox_garden' && (!a.calibration?.stable || !b.calibration?.stable)) return 'Referencia inicial de giro no comprobada';
  if (stable(a.capture.dimensions) !== stable(b.capture.dimensions)) return 'Resolución de captura diferente';
  if (stable(a.adaptation.map(x => [x.target, x.threshold])) !== stable(b.adaptation.map(x => [x.target, x.threshold]))) return 'Ayuda adaptativa diferente';
  if (!a.comparable || !b.comparable || [a, b].some(m => m.capture.truncated || m.capture.nonMonotonic > 0 || m.capture.maxGapMs > 250 || m.capture.frames !== m.capture.usable || m.capture.usable === 0)) return 'Captura incompleta o con incidencias: revisar antes de comparar';
  const observed = (m: Measurement) => m.observations.filter(o => o.stage === 'active' && o.usableCount >= 10).map(o => o.id).sort();
  if (!observed(a).length || stable(observed(a)) !== stable(observed(b))) return 'Oportunidades medidas diferentes';
  return null;
}
export const canCompare = (a: Row | null, b: Row | null) => comparisonReason(a, b) === null;
export const OBSERVATION_STATUS = { completed: 'Completada', incomplete: 'No completada', unmeasurable: 'Sin muestras utilizables', 'not-performed': 'No realizada' };
export const DIMENSIONS = { fox_runner: 'Apertura de pinza', fox_balloon: 'Apertura y cierre de mano', fox_garden: 'Inclinación durante el vertido' } as const;
