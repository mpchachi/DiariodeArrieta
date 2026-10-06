// Cámara de los juegos del zorro: misma captura local del Pastillero v2 (modelo y
// WASM fijados, servidos en local) pero ligera para no dar tirones al juego:
//  - 640×480 y una sola mano (la inferencia corre en el hilo del juego),
//  - se detecta sobre el <video> directamente, sin volcar cada fotograma a un lienzo
//    espejado; el espejo se aplica a las coordenadas (x → 1 − x) y a la lateralidad,
//  - la luminancia se mide solo cada `luminanceEvery` fotogramas (leer píxeles de la
//    GPU bloquea el dibujo),
//  - si requestVideoFrameCallback no entrega fotogramas con el vídeo oculto, se lee con rAF.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PinchCamera } from '../games/pastillero/pinchCamera.js';

const base = import.meta.env?.BASE_URL ?? '/';
const SWAP = { Left: 'Right', Right: 'Left' };

async function createDetector(delegate) {
  const files = await FilesetResolver.forVisionTasks(`${base}pinch-assets/wasm`);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}pinch-assets/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO', numHands: 1,
    // Más permisivo que el Pastillero (0,5 → 0,4): con 0,3–0,4 aún detecta manos pequeñas o
    // de perfil que con 0,5 se pierden (probado con fotos reales); falsos positivos raros.
    minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
  });
}

export class RunnerCamera extends PinchCamera {
  constructor(options) {
    super({ create: createDetector, ...options });
    this.fallbackMs = 700; this.fallbackTimer = null; this.useRaf = false;
    this.luminanceEvery = 15; this.frameCount = 0; this.luminance = 120;
  }

  async start(video) {
    this.stop();
    const generation = this.generation;
    this.video = video; this.lastTimestamp = -1; this.useRaf = false; this.frameCount = 0;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fail('La cámara requiere HTTPS o localhost y un navegador con acceso a webcam.');
      return false;
    }
    try {
      this.onStatus('Permite el acceso a la cámara.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' } });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream;
      stream.getTracks().forEach(t => t.addEventListener('ended', this.onEnded));
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      if (generation !== this.generation) return false;
      this.onStatus('Preparando el reconocimiento de mano. La primera carga puede tardar.');
      let model, delegate = 'GPU';
      try { model = await this.create(delegate); }
      catch {
        if (generation !== this.generation) return false;
        delegate = 'CPU'; model = await this.create(delegate);
      }
      if (generation !== this.generation) { model.close(); return false; }
      this.model = model; this.delegate = delegate;
      this.meter = document.createElement('canvas');
      this.meter.width = 16; this.meter.height = 16;
      this.meterContext = this.meter.getContext('2d', { willReadFrequently: true });
      this.running = true;
      document.addEventListener('visibilitychange', this.onHidden);
      window.addEventListener('pagehide', this.onPageHide);
      this.schedule();
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.fail(error?.name === 'NotAllowedError' ? 'Permiso denegado. Activa la cámara en los permisos del navegador y vuelve a intentarlo.' :
        error?.name === 'NotFoundError' ? 'No se ha encontrado una cámara.' :
        'No se pudo iniciar la cámara o cargar el modelo local. Comprueba la conexión y vuelve a intentarlo.');
      return false;
    }
  }

  process(t) {
    if (!this.running) return;
    if (!Number.isFinite(t) || t <= this.lastTimestamp || this.video.readyState < 2) { this.schedule(); return; }
    this.lastTimestamp = t;
    const width = this.video.videoWidth, height = this.video.videoHeight;
    if (!width || !height) { this.schedule(); return; }
    const started = performance.now();
    try {
      const results = this.model.detectForVideo(this.video, t);
      // Espejo en coordenadas: equivale a detectar sobre la imagen espejada (vista «selfie»).
      const hands = (results.landmarks || []).map((landmarks, i) => ({
        landmarks: landmarks.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })),
        handedness: SWAP[results.handedness?.[i]?.[0]?.categoryName] ?? null,
        score: results.handedness?.[i]?.[0]?.score ?? 0,
        world: results.worldLandmarks?.[i]?.map(p => ({ x: -p.x, y: p.y, z: p.z })) ?? null,
      }));
      if (this.meterContext && this.frameCount++ % this.luminanceEvery === 0) {
        this.meterContext.drawImage(this.video, 0, 0, 16, 16);
        const px = this.meterContext.getImageData(0, 0, 16, 16).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        this.luminance = sum / (px.length / 4);
      }
      this.onFrame({ t, width, height, hands, luminance: this.luminance, latencyMs: performance.now() - started });
    } catch {
      this.fail('Se interrumpió el reconocimiento. Activa de nuevo la cámara para repetir.');
      return;
    }
    this.schedule();
  }

  schedule() {
    if (!this.running || !this.video) return;
    clearTimeout(this.fallbackTimer);
    if (this.useRaf || typeof this.video.requestVideoFrameCallback !== 'function') {
      this.raf = requestAnimationFrame(() => this.process(this.video.currentTime * 1000));
      return;
    }
    this.callbackId = this.video.requestVideoFrameCallback((_, metadata) => {
      clearTimeout(this.fallbackTimer);
      this.process(metadata.mediaTime * 1000);
    });
    this.fallbackTimer = setTimeout(() => {
      if (!this.running || !this.video) return;
      this.video.cancelVideoFrameCallback?.(this.callbackId);
      this.callbackId = null; this.useRaf = true;
      this.schedule();
    }, this.fallbackMs);
  }

  stop() {
    clearTimeout(this.fallbackTimer);
    super.stop();
  }
}
