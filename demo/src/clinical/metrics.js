const VIDEO_W = 960;
const VIDEO_H = 540;
const POS_BUFFER_SIZE = 60;
const TREMOR_BUFFER_SIZE = 30;
// Average palm width (L5-L17) ~85mm. At typical webcam distance (~50cm) the
// palm spans ~80px on a 960px-wide frame. 80/80 = 1mm/px baseline scale.
// Actual scale is recalculated each frame relative to observed palmScale.
const PX_TO_MM_BASE = 80;
const MIN_CONFIDENCE = 0.55;

// 1-Euro Filter: adaptive low-pass that smooths noise at rest while preserving
// fast intentional movement. Minimizes derivative lag for speed computation.
class OneEuroFilter {
  constructor(freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
  }
  _alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  filter(x) {
    if (this.xPrev === null) { this.xPrev = x; return x; }
    const dx = (x - this.xPrev) * this.freq;
    const adx = this._alpha(this.dCutoff);
    this.dxPrev = adx * dx + (1 - adx) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const ax = this._alpha(cutoff);
    const xFilt = ax * x + (1 - ax) * this.xPrev;
    this.xPrev = xFilt;
    return xFilt;
  }
  reset() { this.xPrev = null; this.dxPrev = 0; }
}

const handState = [createHandState(), createHandState()];

function createHandState() {
  return {
    posBuffer: [],
    maxSpanObserved: 1,
    prevTremorAmp: 0.1,
    speedHistory: [],
    prevFingerTips: null,
    prevAvgDistTips: null,
    prevDistTime: null,
    maxRomObserved: 1,
    filterX: new OneEuroFilter(30, 1.0, 0.007),
    filterY: new OneEuroFilter(30, 1.0, 0.007),
    lowConfidenceFrames: 0,
    totalFrames: 0,
  };
}

function gDist(p1, p2) {
  return Math.sqrt(
    Math.pow((p1.x - p2.x) * VIDEO_W, 2) + Math.pow((p1.y - p2.y) * VIDEO_H, 2)
  );
}

export function resetMetrics() {
  for (let i = 0; i < 2; i++) {
    handState[i] = createHandState();
  }
}

// A3: Real SPARC (Spectral Arc Length) — Balasubramanian et al. 2012.
// Exported for per-repetition SPARC computation (C5).
export function computeSPARCFromProfile(speedProfile, sampleRate = 30) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || speedProfile.length < 10 ||
    !speedProfile.every(v => Number.isFinite(v) && v >= 0) || !speedProfile.some(v => v > 0)) return null;
  let size = 16;
  while (size < speedProfile.length * 16) size *= 2;
  const re = new Array(size).fill(0), im = new Array(size).fill(0);
  speedProfile.forEach((v, i) => { re[i] = v; });
  fftInPlace(re, im, size);
  const limit = Math.min(Math.floor(size / 2), Math.floor(10 * size / sampleRate));
  const magnitude = Array.from({ length: limit + 1 }, (_, i) => Math.hypot(re[i], im[i]));
  const peak = magnitude.reduce((max, v) => Math.max(max, v), 0);
  if (!(peak > 0)) return null;
  const spectrum = magnitude.map(v => v / peak);
  let last = spectrum.length - 1;
  while (last > 0 && spectrum[last] < .05) last--;
  if (!last) return null;
  let arc = 0;
  for (let i = 1; i <= last; i++) arc += Math.hypot(1 / last, spectrum[i] - spectrum[i - 1]);
  return -arc;
}
// Computes arc length of the normalized magnitude spectrum of the speed profile.
// More negative = less smooth (fragmented movement).
function computeSPARC(speedHistory, sampleRate = 30) {
  if (speedHistory.length < 10) return 0;
  const N = speedHistory.length;

  // Normalize speed profile to [0, 1]
  const peak = Math.max(...speedHistory);
  if (peak < 1) return 0;
  const normalized = speedHistory.map(v => v / peak);

  // Zero-pad to next power of 2 for FFT efficiency
  let fftSize = 1;
  while (fftSize < N) fftSize <<= 1;
  const re = new Array(fftSize).fill(0);
  const im = new Array(fftSize).fill(0);
  for (let i = 0; i < N; i++) re[i] = normalized[i];

  // In-place Cooley-Tukey FFT
  fftInPlace(re, im, fftSize);

  // Compute magnitude spectrum (only positive frequencies up to cutoff)
  // Adaptive cutoff: frequency where power drops below threshold
  const freqResolution = sampleRate / fftSize;
  const maxFreqIdx = Math.min(Math.floor(fftSize / 2), Math.ceil(10 / freqResolution));

  const mag = [];
  for (let i = 0; i <= maxFreqIdx; i++) {
    mag.push(Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N);
  }

  // Normalize magnitude spectrum
  const magPeak = Math.max(...mag);
  if (magPeak < 1e-7) return 0;
  const magNorm = mag.map(v => v / magPeak);

  // Arc length of normalized magnitude spectrum
  let arcLength = 0;
  for (let i = 1; i < magNorm.length; i++) {
    const df = freqResolution / sampleRate; // normalized frequency step
    const dv = magNorm[i] - magNorm[i - 1];
    arcLength += Math.sqrt(df * df + dv * dv);
  }

  return Math.max(-5, -arcLength);
}

