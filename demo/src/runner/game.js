// «El Zorro de las Estaciones»: runner pixel controlado con la pinza pulgar–índice.
// Pinza = saltar. Mantener la pinza en el aire = salto alto.
// La cámara funciona oculta: nunca se muestra vídeo durante el juego.
// Ronda introductoria: ante el primer tronco el mundo se detiene (fase `tutorial`) y una
// mano animada enseña la pinza; la primera pinza real la quita y es el salto.

import './runner.css';
import { RUNNER_CONFIG as C, RUNNER_REASONS as REASONS } from './config.js';
import { HandSelector, measurePinch, PinchController } from './pinch.js';
import { buildCourse, createFox, startJump, stepFox, collides, touchesBerry, takeoffWindow, FOX_BOX, OBSTACLE } from './world.js';
import { RunnerSession } from './session.js';
import { createArt, SEASONS } from './art.js';
import { createAudio } from './audio.js';
import { getSeason, advanceSeason, storeSession } from './progress.js';
import { RunnerCamera } from './camera.js';
import { FramingTracker } from '../pack/framing.js';
import { setPixelScale } from '../pixel/sprite.js';
import { createGestureGuide } from '../tutorial/gestureGuide.js';
import { createPraise, createFloaters } from '../feedback/calm.js';
import { ReliabilityMeter } from '../vision/reliability.js';

const PRE_PLAY = ['title', 'loading', 'setup', 'armed', 'error'];

