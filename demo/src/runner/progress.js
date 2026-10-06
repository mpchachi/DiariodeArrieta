// Progreso del bosque por sujeto (estación) y registro local de partidas.
// Local (localStorage) mientras no exista el tipo de juego en Supabase.

import { RUNNER_CONFIG as C } from './config.js';

const PROGRESS_KEY = 'fixedgap_runner_progress';
const SESSIONS_KEY = 'fixedgap_runner_sessions';
const MAX_STORED = 30;

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

export function getSeason(subjectId) {
  const forced = new URLSearchParams(location.search).get('estacion');
  if (forced !== null && /^[0-3]$/.test(forced)) return Number(forced);
  const sessions = read(PROGRESS_KEY, {})[subjectId ?? 'anon'] ?? 0;
  return Math.min(C.maxSeasons - 1, sessions);
}

// Avanza una estación tras una partida completada. Devuelve la nueva estación.
export function advanceSeason(subjectId) {
  const all = read(PROGRESS_KEY, {}), key = subjectId ?? 'anon';
  all[key] = (all[key] ?? 0) + 1;
  write(PROGRESS_KEY, all);
  return Math.min(C.maxSeasons - 1, all[key]);
}

// Guarda el resumen (sin muestras) para consulta rápida.
export function storeSession(result, key = SESSIONS_KEY) {
  const { samples, frames, landmarkFrames, config, ...light } = result;
  const list = read(key, []);
  list.push(light);
  return write(key, list.slice(-MAX_STORED));
}
