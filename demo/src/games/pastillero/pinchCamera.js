import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PINCH_CONFIG as C } from './pinchConfig.js';

const base = import.meta.env?.BASE_URL ?? '/';

async function createDetector(delegate) {
  const files = await FilesetResolver.forVisionTasks(`${base}pinch-assets/wasm`);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}pinch-assets/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: C.modelConfidence,
    minHandPresenceConfidence: C.modelConfidence,
    minTrackingConfidence: C.modelConfidence,
  });
}

export class PinchCamera {
  constructor({ onFrame, onError, onStatus = () => {}, hand = 'Right', create = createDetector }) {
    this.onFrame = onFrame; this.onError = onError; this.onStatus = onStatus;
    this.hand = hand; this.create = create; this.generation = 0;
    this.stream = null; this.model = null; this.video = null; this.running = false;
    this.callbackId = null; this.raf = null; this.lastTimestamp = -1; this.delegate = null;
    this.onEnded = () => this.fail('La cámara se ha desconectado. Vuelve a activarla.');
    this.onHidden = () => { if (document.hidden) this.fail('La prueba se ha detenido al salir de la pestaña. Vuelve a activar la cámara.'); };
    this.onPageHide = () => this.stop();
  }
  async start(video) {
    this.stop();
    const generation = this.generation;
    this.video = video;
    this.lastTimestamp = -1;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fail('La cámara requiere HTTPS o localhost y un navegador con acceso a webcam.');
      return false;
    }
    try {
      this.onStatus('Permite el acceso a la cámara.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' } });
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
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d');
      this.meter = document.createElement('canvas');
      this.meter.width = C.luminanceSampleSize; this.meter.height = C.luminanceSampleSize;
      this.meterContext = this.meter.getContext('2d', { willReadFrequently: true });
      if (!this.context || !this.meterContext) throw new Error('No se pudo crear el lienzo de captura.');
      this.running = true;
      document.addEventListener('visibilitychange', this.onHidden);
      window.addEventListener('pagehide', this.onPageHide);
      this.schedule();
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      const message = error?.name === 'NotAllowedError' ? 'Permiso denegado. Activa la cámara en los permisos del navegador y vuelve a intentarlo.' :
        error?.name === 'NotFoundError' ? 'No se ha encontrado una cámara.' :
        'No se pudo iniciar la cámara o cargar el modelo local. Comprueba la conexión y vuelve a intentarlo.';
      this.fail(message);
      return false;
    }
  }
  schedule() {
    if (!this.running || !this.video) return;
    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.callbackId = this.video.requestVideoFrameCallback((_, metadata) => this.process(metadata.mediaTime * 1000));
    } else {
      this.raf = requestAnimationFrame(() => this.process(this.video.currentTime * 1000));
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
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width; this.canvas.height = height;
      }
      this.context.setTransform(-1, 0, 0, 1, width, 0);
      this.context.drawImage(this.video, 0, 0, width, height);
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      const results = this.model.detectForVideo(this.canvas, t);
      const hands = (results.landmarks || []).map((landmarks, i) => ({
        landmarks: landmarks.map(p => ({ x: p.x, y: p.y, z: p.z })),
        handedness: results.handedness?.[i]?.[0]?.categoryName ?? null,
        score: results.handedness?.[i]?.[0]?.score ?? 0,
        world: results.worldLandmarks?.[i]?.map(p => ({ x: p.x, y: p.y, z: p.z })) ?? null,
      }));
      const h = hands.find(h => h.handedness === this.hand) ?? hands[0];
      let x = 0, y = 0, w = width, hh = height;
      if (h) {
        const xs = h.landmarks.map(p => p.x * width), ys = h.landmarks.map(p => p.y * height);
        x = Math.max(0, Math.min(...xs)); y = Math.max(0, Math.min(...ys));
        w = Math.max(1, Math.min(width, Math.max(...xs)) - x);
        hh = Math.max(1, Math.min(height, Math.max(...ys)) - y);
      }
      this.meterContext.drawImage(this.canvas, x, y, w, hh, 0, 0, this.meter.width, this.meter.height);
      const pixels = this.meterContext.getImageData(0, 0, this.meter.width, this.meter.height).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
      this.onFrame({ t, width, height, hands, luminance: sum / (pixels.length / 4), latencyMs: performance.now() - started });
    } catch {
      this.fail('Se interrumpió el reconocimiento. Activa de nuevo la cámara para repetir.');
      return;
    }
    this.schedule();
  }
  fail(message) { this.stop(); this.onError(message); }
  stop() {
    this.generation++; this.running = false;
    if (this.callbackId !== null && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.callbackId);
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.callbackId = null; this.raf = null;
    document.removeEventListener('visibilitychange', this.onHidden);
    window.removeEventListener('pagehide', this.onPageHide);
    this.stream?.getTracks().forEach(t => { t.removeEventListener('ended', this.onEnded); t.stop(); });
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.model?.close(); this.model = null;
    this.canvas = null; this.context = null; this.meter = null; this.meterContext = null;
  }
}
