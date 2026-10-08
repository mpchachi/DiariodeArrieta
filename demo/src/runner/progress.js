// Progreso del bosque por sujeto (estación). Es lo único que se guarda en el navegador:
// las métricas de cada partida van a Supabase (uploadJourney) y no se copian a localStorage,
// porque son datos de salud y el ordenador de la consulta puede ser compartido.

import { RUNNER_CONFIG as C } from './config.js';

const PROGRESS_KEY = 'fixedgap_runner_progress';
// Claves de versiones anteriores que guardaban partidas completas; se limpian al arrancar y al salir.
export const LEGACY_LOCAL_KEYS = ['fixedgap_runner_sessions', 'fixedgap_flappy_sessions', 'fixedgap_garden_sessions',
  'fixedgap_fishing_sessions', 'fixedgap_alpha_sessions', 'fixedgap_alpha_baseline'];

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

export function clearLocalHealthData({ includeProgress = false } = {}) {
  try {
    for (const k of LEGACY_LOCAL_KEYS) localStorage.removeItem(k);
    if (includeProgress) localStorage.removeItem(PROGRESS_KEY);
  } catch { /* sin almacenamiento */ }
}
clearLocalHealthData();

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

// Antes guardaba un resumen de la partida en localStorage. Se mantiene la firma para los juegos,
// pero ya no persiste nada (ver cabecera).
export function storeSession(_result, _key) {
  return false;
}
