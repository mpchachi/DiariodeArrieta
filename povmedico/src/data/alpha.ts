// Real patient "Alpha": sessions are produced by the actual rehab game
// (demo/) and persisted to localStorage under 'fixedgap_alpha_sessions'.
// Because the built dashboard is served from the same origin as the game
// (/dashboard on the demo's Vite server), it can read that localStorage.
//
// Each stored entry is a played session with the three games already in the
// exact metrics shape the dashboard expects. Here we wrap them into full
// Session objects (computing `derived` with the real scoring) and build the
// Alpha Patient so it shows up first in the clinician view.

import { computeDerivedClinical } from '../domain/scores';
import type {
  Patient, Session, GameResult, PrescribedExercise, EventMarker, Hand,
} from './types';

const STORAGE_KEY = 'fixedgap_alpha_sessions';
export const ALPHA_ID = 'pat-alpha';

interface StoredSession {
  id?: string;
  date: string;
  handUsed?: Hand;
  games: GameResult[];
}

function readStored(): StoredSession[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSessions(stored: StoredSession[]): Session[] {
  return stored
    .filter(s => s && Array.isArray(s.games) && s.games.length > 0 && s.date)
    .map((s, i) => ({
      id: s.id || `sess-${ALPHA_ID}-${String(i).padStart(3, '0')}`,
      patientId: ALPHA_ID,
      date: s.date,
      handUsed: (s.handUsed as Hand) || 'right',
      games: s.games,
      derived: computeDerivedClinical(s.games),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Minimal, honest prescription/events so the patient detail renders fully
// without inventing clinical history. Kept static and clearly demo data.
function alphaExercises(firstDate: string): PrescribedExercise[] {
  return [
    {
      id: 'ex-alpha-grip',
      name: 'Pinza con resistencia',
      targetDomain: 'proximal-grip',
      frequencyPerWeek: 5,
      intensity: 'medium',
      startDate: firstDate,
      adherenceLog: [],
    },
    {
      id: 'ex-alpha-prono',
      name: 'Vertido controlado',
      targetDomain: 'prono-supination',
      frequencyPerWeek: 4,
      intensity: 'medium',
      startDate: firstDate,
      adherenceLog: [],
    },
  ];
}

function alphaEvents(firstDate: string): EventMarker[] {
  return [
    {
      id: 'evt-alpha-enroll',
      date: firstDate,
      type: 'clinical-note',
      label: 'Alta en telemonitorización FixedGap',
    },
  ];
}

export interface AlphaData {
  patient: Patient;
  sessions: Session[];
}

// Returns Alpha patient + sessions, or null if no real gameplay is stored yet.
export function buildAlpha(activeClinicianId = 'clin-001'): AlphaData | null {
  const stored = readStored();
  const sessions = buildSessions(stored);
  if (sessions.length === 0) return null;

  const firstDate = sessions[0].date;

  const patient: Patient = {
    id: ALPHA_ID,
    pseudonym: 'ALPHA-001',
    subjectType: 'patient',
    age: 58,
    sex: 'other',
    strokeType: 'ischemic',
    strokeDate: firstDate,
    affectedSide: 'right',
    mobility: 'moderate',
    clinicianIds: [activeClinicianId],
    baselineSessionId: sessions[0].id,
    prescribedExercises: alphaExercises(firstDate),
    eventMarkers: alphaEvents(firstDate),
  };

  return { patient, sessions };
}
