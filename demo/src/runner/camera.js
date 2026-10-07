// Cámara de los juegos del zorro. Misma captura local del Pastillero v2 (modelo y WASM
// fijados y servidos en local), pero ligera y, sobre todo, a prueba de fallos:
//
//  - Ligera: 640×480, se detecta sobre el <video> directamente (sin volcar a un lienzo
//    espejado; el espejo se aplica a las coordenadas) y la luminancia se mide solo cada
//    `luminanceEvery` fotogramas (leer píxeles de la GPU bloquea el dibujo).
//  - Dos manos: el modelo devuelve hasta 2 y `HandTracker` sigue siempre a la misma, así
//    la otra mano (o la de otra persona) no «roba» el control.
//  - Reloj monótono: `t` = performance.now() de cada fotograma nuevo. No se reinicia al
//    reconectar la cámara (el tiempo del vídeo sí), así los juegos nunca ven saltos atrás.
//  - Se recupera sola en vez de morir:
//      · pestaña oculta → solo se pausa; al volver sigue (antes se detenía con error),
//      · cámara desconectada / ocupada por otra app → reintenta con esperas crecientes,
//      · vídeo congelado (sin fotogramas nuevos) → vigilante que reconecta,
//      · fallo del modelo (p. ej. contexto GPU perdido) → lo recrea (GPU → CPU),
//    y solo da error definitivo si no se recupera tras varios intentos.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const base = import.meta.env?.BASE_URL ?? '/';
const SWAP = { Left: 'Right', Right: 'Left' };

export const CAMERA_CONFIG = Object.freeze({
  width: 640, height: 480, fps: 30,
  numHands: 2,
  // 0,4: con 0,3–0,4 aún detecta manos pequeñas o de perfil que con 0,5 se pierden
  // (probado con fotos reales); las detecciones absurdas las filtra `isPlausibleHand`.
  confidence: 0.4,
  luminanceEvery: 15,
  rvfcFallbackMs: 700, // si requestVideoFrameCallback no entrega, se lee con rAF
  stallMs: 2500, // sin fotogramas nuevos este tiempo (pestaña visible) = vídeo congelado
  watchdogMs: 1000,
  reconnectDelaysMs: [400, 1000, 2000, 4000, 8000],
  maxModelErrors: 3, // fallos del modelo seguidos antes de rendirse
});

async function createDetector(delegate, C = CAMERA_CONFIG) {
  const files = await FilesetResolver.forVisionTasks(`${base}pinch-assets/wasm`);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}pinch-assets/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO', numHands: C.numHands,
    minHandDetectionConfidence: C.confidence, minHandPresenceConfidence: C.confidence, minTrackingConfidence: C.confidence,
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': case 'SecurityError': return 'Permiso denegado. Activa la cámara en los permisos del navegador y vuelve a intentarlo.';
    case 'NotFoundError': case 'OverconstrainedError': return 'No se ha encontrado una cámara.';
    case 'NotReadableError': case 'AbortError': return 'La cámara la está usando otra aplicación (Zoom, Meet, FaceTime…). Ciérrala y vuelve a intentarlo.';
    default: return 'No se pudo iniciar la cámara o cargar el modelo local. Comprueba la conexión y vuelve a intentarlo.';
  }
}

export class RunnerCamera {
  constructor({ onFrame, onError = () => {}, onStatus = () => {}, hand = 'Right', create = createDetector, config = {} } = {}) {
    this.C = { ...CAMERA_CONFIG, ...config };
    this.onFrame = onFrame; this.onError = onError; this.onStatus = onStatus; this.hand = hand; this.create = create;
    this.generation = 0; this.running = false; this.video = null; this.stream = null; this.model = null; this.delegate = null;
    this.stats = { frames: 0, reconnects: 0, modelRecoveries: 0, lastError: null };
    this.onTrackEnded = () => { void this.reconnect('ended'); };
    this.onVisibility = () => {
      // Oculta: el navegador deja de entregar fotogramas y no pasa nada. Visible: se
      // reanuda (y se da margen al vigilante para no reconectar por la pausa).
      if (!document.hidden && this.running) { this.lastFrameWall = performance.now(); this.video?.play?.().catch(() => {}); }
    };
    this.onPageHide = () => this.stop();
  }

