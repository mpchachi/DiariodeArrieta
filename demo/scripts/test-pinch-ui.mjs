import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [], posts = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.clock.install();
  await page.route('**/src/games/pastillero/pinchEntry.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { startPinchGame } from '/src/games/pastillero/pinchGame.js';
    window.testFrame = {ratio: .8, scale: 1, missing: false, crop: false};
    window.captureStopped = false;
    startPinchGame(document.querySelector('#app'), {subjectId: 'synthetic-ui-test', cameraFactory: ({onFrame}) => {
      let interval;
      return {delegate: 'mock', async start() {
        interval = setInterval(() => {
          const o = window.testFrame, r = o.ratio;
          const xy = [[0,0],[-.3,-.15],[-.6,-.35],[-.7,-.7],[-.4,-1.1],[-.4,-.9],[-.4,-1.45],[-.3,-1.8],[-.4+r,-1.1],[0,-1],[0,-1.5],[0,-1.9],[0,-2.2],[.35,-.9],[.4,-1.4],[.4,-1.7],[.4,-1.9],[.65,-.7],[.7,-1.1],[.7,-1.4],[.7,-1.6]];
          const landmarks = xy.map(([a,b]) => ({x:.5+a*.12*o.scale,y:.7+b*.16*o.scale,z:0}));
          if(o.crop) landmarks[4].x = -.1;
          onFrame({t:performance.now(),width:640,height:480,luminance:120,latencyMs:5,
            hands:o.missing ? [] : [{handedness:'Right',score:.99,landmarks}]});
        },33);
        return true;
      }, stop() {clearInterval(interval);window.captureStopped=true;}};
    }});
  ` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/pinch.html`);
  await page.locator('[data-action=start]').click();
  await page.clock.runFor(1500);
  assert.equal(await page.locator('[data-action=start]').isEnabled(), true);
  await page.locator('[data-action=start]').click();
  await page.clock.runFor(3100);
  const set = patch => page.evaluate(p => Object.assign(window.testFrame, p), patch);
  await set({ ratio: .1 }); await page.clock.runFor(250);
  assert.equal(await page.locator('[data-role=stage]').evaluate(e => e.classList.contains('held')), true);
  assert.equal(await page.locator('[data-role=count]').textContent(), '0 / 17');
  await set({ missing: true }); await page.clock.runFor(250);
  assert.equal(await page.locator('[data-role=count]').textContent(), '0 / 17');
  await set({ missing: false, ratio: .8 }); await page.clock.runFor(1000);
  assert.equal(await page.locator('[data-role=count]').textContent(), '0 / 17');
  await set({ crop: true }); await page.clock.runFor(100);
  assert.match(await page.locator('[data-role=quality]').textContent(), /Centra/);
  await set({ crop: false, scale: 2.5 }); await page.clock.runFor(1100);
  assert.match(await page.locator('[data-role=quality]').textContent(), /Aleja/);
  await set({ scale: 1, ratio: .8 }); await page.clock.runFor(1900);
  assert.equal(await page.locator('canvas#main').getAttribute('data-total'), '17');
  assert.equal(await page.locator('.pinch-slots').count(), 0);
  for (let i = 0; i < 17; i++) {
    await set({ ratio: .1 }); await page.clock.runFor(260);
    assert.equal(await page.locator('canvas#main').getAttribute('data-held'), 'true');
    await set({ ratio: .8 }); await page.clock.runFor(260);
    assert.equal(await page.locator('[data-role=count]').textContent(), `${i + 1} / 17`);
    assert.equal(await page.locator('canvas#main').getAttribute('data-placed'), String(i + 1));
  }
  await page.clock.runFor(1000);
  assert.match(await page.locator('[data-role=result-title]').textContent(), /17 pastillas/);
  assert.equal(await page.evaluate(() => window.captureStopped), true);
  await page.keyboard.press('Control+Shift+D');
  assert.equal(await page.locator('.pinch-debug').evaluate(e => e.open), true);
  assert.match(await page.locator('.pinch-debug pre').textContent(), /"phase": "done"/);
  await page.keyboard.press('Control+Shift+D');
  const promise = page.waitForEvent('download');
  await page.locator('[data-action=export]').click();
  const download = await promise, stream = await download.createReadStream();
  let body = ''; for await (const chunk of stream) body += chunk;
  const data = JSON.parse(body);
  assert.equal(data.protocol, 'fixedgap-pastillero-assisted-pinch-v2');
  assert.equal(data.completedRepetitions, 17);
  assert.equal(data.placedPills, 17);
  assert.equal(data.totalPills, 17);
  assert.equal(data.assistedPlacement, true);
  assert.equal(data.clinicalScore, null);
  assert.equal(data.subjectId, 'synthetic-ui-test');
  assert.equal(data.interruptedRepetitions, 1);
  assert.equal(data.quality.sufficient, false);
  assert.deepEqual(posts, []);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(150);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('canvas#main').evaluate(e => Math.round(e.getBoundingClientRect().width)), 390);
  await page.locator('[data-action=dismiss-result]').click();
  await page.locator('[data-action=exit]').click();
  console.log('PASS: escena original 3D, 17 pastillas en sus compartimentos, pérdida sin depósito, recorte/proximidad, parada, depuración, exportación aislada y móvil.');
} finally {
  await browser?.close();
  await server.close();
}
