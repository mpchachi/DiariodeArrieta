import type { Patient, Session } from './types';
import { supabase } from './supabaseClient';
import { mapSupabaseSubject, mapSupabaseSession } from './supabaseMapper';

let loadedFromSupabase = false;
let loadError: string | null = null;
/** Mensaje si falló la carga desde Supabase (para mostrar un estado de error, no una lista vacía). */
export const getLoadError = () => loadError;

// Cache to prevent refetching from Supabase every time
let mergedPatients: Patient[] = [];
let mergedSessions: Session[] = [];

async function loadSupabaseData() {
  if (loadedFromSupabase) return;

  try {
    const { data: subjects, error: subjectsError } = await supabase.from('subjects').select('*');
    if (subjectsError) throw subjectsError;

    const { data: sessions, error: sessionsError } = await supabase.from('sessions').select('*');
    if (sessionsError) throw sessionsError;

    const { data: gameResults, error: gameResultsError } = await supabase.from('game_results').select('*');
    if (gameResultsError) throw gameResultsError;

    const realPatients: Patient[] = (subjects || []).map(mapSupabaseSubject);
    
    const realSessions: Session[] = (sessions || []).map(sessionRow => {
      const relatedGames = (gameResults || []).filter(gr => gr.session_id === sessionRow.id);
      return mapSupabaseSession(sessionRow, relatedGames);
    });

    // Solo datos de Supabase: pacientes reales y los de demostración (que ahora viven en la
    // base de datos, compartidos por el equipo). Ya no se mezclan pacientes generados en código.
    mergedPatients = realPatients;
    mergedSessions = realSessions;
    loadedFromSupabase = true;

    // Set baseline session for real patients if available
    mergedPatients.forEach(p => {
      if (!p.baselineSessionId) {
        const pSessions = mergedSessions.filter(s => s.patientId === p.id).sort((a, b) => a.date.localeCompare(b.date));
        if (pSessions.length > 0) {
          p.baselineSessionId = pSessions[0].id;
        }
      }
    });

  } catch (error) {
    // Sin datos falsos de respaldo: si falla Supabase se muestra vacío (y el error en consola).
    console.error('Error cargando datos de Supabase:', error);
    loadError = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
    mergedPatients = [];
    mergedSessions = [];
    loadedFromSupabase = true;
  }
}

export async function getPatients(): Promise<Patient[]> {
  await loadSupabaseData();
  return mergedPatients;
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  await loadSupabaseData();
  return mergedPatients.find(p => p.id === id);
}

export async function getSessions(patientId: string): Promise<Session[]> {
  await loadSupabaseData();
  return mergedSessions.filter(s => s.patientId === patientId);
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  await loadSupabaseData();
  return mergedSessions.find(s => s.id === sessionId);
}

export async function getAllSessions(): Promise<Session[]> {
  await loadSupabaseData();
  return mergedSessions;
}