  async start(video) {
    this.stop();
    const gen = this.generation;
    this.video = video;
    this.lastMediaTime = -1; this.lastT = 0; this.useRaf = false; this.frameCount = 0; this.luminance = 120;
    this.modelErrors = 0; this.reconnecting = false; this.recovering = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fail('La cámara requiere HTTPS o localhost y un navegador con acceso a webcam.');
      return false;
    }
    try {
      this.onStatus('Permite el acceso a la cámara.');
      await this.openStream(gen);
      if (gen !== this.generation) return false;
      this.onStatus('Preparando el reconocimiento de mano. La primera carga puede tardar.');
      await this.loadModel(gen);
      if (gen !== this.generation) return false;
      this.meter = document.createElement('canvas');
      this.meter.width = 16; this.meter.height = 16;
      this.meterContext = this.meter.getContext('2d', { willReadFrequently: true });
      this.running = true; this.lastFrameWall = performance.now();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onPageHide);
      this.watchdog = setInterval(() => this.checkStall(), this.C.watchdogMs);
      this.schedule();
      return true;
    } catch (error) {
      if (gen !== this.generation) return false;
      this.fail(cameraErrorMessage(error), error);
      return false;
    }
  }

  async openStream(gen) {
    const C = this.C;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { width: { ideal: C.width }, height: { ideal: C.height }, frameRate: { ideal: C.fps }, facingMode: 'user' } });
    if (gen !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.releaseStream();
    this.stream = stream;
    stream.getTracks().forEach(t => t.addEventListener('ended', this.onTrackEnded));
    const v = this.video;
    v.srcObject = stream; v.muted = true; v.playsInline = true;
    try { await v.play(); } catch (error) { if (error?.name !== 'AbortError') throw error; }
  }

  async loadModel(gen, preferCpu = false) {
    let model = null, delegate = preferCpu ? 'CPU' : 'GPU';
    try { model = await this.create(delegate, this.C); }
    catch (error) {
      if (gen !== this.generation || delegate === 'CPU') throw error;
      delegate = 'CPU'; model = await this.create(delegate, this.C);
    }
    if (gen !== this.generation) { model?.close?.(); return; }
    this.model?.close?.();
    this.model = model; this.delegate = delegate;
  }

  // --- Bucle de fotogramas ---
  schedule() {
    const v = this.video;
    if (!this.running || !v) return;
    clearTimeout(this.fallbackTimer);
    if (this.useRaf || typeof v.requestVideoFrameCallback !== 'function') {
      this.raf = requestAnimationFrame(() => this.process(v.currentTime * 1000));
      return;
    }
    this.callbackId = v.requestVideoFrameCallback((_, metadata) => { clearTimeout(this.fallbackTimer); this.process(metadata.mediaTime * 1000); });
    this.fallbackTimer = setTimeout(() => {
      if (!this.running || this.video !== v || document.hidden) return;
      v.cancelVideoFrameCallback?.(this.callbackId);
      this.callbackId = null; this.useRaf = true;
      this.schedule();
    }, this.C.rvfcFallbackMs);
  }

  process(mediaTime) {
    if (!this.running) return;
    const v = this.video;
    // Solo fotogramas NUEVOS (mismo instante del vídeo = repetido) y con imagen.
    if (!v || !this.model || this.reconnecting || this.recovering || !Number.isFinite(mediaTime) || mediaTime === this.lastMediaTime || v.readyState < 2) { this.schedule(); return; }
    const width = v.videoWidth, height = v.videoHeight;
    if (!width || !height) { this.schedule(); return; }
    this.lastMediaTime = mediaTime;
    // Reloj monótono (MediaPipe exige marcas crecientes y los juegos también).
    const t = Math.max(performance.now(), this.lastT + 0.01);
    this.lastT = t;
    const started = performance.now();
    let results;
    try { results = this.model.detectForVideo(v, t); }
    catch (error) { void this.recoverModel(error); return; }
    this.modelErrors = 0;
    this.lastFrameWall = performance.now();
    this.stats.frames++;
    const hands = (results.landmarks || []).map((landmarks, i) => ({
      landmarks: landmarks.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })),
      handedness: SWAP[results.handedness?.[i]?.[0]?.categoryName] ?? null,
      score: results.handedness?.[i]?.[0]?.score ?? 0,
      world: results.worldLandmarks?.[i]?.map(p => ({ x: -p.x, y: p.y, z: p.z })) ?? null,
    }));
    if (this.meterContext && this.frameCount++ % this.C.luminanceEvery === 0) {
      try {
        this.meterContext.drawImage(v, 0, 0, 16, 16);
        const px = this.meterContext.getImageData(0, 0, 16, 16).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        this.luminance = sum / (px.length / 4);
      } catch { /* la luminancia es orientativa: si falla se mantiene la anterior */ }
    }
    try { this.onFrame?.({ t, width, height, hands, luminance: this.luminance, latencyMs: performance.now() - started }); }
    catch (error) { console.error('Error en el juego al procesar un fotograma', error); }
    this.schedule();
  }

  // --- Recuperación ---
  async recoverModel(error) {
    const gen = this.generation;
    this.modelErrors++; this.stats.lastError = String(error?.message ?? error);
    if (this.modelErrors > this.C.maxModelErrors) { this.fail('Se interrumpió el reconocimiento de mano. Vuelve a intentarlo.', error); return; }
    this.onStatus('Recuperando el reconocimiento de mano…');
    this.recovering = true;
    try {
      // 1.er fallo: se recrea igual (p. ej. contexto GPU perdido); si vuelve a fallar, CPU.
      await this.loadModel(gen, this.modelErrors >= 2);
      if (gen !== this.generation) return;
      this.stats.modelRecoveries++;
      this.recovering = false; this.lastMediaTime = -1; this.lastFrameWall = performance.now();
      this.schedule();
    } catch (e) {
      this.recovering = false;
      if (gen === this.generation) this.fail('No se pudo recuperar el reconocimiento de mano. Vuelve a intentarlo.', e);
    }
  }

  checkStall() {
    if (!this.running || this.reconnecting || this.recovering || document.hidden) return;
    if (performance.now() - this.lastFrameWall > this.C.stallMs) void this.reconnect('stall');
  }

  async reconnect(reason) {
    if (!this.running || this.reconnecting) return;
    const gen = this.generation;
    this.reconnecting = true; this.stats.lastError = reason;
    this.onStatus('Reconectando la cámara…');
    let lastError = null;
    for (const delay of this.C.reconnectDelaysMs) {
      await sleep(delay);
      if (gen !== this.generation) return;
      if (document.hidden) { await sleep(500); continue; }
      try {
        await this.openStream(gen);
        if (gen !== this.generation) return;
        this.stats.reconnects++;
        this.reconnecting = false; this.lastMediaTime = -1; this.lastFrameWall = performance.now();
        this.useRaf = false;
        this.onStatus('Cámara recuperada.');
        this.schedule();
        return;
      } catch (error) {
        lastError = error;
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') break; // sin permiso no tiene sentido insistir
      }
    }
    if (gen === this.generation) { this.reconnecting = false; this.fail(cameraErrorMessage(lastError ?? { name: 'NotReadableError' }), lastError); }
  }

  // --- Cierre ---
  fail(message, error = null) {
    this.stats.lastError = String(error?.message ?? message);
    this.stop();
    this.onError?.(message);
  }

  releaseStream() {
    this.stream?.getTracks().forEach(t => { t.removeEventListener('ended', this.onTrackEnded); t.stop(); });
    this.stream = null;
  }

  stop() {
    this.generation++; this.running = false; this.reconnecting = false; this.recovering = false;
    clearTimeout(this.fallbackTimer); clearInterval(this.watchdog);
    if (this.callbackId != null) this.video?.cancelVideoFrameCallback?.(this.callbackId);
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.callbackId = null; this.raf = null; this.watchdog = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.releaseStream();
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.model?.close?.(); this.model = null;
    this.meter = null; this.meterContext = null;
  }
}
