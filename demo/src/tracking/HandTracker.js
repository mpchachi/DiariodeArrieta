import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { LandmarkFilter } from './OneEuroFilter.js';

// MediaPipe local (misma copia verificada por hash que usa el Runner), nunca desde CDN ni modelo «latest».
const PINCH_ASSETS_BASE = import.meta.env?.BASE_URL ?? '/';

export class HandTracker {
  constructor({ maxHands = 2, resolution = { width: 960, height: 720 } } = {}) {
    this._callback = null;
    this._rawCallback = null;
    this._maxHands = maxHands;
    this._resolution = resolution;
    this._handLandmarker = null;
    this._running = false;
    this._filters = [new LandmarkFilter(), new LandmarkFilter()];
    this._lastTimestamp = -1;
    this._fps = 0;
    this._frameCount = 0;
    this._fpsStart = performance.now();
  }

  onResults(cb) { this._callback = cb; }
  onRawResults(cb) { this._rawCallback = cb; }

  async start(videoElement) {
    const vision = await FilesetResolver.forVisionTasks(
      `${PINCH_ASSETS_BASE}pinch-assets/wasm`
    );

    this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${PINCH_ASSETS_BASE}pinch-assets/hand_landmarker.task`,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: this._maxHands,
      minHandDetectionConfidence: 0.65,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });

    await this._startCamera(videoElement);
    this._running = true;
    this._processFrame(videoElement);
  }

  stop() {
    this._running = false;
  }

  getFPS() {
    return this._fps;
  }

  async _startCamera(videoElement) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this._resolution.width },
        height: { ideal: this._resolution.height },
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
    });
    videoElement.srcObject = stream;
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = resolve;
    });
    await videoElement.play();
  }

  _processFrame(videoElement) {
    if (!this._running) return;

    const timestamp = performance.now();

    if (timestamp <= this._lastTimestamp) {
      requestAnimationFrame(() => this._processFrame(videoElement));
      return;
    }
    this._lastTimestamp = timestamp;

    this._frameCount++;
    const elapsed = timestamp - this._fpsStart;
    if (elapsed >= 1000) {
      this._fps = Math.round((this._frameCount * 1000) / elapsed);
      this._frameCount = 0;
      this._fpsStart = timestamp;
    }

    const results = this._handLandmarker.detectForVideo(videoElement, timestamp);

    const landmarks = [];
    const worldLandmarks = [];
    const handedness = [];

    if (results.landmarks && results.landmarks.length > 0) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const filtered = this._filters[i].filter(results.landmarks[i], timestamp);
        landmarks.push(filtered);
        worldLandmarks.push(results.worldLandmarks ? results.worldLandmarks[i] : null);
        handedness.push(results.handednesses ? results.handednesses[i] : null);
      }
    } else {
      this._filters[0].reset();
      this._filters[1].reset();
    }

    if (this._callback) {
      this._callback(landmarks, { worldLandmarks, handedness, timestamp });
    }

    if (this._rawCallback) {
      this._rawCallback({ landmarks, worldLandmarks, handedness, timestamp });
    }

    requestAnimationFrame(() => this._processFrame(videoElement));
  }
}
