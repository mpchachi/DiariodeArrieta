import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PINCH_CONFIG as C } from './pinchConfig.js';
import { measurePinch, PinchController, HandSelector, PinchSession, selectPillTarget } from './pinchLogic.js';
import { createGameState, tryPlace } from '../../game/state.js';

function hand(ratio = 0.8, { scale = 1, x = 0, y = 0, label = 'Right' } = {}) {
  const xy = [[0, 0], [-.3, -.15], [-.6, -.35], [-.7, -.7], [-.4, -1.1],
    [-.4, -.9], [-.4, -1.45], [-.3, -1.8], [-.4 + ratio, -1.1],
    [0, -1], [0, -1.5], [0, -1.9], [0, -2.2],
    [.35, -.9], [.4, -1.4], [.4, -1.7], [.4, -1.9],
    [.65, -.7], [.7, -1.1], [.7, -1.4], [.7, -1.6]];
  return { handedness: label, score: .99, landmarks: xy.map(([a, b]) => ({
    x: .5 + x + a * .12 * scale, y: .7 + y + b * .16 * scale, z: 0,
  })) };
}
const frame = (t, h = hand()) => ({ t, width: 640, height: 480, luminance: 120, hands: h ? [h] : [] });
const observation = (ratio, eligible = true) => ({ valid: true, eligible, ratio, depthRatio: 0, reason: 'ok' });

function run(values, fps = 30) {
  const controller = new PinchController();
  const events = [];
  let t = 0;
  for (const [duration, value] of values) {
    const end = t + duration;
    for (; t < end - 1e-5; t += 1000 / fps) {
      const state = controller.update(value === null ? { valid: false, reason: 'missing' } : observation(value), t);
      if (state.event) events.push({ ...state.event, t });
    }
  }
  return { controller, events };
}

describe('Geometría de pinza aislada', () => {
  it('normaliza distancia y corrige la relación de aspecto', () => {
    for (const scale of [.6, 1, 1.4]) {
      const f = frame(0, hand(.15, { scale }));
      const m = measurePinch(f.hands[0], f);
      assert.equal(m.valid, true, m.reason);
      assert.ok(Math.abs(m.ratio - .15) < 1e-8);
      assert.equal(m.eligible, true);
    }
  });
  it('trasladar la mano no transforma una mano abierta en pinza', () => {
    for (const [x, y] of [[-.12, .02], [.12, -.1], [0, 0]]) {
      const f = frame(0, hand(.8, { x, y }));
      assert.ok(measurePinch(f.hands[0], f).ratio > C.openRatio);
    }
  });
  it('rechaza mano cortada, demasiado cercana, pequeña y fotogramas no finitos', () => {
    const cropped = hand(); cropped.landmarks[4].x = -.02;
    for (const h of [cropped, hand(.8, { scale: 2.5 }), hand(.8, { scale: .2 })]) {
      assert.equal(measurePinch(h, frame(0, h)).valid, false);
    }
    const nan = hand(); nan.landmarks[8].x = NaN;
    assert.equal(measurePinch(nan, frame(0, nan)).valid, false);
  });
  it('la pinza pulgar–medio no sustituye al índice', () => {
    const h = hand(.8); h.landmarks[12] = { ...h.landmarks[4] };
    const m = measurePinch(h, frame(0, h));
    assert.equal(m.valid, true);
    assert.ok(m.ratio > C.openRatio);
  });
  it('no acepta un puño como cierre elegible ni una superposición con profundidad ambigua', () => {
    const fist = hand(.1);
    fist.landmarks[4] = { ...fist.landmarks[5] };
    fist.landmarks[8] = { ...fist.landmarks[5], x: fist.landmarks[5].x + .004 };
    assert.equal(measurePinch(fist, frame(0, fist)).eligible, false);
    const overlap = hand(.1); overlap.landmarks[8].z = .2;
    assert.equal(measurePinch(overlap, frame(0, overlap)).eligible, false);
  });
});

