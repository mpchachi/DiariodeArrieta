-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — pacientes compartidos por EQUIPO (p. ej. un hospital).
--   · Cada médico pertenece (o no) a un equipo: operators.team_id.
--   · Los médicos del mismo equipo ven y gestionan los pacientes, sesiones y resultados
--     de todos los del equipo. Nadie ve nada de otros equipos.
--   · Un médico sin equipo solo ve lo suyo.
--   · Borrar un paciente: solo quien lo creó (el resto puede desactivarlo).
-- Para añadir un médico a un equipo: UPDATE public.operators SET team_id = '<id>' WHERE username = '<usuario>';
-- (o desde el Table Editor). Se puede indicar al crear el usuario con el metadato «team_id».
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.operators ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX idx_operators_team ON public.operators(team_id);

-- ¿El médico `other` es yo mismo o de mi equipo? (SECURITY DEFINER: lee operators sin RLS)
CREATE OR REPLACE FUNCTION private.same_team(other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT other = auth.uid() OR EXISTS (
    SELECT 1 FROM public.operators me JOIN public.operators them ON them.team_id = me.team_id
    WHERE me.id = auth.uid() AND them.id = other AND me.team_id IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION private.same_team(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.same_team(uuid) TO authenticated;

-- Cada médico ve su propio equipo.
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated USING (
  id = (SELECT team_id FROM public.operators WHERE id = (SELECT auth.uid()))
);
-- El equipo no lo puede cambiar el propio médico (solo administración).
REVOKE UPDATE (team_id) ON public.operators FROM authenticated;

-- Pacientes
DROP POLICY subjects_select ON public.subjects;
DROP POLICY subjects_update ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated USING (private.same_team(operator_id));
CREATE POLICY subjects_update ON public.subjects FOR UPDATE TO authenticated
  USING (private.same_team(operator_id)) WITH CHECK (private.same_team(operator_id));
-- subjects_insert (creador = yo) y subjects_delete (solo el creador) se mantienen.

-- Sesiones: cualquier médico del equipo puede jugar con cualquier paciente del equipo.
DROP POLICY sessions_select ON public.sessions;
DROP POLICY sessions_insert ON public.sessions;
DROP POLICY sessions_update ON public.sessions;
CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated USING (private.same_team(operator_id));
CREATE POLICY sessions_insert ON public.sessions FOR INSERT TO authenticated WITH CHECK (
  operator_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = subject_id AND private.same_team(sub.operator_id))
);
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO authenticated
  USING (operator_id = (SELECT auth.uid())) WITH CHECK (operator_id = (SELECT auth.uid()));

-- Resultados: visibles para el equipo; los inserta quien dirigió la sesión.
DROP POLICY game_results_select ON public.game_results;
CREATE POLICY game_results_select ON public.game_results FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND private.same_team(s.operator_id))
);

-- Alta de médicos: equipo opcional desde los metadatos del usuario.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uname text; team uuid;
BEGIN
  uname := lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), NEW.id::text));
  BEGIN team := (NEW.raw_user_meta_data->>'team_id')::uuid; EXCEPTION WHEN others THEN team := NULL; END;
  INSERT INTO public.operators (id, username, display_name, team_id)
  VALUES (NEW.id, uname, coalesce(NEW.raw_user_meta_data->>'display_name', uname),
          (SELECT id FROM public.teams WHERE id = team))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Equipo del piloto: Dr. Arrieta, Dr. García y Mateo (FixedGap).
INSERT INTO public.teams (name) VALUES ('Equipo piloto');
UPDATE public.operators SET team_id = (SELECT id FROM public.teams WHERE name = 'Equipo piloto')
WHERE username IN ('drgustavoarrieta', 'drandresgarcia', 'mateo');
