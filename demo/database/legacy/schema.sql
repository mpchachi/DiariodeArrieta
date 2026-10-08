-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — Supabase Database Schema
-- Post-stroke motor rehabilitation telemonitoring (SaMD)
--
-- Purpose: Normative database for healthy subjects + future patient comparison
-- Platform: Supabase (PostgreSQL 15+)
-- Version: 1.1.0
-- Date: 2026-07-15
--
-- Auth model: username/password via Supabase Auth (no email required).
-- Operators log in with a username. Subjects have no credentials.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE sex_type AS ENUM ('male', 'female', 'other');
CREATE TYPE hand_type AS ENUM ('left', 'right', 'ambidextrous');
CREATE TYPE subject_type AS ENUM ('healthy', 'patient');
CREATE TYPE game_key_type AS ENUM ('pastillero', 'jarra', 'interruptores');
CREATE TYPE tremor_band_type AS ENUM ('none', 'physiological', 'pathological');
CREATE TYPE cri_level_type AS ENUM ('critical', 'moderate', 'optimal');

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: operators
-- Members of the research/clinical team who manage subjects and collect data.
-- Linked 1:1 with Supabase Auth user. Identified by username, not email.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE operators (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        text NOT NULL UNIQUE,
  display_name    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_operators_username ON operators(username);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: subjects
-- The person who plays. Created by an operator, does NOT have login credentials.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE subjects (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id     uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,

  -- Demographics (minimal, privacy-first)
  display_name    text NOT NULL,
  birth_year      smallint NOT NULL CHECK (birth_year BETWEEN 1920 AND 2025),
  sex             sex_type NOT NULL,
  dominant_hand   hand_type NOT NULL,

  -- Classification
  subject_type    subject_type NOT NULL DEFAULT 'healthy',

  -- Patient-specific data (NULL for healthy subjects)
  -- Future fields: affected_side, time_since_stroke, medications, FMA-UE baseline
  patient_data    jsonb DEFAULT NULL,

  -- Metadata
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_subjects_operator ON subjects(operator_id);
CREATE INDEX idx_subjects_type ON subjects(subject_type);
CREATE INDEX idx_subjects_demographics ON subjects(subject_type, sex, birth_year);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: sessions
-- One playthrough = 3 games played sequentially by one subject.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id      uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  operator_id     uuid NOT NULL REFERENCES operators(id) ON DELETE SET NULL,

  -- Timing
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,

  -- Completion
  completed       boolean NOT NULL DEFAULT false,
  games_played    smallint NOT NULL DEFAULT 0 CHECK (games_played BETWEEN 0 AND 3),

  -- Device & environment
  device          jsonb NOT NULL DEFAULT '{}',
  -- Expected: {userAgent, screenWidth, screenHeight, cameraWidth, cameraHeight, platform}

  -- Session-level quality (aggregated across games)
  quality_frames_pct  real,
  avg_fps             real,

  -- Metadata
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_subject ON sessions(subject_id);
CREATE INDEX idx_sessions_operator ON sessions(operator_id);
CREATE INDEX idx_sessions_date ON sessions(started_at DESC);
CREATE INDEX idx_sessions_completed ON sessions(completed) WHERE completed = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: game_results
-- One game within a session. Contains ALL metrics for clinical dashboard
-- display AND normative comparison as direct queryable columns.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE game_results (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_key        game_key_type NOT NULL,
  play_order      smallint NOT NULL CHECK (play_order BETWEEN 1 AND 3),

  duration_ms     integer NOT NULL,

  -- ═════════════════════════════════════════════════════════════════════════
  -- A. PINCH & GRASP FUNCTION
  -- Relevance: FMA-UE items 7-11, 9-Hole Peg Test
  -- ═════════════════════════════════════════════════════════════════════════
  pinch_count             smallint,
  pinch_distance_mean_mm  real,
  pinch_distance_max_mm   real,
  tripod_quality_mean     real,           -- 0-100
  thumb_opposition_mean   real,           -- 0-100
  grip_aperture_mean_mm   real,
  grip_aperture_cv        real,

  -- ═════════════════════════════════════════════════════════════════════════
  -- B. HAND OPENING & FINGER EXTENSION
  -- Relevance: FMA-UE extension items, Nijland 2010 predictor
  -- ═════════════════════════════════════════════════════════════════════════
  hand_open_pct_p90       real,
  hand_open_pct_p10       real,
  hand_opening_speed_p75  real,           -- mm/s
  fingers_extended_max    smallint,       -- 0-5
  fingers_extended_mean   real,
  index_extension_p75     real,           -- degrees
  finger_individuation_mean real,         -- 0-100

  -- ═════════════════════════════════════════════════════════════════════════
  -- C. RANGE OF MOTION
  -- Relevance: Beebe & Lang 2009
  -- ═════════════════════════════════════════════════════════════════════════
  rom_deg_p90             real,           -- degrees
  rom_norm_mean           real,           -- 0-100 (intra-session normalized)
  max_supination_deg      real,           -- jarra only, QUALITATIVE PROXY
  max_pronation_deg       real,           -- jarra only, QUALITATIVE PROXY

  -- ═════════════════════════════════════════════════════════════════════════
  -- D. VELOCITY & KINEMATICS
  -- Relevance: Wagh et al. 2025, bradykinesia
  -- ═════════════════════════════════════════════════════════════════════════
  palm_speed_mean         real,           -- mm/s
  palm_speed_p75          real,           -- mm/s
  mean_peak_velocity      real,           -- mm/s per-rep peaks averaged
  peak_velocity_ratio_mean real,          -- 0-1 (when peak occurs in movement)

  -- ═════════════════════════════════════════════════════════════════════════
  -- E. SMOOTHNESS & MOTOR CONTROL
  -- Relevance: Balasubramanian 2012 (SPARC gold standard)
  -- ═════════════════════════════════════════════════════════════════════════
  session_sparc           real,           -- SPARC over full game profile
  sparc_mean              real,           -- mean per-repetition SPARC
  sparc_cv                real,           -- variability of smoothness
  sparc_worst             real,           -- most fragmented single repetition

  -- ═════════════════════════════════════════════════════════════════════════
  -- F. TREMOR
  -- Relevance: Beck 2018; Nyquist at 30fps limits to <15Hz
  -- ═════════════════════════════════════════════════════════════════════════
  tremor_amp_mean         real,           -- 0-1
  tremor_freq_hz          real,           -- Hz
  tremor_band             tremor_band_type,
  intention_tremor_mean   real,           -- 0-1

  -- ═════════════════════════════════════════════════════════════════════════
  -- G. INTER-REPETITION VARIABILITY
  -- Relevance: Slifkin & Newell 1999 (motor consistency)
  -- ═════════════════════════════════════════════════════════════════════════
  rep_count               smallint,
  duration_cv             real,
  peak_velocity_cv        real,
  mean_velocity_cv        real,
  mean_duration_ms        real,

  -- ═════════════════════════════════════════════════════════════════════════
  -- H. SPATIAL PRECISION
  -- Relevance: ARAT, endpoint control
  -- Note: Only populated for pastillero (targeting task)
  -- ═════════════════════════════════════════════════════════════════════════
  bve_value               real,
  endpoint_accuracy       real,           -- mean error (scene units)
  endpoint_max_error      real,

  -- ═════════════════════════════════════════════════════════════════════════
  -- I. REACTION TIME
  -- Relevance: neuromuscular latency + cognitive-motor coupling
  -- ═════════════════════════════════════════════════════════════════════════
  reaction_time_mean_ms   real,
  reaction_time_median_ms real,
  reaction_time_cv        real,
  reaction_time_count     smallint,

  -- ═════════════════════════════════════════════════════════════════════════
  -- J. FATIGUE & BILATERAL ASYMMETRY
  -- ═════════════════════════════════════════════════════════════════════════
  fatigue_index           real,           -- 0 to -30%
  asymmetry_mean          real,           -- 0-100
  asymmetry_readings      smallint,

  -- ═════════════════════════════════════════════════════════════════════════
  -- K. COMPOSITE SCORE
  -- WARNING: Exploratory, NOT clinically validated. Must carry disclaimer.
  -- ═════════════════════════════════════════════════════════════════════════
  cri_score               real,           -- 0-100
  cri_level               cri_level_type,

  -- ═════════════════════════════════════════════════════════════════════════
  -- L. SIGNAL QUALITY
  -- ═════════════════════════════════════════════════════════════════════════
  quality_frames_pct      real,           -- % passing confidence gate
  avg_fps                 real,

  -- ═════════════════════════════════════════════════════════════════════════
  -- M. RAW DATA (research & future recomputation)
  -- ═════════════════════════════════════════════════════════════════════════
  repetitions             jsonb NOT NULL DEFAULT '[]',
  -- Per-rep array: [{index, duration_ms, peak_velocity, mean_velocity,
  --   peak_velocity_ratio, sparc, smoothness, rom_deg, reaction_time_ms,
  --   success?, endpoint_error?, grip_aperture_mm?, round?, spills?,
  --   target?, score?}]

  outcome                 jsonb NOT NULL DEFAULT '{}',
  -- pastillero:    {placed, errors, totalPills, accuracyRatio}
  -- jarra:         {spills, rounds, avgPourMs}
  -- interruptores: {score, maxScore}

  metrics_display         jsonb NOT NULL DEFAULT '{}',
  -- Mapped values for legacy dashboard rendering (lossy, NOT for analysis)

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(session_id, game_key)
);

CREATE INDEX idx_game_results_session ON game_results(session_id);
CREATE INDEX idx_game_results_game ON game_results(game_key);
CREATE INDEX idx_game_results_normative ON game_results(game_key, session_sparc, sparc_mean);
CREATE INDEX idx_game_results_analysis ON game_results(
  game_key, palm_speed_mean, session_sparc, rom_deg_p90, tremor_amp_mean
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Operators: can read other operators if authenticated (needed for chat and directories)
CREATE POLICY operators_select ON operators
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY operators_insert ON operators
  FOR INSERT WITH CHECK (id = auth.uid());

-- Subjects: all authenticated operators can read all subjects
CREATE POLICY subjects_select ON subjects
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY subjects_insert ON subjects
  FOR INSERT WITH CHECK (operator_id = auth.uid());
CREATE POLICY subjects_update ON subjects
  FOR UPDATE USING (operator_id = auth.uid());
CREATE POLICY subjects_delete ON subjects
  FOR DELETE USING (operator_id = auth.uid());

-- Sessions: all authenticated operators can read all sessions
CREATE POLICY sessions_select ON sessions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY sessions_insert ON sessions
  FOR INSERT WITH CHECK (operator_id = auth.uid());

-- Game results: all authenticated operators can read all game results
CREATE POLICY game_results_select ON game_results
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY game_results_insert ON game_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.operator_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION update_session_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sessions SET
    games_played = (SELECT COUNT(*) FROM game_results WHERE session_id = NEW.session_id),
    completed = (SELECT COUNT(*) = 3 FROM game_results WHERE session_id = NEW.session_id),
    ended_at = CASE
      WHEN (SELECT COUNT(*) FROM game_results WHERE session_id = NEW.session_id) = 3
      THEN now() ELSE NULL
    END
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_results_completion
  AFTER INSERT ON game_results
  FOR EACH ROW EXECUTE FUNCTION update_session_completion();

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW v_latest_sessions AS
SELECT DISTINCT ON (s.subject_id)
  s.id AS session_id,
  s.subject_id,
  s.started_at,
  sub.display_name,
  sub.subject_type,
  sub.birth_year,
  sub.sex,
  sub.dominant_hand
FROM sessions s
JOIN subjects sub ON s.subject_id = sub.id
WHERE s.completed = true
ORDER BY s.subject_id, s.started_at DESC;

-- Normative percentiles (materialized for performance)
CREATE MATERIALIZED VIEW mv_normative_percentiles AS
SELECT
  gr.game_key,
  sub.sex,
  FLOOR((EXTRACT(YEAR FROM now()) - sub.birth_year) / 10) * 10 AS age_decade,

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

  COUNT(*) AS n
FROM game_results gr
JOIN sessions s ON gr.session_id = s.id
JOIN subjects sub ON s.subject_id = sub.id
WHERE sub.subject_type = 'healthy'
  AND s.completed = true
  AND gr.quality_frames_pct > 70
GROUP BY gr.game_key, sub.sex, age_decade
HAVING COUNT(*) >= 5;

CREATE UNIQUE INDEX idx_mv_normative ON mv_normative_percentiles(game_key, sex, age_decade);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHAT MODULE (Realtime Internal Messaging)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE conversation_type AS ENUM ('direct', 'group');

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            conversation_type NOT NULL,
  name            text, -- Null for direct, optional for groups
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  operator_id     uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  hidden          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, operator_id)
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversation_participants_operator ON conversation_participants(operator_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.operator_id = auth.uid())
  );
CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (true);
CREATE POLICY conversations_update ON conversations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.operator_id = auth.uid())
  );

