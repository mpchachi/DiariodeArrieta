import './pinch.css';
import { PINCH_CONFIG as C, PINCH_REASONS as REASONS } from './pinchConfig.js';
import { HandSelector, measurePinch, PinchController, PinchSession } from './pinchLogic.js';
import { PinchCamera } from './pinchCamera.js';
import { createPastilleroBoard } from './pinchBoard.js';

export function startPinchGame(container, { subjectId = null, onExit = null, cameraFactory = options => new PinchCamera(options) } = {}) {
  container.innerHTML = `
    <section class="pinch-app">
      <canvas id="main" class="pinch-table" data-role="stage" aria-label="Pastillero original: bandeja de pastillas y compartimentos de lunes a domingo"></canvas>
      <aside class="pinch-hud">
        <h1>Pastillero</h1>
        <div class="pinch-hud-row"><span>Colocadas</span><strong data-role="count">0 / ${C.targetRepetitions}</strong></div>
        <div class="pinch-hud-row"><span data-role="step">Preparación</span><span data-role="object-label">Pastilla señalada</span></div>
        <p class="pinch-destination" data-role="destination"></p>
      </aside>
      <button type="button" class="pinch-exit" data-action="exit">${onExit ? 'Volver a sujetos' : 'Detener cámara'}</button>
      <div class="pinch-help">
        <p class="pinch-instruction" data-role="instruction" role="status" aria-live="polite">Junta pulgar e índice para coger la pastilla señalada. Sepáralos para colocarla.</p>
        <div class="pinch-actions"><button type="button" class="pinch-primary" data-action="start">Activar cámara</button>
          <button type="button" data-action="stop" hidden>Terminar prueba</button></div>
      </div>
      <aside class="pinch-observation">
        <fieldset class="pinch-hand"><legend>Mano</legend>
          <label><input type="radio" name="pinch-hand" value="Right" checked> Derecha</label>
          <label><input type="radio" name="pinch-hand" value="Left"> Izquierda</label></fieldset>
        <div class="pinch-video-wrap"><video autoplay muted playsinline aria-label="Tu mano en espejo"></video><canvas aria-hidden="true"></canvas>
          <div class="pinch-video-empty">Tu cámara</div></div>
        <p class="pinch-quality" data-role="quality">No necesitas apuntar ni arrastrar.</p>
      </aside>
      <section class="pinch-result" hidden><div class="pinch-result-card"><h2 data-role="result-title"></h2><p data-role="result-description"></p>
        <dl data-role="result-data"></dl><button type="button" data-action="export">Exportar prueba JSON</button>
        <button type="button" data-action="dismiss-result">Volver al pastillero</button></div></section>
      <details class="pinch-debug"><summary>Depuración · Ctrl + Mayús + D</summary>
        <p>Separación de yemas / longitud de palma. Líneas discontinuas: umbrales.</p>
        <label class="pinch-record"><input type="checkbox" data-role="record"> Incluir landmarks en el JSON (sin vídeo)</label>
        <svg viewBox="0 0 500 110" aria-label="Señal de pinza" role="img"><path class="pinch-trace"/><path class="pinch-thresholds"/></svg>
        <pre></pre><p>Protocolo ${C.protocol}. Colocación automática: no mide puntería ni genera puntuación clínica. Solo exportación local; sin envíos al historial anterior.</p></details>
    </section>`;
  const root = container.querySelector('.pinch-app');
  const role = name => root.querySelector(`[data-role="${name}"]`);
  const action = name => root.querySelector(`[data-action="${name}"]`);
  const video = root.querySelector('video'), canvas = root.querySelector('.pinch-video-wrap canvas');
  let board;
  try { board = createPastilleroBoard(role('stage')); }
  catch {
    role('instruction').textContent = 'No se pudo abrir la escena 3D. Activa la aceleración gráfica del navegador y recarga.';
    action('start').disabled = true;
    action('exit').addEventListener('click', () => onExit?.());
    return () => {};
  }
  role('destination').textContent = board.destination;
  const startButton = action('start'), stopButton = action('stop');
  const radios = [...root.querySelectorAll('[name="pinch-hand"]')];
  const selector = new HandSelector('Right'), controller = new PinchController();
  let selectedHand = 'Right', phase = 'off', disposed = false, lastFrame = null, lastWall = null;
  let measurement = { valid: false, reason: 'missing' }, state = { state: 'acquiring', event: null };
  let session = null, result = null, countdownTimer = null, countdown = 0, trialStartWall = null;
  let frameTimes = [], plot = [], fps = 0, stalled = false;
  const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const nowInVideo = () => lastFrame ? lastFrame.t + Math.max(0, performance.now() - lastWall) : 0;
  const camera = cameraFactory({ hand: selectedHand,
    onFrame: receive,
    onStatus: message => { if (!disposed) text(role('instruction'), message); },
    onError: message => {
      if (disposed) return;
      if (phase === 'playing') finish(false);
      clearCountdown(); controller.reset(); selector.reset(); phase = 'off';
      setControls(); text(role('instruction'), message); text(role('quality'), 'Cámara detenida.');
    },
  });

  function setControls() {
    const busy = phase === 'playing' || phase === 'countdown' || phase === 'loading';
    radios.forEach(input => { input.disabled = busy; });
    role('record').disabled = busy;
    startButton.disabled = phase === 'loading' || phase === 'countdown' || phase === 'playing' ||
      (phase === 'acquiring' && !state.ready);
    text(startButton, phase === 'off' || phase === 'done' ? (result ? 'Repetir prueba' : 'Activar cámara') :
      phase === 'loading' ? 'Preparando cámara…' : phase === 'countdown' ? 'Prepárate…' : phase === 'playing' ? 'Prueba en curso' : 'Empezar');
    stopButton.hidden = phase !== 'playing' && phase !== 'countdown';
  }
  function clearCountdown() { if (countdownTimer !== null) clearInterval(countdownTimer); countdownTimer = null; }
  function cancelCountdown() {
    clearCountdown(); phase = 'acquiring'; controller.reset(); state = { state: 'acquiring', ready: false };
    text(role('step'), 'Preparación'); text(role('instruction'), 'Recuperemos la posición antes de empezar.'); setControls();
  }
  async function activate() {
    phase = 'loading'; lastFrame = null; lastWall = null; frameTimes = []; plot = []; fps = 0; stalled = false;
    controller.reset(); selector.reset(selectedHand); state = { ready: false, state: 'acquiring' };
    text(role('step'), 'Preparación'); text(role('object-label'), 'Una pastilla cada vez');
    role('stage').classList.remove('held');
    setControls();
    const ready = await camera.start(video);
    if (disposed || phase !== 'loading') return;
    if (ready) { phase = 'acquiring'; text(role('instruction'), 'Muestra la mano y separa suavemente pulgar e índice.'); }
    else phase = 'off';
    setControls();
  }
  function beginCountdown() {
    if (!state.ready || lastWall === null || performance.now() - lastWall > C.maxGapMs) return;
    phase = 'countdown'; countdown = C.countdownSeconds;
    text(role('instruction'), `Empezamos en ${countdown}. Mantén separados pulgar e índice.`);
    text(role('step'), 'Cuenta atrás'); setControls();
    countdownTimer = setInterval(() => {
      if (disposed || phase !== 'countdown') { clearCountdown(); return; }
      if (!measurement.valid || !measurement.eligible || !state.ready || performance.now() - lastWall > C.maxGapMs) { cancelCountdown(); return; }
      countdown--;
      if (countdown > 0) { text(role('instruction'), `Empezamos en ${countdown}. Mantén separados pulgar e índice.`); return; }
      clearCountdown();
      session = new PinchSession(selectedHand, subjectId, lastFrame.t, role('record').checked);
      session.add({ ...lastFrame, hands: lastFrame.hands.filter(h => h.handedness === selectedHand) }, measurement, { ...state, event: null });
      result = null; root.querySelector('.pinch-result').hidden = true;
      board.reset(); text(role('destination'), board.destination);
      text(role('count'), `0 / ${board.total}`);
      phase = 'playing'; trialStartWall = performance.now(); controller.openAt = lastFrame.t;
      text(role('step'), 'Pastilla 1'); text(role('instruction'), 'Junta las yemas de pulgar e índice para coger.');
      setControls();
    }, 1000);
  }
  function receive(frame) {
    if (disposed || !['loading', 'acquiring', 'countdown', 'playing'].includes(phase)) return;
    lastFrame = frame; lastWall = performance.now(); stalled = false;
    frameTimes.push(frame.t); if (frameTimes.length > 60) frameTimes.shift();
    const span = frameTimes.at(-1) - frameTimes[0];
    fps = span > 0 ? (frameTimes.length - 1) * 1000 / span : 0;
    const selected = selector.select(frame);
    measurement = selected.hand ? measurePinch(selected.hand, frame) : { valid: false, eligible: false, ratio: null, reason: selected.reason };
    if (span >= 1000 && fps < C.minCaptureFps) measurement = { valid: false, eligible: false, ratio: null, reason: 'slow' };
    state = controller.update(measurement, frame.t);
    plot.push({ t: frame.t, ratio: measurement.valid ? measurement.ratio : null });
    while (plot.length && plot[0].t < frame.t - 5000) plot.shift();
    drawCamera(frame, selected.hand);
    text(role('quality'), measurement.valid && measurement.eligible ?
      `${selectedHand === 'Right' ? 'Derecha' : 'Izquierda'} reconocida · ${state.held ? 'Pinza reconocida' : 'Mano visible'}` : REASONS[measurement.reason] || 'Recuperando señal.');
    if (phase === 'countdown' && (!measurement.valid || !measurement.eligible || !state.ready)) cancelCountdown();
    if (phase === 'acquiring') {
      const message = !measurement.valid || !measurement.eligible ? REASONS[measurement.reason] :
        state.ready ? 'Listo. Pulsa Empezar.' : measurement.ratio < C.openRatio ? 'Separa suavemente pulgar e índice para preparar la pinza.' : 'Mantén la mano visible un momento.';
      text(role('instruction'), message);
      setControls();
    }
    if (phase === 'playing') {
      if (state.event?.type === 'grab' && !board.grab()) state = { ...state, event: null };
      if (state.event?.type === 'release' && !board.release()) state = { ...state, event: null };
      if (!state.held && state.event?.type !== 'release') board.cancelGrab();
      session.add({ ...frame, hands: selected.hand ? [selected.hand] : [] }, measurement, state);
      role('stage').classList.toggle('held', state.held);
      text(role('object-label'), state.held ? 'Cogida' : 'Pastilla señalada');
      if (state.event?.type === 'release') {
        const count = board.placed;
        text(role('count'), `${count} / ${board.total}`);
        text(role('destination'), board.destination);
        if (count >= board.total) { finish(true); return; }
        text(role('step'), `Pastilla ${count + 1}`);
      }
      text(role('instruction'), !measurement.valid || !measurement.eligible ? REASONS[measurement.reason] :
        state.held ? 'Cogida. Separa las yemas para colocarla en el pastillero.' :
          state.state === 'acquiring' ? 'Separa pulgar e índice para continuar. No se ha colocado ninguna pastilla.' : 'Junta las yemas para coger la pastilla señalada.');
    }
    drawDebug();
  }
  function finish(completed) {
    if (!session || phase !== 'playing') return;
    result = { ...session.finish(nowInVideo(), completed), placedPills: board.placed, totalPills: board.total, assistedPlacement: true };
    board.cancelGrab();
    phase = 'done'; camera.stop(); clearCountdown();
    role('stage').classList.remove('held');
    text(role('step'), completed ? 'Prueba completada' : 'Prueba interrumpida');
    text(role('instruction'), completed ? 'Has terminado. Puedes repetir o exportar la prueba.' : 'Prueba detenida. Puedes exportar el registro parcial o repetir.');
    text(role('quality'), 'Cámara detenida.');
    text(role('result-title'), `${board.placed} pastillas colocadas`);
    text(role('result-description'), `${result.quality.sufficient ? 'La captura superó los controles técnicos de cobertura y huecos.' : 'La captura tuvo pérdidas o calidad insuficiente; revisa el registro y repite.'} No es una puntuación clínica.`);
    const data = role('result-data'); data.replaceChildren();
    const rows = [['Tiempo', `${(result.durationMs / 1000).toFixed(1)} s`],
      ['Señal utilizable', `${(result.quality.validCoverage * 100).toFixed(0)} %`],
      ['Repeticiones interrumpidas', String(result.interruptedRepetitions)],
      ['Excursión mediana', result.medianExcursionPalmLengths === null ? 'No estimable' : `${result.medianExcursionPalmLengths.toFixed(2)} longitudes de palma`]];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; data.append(dt, dd);
    }
    root.querySelector('.pinch-result').hidden = false;
    setControls(); drawDebug();
  }
  function drawCamera(frame, hand) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = frame.width; canvas.height = frame.height;
    video.parentElement.style.aspectRatio = `${frame.width} / ${frame.height}`;
    root.querySelector('.pinch-video-empty').hidden = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#9aa8ad'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    const margin = C.edgeMargin;
    ctx.strokeRect(frame.width * margin, frame.height * margin, frame.width * (1 - 2 * margin), frame.height * (1 - 2 * margin));
    ctx.setLineDash([]);
    if (!hand || !measurement.valid) return;
    const a = hand.landmarks[4], b = hand.landmarks[8];
    ctx.strokeStyle = state.held ? '#315b75' : '#ffffff'; ctx.fillStyle = '#315b75'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x * frame.width, a.y * frame.height); ctx.lineTo(b.x * frame.width, b.y * frame.height); ctx.stroke();
    for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x * frame.width, p.y * frame.height, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  function drawDebug() {
    const debug = root.querySelector('.pinch-debug');
    if (!debug.open) return;
    text(debug.querySelector('pre'), JSON.stringify({ protocol: C.protocol, phase, state: state.state,
      selectedHand, fps: +fps.toFixed(1), inferenceMs: lastFrame?.latencyMs?.toFixed(1) ?? null,
      delegate: camera.delegate, reason: measurement.reason, ratio: measurement.ratio ?? null,
      depthRatio: measurement.depthRatio ?? null, palmPixels: measurement.palmPixels ?? null,
      closeRatio: C.closeRatio, openRatio: C.openRatio, completed: session?.repetitions.length ?? 0 }, null, 2));
    const t0 = (plot.at(-1)?.t ?? 5000) - 5000;
    const y = value => 100 - Math.min(2, Math.max(0, value)) * 45;
    let d = '', connected = false;
    for (const p of plot) {
      if (p.ratio === null) { connected = false; continue; }
      d += `${connected ? 'L' : 'M'}${((p.t - t0) / 10).toFixed(1)},${y(p.ratio).toFixed(1)} `; connected = true;
    }
    debug.querySelector('.pinch-trace').setAttribute('d', d);
    debug.querySelector('.pinch-thresholds').setAttribute('d', `M0,${y(C.closeRatio)} H500 M0,${y(C.openRatio)} H500`);
  }

  const watchdog = setInterval(() => {
    if (disposed) return;
    if (lastWall !== null && performance.now() - lastWall > C.maxGapMs && !stalled && ['acquiring', 'countdown', 'playing'].includes(phase)) {
      stalled = true; controller.reset(); selector.reset(); state = { state: 'acquiring', ready: false };
      measurement = { valid: false, eligible: false, ratio: null, reason: 'stalled' };
      if (phase === 'countdown') cancelCountdown();
      if (phase === 'playing') session.add({ ...lastFrame, t: nowInVideo(), hands: [] }, measurement, state);
      board.cancelGrab(); role('stage').classList.remove('held'); text(role('object-label'), 'Esperando señal');
      text(role('instruction'), 'No recibo imágenes nuevas. Recupera la cámara; no se contará una repetición.');
      text(role('quality'), 'Señal interrumpida.'); setControls(); drawDebug();
    }
    if (phase === 'playing' && performance.now() - trialStartWall >= C.maxTrialMs) finish(false);
  }, 100);
  startButton.addEventListener('click', () => {
    if (phase === 'off' || phase === 'done') void activate();
    else if (phase === 'acquiring') beginCountdown();
  });
  stopButton.addEventListener('click', () => { if (phase === 'playing') finish(false); else if (phase === 'countdown') cancelCountdown(); });
  radios.forEach(input => input.addEventListener('change', () => {
    selectedHand = input.value; camera.hand = selectedHand; selector.reset(selectedHand); controller.reset();
    state = { state: 'acquiring', ready: false }; if (phase === 'acquiring') setControls();
  }));
  action('dismiss-result').addEventListener('click', () => { root.querySelector('.pinch-result').hidden = true; });
  action('export').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${C.protocol}-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  action('exit').addEventListener('click', () => {
    if (phase === 'playing') finish(false);
    if (onExit) { cleanup(); onExit(); return; }
    camera.stop(); clearCountdown(); phase = 'off'; controller.reset(); state = { ready: false, state: 'acquiring' };
    text(role('instruction'), 'Cámara detenida.'); setControls();
  });
  const keydown = e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault(); const debug = root.querySelector('.pinch-debug'); debug.open = !debug.open; drawDebug();
  } };
  document.addEventListener('keydown', keydown);
  root.querySelector('.pinch-debug').addEventListener('toggle', drawDebug);
  function cleanup() {
    if (disposed) return;
    disposed = true; camera.stop(); board.dispose(); clearCountdown(); clearInterval(watchdog); document.removeEventListener('keydown', keydown);
  }
  return cleanup;
}
