// Registro de una partida del Flappy. Las métricas son las de FlappyVaina
// (BiomechanicsDSP.processFlappyMetrics), con los nombres que espera el
// dashboard clínico (FlappyMetrics), más contexto de calidad y recorrido.
// Puro (sin DOM). No guarda imágenes ni vídeo.

import { FLAPPY_CONFIG } from './config.js';

const round = (v, d = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export function processFlappyMetrics(frames, C = FLAPPY_CONFIG.fist) {
  const active = frames.filter(f => f.phase === 'playing' && Number.isFinite(f.fistStrength));
  if (active.length < 10) return { maxExtension: 0, maxFlexion: 0, activationCount: 0, fatigueIndex: 0, smoothnessJerk: 0 };
  const s = active.map(f => f.fistStrength);
  let activationCount = 0, squeezing = false;
  for (const v of s) {
    if (v > C.activationOn && !squeezing) { activationCount++; squeezing = true; }
    else if (v < C.activationOff) squeezing = false;
  }
  const quarter = Math.max(1, Math.floor(s.length / 4));
  const fatigueIndex = Math.max(...s.slice(-quarter)) - Math.max(...s.slice(0, quarter));
  let totalJerk = 0;
  for (let i = 3; i < active.length; i++) {
    const dt = (active[i].timestamp - active[i - 1].timestamp) / 1000;
    if (dt > 0.001) {
      const v1 = (s[i - 2] - s[i - 3]) / dt, v2 = (s[i - 1] - s[i - 2]) / dt, v3 = (s[i] - s[i - 1]) / dt;
      totalJerk += Math.abs(((v3 - v2) / dt - (v2 - v1) / dt) / dt);
    }
  }
  return { maxExtension: Math.min(...s), maxFlexion: Math.max(...s), activationCount, fatigueIndex, smoothnessJerk: totalJerk / active.length };
}

// Flexión real de los dedos (sin el recorte de la señal de control del juego): por fotograma,
// media de los 4 dedos de MCF + IFP + IFD en grados (landmarks 3D de MediaPipe, estimación).
// Percentiles 95 y 5 de la partida para que un fotograma suelto no marque el máximo o el mínimo.
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
export function fingerFlexionSummary(frames) {
  const v = frames.filter(f => f.phase === 'playing' && Number.isFinite(f.flexDeg)).map(f => f.flexDeg).sort((a, b) => a - b);
  if (v.length < 10) return null;
  const maxDeg = quantile(v, 0.95), minDeg = quantile(v, 0.05);
  return { maxDeg: round(maxDeg, 1), minDeg: round(minDeg, 1), arcDeg: round(maxDeg - minDeg, 1), frames: v.length };
}

export class FlappySession {
  constructor({ hand = null, subjectId = null, startedAt = 0, C = FLAPPY_CONFIG }) {
    this.C = C; this.hand = hand; this.subjectId = subjectId; this.start = startedAt;
    this.frames = []; this.columns = new Map(); this.pauses = []; this.floorTouches = 0;
    this.trackedFrames = 0; this.attemptedFrames = 0;
  }
  log(t, phase, { fistStrength = null, averageRatio = null, legacyStrength = null, planeY = null, tracked = false, flexDeg = null } = {}) {
    this.attemptedFrames++;
    if (tracked) this.trackedFrames++;
    if (this.frames.length < 20000) {
      this.frames.push({ timestamp: round(t - this.start, 1), phase, fistStrength: tracked ? round(fistStrength, 4) : undefined,
        averageRatio: tracked ? round(averageRatio, 4) : null, legacyStrength: tracked ? round(legacyStrength, 4) : null, planeY: round(planeY, 3),
        flexDeg: tracked ? round(flexDeg, 1) : null });
    }
  }
  column(id, patch) { this.columns.set(id, { id, ...this.columns.get(id), ...patch }); }
  floor() { this.floorTouches++; }
  pause(t, reason) { this.pauses.push({ at: round(t - this.start, 0), reason, durationMs: null }); }
  resume(durationMs) { const p = this.pauses.at(-1); if (p && p.durationMs === null) p.durationMs = round(durationMs, 0); }

  finish(endedAt, completed, engineState) {
    const cols = [...this.columns.values()];
    const total = engineState.columns.length;
    const coverage = this.attemptedFrames ? this.trackedFrames / this.attemptedFrames : 0;
    return {
      schemaVersion: 1, protocol: this.C.protocol, algorithmVersion: this.C.algorithm, game: 'flappy',
      createdAt: new Date().toISOString(), subjectId: this.subjectId, hand: this.hand, completed,
      durationMs: round(endedAt - this.start, 0),
      metrics: processFlappyMetrics(this.frames, this.C.fist),
      summary: {
        columns: { total, passed: cols.filter(c => c.passed).length, cleared: cols.filter(c => c.passed && !c.hit).length, hits: engineState.hits },
        floorTouches: this.floorTouches,
        fingerFlexion: fingerFlexionSummary(this.frames),
      },
      quality: { trackedCoverage: round(coverage), pauses: this.pauses.length, sufficient: coverage >= 0.85 },
      clinicalScore: null,
      disclaimer: 'Medidas exploratorias de movimiento. No es un diagnóstico ni una puntuación clínica validada.',
      columns: cols, pauses: this.pauses, frames: this.frames, config: this.C,
    };
  }
}
