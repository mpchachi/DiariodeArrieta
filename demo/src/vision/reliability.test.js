import test from 'node:test';
import assert from 'node:assert/strict';
import { ReliabilityMeter, reliabilityLevel } from './reliability.js';

const OK = { ok: true, code: 'ok' }, CLOSE = { ok: false, code: 'close' };

test('fiabilidad: cuenta mano detectada, descartes y encuadre', () => {
  const m = new ReliabilityMeter();
  for (let i = 0; i < 90; i++) m.add({ reason: 'ok', handsInFrame: 1, hint: i < 80 ? OK : CLOSE });
  for (let i = 0; i < 6; i++) m.add({ reason: 'implausible', handsInFrame: 1 }); // había mano, descartada
  for (let i = 0; i < 4; i++) m.add({ reason: 'missing', handsInFrame: 0 }); // no había mano
  const s = m.summary();
  assert.equal(s.frames, 100);
  assert.equal(s.detectedPct, 90);
  assert.equal(s.rejectedPct, 6);
  assert.equal(s.framingOkPct, 88.9); // 80 de 90 con mano
  assert.equal(s.framingIssues.close, 11.1);
  assert.equal(s.level, 'medium'); // descartes > 5 %
  assert.deepEqual(s.reasons, ['rejected']);
});

test('fiabilidad: niveles alto, medio y bajo', () => {
  assert.equal(reliabilityLevel({ detectedPct: 99, rejectedPct: 0, framingOkPct: 95 }).level, 'high');
  assert.equal(reliabilityLevel({ detectedPct: 85, rejectedPct: 2, framingOkPct: 90 }).level, 'medium');
  assert.equal(reliabilityLevel({ detectedPct: 70, rejectedPct: 0, framingOkPct: 90 }).level, 'low');
  assert.equal(reliabilityLevel({ detectedPct: 95, rejectedPct: 20, framingOkPct: 90 }).level, 'low');
  assert.equal(reliabilityLevel({ detectedPct: 95, rejectedPct: 0, framingOkPct: 40 }).level, 'low');
  assert.equal(new ReliabilityMeter().summary(), null);
});

test('fiabilidad: un puño visto entero no cuenta como «demasiado lejos»', () => {
  // Puño compacto: caja baja (< 18 % del alto), pero palma de buen tamaño (≈ 25 % del alto).
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + (i % 5) * 0.012, y: 0.5 + Math.floor(i / 5) * 0.02 }));
  lm[0] = { x: 0.5, y: 0.62 }; lm[9] = { x: 0.52, y: 0.5 }; lm[5] = { x: 0.48, y: 0.5 }; lm[17] = { x: 0.58, y: 0.52 };
  const m = new ReliabilityMeter();
  m.add({ reason: 'ok', handsInFrame: 1, hint: { ok: false, code: 'far' }, hand: { landmarks: lm }, width: 640, height: 480 });
  const tiny = lm.map(p => ({ x: 0.5 + (p.x - 0.5) * 0.2, y: 0.5 + (p.y - 0.5) * 0.2 }));
  m.add({ reason: 'ok', handsInFrame: 1, hint: { ok: false, code: 'far' }, hand: { landmarks: tiny }, width: 640, height: 480 });
  const s = m.summary();
  assert.equal(s.framingOkPct, 50); // el puño entero sí; la mano diminuta (lejísimos) no
  assert.equal(s.framingIssues.far, 50);
});
