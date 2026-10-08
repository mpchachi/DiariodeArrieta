import { format } from 'date-fns';
import type { Patient, Session, GameResult, GameId, EnrichedColumns } from './types';
import { computeDerivedClinical } from '../domain/scores';

// Dominios del dashboard: pinza/agarre («slingshot»), flexo-extensión («flappy») y
// pronosupinación («water»). Juegos antiguos y capítulos del viaje del zorro.
const GAME_DOMAIN: Record<string, GameId> = {
  pastillero: 'slingshot', interruptores: 'flappy', jarra: 'water',
  fox_runner: 'slingshot', fox_balloon: 'flappy', fox_garden: 'water',
};

// Fila de `subjects` -> Patient. Lo que no consta queda en null.
export function mapSupabaseSubject(subject: any): Patient {
  const patientData = subject.patient_data || {};

  return {
    id: subject.id,
    pseudonym: subject.display_name || 'Desconocido',
    age: subject.birth_year ? new Date().getFullYear() - subject.birth_year : null,
    sex: subject.sex ?? null,
    strokeType: patientData.strokeType ?? null,
    strokeDate: patientData.strokeDate ?? null,
    affectedSide: patientData.affectedSide ?? null,
    mobility: patientData.mobility ?? null,
    clinicianIds: subject.operator_id ? [subject.operator_id] : [],
    baselineSessionId: '',
    prescribedExercises: [],
    eventMarkers: [],
  };
}

// Filas de `sessions` + `game_results` -> Session.
export function mapSupabaseSession(sessionRow: any, gameResultRows: any[]): Session {
  const games: GameResult[] = gameResultRows
    // Se descartan juegos sin dominio conocido o sin métricas.
    .filter(gr => GAME_DOMAIN[gr.game_key] && gr.metrics_display && Object.keys(gr.metrics_display).length > 0)
    .map((gr: any) => {
      const enriched: EnrichedColumns = {
        sparcMean: gr.sparc_mean ?? null,
        sparcCv: gr.sparc_cv ?? null,
        sparcWorst: gr.sparc_worst ?? null,
        bveValue: gr.bve_value ?? null,
        endpointAccuracy: gr.endpoint_accuracy ?? null,
        fingerIndividuationMean: gr.finger_individuation_mean ?? null,
        fingersExtendedMax: gr.fingers_extended_max ?? null,
        handOpeningSpeedP75: gr.hand_opening_speed_p75 ?? null,
        pinchDistanceMeanMm: gr.pinch_distance_mean_mm ?? null,
        palmSpeedP75: gr.palm_speed_p75 ?? null,
        peakVelocityCv: gr.peak_velocity_cv ?? null,
        durationCv: gr.duration_cv ?? null,
        repCount: gr.rep_count ?? null,
        fatigueIndex: gr.fatigue_index ?? null,
        tremorFreqHz: gr.tremor_freq_hz ?? null,
        tremorBand: gr.tremor_band ?? null,
        reactionTimeMeanMs: gr.reaction_time_mean_ms ?? null,
        qualityFramesPct: gr.quality_frames_pct ?? null,
        meanDurationMs: gr.mean_duration_ms ?? null,
      };

      return {
        game: GAME_DOMAIN[gr.game_key],
        durationMs: gr.duration_ms || 0,
        metrics: gr.metrics_display,
        enriched,
        frames: [],
      };
    });

  return {
    id: sessionRow.id,
    patientId: sessionRow.subject_id,
    // Fecha local (no UTC) para que la sesión caiga en el día en que se jugó.
    date: format(sessionRow.started_at ? new Date(sessionRow.started_at) : new Date(), 'yyyy-MM-dd'),
    handUsed: sessionRow.device?.handUsed ?? null,
    games,
    derived: computeDerivedClinical(games),
  };
}
