// Escenario de la mano: un lienzo con la mano gris 3D haciendo un gesto en bucle.
// Lo usan la guía de gesto (tarjeta en mitad del juego) y las transiciones del viaje
// (tarjeta de capítulo). Dibuja con WebGL (superficie continua) y, si no hay WebGL,
// con cápsulas 2D en un lienzo nuevo.
//
//   const stage = createHandStage(hostElement, { gesture: 'pinch' });
//   stage.set({ gesture: 'fist' });   // cambia de gesto (recalcula el encaje)
//   stage.freeze();                   // congela la pose actual
//   stage.dispose();

import { ANATOMY, gestureFrame, GESTURES } from './handModel.js';
import { fitLayout, renderHand } from './handRender.js';
import { createHandRenderer, fitPoints } from './handGL.js';

export const STAGE_PX = 232; // lado por defecto del lienzo (px CSS)

export function createHandStage(host, { gesture = 'pinch', mirror = false, className = 'fg-guide__hand', size = STAGE_PX } = {}) {
  let canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = size; canvas.height = size;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  let ctx = null, dpr = 1, raf = null, start = 0, frozenMs = 0, layout = null;
  let running = false, frozen = false, disposed = false;
  let gl = createHandRenderer(canvas);
  if (!gl) {
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh); canvas = fresh;
    ctx = canvas.getContext('2d');
  }

  // El tamaño CSS lo decide la hoja de estilos (más pequeño en pantallas bajas).
  function resizeCanvas() {
    const css = canvas.clientWidth || size;
    // El trazado por rayos es caro: con WebGL se limita la densidad a ×2.
    dpr = Math.min(gl ? 2 : 3, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (layout?.size !== css) layout = null;
    return css;
  }

  function computeLayout(css) {
    const g = GESTURES[gesture];
    const frames = Array.from({ length: 36 }, (_, i) => gestureFrame(gesture, g.periodMs * i / 36, { mirror }))
      .map(f => ({ points: fitPoints(f.points) }));
    layout = fitLayout(frames, css);
  }

  function loop(now) {
    if (disposed || !running) return;
    raf = requestAnimationFrame(loop);
    if (!ctx && !gl) return;
    if (!layout || (canvas.clientWidth && canvas.clientWidth !== layout.size)) computeLayout(resizeCanvas());
    const frame = gestureFrame(gesture, frozen ? frozenMs : now - start, { mirror });
    if (gl && !gl.lost) gl.render(frame, layout, dpr);
    else if (ctx) renderHand(ctx, frame, layout, ANATOMY);
    else { gl = null; ctx = null; } // contexto perdido: se deja de dibujar
  }

  const stage = {
    get canvas() { return canvas; },
    get gesture() { return gesture; },
    get mirror() { return mirror; },
    // Cambia de gesto o de lado. Devuelve true si cambió algo.
    set({ gesture: name = gesture, mirror: m = mirror } = {}) {
      const changed = name !== gesture || m !== mirror;
      gesture = name; mirror = m; frozen = false;
      const css = resizeCanvas();
      if (changed || !layout) computeLayout(css);
      return changed;
    },
    start() {
      if (disposed || running) return;
      running = true; frozen = false; start = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (raf !== null) cancelAnimationFrame(raf); raf = null;
    },
    // Congela la mano en la pose actual (para la marca de confirmación).
    freeze() { frozen = true; frozenMs = performance.now() - start; },
    dispose() {
      disposed = true; stage.stop();
      gl?.dispose(); gl = null; ctx = null;
      canvas?.remove(); canvas = null;
    },
  };
  stage.set({ gesture, mirror });
  return stage;
}
