import test from 'node:test';
import assert from 'node:assert/strict';
import { FISHING_CONFIG as C } from './config.js';
import { wristPitch, wristTilt, AngleFilter } from './wrist.js';
import { FishingEngine } from './engine.js';
import { summarize, tremorDeg } from './session.js';

// Mano 3D sintética inclinada `deg` grados (+ = dedos hacia arriba).
function handAt(deg) {
  const a = deg * Math.PI / 180, pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  [5, 9, 13, 17].forEach((i, k) => { pts[i] = { x: (k - 1.5) * 0.02, y: -Math.sin(a) * 0.09, z: -Math.cos(a) * 0.09 }; });
  return pts;
}

test('inclinación de la mano: horizontal 0°, arriba +, abajo −', () => {
  assert.ok(Math.abs(wristPitch(handAt(0))) < 0.5);
  assert.ok(Math.abs(wristPitch(handAt(40)) - 40) < 0.5);
  assert.ok(Math.abs(wristPitch(handAt(-30)) + 30) < 0.5);
  assert.equal(wristPitch(null), null);
});

// Mano de canto en la imagen, inclinada `deg` desde la vertical (+ = hacia la derecha).
function hand2D(deg, w = 640, h = 480) {
  const a = deg * Math.PI / 180, pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  [5, 9, 13, 17].forEach((i, k) => {
    const len = 90 + k * 2, off = (k - 1.5) * 4;
    pts[i] = { x: 0.5 + (Math.sin(a) * len + Math.cos(a) * off) / w, y: 0.7 - (Math.cos(a) * len - Math.sin(a) * off) / h, z: 0 };
  });
  return pts;
}

test('mano de canto: vertical ≈ 0°, hacia fuera +, hacia dentro − (en grados reales pese al aspecto)', () => {
  assert.ok(Math.abs(wristTilt(hand2D(0), 640, 480)) < 1);
  assert.ok(Math.abs(wristTilt(hand2D(35), 640, 480) - 35) < 1);
  assert.ok(Math.abs(wristTilt(hand2D(-25), 640, 480) + 25) < 1);
  assert.ok(Math.abs(wristTilt(hand2D(35), 640, 480, -1) + 35) < 1, 'signo configurable (mano izquierda)');
});

test('el filtro suaviza y calcula velocidad', () => {
  const f = new AngleFilter();
  f.update(0, 0);
  for (let t = 33; t < 1000; t += 33) f.update(30, t);
  assert.ok(Math.abs(f.value - 30) < 1);
  assert.ok(Math.abs(f.velocity) < 5);
});

// Simula una partida: `script(phase, engine)` devuelve el ángulo deseado.
function play(script, { maxMs = 240000, noise = 0, base = 4 } = {}) {
  const e = new FishingEngine(), events = [];
  let angle = base;
  for (let t = 0; t < maxMs && e.phase !== 'done'; t += 33) {
    const target = base + script(e);
    angle += (target - angle) * 0.25;
    const velocity = (target - angle) * 0.25 * 30;
    const n = noise ? Math.sin(t * 0.07) * noise : 0;
    for (const ev of e.update({ t, angle: angle + n, velocity, wrist: { x: 0.5, y: 0.6 } })) events.push(ev);
  }
  return { e, events };
}

// Paciente modelo: rango ±40°, sigue las instrucciones.
const patient = e => {
  const th = e.thresholds();
  switch (e.phase) {
    case 'calib-rest': return 0;
    case 'calib-up': return 40;
    case 'calib-down': return -40;
    case 'cast': case 'casting': return -30;
    case 'bite': return 35;
    case 'reel': return (th.band[0] + th.band[1]) / 2;
    default: return 0;
  }
};

test('partida completa: calibra, pesca los 6 peces y mide', () => {
  const { e, events } = play(patient);
  assert.equal(e.phase, 'done');
  assert.equal(events.filter(x => x.type === 'caught').length, 6);
  assert.ok(Math.abs(e.calib.extRange - 40) < 3 && Math.abs(e.calib.flexRange - 40) < 3);
  const s = summarize(e);
  assert.equal(s.summary.fishCaught, 6);
  assert.ok(s.summary.maxExtensionDeg >= 38);
  assert.equal(s.summary.reachesFmaStability15, true);
  assert.ok(s.summary.medianReactionMs > 0 && s.summary.medianReactionMs < 600);
  assert.ok(s.rounds.every(r => r.inBandRatio > 0.8));
});

test('si la dirección «hacia fuera» sale al revés, la calibración invierte el signo y se juega igual', () => {
  const mirrored = e => -patient(e);
  const { e, events } = play(eng => (eng.calib.sign === -1 || eng.phase.startsWith('calib') ? mirrored(eng) : patient(eng)));
  assert.equal(e.calib.sign, -1);
  assert.equal(e.phase, 'done');
  assert.equal(events.filter(x => x.type === 'caught').length, 6);
});

test('los peces grandes piden subir más (zona escalada al rango de cada paciente)', () => {
  const e = new FishingEngine();
  e.calib.neutral = 0; e.calib.extRange = 40; e.calib.flexRange = 30;
  e.roundIndex = C.sequence.indexOf('small'); const small = e.thresholds().band;
  e.roundIndex = C.sequence.indexOf('big'); const big = e.thresholds().band;
  assert.ok(big[0] > small[1] - 5 && big[1] <= 40);
  e.calib.extRange = 8; // paciente con poco rango: los objetivos siguen siendo alcanzables
  assert.ok(e.thresholds().band[1] <= 12 && e.thresholds().hook <= 8);
});

test('no se puede perder: si no engancha, el pez vuelve a picar', () => {
  // No reacciona a la primera picada del primer pez.
  const { e, events } = play(eng => (eng.phase === 'bite' && eng.roundIndex === 0 && eng.rounds[0].missedBites === 0 ? 0 : patient(eng)));
  assert.equal(e.phase, 'done');
  assert.equal(events.filter(x => x.type === 'missed').length, 1);
  assert.equal(e.rounds[0].missedBites, 1);
  assert.equal(events.filter(x => x.type === 'caught').length, 6);
});

test('mano quieta en la calibración: sin rango se marca como bajo y se puede jugar igual', () => {
  const e = new FishingEngine();
  for (let t = 0; t < 20000 && e.calibrating; t += 33) e.update({ t, angle: 3, velocity: 0 });
  assert.equal(e.calib.lowRange, true);
  assert.equal(e.calib.extRange, C.minRangeDeg);
});

test('temblor: oscilación rápida se detecta, sujeción estable no', () => {
  const steady = Array.from({ length: 60 }, (_, i) => ({ t: i * 33, rel: 20 }));
  const shaky = Array.from({ length: 60 }, (_, i) => ({ t: i * 33, rel: 20 + 3 * Math.sin(i * 1.9) }));
  assert.ok(tremorDeg(steady) < 0.01);
  assert.ok(tremorDeg(shaky) > 1);
});
