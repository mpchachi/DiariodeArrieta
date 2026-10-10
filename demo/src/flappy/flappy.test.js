import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAPPY_CONFIG as C } from './config.js';
import { mapLandmarks, measureFist, measureFistCurl, HandSmoother } from './fist.js';
import { FlappyEngine, buildColumns } from './engine.js';
import { FlappySession, processFlappyMetrics } from './session.js';

// Mano abierta sintética (dedos estirados) y versión en puño (yemas junto a los MCP).
const OPEN = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.8,-1.0],[-.4,-.9],[-.4,-1.45],[-.4,-1.8],[-.4,-2.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.25],[.35,-.9],[.4,-1.4],[.4,-1.75],[.4,-2.05],[.65,-.7],[.7,-1.05],[.7,-1.3],[.7,-1.55]];
const hand = closed => OPEN.map(([a, b], i) => {
  const mcp = { 8: 5, 12: 9, 16: 13, 20: 17 }[i];
  const [x, y] = closed && mcp !== undefined ? [OPEN[mcp][0], OPEN[mcp][1] + 0.12] : [a, b];
  return { x: 0.5 + x * 0.1, y: 0.7 + y * 0.12, z: 0 };
});

test('detector original (2D) se conserva para el registro', () => {
  assert.ok(measureFist(mapLandmarks(hand(false))).strength < 0.1);
  assert.ok(measureFist(mapLandmarks(hand(true))).strength > 0.9);
  assert.equal(measureFist(null).valid, false);
});

test('el suavizado mantiene la mano unos fotogramas al perderla y luego la suelta', () => {
  const s = new HandSmoother();
  s.smooth(hand(false));
  for (let i = 0; i < C.fist.maxLostFrames; i++) assert.ok(s.smooth(null));
  assert.equal(s.smooth(null), null);
});

test('recorrido fijo y reproducible', () => {
  assert.deepEqual(buildColumns(), buildColumns());
  assert.equal(buildColumns().length, C.columnCount);
});

// Piloto automático: aprieta el puño si el avión está por debajo del centro del hueco.
function fly(pilot) {
  const e = new FlappyEngine();
  e.start();
  let t = 0;
  while (e.state.status === 'playing' && t < 300) {
    const next = e.state.columns.find(c => !c.passed) ?? { gapY: 0 };
    e.update(pilot(e.state, next), 1 / 60); t += 1 / 60;
  }
  return { e, t };
}

test('sin game over: con la mano quieta se termina igual (chocando) y con buen control sin choques', () => {
  const idle = fly(() => 0);
  assert.equal(idle.e.state.status, 'finished');
  assert.ok(idle.e.state.hits > 0);
  // Piloto proporcional: apunta al centro del hueco amortiguando la velocidad.
  const good = fly((s, next) => Math.max(0, Math.min(1, 0.4 + (next.gapY - s.planeY) * 1.5 - s.planeVelocityY * 0.8)));
  assert.equal(good.e.state.status, 'finished');
  assert.equal(good.e.state.hits, 0);
  assert.equal(good.e.state.score, C.columnCount);
  assert.ok(good.t > 20 && good.t < 50, `duración ${good.t.toFixed(0)} s`);
});

test('métricas originales: activaciones por cruce de umbral y extensión/flexión', () => {
  const frames = [];
  for (let i = 0; i < 120; i++) frames.push({ timestamp: i * 33, phase: 'playing', fistStrength: Math.floor(i / 20) % 2 ? 0.9 : 0.1 });
  const m = processFlappyMetrics(frames);
  assert.equal(m.activationCount, 3);
  assert.equal(m.maxExtension, 0.1);
  assert.equal(m.maxFlexion, 0.9);
  const s = new FlappySession({ startedAt: 0 });
  for (const f of frames) s.log(f.timestamp, 'playing', { fistStrength: f.fistStrength, averageRatio: 0.5, planeY: 0, tracked: true });
  const r = s.finish(4000, true, { columns: buildColumns(), hits: 0 });
  assert.equal(r.metrics.activationCount, 3);
  assert.equal(r.quality.trackedCoverage, 1);
});

// Mano 3D sintética con ángulos de flexión dados (grados) en nudillo, PIP y DIP.
function worldHand([mcp, pip, dip]) {
  const rad = Math.PI / 180, pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const offsets = [[5, -0.02], [9, 0], [13, 0.018], [17, 0.034]];
  for (const [base, dx] of offsets) {
    const d = { x: dx, y: 0.085 }, len = Math.hypot(d.x, d.y), u = { x: d.x / len, y: d.y / len };
    pts[base] = { x: d.x, y: d.y, z: 0 };
    let p = pts[base], acc = 0;
    [[mcp, 0.04], [pip, 0.025], [dip, 0.02]].forEach(([theta, bone], k) => {
      acc += theta * rad;
      const dir = { x: u.x * Math.cos(acc), y: u.y * Math.cos(acc), z: -Math.sin(acc) };
      p = { x: p.x + dir.x * bone, y: p.y + dir.y * bone, z: p.z + dir.z * bone };
      pts[base + k + 1] = p;
    });
  }
  pts[1] = { x: -0.03, y: 0.02, z: 0 }; pts[2] = { x: -0.045, y: 0.04, z: 0 }; pts[3] = { x: -0.055, y: 0.06, z: 0 }; pts[4] = { x: -0.06, y: 0.075, z: 0 };
  return pts;
}

test('puño 3D: solo sube con puño real, no al doblar solo nudillos o solo falanges', () => {
  assert.ok(measureFistCurl(worldHand([5, 5, 5])).strength < 0.05, 'mano abierta');
  assert.ok(measureFistCurl(worldHand([80, 95, 70])).strength > 0.8, 'puño');
  assert.ok(measureFistCurl(worldHand([85, 5, 5])).strength < 0.1, 'bajar los dedos rectos (nudillos)');
  assert.ok(measureFistCurl(worldHand([5, 90, 80])).strength < 0.1, 'encoger solo las falanges (garra)');
  const half = measureFistCurl(worldHand([45, 50, 40])).strength;
  assert.ok(half > 0.1 && half < 0.8, `medio cerrado ${half}`);
});

test('globo: flexión real de los dedos en grados, sin el recorte de la señal de control', async () => {
  const { fingerFlexionSummary } = await import('./session.js');
  // Ciclos abrir (≈ 60°) – cerrar (≈ 230°): la fuerza del juego se satura en 0 y 1, los grados no.
  const frames = Array.from({ length: 300 }, (_, i) => ({ phase: 'playing', flexDeg: 145 + 85 * Math.sin(i / 10) }));
  const f = fingerFlexionSummary(frames);
  assert.ok(f.maxDeg > 220 && f.maxDeg <= 230, `máx ${f.maxDeg}`);
  assert.ok(f.minDeg >= 60 && f.minDeg < 70, `mín ${f.minDeg}`);
  assert.equal(f.arcDeg, Math.round((f.maxDeg - f.minDeg) * 10) / 10);
  // Un fotograma suelto absurdo no cambia el resultado (percentiles 95/5).
  assert.ok(Math.abs(fingerFlexionSummary([...frames, { phase: 'playing', flexDeg: 400 }]).maxDeg - f.maxDeg) < 1);
  assert.equal(fingerFlexionSummary(frames.slice(0, 5)), null);
});
