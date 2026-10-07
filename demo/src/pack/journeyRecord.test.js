import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJourneyRows, gardenRow, GAME_KEYS } from './journeyRecord.js';
import { summarize } from '../garden/session.js';

// Columnas reales de public.game_results (migración 001): ninguna fila puede traer otras.
const COLUMNS = new Set(`game_key play_order duration_ms pinch_count pinch_distance_mean_mm pinch_distance_max_mm tripod_quality_mean
  thumb_opposition_mean grip_aperture_mean_mm grip_aperture_cv hand_open_pct_p90 hand_open_pct_p10 hand_opening_speed_p75
  fingers_extended_max fingers_extended_mean index_extension_p75 finger_individuation_mean rom_deg_p90 rom_norm_mean
  max_supination_deg max_pronation_deg palm_speed_mean palm_speed_p75 mean_peak_velocity peak_velocity_ratio_mean session_sparc
  sparc_mean sparc_cv sparc_worst tremor_amp_mean tremor_freq_hz tremor_band intention_tremor_mean rep_count duration_cv
  peak_velocity_cv mean_velocity_cv mean_duration_ms bve_value endpoint_accuracy endpoint_max_error reaction_time_mean_ms
  reaction_time_median_ms reaction_time_cv reaction_time_count fatigue_index asymmetry_mean asymmetry_readings cri_score
  cri_level quality_frames_pct avg_fps repetitions outcome metrics_display`.split(/\s+/));

const runner = {
  durationMs: 36000, completed: true, quality: { validCoverage: 0.95, fps: 30 },
  summary: { obstacles: { total: 5, cleared: 4 }, pinch: { cycles: 5, medianOpeningPalm: 0.8, amplitudeCv: 0.1, medianCycleMs: 5000,
    medianClosingSpeedPalmPerS: 3, incompleteOpenings: 1, openingsMeasured: 4 }, timing: { medianAbsErrorMs: 120 }, fatigue: { amplitudeChangePct: -12 } },
  cycles: [0.8, 0.7, 0.75, 0.6, 0.65].map((o, i) => ({ openingPalm: o, closingMs: 300, closingExcursion: 0.5, amplitude: 0.5, holdMs: 200, durationMs: 4800 + i * 100, fullOpen: o > 0.62 })),
  samples: Array.from({ length: 600 }, (_, i) => ({ t: i * 33, eligible: true, state: i % 150 < 20 ? 'closed' : 'open', ratio: i % 150 < 20 ? 0.12 : 0.7 + Math.sin(i / 3) * 0.004 })),
};
const flappy = {
  durationMs: 33000, completed: true, quality: { trackedCoverage: 0.93 },
  metrics: { maxExtension: 0.05, maxFlexion: 0.95, activationCount: 11, fatigueIndex: -0.1, smoothnessJerk: 1500 },
  summary: { columns: { total: 5, passed: 5, cleared: 5, hits: 0 }, floorTouches: 0 }, columns: [{ id: 0, passed: true }],
  frames: Array.from({ length: 900 }, (_, i) => ({ timestamp: i * 33, phase: 'playing', fistStrength: 0.5 + 0.45 * Math.sin(i / 15) })),
};

test('filas del viaje: claves de juego, orden, solo columnas del esquema', () => {
  const garden = { durationMs: 30000, completed: true, pourSign: -1, quality: { trackedCoverage: 0.9 },
    summary: { flowersBloomed: 5, flowersTotal: 5, maxTiltDeg: 60, medianTimeToBloomMs: 2500, fatigue: { peakTiltChangePct: -5 } },
    flowers: Array.from({ length: 5 }, (_, k) => ({ index: k, peakTiltDeg: 55, peakOppositeDeg: k === 0 ? 20 : 3, timeToBloomMs: 2500, peakVelocityOutDegS: 120,
      signal: Array.from({ length: 60 }, (_, i) => [i * 33, -55 * Math.sin(Math.PI * i / 59)]) })) };
  const rows = buildJourneyRows({ runner, flappy, garden });
  assert.deepEqual(rows.map(r => [r.game_key, r.play_order]), [[GAME_KEYS.runner, 1], [GAME_KEYS.flappy, 2], [GAME_KEYS.garden, 3]]);
  for (const r of rows) for (const k of Object.keys(r)) assert.ok(COLUMNS.has(k), `columna desconocida ${k}`);
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${r.game_key}.${k} no finito`);
});

test('filas del viaje: escalas del dashboard (como los juegos antiguos)', () => {
  const [run, bal] = buildJourneyRows({ runner, flappy });
  assert.equal(run.metrics_display.accuracyRatio, 0.8);
  assert.ok(run.metrics_display.pullTremor >= 0 && run.metrics_display.pullTremor <= 6);
  assert.equal(run.outcome.incompleteOpenings, 1);
  assert.equal(run.fatigue_index, -12);
  // Globo: extensión = capacidad de abrir (1 − fuerza mínima), activaciones/min, fatiga en %, brusquedad 0–6.
  assert.equal(bal.metrics_display.maxExtension, 0.95);
  assert.equal(bal.metrics_display.activationCount, 20);
  assert.equal(bal.metrics_display.fatigueIndex, -10);
  assert.ok(bal.metrics_display.smoothnessJerk >= 0 && bal.metrics_display.smoothnessJerk <= 6);
  assert.equal(bal.hand_open_pct_p90, 95);
});

test('capítulos saltados: solo se suben los jugados y el orden sigue siendo consecutivo', () => {
  const rows = buildJourneyRows({ runner: null, flappy, garden: null });
  assert.deepEqual(rows.map(r => [r.game_key, r.play_order]), [[GAME_KEYS.flappy, 1]]);
  assert.deepEqual(buildJourneyRows({}), []);
});

test('huerto: resultado con el formato real del juego (summarize) → pronación, supinación y errores de sentido', () => {
  const raw = Array.from({ length: 5 }, (_, k) => ({ index: k, kind: 'tulip', peakTiltDeg: 50 + k, peakOppositeDeg: k === 2 ? 22 : 4,
    readyAt: k * 6000, pourStartAt: k * 6000 + 400, bloomAt: k * 6000 + 2600, returnAt: k * 6000 + 3200, pourMs: 2200,
    peakVelIn: 110, peakVelOut: 90, startThresholdDeg: 25, compensation: false,
    samples: Array.from({ length: 60 }, (_, i) => [k * 6000 + i * 33, -(50 + k) * Math.sin(Math.PI * i / 59)]) }));
  const res = { durationMs: 30000, completed: true, hand: 'Right', quality: { trackedCoverage: 0.95 },
    ...summarize({ flowers: raw, neutral: 0, pourSign: -1, pourStart: 25 }) };
  const row = gardenRow(res);
  assert.equal(row.game_key, 'fox_garden');
  assert.equal(row.max_pronation_deg, 54);
  assert.equal(row.max_supination_deg, 22);
  assert.equal(row.rom_deg_p90, 76);
  assert.equal(row.metrics_display.waterAccuracy, 100);
  assert.equal(row.metrics_display.poisonError, 10); // 1 de 5 flores con giro al lado contrario > 15°
  assert.equal(row.metrics_display.smoothnessJerk, 0); // giro limpio: un solo submovimiento por flor
  assert.equal(row.repetitions.length, 5);
});
