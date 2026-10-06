import { PINCH_CONFIG as C } from './pinchConfig.js';

const distance = (a, b, width, height) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const failed = reason => ({ valid: false, eligible: false, ratio: null, reason });

export function measurePinch(hand, frame) {
  if (!hand) return failed('missing');
  const p = hand.landmarks, { width, height, luminance } = frame;
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) ||
    !Array.isArray(p) || p.length !== 21 || !p.every(v => [v.x, v.y, v.z].every(Number.isFinite))) return failed('malformed');
  if (!Number.isFinite(hand.score) || hand.score < C.minHandedness) return failed('uncertain');
  if (!Number.isFinite(luminance) || luminance < C.minLuminance) return failed('dark');
  if (luminance > C.maxLuminance) return failed('bright');
  const xs = p.map(v => v.x), ys = p.map(v => v.y);
  const palm = distance(p[0], p[9], width, height);
  if (palm > Math.min(width, height) * C.maxPalmScreenFraction ||
    Math.max(...xs) - Math.min(...xs) > C.maxHandScreenFraction ||
    Math.max(...ys) - Math.min(...ys) > C.maxHandScreenFraction) return failed('close');
  if (p.some(v => v.x < C.edgeMargin || v.x > 1 - C.edgeMargin || v.y < C.edgeMargin || v.y > 1 - C.edgeMargin)) return failed('cropped');
  if (palm < C.minPalmPixels) return failed('far');
  if (distance(p[5], p[17], width, height) / palm < C.minPalmWidthRatio) return failed('side');
  const ratio = distance(p[4], p[8], width, height) / palm;
  const depthRatio = Math.abs(p[4].z - p[8].z) * width / palm;
  const indexReach = distance(p[8], p[5], width, height) / palm;
  const reason = indexReach < C.minIndexReachRatio ? 'folded' :
    ratio <= C.closeRatio && depthRatio > C.maxTipDepthRatio ? 'depth' : 'ok';
  return { valid: true, eligible: reason === 'ok', ratio, depthRatio, palmPixels: palm, reason };
}

export function selectPillTarget(game) {
  for (const compartment of game.compartments) {
    for (const [type, needed] of Object.entries(compartment.needs)) {
      if ((compartment.filled[type] || 0) >= needed) continue;
      const pill = game.trayPills.find(candidate => candidate.type === type);
      if (pill) return { pillId: pill.id, type, compartmentIndex: compartment.index };
    }
  }
  return null;
}

export class HandSelector {
  constructor(hand = 'Right') { this.hand = hand; this.previous = null; }
  reset(hand = this.hand) { this.hand = hand; this.previous = null; }
  select(frame) {
    const candidates = (frame.hands || []).filter(h => h.handedness === this.hand && h.score >= C.minHandedness && h.landmarks?.length === 21);
    if (!candidates.length) return { hand: null, reason: frame.hands?.some(h => h.handedness === this.hand) ? 'uncertain' : frame.hands?.length ? 'wrong' : 'missing' };
    if (candidates.length > 1) return { hand: null, reason: 'uncertain' };
    const h = candidates[0], p = h.landmarks;
    const palm = distance(p[0], p[9], frame.width, frame.height);
    const center = { x: (p[0].x + p[9].x) / 2, y: (p[0].y + p[9].y) / 2 };
    const prev = this.previous;
    if (prev && frame.t - prev.t < C.identityTimeoutMs) {
      const dt = Math.max(0, frame.t - prev.t) / 1000;
      const move = distance(center, prev.center, frame.width, frame.height) / Math.max(prev.palm, 1);
      if (move > C.identityBasePalmLengths + C.identityPalmLengthsPerSecond * dt ||
        Math.abs(Math.log(palm / prev.palm)) > C.maxScaleLogJump) return { hand: null, reason: 'jump' };
    }
    if (Number.isFinite(palm) && palm > 0) this.previous = { t: frame.t, center, palm };
    return { hand: h, reason: 'ok' };
  }
}

