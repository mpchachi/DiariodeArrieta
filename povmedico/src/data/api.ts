import type { Patient, Session, Clinician, PatientPrediction } from './types';
import { generatePrediction } from '../domain/predictions';
import { supabase } from './supabaseClient';
import { mapSupabaseSubject, mapSupabaseSession } from './supabaseMapper';

// Sin sesión de Supabase: el dashboard no carga datos.
export class NotAuthenticatedError extends Error {
  constructor() {
    super('No hay sesión de Supabase');
    this.name = 'NotAuthenticatedError';
  }
}

// Caché en memoria. loadPromise deduplica cargas concurrentes.
let loadPromise: Promise<void> | null = null;
let patients: Patient[] = [];
let sessions: Session[] = [];

const PAGE = 1000;

type Row = Record<string, unknown>;
interface SessionRow extends Row { id: string }
interface GameResultRow extends Row { session_id: string }

// Lee una tabla completa en bloques de 1000 (Supabase trunca por defecto).
async function fetchAll<T extends Row>(table: string, columns: string, eq?: [string, unknown]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (eq) q = q.eq(eq[0], eq[1]);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function invalidate() {
  loadPromise = null;
  patients = [];
  sessions = [];
}

// Cualquier cambio de usuario invalida la caché.
supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') invalidate();
});

async function doLoad(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new NotAuthenticatedError();

  const [subjects, sessionRows, gameResults] = await Promise.all([
    fetchAll<Row>('subjects', 'id, display_name, birth_year, sex, dominant_hand, operator_id, patient_data', ['is_active', true]),
    fetchAll<SessionRow>('sessions', '*'),
    fetchAll<GameResultRow>('game_results', '*'),
  ]);

  const gamesBySession = new Map<string, GameResultRow[]>();
  for (const gr of gameResults) {
    const list = gamesBySession.get(gr.session_id) ?? [];
    list.push(gr);
    gamesBySession.set(gr.session_id, list);
  }

  patients = subjects.map(mapSupabaseSubject);
  sessions = sessionRows.map(row => mapSupabaseSession(row, gamesBySession.get(row.id) ?? []));

  // Sesión basal = primera sesión del paciente.
  for (const p of patients) {
    if (p.baselineSessionId) continue;
    const first = sessions.filter(s => s.patientId === p.id).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (first) p.baselineSessionId = first.id;
  }
}

function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = doLoad().catch((err: unknown) => {
      // No se cachea el error: el siguiente intento vuelve a pedir datos.
      loadPromise = null;
      const e = err as { message?: string; code?: string };
      console.error('Error cargando datos de Supabase:', e?.message ?? err, e?.code ?? '');
      throw err;
    });
  }
  return loadPromise;
}

export async function getPatients(): Promise<Patient[]> {
  await load();
  return patients;
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  await load();
  return patients.find(p => p.id === id);
}

export async function getSessions(patientId: string): Promise<Session[]> {
  await load();
  return sessions.filter(s => s.patientId === patientId);
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  await load();
  return sessions.find(s => s.id === sessionId);
}

export async function getAllSessions(): Promise<Session[]> {
  await load();
  return sessions;
}

export async function getClinicians(): Promise<Clinician[]> {
  const rows = await fetchAll<Row>('operators', 'id, display_name, username');
  return rows.map(r => ({ id: String(r.id), name: String(r.display_name || r.username) }));
}

export async function getClinician(id: string): Promise<Clinician | undefined> {
  return (await getClinicians()).find(c => c.id === id);
}

export async function getPrediction(
  patientId: string,
  metric: string = 'globalMotorScore'
): Promise<PatientPrediction | null> {
  await load();
  return generatePrediction(patientId, sessions.filter(s => s.patientId === patientId), metric);
}

export async function getCohorteStats(mobility?: string, strokeType?: string): Promise<{
  avgGlobalScore: number;
  flagPercentages: { tremor: number; spasticity: number; fatigue: number; impulse: number };
  avgAdherence: number;
  scoreDistribution: { range: string; count: number }[];
}> {
  await load();
  let relevantPatients = patients;
  if (mobility) relevantPatients = relevantPatients.filter(p => p.mobility === mobility);
  if (strokeType) relevantPatients = relevantPatients.filter(p => p.strokeType === strokeType);

  const patientIds = new Set(relevantPatients.map(p => p.id));
  const relevantSessions = sessions.filter(s => patientIds.has(s.patientId));

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

  const n = Math.max(1, latestSessions.length);
  const flagPercentages = {
    tremor: latestSessions.filter(s => s.derived.tremorFlag).length / n * 100,
    spasticity: latestSessions.filter(s => s.derived.spasticityFlag).length / n * 100,
    fatigue: latestSessions.filter(s => s.derived.fatigueFlag).length / n * 100,
    impulse: latestSessions.filter(s => s.derived.impulseControlFlag).length / n * 100,
  };

  // Adherencia solo sobre pacientes con pauta.
  const withExercises = relevantPatients.filter(p => p.prescribedExercises.length > 0);
  const totalAdherence = withExercises.reduce((sum, p) => {
    const logs = p.prescribedExercises.flatMap(e => e.adherenceLog);
    const completed = logs.filter(l => l.completed).length;
    return sum + (logs.length ? completed / logs.length : 0);
  }, 0);
  const avgAdherence = withExercises.length ? (totalAdherence / withExercises.length) * 100 : 0;

  const ranges = ['0-20', '20-40', '40-60', '60-80', '80-100'];
  const scoreDistribution = ranges.map(range => {
    const [min, max] = range.split('-').map(Number);
    return { range, count: scores.filter(s => s >= min && s < (max === 100 ? 101 : max)).length };
  });

  return { avgGlobalScore: Math.round(avgGlobalScore * 10) / 10, flagPercentages, avgAdherence: Math.round(avgAdherence * 10) / 10, scoreDistribution };
}
