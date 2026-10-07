// Del resultado de cada capítulo del viaje a una fila de `game_results` (Supabase).
// Puro (sin DOM). Cada fila lleva:
//   · columnas consultables del esquema (pinza, apertura, rango, velocidad, SPARC,
//     temblor, variabilidad, fatiga, calidad…), en las unidades del esquema;
//   · `metrics_display`: los valores que pinta el dashboard del médico en cada dominio
//     (mismo formato que los juegos antiguos: pinza → «slingshot», puño → «flappy»,
//     giro → «water»), para que el dashboard funcione sin cambios de cálculo;
//   · `outcome` y `repetitions`: resumen del juego y una fila por repetición.
// Las métricas son exploratorias (no diagnósticas), como indica el catálogo del Excel.

import { computeSPARCFromProfile } from '../clinical/metrics.js';

export const GAME_KEYS = Object.freeze({ runner: 'fox_runner', flappy: 'fox_balloon', garden: 'fox_garden' });
// Longitud media de la palma adulta (muñeca → nudillo medio) para convertir «palmas» a mm (aprox.).
const PALM_MM = 95;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, d = 2) => (num(v) === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = a => { const v = a.filter(x => num(x) !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const median = a => { const v = a.filter(x => num(x) !== null).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const cv = a => { const v = a.filter(x => num(x) !== null); const m = mean(v); if (v.length < 2 || !m) return null; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / Math.abs(m); };
const pct = (a, p) => { const v = a.filter(x => num(x) !== null).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.round(p / 100 * (v.length - 1)))] : null; };
const smallint = v => (num(v) === null ? null : clamp(Math.round(v), -32768, 32767));

// Serie temporal [{t (ms), v}] → perfil de velocidad |dv/dt| (unidades/s) a ~30 Hz.
function speedProfile(series, scale = 1) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const dt = (series[i].t - series[i - 1].t) / 1000;
    if (dt > 0 && dt < 0.25 && num(series[i].v) !== null && num(series[i - 1].v) !== null) out.push(Math.abs(series[i].v - series[i - 1].v) / dt * scale);
  }
  return out;
}
// Movimientos: tramos contiguos con velocidad > 10 % del pico (≥ 6 muestras, ≈ 200 ms).
function movementSegments(series) {
  const sp = speedProfile(series);
  const peak = Math.max(0, ...sp), thr = peak * 0.1, segs = [];
  let cur = [];
  for (const v of sp) { if (v > thr) cur.push(v); else { if (cur.length >= 6) segs.push(cur); cur = []; } }
  if (cur.length >= 6) segs.push(cur);
  return segs;
}
// SPARC por movimiento (suavidad; más cercano a 0 = más suave). Escalado para que el pico supere 1.
function sparcPerMovement(series) {
  return movementSegments(series).map(seg => { const pk = Math.max(...seg); return computeSPARCFromProfile([0, ...seg.map(v => v / pk * 100), 0]); })
    .filter(v => num(v) !== null && v < 0);
}
const sparc = series => round(median(sparcPerMovement(series)), 3);
// Temblor: RMS del residuo respecto a una media móvil corta (±2 muestras ≈ ±70 ms), SOLO en
// tramos quietos (el rango de la ventana no supera `still`): los movimientos voluntarios
// rápidos (pinzar, cerrar el puño, verter) no cuentan como temblor.
function tremorRms(series, still) {
  const v = series.map(s => s.v);
  if (v.length < 15) return null;
  const res = [];
  for (let i = 2; i < v.length - 2; i++) {
    const w = [v[i - 2], v[i - 1], v[i], v[i + 1], v[i + 2]];
    if (w.some(x => num(x) === null) || Math.max(...w) - Math.min(...w) > still) continue;
    res.push(v[i] - mean(w));
  }
  return res.length >= 10 ? Math.sqrt(mean(res.map(x => x * x))) : null;
}
const tremorBand = level => (level === null ? null : level > 3.5 ? 'pathological' : level > 1.5 ? 'physiological' : 'none');
// Submovimientos: picos locales de velocidad por encima del 20 % del máximo (1 = gesto limpio).
function submovements(series) {
  const sp = speedProfile(series);
  if (sp.length < 5) return null;
  const peak = Math.max(...sp), thr = peak * 0.2;
  let n = 0;
  for (let i = 1; i < sp.length - 1; i++) if (sp[i] > thr && sp[i] >= sp[i - 1] && sp[i] > sp[i + 1]) n++;
  return Math.max(1, n);
}

