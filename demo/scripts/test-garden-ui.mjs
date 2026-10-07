// Prueba de interfaz del huerto con un puño sintético (sin cámara real).
// Un «paciente» inclina la mano para regar, vuelve a recto y repite con las 5 flores.
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
  await page.route('**/src/garden/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startGardenGame } from '/src/garden/game.js';
    window.sim = { angle: 3, missing: false, peak: 55, sign: -1 };
    window.doneResult = null;
    startGardenGame(document.querySelector('#app'), { subjectId: 'synthetic-garden-test', onDone: r => { window.doneResult = r; }, cameraFactory: ({ onFrame }) => {
      let id;
      return { delegate: 'mock', async start() {
        id = setInterval(() => {
          const S = window.sim, st = document.querySelector('.garden-app').gardenState();
          const target = 3 + (st.enginePhase === 'water' ? S.sign * S.peak : 0);
          if (st.phase === 'playing') S.angle += (target - S.angle) * 0.15;
          // Puño: nudillos 5 (arriba) → 13/17 (abajo), girados S.angle grados.
          const a = S.angle * Math.PI / 180, lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
          const put = (i, ox, oy) => { lm[i] = { x: 0.5 + (ox * Math.cos(a) - oy * Math.sin(a)) / 640, y: 0.5 + (ox * Math.sin(a) + oy * Math.cos(a)) / 480, z: 0 }; };
          put(5, 0, -40); put(9, 0, -14); put(13, 0, 12); put(17, 0, 36); put(0, 60, 0);
          onFrame({ t: performance.now(), width: 640, height: 480, luminance: 120, latencyMs: 5,
            hands: S.missing ? [] : [{ handedness: 'Right', score: .97, landmarks: lm }] });
        }, 33);
        return true;
      }, stop() { clearInterval(id); } };
    } });
  ` }));
  const state = () => page.evaluate(() => document.querySelector('.garden-app').gardenState());
  const runUntil = async (pred, maxMs, label) => {
    for (let ms = 0; ms < maxMs; ms += 200) { if (pred(await state())) return; await page.clock.runFor(200); }
    throw new Error(`timeout: ${label} (${JSON.stringify(await state())})`);
  };

  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/garden.html`);
  await page.clock.runFor(500);
  if (shots) await page.screenshot({ path: `${shots}/garden-title.png` });
  // Sin elegir mano no empieza.
  await page.clock.runFor(2500);
  assert.equal((await state()).phase, 'loading');
  // Mano derecha: escena en espejo y verter = girar hacia la izquierda (ángulo negativo).
  await page.locator('[data-hand=Right]').click();
  const st0 = await state();
  assert.equal(st0.mirror, true); assert.equal(st0.pourSign, -1);
  await runUntil(s => s.enginePhase === 'water', 8000, 'recto automático');
  await page.clock.runFor(300);
  if (shots) await page.screenshot({ path: `${shots}/garden-start.png` });
  await runUntil(s => s.flow > 0.5, 5000, 'regar');
  await page.clock.runFor(900);
  if (shots) await page.screenshot({ path: `${shots}/garden-pour.png` });
  await runUntil(s => s.enginePhase === 'bloom', 8000, 'florecer');
  await page.clock.runFor(500);
  if (shots) await page.screenshot({ path: `${shots}/garden-bloom.png` });
  await runUntil(s => s.enginePhase === 'walk', 8000, 'caminar');
  await page.clock.runFor(1200);
  if (shots) await page.screenshot({ path: `${shots}/garden-walk.png` });
  // Pérdida de mano: pausa sin penalizar.
  await page.evaluate(() => { window.sim.missing = true; });
  await page.clock.runFor(1800);
  assert.equal((await state()).phase, 'paused');
  await page.evaluate(() => { window.sim.missing = false; });
  await page.clock.runFor(1000);
  assert.equal((await state()).phase, 'playing');
  await runUntil(s => s.index === 3 && s.flow > 0.5, 30000, 'cuarta flor');
  await page.clock.runFor(800);
  if (shots) await page.screenshot({ path: `${shots}/garden-pour4.png` });
  await runUntil(s => s.phase === 'done', 60000, 'terminar');
  await page.clock.runFor(1200);
  const r = (await state()).result;
  assert.equal(r.completed, true);
  assert.equal(r.summary.flowersBloomed, 5);
  assert.ok(r.summary.maxTiltDeg > 45, String(r.summary.maxTiltDeg));
  assert.ok(r.durationMs < 75000, `dura ${r.durationMs} ms`);
  assert.equal(r.quality.pauses, 1);
  if (shots) await page.screenshot({ path: `${shots}/garden-end.png` });
  await page.locator('[data-action=done]').click();
  assert.equal(await page.evaluate(() => window.doneResult?.game), 'garden');
  assert.equal(r.hand, 'Right');
  if (process.env.RESULTS_DIR) (await import('node:fs')).writeFileSync(`${process.env.RESULTS_DIR}/garden.json`, JSON.stringify(r));
  assert.deepEqual(errors, []);
  console.log('Garden UI OK:', JSON.stringify({ ...r.summary, durationS: Math.round(r.durationMs / 1000) }));
} finally {
  await browser?.close();
  await server.close();
}
