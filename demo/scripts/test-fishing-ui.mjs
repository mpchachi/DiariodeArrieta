// Prueba de interfaz de la pesca con una mano 3D sintética (sin cámara real).
// Un «paciente» sigue las instrucciones: calibra, lanza, espera, engancha y recoge.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const shots = process.env.RUNNER_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install();
  await page.route('**/src/fishing/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startFishingGame } from '/src/fishing/game.js';
    window.sim = { angle: 4, missing: false, auto: true, ignoreFirstBite: true };
    window.doneResult = null;
    const target = st => {
      const th = st.thresholds, base = 4;
      switch (st.enginePhase) {
        case 'calib-rest': return base;
        case 'calib-up': return base + 40;
        case 'calib-down': return base - 40;
        case 'cast': case 'casting': return base - 32;
        case 'bite': if (window.sim.ignoreFirstBite) return base; return base + 36;
        case 'reel': return base + (th.band[0] + th.band[1]) / 2;
        default: return base;
      }
    };
    startFishingGame(document.querySelector('#app'), { subjectId: 'synthetic-fishing-test', onDone: r => { window.doneResult = r; }, cameraFactory: ({ onFrame }) => {
      let id;
      return { delegate: 'mock', async start() {
        id = setInterval(() => {
          const S = window.sim, st = document.querySelector('.fishing-app').fishingState();
          if (S.auto && st.phase === 'playing') S.angle += (target(st) - S.angle) * 0.25;
          if (st.enginePhase === 'wait' && st.roundIndex === 0 && S.sawBite) S.ignoreFirstBite = false;
          if (st.enginePhase === 'bite') S.sawBite = true;
          // Mano de canto: muñeca abajo y nudillos arriba, inclinada S.angle grados.
          const a = S.angle * Math.PI / 180, landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
          [5, 9, 13, 17].forEach((i, k) => { const off = (k - 1.5) * 4; landmarks[i] = { x: 0.5 + (Math.sin(a) * 90 + Math.cos(a) * off) / 640, y: 0.7 - (Math.cos(a) * 90 - Math.sin(a) * off) / 480, z: 0 }; });
          onFrame({ t: performance.now(), width: 640, height: 480, luminance: 120, latencyMs: 5,
            hands: S.missing ? [] : [{ handedness: 'Left', score: .99, landmarks }] });
        }, 33);
        return true;
      }, stop() { clearInterval(id); } };
    } });
  ` }));
  const state = () => page.evaluate(() => document.querySelector('.fishing-app').fishingState());
  const runUntil = async (pred, maxMs, label) => {
    for (let ms = 0; ms < maxMs; ms += 250) { if (pred(await state())) return; await page.clock.runFor(250); }
    throw new Error(`timeout: ${label} (${JSON.stringify(await state())})`);
  };

  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fishing.html`);
  await page.clock.runFor(600);
  if (shots) await page.screenshot({ path: `${shots}/fishing-title.png` });
  await runUntil(s => s.enginePhase === 'calib-up', 8000, 'calibración reposo');
  if (shots) await page.screenshot({ path: `${shots}/fishing-calib.png` });
  await runUntil(s => !s.enginePhase.startsWith('calib'), 20000, 'fin de calibración');
  const cal = (await state()).calib;
  assert.ok(Math.abs(cal.extRange - 40) < 4 && Math.abs(cal.flexRange - 40) < 4, JSON.stringify(cal));
  if (shots) await page.screenshot({ path: `${shots}/fishing-cast.png` });
  await runUntil(s => ['wait', 'bite'].includes(s.enginePhase), 5000, 'lanzar');
  await page.clock.runFor(1800);
  if (shots) await page.screenshot({ path: `${shots}/fishing-wait.png` });
  await runUntil(s => s.enginePhase === 'bite', 10000, 'picada');
  await page.clock.runFor(300);
  if (shots) await page.screenshot({ path: `${shots}/fishing-bite.png` });
  // Ignora la primera picada: el pez vuelve a intentarlo (no se pierde nada).
  await runUntil(s => s.enginePhase === 'reel', 20000, 'enganchar');
  await page.clock.runFor(1500);
  if (shots) await page.screenshot({ path: `${shots}/fishing-reel.png` });
  // Pérdida de mano: pausa sin penalizar.
  await page.evaluate(() => { window.sim.missing = true; });
  await page.clock.runFor(1500);
  assert.equal((await state()).phase, 'paused');
  await page.evaluate(() => { window.sim.missing = false; });
  await page.clock.runFor(1200);
  assert.equal((await state()).phase, 'playing');
  await runUntil(s => s.enginePhase === 'caught', 10000, 'pescar');
  await page.clock.runFor(700);
  if (shots) await page.screenshot({ path: `${shots}/fishing-caught.png` });
  await runUntil(s => s.phase === 'done', 120000, 'terminar');
  const r = (await state()).result;
  assert.equal(r.completed, true);
  assert.equal(r.summary.fishCaught, 6);
  assert.ok(r.summary.missedBites >= 1);
  assert.ok(r.summary.maxExtensionDeg >= 36);
  assert.equal(r.summary.reachesFmaStability15, true);
  assert.equal(r.quality.pauses, 1);
  if (shots) await page.screenshot({ path: `${shots}/fishing-end.png` });
  await page.locator('[data-action=done]').click();
  assert.equal(await page.evaluate(() => window.doneResult?.game), 'fishing');
  assert.deepEqual(errors, []);
  console.log('Fishing UI OK:', JSON.stringify(r.summary));
} finally {
  await browser?.close();
  await server.close();
}
