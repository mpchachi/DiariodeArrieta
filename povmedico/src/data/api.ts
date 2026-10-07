import { generateMockData } from './mockGenerator';
import type { Patient, Session, Clinician, PatientPrediction } from './types';
import { generatePrediction } from '../domain/predictions';
import { supabase } from './supabaseClient';
import { mapSupabaseSubject, mapSupabaseSession } from './supabaseMapper';

let cachedMockData = generateMockData();
let loadedFromSupabase = false;

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

export async function getClinicians(): Promise<Clinician[]> {
  return Promise.resolve(cachedMockData.clinicians);
}

export async function getClinician(id: string): Promise<Clinician | undefined> {
  return Promise.resolve(cachedMockData.clinicians.find(c => c.id === id));
}

export async function getPrediction(
  patientId: string,
  metric: string = 'globalMotorScore'
): Promise<PatientPrediction> {
  await loadSupabaseData();
  const sessions = mergedSessions.filter(s => s.patientId === patientId);
  return Promise.resolve(generatePrediction(patientId, sessions, metric));
}

export async function getCohorteStats(mobility?: string, strokeType?: string): Promise<{
  avgGlobalScore: number;
  flagPercentages: { tremor: number; spasticity: number; fatigue: number; impulse: number };
  avgAdherence: number;
  scoreDistribution: { range: string; count: number }[];
}> {
  await loadSupabaseData();
  let relevantPatients = mergedPatients;
  if (mobility) relevantPatients = relevantPatients.filter(p => p.mobility === mobility);
  if (strokeType) relevantPatients = relevantPatients.filter(p => p.strokeType === strokeType);

  const patientIds = new Set(relevantPatients.map(p => p.id));
  const relevantSessions = mergedSessions.filter(s => patientIds.has(s.patientId));

  const latestByPatient = new Map<string, Session>();
  for (const s of relevantSessions) {
    const existing = latestByPatient.get(s.patientId);
    if (!existing || s.date > existing.date) {
      latestByPatient.set(s.patientId, s);
    }
  }

  const latestSessions = Array.from(latestByPatient.values());
  const scores = latestSessions.map(s => s.derived.globalMotorScore);
  const avgGlobalScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const flagPercentages = {
    tremor: latestSessions.filter(s => s.derived.tremorFlag).length / Math.max(1, latestSessions.length) * 100,
    spasticity: latestSessions.filter(s => s.derived.spasticityFlag).length / Math.max(1, latestSessions.length) * 100,
    fatigue: latestSessions.filter(s => s.derived.fatigueFlag).length / Math.max(1, latestSessions.length) * 100,
    impulse: latestSessions.filter(s => s.derived.impulseControlFlag).length / Math.max(1, latestSessions.length) * 100,
  };

  const totalAdherence = relevantPatients.reduce((sum, p) => {
    // Only calculate adherence if there are prescribed exercises
    if (!p.prescribedExercises || p.prescribedExercises.length === 0) return sum;
    const logs = p.prescribedExercises.flatMap(e => e.adherenceLog);
    const completed = logs.filter(l => l.completed).length;
    return sum + (logs.length ? completed / logs.length : 0);
  }, 0);
  
  // Only count patients that actually have prescribed exercises for average adherence
  const patientsWithExercises = relevantPatients.filter(p => p.prescribedExercises && p.prescribedExercises.length > 0).length;
  const avgAdherence = patientsWithExercises ? (totalAdherence / patientsWithExercises) * 100 : 0;

  const ranges = ['0-20', '20-40', '40-60', '60-80', '80-100'];
  const scoreDistribution = ranges.map(range => {
    const [min, max] = range.split('-').map(Number);
    return { range, count: scores.filter(s => s >= min && s < (max === 100 ? 101 : max)).length };
  });

  return Promise.resolve({ avgGlobalScore: Math.round(avgGlobalScore * 10) / 10, flagPercentages, avgAdherence: Math.round(avgAdherence * 10) / 10, scoreDistribution });
}
