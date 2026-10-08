// «El viaje del zorro»: los tres juegos como un solo juego en tres capítulos.
//   inicio (mano) → capítulo 1 (pinza) → capítulo 2 (puño) → capítulo 3 (giro) → final
// Entre capítulos, una transición automática (sin botones): el zorro corre por el
// bosque mientras una tarjeta presenta el capítulo y su gesto; a los pocos segundos
// empieza solo. Misma cámara, misma estación y mismo bosque durante todo el viaje;
// la estación avanza al terminar el viaje completo.

import '../runner/runner.css';
import './pack.css';
import { startRunnerGame } from '../runner/game.js';
import { startFlappyGame } from '../flappy/game.js';
import { startGardenGame } from '../garden/game.js';
import { createSharedCamera } from './sharedCamera.js';
import { TravelScene } from './travel.js';
import { FramingTracker } from './framing.js';
import { createHandStage } from '../tutorial/handStage.js';
import { uploadJourney } from '../database/uploadJourney.js';
import { getSeason, advanceSeason } from '../runner/progress.js';
import { SEASONS } from '../pixel/seasons.js';

// `gesture`: el que anima la mano gris en la tarjeta de transición (misma mano que la guía
// dentro del juego, para que el paciente lo vea antes y lo reconozca después).
export const CHAPTERS = [
  { key: 'runner', short: 'La carrera', title: 'La carrera por el bosque', gesture: 'pinch', howto: '<strong>Junta pulgar e índice</strong> para que el zorro salte.' },
  { key: 'flappy', short: 'El globo', title: 'El vuelo en globo', gesture: 'fist', howto: '<strong>Cierra el puño</strong> para subir. <strong>Ábrelo</strong> para bajar.' },
  { key: 'garden', short: 'El huerto', title: 'El huerto del zorro', gesture: 'tilt', howto: 'Cierra la mano como si cogieras una regadera e <strong>inclínala</strong> para regar.' },
];
const INTERLUDE_MS = 6500;
const HAND_KEY = 'fixedgap_garden_hand';

