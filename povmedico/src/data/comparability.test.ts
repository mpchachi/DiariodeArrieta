import { describe, it, expect } from 'vitest';
import { canCompare, comparisonReason, measurementOf, MEASUREMENT_VERSION } from './comparability';
import { mapSupabaseSession } from './supabaseMapper';

it('tres registros incompletos no son un viaje completo y no se inventa mano derecha', () => {
  const mapped = mapSupabaseSession({ id: 'x', subject_id: 'p', started_at: '2026-10-10', completed: true, device: { protocol: 'fixedgap-fox-journey-v2' } },
    ['fox_runner', 'fox_balloon', 'fox_garden'].map(game_key => ({ game_key, outcome: { completed: false } })));
  expect(mapped.completed).toBe(false);
  expect(mapped.handUsed).toBeNull();
});

const row = () => ({ outcome: { measurement: {
  version: MEASUREMENT_VERSION, game: 'fox_garden', selectedHand: 'Left', handConvention: 'mirrored-v1', source: 'tilt-v2', protocol: 'garden', algorithm: '1',
  config: { speed: 30, tutorial: 2 }, completed: true, comparable: true, calibration: { stable: true },
  capture: { frames: 30, usable: 30, usablePct: 100, maxGapMs: 34, nonMonotonic: 0, truncated: false, dimensions: ['640x480'], issues: {} },
  observations: [{ id: 'one', stage: 'active', usableCount: 30, sampleCount: 30, status: 'completed', p05: 0, p95: 45, excursion: 45 }],
  adaptation: [{ threshold: 25 }], summary: { upper: 45, lower: 0, excursion: 45, opportunities: 1 },
} } });

describe('comparabilidad conservadora', () => {
  it('permite un cambio descriptivo con contexto equivalente', () => {
    const a = row(), b = row(); b.outcome.measurement.summary.upper = 50;
    b.outcome.measurement.config = { tutorial: 2, speed: 30 };
    expect(canCompare(a, b)).toBe(true);
  });
  it.each(['version', 'selectedHand', 'source', 'protocol', 'algorithm'] as const)('no mezcla %s', key => {
    const a = row(), b = row(); b.outcome.measurement[key] = 'different';
    expect(canCompare(a, b)).toBe(false);
  });
  it('rechaza historia desconocida sin reescribirla', () => {
    const legacy = { max_pronation_deg: 42, outcome: {} };
    expect(measurementOf(legacy)).toBeNull();
    expect(comparisonReason(row(), legacy)).toMatch(/Histórico/);
    expect(legacy.max_pronation_deg).toBe(42);
  });
  it('no compara configuración, resolución, ayuda o intentos distintos', () => {
    const a = row();
    const changes = [
      (b: ReturnType<typeof row>) => { b.outcome.measurement.config.speed = 50; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.capture.dimensions = ['1280x720']; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.adaptation.push({ threshold: 12 }); },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.observations = []; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.completed = false; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.capture.maxGapMs = 500; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.capture.usable = 25; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.calibration.stable = false; },
      (b: ReturnType<typeof row>) => { b.outcome.measurement.observations[0].p95 = NaN; },
    ];
    for (const change of changes) { const b = row(); change(b); expect(canCompare(a, b)).toBe(false); }
  });
});