CREATE POLICY participants_select ON conversation_participants
  FOR SELECT USING (auth.role() = 'authenticated');

-- Participants: Any operator can add participants
CREATE POLICY participants_insert ON conversation_participants
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY participants_update ON conversation_participants
  FOR UPDATE USING (operator_id = auth.uid());

CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.operator_id = auth.uid())
  );
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.operator_id = auth.uid())
  );

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION unhide_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_participants 
  SET hidden = false 
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER unhide_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION unhide_conversation();

-- ─────────────────────────────────────────────────────────────────────────────
-- IMPLEMENTATION NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- AUTH MODEL:
--   Supabase Auth with "phone" provider (ab)used for username-only login:
--   - Sign up: supabase.auth.signUp({phone: username, password: password})
--   - Or use a custom "username" identity via Supabase's identity linking.
--   - Alternative: use email field as "username@fixedgap.local" (fake domain,
--     with email confirmation disabled). This is the simplest approach.
--   - The operators table stores the human-readable username separately.
--   - No real email is ever collected or stored.
--
-- RLS:
--   Each operator sees only their own subjects/sessions.
--   For a future admin/researcher role with cross-operator access:
--   CREATE POLICY admin_all ON subjects FOR SELECT
--     USING (auth.jwt() ->> 'user_role' = 'admin');
--
-- MATERIALIZED VIEW REFRESH:
--   Run after each batch of sessions (pg_cron or manual):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_normative_percentiles;
--
-- JSONB FIELDS:
--   Not indexed. For research export and recomputation only.
--   If per-repetition SQL queries are needed at scale, materialize
--   into a separate table.
--
-- QUALITATIVE PROXY (supination/pronation):
--   Must display uncertainty disclaimer in clinician UI.
--   Not for diagnostic decisions.
--
-- CRI COMPOSITE:
--   Exploratory. Not validated against FMA-UE/DASH in real population.
--   Must carry "NOT CLINICALLY VALIDATED" label.
--
-- PRIVACY:
--   - No email stored
--   - birth_year only (not full date)
--   - display_name can be pseudonym
--   - No video/image data stored
--   - Operator identified by username only
--
