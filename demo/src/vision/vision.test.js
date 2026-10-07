import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlausibleHand, HandTracker, VISION } from './hands.js';

const W = 640, H = 480;
// Mano abierta sintética anatómicamente razonable, centrada en (cx, cy), palma ~`s` (fracción del alto).
function hand(cx = 0.5, cy = 0.55, s = 0.18, { label = 'Right', score = 0.95 } = {}) {
  const u = s * H; // px por «palma»
  const P = [[0, 0], [-.35, -.2], [-.6, -.45], [-.75, -.7], [-.85, -.95], [-.3, -.95], [-.33, -1.35], [-.35, -1.6], [-.36, -1.8],
    [0, -1], [0, -1.45], [0, -1.72], [0, -1.95], [.27, -.95], [.29, -1.35], [.3, -1.6], [.31, -1.8], [.5, -.85], [.55, -1.15], [.58, -1.35], [.6, -1.52]];
  return { handedness: label, score, landmarks: P.map(([a, b]) => ({ x: cx + a * u / W, y: cy + (b + 0.5) * u / H, z: 0 })) };
}
const frame = (t, hands) => ({ t, width: W, height: H, hands });

test('plausibilidad: mano normal sí; basura no', () => {
  assert.equal(isPlausibleHand(hand(), W, H).ok, true);
  assert.equal(isPlausibleHand({ landmarks: [] }, W, H).reason, 'malformed');
  const nan = hand(); nan.landmarks[3].x = NaN;
  assert.equal(isPlausibleHand(nan, W, H).reason, 'malformed');
  assert.equal(isPlausibleHand(hand(0.5, 0.5, 0.01), W, H).reason, 'tiny');
  assert.equal(isPlausibleHand(hand(0.5, 0.5, 0.18, { score: 0.1 }), W, H).reason, 'low-score');
  const longFinger = hand(); longFinger.landmarks[8] = { x: 0.1, y: 0.02, z: 0 };
  assert.equal(isPlausibleHand(longFinger, W, H).reason, 'anatomy');
  const far = hand(); far.landmarks[4] = { x: 2.5, y: 0.5, z: 0 };
  assert.equal(isPlausibleHand(far, W, H).reason, 'out-of-frame');
});

test('plausibilidad: mano de canto (palma estrecha en la imagen) se acepta', () => {
  const side = hand(); for (const i of [5, 13, 17]) side.landmarks[i] = { ...side.landmarks[i], x: side.landmarks[9].x + (i - 9) * 0.002 };
  assert.equal(isPlausibleHand(side, W, H).ok, true);
});

test('seguimiento: aparece una segunda mano y NO se cambia de mano', () => {
  const tr = new HandTracker();
  let r;
  for (let t = 0; t < 500; t += 33) r = tr.select(frame(t, [hand(0.35, 0.55)]));
  const id = r.id;
  for (let t = 500; t < 1500; t += 33) {
    // La otra mano (más grande y con más confianza) entra en escena, en distinto orden cada vez.
    const other = hand(0.75, 0.5, 0.24, { label: 'Left', score: 0.99 });
    r = tr.select(frame(t, t % 66 ? [other, hand(0.36, 0.55)] : [hand(0.36, 0.55), other]));
    assert.equal(r.reason, 'ok'); assert.equal(r.id, id); assert.equal(r.switched, false);
    assert.ok(Math.abs(r.hand.landmarks[0].x - 0.36) < 0.01, 'sigue la mano original');
  }
});

test('seguimiento: un salto de un solo fotograma se descarta; uno sostenido se acepta como cambio', () => {
  const tr = new HandTracker();
  for (let t = 0; t < 300; t += 33) tr.select(frame(t, [hand(0.3, 0.55)]));
  assert.equal(tr.select(frame(333, [hand(0.8, 0.5)])).reason, 'glitch');
  assert.equal(tr.select(frame(366, [hand(0.3, 0.55)])).reason, 'ok');
  // Ahora la mano «salta» y se queda allí: tras unos fotogramas se acepta (cambio real).
  let r, t = 400;
  for (let i = 0; i < VISION.glitchConfirmFrames; i++, t += 33) r = tr.select(frame(t, [hand(0.8, 0.5)]));
  assert.equal(r.reason, 'ok'); assert.equal(r.switched, true);
});

