import { create } from 'zustand';
import type { Patient, Session } from '../data/types';
import { getPatients, getAllSessions } from '../data/api';
import { computePriorityScore, computeAdherenceDeficit7d } from '../domain/priority';
import { today } from '../domain/clock';

export type ViewMode = 'list' | 'cards';
export type ClinicianRole = 'physician' | 'physiotherapist' | 'occupational-therapist';

interface Filters {
  mobility: string | null;
  affectedSide: string | null;
  strokeType: string | null;
  ageRange: [number, number] | null;
  onlyAlerts: boolean;
  clinicianId: string | null;
  search: string;
}

interface AppState {
  patients: Patient[];
  sessions: Session[];
  viewMode: ViewMode;
  filters: Filters;
  patientPriorities: Map<string, number>;
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;
  getFilteredPatients: () => (Patient & { priorityScore: number; lastSession?: Session })[];
}

const defaultFilters: Filters = {
  mobility: null,
  affectedSide: null,
  strokeType: null,
  ageRange: null,
  onlyAlerts: false,
  clinicianId: null,
  search: '',
};

export const useStore = create<AppState>((set, get) => ({
  patients: [],
  sessions: [],
  viewMode: 'list',
  filters: { ...defaultFilters },
  patientPriorities: new Map(),
  loaded: false,
  error: null,

  load: async () => {
    let patients: Patient[];
    let sessions: Session[];
    try {
      [patients, sessions] = await Promise.all([getPatients(), getAllSessions()]);
    } catch (err) {
      // loaded=true para salir del shimmer; la vista muestra el error.
      set({ patients: [], sessions: [], loaded: true, error: err instanceof Error ? err.message : 'Error cargando datos' });
      return;
    }

    const priorities = new Map<string, number>();
    const referenceDate = today();

    for (const patient of patients) {
      const patientSessions = sessions
        .filter(s => s.patientId === patient.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (patientSessions.length === 0) continue;

      const lastDerived = patientSessions[patientSessions.length - 1].derived;
      const last5Scores = patientSessions.slice(-5).map(s => s.derived.globalMotorScore);
      const expectedPerWeek = patient.prescribedExercises.reduce((sum, e) => sum + e.frequencyPerWeek, 0) / Math.max(1, patient.prescribedExercises.length);
      const adherenceDeficit = computeAdherenceDeficit7d(patientSessions, expectedPerWeek, referenceDate);

      priorities.set(patient.id, computePriorityScore(lastDerived, last5Scores, adherenceDeficit));
    }

    set({ patients, sessions, patientPriorities: priorities, loaded: true, error: null });
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  setFilter: (key, value) => set(state => ({
    filters: { ...state.filters, [key]: value },
  })),

  resetFilters: () => set({ filters: { ...defaultFilters } }),

  getFilteredPatients: () => {
    const { patients, sessions, filters, patientPriorities } = get();

    let filtered = patients;

    if (filters.mobility) filtered = filtered.filter(p => p.mobility === filters.mobility);
    if (filters.affectedSide) filtered = filtered.filter(p => p.affectedSide === filters.affectedSide);
    if (filters.strokeType) filtered = filtered.filter(p => p.strokeType === filters.strokeType);
    // Los filtros ignoran pacientes sin el dato.
    if (filters.ageRange) filtered = filtered.filter(p => p.age !== null && p.age >= filters.ageRange![0] && p.age <= filters.ageRange![1]);
    if (filters.clinicianId) filtered = filtered.filter(p => p.clinicianIds.includes(filters.clinicianId!));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(p => p.pseudonym.toLowerCase().includes(q));
    }
    if (filters.onlyAlerts) {
      filtered = filtered.filter(p => {
        const ps = sessions.filter(s => s.patientId === p.id);
        const last = ps[ps.length - 1];
        return last && (last.derived.tremorFlag || last.derived.spasticityFlag || last.derived.fatigueFlag || last.derived.impulseControlFlag);
      });
    }

    return filtered
      .map(p => {
        const patientSessions = sessions.filter(s => s.patientId === p.id).sort((a, b) => a.date.localeCompare(b.date));
        return {
          ...p,
          priorityScore: patientPriorities.get(p.id) ?? 0,
          lastSession: patientSessions[patientSessions.length - 1],
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  },
}));
