// Guía de gesto: tarjeta que aparece la primera vez que el juego pide el gesto, con una
// mano gris animada en bucle haciendo el movimiento y una frase corta. Se retira sola
// en cuanto el paciente lo hace (con una marca de confirmación). No tiene botones: los
// chips de la barra inferior (Salir, Saltar) siguen pulsables por debajo.
//
//   const guide = createGestureGuide(root);
//   guide.show({ gesture: 'pinch', title: 'Junta pulgar e índice para saltar' });
//   ... cuando el gesto se detecta:
//   await guide.success();   // marca verde y se desvanece

import './tutorial.css';
import { ANATOMY, gestureFrame, GESTURES } from './handModel.js';
import { fitLayout, renderHand } from './handRender.js';
import { createHandRenderer, fitPoints } from './handGL.js';

const STAGE_PX = 232; // lado del escenario de la mano (px CSS)
const SUCCESS_MS = 950;
const OUT_MS = 260;

export function createGestureGuide(root) {
  let el = null, canvas = null, ctx = null, gl = null, dpr = 1, raf = null, start = 0, frozenMs = 0, layout = null, gesture = null, mirror = false;
  let visible = false, ending = false, disposed = false, hideTimer = null;

  function mount() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'fg-guide';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="fg-guide__card">
        <p class="fg-guide__kicker" data-role="guide-kicker">Cómo se juega</p>
        <div class="fg-guide__stage">
          <canvas class="fg-guide__hand" width="${STAGE_PX}" height="${STAGE_PX}" aria-hidden="true"></canvas>
          <div class="fg-guide__check" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48"><path d="M13 25.5l7.2 7L35 17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </div>
        <h2 class="fg-guide__title" data-role="guide-title"></h2>
        <p class="fg-guide__hint" data-role="guide-hint"></p>
        <div class="fg-guide__dots" data-role="guide-dots" hidden></div>
      </div>`;
    root.appendChild(el);
    canvas = el.querySelector('canvas');
    // Mano 3D con WebGL (superficie continua). Si no hay WebGL, cápsulas 2D en un
    // lienzo nuevo (un lienzo con contexto WebGL ya no admite el 2D).
    gl = createHandRenderer(canvas);
    if (!gl) {
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh); canvas = fresh;
      ctx = canvas.getContext('2d');
    }
  }

  // El tamaño CSS lo decide la hoja de estilos (más pequeño en pantallas bajas).
  function resizeCanvas() {
    const css = canvas.clientWidth || STAGE_PX;
    // El trazado por rayos es caro: con WebGL se limita la densidad a ×2.
    dpr = Math.min(gl ? 2 : 3, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (layout?.size !== css) layout = null;
    return css;
  }

  function computeLayout(size) {
    const g = GESTURES[gesture];
    const frames = Array.from({ length: 36 }, (_, i) => gestureFrame(gesture, g.periodMs * i / 36, { mirror }))
      .map(f => ({ points: fitPoints(f.points) }));
    layout = fitLayout(frames, size);
  }

  function loop(now) {
    if (disposed || !visible) return;
    raf = requestAnimationFrame(loop);
    if (!ctx && !gl) return;
    if (canvas.clientWidth && canvas.clientWidth !== layout.size) computeLayout(resizeCanvas());
    const frame = gestureFrame(gesture, ending ? frozenMs : now - start, { mirror });
    if (gl && !gl.lost) gl.render(frame, layout, dpr);
    else if (ctx) renderHand(ctx, frame, layout, ANATOMY);
    else { gl = null; ctx = null; } // contexto perdido: se deja de dibujar
  }

  const text = (name, value) => { const n = el.querySelector(`[data-role="${name}"]`); if (n.textContent !== value) n.textContent = value; };

  return {
    get visible() { return visible; },
    // `gesture`: pinch | fist | grip | tilt. `step`: { index, total } para guías de varios pasos.
    // `align`: center | left | right (lado de la pantalla donde va la tarjeta).
    show({ gesture: name, title, hint = '', kicker = 'Cómo se juega', mirror: m = false, step = null, align = 'center' }) {
      if (disposed) return;
      mount();
      el.classList.toggle('fg-guide--left', align === 'left');
      el.classList.toggle('fg-guide--right', align === 'right');
      clearTimeout(hideTimer); hideTimer = null;
      const changed = name !== gesture || m !== mirror;
      gesture = name; mirror = m; ending = false;
      const size = resizeCanvas();
      if (changed || !layout) computeLayout(size);
      text('guide-kicker', kicker); text('guide-title', title); text('guide-hint', hint);
      const dots = el.querySelector('[data-role="guide-dots"]');
      dots.hidden = !step;
      if (step) dots.innerHTML = Array.from({ length: step.total }, (_, i) => `<i class="${i < step.index ? 'is-done' : i === step.index ? 'is-current' : ''}"></i>`).join('');
      el.classList.remove('is-out', 'is-done');
      el.hidden = false;
      // Al cambiar de paso, pequeño rebote del escenario para marcar el cambio.
      const stage = el.querySelector('.fg-guide__stage');
      if (visible && changed) { stage.classList.remove('is-swap'); void stage.offsetWidth; stage.classList.add('is-swap'); }
      if (!visible) { visible = true; start = performance.now(); requestAnimationFrame(() => el?.classList.add('is-in')); raf = requestAnimationFrame(loop); }
    },
    // El paciente ha hecho el gesto: marca verde y se desvanece. Resuelve al ocultarse.
    success({ title = '¡Eso es!' } = {}) {
      if (!visible || ending) return Promise.resolve();
      ending = true; frozenMs = performance.now() - start; // congela la mano en la pose actual
      el.classList.add('is-done');
      text('guide-title', title); text('guide-hint', '');
      return new Promise(resolve => { hideTimer = setTimeout(() => { this.hide(); resolve(); }, SUCCESS_MS); });
    },
    hide() {
      if (!visible) return;
      visible = false; ending = false;
      if (raf !== null) cancelAnimationFrame(raf); raf = null;
      el.classList.remove('is-in'); el.classList.add('is-out');
      const node = el;
      setTimeout(() => { if (node === el && !visible) el.hidden = true; }, OUT_MS);
    },
    dispose() {
      disposed = true; this.hide(); clearTimeout(hideTimer);
      gl?.dispose(); gl = null;
      el?.remove(); el = null; canvas = null; ctx = null;
    },
  };
}