describe('Identidad y continuidad', () => {
  it('mantiene la mano seleccionada al cambiar el orden del modelo', () => {
    const selector = new HandSelector('Right');
    const right = hand(), left = hand(.8, { label: 'Left', x: -.1 });
    assert.equal(selector.select({ ...frame(0), hands: [left, right] }).hand, right);
    assert.equal(selector.select({ ...frame(33), hands: [right, left] }).hand, right);
    assert.equal(selector.select(frame(66, left)).hand, null);
  });
  it('no cambia de mano ante un salto brusco', () => {
    const selector = new HandSelector('Right');
    selector.select(frame(0, hand(.8, { x: -.2 })));
    assert.equal(selector.select(frame(33, hand(.8, { x: .2 }))).hand, null);
  });
});

describe('Máquina de estados temporal', () => {
  it('produce exactamente un agarre y una liberación a 15, 30 y 60 fps', () => {
    for (const fps of [15, 30, 60]) {
      const { events } = run([[1400, .8], [500, .1], [500, .8]], fps);
      assert.deepEqual(events.map(e => e.type), ['grab', 'release']);
    }
  });
  it('exige apertura antes del primer agarre y no cuenta un cierre mantenido dos veces', () => {
    assert.equal(run([[2000, .1]]).events.length, 0);
    assert.deepEqual(run([[1400, .8], [1500, .1]]).events.map(e => e.type), ['grab']);
  });
  it('el ruido cerca del umbral no produce repeticiones', () => {
    const { events } = run([[1400, .8], ...Array.from({ length: 30 }, (_, i) => [34, i % 2 ? .28 : .2])]);
    assert.equal(events.length, 0);
  });
  it('una pérdida no suelta ni deposita; requiere rearmar con apertura', () => {
    const { events } = run([[1400, .8], [500, .1], [100, null], [1000, .8], [500, .1], [500, .8]]);
    assert.deepEqual(events.map(e => e.type), ['grab', 'grab', 'release']);
  });
  it('rechaza tiempos repetidos y reinicia tras huecos largos sin callbacks', () => {
    const c = new PinchController();
    c.update(observation(.8), 0);
    c.update(observation(.8), 1200);
    assert.equal(c.update(observation(.1), 1200).event, null);
    assert.equal(c.update(observation(.1), 3000).event, null);
    assert.equal(c.state, 'acquiring');
  });
  it('un gesto no elegible no da agarres aunque las yemas parezcan juntas', () => {
    const c = run([[1400, .8]]).controller;
    for (let t = 1500; t < 2400; t += 33) assert.equal(c.update(observation(.05, false), t).event, null);
  });
});

describe('Pastillero original con colocación asistida', () => {
  it('selecciona y coloca las 17 pastillas en sus días correctos sin alterar la prescripción', () => {
    const game = createGameState(), ids = new Set();
    assert.equal(game.totalPills, C.targetRepetitions);
    while (!game.complete) {
      const next = selectPillTarget(game);
      assert.ok(next);
      assert.equal(ids.has(next.pillId), false);
      ids.add(next.pillId);
      assert.equal(tryPlace(game, next.pillId, next.compartmentIndex).accepted, true);
    }
    assert.equal(game.placed, 17);
    assert.equal(game.errors, 0);
    assert.equal(selectPillTarget(game), null);
    for (const compartment of game.compartments) {
      assert.equal(compartment.complete, true);
      assert.deepEqual(compartment.filled, compartment.needs);
    }
  });
  it('observar un objetivo o cancelar la pinza no mueve pastillas por sí mismo', () => {
    const game = createGameState();
    const before = structuredClone(game);
    assert.deepEqual(selectPillTarget(game), selectPillTarget(game));
    assert.deepEqual(game, before);
  });
});

describe('Registro experimental independiente', () => {
  it('no cuenta agarres incompletos como repeticiones y no publica puntuación clínica', () => {
    const s = new PinchSession('Right', 'test-subject', 0);
    s.add(frame(0), observation(.8), { event: null });
    s.add(frame(500), observation(.1), { event: { type: 'grab' } });
    s.add(frame(600, null), { valid: false, reason: 'missing' }, { event: null });
    const result = s.finish(1000, false);
    assert.equal(result.protocol, C.protocol);
    assert.equal(result.completedRepetitions, 0);
    assert.equal(result.clinicalScore, null);
    assert.ok(result.quality.validCoverage < 1);
    assert.equal(result.subjectId, 'test-subject');
  });
});
