// Prueba del viaje completo: inicio → mano → transiciones automáticas → 3 capítulos → final.
// Cámara simulada (sin fotogramas): cada capítulo se salta con «Saltar →».
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
  await page.route('**/src/runner/entry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startFoxJourney } from '/src/pack/pack.js';
    window.cameraStarts = 0;
    const createCamera = () => {
      const f = () => ({ async start() { return true; }, stop() {} });
      f.attach = () => {}; f.start = async () => { window.cameraStarts++; return true; }; f.dispose = () => {};
      return f;
    };
    startFoxJourney(document.querySelector('#app'), { createCamera });
  ` }));
  const text = sel => page.locator(sel).first().textContent();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/runner.html`);
  await page.clock.runFor(800);
  assert.match(await text('.pack-card h1'), /El viaje del zorro/);
  if (shots) await page.screenshot({ path: `${shots}/pack-intro.png` });
  await page.locator('[data-hand=Left]').click();
  assert.equal(await page.evaluate(() => window.cameraStarts), 1);
  // Encuadre: sin fotogramas (cámara simulada) no avanza solo; se continúa a mano.
  await page.clock.runFor(1000);
  assert.match(await text('.pack-card h1'), /Coloca la mano/);
  if (shots) await page.screenshot({ path: `${shots}/pack-framing.png` });
  await page.locator('[data-action=skip-framing]').click();

  for (const [i, title, stateFn] of [[1, /carrera/, 'runnerState'], [2, /globo/, 'flappyState'], [3, /huerto/, 'gardenState']]) {
    await page.clock.runFor(1500);
    assert.match(await text('.pack-card .runner-kicker'), new RegExp(`Capítulo ${i} de 3`));
    assert.match(await text('.pack-card h1'), title);
    // La mano gris haciendo el gesto del capítulo, junto a la frase.
    assert.equal(await page.locator('.pack-card .pack-gesture__hand').count(), 1, `mano en la transición ${i}`);
    assert.ok(await page.locator('.pack-card .pack-gesture__text').textContent(), 'frase del gesto');
    if (shots) await page.screenshot({ path: `${shots}/pack-chapter${i}.png` });
    // Sin botones: empieza solo al cabo de unos segundos.
    assert.equal(await page.locator('.pack-card button').count(), 0);
    await page.clock.runFor(5500);
    assert.ok(await page.evaluate(fn => typeof document.querySelector('.runner-app')?.[fn] === 'function', stateFn), `capítulo ${i} activo`);
    // Sin pantallas de título propias del juego.
    assert.equal(await page.locator('[data-panel=title]:visible, [data-role=loading]:visible, [data-hand]:visible').count(), 0);
    if (shots) await page.screenshot({ path: `${shots}/pack-game${i}.png` });
    await page.locator('[data-action=skip]').click();
  }
  await page.clock.runFor(800);
  assert.match(await text('.pack-card h1'), /Viaje/);
  assert.equal(await page.locator('.pack-steps li.is-done').count(), 3);
  if (shots) await page.screenshot({ path: `${shots}/pack-final.png` });
  const records = await page.evaluate(() => Object.values(document.querySelector('#app').foxJourney.state().results));
  assert.equal(records.length, 3);
  for (const r of records) {
    assert.equal(r.measurement.selectedHand, 'Left');
    assert.equal(r.measurement.completed, false);
    assert.equal(r.measurement.comparable, false);
    assert.equal(r.measurement.summary.upper, null);
    assert.ok(r.measurement.observations.some(o => o.status === 'not-performed'));
  }
  assert.deepEqual(errors, []);
  console.log('Pack UI OK');
} finally {
  await browser?.close();
  await server.close();
}
