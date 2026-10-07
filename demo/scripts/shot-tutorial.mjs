// Captura la vista previa de la guía de gestos en varios instantes del bucle.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.env.SHOTS, times = (process.env.TIMES ?? '0,700,1100,1500').split(',');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1900, height: 600 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  for (const t of times) {
    await page.goto(`${base}/tutorial.html?t=${t}${process.env.HAND ? `&hand=${process.env.HAND}` : ''}${process.env.QUERY ? `&${process.env.QUERY}` : ''}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/guide-${t}.png` });
  }
  if (process.env.DONE) {
    await page.goto(`${base}/tutorial.html?done=1`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/guide-done.png` });
  }
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser?.close();
  await server.close();
}
