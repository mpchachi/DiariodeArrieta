import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNNER_CONFIG as C } from './config.js';
import { measurePinch, PinchController, HandSelector } from './pinch.js';
import { buildCourse, takeoffWindow, jumpApex, OBSTACLE } from './world.js';
import { RunnerSession } from './session.js';

// Mano sintética: con estas proporciones la razón pinza/palma es exactamente `ratio`.
const XY = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.4,-1.1],[-.4,-.9],[-.4,-1.45],[-.3,-1.8],[null,-1.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.2],[.35,-.9],[.4,-1.4],[.4,-1.7],[.4,-1.9],[.65,-.7],[.7,-1.1],[.7,-1.4],[.7,-1.6]];
const hand = (ratio, { scale = 1, dx = 0 } = {}) => ({
  handedness: 'Right', score: 0.99,
  landmarks: XY.map(([a, b]) => ({ x: 0.5 + dx + (a ?? -0.4 + ratio) * 0.12 * scale, y: 0.7 + b * 0.16 * scale, z: 0 })),
});
const frame = (t, h) => ({ t, width: 640, height: 480, luminance: 120, hands: h ? [h] : [] });

test('la razón de pinza se normaliza por la palma y no depende de la escala', () => {
  for (const scale of [0.8, 1, 1.4]) {
    const m = measurePinch(hand(0.6, { scale }), frame(0));
    assert.equal(m.valid, true);
    assert.ok(Math.abs(m.ratio - 0.6) < 1e-9, `escala ${scale}: ${m.ratio}`);
  }
});

test('por defecto no bloquea por encuadre, luz ni lateralidad: solo registra la calidad', () => {
  const h = hand(0.6);
  h.landmarks[16].x = 1.05; // yema del anular fuera de cuadro
  const m = measurePinch(h, frame(0));
  assert.equal(m.eligible, true);
  assert.equal(m.quality, 'cropped');
  assert.ok(Math.abs(m.ratio - 0.6) < 1e-9);
  assert.equal(measurePinch(hand(0.6), { ...frame(0), luminance: 3 }).eligible, true);
  const left = { ...hand(0.6), handedness: 'Left' };
  assert.equal(new HandSelector('Right').select(frame(0, left)).hand, left);
});

test('modo estricto (Pastillero v2): mano cortada se rechaza salvo con allowPartialHand si lo cortado no es necesario', () => {
  const strict = { ...C.pinch, strictQuality: true };
  const h = hand(0.6);
  h.landmarks[16].x = 1.05;
  assert.equal(measurePinch(h, frame(0), strict).reason, 'cropped');
  const partial = { ...strict, allowPartialHand: true };
  assert.equal(measurePinch(h, frame(0), partial).eligible, true);
  h.landmarks[4].x = 1.05; // la yema del pulgar sí es necesaria
  assert.equal(measurePinch(h, frame(0), partial).reason, 'partial');
});

function drive(controller, selector, steps) {
  const events = [];
  let t = 0, state = null;
  for (const [ratio, ms, opts = {}] of steps) {
    for (let elapsed = 0; elapsed < ms; elapsed += 33) {
      t += 33;
      const f = frame(t, ratio === null ? null : hand(ratio, opts));
      const sel = selector.select(f);
      const m = sel.hand ? measurePinch(sel.hand, f) : { valid: false, eligible: false, ratio: null, reason: sel.reason };
      state = controller.update(m, t);
      if (state.event) events.push(state.event);
    }
  }
  return { events, state };
}

test('pinza: armado, salto al cerrar y ciclo al abrir con tiempos', () => {
  const { events, state } = drive(new PinchController(), new HandSelector('Right'), [[0.8, 700], [0.1, 300], [0.8, 300]]);
  assert.deepEqual(events.map(e => e.type), ['grab', 'release']);
  assert.ok(events[0].closingMs >= 0 && events[0].closingMs < 100);
  assert.ok(events[1].holdMs >= 250 && events[1].holdMs <= 340, `hold ${events[1].holdMs}`);
  assert.ok(Math.abs(events[1].amplitude - 0.7) < 0.01);
  assert.equal(state.ready, true);
});

