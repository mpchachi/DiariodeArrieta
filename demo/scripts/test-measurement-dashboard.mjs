import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { MeasurementRecorder } from '../src/pack/measurement.js';
import { buildJourneyRows } from '../src/pack/journeyRecord.js';
import { GARDEN_CONFIG } from '../src/garden/config.js';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false, watch: null, hmr: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  const sessions = [1, 2, 3, 4].map(i => ({ id: `session-${i}`, subject_id: 'synthetic', started_at: `2026-10-0${i}T10:00:00Z`, completed: true,
    quality_frames_pct: 99, device: { handUsed: 'right', protocol: 'fixedgap-fox-journey-v2' } }));
  const rows = sessions.map((s, i) => {
    const m = new MeasurementRecorder({ game: 'fox_garden', hand: 'Right', source: 'knuckle-image-tilt-v2', config: GARDEN_CONFIG,
      targets: [{ id: 'flower-0', stage: 'active' }] });
    m.calibration = { stable: true };
    for (let k = 0; k < 60; k++) m.add({ t: k * 33, width: 640, height: 480 }, { target: 'flower-0', value: (i + 1) * 10 * Math.sin(Math.PI * k / 120) });
    m.complete('flower-0'); m.adapt(0, 25, 'flower-0');
    const r = { durationMs: 2000, completed: true, flowers: [], summary: { flowersBloomed: 1, flowersTotal: 5 }, measurement: m.finish(true) };
    const [row] = buildJourneyRows({ garden: r });
    if (i === 0) { delete row.outcome.measurement; row.max_pronation_deg = 42; }
    if (i === 2) row.outcome.measurement.selectedHand = 'Left';
    return { ...row, session_id: s.id, id: `result-${i}` };
  });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], writes = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.url().startsWith(base)) return route.continue();
    if (url.pathname.startsWith('/rest/v1/')) {
      if (request.method() !== 'GET') writes.push(request.method());
      const data = url.pathname.endsWith('/subjects') ? [{ id: 'synthetic', display_name: 'Prueba local de medición', subject_type: 'healthy', birth_year: 1960, sex: 'female', dominant_hand: 'right' }]
        : url.pathname.endsWith('/sessions') ? sessions : url.pathname.endsWith('/game_results') ? rows : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    return route.abort();
  });
  await page.goto(`${base}/dashboard/patient/synthetic`);
  await page.getByRole('heading', { name: 'Prueba local de medición' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Última sesión' }).count(), 1);
  assert.equal(await page.getByText('Mano o convención de lateralidad diferente.', { exact: true }).count(), 1);
  const chart = page.locator('.recharts-line-dot');
  await chart.first().waitFor();
  assert.equal(await chart.count(), 2);
  assert.equal(await page.locator('.text-ok').count(), 0);
  await page.locator('tr[aria-expanded]').first().click();
  await page.getByText('Oportunidades registradas (1)').click();
  assert.ok((await page.locator('body').innerText()).includes('Autónoma: Completada'));
  await page.locator('tr[aria-expanded]').last().click();
  assert.ok((await page.locator('body').innerText()).includes('Máxima inclinación hacia el vertido (histórico)'));
  assert.ok((await page.locator('body').innerText()).includes('42°'));
  if (process.env.RUNNER_SHOTS) await page.screenshot({ path: `${process.env.RUNNER_SHOTS}/measurement-dashboard.png`, fullPage: true });
  await page.goto(`${base}/dashboard/patient/synthetic/report`);
  await page.getByRole('heading', { name: 'Prueba local de medición' }).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('Histórico sin versión compatible'));
  await page.goto(`${base}/dashboard/exercises`);
  await page.getByRole('heading', { name: 'Condiciones de captura y comparabilidad' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('260°'));
  await page.route('**/src/database/supabaseClient.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.mockWrites = [];
    export const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'synthetic-operator' } } }) },
      from(table) {
        const chain = {
          insert(value) { window.mockWrites.push({ table, action: 'insert', value }); return chain; },
          update(value) { window.mockWrites.push({ table, action: 'update', value }); return chain; },
          eq() { return chain; }, select() { return chain; },
          single: async () => ({ data: { id: 'synthetic-session' }, error: null }),
          then(resolve) { resolve({ error: null }); },
        };
        return chain;
      },
    };
  ` }));
  const upload = await page.evaluate(async () => {
    const { uploadJourney } = await import('/src/database/uploadJourney.js');
    const { RunnerSession } = await import('/src/runner/session.js');
    const { buildCourse } = await import('/src/runner/world.js');
    const { FlappySession } = await import('/src/flappy/session.js');
    const { GardenEngine } = await import('/src/garden/engine.js');
    const { summarize } = await import('/src/garden/session.js');
    const results = {
      runner: new RunnerSession({ hand: 'Left', course: buildCourse() }).finish(1000, 1000, false),
      flappy: new FlappySession({ hand: 'Left' }).finish(1000, false, { columns: [], hits: 0 }),
      garden: summarize(new GardenEngine(), { completed: false }),
    };
    const result = await uploadJourney({ subjectId: 'synthetic', hand: 'Left', results });
    return { result, writes: window.mockWrites };
  });
  assert.equal(upload.result.ok, true);
  const finalWrite = upload.writes.at(-1);
  assert.equal(finalWrite.action, 'update');
  assert.equal(finalWrite.value.completed, false);
  assert.equal(upload.writes[0].value.device.handUsed, 'left');
  assert.equal(upload.writes[1].value.length, 3);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log('Measurement dashboard UI OK: historia, mano distinta, huecos, informe y guía; sin acceso a datos reales.');
} finally {
  await browser?.close();
  await server.close();
}