// ── Capítulo 1: La carrera (pinza) → dominio «pinza / agarre» ──
export function runnerRow(r) {
  const s = r.summary, p = s.pinch, cycles = r.cycles || [];
  const ratio = (r.samples || []).filter(x => x.eligible && num(x.ratio) !== null).map(x => ({ t: x.t, v: x.ratio }));
  const closed = (r.samples || []).filter(x => x.state === 'closed' && num(x.ratio) !== null).map(x => x.ratio);
  const tremor = tremorRms(ratio, 0.08), tremorLevel = tremor === null ? null : clamp(tremor * 100, 0, 6);
  const closingSpeeds = cycles.map(c => (c.closingMs > 0 ? c.closingExcursion / c.closingMs * 1000 : null));
  const openings = cycles.map(c => c.openingPalm);
  return {
    game_key: GAME_KEYS.runner,
    duration_ms: Math.round(r.durationMs || 0),
    pinch_count: smallint(p.cycles),
    pinch_distance_mean_mm: round(median(closed) === null ? null : median(closed) * PALM_MM, 1),
    pinch_distance_max_mm: round(pct(openings, 100) === null ? null : pct(openings, 100) * PALM_MM, 1),
    grip_aperture_mean_mm: round(p.medianOpeningPalm === null || p.medianOpeningPalm === undefined ? null : p.medianOpeningPalm * PALM_MM, 1),
    grip_aperture_cv: round(p.amplitudeCv, 3),
    session_sparc: sparc(ratio), sparc_mean: round(mean(sparcPerMovement(ratio)), 3),
    tremor_amp_mean: round(tremor, 4), tremor_band: tremorBand(tremorLevel),
    rep_count: smallint(cycles.length),
    mean_duration_ms: round(p.medianCycleMs, 0),
    duration_cv: round(cv(cycles.map(c => c.durationMs)), 3),
    peak_velocity_cv: round(cv(closingSpeeds), 3),
    mean_peak_velocity: round(median(closingSpeeds) === null ? null : median(closingSpeeds) * PALM_MM, 1), // mm/s
    fatigue_index: round(num(s.fatigue?.amplitudeChangePct) === null ? null : clamp(s.fatigue.amplitudeChangePct, -100, 100), 1),
    quality_frames_pct: round((r.quality?.validCoverage ?? 0) * 100, 1),
    avg_fps: round(r.quality?.fps, 1),
    metrics_display: {
      maxPinchOpen: round(clamp(pct(openings, 100) ?? 0, 0, 1), 3),
      maxPullDistance: round(clamp((p.medianClosingSpeedPalmPerS ?? 0) * 80, 0, 500), 1),
      pullTremor: round(tremorLevel ?? 0, 2),
      accuracyRatio: round(s.obstacles.total ? s.obstacles.cleared / s.obstacles.total : 0, 3),
      totalShots: p.cycles ?? 0,
    },
    outcome: {
      completed: !!r.completed, obstacles: s.obstacles,
      incompleteOpenings: p.incompleteOpenings ?? null, openingsMeasured: p.openingsMeasured ?? null,
      timingMedianAbsErrorMs: s.timing?.medianAbsErrorMs ?? null, medianHoldMs: p.medianHoldMs ?? null,
    },
    repetitions: cycles.map((c, i) => ({ index: i, opening_palm: round(c.openingPalm, 3), full_open: c.fullOpen ?? null,
      closing_ms: round(c.closingMs, 0), hold_ms: round(c.holdMs, 0), duration_ms: round(c.durationMs, 0), amplitude_palm: round(c.amplitude, 3) })),
  };
}

// ── Capítulo 2: El globo (puño) → dominio «flexo-extensión» ──
export function flappyRow(r) {
  const m = r.metrics || {}, s = r.summary || {};
  const strength = (r.frames || []).filter(f => f.phase === 'playing' && num(f.fistStrength) !== null).map(f => ({ t: f.timestamp, v: f.fistStrength }));
  const tremor = tremorRms(strength, 0.12), tremorLevel = tremor === null ? null : clamp(tremor * 60, 0, 6);
  const minutes = Math.max(0.1, (r.durationMs || 0) / 60000);
  const subs = movementSegments(strength).length && m.activationCount ? movementSegments(strength).length / m.activationCount : null;
  return {
    game_key: GAME_KEYS.flappy,
    duration_ms: Math.round(r.durationMs || 0),
    hand_open_pct_p90: round((1 - (m.maxExtension ?? 0)) * 100, 1), // apertura máxima de la mano (100 = abierta del todo)
    hand_open_pct_p10: round((1 - (m.maxFlexion ?? 0)) * 100, 1), // cierre máximo (0 = puño completo)
    session_sparc: sparc(strength), sparc_mean: round(mean(sparcPerMovement(strength)), 3),
    tremor_amp_mean: round(tremor, 4), tremor_band: tremorBand(tremorLevel),
    rep_count: smallint(m.activationCount),
    // fatigueIndex original = diferencia de fuerza máxima (0–1) último cuarto − primero → en %.
    fatigue_index: round((m.fatigueIndex ?? 0) * 100, 1),
    quality_frames_pct: round((r.quality?.trackedCoverage ?? 0) * 100, 1),
    // Escalas del dashboard: activaciones por minuto (0–60), fatiga en % y brusquedad como
    // submovimientos extra por cierre de puño (0–6; 0 = cada cierre es un gesto limpio).
    metrics_display: {
      // El detector guarda la fuerza MÍNIMA (0 = mano abierta); el dashboard espera capacidad de
      // extensión (1 = abre del todo), igual que los juegos antiguos.
      maxExtension: round(1 - (m.maxExtension ?? 1), 3), maxFlexion: round(m.maxFlexion ?? 0, 3),
      activationCount: Math.round(clamp((m.activationCount ?? 0) / minutes, 0, 60)),
      fatigueIndex: round(clamp((m.fatigueIndex ?? 0) * 100, -100, 100), 1),
      smoothnessJerk: round(subs === null ? 0 : clamp(subs - 1, 0, 6), 2),
    },
    outcome: { completed: !!r.completed, columns: s.columns ?? null, floorTouches: s.floorTouches ?? null,
      activations: m.activationCount ?? 0, rawJerk: round(m.smoothnessJerk, 1) },
    repetitions: (r.columns || []).map(c => ({ index: c.id, passed: !!c.passed, hit: !!c.hit })),
  };
}