export class PinchController {
  constructor() { this.reset(); }
  reset() {
    this.state = 'acquiring'; this.qualitySince = null; this.pending = null;
    this.lastT = null; this.openAt = null; this.closedAt = null;
    this.maximum = 0; this.minimum = Infinity;
  }
  update(m, t) {
    const snapshot = event => ({ state: this.state, event, ready: this.state === 'open', held: this.state === 'closed' });
    if (!Number.isFinite(t) || (this.lastT !== null && t <= this.lastT)) return snapshot(null);
    const gap = this.lastT !== null && t - this.lastT > C.maxGapMs;
    if (gap || !m.valid || !m.eligible || !Number.isFinite(m.ratio)) {
      this.reset(); this.lastT = t;
      return snapshot(null);
    }
    this.lastT = t;
    if (this.qualitySince === null) this.qualitySince = t;
    const open = m.ratio >= C.openRatio;
    const closed = m.ratio <= C.closeRatio;
    if (this.state === 'acquiring') {
      if (!open) this.pending = null;
      else if (!this.pending) this.pending = { kind: 'open', since: t };
      if (this.pending && t - this.qualitySince >= C.stableMs && t - this.pending.since >= C.openMs) {
        this.state = 'open'; this.openAt = t; this.maximum = m.ratio; this.pending = null;
      }
      return snapshot(null);
    }
    if (this.state === 'open') {
      this.maximum = Math.max(this.maximum, m.ratio);
      if (!closed) this.pending = null;
      else if (!this.pending) this.pending = { kind: 'close', since: t };
      if (this.pending && t - this.pending.since >= C.closeMs && this.maximum - m.ratio >= C.minExcursion) {
        this.state = 'closed'; this.closedAt = t; this.minimum = m.ratio; this.pending = null;
        return snapshot({ type: 'grab', ratio: m.ratio });
      }
      return snapshot(null);
    }
    this.minimum = Math.min(this.minimum, m.ratio);
    if (!open) this.pending = null;
    else if (!this.pending) this.pending = { kind: 'release', since: t };
    if (this.pending && t - this.pending.since >= C.releaseMs) {
      const event = { type: 'release', startedAt: this.openAt, closedAt: this.closedAt,
        durationMs: t - this.openAt, amplitude: this.maximum - this.minimum,
        minimum: this.minimum, maximum: this.maximum };
      this.state = 'open'; this.openAt = t; this.maximum = m.ratio; this.minimum = Infinity; this.pending = null;
      return snapshot(event);
    }
    return snapshot(null);
  }
}

export class PinchSession {
  constructor(hand, subjectId = null, startedAt = 0, recordLandmarks = false) {
    this.hand = hand; this.subjectId = subjectId; this.start = startedAt;
    this.samples = []; this.repetitions = []; this.frames = recordLandmarks ? [] : null;
    this.validMs = 0; this.last = null; this.validFrames = 0; this.losses = 0; this.maxGapMs = 0;
    this.gapStart = null; this.lastValidT = null; this.interruptedRepetitions = 0; this.held = false;
  }
  add(frame, m, state) {
    const t = frame.t - this.start;
    if (t < 0 || (this.last && t <= this.last.t) || this.samples.length >= C.maxSamples) return;
    const valid = m.valid && m.eligible;
    const dt = this.last ? t - this.last.t : 0;
    const continuous = valid && this.last?.valid && dt <= C.maxGapMs;
    if (continuous) this.validMs += dt;
    if (valid) this.validFrames++;
    if ((!valid || dt > C.maxGapMs) && this.held) { this.interruptedRepetitions++; this.held = false; }
    if (!valid || dt > C.maxGapMs) {
      if (this.gapStart === null) { this.gapStart = this.last?.t ?? 0; this.losses++; }
    }
    if (valid && this.gapStart !== null) {
      this.maxGapMs = Math.max(this.maxGapMs, t - this.gapStart); this.gapStart = null;
    }
    if (valid) this.lastValidT = t;
    this.samples.push({ t, ratio: m.valid ? m.ratio : null, eligible: !!m.eligible, reason: m.reason,
      depthRatio: m.depthRatio ?? null, state: state.state ?? 'acquiring', latencyMs: frame.latencyMs ?? null });
    if (this.frames) this.frames.push({ t, width: frame.width, height: frame.height, luminance: frame.luminance, hands: frame.hands });
    if (state.event?.type === 'grab' && valid) this.held = true;
    if (state.event?.type === 'release' && valid && this.held) {
      this.repetitions.push({ ...state.event, startedAt: state.event.startedAt - this.start,
        closedAt: state.event.closedAt - this.start, completedAt: t });
      this.held = false;
    }
    this.last = { t, valid };
  }
  finish(endedAt, completed) {
    const durationMs = Math.max(0, endedAt - this.start);
    const tailGap = durationMs - (this.lastValidT ?? 0);
    const maxGapMs = Math.max(this.maxGapMs, this.gapStart === null ? tailGap : durationMs - this.gapStart);
    const validCoverage = durationMs > 0 ? Math.min(1, this.validMs / durationMs) : 0;
    const frameTimes = this.samples.filter(s => s.reason !== 'stalled').map(s => s.t);
    const span = frameTimes.length > 1 ? frameTimes.at(-1) - frameTimes[0] : 0;
    const fps = span > 0 ? (frameTimes.length - 1) * 1000 / span : 0;
    return {
      schemaVersion: 1, protocol: C.protocol, algorithmVersion: C.algorithm, createdAt: new Date().toISOString(),
      subjectId: this.subjectId, hand: this.hand, completed, durationMs,
      completedRepetitions: this.repetitions.length,
      interruptedRepetitions: this.interruptedRepetitions + (this.held ? 1 : 0),
      quality: { validCoverage, validFrames: this.validFrames, attemptedFrames: frameTimes.length,
        fps, losses: this.losses, maxGapMs,
        sufficient: validCoverage >= C.minTrialCoverage && maxGapMs <= C.maxGapMs && fps >= C.minCaptureFps },
      medianExcursionPalmLengths: median(this.repetitions.map(r => r.amplitude)),
      medianInteractionCycleMs: median(this.repetitions.map(r => r.durationMs)),
      clinicalScore: null, samples: this.samples, repetitions: this.repetitions,
      ...(this.frames ? { landmarkFrames: this.frames } : {}), config: C,
    };
  }
}
