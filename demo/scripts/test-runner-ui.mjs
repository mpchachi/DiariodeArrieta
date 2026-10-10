// Prueba de interfaz del Runner con landmarks sintéticos (sin cámara real).
// Un «bot» hace la pinza cuando toca para recorrer el bosque completo.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const shots = process.env.RUNNER_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false, watch: null, hmr: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install();
  await page.route('**/src/runner/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startRunnerGame } from '/src/runner/game.js';
    window.testFrame = { ratio: .8, missing: false };
    window.bot = { auto: false, holdUntil: 0, lastTarget: null };
    const XY = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.4,-1.1],[-.4,-.9],[-.4,-1.45],[-.3,-1.8],[null,-1.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.2],[.35,-.9],[.4,-1.4],[.4,-1.7],[.4,-1.9],[.65,-.7],[.7,-1.1],[.7,-1.4],[.7,-1.6]];
    startRunnerGame(document.querySelector('#app'), { subjectId: 'synthetic-runner-test', hand: ${JSON.stringify(process.env.TEST_HAND || 'Right')}, onNext: next => { window.nextGame = next; }, cameraFactory: ({ onFrame, hand }) => {
      let interval;
      return { delegate: 'mock', hand: 'Right', async start() {
        interval = setInterval(() => {
          const o = window.testFrame, B = window.bot;
          const st = document.querySelector('.runner-app').runnerState();
          if (B.auto && (st.phase === 'playing' || st.phase === 'tutorial')) {
            const now = performance.now();
            if (B.holdUntil > now) o.ratio = .1;
            else {
              o.ratio = .8;
              const next = st.obstacles.find(x => !x.passed), foxWorld = st.scroll + 64;
              if (next && st.fox.onGround && B.lastTarget !== next.id && foxWorld - next.x >= -32) {
                B.lastTarget = next.id; B.holdUntil = now + 160; o.ratio = .1;
              }
            }
          }
          const landmarks = XY.map(([a, b]) => ({ x: .5 + (a ?? -.4 + o.ratio) * .12, y: .7 + b * .16, z: 0 }));
          onFrame({ t: performance.now(), width: 640, height: 480, luminance: 120, latencyMs: 5,
            hands: o.missing ? [] : [{ handedness: hand, score: .99, landmarks }] });
        }, 33);
        return true;
      }, stop() { clearInterval(interval); } };
    } });
  ` }));
  const state = () => page.evaluate(() => document.querySelector('.runner-app').runnerState());
  const set = patch => page.evaluate(p => Object.assign(window.testFrame, p), patch);

  await page.goto(`${base}/runner.html`);
  await page.clock.runFor(500);
  if (shots) await page.screenshot({ path: `${shots}/runner-title.png` });
  await page.locator('[data-action=start]').click();
  await page.clock.runFor(1500);
  assert.equal(await page.locator('[data-role=setup-title]').textContent(), '¡Te veo!');
  if (shots) await page.screenshot({ path: `${shots}/runner-setup.png` });
  await set({ ratio: .1 }); await page.clock.runFor(200); await set({ ratio: .8 });
  await page.clock.runFor(2700);
  assert.equal((await state()).phase, 'playing');
  // Ronda introductoria: ante el primer tronco el mundo se para y la guía enseña la pinza.
  for (let i = 0; i < 40 && (await state()).phase !== 'tutorial'; i++) await page.clock.runFor(200);
  const tut = await state();
  assert.equal(tut.phase, 'tutorial');
  assert.ok(tut.scroll + 64 - tut.obstacles[0].x >= -45 && tut.scroll + 64 - tut.obstacles[0].x <= -10, 'se para dentro de la ventana de salto');
  assert.equal(await page.locator('.fg-guide .fg-guide__title').textContent(), 'Junta pulgar e índice para saltar');
  if (shots) await page.screenshot({ path: `${shots}/runner-tutorial.png` });
  await page.clock.runFor(2000);
  assert.equal((await state()).phase, 'tutorial', 'sin pinza no sigue');
  assert.ok(Math.abs((await state()).scroll - tut.scroll) < 1, 'el mundo está parado');
  // Primera pinza: salto guiado 1. Ante el segundo tronco vuelve a parar con «otra vez».
  await set({ ratio: .1 }); await page.clock.runFor(300); await set({ ratio: .8 });
  for (let i = 0; i < 60 && (await state()).phase !== 'tutorial'; i++) await page.clock.runFor(200);
  const tut2 = await state();
  assert.equal(tut2.phase, 'tutorial', 'segundo salto guiado');
  assert.ok(tut2.scroll > tut.scroll + 50, 'ha avanzado hasta el segundo tronco');
  assert.equal(await page.locator('.fg-guide .fg-guide__title').textContent(), 'Otra vez: junta pulgar e índice');
  assert.equal(await page.locator('.fg-guide .fg-guide__dots i.is-done').count(), 1);
  if (shots) await page.screenshot({ path: `${shots}/runner-tutorial2.png` });
  await page.evaluate(() => { window.bot.auto = true; });

  await page.clock.runFor(15000);
  if (shots) await page.screenshot({ path: `${shots}/runner-play.png` });

  // Pérdida de mano: pausa sin penalizar y reanudación automática.
  const before = await state();
  await set({ missing: true }); await page.clock.runFor(2000);
  const paused = await state();
  assert.equal(paused.phase, 'paused');
  assert.ok(Math.abs(paused.scroll - before.scroll) < 120, 'el mundo se detiene en pausa');
  assert.equal(await page.locator('[data-panel=pause]').isVisible(), true);
  if (shots) await page.screenshot({ path: `${shots}/runner-pause.png` });
  await set({ missing: false, ratio: .8 });
  await page.evaluate(() => Object.assign(window.bot, { lastTarget: null, holdUntil: 0 }));
  await page.clock.runFor(1800);
  assert.equal((await state()).phase, 'playing');

  const praiseOn = () => page.evaluate(() => { const el = document.querySelector('.runner-praise'); return !!el && !el.hidden; });
  let praiseShot = false;
  for (let i = 0; i < 240 && (await state()).phase !== 'done'; i++) {
    await page.clock.runFor(500);
    if (shots && i === 36) await page.screenshot({ path: `${shots}/runner-play2.png` });
    if (shots && !praiseShot && await praiseOn()) { praiseShot = true; await page.clock.runFor(250); await page.screenshot({ path: `${shots}/runner-praise.png` }); }
  }
  const end = await state();
  assert.equal(end.phase, 'done');
  const r = end.result;
  assert.equal(r.completed, true);
  assert.equal(r.summary.obstacles.total, 5);
  assert.equal(r.summary.obstacles.cleared, 5, JSON.stringify(r.obstacles.filter(o => !o.cleared)));
  assert.equal(r.quality.pauses, 1);
  assert.equal(r.tutorial?.gesture, 'pinch'); assert.equal(r.tutorial.jumps, 2);
  assert.ok(r.summary.pinch.cycles >= 4, `ciclos ${r.summary.pinch.cycles}`);
  assert.equal(end.nextSeason, 1);
  // Feedback tranquilo: un ánimo por tronco superado fuera de la ronda guiada (5 − 2) y ninguno de «casi».
  assert.equal(await page.evaluate(() => document.querySelector('.runner-praise').dataset.count), '3', 'un ánimo por tronco superado');
  assert.equal(await page.locator('[data-panel=end]').isVisible(), true);
  if (shots) await page.screenshot({ path: `${shots}/runner-end.png` });
  await page.locator('[data-action=next]').click();
  assert.equal(await page.evaluate(() => !!window.nextGame && !window.nextGame.skipped), true, 'pasa al siguiente juego');
  assert.equal(r.hand, process.env.TEST_HAND || 'Right');
  assert.equal(r.measurement.selectedHand, r.hand);
  assert.equal(r.measurement.observations.filter(o => o.stage === 'tutorial').length, 2);
  assert.equal(r.measurement.observations.filter(o => o.stage === 'active' && o.status === 'completed').length, 3);
  assert.ok(r.measurement.trace.length > 0);

  // Botón para saltar al siguiente juego en mitad del zorro.
  await page.goto(`${base}/runner.html`);
  await page.clock.runFor(300);
  assert.equal(await page.locator('[name="runner-hand"]').count(), 0, 'sin selector de mano');
  await page.locator('[data-action=start]').click();
  await page.clock.runFor(1500);
  await set({ ratio: .1 }); await page.clock.runFor(200); await set({ ratio: .8 });
  await page.clock.runFor(4000);
  assert.equal((await state()).phase, 'playing');
  await page.locator('[data-action=skip]').click();
  assert.equal(await page.evaluate(() => window.nextGame?.skipped), true, 'salta al siguiente juego');
  assert.equal(await page.evaluate(() => window.nextGame.result?.completed), false, 'la partida saltada queda como incompleta');

  for (const s of [1, 2, 3]) {
    await page.goto(`${base}/runner.html?estacion=${s}`);
    await page.clock.runFor(800);
    await page.evaluate(() => { document.querySelector('[data-panel=title]').hidden = true; });
    if (shots) await page.screenshot({ path: `${shots}/runner-season-${s}.png` });
  }
  if (process.env.RESULTS_DIR) (await import('node:fs')).writeFileSync(`${process.env.RESULTS_DIR}/runner.json`, JSON.stringify(r));
  assert.deepEqual(errors, []);
  console.log('Runner UI OK:', JSON.stringify({ cleared: r.summary.obstacles.cleared, berries: r.summary.berries, timing: r.summary.timing.medianAbsErrorMs, cycles: r.summary.pinch.cycles }));
} finally {
  await browser?.close();
  await server.close();
}