// ── Capítulo 3: El huerto (giro) → dominio «pronosupinación» ──
export function gardenRow(r) {
  const s = r.summary || {}, flowers = r.flowers || [], sign = r.pourSign ?? -1;
  // Señal de giro hacia el lado de verter (+ = pronación) por flor.
  const series = flowers.map(f => (f.signal || []).map(([t, rel]) => ({ t, v: sign * rel })));
  const all = series.flat();
  const maxSup = Math.max(0, ...flowers.map(f => f.peakOppositeDeg ?? 0));
  const subs = series.map(submovements).filter(v => v !== null);
  const velocities = flowers.map(f => f.peakVelocityOutDegS);
  const wrong = flowers.filter(f => (f.peakOppositeDeg ?? 0) > 15).length;
  const tremor = tremorRms(all, 6);
  return {
    game_key: GAME_KEYS.garden,
    duration_ms: Math.round(r.durationMs || 0),
    max_pronation_deg: round(s.maxTiltDeg, 1),
    max_supination_deg: round(maxSup, 1),
    rom_deg_p90: round((s.maxTiltDeg ?? 0) + maxSup, 1),
    mean_peak_velocity: round(median(velocities), 1), // °/s
    peak_velocity_cv: round(cv(velocities), 3),
    session_sparc: sparc(all),
    sparc_mean: round(mean(sparcPerMovement(all)), 3),
    tremor_amp_mean: round(tremor, 3), tremor_band: tremorBand(tremor === null ? null : clamp(tremor, 0, 6)),
    rep_count: smallint(s.flowersBloomed),
    mean_duration_ms: round(s.medianTimeToBloomMs, 0),
    duration_cv: round(cv(flowers.map(f => f.timeToBloomMs)), 3),
    fatigue_index: round(s.fatigue?.peakTiltChangePct, 1),
    quality_frames_pct: round((r.quality?.trackedCoverage ?? 0) * 100, 1),
    metrics_display: {
      maxSupination: round(maxSup, 1), maxPronation: round(s.maxTiltDeg ?? 0, 1),
      smoothnessJerk: round(subs.length ? clamp(mean(subs) - 1, 0, 6) : 0, 2),
      waterAccuracy: round(s.flowersTotal ? s.flowersBloomed / s.flowersTotal * 100 : 0, 1),
      poisonError: round(flowers.length ? wrong / flowers.length * 50 : 0, 1),
      averagePouringTime: round(s.medianTimeToBloomMs ?? 0, 0),
    },
    outcome: { completed: !!r.completed, flowersBloomed: s.flowersBloomed, flowersTotal: s.flowersTotal, hand: r.hand ?? null,
      adapted: !!s.adapted, finalPourStartDeg: s.finalPourStartDeg ?? null, compensationFlowers: s.compensationFlowers ?? null },
    repetitions: flowers.map(f => ({ index: f.index, kind: f.kind, peak_tilt_deg: f.peakTiltDeg, peak_opposite_deg: f.peakOppositeDeg,
      time_to_bloom_ms: f.timeToBloomMs, return_ms: f.returnMs, peak_velocity_out: f.peakVelocityOutDegS, peak_velocity_back: f.peakVelocityBackDegS })),
  };
}

// Resultados del viaje → filas listas para insertar (sin session_id), en orden de juego.
export function buildJourneyRows(results) {
  const rows = [];
  const add = (fn, res) => { if (res) rows.push({ ...fn(res), play_order: rows.length + 1 }); };
  add(runnerRow, results.runner);
  add(flappyRow, results.flappy);
  add(gardenRow, results.garden);
  return rows;
}
