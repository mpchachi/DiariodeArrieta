// Transforms the output of BiomarkerAccumulator.finalize() into the flat
// column format expected by the game_results table in Supabase.
//
// This is the critical bridge between the live metric pipeline and the database.
// Each field here maps to a direct column in game_results for queryable access.

function safeNum(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

// Columnas smallint de game_results: fuera de rango el insert falla y la sesión queda incompleta.
function smallint(v) {
  const n = safeNum(v);
  return n === null ? null : Math.max(-32768, Math.min(32767, Math.round(n)));
}

function percentile(arr, p) {
  if (!arr || !arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.round((p / 100) * (sorted.length - 1)), sorted.length - 1);
  return sorted[idx];
}

function mean(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Map internal game key ('slingshot','flappy','water') back to DB game_key
const GAME_KEY_MAP = {
  slingshot: 'pastillero',
  flappy: 'interruptores',
  water: 'jarra',
};
// Valores admitidos por el enum game_key_type de la base de datos.
const VALID_GAME_KEYS = new Set(['pastillero', 'jarra', 'interruptores', 'fox_runner', 'fox_balloon', 'fox_garden']);

function computeRepFatigue(reps) {
  if (!reps || reps.length < 6) return null;
  const n = Math.min(3, Math.floor(reps.length / 2));
  const firstPeaks = reps.slice(0, n).map(r => r.peakVelocity);
  const lastPeaks = reps.slice(-n).map(r => r.peakVelocity);
  const firstMean = mean(firstPeaks);
  const lastMean = mean(lastPeaks);
  if (!firstMean || firstMean <= 0) return null;
  const change = Math.round(((lastMean - firstMean) / firstMean) * 100);
  return Math.max(-100, Math.min(100, change));
}

function filterReactionTimes(rtStats) {
  if (!rtStats || !rtStats.count) return null;
  if (rtStats.mean < 120 || rtStats.mean > 3000) return null;
  if (rtStats.median < 120 || rtStats.median > 3000) return null;
  return rtStats;
}

export function transformGameResult(finalized, sessionId, playOrder, accumulator) {
  const gameKey = GAME_KEY_MAP[finalized.game] || finalized.game;
  if (!VALID_GAME_KEYS.has(gameKey)) throw new Error(`game_key desconocido: ${finalized.game}`);
  const stats = finalized.repetitionStats;
  const reps = finalized.repetitions || [];

  // Extract raw arrays from accumulator for percentile computation
  const handOpen = accumulator?.handOpen || [];
  const handOpeningSpeed = accumulator?.handOpeningSpeed || [];
  const indexExt = accumulator?.indexExt || [];
  const tremor = accumulator?.tremor || [];
  const speed = accumulator?.speed || [];
  const romDeg = accumulator?.romDeg || [];

  // Per-frame accumulated metrics
  const fingersExtended = accumulator?.fingersExtended || [];
  const fingerIndividuations = accumulator?.fingerIndividuations || [];
  const romNorms = accumulator?.romNorms || [];
  const tremorFreqs = accumulator?.tremorFreqs || [];
  const intentionTremors = accumulator?.intentionTremors || [];
  const pinchDistances = accumulator?.pinchDistances || [];

  // Compute values from accumulator
  const speedValues = speed.map(s => s.v);
  const pinchCount = accumulator?.pinchRises || 0;

  // Fatigue from repetitions (clinically valid: compare first 3 vs last 3 rep peaks)
  const fatigueFromReps = computeRepFatigue(reps);

  // Reaction times: filter physiologically impossible values
  const validRTs = filterReactionTimes(stats?.reactionTime);

  // SPARC per-rep is valid for pastillero and interruptores (1-8s movements).
  // Jarra rounds (12-14s) are too long for SPARC to discriminate.
  const sparcValid = gameKey !== 'jarra';
  const sparcMean = sparcValid ? (stats?.sparc?.mean ?? null) : null;
  const sparcCv = sparcValid ? (stats?.sparc?.cv ?? null) : null;
  const sparcWorst = sparcValid ? (stats?.sparc?.worst ?? null) : null;

  return {
    session_id: sessionId,
    game_key: gameKey,
    play_order: playOrder,
    duration_ms: Math.max(0, Math.round(safeNum(finalized.durationMs) ?? 0)),

    // A. Pinch & Grasp
    pinch_count: smallint(pinchCount),
    pinch_distance_mean_mm: safeNum(mean(pinchDistances)),
    pinch_distance_max_mm: pinchDistances.length ? safeNum(Math.max(...pinchDistances)) : null,
    tripod_quality_mean: null, // No current game evaluates tripod grasp
    thumb_opposition_mean: null, // No current game evaluates thumb-pinky opposition
    grip_aperture_mean_mm: stats?.gripApertureCV?.mean ?? null,
    grip_aperture_cv: stats?.gripApertureCV?.value ?? null,

    // B. Hand Opening & Extension
    hand_open_pct_p90: safeNum(percentile(handOpen, 90)),
    hand_open_pct_p10: safeNum(percentile(handOpen, 10)),
    hand_opening_speed_p75: safeNum(percentile(handOpeningSpeed, 75)),
    fingers_extended_max: fingersExtended.length ? smallint(Math.max(...fingersExtended)) : null,
    fingers_extended_mean: safeNum(mean(fingersExtended)),
    index_extension_p75: safeNum(percentile(indexExt, 75)),
    finger_individuation_mean: safeNum(mean(fingerIndividuations)),

    // C. Range of Motion
    rom_deg_p90: safeNum(percentile(romDeg, 90)),
    rom_norm_mean: safeNum(mean(romNorms)),
    max_supination_deg: finalized.metrics?.maxSupination ?? null,
    max_pronation_deg: finalized.metrics?.maxPronation ?? null,

    // D. Velocity & Kinematics
    palm_speed_mean: safeNum(mean(speedValues)),
    palm_speed_p75: safeNum(percentile(speedValues, 75)),
    mean_peak_velocity: stats?.meanPeakVelocity ?? null,
    peak_velocity_ratio_mean: stats?.peakVelocityRatio?.mean ?? null,

    // E. Smoothness (session_sparc disabled: SPARC over full game always saturates to -5)
    session_sparc: null,
    sparc_mean: sparcMean,
    sparc_cv: sparcCv,
    sparc_worst: sparcWorst,

    // F. Tremor
    tremor_amp_mean: safeNum(mean(tremor)),
    tremor_freq_hz: tremorFreqs.length ? safeNum(mean(tremorFreqs)) : null,
    tremor_band: tremorFreqs.length
      ? (mean(tremorFreqs) >= 3 && mean(tremorFreqs) <= 6 ? 'pathological' : 'physiological')
      : 'none',
    intention_tremor_mean: intentionTremors.length ? safeNum(mean(intentionTremors)) : null,

    // G. Inter-repetition Variability
    rep_count: smallint(reps.length) || null,
    duration_cv: stats?.durationCV ?? null,
    peak_velocity_cv: stats?.peakVelocityCV ?? null,
    mean_velocity_cv: stats?.meanVelocityCV ?? null,
    mean_duration_ms: stats?.meanDuration ?? null,

    // H. Spatial Precision
    bve_value: stats?.bve?.value ?? null,
    endpoint_accuracy: stats?.bve?.endpointAccuracy ?? null,
    endpoint_max_error: stats?.bve?.maxError ?? null,

    // I. Reaction Time (filtered: 120ms < valid < 3000ms)
    reaction_time_mean_ms: validRTs?.mean ?? null,
    reaction_time_median_ms: validRTs?.median ?? null,
    reaction_time_cv: validRTs?.cv ?? null,
    reaction_time_count: validRTs?.count ?? null,

    // J. Fatigue (rep-based, not raw speed profile)
    fatigue_index: fatigueFromReps,
    asymmetry_mean: null, // Games are unilateral; any reading is accidental detection
    asymmetry_readings: null,

    // K. Composite
    cri_score: null,
    cri_level: null,

    // L. Signal Quality
    quality_frames_pct: accumulator?._totalFramesAttempted > 0
      ? Math.round((accumulator.frames / accumulator._totalFramesAttempted) * 100 * 10) / 10
      : null,
    avg_fps: (finalized.durationMs > 0 && accumulator?.frames > 0)
      ? Math.round((accumulator.frames / (finalized.durationMs / 1000)) * 10) / 10
      : null,

    // M. Raw Data
    repetitions: reps,
    outcome: extractOutcome(finalized, gameKey),
    metrics_display: finalized.metrics || {},
  };
}

function extractOutcome(finalized, gameKey) {
  const m = finalized.metrics || {};
  switch (gameKey) {
    case 'pastillero':
      return {
        placed: m.totalShots ? Math.round(m.accuracyRatio * m.totalShots) : null,
        errors: m.totalShots ? m.totalShots - Math.round(m.accuracyRatio * m.totalShots) : null,
        totalPills: m.totalShots || null,
        accuracyRatio: m.accuracyRatio || null,
      };
    case 'jarra':
      return {
        spills: m.poisonError || null,
        rounds: null,
        avgPourMs: m.averagePouringTime || null,
      };
    case 'interruptores':
      return {
        score: m.activationCount || null,
        maxScore: null,
      };
    default:
      return {};
  }
}
