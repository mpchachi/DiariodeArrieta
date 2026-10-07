// El zorro en globo (motor del Flappy de FlappyVaina). Cierra el puño para encender
// el quemador y subir; ábrelo para bajar. Mismo detector de puño 3D y métricas; cámara
// oculta compartida con el Runner. Versión fácil: sin game over y recorrido fijo.

import '../runner/runner.css';
import { FLAPPY_CONFIG as C } from './config.js';
import { mapLandmarks, HandSmoother, measureFist, measureFistCurl } from './fist.js';
import { FlappyEngine } from './engine.js';
import { PixelFlappyScene } from './pixelScene.js';
import { FlappySession } from './session.js';
import { HandSelector } from '../runner/pinch.js';
import { RUNNER_CONFIG } from '../runner/config.js';
import { RunnerCamera } from '../runner/camera.js';
import { storeSession, getSeason } from '../runner/progress.js';
import { createAudio } from '../runner/audio.js';
import { SEASONS } from '../pixel/seasons.js';
import { FramingTracker } from '../pack/framing.js';

const SESSIONS_KEY = 'fixedgap_flappy_sessions';

// `onComplete`: modo pack (sin pantallas de título ni final; entrega el resultado al acabar).
export function startFlappyGame(container, { subjectId = null, onExit = null, onDone = null, onNext = null, onComplete = null,
  cameraFactory = options => new RunnerCamera(options) } = {}) {
  container.innerHTML = `
    <section class="runner-app flappy-app">
      <canvas class="runner-canvas" aria-label="El zorro vuela en globo sobre el bosque"></canvas>
      <video class="runner-camera" autoplay muted playsinline aria-hidden="true"></video>
      <div class="runner-topbar">
        <button type="button" class="runner-chip" data-action="exit">${onExit ? '← Salir' : 'Reiniciar'}</button>
        <button type="button" class="runner-chip" data-action="mute">Sonido: sí</button>
        ${onNext || onComplete ? '<button type="button" class="runner-chip runner-chip--quiet" data-action="skip">Saltar →</button>' : ''}
      </div>
      <div class="runner-bubble" data-role="bubble" hidden></div>
      <div class="runner-countdown" data-role="countdown" hidden></div>
      <div class="runner-panel runner-panel--small" data-role="loading">
        <p class="runner-kicker">FixedGap</p>
        <h1>El zorro en globo</h1>
        <p class="runner-howto"><strong>Cierra el puño</strong> para encender el fuego y subir.<br><strong>Abre la mano</strong> para bajar.</p>
        <p class="runner-note" data-role="status">Preparando la cámara…</p>
      </div>
      <div class="runner-panel runner-panel--small" data-role="pause" hidden>
        <h2>¡Te he perdido la mano!</h2>
        <p data-role="pause-hint">Vuelve a ponerla delante de la cámara.</p>
        <p class="runner-note">El globo te espera. No cuenta como fallo.</p>
      </div>
      <div class="runner-panel" data-role="end" hidden>
        <h1 data-role="end-title">¡Vuelo completado!</h1>
        <dl class="runner-stats">
          <dt>Pasos superados</dt><dd data-role="end-score"></dd>
          <dt>Choques</dt><dd data-role="end-hits"></dd>
        </dl>
        <div class="runner-actions">${onNext ? '<button type="button" class="runner-primary" data-action="next">Siguiente juego →</button>' : ''}<button type="button" class="${onNext ? 'runner-secondary' : 'runner-primary'}" data-action="done">${onDone ? 'Finalizar' : 'Volver a intentarlo'}</button></div>
        <details class="runner-tech"><summary>Datos técnicos</summary><dl data-role="end-tech"></dl></details>
      </div>
      <details class="runner-debug"><summary>Depuración · Ctrl + Mayús + D</summary><pre></pre></details>
    </section>`;

  const root = container.querySelector('.flappy-app');
  const $ = sel => root.querySelector(sel);
  const role = name => $(`[data-role="${name}"]`);
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const season = getSeason(subjectId);
  root.style.setProperty('--runner-sky', SEASONS[season].sky[0]);
  if (onComplete) role('loading').hidden = true;
  let scene;
  try { scene = new PixelFlappyScene($('.runner-canvas'), { season }); }
  catch { setText(role('status'), 'Tu navegador no puede dibujar el juego.'); return () => {}; }

  const engine = new FlappyEngine(C);
  const audio = createAudio();
  const framing = new FramingTracker();
  // Siempre la mano derecha del paciente (ver RUNNER_CONFIG.detectedHandLabel).
  const hand = RUNNER_CONFIG.detectedHandLabel;
  const selector = new HandSelector(hand, RUNNER_CONFIG.pinch);
  const smoother = new HandSmoother(C.fist), worldSmoother = new HandSmoother(C.fist, 1);
  let phase = 'loading', disposed = false, raf = null, last = performance.now(), playMs = 0;
  let strength = 0, fist = null, lastTrackedWall = null, trackedSince = null, lastFrame = null;
  let session = null, result = null, countdownTimer = null, pausedAt = null, bubbleUntil = 0;

  const camera = cameraFactory({ hand, onFrame: receive,
    onStatus: m => { if (disposed) return; if (phase === 'loading') setText(role('status'), m); else if (phase === 'paused') setText(role('pause-hint'), m); },
    onError: m => { if (disposed) return; if (phase === 'playing' || phase === 'paused') finish(false); phase = 'error'; role('loading').hidden = false; setText(role('status'), m); } });

  function receive(frame) {
    if (disposed) return;
    lastFrame = frame;
    // En pausa, explica por qué no se ve la mano (demasiado cerca, en el borde, poca luz).
    const hint = framing.update(frame);
    if (phase === 'paused') setText(role('pause-hint'), hint.ok ? 'Mantén la mano así un momento…' : hint.text);
    const sel = selector.select(frame), picked = sel.hand;
    if (sel.switched) { smoother.reset(); worldSmoother.reset(); } // otra mano: no mezclar
    const smoothed = smoother.smooth(picked ? mapLandmarks(picked.landmarks) : null);
    const world = worldSmoother.smooth(picked?.world ?? null);
    // Control = puño real en 3D; el ratio del detector original se sigue registrando.
    const legacy = smoothed ? measureFist(smoothed, C.fist) : null;
    const curl = world ? measureFistCurl(world, C.fist) : null;
    fist = curl?.valid ? { ...curl, averageRatio: legacy?.averageRatio ?? null, legacyStrength: legacy?.strength ?? null } : legacy;
    strength = fist?.strength ?? 0;
    const now = performance.now();
    if (picked) { lastTrackedWall = now; trackedSince ??= now; } else trackedSince = null;
    session?.log(frame.t, engine.state.status === 'playing' && phase === 'playing' ? 'playing' : phase,
      { fistStrength: strength, averageRatio: fist?.averageRatio, legacyStrength: fist?.legacyStrength ?? fist?.strength, planeY: engine.state.planeY, tracked: !!picked });
  }

  function bubble(text, ms) { setText(role('bubble'), text); role('bubble').hidden = false; bubbleUntil = performance.now() + ms; }

  function beginCountdown() {
    phase = 'countdown';
    role('loading').hidden = true;
    let n = C.countdownSeconds;
    const el = role('countdown');
    el.hidden = false; setText(el, String(n)); audio.count();
    bubble('Prepárate para cerrar el puño', C.countdownSeconds * 1000);
    countdownTimer = setInterval(() => {
      if (disposed) return;
      n--;
      if (n > 0) { setText(el, String(n)); audio.count(); return; }
      if (n === 0) { setText(el, '¡A volar!'); audio.go(); return; }
      clearInterval(countdownTimer); countdownTimer = null;
      el.hidden = true;
      engine.start();
      session = new FlappySession({ hand: RUNNER_CONFIG.patientHand, subjectId, startedAt: lastFrame?.t ?? 0, C });
      phase = 'playing';
      bubble('¡Cierra el puño para encender el fuego y subir!', 6000);
    }, 1000);
  }

  function finish(completed) {
    if (!session || result) return;
    result = session.finish(lastFrame?.t ?? session.start, completed, engine.state);
    result.season = season;
    storeSession(result, SESSIONS_KEY);
    camera.stop();
    if (completed) audio.finish();
    phase = 'done';
    // Modo pack: al completar, pequeña celebración y se pasa al siguiente capítulo.
    if (onComplete) { if (completed) { const r = result; role('bubble').hidden = true; setTimeout(() => { if (disposed) return; cleanup(); onComplete({ result: r }); }, 1800); } return; }
    showEnd();
  }

  function showEnd() {
    role('pause').hidden = true; role('bubble').hidden = true; role('end').hidden = false;
    const s = result.summary, m = result.metrics;
    setText(role('end-title'), result.completed ? '¡Vuelo completado!' : 'Vuelo interrumpido');
    setText(role('end-score'), `${s.columns.cleared} / ${s.columns.total}`);
    setText(role('end-hits'), String(s.columns.hits));
    const dl = role('end-tech'); dl.replaceChildren();
    const pct = v => `${Math.round(v * 100)} %`;
    for (const [k, v] of [['Extensión (mín. fuerza)', pct(m.maxExtension)], ['Flexión (máx. fuerza)', pct(m.maxFlexion)],
      ['Activaciones', String(m.activationCount)], ['Fatiga (pico final − inicial)', pct(m.fatigueIndex)],
      ['Jerk medio', m.smoothnessJerk.toFixed(1)], ['Mano detectada', pct(result.quality.trackedCoverage)], ['Pausas', String(result.quality.pauses)]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd);
    }
  }

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (phase === 'playing') {
      if (lastTrackedWall === null || now - lastTrackedWall > C.pauseAfterLossMs) {
        phase = 'paused'; pausedAt = now; session.pause(lastFrame?.t ?? 0, 'missing'); role('pause').hidden = false; role('bubble').hidden = true;
      } else {
        playMs += dt * 1000;
        const ev = engine.update(strength, dt);
        for (const id of ev.passed) {
          const col = engine.state.columns.find(c => c.id === id);
          session.column(id, { passed: true, hit: col.hit });
          if (!col.hit) audio.berry();
        }
        if (ev.hit !== null) { session.column(ev.hit, { hit: true }); audio.hit(); }
        if (ev.floor) session.floor();
        if (ev.finished) finish(true);
        if (playMs > 9000 && playMs < 9100 && !engine.state.columns[0].passed) bubble('Abre la mano para bajar', 4000);
      }
    } else if (phase === 'paused' && trackedSince !== null && now - trackedSince > 500) {
      session.resume(now - pausedAt); phase = 'playing'; role('pause').hidden = true;
    }
    if (!role('bubble').hidden && now > bubbleUntil) role('bubble').hidden = true;
    const handStatus = lastTrackedWall !== null && now - lastTrackedWall < 400 ? (strength > 0.5 ? 'fist' : 'open') : 'missing';
    scene.setInput({ strength: phase === 'playing' || phase === 'countdown' ? strength : 0, hand: handStatus });
    scene.update(engine.state, phase === 'paused' ? 0 : dt);
    scene.render();
    const debug = $('.runner-debug');
    if (debug.open) setText(debug.querySelector('pre'), JSON.stringify({ protocol: C.protocol, phase, strength: +strength.toFixed(3),
      averageRatio: fist?.averageRatio != null ? +fist.averageRatio.toFixed(3) : null, legacyStrength: fist?.legacyStrength ?? null,
      fingers: fist?.fingers?.map(f => `${Math.round(f.mcp)}/${Math.round(f.pip)}/${Math.round(f.dip)}`) ?? null, detected: lastFrame?.hands.map(h => `${h.handedness} ${h.score.toFixed(2)}`) ?? [],
      planeY: +engine.state.planeY.toFixed(3), hits: engine.state.hits, inferenceMs: lastFrame?.latencyMs != null ? +lastFrame.latencyMs.toFixed(1) : null, delegate: camera.delegate ?? null }, null, 2));
  }

  const onResize = () => scene.resize();
  window.addEventListener('resize', onResize);
  const keydown = e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const d = $('.runner-debug'); d.open = !d.open; } };
  document.addEventListener('keydown', keydown);
  $('[data-action="done"]').addEventListener('click', () => {
    if (onDone) { cleanup(); onDone(result); return; }
    cleanup(); startFlappyGame(container, { subjectId, onExit, onDone, onNext, cameraFactory });
  });
  $('[data-action="exit"]').addEventListener('click', () => {
    if (phase === 'playing' || phase === 'paused') finish(false);
    cleanup();
    if (onExit) onExit(); else startFlappyGame(container, { subjectId, onExit, onDone, onNext, cameraFactory });
  });
  $('[data-action="next"]')?.addEventListener('click', () => { const r = result; cleanup(); onNext({ result: r }); });
  $('[data-action="skip"]')?.addEventListener('click', () => {
    if (phase === 'playing' || phase === 'paused') finish(false);
    const r = result; cleanup();
    if (onComplete) onComplete({ result: r, skipped: true }); else onNext({ result: r, skipped: true });
  });
  $('[data-action="mute"]').addEventListener('click', e => { e.currentTarget.textContent = `Sonido: ${audio.toggle() ? 'no' : 'sí'}`; });

  raf = requestAnimationFrame(loop);
  (async () => {
    const ok = await camera.start($('.runner-camera'));
    if (!disposed && ok && phase === 'loading') beginCountdown();
  })();

  root.flappyState = () => ({ phase, strength, fist, engine: engine.state, result });

  function cleanup() {
    if (disposed) return;
    disposed = true;
    clearInterval(countdownTimer);
    if (raf !== null) cancelAnimationFrame(raf);
    camera.stop(); scene.dispose(); audio.close();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', keydown);
  }
  return cleanup;
}
