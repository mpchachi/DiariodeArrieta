import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSPARCFromProfile } from '../clinical/metrics.js';
import { MeasurementRecorder, sampleIssue, discreteSmoothness, resampleSegments, detectorHand } from './measurement.js';
import { HandTracker } from '../vision/hands.js';
import { gardenRow, buildJourneyRows } from './journeyRecord.js';
import { GardenEngine } from '../garden/engine.js';
import { summarize } from '../garden/session.js';

test('el huerto conserva una flor no completada y la subida mantiene versión, trazas y configuración', () => {
  const e = new GardenEngine();
  e.neutral = 0; e.newFlower(0);
  for (let t = 0; t < 1000; t += 33) e.update({ t, angle: -10 });
  const r = summarize(e, { durationMs: 1000, completed: false });
  assert.equal(r.flowers.length, 1);
  assert.equal(r.flowers[0].completed, false);
  assert.equal(r.summary.flowersBloomed, 0);
  assert.equal(r.summary.maxTiltDeg, 10);
  assert.equal(gardenRow(r).repetitions.length, 1);
  const rec = new MeasurementRecorder({ game: 'fox_garden', hand: 'Left', config: e.C, source: 'knuckle-image-tilt-v2', targets: [{ id: 'flower-0', stage: 'active' }] });
  for (let t = 0; t < 1000; t += 33) rec.add({ t, width: 640, height: 480 }, { target: 'flower-0', value: 10 });
  r.measurement = rec.finish(false);
  const [row] = buildJourneyRows({ garden: r });
  assert.equal(row.outcome.measurement.selectedHand, 'Left');
  assert.equal(row.outcome.measurement.observations[0].status, 'incomplete');
  assert.equal(row.outcome.observationValues.upper, 10);
  assert.equal(row.max_pronation_deg, null);
  assert.equal(row.session_sparc, null);
  assert.equal(row.tremor_band, null);
  assert.ok(row.outcome.measurement.trace.length > 0);
});

const recorder = () => new MeasurementRecorder({ game: 'fox_runner', hand: 'Left', config: { protocol: 'test', algorithm: '1' }, source: 'test',
  targets: [{ id: 'one', stage: 'active' }, { id: 'two', stage: 'active' }, { id: 'three', stage: 'active' }] });

test('registra movimiento pequeño sin completar, fallos de captura y oportunidades no realizadas', () => {
  const r = recorder();
  for (let i = 0; i < 20; i++) r.add({ t: i * 33, width: 640, height: 480 }, { target: 'one', value: i / 100 });
  r.add({ t: 700, width: 640, height: 480 }, { target: 'two', issue: 'missing' });
  r.add({ t: 733, width: 640, height: 480 }, { target: 'tutorial', stage: 'tutorial', value: 999 });
  const s = r.finish(false);
  assert.deepEqual(s.observations.slice(0, 3).map(x => x.status), ['incomplete', 'unmeasurable', 'not-performed']);
  assert.ok(s.summary.upper < 1);
  assert.equal(s.capture.usable, 20);
  assert.equal(s.comparable, false);
  assert.equal(s.selectedHand, 'Left');
  assert.equal(s.trace.length, 22);
});

test('un valor mantenido no es una medición nueva y los huecos no se interpolan', () => {
  assert.equal(sampleIssue({ luminance: 100 }, { hand: {} }, { fresh: false }), 'held-value');
  assert.equal(sampleIssue({ luminance: 10 }, { hand: {} }), 'dark');
  const r = recorder();
  for (let i = 0; i < 20; i++) r.add({ t: i * 33, width: 640, height: 480 }, { target: 'one', value: 2 });
  r.add({ t: 1200, width: 640, height: 480 }, { target: 'one', value: 2 });
  assert.equal(r.finish(true).comparable, false);
  const points = Array.from({ length: 20 }, (_, i) => ({ t: i * 33, v: Math.sin(i / 6) }));
  const separated = [...points, { t: 700, v: null }, ...points.map(p => ({ ...p, t: p.t + 2000 }))];
  assert.equal(resampleSegments(separated).length, 2);
  assert.equal(discreteSmoothness(separated), null);
  assert.equal(discreteSmoothness(points.map(p => ({ ...p, v: 0 }))), null);
});

test('solo acepta la lateralidad requerida, incluso tras perder la mano', () => {
  const tracker = new HandTracker({ preferred: detectorHand('Left'), required: true });
  const result = tracker.select({ t: 0, width: 640, height: 480, hands: [{ handedness: detectorHand('Right') }] });
  assert.equal(result.reason, 'wrong-hand');
  assert.equal(result.hand, null);
});

test('SPARC coincide con el perfil gaussiano de referencia y es invariante a escala', () => {
  const profile = Array.from({ length: 200 }, (_, i) => Math.exp(-5 * (-1 + i * .01) ** 2));
  const value = computeSPARCFromProfile(profile, 100);
  assert.ok(Math.abs(value - -1.4140312617) < 1e-6, String(value));
  assert.ok(Math.abs(computeSPARCFromProfile(profile.map(x => x * 100), 100) - value) < 1e-9);
  assert.equal(computeSPARCFromProfile(Array(30).fill(0), 30), null);
  assert.equal(computeSPARCFromProfile([1, 2, NaN], 30), null);
});