// `onComplete` (modo pack «El viaje del zorro»): sin pantallas de título ni final; empieza
// solo, no cambia la estación (lo hace el pack al final) y entrega el resultado al acabar.
export function startRunnerGame(container, { subjectId = null, onExit = null, onNext = null, onComplete = null, cameraFactory = options => new RunnerCamera(options) } = {}) {
  container.innerHTML = `
    <section class="runner-app">
      <canvas class="runner-canvas" width="${C.width}" height="${C.height}" aria-label="Zorro corriendo por el bosque"></canvas>
      <video class="runner-camera" autoplay muted playsinline aria-hidden="true"></video>
      <div class="runner-topbar">
        <button type="button" class="runner-chip" data-action="exit">${onExit ? '← Salir' : 'Reiniciar'}</button>
        <button type="button" class="runner-chip" data-action="mute">Sonido: sí</button>
        ${onNext || onComplete ? '<button type="button" class="runner-chip runner-chip--quiet" data-action="skip">Saltar →</button>' : ''}
      </div>
      <div class="runner-bubble" data-role="bubble" hidden></div>
      <div class="runner-countdown" data-role="countdown" hidden></div>

      <div class="runner-panel" data-panel="title">
        <p class="runner-kicker">FixedGap</p>
        <h1>El Zorro de las Estaciones</h1>
        <p>Ayuda al zorro a cruzar el bosque hasta su madriguera.</p>
        <p class="runner-howto"><strong>Junta pulgar e índice</strong> para que el zorro salte.</p>
        <p class="runner-note">Juega con la mano derecha.</p>
        <button type="button" class="runner-primary" data-action="start">Empezar</button>
        <p class="runner-season" data-role="season-label"></p>
      </div>

      <div class="runner-panel runner-panel--small" data-panel="setup" hidden>
        <canvas class="runner-hand-icon" width="17" height="18" aria-hidden="true"></canvas>
        <h2 data-role="setup-title">Preparando la cámara…</h2>
        <p data-role="setup-text">La primera vez puede tardar unos segundos.</p>
      </div>

      <div class="runner-panel runner-panel--small" data-panel="pause" hidden>
        <canvas class="runner-hand-icon" width="17" height="18" aria-hidden="true"></canvas>
        <h2>¡Te he perdido la mano!</h2>
        <p data-role="pause-text">Vuelve a poner la mano delante de la cámara.</p>
        <p class="runner-note">El zorro te espera. No cuenta como fallo.</p>
      </div>

      <div class="runner-panel" data-panel="end" hidden>
        <h1 data-role="end-title">¡El zorro ha llegado a casa!</h1>
        <p class="runner-season-change" data-role="end-season"></p>
        <dl class="runner-stats" data-role="end-stats"></dl>
        <p class="runner-note" data-role="end-quality"></p>
        <div class="runner-actions">
          ${onNext ? '<button type="button" class="runner-primary" data-action="next">Siguiente juego →</button>' : ''}
          <button type="button" class="${onNext ? 'runner-secondary' : 'runner-primary'}" data-action="again">Jugar otra vez</button>
          ${onExit && !onNext ? '<button type="button" class="runner-secondary" data-action="back">Volver</button>' : ''}
        </div>
        <details class="runner-tech"><summary>Datos técnicos</summary>
          <dl data-role="end-tech"></dl>
        </details>
      </div>

      <details class="runner-debug"><summary>Depuración · Ctrl + Mayús + D</summary><pre></pre></details>
    </section>`;

  const root = container.querySelector('.runner-app');
  const $ = sel => root.querySelector(sel);
  const role = name => $(`[data-role="${name}"]`);
  const panel = name => $(`[data-panel="${name}"]`);
  // Se dibuja directamente en el lienzo visible con escala ENTERA (todos los píxeles
  // del arte miden igual) y posiciones redondeadas a píxel de pantalla: movimiento suave.
  const canvas = $('.runner-canvas'), ctx = canvas.getContext('2d');
  const video = $('.runner-camera');
  if (!ctx) { root.textContent = 'Tu navegador no puede dibujar el juego.'; return () => {}; }
  // El ancho interno se adapta a la ventana (alto fijo de 180 px): sin bandas.
  const view = { width: C.width, height: C.height, groundY: C.groundY };
  const art = createArt(ctx, view);
  function fit() {
    // Encuadre: se ven `viewH` px de alto (se recorta el cielo de arriba) → todo más grande.
    const viewH = C.height - (C.cropTop ?? 0);
    const w = Math.round(viewH * root.clientWidth / Math.max(1, root.clientHeight));
    view.width = Math.max(C.minWidth, Math.min(C.maxWidth, w || C.width));
    view.top = C.cropTop ?? 0;
    // Escala entera limitada a 4: lienzo de ~1760×720 como máximo (repintar cada fotograma
    // un lienzo retina de 3500 px daba tirones). El navegador amplía el resto.
    const k = Math.min(4, Math.max(1, Math.ceil(root.clientHeight * (window.devicePixelRatio || 1) / viewH)));
    if (canvas.width !== view.width * k || canvas.height !== viewH * k) { canvas.width = view.width * k; canvas.height = viewH * k; }
    ctx.setTransform(k, 0, 0, k, 0, -view.top * k);
    ctx.imageSmoothingEnabled = false;
    setPixelScale(k);
  }
  fit();
  window.addEventListener('resize', fit);
  const iconArts = [...root.querySelectorAll('.runner-hand-icon')].map(c => {
    const ictx = c.getContext('2d');
    return ictx ? { ictx, art: createArt(ictx, { width: 17, height: 18, groundY: 18 }) } : null;
  }).filter(Boolean);
  const audio = createAudio();
  const guide = createGestureGuide(root);
  const praise = createPraise(root), floaters = createFloaters(); // ánimo tranquilo tras cada tronco
  const course = buildCourse(C);
  const idealOffset = takeoffWindow({ x: 0, w: OBSTACLE.w, h: OBSTACLE.h }, C)?.ideal ?? null;

  const hand = C.detectedHandLabel;
  const selector = new HandSelector(hand, C.pinch), controller = new PinchController(C.pinch);
  const framing = new FramingTracker(); // por qué se pierde la mano (cerca, borde, luz)
  const reliability = new ReliabilityMeter(); // fiabilidad de las medidas de la partida
  let season = getSeason(subjectId), nextSeason = season, seasonBlend = 0;
  let phase = 'title', disposed = false, raf = null, lastWall = performance.now(), t = 0;
  let measurement = { valid: false, eligible: false, ratio: null, reason: 'missing' };
  let pinchState = { state: 'acquiring', ready: false, held: false, event: null };
  let lastFrame = null, lastFrameWall = null, lastReadyWall = null, frameTimes = [], fps = 0;
  let session = null, result = null, gameMs = 0, scroll = 0, bgScroll = 0, fox = createFox();
  let obstacles = [], berries = [], sparkles = [];
  let setupSince = 0, finishX = course.finishX, countdownTimer = null, pausedAt = null, resumeAt = null, finishedAt = null, foxHidden = false;
  // Ronda introductoria: `tutorialJumps` saltos guiados ante los primeros troncos.
  let tutorialShown = false, tutorialJumps = 0, tutorialAt = null, tutorialMs = 0;

  const setText = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };
  const show = name => ['title', 'setup', 'pause', 'end'].forEach(n => { panel(n).hidden = n !== name; });
  const handStatus = () => (pinchState.held ? 'pinch' : pinchState.ready ? 'ready' : 'missing');
  setText(role('season-label'), `Estación del bosque: ${SEASONS[season].name}`);

  const camera = cameraFactory({ hand, onFrame: receive,
    onStatus: message => {
      if (disposed) return;
      if (phase === 'loading') setText(role('setup-text'), message);
      else if (phase === 'paused') setText(role('pause-text'), message); // p. ej. «Reconectando la cámara…»
    },
    onError: message => {
      if (disposed) return;
      if (['playing', 'tutorial', 'paused', 'finishing'].includes(phase)) finish(false);
      clearInterval(countdownTimer); controller.reset(); selector.reset();
      phase = 'error'; show('setup'); guide.hide();
      setText(role('setup-title'), 'No puedo usar la cámara');
      setText(role('setup-text'), message);
    } });

  function resetRun() {
    fox = createFox(); gameMs = 0; scroll = 0; sparkles = []; foxHidden = false; floaters.clear(); praise.hide(); reliability.reset();
    obstacles = course.obstacles.map(o => ({ ...o, hit: false, passed: false }));
    berries = course.berries.map(b => ({ ...b, taken: false }));
    tutorialShown = false; tutorialJumps = 0; tutorialAt = null; tutorialMs = 0; guide.hide();
    finishX = course.finishX; session = null; result = null; pausedAt = null; resumeAt = null; finishedAt = null;
    season = getSeason(subjectId); nextSeason = season; seasonBlend = 0;
    role('bubble').hidden = true;
  }

  async function begin() {
    audio.unlock();
    resetRun();
    phase = 'loading'; show('setup');
    setText(role('setup-title'), 'Preparando la cámara…');
    setText(role('setup-text'), 'La primera vez puede tardar unos segundos.');
    controller.reset(); selector.reset(hand); camera.hand = hand;
    frameTimes = []; fps = 0; lastFrame = null; lastFrameWall = null; lastReadyWall = null;
    const ok = await camera.start(video);
    if (disposed || phase !== 'loading') return;
    if (ok) { phase = 'setup'; setupSince = performance.now(); updateSetup(); }
  }

  function updateSetup() {
    if (phase === 'setup') {
      const reason = measurement.valid && measurement.eligible ? null : measurement.reason;
      if (pinchState.ready) { phase = 'armed'; }
      else if (!lastFrame) {
        setText(role('setup-title'), 'Esperando a la cámara…');
        setText(role('setup-text'), performance.now() - setupSince > 3000
          ? 'No me llegan imágenes. Cierra otras aplicaciones que usen la cámara (Zoom, Meet, FaceTime…) y pulsa Salir para reintentar.'
          : 'Un momento…');
      } else if (!lastFrame.hands.length && lastFrame.luminance < 12) {
        setText(role('setup-title'), 'La imagen está negra');
        setText(role('setup-text'), 'Destapa la cámara o comprueba que el navegador usa la cámara correcta.');
      } else {
        setText(role('setup-title'), 'Enséñame la mano');
        setText(role('setup-text'), reason === 'missing' ? framing.hint().text : reason ? REASONS[reason] ?? REASONS.missing :
          measurement.ratio < C.pinch.openRatio ? 'Separa pulgar e índice, con la palma hacia la pantalla.' : 'Mantén la mano quieta un momento…');
      }
    }
    if (phase === 'armed') {
      if (!pinchState.ready) { phase = 'setup'; return updateSetup(); }
      setText(role('setup-title'), '¡Te veo!');
      setText(role('setup-text'), 'Junta pulgar e índice para empezar.');
    }
  }

  function beginCountdown() {
    phase = 'countdown'; show(null);
    let n = C.countdownSeconds;
    const el = role('countdown');
    el.hidden = false; setText(el, String(n)); audio.count();
    countdownTimer = setInterval(() => {
      if (disposed) return;
      n--;
      if (n > 0) { setText(el, String(n)); audio.count(); return; }
      clearInterval(countdownTimer); countdownTimer = null;
      setText(el, '¡Ya!'); audio.go();
      setTimeout(() => { el.hidden = true; }, 600);
      session = new RunnerSession({ hand: C.patientHand, subjectId, season, startedAt: lastFrame?.t ?? 0, course, C });
      phase = 'playing';
    }, 800);
  }

  function receive(frame) {
    if (disposed) return;
    lastFrame = frame; lastFrameWall = performance.now();
    const hint = framing.update(frame);
    frameTimes.push(frame.t); if (frameTimes.length > 60) frameTimes.shift();
    const span = frameTimes.at(-1) - frameTimes[0];
    fps = span > 0 ? (frameTimes.length - 1) * 1000 / span : 0;
    const selected = selector.select(frame);
    if (selected.switched) controller.reset(); // otra mano: sin pinzas «heredadas»
    measurement = selected.hand ? measurePinch(selected.hand, frame, C.pinch)
      : { valid: false, eligible: false, ratio: null, reason: selected.reason };
    if (C.pinch.strictQuality && span >= 1000 && fps < C.pinch.minCaptureFps) measurement = { valid: false, eligible: false, ratio: null, reason: 'slow' };
    pinchState = controller.update(measurement, frame.t);
    if (pinchState.ready) lastReadyWall = lastFrameWall;
    if (session && ['playing', 'tutorial', 'paused', 'finishing'].includes(phase)) {
      session.addSample(frame, measurement, pinchState);
      reliability.add({ reason: selected.reason, handsInFrame: frame.hands?.length ?? 0, hint, hand: selected.hand, width: frame.width, height: frame.height });
    }

    const ev = pinchState.event;
    if (phase === 'setup' || phase === 'armed') updateSetup();
    if (ev?.type === 'grab') {
      if (phase === 'armed') beginCountdown();
      else if (phase === 'playing') tryJump();
      else if (phase === 'tutorial') endTutorial();
    }
    if (phase === 'paused') {
      setText(role('pause-text'), measurement.valid && measurement.eligible ? 'Separa pulgar e índice para seguir.' : framing.hint().text);
      if (pinchState.ready && resumeAt === null) resumeAt = performance.now() + C.resumeDelayMs;
      if (!pinchState.ready) resumeAt = null;
    }
  }

  function tryJump() {
    if (!startJump(fox, C)) return;
    const foxWorld = scroll + C.foxX;
    const target = obstacles.find(o => !o.passed && o.x + o.w > foxWorld + FOX_BOX.left && o.x - foxWorld < 170);
    session?.jump({ obstacleId: target?.id ?? null, gameMs, offsetPx: target ? foxWorld - target.x : null, idealPx: target ? idealOffset : null });
    audio.jump();
  }

  // Ronda introductoria: el mundo se para delante de cada uno de los primeros troncos y la
  // guía enseña la pinza; la pinza del paciente es el salto. Tras el último, sigue solo.
  const TUTORIAL_STEPS = [
    { kicker: 'Cómo se juega', title: 'Junta pulgar e índice para saltar', hint: 'Hazlo tú ahora: el zorro te espera.', done: '¡Eso es!' },
    { kicker: 'Una vez más', title: 'Otra vez: junta pulgar e índice', hint: 'Un salto más y sigues tú solo.', done: '¡Perfecto! Ahora tú solo' },
  ];
  function beginTutorial() {
    tutorialShown = true; phase = 'tutorial'; tutorialAt = performance.now();
    role('bubble').hidden = true;
    const total = C.tutorialJumps, i = Math.min(tutorialJumps, TUTORIAL_STEPS.length - 1), step = TUTORIAL_STEPS[i];
    guide.show({ gesture: 'pinch', kicker: step.kicker, title: step.title, hint: step.hint, align: 'right', step: total > 1 ? { index: tutorialJumps, total } : null });
  }
  // La pinza real quita la guía y es el salto que supera el tronco.
  function endTutorial() {
    tutorialMs += performance.now() - tutorialAt;
    const step = TUTORIAL_STEPS[Math.min(tutorialJumps, TUTORIAL_STEPS.length - 1)];
    tutorialJumps++;
    phase = 'playing';
    tryJump();
    void guide.success({ title: step.done });
  }

  function pause(reason) {
    phase = 'paused'; pausedAt = performance.now(); resumeAt = null;
    session?.pause(gameMs, reason);
    show('pause'); role('bubble').hidden = true;
  }

  function resume() {
    // Al volver, el siguiente obstáculo nunca está encima: se desplaza lo que queda
    // del recorrido para dar tiempo de reacción (no penaliza la pérdida de señal).
    const foxWorld = scroll + C.foxX;
    const next = obstacles.find(o => o.x > foxWorld + FOX_BOX.right);
    const delta = next ? Math.max(0, C.resumeClearance - (next.x - foxWorld)) : 0;
    if (delta) {
      for (const o of obstacles) if (o.x > foxWorld + FOX_BOX.right) o.x += delta;
      for (const b of berries) if (b.x > foxWorld) b.x += delta;
      finishX += delta;
    }
    session?.resume(performance.now() - pausedAt);
    phase = 'playing'; pausedAt = null; resumeAt = null; show(null);
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 50;
      sparkles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.3, size: Math.random() < 0.3 ? 2 : 1, color: colors[i % colors.length] });
    }
  }

  function stepPlay(dt) {
    gameMs += dt;
    const speed = C.speed * (fox.stumbleMs > 0 ? 0.55 : 1);
    scroll += speed * dt / 1000; bgScroll += speed * dt / 1000;
    stepFox(fox, dt, C);
    const foxWorld = scroll + C.foxX;
    const groundY = C.groundY;
    for (const o of obstacles) {
      if (o.passed) continue;
      if (!o.hit && collides(foxWorld, fox.y, o)) {
        o.hit = true; fox.stumbleMs = C.stumbleMs; fox.vy = Math.min(fox.vy, 0);
        session?.resolveObstacle(o.id, false); audio.hit(); praise.encourage();
      }
      if (foxWorld + FOX_BOX.left > o.x + o.w) {
        o.passed = true;
        session?.resolveObstacle(o.id, !o.hit);
        // Los troncos de la ronda guiada ya los celebra la guía («¡Eso es!»).
        if (!o.hit && !(tutorialShown && o.id < tutorialJumps)) {
          praise.cheer();
          floaters.spawn(o.x - scroll + o.w / 2, groundY - 14, { colors: ['#ffe9a8', '#ffffff', '#b5dd7a'] });
        }
      }
    }
    for (const b of berries) {
      if (!b.taken && touchesBerry(foxWorld, fox.y, b)) {
        b.taken = true; session?.berry(b.id); audio.berry();
        burst(b.x - scroll, groundY - b.y, 8, ['#d8263a', '#ffd84a', '#ffffff']);
      }
    }
    // Ronda introductoria: justo antes del primer tronco (dentro de la ventana de salto).
    const next = obstacles.find(o => !o.passed);
    if (next && tutorialJumps < C.tutorialJumps && next.id < C.tutorialJumps && fox.onGround && foxWorld - next.x >= C.tutorialOffsetPx) { beginTutorial(); return; }
    if (foxWorld >= finishX - 30) { phase = 'finishing'; role('bubble').hidden = true; }
  }

  function stepFinish(dt) {
    if (!foxHidden) {
      scroll += C.speed * dt / 1000; bgScroll += C.speed * dt / 1000;
      stepFox(fox, dt, C);
      if (scroll + C.foxX >= finishX + 2 && fox.onGround) {
        foxHidden = true; finishedAt = performance.now();
        audio.finish();
        burst(finishX - scroll + 4, C.groundY - 8, 20, ['#ffd84a', '#ffffff', '#e8742a']);
        finish(true);
      }
      return;
    }
    seasonBlend = Math.min(1, (performance.now() - finishedAt - 600) / 2200);
    if (seasonBlend >= 1 && phase === 'finishing') { phase = 'done'; showEnd(); }
  }

  function finish(completed) {
    if (!session || result) return;
    result = session.finish(lastFrame?.t ?? session.start, gameMs, completed);
    result.seasonName = SEASONS[season].name;
    result.quality.reliability = reliability.summary();
    result.tutorial = tutorialShown ? { gesture: 'pinch', jumps: tutorialJumps, obstacleIds: Array.from({ length: tutorialJumps }, (_, i) => i), shownMs: Math.round(tutorialMs) } : null;
    if (completed && !onComplete) nextSeason = advanceSeason(subjectId);
    result.nextSeason = nextSeason;
    storeSession(result);
    camera.stop();
    if (!completed) { phase = 'done'; showEnd(); }
  }

  function showEnd() {
    if (onComplete) { const r = result; cleanup(); onComplete({ result: r }); return; }
    show('end');
    const s = result.summary;
    setText(role('end-title'), result.completed ? '¡El zorro ha llegado a casa!' : 'Partida interrumpida');
    setText(role('end-season'), !result.completed ? 'Puedes volver a intentarlo cuando quieras.' :
      nextSeason !== season ? `El bosque cambia: de ${SEASONS[season].name} a ${SEASONS[nextSeason].name}.` : `El bosque está en pleno ${SEASONS[nextSeason].name.toLowerCase()}.`);
    fill(role('end-stats'), [
      ['Obstáculos superados', `${s.obstacles.cleared} / ${s.obstacles.total}`],
    ]);
    setText(role('end-quality'), result.quality.sufficient ? '' : 'Hubo momentos en los que no veía bien tu mano: estos datos son menos fiables.');
    const fmt = (v, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);
    fill(role('end-tech'), [
      ['Mano', result.hand === 'Right' ? 'derecha' : 'izquierda'],
      ['Ciclos de pinza', fmt(s.pinch.cycles)],
      ['Apertura mediana', fmt(s.pinch.medianAmplitudePalm, ' palmas')],
      ['Aperturas incompletas', s.pinch.openingsMeasured ? `${s.pinch.incompleteOpenings} de ${s.pinch.openingsMeasured}` : '—'],
      ['Velocidad de cierre', fmt(s.pinch.medianClosingSpeedPalmPerS, ' palmas/s')],
      ['Tiempo de cierre', fmt(s.pinch.medianClosingMs, ' ms')],
      ['Pinza cerrada', fmt(s.pinch.medianHoldMs, ' ms')],
      ['Error temporal', fmt(s.timing.medianAbsErrorMs, ' ms')],
      ['Variación de apertura (fatiga)', fmt(s.fatigue.amplitudeChangePct, ' %')],
      ['Señal utilizable', `${Math.round(result.quality.validCoverage * 100)} %`],
      ['Pausas', String(result.quality.pauses)],
    ]);
  }

  function fill(dl, rows) {
    dl.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v; dl.append(dt, dd);
    }
  }

  function render(dt) {
    const s = SEASONS[season];
    art.updateParticles(seasonBlend > 0.5 ? SEASONS[nextSeason] : s, dt / 1000);
    art.background(s, bgScroll);
    if (seasonBlend > 0) {
      ctx.globalAlpha = seasonBlend; art.background(SEASONS[nextSeason], bgScroll); ctx.globalAlpha = 1;
    }
    const active = !PRE_PLAY.includes(phase);
    if (active) {
      art.den(finishX - scroll, seasonBlend > 0.5 ? SEASONS[nextSeason] : s);
      for (const o of obstacles) {
        const x = o.x - scroll;
        if (x < -30 || x > view.width + 10) continue;
        const shake = o.hit && !o.passed ? Math.round(Math.sin(t * 40)) : 0;
        art.obstacle(o, x + shake, s, season);
      }
      for (const b of berries) {
        const x = b.x - scroll;
        if (!b.taken && x > -10 && x < view.width + 10) art.berry(x, C.groundY - b.y, t);
      }
    }
    if (!foxHidden) {
      art.fox(C.foxX, C.groundY - fox.y, { onGround: fox.onGround, vy: fox.vy, frame: Math.floor(bgScroll / 7) % 4,
        stumble: fox.stumbleMs > 0, landing: fox.landMs > 0, t });
    }
    art.sparkles(sparkles);
    floaters.draw(ctx, art.rect);
    art.drawParticles(t);
    if (active) {
      const total = finishX - C.foxX;
      art.hud({ progress: scroll / total, hand: handStatus() });
    }
    for (const { ictx, art: ia } of iconArts) { ictx.clearRect(0, 0, 17, 18); ia.handIcon(3, 3, handStatus()); }
    root.style.setProperty('--runner-sky', s.sky[0]);
  }

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(50, Math.max(0, now - lastWall));
    lastWall = now; t += dt / 1000;
    // Antes de jugar el fondo sigue vivo (el zorro corre sin obstáculos).
    if (PRE_PLAY.includes(phase) || phase === 'countdown') bgScroll += C.speed * 0.45 * dt / 1000;
    if (phase === 'playing') {
      const stale = lastReadyWall === null || now - lastReadyWall > C.pauseAfterLossMs;
      if (stale && fox.onGround) pause(lastFrameWall !== null && now - lastFrameWall > C.pinch.maxGapMs ? 'stalled' : measurement.reason);
      else stepPlay(dt);
    } else if (phase === 'paused') {
      if (resumeAt !== null && now >= resumeAt && pinchState.ready) resume();
    } else if (phase === 'finishing') stepFinish(dt);
    if (phase === 'setup' && !lastFrame) updateSetup();
    for (const p of sparkles) { p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vy += 120 * dt / 1000; p.life -= dt / 1000; }
    sparkles = sparkles.filter(p => p.life > 0);
    if (phase !== 'paused') floaters.update(dt / 1000);
    render(dt);
    drawDebug();
  }

  function drawDebug() {
    const debug = $('.runner-debug');
    if (!debug.open) return;
    setText(debug.querySelector('pre'), JSON.stringify({
      protocol: C.protocol, phase, hand, fps: +fps.toFixed(1), inferenceMs: lastFrame?.latencyMs != null ? +lastFrame.latencyMs.toFixed(1) : null, delegate: camera.delegate ?? null,
      video: lastFrame ? `${lastFrame.width}x${lastFrame.height}` : null, luminance: lastFrame ? Math.round(lastFrame.luminance) : null,
      detected: lastFrame?.hands.map(h => `${h.handedness} ${h.score.toFixed(2)}`) ?? [],
      reason: measurement.reason, ratio: measurement.ratio === null ? null : +measurement.ratio.toFixed(3),
      state: pinchState.state, held: pinchState.held, ready: pinchState.ready,
      closeRatio: C.pinch.closeRatio, releaseRatio: C.pinch.releaseRatio, openRatio: C.pinch.openRatio,
      fox: { y: +fox.y.toFixed(1) }, quality: measurement.quality ?? measurement.reason, strictQuality: C.pinch.strictQuality,
      season: SEASONS[season].name, cycles: session?.cycles.length ?? 0, allowPartialHand: C.pinch.allowPartialHand,
    }, null, 2));
  }

  function exitToTitle() {
    clearInterval(countdownTimer); countdownTimer = null;
    camera.stop(); controller.reset(); selector.reset();
    pinchState = { state: 'acquiring', ready: false, held: false, event: null };
    role('countdown').hidden = true;
    resetRun(); phase = 'title'; show('title');
    setText(role('season-label'), `Estación del bosque: ${SEASONS[season].name}`);
  }

  // --- Eventos de interfaz ---
  $('[data-action="start"]').addEventListener('click', () => { void begin(); });
  $('[data-action="again"]').addEventListener('click', () => { exitToTitle(); void begin(); });
  $('[data-action="back"]')?.addEventListener('click', () => { cleanup(); onExit(); });
  // Secuencia: al terminar el zorro (o al saltarlo) se pasa al siguiente juego.
  $('[data-action="next"]')?.addEventListener('click', () => { const r = result; cleanup(); onNext({ result: r }); });
  $('[data-action="skip"]')?.addEventListener('click', () => {
    if (['playing', 'tutorial', 'paused', 'finishing'].includes(phase)) finish(false);
    clearInterval(countdownTimer);
    const r = result; cleanup();
    if (onComplete) onComplete({ result: r, skipped: true }); else onNext({ result: r, skipped: true });
  });
  $('[data-action="exit"]').addEventListener('click', () => {
    if (['playing', 'tutorial', 'paused', 'finishing'].includes(phase)) finish(false);
    if (onExit) { cleanup(); onExit(); return; }
    exitToTitle();
  });
  $('[data-action="mute"]').addEventListener('click', e => { e.currentTarget.textContent = `Sonido: ${audio.toggle() ? 'no' : 'sí'}`; });
  const keydown = e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const d = $('.runner-debug'); d.open = !d.open; }
  };
  document.addEventListener('keydown', keydown);

  resetRun();
  raf = requestAnimationFrame(loop);
  if (onComplete) { show(null); void begin(); }

  // Ganchos para pruebas automáticas (solo lectura).
  root.runnerState = () => ({ phase, season, nextSeason, fox: { ...fox }, gameMs, scroll, result,
    obstacles: obstacles.map(o => ({ id: o.id, kind: o.kind, x: o.x, w: o.w, hit: o.hit, passed: o.passed })) });

  function cleanup() {
    if (disposed) return;
    disposed = true;
    clearInterval(countdownTimer);
    if (raf !== null) cancelAnimationFrame(raf);
    camera.stop(); audio.close(); guide.dispose(); praise.dispose();
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('resize', fit);
  }
  return cleanup;
}
