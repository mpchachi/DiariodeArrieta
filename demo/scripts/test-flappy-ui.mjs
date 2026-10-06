// Prueba de interfaz del Flappy con landmarks sintéticos (sin cámara real).
// Un piloto abre/cierra el puño según la posición del avión respecto al hueco.
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
  await page.route('**/src/flappy/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startFlappyGame } from '/src/flappy/game.js';
    const OPEN = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.8,-1.0],[-.4,-.9],[-.4,-1.45],[-.4,-1.8],[-.4,-2.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.25],[.35,-.9],[.4,-1.4],[.4,-1.75],[.4,-2.05],[.65,-.7],[.7,-1.05],[.7,-1.3],[.7,-1.55]];
    const MCP = { 8: 5, 12: 9, 16: 13, 20: 17 };
    window.pilot = { auto: false, missing: false, closed: false };
    window.doneResult = null;
    startFlappyGame(document.querySelector('#app'), { subjectId: 'synthetic-flappy-test', onDone: r => { window.doneResult = r; }, cameraFactory: ({ onFrame }) => {
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
          onFrame({ t: performance.now(), width: 640, height: 480, luminance: 120, latencyMs: 5,
            hands: P.missing ? [] : [{ handedness: 'Right', score: .99, landmarks }] });
        }, 33);
        return true;
      }, stop() { clearInterval(id); } };
    } });
  ` }));
  const state = () => page.evaluate(() => document.querySelector('.flappy-app').flappyState());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/flappy.html`);
  await page.clock.runFor(2500);
  assert.equal((await state()).phase, 'countdown');
  if (shots) await page.screenshot({ path: `${shots}/flappy-countdown.png` });
  await page.clock.runFor(5000);
  assert.equal((await state()).phase, 'playing');
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
  if (shots) await page.screenshot({ path: `${shots}/flappy-end.png` });
  await page.locator('[data-action=done]').click();
  assert.equal(await page.evaluate(() => window.doneResult?.game), 'flappy');
  assert.deepEqual(errors, []);
  console.log('Flappy UI OK:', JSON.stringify({ ...r.summary, metrics: r.metrics }));
} finally {
  await browser?.close();
  await server.close();
}
