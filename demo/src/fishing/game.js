// «El zorro pescador»: extensión/flexión de muñeca (codo apoyado, mano de canto como
// para dar la mano). La caña copia la muñeca. Calibración breve al
// empezar, 6 peces en orden fijo, nada se pierde. Cámara oculta compartida.

import '../runner/runner.css';
import { FISHING_CONFIG as C } from './config.js';
import { wristTilt, AngleFilter } from './wrist.js';
import { FishingEngine } from './engine.js';
import { FishingScene } from './scene.js';
import { summarize } from './session.js';
import { HandSelector } from '../runner/pinch.js';
import { RUNNER_CONFIG } from '../runner/config.js';
import { RunnerCamera } from '../runner/camera.js';
import { HandSmoother } from '../flappy/fist.js';
import { storeSession, getSeason } from '../runner/progress.js';
import { createAudio } from '../runner/audio.js';
import { SEASONS } from '../pixel/seasons.js';

const SESSIONS_KEY = 'fixedgap_fishing_sessions';
const CATCH_TEXT = { small: '¡Una perca!', medium: '¡Una trucha!', big: '¡Un salmón!' };

export function startFishingGame(container, { subjectId = null, onExit = null, onDone = null,
  cameraFactory = options => new RunnerCamera(options) } = {}) {
  container.innerHTML = `
    <section class="runner-app fishing-app">
      <canvas class="runner-canvas" aria-label="El zorro pesca en el lago del bosque"></canvas>
      <video class="runner-camera" autoplay muted playsinline aria-hidden="true"></video>
      <div class="runner-topbar">
        <button type="button" class="runner-chip" data-action="exit">${onExit ? '← Salir' : 'Reiniciar'}</button>
        <button type="button" class="runner-chip" data-action="mute">Sonido: sí</button>
      </div>
      <div class="runner-bubble" data-role="bubble" hidden></div>
      <div class="runner-panel runner-panel--small" data-role="loading">
        <p class="runner-kicker">FixedGap</p>
        <h1>El zorro pescador</h1>
        <p class="runner-howto">Codo apoyado y <strong>mano de canto</strong>, como para dar la mano.<br>
          Mano <strong>hacia dentro</strong> para lanzar, <strong>hacia fuera</strong> para pescar.</p>
        <p class="runner-note" data-role="status">Preparando la cámara…</p>
      </div>
      <div class="runner-panel runner-panel--small" data-role="pause" hidden>
        <h2>¡Te he perdido la mano!</h2>
        <p>Vuelve a ponerla delante de la cámara.</p>
        <p class="runner-note">El zorro te espera. No cuenta como fallo.</p>
      </div>
      <div class="runner-panel" data-role="end" hidden>
        <h1 data-role="end-title">¡Cubo lleno!</h1>
        <dl class="runner-stats" data-role="end-stats"></dl>
        <div class="runner-actions"><button type="button" class="runner-primary" data-action="done">${onDone ? 'Finalizar' : 'Volver a pescar'}</button></div>
        <details class="runner-tech"><summary>Datos técnicos</summary><dl data-role="end-tech"></dl></details>
      </div>
      <details class="runner-debug"><summary>Depuración · Ctrl + Mayús + D</summary><pre></pre></details>
    </section>`;

  const root = container.querySelector('.fishing-app');
  const $ = sel => root.querySelector(sel);
  const role = name => $(`[data-role="${name}"]`);
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const season = getSeason(subjectId);
  root.style.setProperty('--runner-sky', SEASONS[season].sky[0]);
  let scene;
  try { scene = new FishingScene($('.runner-canvas'), { season }); }
  catch { setText(role('status'), 'Tu navegador no puede dibujar el juego.'); return () => {}; }

  const engine = new FishingEngine(C);
  const audio = createAudio();
  const selector = new HandSelector(RUNNER_CONFIG.detectedHandLabel, RUNNER_CONFIG.pinch);
  const smoother = new HandSmoother({ emaAlpha: 0.6, maxLostFrames: 6 });
  const filter = new AngleFilter(C.angleAlpha, C.velocityAlpha);
  let phase = 'loading', disposed = false, raf = null, last = performance.now(), startedAt = null;
  let lastFrame = null, lastTrackedWall = null, trackedSince = null, pausedAt = null, pauses = 0, pausedMs = 0;
  let tracked = 0, attempted = 0, rawAngle = null, result = null, startWall = null;

  const camera = cameraFactory({ hand: RUNNER_CONFIG.detectedHandLabel, onFrame: receive,
    onStatus: m => { if (!disposed && phase === 'loading') setText(role('status'), m); },
    onError: m => { if (disposed) return; if (phase === 'playing' || phase === 'paused') finish(false); phase = 'error'; role('loading').hidden = false; setText(role('status'), m); } });

  function receive(frame) {
    if (disposed) return;
    lastFrame = frame;
    if (phase !== 'playing' && phase !== 'paused') return;
    attempted++;
    const sel = selector.select(frame), picked = sel.hand;
    if (sel.switched) { smoother.reset(); filter.reset(); } // otra mano: no mezclar
    const pts = smoother.smooth(picked?.landmarks ?? null);
    rawAngle = pts ? wristTilt(pts, frame.width, frame.height, C.extensionSign) : null;
    const angle = filter.update(rawAngle, frame.t);
    const now = performance.now();
    if (picked && angle !== null) { lastTrackedWall = now; trackedSince ??= now; tracked++; } else { trackedSince = null; return; }
    if (phase !== 'playing') return;
    startedAt ??= frame.t;
    for (const ev of engine.update({ t: frame.t, angle, velocity: filter.velocity, wrist: { x: picked.landmarks[0].x, y: picked.landmarks[0].y } })) {
      scene.onEvent(ev, engine);
      if (ev.type === 'cast') audio.jump();
      if (ev.type === 'bite') audio.count();
      if (ev.type === 'hooked') audio.go();
      if (ev.type === 'caught') audio.berry();
      if (ev.type === 'calibrated') audio.go();
      if (ev.type === 'done') finish(true);
    }
  }

  function instruction() {
    const th = engine.thresholds(), rel = engine.rel;
    switch (engine.phase) {
      case 'calib-rest': return 'Codo apoyado y mano de canto, relajada';
      case 'calib-up': return 'Ahora mueve la mano hacia fuera todo lo que puedas';
      case 'calib-down': return 'Y hacia dentro todo lo que puedas';
      case 'calib-return': return '¡Muy bien! Vuelve a dejarla relajada';
      case 'cast': return 'Mueve la mano hacia dentro para lanzar';
      case 'casting': return '';
      case 'wait': return rel >= th.neutralLo && rel <= th.neutralHi ? 'Mano relajada… espera a que pique' : 'Relaja la mano para que se acerque el pez';
      case 'bite': return '¡Pica! ¡Mano hacia fuera!';
      case 'reel': return engine.inBand ? '¡Así! Mantén la mano en la zona verde' : engine.bandSide < 0 ? 'Un poco más hacia fuera' : 'Un poco más hacia dentro';
      case 'caught': return CATCH_TEXT[engine.round?.fish] ?? '¡Pescado!';
      default: return '';
    }
  }

  function finish(completed) {
    if (result) return;
    result = summarize(engine, { subjectId, hand: RUNNER_CONFIG.patientHand, season, completed,
      durationMs: startedAt !== null && lastFrame ? Math.round(lastFrame.t - startedAt) : null,
      quality: { trackedCoverage: attempted ? Math.round(tracked / attempted * 1000) / 1000 : 0, pauses, pausedMs: Math.round(pausedMs) } });
    storeSession(result, SESSIONS_KEY);
    camera.stop();
    if (completed) audio.finish();
    phase = 'done';
    showEnd();
  }

  function fill(dl, rows) {
    dl.replaceChildren();
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
  }
  function showEnd() {
    role('pause').hidden = true; role('bubble').hidden = true; role('end').hidden = false;
    const s = result.summary, deg = v => (v === null || v === undefined ? '—' : `${Math.round(v)}°`);
    setText(role('end-title'), result.completed ? '¡Cubo lleno!' : 'Pesca interrumpida');
    fill(role('end-stats'), [['Peces', `${s.fishCaught} / ${s.fishTotal}`], ['Muñeca hacia fuera', deg(s.maxExtensionDeg)], ['Muñeca hacia dentro', deg(s.maxFlexionDeg)]]);
    const ms = v => (v === null ? '—' : `${v} ms`);
    fill(role('end-tech'), [
      ['Rango extensión (calibración)', deg(result.calibration.extensionRangeDeg)],
      ['Rango flexión (calibración)', deg(result.calibration.flexionRangeDeg)],
      ['Alcanza 15° (FMA estabilidad)', s.reachesFmaStability15 ? 'sí' : 'no'],
      ['Tiempo de reacción', ms(s.medianReactionMs)],
      ['Velocidad de extensión', s.medianPeakVelocityDegS === null ? '—' : `${s.medianPeakVelocityDegS} °/s`],
      ['Tiempo en zona al recoger', s.medianInBandRatio === null ? '—' : `${Math.round(s.medianInBandRatio * 100)} %`],
      ['Estabilidad (desv.)', s.medianHoldSdDeg === null ? '—' : `${s.medianHoldSdDeg}°`],
      ['Temblor', s.medianTremorDeg === null ? '—' : `${s.medianTremorDeg}°`],
      ['Fatiga (extensión)', s.fatigue.peakExtensionChangePct === null ? '—' : `${s.fatigue.peakExtensionChangePct} %`],
      ['Compensación con el brazo', `${s.compensationRounds} peces`],
      ['Mano detectada', `${Math.round(result.quality.trackedCoverage * 100)} %`],
    ]);
  }

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (phase === 'playing' && (lastTrackedWall === null ? now - (startWall ?? now) > 2500 : now - lastTrackedWall > C.pauseAfterLossMs)) {
      phase = 'paused'; pausedAt = now; pauses++; role('pause').hidden = false; role('bubble').hidden = true;
    } else if (phase === 'paused' && trackedSince !== null && now - trackedSince > 500) {
      pausedMs += now - pausedAt; phase = 'playing'; role('pause').hidden = true;
    }
    if (phase === 'playing') {
      const text = instruction();
      setText(role('bubble'), text); role('bubble').hidden = !text;
    }
    const handStatus = lastTrackedWall !== null && now - lastTrackedWall < 400 ? 'ready' : 'missing';
    scene.update(engine, phase === 'paused' ? 0 : dt, { hand: handStatus });
    scene.render();
    const debug = $('.runner-debug');
    if (debug.open) setText(debug.querySelector('pre'), JSON.stringify({ protocol: C.protocol, phase, enginePhase: engine.phase,
      rawAngle: rawAngle === null ? null : +rawAngle.toFixed(1), rel: +engine.rel.toFixed(1), velocity: +filter.velocity.toFixed(0),
      calib: { neutral: engine.calib.neutral && +engine.calib.neutral.toFixed(1), ext: engine.calib.extRange && +engine.calib.extRange.toFixed(1), flex: engine.calib.flexRange && +engine.calib.flexRange.toFixed(1) },
      thresholds: engine.thresholds(), inferenceMs: lastFrame?.latencyMs != null ? +lastFrame.latencyMs.toFixed(1) : null,
      detected: lastFrame?.hands.map(h => `${h.handedness} ${h.score.toFixed(2)}`) ?? [] }, null, 2));
  }

  const onResize = () => scene.resize();
  window.addEventListener('resize', onResize);
  const keydown = e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const d = $('.runner-debug'); d.open = !d.open; } };
  document.addEventListener('keydown', keydown);
  $('[data-action="done"]').addEventListener('click', () => {
    if (onDone) { cleanup(); onDone(result); return; }
    cleanup(); startFishingGame(container, { subjectId, onExit, onDone, cameraFactory });
  });
  $('[data-action="exit"]').addEventListener('click', () => {
    if (phase === 'playing' || phase === 'paused') finish(false);
    cleanup();
    if (onExit) onExit(); else startFishingGame(container, { subjectId, onExit, onDone, cameraFactory });
  });
  $('[data-action="mute"]').addEventListener('click', e => { e.currentTarget.textContent = `Sonido: ${audio.toggle() ? 'no' : 'sí'}`; });

  raf = requestAnimationFrame(loop);
  (async () => {
    const ok = await camera.start($('.runner-camera'));
    if (!disposed && ok && phase === 'loading') {
      setText(role('status'), '¡Listo!');
      setTimeout(() => { if (disposed) return; role('loading').hidden = true; phase = 'playing'; startWall = performance.now(); }, 1200);
    }
  })();

  root.fishingState = () => ({ phase, enginePhase: engine.phase, rel: engine.rel, calib: { ...engine.calib },
    thresholds: engine.thresholds(), roundIndex: engine.roundIndex, inBand: engine.inBand, result });

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
