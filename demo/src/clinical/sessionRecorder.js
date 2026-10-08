// Agrega los tres juegos de una pasada (Pastillero, Jarra, Interruptores) en una «sesión»
// y la sube a Supabase cuando hay un sujeto seleccionado.
//
// No se guarda nada en localStorage: las métricas son datos de salud y el ordenador de la
// consulta puede ser compartido. El resultado solo vive en memoria mientras dura la pasada.

import { uploadPlaythrough } from '../database/uploadSession.js';

export const ALPHA_PATIENT_ID = 'pat-alpha';

// Order the dashboard expects inside a session: slingshot, flappy, water.
const GAME_ORDER = { slingshot: 0, flappy: 1, water: 2 };

let currentGames = [];
let currentAccumulators = [];
let activeSubjectId = null;
let playthroughStartTime = null;

export function setActiveSubject(subjectId) {
  activeSubjectId = subjectId;
}

export function getActiveSubject() {
  return activeSubjectId;
}

export function startPlaythrough() {
  currentGames = [];
  currentAccumulators = [];
  playthroughStartTime = new Date().toISOString();
}

export function recordGame(finalizedGame, accumulator = null) {
  if (finalizedGame && finalizedGame.game) {
    currentGames.push(finalizedGame);
    currentAccumulators.push(accumulator);
  }
}

// Máximos de la pasada actual (normalización intra-paciente). Solo en memoria.
let baseline = {};
function loadBaseline() { return baseline; }

function updateBaseline(games) {
  const baseline = loadBaseline();

  for (const g of games) {
    if (!g.repetitions) continue;
    for (const rep of g.repetitions) {
      if (rep.peakVelocity > (baseline.peakVelocity || 0)) {
        baseline.peakVelocity = rep.peakVelocity;
      }
      if (rep.romDeg > (baseline.romDeg || 0)) {
        baseline.romDeg = rep.romDeg;
      }
    }
  }

  // Also check aggregated metrics
  for (const g of games) {
    if (g.game === 'water') {
      const sup = g.metrics.maxSupination || 0;
      const pro = g.metrics.maxPronation || 0;
      if (sup > (baseline.maxSupination || 0)) baseline.maxSupination = sup;
      if (pro > (baseline.maxPronation || 0)) baseline.maxPronation = pro;
    }
  }

  return baseline;
}

export function getPatientBaseline() {
  return loadBaseline();
}

// Cierra la pasada: construye la sesión y la sube a Supabase si hay sujeto.
export async function commitPlaythrough(handUsed = 'right') {
  if (currentGames.length === 0) return { session: null, uploadResult: null };

  const games = [...currentGames].sort(
    (a, b) => (GAME_ORDER[a.game] ?? 9) - (GAME_ORDER[b.game] ?? 9)
  );

  // C3: Update patient baseline with this session's maxima
  const baseline = updateBaseline(games);
  const now = new Date();

  const session = {
    id: `sess-${now.getTime()}`,
    patientId: ALPHA_PATIENT_ID,
    date: now.toISOString().slice(0, 10),
    handUsed,
    games,
    baseline,
  };

  let uploadResult = null;

  // Upload to Supabase (blocking, to allow UI to show loader)
  if (activeSubjectId) {
    const gamesForUpload = games.map((finalized, i) => ({
      finalized,
      accumulator: currentAccumulators[i] || null,
    }));
    
    try {
      uploadResult = await uploadPlaythrough(activeSubjectId, gamesForUpload, playthroughStartTime);
      if (uploadResult.ok) {
        console.log('[sessionRecorder] Uploaded to Supabase:', uploadResult.sessionId);
      } else {
        console.warn('[sessionRecorder] Supabase upload failed:', uploadResult.error);
      }
    } catch (err) {
      console.warn('[sessionRecorder] Supabase upload error:', err);
      uploadResult = { ok: false, error: err.message };
    }
  }

  currentGames = [];
  currentAccumulators = [];
  return { session, uploadResult };
}