// Radix-2 Cooley-Tukey in-place FFT
function fftInPlace(re, im, N) {
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // FFT butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const tRe = curRe * re[i + j + half] - curIm * im[i + j + half];
        const tIm = curRe * im[i + j + half] + curIm * re[i + j + half];
        re[i + j + half] = re[i + j] - tRe;
        im[i + j + half] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

export function computeHandMetrics(landmarks, handIdx, confidence = 1.0) {
  const now = Date.now();
  const st = handState[handIdx];
  st.totalFrames++;

  const m = {
    pinchActive: false,
    pinchMm: 0,
    tripodQuality: 0,
    thumbOpposition: 0,
    handOpenPct: 0,
    handOpeningSpeed: 0,
    fingers: 0,
    indexExtension: 0,
    palmSpeed: 0,
    smoothness: 1.0,
    sparc: 0,
    romDeg: 0,
    romNorm: 0,
    tremorAmp: st.prevTremorAmp,
    tremorFreqHz: 0,
    tremorBand: 'none',
    intentionTremor: 0,
    fingerIndividuation: 0,
    qualityOk: true,
  };

  if (!landmarks || landmarks.length < 21) return m;

  // Quality gate: skip unreliable frames
  if (confidence < MIN_CONFIDENCE) {
    st.lowConfidenceFrames++;
    m.qualityOk = false;
    return m;
  }

  const lm = landmarks;
  const hSize = gDist(lm[0], lm[9]);
  const palmScale = gDist(lm[5], lm[17]);
  const pxToMm = PX_TO_MM_BASE / (palmScale + 0.001);

  // M1: Pinch precision (thumb-index distance)
  const dPinchPx = gDist(lm[4], lm[8]);
  m.pinchMm = Math.round(dPinchPx * pxToMm);
  m.pinchActive = dPinchPx / hSize < 0.15;

  // M15: Tripod quality (angle 4-8-12 + distances)
  const d48 = gDist(lm[4], lm[8]);
  const d412 = gDist(lm[4], lm[12]);
  const d812 = gDist(lm[8], lm[12]);
  const cosAngle = (d48 * d48 + d812 * d812 - d412 * d412) / (2 * d48 * d812 + 0.001);
  const tripodAngle = Math.acos(Math.min(1, Math.max(-1, cosAngle))) * 180 / Math.PI;
  const avgTripodDist = (d48 + d412 + d812) / 3;
  m.tripodQuality = Math.max(0, Math.min(100, 100 - Math.abs(tripodAngle - 60) * 1.5));

  // Thumb opposition: 3D distance L4-L20 (includes Z for depth of crossing)
  const thumbPinkyDist3D = Math.sqrt(
    Math.pow((lm[4].x - lm[20].x) * VIDEO_W, 2) +
    Math.pow((lm[4].y - lm[20].y) * VIDEO_H, 2) +
    Math.pow(((lm[4].z || 0) - (lm[20].z || 0)) * VIDEO_W, 2)
  );
  m.thumbOpposition = Math.round(Math.min(100, (1 - thumbPinkyDist3D / (hSize * 1.5)) * 100));

  // M2: Hand openness (position) + opening speed (derivative)
  const tips = [4, 8, 12, 16, 20];
  const avgDistTips = tips.reduce((s, idx) => s + gDist(lm[idx], lm[9]), 0) / tips.length;
  st.maxSpanObserved = Math.max(st.maxSpanObserved, avgDistTips);
  m.handOpenPct = Math.round((avgDistTips / st.maxSpanObserved) * 100);

  // M2 speed: rate of finger spread (mm/s), only positive = opening phase
  if (st.prevAvgDistTips !== null && st.prevDistTime !== null) {
    const dt = (now - st.prevDistTime) / 1000;
    if (dt > 0) {
      const delta = (avgDistTips - st.prevAvgDistTips) * pxToMm;
      m.handOpeningSpeed = Math.max(0, Math.round(delta / dt));
    }
  }
  st.prevAvgDistTips = avgDistTips;
  st.prevDistTime = now;

  // Fingers extended count
  let extended = 0;
  [8, 12, 16, 20].forEach((tip, i) => {
    const joint = [6, 10, 14, 18][i];
    if (gDist(lm[tip], lm[0]) > gDist(lm[joint], lm[0])) extended++;
  });
  if (gDist(lm[4], lm[17]) > gDist(lm[3], lm[17])) extended++;
  m.fingers = extended;

  // Index extension accuracy (angle at MCP joint 5-6-8)
  const v1i = { x: lm[5].x - lm[6].x, y: lm[5].y - lm[6].y };
  const v2i = { x: lm[8].x - lm[6].x, y: lm[8].y - lm[6].y };
  const dotI = v1i.x * v2i.x + v1i.y * v2i.y;
  const m1i = Math.sqrt(v1i.x ** 2 + v1i.y ** 2);
  const m2i = Math.sqrt(v2i.x ** 2 + v2i.y ** 2);
  m.indexExtension = Math.round(
    (Math.acos(Math.min(1, Math.max(-1, dotI / (m1i * m2i + 0.001)))) * 180) / Math.PI
  );

  // Palm position buffer for speed/smoothness/tremor (1-Euro filtered)
  const filtX = st.filterX.filter(lm[0].x);
  const filtY = st.filterY.filter(lm[0].y);
  st.posBuffer.push({ x: filtX, y: filtY, t: now });
  if (st.posBuffer.length > POS_BUFFER_SIZE) st.posBuffer.shift();

  if (st.posBuffer.length > 2) {
    const p1 = st.posBuffer[st.posBuffer.length - 1];
    const p2 = st.posBuffer[st.posBuffer.length - 2];
    const dt = (p1.t - p2.t) / 1000;
    m.palmSpeed = Math.round((gDist(p1, p2) * pxToMm) / (dt + 0.001));

    // Direction consistency (auxiliary metric, not primary smoothness indicator)
    let inversions = 0;
    for (let i = 2; i < st.posBuffer.length; i++) {
      const v1 = st.posBuffer[i - 1].y - st.posBuffer[i - 2].y;
      const v2 = st.posBuffer[i].y - st.posBuffer[i - 1].y;
      if (v1 * v2 < 0) inversions++;
    }
    m.smoothness = Math.max(0, 1 - inversions / TREMOR_BUFFER_SIZE);
  }

  // Smoothness arc length (discrete approximation of SPARC over 2s window)
  st.speedHistory.push(m.palmSpeed);
  if (st.speedHistory.length > 60) st.speedHistory.shift();
  m.sparc = computeSPARC(st.speedHistory);

  // M4 ROM: angle between wrist→thumb_tip (L0→L4) and wrist→pinky_tip (L0→L20).
  // Measures maximal hand opening span as angular ROM.
  // Normalized by patient's own session maximum (romNorm).
  const vThumb = { x: lm[4].x - lm[0].x, y: lm[4].y - lm[0].y };
  const vPinky = { x: lm[20].x - lm[0].x, y: lm[20].y - lm[0].y };
  const dotRom = vThumb.x * vPinky.x + vThumb.y * vPinky.y;
  const magThumb = Math.sqrt(vThumb.x ** 2 + vThumb.y ** 2);
  const magPinky = Math.sqrt(vPinky.x ** 2 + vPinky.y ** 2);
  const romRaw = Math.round(
    (Math.acos(Math.min(1, Math.max(-1, dotRom / (magThumb * magPinky + 0.001)))) * 180) / Math.PI
  );
  m.romDeg = romRaw;
  st.maxRomObserved = Math.max(st.maxRomObserved, romRaw);
  m.romNorm = Math.round((romRaw / st.maxRomObserved) * 100);

  // Resting tremor (high-freq variance during stillness, palmSpeed < 20)
  if (m.palmSpeed < 20 && st.posBuffer.length >= TREMOR_BUFFER_SIZE) {
    const recentPos = st.posBuffer.slice(-TREMOR_BUFFER_SIZE);
    const meanX = recentPos.reduce((a, b) => a + b.x, 0) / TREMOR_BUFFER_SIZE;
    const stdX = Math.sqrt(
      recentPos.reduce((a, b) => a + Math.pow(b.x - meanX, 2), 0) / TREMOR_BUFFER_SIZE
    );
    m.tremorAmp = Math.min(1, stdX * 100);

    // C4: Tremor frequency estimation via zero-crossing rate of detrended X
    const detrended = recentPos.map(p => p.x - meanX);
    let zeroCrossings = 0;
    for (let i = 1; i < detrended.length; i++) {
      if (detrended[i] * detrended[i - 1] < 0) zeroCrossings++;
    }
    // Each full cycle has 2 zero crossings. freq = crossings / (2 * duration)
    const durationSec = (recentPos[recentPos.length - 1].t - recentPos[0].t) / 1000;
    if (durationSec > 0.3) {
      const freqHz = zeroCrossings / (2 * durationSec);
      m.tremorFreqHz = Math.round(freqHz * 10) / 10;
      // Clinical band flag: cerebellar 3-5Hz, parkinsonian 4-6Hz
      m.tremorBand = freqHz >= 3 && freqHz <= 6 ? 'pathological' : 'physiological';
    }
  }
  st.prevTremorAmp = m.tremorAmp;

  // Intention tremor (high-freq oscillation DURING directed movement)
  // Detected by measuring direction reversals in the recent position buffer
  // while the hand is actively moving (palmSpeed >= 20).
  if (m.palmSpeed >= 20 && st.posBuffer.length >= 10) {
    const recent = st.posBuffer.slice(-10);
    let reversals = 0;
    for (let i = 2; i < recent.length; i++) {
      const dx1 = recent[i - 1].x - recent[i - 2].x;
      const dx2 = recent[i].x - recent[i - 1].x;
      const dy1 = recent[i - 1].y - recent[i - 2].y;
      const dy2 = recent[i].y - recent[i - 1].y;
      if (dx1 * dx2 < 0) reversals++;
      if (dy1 * dy2 < 0) reversals++;
    }
    m.intentionTremor = Math.min(1, reversals / 16);
  }

  // Finger individuation: variance of inter-frame finger tip speeds.
  // High variance = fingers moving independently (good individuation).
  const fingerTips = [8, 12, 16, 20];
  if (st.prevFingerTips) {
    const speeds = fingerTips.map(tip => {
      const dx = (lm[tip].x - st.prevFingerTips[tip].x) * VIDEO_W;
      const dy = (lm[tip].y - st.prevFingerTips[tip].y) * VIDEO_H;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const meanSpd = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((a, b) => a + (b - meanSpd) ** 2, 0) / speeds.length;
    m.fingerIndividuation = Math.round(Math.min(100, variance * 50));
  }
  st.prevFingerTips = Object.fromEntries(fingerTips.map(tip => [tip, { x: lm[tip].x, y: lm[tip].y }]));

  return m;
}

export function computeAsymmetry(metricsL, metricsR) {
  if (!metricsL || !metricsR) return { asymmetryIndex: 0, recoveryGap: 0 };

  const speedRatio = Math.min(metricsL.palmSpeed, metricsR.palmSpeed) /
    (Math.max(metricsL.palmSpeed, metricsR.palmSpeed) + 0.001);
  const openRatio = Math.min(metricsL.handOpenPct, metricsR.handOpenPct) /
    (Math.max(metricsL.handOpenPct, metricsR.handOpenPct) + 0.001);

  const asymmetryIndex = Math.round((1 - (speedRatio + openRatio) / 2) * 100);
  const recoveryGap = Math.abs(metricsL.palmSpeed - metricsR.palmSpeed);

  return { asymmetryIndex, recoveryGap: Math.round(recoveryGap) };
}
