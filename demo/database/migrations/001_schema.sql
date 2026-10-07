-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — esquema v2 (proyecto propio de FixedGap, Frankfurt)
-- Mismo modelo que el producto anterior (demo/database/schema.sql + chat.sql + fixes),
-- con cambios:
--   · gen_random_uuid() (nativo) en vez de uuid-ossp,
--   · juegos de «El viaje del zorro» en game_key_type (fox_runner, fox_balloon, fox_garden),
--   · conversations.created_by (para que solo el creador añada participantes),
--   · la vista v_latest_sessions respeta RLS (security_invoker).
-- La seguridad (RLS) va en 002_security.sql y el alta de médicos en 003_auth.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tipos
CREATE TYPE sex_type AS ENUM ('male', 'female', 'other');
CREATE TYPE hand_type AS ENUM ('left', 'right', 'ambidextrous');
CREATE TYPE subject_type AS ENUM ('healthy', 'patient');
-- Juegos antiguos (pastillero, jarra, interruptores) + los tres capítulos del viaje del zorro.
CREATE TYPE game_key_type AS ENUM ('pastillero', 'jarra', 'interruptores', 'fox_runner', 'fox_balloon', 'fox_garden');
CREATE TYPE tremor_band_type AS ENUM ('none', 'physiological', 'pathological');
CREATE TYPE cri_level_type AS ENUM ('critical', 'moderate', 'optimal');
CREATE TYPE conversation_type AS ENUM ('direct', 'group');

-- Médicos / operadores (1:1 con auth.users; se crean solos con el trigger de 003_auth.sql)
CREATE TABLE public.operators (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        text NOT NULL UNIQUE,
  display_name    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Pacientes / sujetos (sin credenciales; los crea un médico)
CREATE TABLE public.subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  birth_year      smallint NOT NULL CHECK (birth_year BETWEEN 1920 AND 2025),
  sex             sex_type NOT NULL,
  dominant_hand   hand_type NOT NULL,
  subject_type    subject_type NOT NULL DEFAULT 'healthy',
  patient_data    jsonb DEFAULT NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_subjects_operator ON public.subjects(operator_id);
CREATE INDEX idx_subjects_type ON public.subjects(subject_type);
CREATE INDEX idx_subjects_demographics ON public.subjects(subject_type, sex, birth_year);

-- Sesiones (una partida completa = 3 juegos)
CREATE TABLE public.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  operator_id     uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  completed       boolean NOT NULL DEFAULT false,
  games_played    smallint NOT NULL DEFAULT 0 CHECK (games_played BETWEEN 0 AND 3),
  device          jsonb NOT NULL DEFAULT '{}',
  quality_frames_pct real,
  avg_fps         real,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_subject ON public.sessions(subject_id);
CREATE INDEX idx_sessions_operator ON public.sessions(operator_id);
CREATE INDEX idx_sessions_date ON public.sessions(started_at DESC);
CREATE INDEX idx_sessions_completed ON public.sessions(completed) WHERE completed = true;

-- Resultados por juego (columnas consultables + datos crudos en jsonb)
CREATE TABLE public.game_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  game_key        game_key_type NOT NULL,
  play_order      smallint NOT NULL CHECK (play_order BETWEEN 1 AND 3),
  duration_ms     integer NOT NULL,
  -- A. Pinza y agarre
  pinch_count smallint, pinch_distance_mean_mm real, pinch_distance_max_mm real,
  tripod_quality_mean real, thumb_opposition_mean real, grip_aperture_mean_mm real, grip_aperture_cv real,
  -- B. Apertura de mano y extensión de dedos
  hand_open_pct_p90 real, hand_open_pct_p10 real, hand_opening_speed_p75 real,
  fingers_extended_max smallint, fingers_extended_mean real, index_extension_p75 real, finger_individuation_mean real,
  -- C. Rango de movimiento
  rom_deg_p90 real, rom_norm_mean real, max_supination_deg real, max_pronation_deg real,
  -- D. Velocidad y cinemática
  palm_speed_mean real, palm_speed_p75 real, mean_peak_velocity real, peak_velocity_ratio_mean real,
  -- E. Suavidad (SPARC)
  session_sparc real, sparc_mean real, sparc_cv real, sparc_worst real,
  -- F. Temblor
  tremor_amp_mean real, tremor_freq_hz real, tremor_band tremor_band_type, intention_tremor_mean real,
  -- G. Variabilidad entre repeticiones
  rep_count smallint, duration_cv real, peak_velocity_cv real, mean_velocity_cv real, mean_duration_ms real,
  -- H. Precisión espacial
  bve_value real, endpoint_accuracy real, endpoint_max_error real,
  -- I. Tiempo de reacción
  reaction_time_mean_ms real, reaction_time_median_ms real, reaction_time_cv real, reaction_time_count smallint,
  -- J. Fatiga y asimetría
  fatigue_index real, asymmetry_mean real, asymmetry_readings smallint,
  -- K. Compuesto (exploratorio, NO validado clínicamente)
  cri_score real, cri_level cri_level_type,
  -- L. Calidad de señal
  quality_frames_pct real, avg_fps real,
  -- M. Datos crudos (investigación y recálculo)
  repetitions     jsonb NOT NULL DEFAULT '[]',
  outcome         jsonb NOT NULL DEFAULT '{}',
  metrics_display jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game_key)
);
CREATE INDEX idx_game_results_session ON public.game_results(session_id);
CREATE INDEX idx_game_results_game ON public.game_results(game_key);
CREATE INDEX idx_game_results_normative ON public.game_results(game_key, session_sparc, sparc_mean);
CREATE INDEX idx_game_results_analysis ON public.game_results(game_key, palm_speed_mean, session_sparc, rom_deg_p90, tremor_amp_mean);

