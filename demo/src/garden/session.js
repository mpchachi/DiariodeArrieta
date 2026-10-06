// Resumen y registro de una partida del huerto. Se guarda la señal completa de
// inclinación por flor (para análisis clínico posterior) y métricas básicas.
// Puro (sin DOM). No guarda imágenes ni vídeo.

import { GARDEN_CONFIG } from './config.js';

const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = a => {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const changePct = vals => {
  const v = vals.filter(Number.isFinite);
  if (v.length < 4) return null;
  const a = mean(v.slice(0, 2)), b = mean(v.slice(-2));
  return a ? round((b - a) / Math.abs(a) * 100) : null;
};

export function flowerMetrics(f) {
  return {
    index: f.index, kind: f.kind,
    peakTiltDeg: round(f.peakTiltDeg), peakOppositeDeg: round(f.peakOppositeDeg),
    timeToPourMs: f.pourStartAt !== null ? round(f.pourStartAt - f.readyAt, 0) : null,
    timeToBloomMs: f.bloomAt !== null ? round(f.bloomAt - f.readyAt, 0) : null,
    returnMs: f.returnAt !== null && f.bloomAt !== null ? round(f.returnAt - f.bloomAt, 0) : null,
    pourMs: round(f.pourMs, 0), peakVelocityOutDegS: round(f.peakVelIn), peakVelocityBackDegS: round(f.peakVelOut),
    startThresholdDeg: round(f.startThresholdDeg), compensation: f.compensation,
    signal: f.samples,
  };
}

export function summarize(engine, extra = {}, C = GARDEN_CONFIG) {
  const flowers = engine.flowers.filter(f => f?.bloomAt !== null && f?.bloomAt !== undefined).map(flowerMetrics);
  const peaks = flowers.map(f => f.peakTiltDeg);
  return {
    schemaVersion: 1, protocol: C.protocol, algorithmVersion: C.algorithm, game: 'garden',
    createdAt: new Date().toISOString(), ...extra,
    neutralDeg: round(engine.neutral), pourSign: engine.pourSign,
    summary: {
      flowersBloomed: flowers.length, flowersTotal: C.flowers.length,
      maxTiltDeg: peaks.length ? round(Math.max(...peaks)) : null,
      medianPeakTiltDeg: round(median(peaks)),
      medianTimeToBloomMs: round(median(flowers.map(f => f.timeToBloomMs)), 0),
      medianPeakVelocityOutDegS: round(median(flowers.map(f => f.peakVelocityOutDegS))),
      medianPeakVelocityBackDegS: round(median(flowers.map(f => f.peakVelocityBackDegS))),
      finalPourStartDeg: round(engine.pourStart), adapted: engine.pourStart < C.pourStartDeg,
      compensationFlowers: flowers.filter(f => f.compensation).length,
      fatigue: { peakTiltChangePct: changePct(peaks), note: 'Últimas 2 flores frente a las 2 primeras. Exploratorio.' },
    },
    clinicalScore: null,
    disclaimer: 'Señal de inclinación de la mano (pronación hacia el lado de verter +, supinación −) para análisis posterior. No es un diagnóstico.',
    flowers, config: C,
  };
}
