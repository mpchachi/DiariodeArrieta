// Registro de una partida del Runner: señal de pinza, ciclos, saltos y obstáculos.
// Puro (sin DOM). No guarda imágenes ni vídeo; landmarks solo si se pide.

import { RUNNER_CONFIG } from './config.js';

const median = values => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const cv = v => {
  const m = mean(v);
  if (v.length < 2 || !m) return null;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / m;
};
const round = (v, d = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const thirdsChangePct = values => {
  const v = values.filter(Number.isFinite);
  if (v.length < 6) return null;
  const n = Math.floor(v.length / 3);
  const first = mean(v.slice(0, n)), last = mean(v.slice(-n));
  return first ? round((last - first) / first * 100, 1) : null;
};

export class RunnerSession {
  constructor({ hand, subjectId = null, season = 0, startedAt = 0, course, recordLandmarks = false, C = RUNNER_CONFIG }) {
    this.C = C; this.hand = hand; this.subjectId = subjectId; this.season = season; this.start = startedAt;
    this.samples = []; this.cycles = []; this.frames = recordLandmarks ? [] : null;
    this.validMs = 0; this.validFrames = 0; this.losses = 0; this.last = null; this.inGap = false;
    this.pauses = []; this.freeJumps = 0; this.berriesCollected = new Set();
    this.berriesTotal = course.berries.length;
    this.obstacles = course.obstacles.map(o => ({ id: o.id, takeoffAtMs: null, offsetPx: null, idealPx: null,
      timingErrorMs: null, extraJumps: 0, cleared: null }));
  }

  addSample(frame, m, state) {
    const C = this.C.pinch;
    const t = frame.t - this.start;
    if (t < 0 || (this.last && t <= this.last.t) || this.samples.length >= C.maxSamples) return;
    const valid = !!(m.valid && m.eligible);
    const dt = this.last ? t - this.last.t : 0;
    if (valid && this.last?.valid && dt <= C.maxGapMs) this.validMs += dt;
    if (valid) this.validFrames++;
    if ((!valid || dt > C.maxGapMs) && !this.inGap) { this.inGap = true; this.losses++; }
    if (valid && dt <= C.maxGapMs) this.inGap = false;
    this.samples.push({ t: round(t, 1), ratio: m.valid ? round(m.ratio, 4) : null, eligible: valid,
      reason: m.reason, quality: m.quality ?? m.reason, state: state.state, latencyMs: round(frame.latencyMs, 1) });
    if (this.frames) this.frames.push({ t, width: frame.width, height: frame.height, hands: frame.hands });
    const ev = state.event;
    if (ev?.type === 'grab') {
      this.cycles.push({ grabAt: round(ev.t - this.start, 1), closingMs: round(ev.closingMs, 1),
        closingExcursion: round(ev.maximum - ev.ratio, 4),
        // Apertura máxima antes de esta pinza (palmas) y si llegó a abrir del todo.
        openingPalm: round(ev.maximum, 4), fullOpen: ev.fullOpen ?? null,
        holdMs: null, amplitude: null, durationMs: null });
    }
    if (ev?.type === 'release') {
      const c = this.cycles.at(-1);
      if (c && c.holdMs === null) Object.assign(c, { holdMs: round(ev.holdMs, 1), amplitude: round(ev.amplitude, 4), durationMs: round(ev.durationMs, 1) });
    }
    this.last = { t, valid };
  }

  jump({ obstacleId, gameMs, offsetPx, idealPx }) {
    const o = this.obstacles.find(x => x.id === obstacleId);
    if (!o) { this.freeJumps++; return; }
    if (o.takeoffAtMs !== null) { o.extraJumps++; return; }
    Object.assign(o, { takeoffAtMs: round(gameMs, 1), offsetPx: round(offsetPx, 1), idealPx: round(idealPx, 1),
      timingErrorMs: round((idealPx - offsetPx) / this.C.speed * 1000, 1) });
  }

  resolveObstacle(id, cleared) {
    const o = this.obstacles.find(x => x.id === id);
    if (o && o.cleared === null) o.cleared = cleared;
  }

  berry(id) { this.berriesCollected.add(id); }
  pause(gameMs, reason) { this.pauses.push({ atMs: round(gameMs, 1), reason, durationMs: null }); }
  resume(durationMs) {
    const p = this.pauses.at(-1);
    if (p && p.durationMs === null) p.durationMs = round(durationMs, 1);
  }

  summary() {
    const obs = this.obstacles;
    const jumped = obs.filter(o => o.timingErrorMs !== null);
    const done = this.cycles.filter(c => c.amplitude !== null);
    const speeds = this.cycles.map(c => (c.closingMs > 0 ? c.closingExcursion / c.closingMs * 1000 : null));
    return {
      obstacles: { total: obs.length, cleared: obs.filter(o => o.cleared).length, jumped: jumped.length },
      berries: { total: this.berriesTotal, collected: this.berriesCollected.size },
      timing: {
        medianAbsErrorMs: round(median(jumped.map(o => Math.abs(o.timingErrorMs))), 0),
        medianSignedErrorMs: round(median(jumped.map(o => o.timingErrorMs)), 0),
        note: 'Positivo = salto adelantado respecto al centro de la ventana de despegue.',
      },
      pinch: {
        cycles: this.cycles.length,
        completedCycles: done.length,
        medianAmplitudePalm: round(median(done.map(c => c.amplitude))),
        amplitudeCv: round(cv(done.map(c => c.amplitude))),
        medianClosingMs: round(median(this.cycles.map(c => c.closingMs)), 0),
        medianClosingSpeedPalmPerS: round(median(speeds)),
        medianHoldMs: round(median(done.map(c => c.holdMs)), 0),
        medianCycleMs: round(median(done.map(c => c.durationMs)), 0),
        // Aperturas entre pinzas que no llegan a «abierta del todo» (openRatio). El primer
        // ciclo no cuenta: su apertura es la de la preparación.
        medianOpeningPalm: round(median(this.cycles.slice(1).map(c => c.openingPalm))),
        incompleteOpenings: this.cycles.slice(1).filter(c => c.fullOpen === false).length,
        openingsMeasured: Math.max(0, this.cycles.length - 1),
      },
      fatigue: {
        amplitudeChangePct: thirdsChangePct(done.map(c => c.amplitude)),
        closingSpeedChangePct: thirdsChangePct(speeds),
        note: 'Último tercio frente al primero. Exploratorio.',
      },
      freeJumps: this.freeJumps,
    };
  }

  finish(endedAt, gameMs, completed) {
    const C = this.C.pinch;
    const durationMs = Math.max(0, endedAt - this.start);
    const times = this.samples.filter(s => s.reason !== 'stalled').map(s => s.t);
    const span = times.length > 1 ? times.at(-1) - times[0] : 0;
    const fps = span > 0 ? (times.length - 1) * 1000 / span : 0;
    const validCoverage = durationMs > 0 ? Math.min(1, this.validMs / durationMs) : 0;
    const pausedMs = this.pauses.reduce((s, p) => s + (p.durationMs || 0), 0);
    return {
      schemaVersion: 1, protocol: this.C.protocol, algorithmVersion: this.C.algorithm,
      createdAt: new Date().toISOString(), subjectId: this.subjectId, hand: this.hand,
      season: this.season, completed, durationMs: round(durationMs, 0), playMs: round(gameMs, 0),
      quality: { validCoverage: round(validCoverage), validFrames: this.validFrames, attemptedFrames: times.length,
        fps: round(fps, 1), losses: this.losses, pauses: this.pauses.length, pausedMs: round(pausedMs, 0),
        sufficient: validCoverage >= C.minTrialCoverage && fps >= C.minCaptureFps },
      summary: this.summary(),
      clinicalScore: null,
      disclaimer: 'Medidas exploratorias de movimiento. No es un diagnóstico ni una puntuación clínica validada.',
      obstacles: this.obstacles, cycles: this.cycles,
      pauses: this.pauses, samples: this.samples,
      ...(this.frames ? { landmarkFrames: this.frames } : {}),
      config: this.C,
    };
  }
}
