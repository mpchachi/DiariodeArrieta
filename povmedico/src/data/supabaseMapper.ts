import type { Patient, Session, GameResult, PrescribedExercise, EventMarker, GameId, EnrichedColumns } from './types';
import { computeDerivedClinical } from '../domain/scores';

// Maps a row from the `subjects` table in Supabase to the `Patient` interface
export function mapSupabaseSubject(subject: any): Patient {
  // Use patient_data jsonb or defaults for missing fields
  const patientData = subject.patient_data || {};
  const isHealthy = subject.subject_type === 'healthy';
  
  // Real subjects from DB will not have prescribed exercises or events yet
  const prescribedExercises: PrescribedExercise[] = [];
  const eventMarkers: EventMarker[] = [];

  const age = subject.birth_year ? new Date().getFullYear() - subject.birth_year : 60;
  
  return {
    id: subject.id,
    pseudonym: subject.display_name || 'Desconocido',
    age,
    sex: subject.sex === 'male' ? 'M' : subject.sex === 'female' ? 'F' : 'other',
    // Voluntario sano: sin datos de ictus. Paciente: lo que se dio de alta; si falta, null (no se inventa).
    subjectType: isHealthy ? 'healthy' : 'patient',
    strokeType: isHealthy ? null : patientData.strokeType ?? null,
    strokeDate: isHealthy ? null : patientData.strokeDate ?? null,
    affectedSide: isHealthy ? null : patientData.affectedSide ?? null,
    mobility: isHealthy ? null : patientData.mobility ?? null,
    clinicianIds: subject.operator_id ? [subject.operator_id] : ['clin-001'],
    baselineSessionId: '', // To be filled later if needed, or left empty
    prescribedExercises,
    eventMarkers,
  };
}

// Maps rows from the `sessions` and `game_results` tables in Supabase to the `Session` interface
export function mapSupabaseSession(sessionRow: any, gameResultRows: any[]): Session {
  const games: GameResult[] = gameResultRows.map((gr: any) => {
    // Dominios del dashboard: pinza/agarre («slingshot»), flexo-extensión («flappy») y
    // pronosupinación («water»). Juegos antiguos y capítulos del viaje del zorro.
    const GAME_DOMAIN: Record<string, GameId> = {
      pastillero: 'slingshot', interruptores: 'flappy', jarra: 'water',
      fox_runner: 'slingshot', fox_balloon: 'flappy', fox_garden: 'water',
    };
    const gameId: GameId = GAME_DOMAIN[gr.game_key] ?? 'slingshot';

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
      game: gameId,
      durationMs: gr.duration_ms || 0,
      // El huerto (fox_garden) no tiene «derrames»: girar al lado contrario es buscar la dirección,
      // no un error de precisión. Se fuerza a 0 también en partidas guardadas antes del cambio.
      metrics: gr.game_key === 'fox_garden' ? { ...(gr.metrics_display || {}), poisonError: 0 } : (gr.metrics_display || {}),
      enriched,
      frames: [],
    };
  });

  return {
    id: sessionRow.id,
    patientId: sessionRow.subject_id,
    date: sessionRow.started_at ? sessionRow.started_at.split('T')[0] : new Date().toISOString().split('T')[0],
    handUsed: sessionRow.device?.handUsed || 'right',
    games,
    derived: computeDerivedClinical(games), // Calculate metrics based on the mapped games
  };
}
