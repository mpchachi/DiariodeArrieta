import { computeSPARCFromProfile } from '../clinical/metrics.js';
import { framingHint, handBox } from './framing.js';
import { handSize } from '../vision/hands.js';

export const MEASUREMENT_VERSION = 'fox-observation-2.0.0';
export const SAMPLE_GAP_MS = 250;
export const detectorHand = hand => hand === 'Left' ? 'Right' : 'Left';
export const quantile = (values, p) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (v.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
  return v[lo] + (v[hi] - v[lo]) * (at - lo);
};
const round = v => Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;

export function sampleIssue(frame, selection, { sourceAvailable = true, fresh = true } = {}) {
  if (!selection.hand) return selection.reason || 'missing';
  if (selection.switched) return 'hand-switch';
  if (!fresh) return 'held-value';
  if (!sourceAvailable) return 'source-unavailable';
  if (!Number.isFinite(frame.luminance)) return 'light-unknown';
  if (frame.luminance < 40) return 'dark';
  const hint = framingHint({ box: handBox(selection.hand.landmarks), detected: true, luminance: frame.luminance });
  if (hint.code === 'far' && handSize(selection.hand.landmarks, frame.width, frame.height) / frame.height >= .08) return null;
  return hint.ok ? null : hint.code;
}

export function resampleSegments(samples, hz = 30) {
  const chunks = []; let chunk = [];
  for (const p of samples) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) { if (chunk.length) chunks.push(chunk); chunk = []; continue; }
    if (chunk.length && (p.t <= chunk.at(-1).t || p.t - chunk.at(-1).t > SAMPLE_GAP_MS)) { chunks.push(chunk); chunk = []; }
    chunk.push(p);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks.filter(c => c.length >= 2).map(c => {
    const out = []; let j = 1;
    for (let t = c[0].t; t <= c.at(-1).t; t += 1000 / hz) {
      while (j < c.length - 1 && c[j].t < t) j++;
      const a = c[j - 1], b = c[j];
      out.push({ t, v: a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t) });
    }
    return out;
  });
}

export function discreteSmoothness(samples) {
  if (samples.some((p, i) => !Number.isFinite(p.v) || !Number.isFinite(p.t) || i > 0 && p.t <= samples[i - 1].t)) return null;
  const segments = resampleSegments(samples);
  if (segments.length !== 1 || segments[0].length < 12) return null;
  const s = segments[0], values = s.map(p => p.v);
  if (Math.max(...values) - Math.min(...values) < 1e-6) return null;
  const speed = s.slice(1).map((p, i) => Math.abs(p.v - s[i].v) * 30);
  return computeSPARCFromProfile(speed, 30);
}

export class MeasurementRecorder {
  constructor({ game, hand, config, source, targets = [] }) {
    this.game = game; this.hand = hand; this.config = config; this.source = source;
    this.samples = []; this.completed = new Set(); this.targets = new Map(targets.map(t => [t.id, t.stage]));
    this.start = null; this.last = null; this.maxGapMs = 0; this.nonMonotonic = 0; this.truncated = false;
    this.dimensions = new Set(); this.adaptation = []; this.neutral = null; this.calibration = null;
  }
  add(frame, { value = null, stage = 'active', target = 'preparation', issue = null, fingers = null } = {}) {
    if (!Number.isFinite(frame.t) || this.last !== null && frame.t <= this.last) { this.nonMonotonic++; return; }
    if (this.samples.length >= 18000) { this.truncated = true; return; }
    this.start ??= frame.t;
    if (this.last !== null) this.maxGapMs = Math.max(this.maxGapMs, frame.t - this.last);
    this.last = frame.t;
    this.dimensions.add(`${frame.width}x${frame.height}`);
    this.targets.set(target, stage === 'paused' ? (this.targets.get(target) ?? 'active') : stage);
    const reason = issue ?? (Number.isFinite(value) ? null : 'source-unavailable');
    this.samples.push({ t: frame.t, v: reason || stage === 'paused' ? null : value, stage, target, issue: reason,
      fingers: !reason && fingers ? fingers.map(f => round(f.mcp + f.pip + f.dip)) : null });
  }
  complete(target) { this.completed.add(target); }
  adapt(t, threshold, target = 'global') {
    if (this.adaptation.at(-1)?.threshold !== threshold || this.adaptation.at(-1)?.target !== target) this.adaptation.push({ t, threshold, target });
  }
  finish(completed, endedAt = this.last) {
    const observations = [...this.targets].map(([id, stage]) => {
      const samples = this.samples.filter(p => p.target === id), usable = samples.filter(p => Number.isFinite(p.v));
      const low = quantile(usable.map(p => p.v), .05), high = quantile(usable.map(p => p.v), .95);
      return { id, stage, status: !samples.length ? 'not-performed' : !usable.length ? 'unmeasurable' : this.completed.has(id) ? 'completed' : 'incomplete',
        sampleCount: samples.length, usableCount: usable.length, p05: round(low), p95: round(high),
        excursion: usable.length ? round(high - low) : null,
        perFinger: Array.from({ length: 4 }, (_, i) => {
          const v = usable.map(p => p.fingers?.[i]).filter(Number.isFinite);
          return v.length ? { p05: round(quantile(v, .05)), p95: round(quantile(v, .95)) } : null;
        }) };
    });
    const active = this.samples.filter(p => p.stage === 'active');
    const usable = active.filter(p => Number.isFinite(p.v));
    const issues = {}; for (const p of active) if (p.issue) issues[p.issue] = (issues[p.issue] || 0) + 1;
    let activeGap = 0;
    for (let i = 1; i < active.length; i++) {
      if (active[i].target === active[i - 1].target) activeGap = Math.max(activeGap, active[i].t - active[i - 1].t);
    }
    if (!completed && this.samples.at(-1)?.stage === 'active' && Number.isFinite(endedAt)) activeGap = Math.max(activeGap, endedAt - this.last);
    const byTarget = observations.filter(o => o.stage === 'active' && o.usableCount >= 10);
    const values = byTarget.map(o => o.p95), minima = byTarget.map(o => o.p05);
    const capture = { frames: active.length, usable: usable.length, usablePct: active.length ? round(100 * usable.length / active.length) : null,
      maxGapMs: round(activeGap), nonMonotonic: this.nonMonotonic, truncated: this.truncated, issues,
      dimensions: [...this.dimensions].sort(), fps: active.length > 1 && active.at(-1).t > active[0].t ? round(1000 * (active.length - 1) / (active.at(-1).t - active[0].t)) : null };
    const comparable = completed && byTarget.length > 0 && usable.length === active.length && activeGap <= SAMPLE_GAP_MS &&
      !this.nonMonotonic && !this.truncated && this.dimensions.size === 1 && (this.game !== 'fox_garden' || this.calibration?.stable === true);
    return { version: MEASUREMENT_VERSION, game: this.game, selectedHand: this.hand,
      handConvention: 'camera-mirrored-label-v1', source: this.source, protocol: this.config.protocol, algorithm: this.config.algorithm,
      config: this.config, completed, comparable, capture, observations,
      preparationFrames: this.samples.length - active.length, adaptation: this.adaptation, neutral: this.neutral, calibration: this.calibration,
      summary: { upper: round(quantile(values, .5)), lower: round(quantile(minima, .5)),
        excursion: round(quantile(byTarget.map(o => o.excursion), .5)), opportunities: byTarget.length },
      trace: this.samples.map(p => [round(p.t - this.start), p.v === null ? null : round(p.v), p.stage, p.target, p.issue, p.fingers]) };
  }
}
