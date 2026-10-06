// Resumen y registro de una partida de pesca. Métricas pensadas sobre los ítems de
// muñeca del Fugl-Meyer (sin resistencia): rango de extensión/flexión, mantener la
// muñeca extendida (tiempo en zona, estabilidad, temblor), repeticiones y fatiga.
// Puro (sin DOM). No guarda imágenes ni vídeo.

import { FISHING_CONFIG } from './config.js';

const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = a => {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };

// Temblor: RMS de la señal menos su media móvil (±150 ms) mientras mantiene la zona.
export function tremorDeg(samples, halfWindowMs = 150) {
  if (samples.length < 8) return null;
  const res = samples.map((s, i) => {
    const near = samples.filter(o => Math.abs(o.t - s.t) <= halfWindowMs);
    return s.rel - mean(near.map(o => o.rel));
  });
  return Math.sqrt(mean(res.map(v => v * v)));
}

const changePct = (vals) => {
  const v = vals.filter(Number.isFinite);
  if (v.length < 4) return null;
  const n = Math.floor(v.length / 3) || 1, a = mean(v.slice(0, n)), b = mean(v.slice(-n));
  return a ? round((b - a) / Math.abs(a) * 100) : null;
};

export function roundMetrics(r) {
  const holds = r.holdSamples.map(s => s.rel);
  return {
    index: r.index, fish: r.fish, band: r.band?.map(v => round(v)) ?? null,
    castFlexionDeg: round(r.castFlexionDeg),
    reactionMs: r.biteAt !== null && r.onsetAt !== null ? round(r.onsetAt - r.biteAt, 0) : null,
    hookTimeMs: r.biteAt !== null && r.hookAt !== null ? round(r.hookAt - r.biteAt, 0) : null,
    peakVelocityDegS: round(r.peakVelocity),
    peakExtensionDeg: round(r.peakExtensionDeg),
    reelMs: round(r.reelMs, 0), inBandRatio: r.reelMs > 0 ? round(r.inBandMs / r.reelMs, 3) : null,
    holdMeanDeg: round(mean(holds)), holdSdDeg: round(sd(holds), 2), tremorDeg: round(tremorDeg(r.holdSamples), 2),
    missedBites: r.missedBites, compensation: r.compensation,
  };
}

export function summarize(engine, extra = {}, C = FISHING_CONFIG) {
  const rounds = engine.rounds.filter(r => r.caughtAt !== null).map(roundMetrics);
  const cal = engine.calib;
  const exts = [cal.maxRel, ...rounds.map(r => r.peakExtensionDeg)].filter(Number.isFinite);
  const flexes = [-cal.minRel, ...rounds.map(r => r.castFlexionDeg)].filter(Number.isFinite);
  return {
    schemaVersion: 1, protocol: C.protocol, algorithmVersion: C.algorithm, game: 'fishing',
    createdAt: new Date().toISOString(), ...extra,
    calibration: { neutralDeg: round(cal.neutral), extensionRangeDeg: round(cal.extRange), flexionRangeDeg: round(cal.flexRange), lowRange: cal.lowRange },
    summary: {
      fishCaught: rounds.length, fishTotal: C.sequence.length,
      maxExtensionDeg: round(Math.max(...exts)), maxFlexionDeg: round(Math.max(...flexes)),
      reachesFmaStability15: Math.max(...exts) >= 15,
      medianReactionMs: round(median(rounds.map(r => r.reactionMs)), 0),
      medianPeakVelocityDegS: round(median(rounds.map(r => r.peakVelocityDegS))),
      medianInBandRatio: round(median(rounds.map(r => r.inBandRatio)), 3),
      medianHoldSdDeg: round(median(rounds.map(r => r.holdSdDeg)), 2),
      medianTremorDeg: round(median(rounds.map(r => r.tremorDeg)), 2),
      missedBites: engine.rounds.reduce((s, r) => s + (r?.missedBites ?? 0), 0),
      compensationRounds: rounds.filter(r => r.compensation).length,
      fatigue: {
        peakExtensionChangePct: changePct(rounds.map(r => r.peakExtensionDeg)),
        holdSdChangePct: changePct(rounds.map(r => r.holdSdDeg)),
        note: 'Último tercio frente al primero. Exploratorio.',
      },
    },
    clinicalScore: null,
    disclaimer: 'Medidas exploratorias de movimiento inspiradas en los ítems de muñeca del Fugl-Meyer, sin resistencia. No es un diagnóstico.',
    rounds, config: C,
  };
}