test('un fotograma perdido no rompe la pinza; una pérdida larga sí', () => {
  const short = drive(new PinchController(), new HandSelector('Right'), [[0.8, 700], [0.1, 200], [null, 66], [0.1, 200]]);
  assert.equal(short.state.held, true);
  assert.equal(short.events.length, 1);
  const long = drive(new PinchController(), new HandSelector('Right'), [[0.8, 700], [0.1, 200], [null, 500], [0.1, 200]]);
  assert.equal(long.state.held, false);
  assert.equal(long.state.ready, false);
});

test('pinza parcial (sin llegar al umbral de cierre) no salta', () => {
  const { events } = drive(new PinchController(), new HandSelector('Right'), [[0.8, 700], [0.32, 400], [0.8, 300]]);
  assert.equal(events.length, 0);
});

test('recorrido fijo y reproducible con un solo tipo de obstáculo', () => {
  const a = buildCourse(), b = buildCourse();
  assert.deepEqual(a, b);
  assert.equal(a.obstacles.length, C.obstacleCount);
  assert.ok(a.obstacles.every(o => o.name === OBSTACLE.name && o.h === OBSTACLE.h));
  const seconds = a.finishX / C.speed;
  assert.ok(seconds > 25 && seconds < 45, `duración ${seconds.toFixed(0)} s`);
});

test('juego fácil: ventana de salto amplia y el salto cabe en pantalla', () => {
  const win = takeoffWindow({ x: 0, ...OBSTACLE });
  assert.ok(win.widthMs >= 600, `ventana ${win.widthMs} ms`);
  assert.ok(jumpApex() > OBSTACLE.h * 3);
  assert.ok(jumpApex() < C.groundY - 40);
});

test('la sesión resume obstáculos, saltos libres y error temporal', () => {
  const course = buildCourse();
  const s = new RunnerSession({ hand: 'Right', course });
  const [a, b] = course.obstacles;
  s.jump({ obstacleId: a.id, gameMs: 1000, offsetPx: -30, idealPx: -27 });
  s.resolveObstacle(a.id, true);
  s.resolveObstacle(b.id, false);
  s.jump({ obstacleId: null, gameMs: 5000 });
  const sum = s.summary();
  assert.equal(sum.obstacles.cleared, 1);
  assert.equal(sum.obstacles.jumped, 1);
  assert.equal(sum.freeJumps, 1);
  assert.equal(s.obstacles[a.id].timingErrorMs, Math.round(3 / C.speed * 1000 * 10) / 10);
});

test('pinza: separar solo 2-3 cm ya cuenta como soltar (no hace falta abrir del todo)', () => {
  const c = new PinchController();
  let t = 0, grabs = 0, releases = 0;
  const feed = (ratio, ms) => { for (let e = 0; e < ms; e += 33) { t += 33; const s = c.update({ valid: true, eligible: true, ratio, reason: 'ok' }, t); if (s.event?.type === 'grab') grabs++; if (s.event?.type === 'release') releases++; } };
  feed(0.8, 800); // mano abierta: preparación
  feed(0.1, 300); // pinza
  assert.equal(grabs, 1);
  feed(0.3, 300); // separa ~2,5-3 cm
  assert.equal(releases, 1, 'con 0,3 palmas ya debe soltar');
  assert.equal(c.state, 'open');
  feed(0.12, 300); // vuelve a pinzar sin haber abierto del todo
  assert.equal(grabs, 2);
});

test('pinza: aperturas incompletas entre pinzas quedan registradas', () => {
  const c = new PinchController();
  let t = 0; const events = [];
  const feed = (ratio, ms) => { for (let e = 0; e < ms; e += 33) { t += 33; const s = c.update({ valid: true, eligible: true, ratio, reason: 'ok' }, t); if (s.event) events.push(s.event); } };
  feed(0.8, 800); feed(0.1, 300); feed(0.32, 300); feed(0.1, 300); feed(0.7, 300); feed(0.1, 300);
  const grabs = events.filter(e => e.type === 'grab');
  assert.equal(grabs.length, 3);
  assert.deepEqual(grabs.map(g => g.fullOpen), [true, false, true]);
});
