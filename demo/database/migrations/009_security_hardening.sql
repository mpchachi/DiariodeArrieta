-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — endurecimiento tras la auditoría de seguridad (2026-10-08).
-- Qué arregla (cada bloque lleva el fallo que cierra):
--   1. Borrar la cuenta de un médico ya NO borra en cascada a sus pacientes ni las sesiones.
--   2. El equipo de un médico nuevo se lee de app_metadata (lo escribe solo el administrador),
--      no de user_metadata (lo puede escribir el propio usuario al registrarse).
--   3. Un médico del equipo no puede apropiarse de un paciente cambiando operator_id ni
--      borrar pacientes (la app solo desactiva: is_active = false).
--   4. El dueño de una sesión solo puede tocar las columnas de calidad; no puede moverla a
--      otro paciente ni marcarla «completa» a mano (eso lo hace el trigger).
--   5. Las sesiones y resultados de un paciente se ven según el EQUIPO DEL PACIENTE, no según
--      el médico que las dirigió: si un médico sale del equipo (008), el historial del
--      paciente sigue completo para su médico.
--   6. Las tablas del chat antiguo (sustituido por el foro en 007) se eliminan: la app ya no
--      las usa y sus políticas permitían a un participante hacerse «creador» o moverse a otra
--      conversación.
--   7. Límites de longitud en los textos libres y defensa en profundidad frente a `anon`.
-- Idempotente donde ha sido posible. Probar primero en una rama/copia del proyecto.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Sin cascadas desde operators hacia datos clínicos.
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_operator_id_fkey;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE RESTRICT;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_operator_id_fkey;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE RESTRICT;
-- Baja de un médico: desactivar la cuenta y reasignar sus pacientes antes de borrarla.
ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Equipo desde app_metadata (solo administración). username/display_name siguen en
--    user_metadata porque no dan acceso a nada.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uname text; team uuid;
BEGIN
  uname := lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), NEW.id::text));
  BEGIN team := (NEW.raw_app_meta_data->>'team_id')::uuid; EXCEPTION WHEN others THEN team := NULL; END;
  INSERT INTO public.operators (id, username, display_name, team_id)
  VALUES (NEW.id, uname, coalesce(NEW.raw_user_meta_data->>'display_name', uname),
          (SELECT id FROM public.teams WHERE id = team))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Pacientes: nadie cambia operator_id; nadie borra filas (solo desactiva).
REVOKE UPDATE ON public.subjects FROM authenticated, anon;
GRANT UPDATE (display_name, birth_year, sex, dominant_hand, subject_type, patient_data, notes, is_active)
  ON public.subjects TO authenticated;
DROP POLICY IF EXISTS subjects_delete ON public.subjects;
REVOKE DELETE ON public.subjects FROM authenticated, anon;

-- 4. Sesiones: el cliente solo crea con sus columnas y solo actualiza calidad/notas.
REVOKE INSERT, UPDATE ON public.sessions FROM authenticated, anon;
GRANT INSERT (id, subject_id, operator_id, started_at, device, quality_frames_pct, avg_fps, notes)
  ON public.sessions TO authenticated;
GRANT UPDATE (quality_frames_pct, avg_fps, notes) ON public.sessions TO authenticated;

-- 5. Visibilidad anclada al equipo del paciente.
DROP POLICY IF EXISTS sessions_select ON public.sessions;
CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated USING (
  operator_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = subject_id AND private.same_team(sub.operator_id))
);
DROP POLICY IF EXISTS game_results_select ON public.game_results;
CREATE POLICY game_results_select ON public.game_results FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.sessions s JOIN public.subjects sub ON sub.id = s.subject_id
    WHERE s.id = session_id AND (s.operator_id = (SELECT auth.uid()) OR private.same_team(sub.operator_id))
  )
);

-- 6. Chat antiguo fuera (la app usa el foro de 007).
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_participants CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP FUNCTION IF EXISTS public.is_conversation_participant(uuid);
DROP FUNCTION IF EXISTS public.is_conversation_creator(uuid);
DROP FUNCTION IF EXISTS public.on_new_message();

-- 7. Longitudes (la UI ya las limita; la base de datos también debe) y `anon` sin privilegios.
ALTER TABLE public.operators DROP CONSTRAINT IF EXISTS operators_display_name_len;
ALTER TABLE public.operators ADD CONSTRAINT operators_display_name_len CHECK (char_length(display_name) <= 80);
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_display_name_len;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_display_name_len CHECK (char_length(display_name) <= 60);
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_notes_len;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
-- team_id no hace falta exponerlo al resto de médicos (lo usa solo RLS por dentro).
REVOKE SELECT ON public.operators FROM authenticated;
GRANT SELECT (id, username, display_name, is_active, created_at) ON public.operators TO authenticated;