-- Chat interno
CREATE TABLE public.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            conversation_type NOT NULL,
  name            text,
  created_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.operators(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  operator_id     uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  hidden          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, operator_id)
);
CREATE TABLE public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_type ON public.conversations(type);
CREATE INDEX idx_conversations_created_by ON public.conversations(created_by);
CREATE INDEX idx_conversation_participants_operator ON public.conversation_participants(operator_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Triggers de mantenimiento
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Al insertar un resultado: contador de juegos y sesión completa con 3 juegos.
CREATE OR REPLACE FUNCTION public.update_session_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.game_results WHERE session_id = NEW.session_id;
  UPDATE public.sessions SET
    games_played = LEAST(n, 3),
    completed = (n >= 3),
    ended_at = CASE WHEN n >= 3 THEN now() ELSE NULL END
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER game_results_completion AFTER INSERT ON public.game_results FOR EACH ROW EXECUTE FUNCTION public.update_session_completion();

-- Mensaje nuevo: se desoculta solo para quien lo envía y se actualiza el orden.
CREATE OR REPLACE FUNCTION public.on_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.conversation_participants SET hidden = false
  WHERE conversation_id = NEW.conversation_id AND operator_id = NEW.sender_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_new_message_trigger AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.on_new_message();

-- Vistas
CREATE VIEW public.v_latest_sessions WITH (security_invoker = true) AS
SELECT DISTINCT ON (s.subject_id)
  s.id AS session_id, s.subject_id, s.started_at,
  sub.display_name, sub.subject_type, sub.birth_year, sub.sex, sub.dominant_hand
FROM public.sessions s
JOIN public.subjects sub ON s.subject_id = sub.id
WHERE s.completed = true
ORDER BY s.subject_id, s.started_at DESC;

-- Percentiles normativos (agregados de sujetos sanos; sin datos individuales).
CREATE MATERIALIZED VIEW public.mv_normative_percentiles AS
SELECT
  gr.game_key, sub.sex,
  floor((extract(year FROM now()) - sub.birth_year) / 10) * 10 AS age_decade,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.session_sparc) AS sparc_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.session_sparc) AS sparc_p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY gr.session_sparc) AS sparc_p75,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.palm_speed_mean) AS speed_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.palm_speed_mean) AS speed_p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY gr.palm_speed_mean) AS speed_p75,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.rom_deg_p90) AS rom_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.rom_deg_p90) AS rom_p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY gr.rom_deg_p90) AS rom_p75,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.reaction_time_mean_ms) AS rt_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.reaction_time_mean_ms) AS rt_p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY gr.reaction_time_mean_ms) AS rt_p75,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY gr.tremor_amp_mean) AS tremor_p75,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY gr.tremor_amp_mean) AS tremor_p90,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.pinch_distance_mean_mm) AS pinch_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.pinch_distance_mean_mm) AS pinch_p50,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY gr.finger_individuation_mean) AS individ_p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY gr.finger_individuation_mean) AS individ_p50,
  count(*) AS n
FROM public.game_results gr
JOIN public.sessions s ON gr.session_id = s.id
JOIN public.subjects sub ON s.subject_id = sub.id
WHERE sub.subject_type = 'healthy' AND s.completed = true AND gr.quality_frames_pct > 70
GROUP BY gr.game_key, sub.sex, age_decade
HAVING count(*) >= 5;
CREATE UNIQUE INDEX idx_mv_normative ON public.mv_normative_percentiles(game_key, sex, age_decade);
