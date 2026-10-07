// Pruebas puras del modelo de mano de la guía de gestos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANATOMY, POSES, GESTURES, handPoints, gestureFrame, distance, blendPose, orient } from './handModel.js';

test('la pinza junta las yemas del pulgar y del índice', () => {
  const p = handPoints(POSES.pinch);
  const touch = ANATOMY.thumb.radius + ANATOMY.fingers[0].radius;
  assert.ok(Math.abs(distance(p[4], p[8]) - touch) < 4, `distancia ${distance(p[4], p[8]).toFixed(1)} frente a ${touch}`);
  // Con la mano abierta las yemas están lejos.
  const o = handPoints(POSES.open);
  assert.ok(distance(o[4], o[8]) > 100);
});

test('el puño curva los cuatro dedos hacia la palma', () => {
  const f = handPoints(POSES.fist);
  for (const tip of [8, 12, 16, 20]) {
    assert.ok(f[tip][2] > 8, `yema ${tip} delante de la palma`);
    assert.ok(f[tip][1] < 70, `yema ${tip} baja hacia la palma`);
  }
  // En el agarre el pulgar queda arriba y estirado.
  const g = handPoints(POSES.grip);
  assert.ok(g[4][1] > g[3][1] && g[4][1] > 95);
});

test('cada gesto hace un bucle continuo y vuelve a su pose inicial', () => {
  for (const [name, g] of Object.entries(GESTURES)) {
    const a = gestureFrame(name, 0), b = gestureFrame(name, g.periodMs), mid = gestureFrame(name, g.periodMs / 2);
    for (let i = 0; i < 21; i++) assert.ok(distance(a.points[i], b.points[i]) < 1e-6, `${name}: fin = inicio`);
    const moved = a.points.some((p, i) => distance(p, mid.points[i]) > 5);
    assert.ok(moved, `${name}: a mitad del bucle la mano ha cambiado`);
    assert.equal(a.points.length, 23);
  }
});

test('verter gira el pulgar hacia el lado de la mano: izquierda con la derecha, derecha con la izquierda', () => {
  const right = gestureFrame('tilt', GESTURES.tilt.periodMs * 0.6), left = gestureFrame('tilt', GESTURES.tilt.periodMs * 0.6, { mirror: true });
  const neutral = gestureFrame('tilt', 0);
  assert.ok(neutral.points[4][1] > neutral.points[0][1], 'pulgar arriba en reposo');
  assert.ok(right.points[4][0] < neutral.points[4][0] - 20, 'mano derecha: el pulgar cae a la izquierda');
  assert.ok(left.points[4][0] > -neutral.points[4][0] + 20, 'mano izquierda: el pulgar cae a la derecha');
});

test('blendPose interpola y orient conserva distancias', () => {
  const half = blendPose(POSES.open, POSES.fist, 0.5);
  assert.equal(half.fingers[0][0], (POSES.open.fingers[0][0] + POSES.fist.fingers[0][0]) / 2);
  const p = handPoints(POSES.open), r = orient(p, { yaw: 30, pitch: -20, roll: 45 });
  assert.ok(Math.abs(distance(p[0], p[12]) - distance(r[0], r[12])) < 1e-9);
});
