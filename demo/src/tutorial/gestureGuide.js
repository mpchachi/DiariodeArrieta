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
import { createHandStage } from './handStage.js';

const SUCCESS_MS = 950;
const OUT_MS = 260;

export function createGestureGuide(root) {
  let el = null, stage = null;
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
          <div class="fg-guide__check" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48"><path d="M13 25.5l7.2 7L35 17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </div>
        <h2 class="fg-guide__title" data-role="guide-title"></h2>
        <p class="fg-guide__hint" data-role="guide-hint"></p>
        <div class="fg-guide__dots" data-role="guide-dots" hidden></div>
      </div>`;
    root.appendChild(el);
    const host = el.querySelector('.fg-guide__stage');
    stage = createHandStage(host);
    host.prepend(stage.canvas); // el lienzo debajo de la marca verde
  }

  const text = (name, value) => { const n = el.querySelector(`[data-role="${name}"]`); if (n.textContent !== value) n.textContent = value; };

  return {
    get visible() { return visible; },
    // `gesture`: pinch | fist | grip | tilt. `step`: { index, total } para guías de varios pasos.
    // `align`: center | left | right (lado de la pantalla donde va la tarjeta).
    show({ gesture, title, hint = '', kicker = 'Cómo se juega', mirror = false, step = null, align = 'center' }) {
      if (disposed) return;
      mount();
      el.classList.toggle('fg-guide--left', align === 'left');
      el.classList.toggle('fg-guide--right', align === 'right');
      clearTimeout(hideTimer); hideTimer = null;
      ending = false;
      const changed = stage.set({ gesture, mirror });
      text('guide-kicker', kicker); text('guide-title', title); text('guide-hint', hint);
      const dots = el.querySelector('[data-role="guide-dots"]');
      dots.hidden = !step;
      if (step) dots.innerHTML = Array.from({ length: step.total }, (_, i) => `<i class="${i < step.index ? 'is-done' : i === step.index ? 'is-current' : ''}"></i>`).join('');
      el.classList.remove('is-out', 'is-done');
      el.hidden = false;
      // Al cambiar de paso, pequeño rebote del escenario para marcar el cambio.
      const host = el.querySelector('.fg-guide__stage');
      if (visible && changed) { host.classList.remove('is-swap'); void host.offsetWidth; host.classList.add('is-swap'); }
      if (!visible) { visible = true; requestAnimationFrame(() => el?.classList.add('is-in')); stage.start(); }
    },
    // El paciente ha hecho el gesto: marca verde y se desvanece. Resuelve al ocultarse.
    success({ title = '¡Eso es!' } = {}) {
      if (!visible || ending) return Promise.resolve();
      ending = true; stage.freeze(); // congela la mano en la pose actual
      el.classList.add('is-done');
      text('guide-title', title); text('guide-hint', '');
      return new Promise(resolve => { hideTimer = setTimeout(() => { this.hide(); resolve(); }, SUCCESS_MS); });
    },
    hide() {
      if (!visible) return;
      visible = false; ending = false;
      stage.stop();
      el.classList.remove('is-in'); el.classList.add('is-out');
      const node = el;
      setTimeout(() => { if (node === el && !visible) el.hidden = true; }, OUT_MS);
    },
    dispose() {
      disposed = true; this.hide(); clearTimeout(hideTimer);
      stage?.dispose(); stage = null;
      el?.remove(); el = null;
    },
  };
}
