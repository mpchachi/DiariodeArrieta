// Una sola cámara para todo «El viaje del zorro»: no se reinicia entre capítulos (sin
// esperas ni nuevo permiso). Cada juego recibe un «proxy» con la misma interfaz que
// RunnerCamera; el <video> real se mueve al DOM de la pantalla activa (en la misma
// tarea, así el navegador no lo pausa) y los fotogramas van solo al juego activo.

import { RunnerCamera } from '../runner/camera.js';

export function createSharedCamera() {
  const video = document.createElement('video');
  video.className = 'runner-camera'; video.autoplay = true; video.muted = true; video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  let target = null, startPromise = null;
  const real = new RunnerCamera({ hand: 'Right',
    onFrame: f => target?.onFrame?.(f),
    onStatus: m => target?.onStatus?.(m),
    onError: m => { startPromise = null; target?.onError?.(m); } });

  // Coloca el vídeo en lugar de `slot` (el <video class="runner-camera"> de cada pantalla).
  const attach = slot => {
    if (slot && slot !== video && slot.isConnected) slot.replaceWith(video);
    video.play?.().catch(() => {});
  };
  const ensureStarted = () => {
    startPromise ??= real.start(video).then(ok => { if (!ok) startPromise = null; return ok; });
    return startPromise;
  };

  const factory = options => ({
    hand: options.hand,
    get delegate() { return real.delegate; },
    async start(slot) { target = options; attach(slot); return ensureStarted(); },
    stop() { if (target === options) target = null; },
  });
  factory.attach = attach;
  factory.start = ensureStarted;
  factory.dispose = () => { target = null; startPromise = null; real.stop(); video.srcObject = null; };
  return factory;
}
