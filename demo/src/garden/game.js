// «El huerto del zorro»: inclina la mano como una regadera para regar 5 flores.
// La mano no se desplaza, solo se inclina (pronación/supinación). Sin calibración
// visible, sin tiempo límite ni fallo. Cámara oculta compartida con los otros juegos.
// Al empezar se elige la mano: con la derecha la escena va en espejo (el zorro riega
// hacia la izquierda), porque verter con la derecha es girar hacia dentro.

import '../runner/runner.css';
import { GARDEN_CONFIG as C } from './config.js';
import { knuckleTilt, TiltFilter } from './tilt.js';
import { GardenEngine } from './engine.js';
import { GardenScene } from './scene.js';
import { summarize } from './session.js';
import { flowerName } from '../pixel/garden.js';
import { RunnerCamera } from '../runner/camera.js';
import { HandSmoother } from '../flappy/fist.js';
import { storeSession, getSeason } from '../runner/progress.js';
import { createAudio } from '../runner/audio.js';
import { SEASONS } from '../pixel/seasons.js';
import { FramingTracker } from '../pack/framing.js';

const SESSIONS_KEY = 'fixedgap_garden_sessions', HAND_KEY = 'fixedgap_garden_hand';
const savedHand = () => { try { return localStorage.getItem(HAND_KEY) === 'Left' ? 'Left' : 'Right'; } catch { return 'Right'; } };

