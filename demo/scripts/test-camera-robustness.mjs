// Robustez de la cámara de los juegos (RunnerCamera) en un navegador real, provocando
// cada fallo: cámara desconectada, vídeo congelado, fallo del modelo (GPU), cámara
// ocupada, pestaña oculta, fallos repetidos y cierre a mitad de reconexión.
// El detector es simulado (determinista); la cámara es un stream de lienzo real.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.sim = { freeze: false, gumFail: [], gumCalls: 0, throwNext: 0, streams: [] };
    navigator.mediaDevices.getUserMedia = async () => {
      const S = window.sim; S.gumCalls++;
      const fail = S.gumFail.shift();
      if (fail) throw Object.assign(new Error(fail), { name: fail });
      S.freeze = false;
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d');
      let n = 0;
      const draw = () => { if (!S.freeze) { x.fillStyle = `hsl(${(n++ * 7) % 360},40%,50%)`; x.fillRect(0, 0, 640, 480); } requestAnimationFrame(draw); };
      draw();
      const stream = c.captureStream(30); S.streams.push(stream); return stream;
    };
  });
  await page.route('**/robust-test.html', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body><video id="v" autoplay muted playsinline style="width:320px"></video>
    <script type="module">
      import { RunnerCamera } from '/src/runner/camera.js';
      const L = window.log = { frames: [], errors: [], status: [], delegates: [] };
      const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + (i % 5) * 0.02, y: 0.6 - Math.floor(i / 5) * 0.04, z: 0 }));
      const create = async delegate => { L.delegates.push(delegate); return {
        detectForVideo(v, t) { if (window.sim.throwNext > 0) { window.sim.throwNext--; throw new Error('contexto GPU perdido'); } return { landmarks: [hand], handedness: [[{ categoryName: 'Left', score: 0.95 }]], worldLandmarks: [] }; },
        close() {} }; };
      window.cam = new RunnerCamera({ create, config: { stallMs: 1200, watchdogMs: 250, reconnectDelaysMs: [150, 300, 450] },
        onFrame: f => L.frames.push(f.t), onError: m => L.errors.push(m), onStatus: m => L.status.push(m) });
      window.startCam = () => window.cam.start(document.getElementById('v'));
    </script></body>` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/robust-test.html`);
  await page.waitForFunction(() => window.startCam);
  const L = () => page.evaluate(() => ({ frames: window.log.frames.length, errors: [...window.log.errors], status: [...window.log.status], delegates: [...window.log.delegates], stats: { ...window.cam.stats }, mono: window.log.frames.every((t, i, a) => i === 0 || t > a[i - 1]) }));
  const framesAfter = async (ms) => { const a = (await L()).frames; await page.waitForTimeout(ms); return (await L()).frames - a; };

  // 1. Arranque normal.
  assert.equal(await page.evaluate(() => window.startCam()), true);
  assert.ok(await framesAfter(800) > 5, 'llegan fotogramas');

  // 2. Cámara desconectada (el sistema termina la pista) → reconecta sola.
  await page.evaluate(() => window.sim.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await page.waitForTimeout(900);
  let s = await L();
  assert.ok(s.status.includes('Reconectando la cámara…'), 'avisa de que reconecta');
  assert.equal(s.stats.reconnects, 1); assert.deepEqual(s.errors, []);
  assert.ok(await framesAfter(800) > 5, 'vuelven los fotogramas tras desconexión');

  // 3. Vídeo congelado (sin fotogramas nuevos) → el vigilante reconecta.
  await page.evaluate(() => { window.sim.freeze = true; });
  await page.waitForTimeout(2600);
  s = await L();
  assert.equal(s.stats.reconnects, 2, 'reconecta por vídeo congelado'); assert.deepEqual(s.errors, []);
  assert.ok(await framesAfter(800) > 5, 'vuelven los fotogramas tras congelarse');

  // 4. El modelo falla dos veces (contexto GPU perdido) → se recrea y sigue (2.º intento en CPU).
  await page.evaluate(() => { window.sim.throwNext = 2; });
  await page.waitForTimeout(900);
  s = await L();
  assert.equal(s.stats.modelRecoveries, 2); assert.deepEqual(s.errors, []);
  assert.equal(s.delegates.at(-1), 'CPU', 'tras fallos repetidos pasa a CPU');
  assert.ok(await framesAfter(800) > 5, 'vuelven los fotogramas tras fallo del modelo');

  // 5. Pestaña oculta y visible: no es un error y sigue.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await L(); assert.deepEqual(s.errors, []);
  assert.ok(await framesAfter(800) > 5, 'sigue tras volver a la pestaña');

  // 6. El reloj de los fotogramas nunca va hacia atrás (ni tras reconectar).
  assert.equal((await L()).mono, true, 'marcas de tiempo estrictamente crecientes');

  // 7. Desconexión y la cámara queda ocupada por otra app en todos los reintentos → error claro (una sola vez).
  await page.evaluate(() => { window.sim.gumFail = ['NotReadableError', 'NotReadableError', 'NotReadableError']; window.sim.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('ended')); });
  await page.waitForTimeout(1500);
  s = await L();
  assert.equal(s.errors.length, 1); assert.match(s.errors[0], /otra aplicación/);

  // 8. Arrancar con la cámara ocupada → error claro; volver a arrancar cuando se libera → funciona.
  await page.evaluate(() => { window.log.errors.length = 0; window.sim.gumFail = ['NotReadableError']; });
  assert.equal(await page.evaluate(() => window.startCam()), false);
  assert.match((await L()).errors[0], /otra aplicación/);
  assert.equal(await page.evaluate(() => window.startCam()), true);
  assert.ok(await framesAfter(600) > 3);

  // 9. Fallo del modelo persistente → se rinde con un único error (no bucle infinito).
  await page.evaluate(() => { window.log.errors.length = 0; window.sim.throwNext = 99; });
  await page.waitForTimeout(1500);
  s = await L(); assert.equal(s.errors.length, 1, 'un único error tras agotar reintentos');
  assert.equal(await framesAfter(500), 0, 'cámara detenida');

  // 10. Cerrar el juego a mitad de una reconexión no deja errores ni fotogramas sueltos.
  await page.evaluate(() => { window.sim.throwNext = 0; window.log.errors.length = 0; });
  await page.evaluate(() => window.startCam());
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.sim.gumFail = ['NotReadableError']; window.sim.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('ended')); window.cam.stop(); });
  await page.waitForTimeout(1200);
  s = await L(); assert.deepEqual(s.errors, []); assert.equal(await framesAfter(400), 0);

  assert.deepEqual(errors, []);
  console.log('Camera robustness OK:', JSON.stringify((await L()).stats));
} finally {
  await browser?.close();
  await server.close();
}