test('seguimiento: tras perder la mano un rato, se acepta la que vuelva (aunque esté en otro sitio)', () => {
  const tr = new HandTracker();
  for (let t = 0; t < 300; t += 33) tr.select(frame(t, [hand(0.3, 0.55)]));
  for (let t = 300; t < 1100; t += 33) assert.equal(tr.select(frame(t, [])).reason, 'missing');
  const r = tr.select(frame(1133, [hand(0.7, 0.5)]));
  assert.equal(r.reason, 'ok'); assert.equal(r.switched, true);
});

test('seguimiento: movimiento rápido real de la misma mano se sigue sin cortes', () => {
  const tr = new HandTracker();
  for (let i = 0, t = 0; i < 40; i++, t += 33) {
    const r = tr.select(frame(t, [hand(0.25 + i * 0.012, 0.55 + Math.sin(i / 4) * 0.05)]));
    assert.equal(r.reason, 'ok', `fotograma ${i}`);
  }
});

test('seguimiento: con varias manos nuevas prefiere la lateralidad elegida', () => {
  const tr = new HandTracker({ preferred: 'Left' });
  const r = tr.select(frame(0, [hand(0.3, 0.5, 0.25, { label: 'Right' }), hand(0.7, 0.5, 0.15, { label: 'Left' })]));
  assert.equal(r.hand.handedness, 'Left');
});

// --- Casos reales: landmarks de manos de verdad detectadas por el modelo (fotos) ---
import { readFileSync } from 'node:fs';
const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-hands.json', import.meta.url)));
// Escorzo: acorta la mano a lo largo del eje muñeca→nudillo medio (antebrazo hacia la cámara) y la gira en el plano.
function pose(hand, Wd, Hd, squash, rotDeg) {
  const lm = hand.landmarks, w = lm[0], m = lm[9];
  const ax = (m.x - w.x) * Wd, ay = (m.y - w.y) * Hd, L = Math.hypot(ax, ay), ux = ax / L, uy = ay / L;
  const c = { x: lm.reduce((s, p) => s + p.x, 0) / 21 * Wd, y: lm.reduce((s, p) => s + p.y, 0) / 21 * Hd };
  const a = rotDeg * Math.PI / 180;
  return { ...hand, landmarks: lm.map(p => {
    let x = p.x * Wd - c.x, y = p.y * Hd - c.y;
    const along = (x * ux + y * uy) * squash, perp = -x * uy + y * ux;
    x = along * ux - perp * uy; y = along * uy + perp * ux;
    return { x: (c.x + x * Math.cos(a) - y * Math.sin(a)) / Wd, y: (c.y + x * Math.sin(a) + y * Math.cos(a)) / Hd, z: p.z };
  }) };
}

test('manos reales: todas las detecciones de las fotos son plausibles', () => {
  for (const [name, f] of Object.entries(REAL)) for (const h of f.hands) assert.equal(isPlausibleHand(h, f.width, f.height).reason, 'ok', name);
});

test('jarra (puño en escorzo): se acepta aunque la palma se vea muy acortada', () => {
  const { width: Wd, height: Hd, hands: [fist] } = REAL.thumb;
  for (const k of [1, 0.6, 0.4, 0.25, 0.15]) for (const rot of [0, 45, 90, -60]) {
    assert.equal(isPlausibleHand(pose(fist, Wd, Hd, k, rot), Wd, Hd).reason, 'ok', `palma al ${k * 100}%, giro ${rot}°`);
  }
});

test('jarra: el gesto de verter se sigue sin perder fotogramas ni «cambiar de mano»', () => {
  const { width: Wd, height: Hd, hands: [fist] } = REAL.thumb;
  const tr = new HandTracker(); let ok = 0, total = 0, sw = 0;
  for (let rep = 0, t = 0; rep < 3; rep++) for (let i = 0; i <= 72; i++, t += 33) {
    const u = i <= 36 ? i / 36 : (72 - i) / 36, k = 0.2 + 0.4 * Math.sin(u * Math.PI);
    const r = tr.select({ t, width: Wd, height: Hd, hands: [pose(fist, Wd, Hd, k, u * 90)] });
    total++; if (r.reason === 'ok') ok++; if (r.switched) sw++;
  }
  assert.equal(ok, total, `aceptados ${ok}/${total}`);
  assert.equal(sw, 0);
});