// `saveJourney`: guarda el viaje en Supabase al terminar (inyectable en pruebas).
export function startFoxJourney(container, { subjectId = null, onExit = null, onDone = null, createCamera = createSharedCamera, saveJourney = uploadJourney } = {}) {
  const camera = createCamera();
  const season = getSeason(subjectId);
  const results = {};
  let stopCurrent = null, timer = null, disposed = false, hand = null, startedAt = null;

  const clear = () => { clearTimeout(timer); timer = null; stopCurrent?.(); stopCurrent = null; };
  const exit = () => { dispose(); onExit?.(); };

  // Pantalla del viaje (inicio, transición o final) con el bosque y el zorro corriendo.
  function screen(inner, { running = true } = {}) {
    clear();
    container.innerHTML = `
      <section class="runner-app pack-app">
        <canvas class="runner-canvas" aria-hidden="true"></canvas>
        <video class="runner-camera" autoplay muted playsinline aria-hidden="true"></video>
        <div class="runner-topbar"><button type="button" class="runner-chip" data-action="exit">${onExit ? '← Salir' : 'Reiniciar'}</button></div>
        ${inner}
      </section>`;
    const root = container.querySelector('.pack-app');
    root.style.setProperty('--runner-sky', SEASONS[season].sky[0]);
    camera.attach(root.querySelector('.runner-camera'));
    const travel = new TravelScene(root.querySelector('.runner-canvas'), { season, running });
    stopCurrent = () => travel.stop();
    root.querySelector('[data-action="exit"]').addEventListener('click', () => (onExit ? exit() : restart()));
    return root;
  }

  const steps = current => `<ol class="pack-steps">${CHAPTERS.map((c, i) =>
    `<li class="${i < current ? 'is-done' : i === current ? 'is-current' : ''}"><span>${i < current ? '✓' : i + 1}</span>${c.short}</li>`).join('')}</ol>`;

  function intro() {
    let saved = 'Right';
    try { saved = localStorage.getItem(HAND_KEY) === 'Left' ? 'Left' : 'Right'; } catch { /* sin almacenamiento */ }
    const root = screen(`
      <div class="runner-panel pack-card">
        <p class="runner-kicker">FixedGap</p>
        <h1>El viaje del zorro</h1>
        <p>Acompaña al zorro en tres pequeñas aventuras. Dura unos dos minutos.</p>
        ${steps(-1)}
        <p class="runner-note">¿Con qué mano vas a jugar?</p>
        <div class="runner-actions">
          <button type="button" class="${saved === 'Left' ? 'runner-primary' : 'runner-secondary'}" data-hand="Left">Mano izquierda</button>
          <button type="button" class="${saved === 'Right' ? 'runner-primary' : 'runner-secondary'}" data-hand="Right">Mano derecha</button>
        </div>
      </div>`);
    root.querySelectorAll('[data-hand]').forEach(b => b.addEventListener('click', () => {
      hand = b.dataset.hand;
      try { localStorage.setItem(HAND_KEY, hand); } catch { /* sin almacenamiento */ }
      void camera.start();
      framing();
    }));
  }

  // Comprobación de encuadre (única pantalla con vista de la cámara; nunca durante el
  // juego). La mano falla sobre todo si está demasiado cerca o cortada por el borde.
  function framing() {
    const root = screen(`
      <div class="runner-panel pack-card pack-card--framing">
        <p class="runner-kicker">Antes de empezar</p>
        <h1>Coloca la mano</h1>
        <div class="pack-preview"><canvas width="320" height="240" aria-label="Vista de la cámara"></canvas></div>
        <p class="pack-hint" data-role="hint">Preparando la cámara…</p>
        <p class="runner-note">Siéntate a un brazo del portátil y levanta la mano delante de la pantalla.</p>
        <button type="button" class="runner-link" data-action="skip-framing">Continuar sin comprobar</button>
      </div>`, { running: false });
    const video = root.querySelector('.runner-camera'), canvas = root.querySelector('.pack-preview canvas'), g = canvas.getContext('2d');
    const hintEl = root.querySelector('[data-role="hint"]'), tracker = new FramingTracker();
    let okSince = null, raf = null, frames = 0;
    const proxy = camera({ hand: 'Right', onFrame: f => { frames++; tracker.update(f); } });
    void proxy.start(video);
    const done = () => { if (!disposed) interlude(0); };
    const draw = now => {
      raf = requestAnimationFrame(draw);
      const hint = frames ? tracker.hint() : { ok: false, text: 'Preparando la cámara…' };
      if (hintEl.textContent !== hint.text) hintEl.textContent = hint.text;
      hintEl.classList.toggle('is-ok', hint.ok);
      g.save(); g.fillStyle = '#2a1b17'; g.fillRect(0, 0, 320, 240);
      if (video.readyState >= 2) { g.translate(320, 0); g.scale(-1, 1); g.drawImage(video, 0, 0, 320, 240); }
      g.restore();
      // Zona recomendada y caja de la mano.
      g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,248,236,0.8)'; g.strokeRect(320 * 0.22, 240 * 0.12, 320 * 0.56, 240 * 0.76);
      g.setLineDash([]);
      const b = tracker.detected ? tracker.box : null;
      if (b) { g.strokeStyle = hint.ok ? '#6cc04f' : '#e8742a'; g.lineWidth = 4; g.strokeRect(b.x0 * 320, b.y0 * 240, b.w * 320, b.h * 240); }
      okSince = hint.ok ? okSince ?? now : null;
      if (okSince !== null) {
        const p = Math.min(1, (now - okSince) / 1500);
        g.fillStyle = '#6cc04f'; g.fillRect(0, 234, 320 * p, 6);
        if (p >= 1) { cancelAnimationFrame(raf); raf = null; done(); }
      }
    };
    raf = requestAnimationFrame(draw);
    const travelStop = stopCurrent;
    stopCurrent = () => { if (raf !== null) cancelAnimationFrame(raf); proxy.stop(); travelStop?.(); };
    root.querySelector('[data-action="skip-framing"]').addEventListener('click', done);
  }

  function interlude(i) {
    const c = CHAPTERS[i];
    const root = screen(`
      <div class="runner-panel pack-card pack-card--interlude">
        <p class="runner-kicker">Capítulo ${i + 1} de ${CHAPTERS.length}</p>
        <h1>${c.title}</h1>
        <div class="pack-gesture">
          <div class="pack-gesture__stage" aria-hidden="true"></div>
          <p class="runner-howto pack-gesture__text">${c.howto}</p>
        </div>
        ${steps(i)}
        <div class="pack-bar" style="--pack-ms:${INTERLUDE_MS}ms"><span></span></div>
      </div>`);
    // La misma mano gris de la guía, haciendo el gesto del capítulo en bucle. En el
    // huerto el giro va hacia el lado de verter de la mano elegida.
    const stage = createHandStage(root.querySelector('.pack-gesture__stage'), { gesture: c.gesture, mirror: c.key === 'garden' && hand === 'Left', size: 176, className: 'pack-gesture__hand' });
    stage.start();
    const travelStop = stopCurrent;
    stopCurrent = () => { stage.dispose(); travelStop?.(); };
    timer = setTimeout(() => play(i), INTERLUDE_MS);
  }

  function play(i) {
    clear();
    startedAt ??= new Date().toISOString();
    const next = ({ result }) => {
      results[CHAPTERS[i].key] = result ?? null;
      if (disposed) return;
      if (i + 1 < CHAPTERS.length) interlude(i + 1); else finale();
    };
    const common = { subjectId, onExit: onExit ? exit : restart, onComplete: next, cameraFactory: camera };
    stopCurrent = i === 0 ? startRunnerGame(container, common)
      : i === 1 ? startFlappyGame(container, common)
      : startGardenGame(container, { ...common, hand });
  }

  function finale() {
    const r = results, from = SEASONS[season].name;
    const completed = CHAPTERS.every(c => r[c.key]?.completed);
    const to = completed ? SEASONS[advanceSeason(subjectId)].name : from;
    const rows = [
      ['La carrera', r.runner ? `${r.runner.summary.obstacles.cleared} / ${r.runner.summary.obstacles.total} troncos` : '—'],
      ['El globo', r.flappy ? `${r.flappy.summary.columns.cleared} / ${r.flappy.summary.columns.total} pasos` : '—'],
      ['El huerto', r.garden ? `${r.garden.summary.flowersBloomed} / ${r.garden.summary.flowersTotal} flores` : '—'],
    ];
    // Acceso directo al dashboard del paciente (comodidad para el piloto, no es el flujo final).
    const dashboardUrl = subjectId ? `${import.meta.env.BASE_URL}dashboard/patient/${encodeURIComponent(subjectId)}` : null;
    const root = screen(`
      <div class="runner-panel pack-card">
        <p class="runner-kicker">El viaje del zorro</p>
        <h1>${completed ? '¡Viaje completado!' : 'Viaje terminado'}</h1>
        ${steps(CHAPTERS.length)}
        <dl class="runner-stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <p class="runner-season-change">${to !== from ? `El bosque cambia: de ${from} a ${to}.` : ''}</p>
        ${subjectId ? '<p class="pack-save" data-role="save">Guardando resultados…</p>' : ''}
        <div class="runner-actions">
          ${dashboardUrl ? '<button type="button" class="runner-primary" data-action="dashboard">Ver en el dashboard</button>' : ''}
          <button type="button" class="${dashboardUrl ? 'runner-secondary' : 'runner-primary'}" data-action="done">${onDone ? 'Volver a pacientes' : 'Volver a jugar'}</button>
        </div>
        ${subjectId ? '<button type="button" class="runner-link" data-action="retry" hidden>Reintentar guardado</button>' : ''}
      </div>`);
    camera.dispose();
    const saveEl = root.querySelector('[data-role="save"]'), retryBtn = root.querySelector('[data-action="retry"]');
    let saving = null, saved = false;
    const save = () => {
      if (!subjectId || saved || saving) return saving;
      saveEl.textContent = 'Guardando resultados…'; saveEl.className = 'pack-save'; if (retryBtn) retryBtn.hidden = true;
      saving = Promise.resolve(saveJourney({ subjectId, startedAt, hand, results }))
        .catch(e => ({ ok: false, error: String(e?.message ?? e) }))
        .then(res => {
          saving = null;
          if (res?.ok) { saved = true; saveEl.textContent = '✓ Resultados guardados en la ficha del paciente.'; saveEl.className = 'pack-save is-ok'; }
          else { saveEl.textContent = `No se han podido guardar los resultados: ${res?.error ?? 'error desconocido'}`; saveEl.className = 'pack-save is-error'; if (retryBtn) retryBtn.hidden = false; }
          return res;
        });
      return saving;
    };
    void save();
    retryBtn?.addEventListener('click', () => { void save(); });
    // Antes de salir se espera a que termine el guardado (nunca se pierde una sesión por salir rápido).
    const leave = async go => { const btns = root.querySelectorAll('.runner-actions button'); btns.forEach(b => { b.disabled = true; }); await saving; go(); };
    root.querySelector('[data-action="dashboard"]')?.addEventListener('click', () => leave(() => { dispose(); window.location.href = dashboardUrl; }));
    root.querySelector('[data-action="done"]').addEventListener('click', () => leave(() => {
      if (onDone) { dispose(); onDone(results); } else restart();
    }));
    container.foxJourney.saved = () => saved;
  }

  function restart() { dispose(); startFoxJourney(container, { subjectId, onExit, onDone, createCamera, saveJourney }); }
  function dispose() { disposed = true; clear(); camera.dispose(); }

  intro();
  container.foxJourney = { state: () => ({ results, hand }) };
  return dispose;
}
