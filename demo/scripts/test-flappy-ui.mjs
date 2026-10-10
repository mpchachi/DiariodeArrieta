// Prueba de interfaz del Flappy con landmarks sintéticos (sin cámara real).
// Un piloto abre/cierra el puño según la posición del avión respecto al hueco.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const shots = process.env.RUNNER_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false, watch: null, hmr: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install();
  await page.route('**/src/flappy/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startFlappyGame } from '/src/flappy/game.js';
    const OPEN = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.8,-1.0],[-.4,-.9],[-.4,-1.45],[-.4,-1.8],[-.4,-2.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.25],[.35,-.9],[.4,-1.4],[.4,-1.75],[.4,-2.05],[.65,-.7],[.7,-1.05],[.7,-1.3],[.7,-1.55]];
    const MCP = { 8: 5, 12: 9, 16: 13, 20: 17 };
    window.pilot = { auto: false, missing: false, closed: false };
    window.doneResult = null;
    startFlappyGame(document.querySelector('#app'), { subjectId: 'synthetic-flappy-test', hand: ${JSON.stringify(process.env.TEST_HAND || 'Right')}, onDone: r => { window.doneResult = r; }, onComplete: new URLSearchParams(location.search).has('skip-test') ? r => { window.skippedResult = r; } : null, cameraFactory: ({ onFrame, hand }) => {
      let id;
      return { delegate: 'mock', async start() {
        id = setInterval(() => {
          const P = window.pilot, st = document.querySelector('.flappy-app').flappyState();
          if (P.auto && st.engine.status === 'playing') {
            const next = st.engine.columns.find(c => !c.passed) ?? { gapY: 0 };
            P.closed = st.engine.planeY < next.gapY;
          }
          const landmarks = OPEN.map(([a, b], i) => {
            const m = MCP[i]; const [x, y] = P.closed && m !== undefined ? [OPEN[m][0], OPEN[m][1] + .12] : [a, b];
            return { x: .5 + x * .1, y: .7 + y * .12, z: 0 };
          });
          const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
          for (const [base, dx] of [[5,-.02],[9,0],[13,.018],[17,.034]]) {
            let p = { x: dx, y: .085, z: 0 }, acc = 0;
            const n = Math.hypot(dx, .085); world[base] = p;
            [[P.closed ? 70 : 5,.04],[P.closed ? 90 : 5,.025],[P.closed ? 60 : 5,.02]].forEach(([degrees,len], k) => {
              acc += degrees * Math.PI / 180;
              p = { x: p.x + dx / n * Math.cos(acc) * len, y: p.y + .085 / n * Math.cos(acc) * len, z: p.z - Math.sin(acc) * len };
              world[base + k + 1] = p;
            });
          }
          onFrame({ t: performance.now(), width: 640, height: 480, luminance: 120, latencyMs: 5,
            hands: P.missing ? [] : [{ handedness: hand, score: .99, landmarks, world }] });
        }, 33);
        return true;
      }, stop() { clearInterval(id); } };
    } });
  ` }));
  const state = () => page.evaluate(() => document.querySelector('.flappy-app').flappyState());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/flappy.html`);
  await page.clock.runFor(2500);
  // Ronda introductoria: la guía enseña el puño y el vuelo no arranca hasta el primer puño.
  assert.equal((await state()).phase, 'tutorial');
  assert.equal(await page.locator('.fg-guide .fg-guide__title').textContent(), 'Cierra el puño para subir');
  if (shots) await page.screenshot({ path: `${shots}/flappy-tutorial.png` });
  await page.clock.runFor(3000);
  assert.equal((await state()).phase, 'tutorial', 'sin puño no arranca');
  await page.evaluate(() => { window.pilot.closed = true; });
  await page.clock.runFor(600);
  assert.equal((await state()).phase, 'playing');
  assert.match(await page.locator('.fg-guide .fg-guide__title').textContent(), /Eso es/);
  await page.clock.runFor(1500);
  assert.equal(await page.locator('.fg-guide').isVisible(), false, 'la guía se retira');
  await page.evaluate(() => { window.pilot.auto = true; });
  await page.clock.runFor(12000);
  if (shots) await page.screenshot({ path: `${shots}/flappy-play.png` });
  await page.evaluate(() => { window.pilot.missing = true; });
  await page.clock.runFor(1500);
  assert.equal((await state()).phase, 'paused');
  await page.evaluate(() => { window.pilot.missing = false; });
  await page.clock.runFor(1500);
  assert.equal((await state()).phase, 'playing');
  for (let i = 0; i < 50 && (await state()).phase !== 'done'; i++) await page.clock.runFor(3000);
  const end = await state();
  assert.equal(end.phase, 'done');
  const r = end.result;
  assert.equal(r.completed, true);
  assert.equal(r.summary.columns.total, 5);
  assert.ok(r.summary.columns.cleared >= 4, JSON.stringify(r.summary));
  assert.ok(r.metrics.activationCount > 5);
  assert.ok(r.metrics.maxFlexion > 0.9 && r.metrics.maxExtension < 0.1);
  assert.equal(r.quality.pauses, 1);
  assert.equal(r.measurement.selectedHand, process.env.TEST_HAND || 'Right');
  assert.ok(r.measurement.capture.usable > 0);
  assert.ok(r.measurement.summary.upper > 200);
  assert.ok(r.measurement.summary.lower < 20);
  assert.ok(r.measurement.observations.some(o => o.stage === 'tutorial'));
  assert.ok(r.measurement.trace.some(p => p[5]?.length === 4));
  // Feedback tranquilo: un ánimo por paso limpio y, si hubo choques, un único «Casi… ¡sigue así!».
  const cheers = r.summary.columns.cleared + (r.summary.columns.hits > 0 ? 1 : 0);
  assert.equal(await page.evaluate(() => document.querySelector('.runner-praise').dataset.count), String(cheers), 'ánimos del globo');
  if (shots) await page.screenshot({ path: `${shots}/flappy-end.png` });
  await page.locator('[data-action=done]').click();
  assert.equal(await page.evaluate(() => window.doneResult?.game), 'flappy');
  if (process.env.RESULTS_DIR) (await import('node:fs')).writeFileSync(`${process.env.RESULTS_DIR}/flappy.json`, JSON.stringify(r));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/flappy.html?skip-test`);
  await page.clock.runFor(3000);
  assert.equal((await state()).phase, 'tutorial');
  await page.locator('[data-action=skip]').click();
  const skipped = await page.evaluate(() => window.skippedResult.result);
  assert.equal(skipped.completed, false);
  assert.equal(skipped.measurement.summary.upper, null);
  assert.equal(skipped.summary.columns.total, 5);
  assert.equal(skipped.measurement.observations.filter(o => o.status === 'not-performed').length, 5);
  assert.ok(skipped.measurement.observations.some(o => o.stage === 'tutorial' && o.usableCount > 0));
  assert.deepEqual(errors, []);
  console.log('Flappy UI OK:', JSON.stringify({ ...r.summary, metrics: r.metrics }));
} finally {
  await browser?.close();
  await server.close();
}