// `onComplete`: modo pack (mano ya elegida en `hand`, sin pantallas de título ni final).
export function startGardenGame(container, { subjectId = null, onExit = null, onDone = null, onComplete = null, hand: presetHand = null,
  cameraFactory = options => new RunnerCamera(options) } = {}) {
  container.innerHTML = `
    <section class="runner-app garden-app">
      <canvas class="runner-canvas" aria-label="El zorro riega las flores de su huerto"></canvas>
      <video class="runner-camera" autoplay muted playsinline aria-hidden="true"></video>
      <div class="runner-topbar">
        <button type="button" class="runner-chip" data-action="exit">${onExit ? '← Salir' : 'Reiniciar'}</button>
        <button type="button" class="runner-chip" data-action="mute">Sonido: sí</button>
        ${onComplete ? '<button type="button" class="runner-chip runner-chip--quiet" data-action="skip">Saltar →</button>' : ''}
      </div>
      <div class="runner-bubble" data-role="bubble" hidden></div>
      <div class="runner-panel runner-panel--small" data-role="loading">
        <p class="runner-kicker">FixedGap</p>
        <h1>El huerto del zorro</h1>
        <p class="runner-howto">Cierra la mano como si agarraras <strong>una regadera</strong>.<br><strong>Inclínala</strong> para regar las flores.</p>
        <p class="runner-note">¿Con qué mano vas a jugar?</p>
        <div class="runner-actions" data-role="hands">
          <button type="button" class="runner-secondary" data-hand="Left">Mano izquierda</button>
          <button type="button" class="runner-secondary" data-hand="Right">Mano derecha</button>
        </div>
        <p class="runner-note" data-role="status">Preparando la cámara…</p>
      </div>
      <div class="runner-panel runner-panel--small" data-role="pause" hidden>
        <h2>¡Te he perdido la mano!</h2>
        <p data-role="pause-hint">Vuelve a ponerla delante de la cámara.</p>
        <p class="runner-note">El zorro te espera. No cuenta como fallo.</p>
      </div>
      <div class="runner-panel" data-role="end" hidden>
        <h1 data-role="end-title">¡Huerto florecido!</h1>
        <dl class="runner-stats" data-role="end-stats"></dl>
        <div class="runner-actions"><button type="button" class="runner-primary" data-action="done">${onDone ? 'Finalizar' : 'Volver a jugar'}</button></div>
        <details class="runner-tech"><summary>Datos técnicos</summary><dl data-role="end-tech"></dl>
          <button type="button" class="runner-link" data-action="export">Exportar datos (JSON)</button></details>
      </div>
      <details class="runner-debug"><summary>Depuración · Ctrl + Mayús + D</summary><pre></pre></details>
    </section>`;

  const root = container.querySelector('.garden-app');
  const $ = sel => root.querySelector(sel);
  const role = name => $(`[data-role="${name}"]`);
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const season = getSeason(subjectId);
  root.style.setProperty('--runner-sky', SEASONS[season].sky[0]);
  let scene;
  let hand = presetHand ?? savedHand(), handChosen = !!presetHand, cameraReady = false;
  if (onComplete) role('loading').hidden = true;
  try { scene = new GardenScene($('.runner-canvas'), { season, mirror: hand === 'Right' }); }
  catch { setText(role('status'), 'Tu navegador no puede dibujar el juego.'); return () => {}; }

  let engine = new GardenEngine(C, { pourSign: hand === 'Right' ? -1 : 1 });
  const audio = createAudio();
  const framing = new FramingTracker();
  const smoother = new HandSmoother({ emaAlpha: 0.6, maxLostFrames: 8 });
  const filter = new TiltFilter(C.tiltAlpha, C.minQuality);
  let phase = 'loading', disposed = false, raf = null, last = performance.now(), startedAt = null, startWall = null;
  let lastFrame = null, lastTrackedWall = null, trackedSince = null, pausedAt = null, pauses = 0, pausedMs = 0;
  let tracked = 0, attempted = 0, raw = null, result = null, lastCamT = 0;

  // Cualquier mano visible (la de más confianza): sirve para derecha e izquierda.
  const camera = cameraFactory({ hand: 'Right', onFrame: receive,
    onStatus: m => { if (!disposed && phase === 'loading') setText(role('status'), m); },
    onError: m => { if (disposed) return; if (phase === 'playing' || phase === 'paused') finish(false); phase = 'error'; role('loading').hidden = false; setText(role('status'), m); } });

  function receive(frame) {
    if (disposed) return;
    lastFrame = frame;
    // En pausa, explica por qué no se ve la mano (demasiado cerca, en el borde, poca luz).
    const hint = framing.update(frame);
    if (phase === 'paused') setText(role('pause-hint'), hint.ok ? 'Mantén la mano así un momento…' : hint.text);
    if (phase !== 'playing' && phase !== 'paused') return;
    attempted++;
    const picked = [...frame.hands].sort((a, b) => b.score - a.score)[0] ?? null;
    const pts = smoother.smooth(picked?.landmarks ?? null);
    raw = pts ? knuckleTilt(pts, frame.width, frame.height) : null;
    const angle = filter.update(raw, frame.t);
    const now = performance.now();
    if (!picked || angle === null) { trackedSince = null; return; }
    lastTrackedWall = now; trackedSince ??= now; tracked++;
    if (phase !== 'playing') return;
    startedAt ??= frame.t; lastCamT = frame.t;
    for (const ev of engine.update({ t: frame.t, angle, velocity: filter.velocity, wrist: { x: picked.landmarks[0].x, y: picked.landmarks[0].y } })) {
      if (ev.type === 'bloom') audio.berry();
      if (ev.type === 'ready') audio.go();
      if (ev.type === 'done') finish(true);
    }
  }

  function instruction() {
    switch (engine.phase) {
      case 'neutral': return 'Cierra la mano como si agarraras una regadera';
      case 'water': return engine.flow > 0 ? '¡Así! Riega la flor' : 'Inclina la mano para regar';
      case 'bloom': return `¡Ha salido un${engine.flower?.kind === 'sunflower' || engine.flower?.kind === 'tulip' ? '' : 'a'} ${flowerName(engine.flower?.kind)}!`;
      case 'return': return 'Vuelve la mano a su sitio';
      default: return '';
    }
  }

  function finish(completed) {
    if (result) return;
    result = summarize(engine, { subjectId, hand, season, completed,
      durationMs: startedAt !== null ? Math.round(lastCamT - startedAt) : null,
      quality: { trackedCoverage: attempted ? Math.round(tracked / attempted * 1000) / 1000 : 0, pauses, pausedMs: Math.round(pausedMs) } });
    storeSession(result, SESSIONS_KEY);
    camera.stop();
    if (completed) audio.finish();
    phase = 'done';
    // Modo pack: al completar, pequeña celebración y se pasa al final del viaje.
    if (onComplete) { if (completed) { const r = result; role('bubble').hidden = true; setTimeout(() => { if (disposed) return; cleanup(); onComplete({ result: r }); }, 1800); } return; }
    setTimeout(showEnd, completed ? 900 : 0);
  }

  function fill(dl, rows) {
    dl.replaceChildren();
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
  }
  function showEnd() {
    if (disposed) return;
    role('pause').hidden = true; role('bubble').hidden = true; role('end').hidden = false;
    const s = result.summary, deg = v => (v === null || v === undefined ? '—' : `${Math.round(v)}°`);
    setText(role('end-title'), result.completed ? '¡Huerto florecido!' : 'Riego interrumpido');
    fill(role('end-stats'), [['Flores', `${s.flowersBloomed} / ${s.flowersTotal}`], ['Giro máximo', deg(s.maxTiltDeg)]]);
    fill(role('end-tech'), [
      ['Giro (mediana por flor)', deg(s.medianPeakTiltDeg)],
      ['Tiempo por flor', s.medianTimeToBloomMs === null ? '—' : `${(s.medianTimeToBloomMs / 1000).toFixed(1)} s`],
      ['Velocidad al girar', s.medianPeakVelocityOutDegS === null ? '—' : `${s.medianPeakVelocityOutDegS} °/s`],
      ['Velocidad al volver', s.medianPeakVelocityBackDegS === null ? '—' : `${s.medianPeakVelocityBackDegS} °/s`],
      ['Fatiga (giro)', s.fatigue.peakTiltChangePct === null ? '—' : `${s.fatigue.peakTiltChangePct} %`],
      ['Umbral adaptado', s.adapted ? `sí (${s.finalPourStartDeg}°)` : 'no'],
      ['Compensación con el brazo', `${s.compensationFlowers} flores`],
      ['Mano detectada', `${Math.round(result.quality.trackedCoverage * 100)} %`],
    ]);
  }

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (phase === 'playing' && (lastTrackedWall === null ? now - startWall > 3000 : now - lastTrackedWall > C.pauseAfterLossMs)) {
      phase = 'paused'; pausedAt = now; pauses++; role('pause').hidden = false; role('bubble').hidden = true;
    } else if (phase === 'paused' && trackedSince !== null && now - trackedSince > 400) {
      pausedMs += now - pausedAt; phase = 'playing'; role('pause').hidden = true;
    }
    if (phase === 'playing') { const text = instruction(); setText(role('bubble'), text); role('bubble').hidden = !text; }
    const handStatus = lastTrackedWall !== null && now - lastTrackedWall < 400 ? 'ready' : 'missing';
    scene.update(engine, phase === 'paused' ? 0 : dt, { hand: handStatus, now: lastCamT });
    scene.render();
    const debug = $('.runner-debug');
    if (debug.open) setText(debug.querySelector('pre'), JSON.stringify({ protocol: C.protocol, phase, enginePhase: engine.phase,
      raw: raw && { angle: +raw.angle.toFixed(1), quality: +raw.quality.toFixed(2) }, rel: +engine.rel.toFixed(1), flow: +engine.flow.toFixed(2),
      pourStart: engine.pourStart, neutral: engine.neutral && +engine.neutral.toFixed(1), velocity: +filter.velocity.toFixed(0),
      inferenceMs: lastFrame?.latencyMs != null ? +lastFrame.latencyMs.toFixed(1) : null,
      detected: lastFrame?.hands.map(h => `${h.handedness} ${h.score.toFixed(2)}`) ?? [] }, null, 2));
  }

  const onResize = () => scene.resize();
  window.addEventListener('resize', onResize);
  const keydown = e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const d = $('.runner-debug'); d.open = !d.open; } };
  document.addEventListener('keydown', keydown);
  $('[data-action="done"]').addEventListener('click', () => {
    cleanup();
    if (onDone) onDone(result); else startGardenGame(container, { subjectId, onExit, onDone, cameraFactory });
  });
  $('[data-action="exit"]').addEventListener('click', () => {
    if (phase === 'playing' || phase === 'paused') finish(false);
    cleanup();
    if (onExit) onExit(); else startGardenGame(container, { subjectId, onExit, onDone, cameraFactory });
  });
  $('[data-action="mute"]').addEventListener('click', e => { e.currentTarget.textContent = `Sonido: ${audio.toggle() ? 'no' : 'sí'}`; });
  $('[data-action="skip"]')?.addEventListener('click', () => {
    if (phase === 'playing' || phase === 'paused') finish(false);
    const r = result; cleanup(); onComplete({ result: r, skipped: true });
  });
  $('[data-action="export"]').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${C.protocol}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Empieza cuando hay mano elegida y cámara lista.
  const maybeStart = () => {
    if (disposed || !handChosen || !cameraReady || phase !== 'loading') return;
    role('loading').hidden = true; phase = 'playing'; startWall = performance.now();
  };
  const markHand = () => root.querySelectorAll('[data-hand]').forEach(b => { b.className = b.dataset.hand === hand ? 'runner-primary' : 'runner-secondary'; });
  markHand();
  root.querySelectorAll('[data-hand]').forEach(b => b.addEventListener('click', () => {
    hand = b.dataset.hand; handChosen = true; markHand();
    try { localStorage.setItem(HAND_KEY, hand); } catch { /* sin almacenamiento */ }
    scene.mirror = hand === 'Right';
    engine = new GardenEngine(C, { pourSign: hand === 'Right' ? -1 : 1 });
    if (!cameraReady) setText(role('status'), 'Preparando la cámara…');
    maybeStart();
  }));

  raf = requestAnimationFrame(loop);
  (async () => {
    const ok = await camera.start($('.runner-camera'));
    if (!disposed && ok && phase === 'loading') {
      cameraReady = true;
      setText(role('status'), handChosen ? '¡Listo!' : 'Cámara lista. Elige la mano para empezar.');
      setTimeout(maybeStart, 600);
    }
  })();

  root.gardenState = () => ({ phase, hand, enginePhase: engine.phase, rel: engine.rel, tilt: engine.tilt, flow: engine.flow,
    index: engine.index, pourStart: engine.pourStart, pourSign: engine.pourSign, mirror: scene.mirror, result });

  function cleanup() {
    if (disposed) return;
    disposed = true;
    if (raf !== null) cancelAnimationFrame(raf);
    camera.stop(); scene.dispose(); audio.close();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', keydown);
  }
  return cleanup;
}
