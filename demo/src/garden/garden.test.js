import test from 'node:test';
import assert from 'node:assert/strict';
import { GARDEN_CONFIG as C } from './config.js';
import { knuckleTilt, TiltFilter } from './tilt.js';
import { GardenEngine } from './engine.js';
import { summarize } from './session.js';

// Puño sintético: nudillos (5 arriba, 13/17 abajo) girados `deg` grados en la imagen.
function fist(deg, w = 640, h = 480) {
  const a = deg * Math.PI / 180, pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const put = (i, ox, oy) => { pts[i] = { x: 0.5 + (ox * Math.cos(a) - oy * Math.sin(a)) / w, y: 0.5 + (ox * Math.sin(a) + oy * Math.cos(a)) / h, z: 0 }; };
  put(5, 0, -40); put(9, 0, -14); put(13, 0, 12); put(17, 0, 36); put(0, 60, 0);
  return pts;
}

test('inclinación del puño: recto 0°, girado ±, en grados reales', () => {
  assert.ok(Math.abs(knuckleTilt(fist(0), 640, 480).angle) < 1);
  assert.ok(Math.abs(Math.abs(knuckleTilt(fist(40), 640, 480).angle) - 40) < 1);
  assert.ok(Math.abs(Math.abs(knuckleTilt(fist(-70), 640, 480).angle) - 70) < 1);
  assert.equal(Math.sign(knuckleTilt(fist(40), 640, 480).angle), -Math.sign(knuckleTilt(fist(-40), 640, 480).angle));
  assert.equal(knuckleTilt(null, 640, 480), null);
});

test('filtro: mantiene el último valor si la mano se pone de perfil un instante', () => {
  const f = new TiltFilter();
  for (let t = 0; t < 1000; t += 33) f.update({ angle: 30, quality: 1 }, t);
  const before = f.value;
  f.update({ angle: -80, quality: 0.1 }, 1033);
  assert.equal(f.value, before);
});

// Juega con un «paciente» que inclina hasta `peak` grados.
function play({ peak = 60, ignoreUntil = 0, base = 5, sign = -1, pourSign = -1, maxMs = 120000 } = {}) {
  const e = new GardenEngine(undefined, { pourSign }), events = [];
  let angle = base;
  for (let t = 0; t < maxMs && e.phase !== 'done'; t += 33) {
    const target = base + sign * (e.phase === 'water' && t >= ignoreUntil ? peak : 0);
    const prev = angle;
    angle += (target - angle) * 0.2;
    for (const ev of e.update({ t, angle, velocity: (angle - prev) / 0.033, wrist: { x: 0.5, y: 0.5 } })) events.push(ev);
  }
  return { e, events };
}

test('partida completa: 5 flores, rápida y sin fallo', () => {
  const { e, events } = play();
  assert.equal(e.phase, 'done');
  assert.equal(events.filter(x => x.type === 'bloom').length, C.flowers.length);
  const s = summarize(e);
  assert.equal(s.summary.flowersBloomed, 5);
  assert.ok(s.summary.maxTiltDeg > 55);
  assert.ok(s.summary.medianTimeToBloomMs < 5000, String(s.summary.medianTimeToBloomMs));
  assert.ok(s.flowers.every(f => f.signal.length > 10 && f.returnMs !== null));
  assert.equal(s.summary.adapted, false);
});

test('mano derecha: verter es girar hacia la izquierda; al lado contrario no riega', () => {
  const wrong = play({ sign: 1, maxMs: 20000 });
  assert.equal(wrong.e.phase, 'water');
  assert.equal(wrong.e.flowers[0].growth, 0);
  assert.ok(wrong.e.flowers[0].peakOppositeDeg > 50);
});

test('mano izquierda: el lado de verter es el otro', () => {
  const { e } = play({ sign: 1, pourSign: 1 });
  assert.equal(e.phase, 'done');
  assert.equal(e.pourSign, 1);
});

test('poco giro: el umbral se adapta solo y se puede terminar', () => {
  const { e } = play({ peak: 18 });
  assert.equal(e.phase, 'done');
  const s = summarize(e);
  assert.equal(s.summary.adapted, true);
  assert.ok(s.summary.finalPourStartDeg < 18 && s.summary.finalPourStartDeg >= C.pourMinStartDeg); // justo lo necesario
});

test('sin girar nada no florece (hay que hacer el movimiento)', () => {
  const { e } = play({ peak: 0, maxMs: 30000 });
  assert.equal(e.phase, 'water');
  assert.equal(e.flowers[0].growth, 0);
});

import { framingHint, handBox } from '../pack/framing.js';
const boxAt = (cx, cy, h) => handBox([{ x: cx - h * 0.35, y: cy - h / 2 }, { x: cx + h * 0.35, y: cy + h / 2 }]);

test('encuadre: indicaciones según dónde está la mano', () => {
  assert.equal(framingHint({ box: boxAt(0.5, 0.5, 0.4), detected: true }).code, 'ok');
  assert.equal(framingHint({ box: boxAt(0.5, 0.5, 0.8), detected: true }).code, 'close');
  assert.equal(framingHint({ box: boxAt(0.5, 0.8, 0.4), detected: true }).code, 'low');
  assert.equal(framingHint({ box: boxAt(0.5, 0.5, 0.12), detected: true }).code, 'far');
  assert.equal(framingHint({ box: boxAt(0.92, 0.5, 0.3), detected: true }).code, 'side');
  // Se perdió la mano y lo último que se vio era una mano enorme: estaba demasiado cerca.
  assert.equal(framingHint({ box: boxAt(0.5, 0.6, 0.7), detected: false }).code, 'close');
  assert.equal(framingHint({ detected: false, luminance: 20 }).code, 'dark');
  assert.equal(framingHint({ detected: false }).code, 'missing');
});
