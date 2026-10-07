-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — seguridad (RLS). Cambios respecto al producto anterior:
--   · Cada médico ve y modifica SOLO sus pacientes, sesiones y resultados (antes
--     cualquier usuario autenticado podía leer todos los pacientes).
--   · Nada es accesible sin sesión (todas las políticas son TO authenticated).
--   · Chat: solo participantes ven conversaciones, participantes y mensajes; solo el
--     creador de una conversación puede añadir participantes (antes cualquiera podía
--     añadirse a cualquier conversación y leer sus mensajes).
--   · El directorio de médicos (para el chat) sigue visible para usuarios con sesión.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Funciones auxiliares (SECURITY DEFINER: evitan recursión de RLS en el chat).
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_participants cp
                 WHERE cp.conversation_id = conv AND cp.operator_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.is_conversation_creator(conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conv AND c.created_by = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_conversation_creator(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(uuid) TO authenticated;

-- Médicos: directorio visible con sesión; cada uno edita solo su nombre visible.
CREATE POLICY operators_select ON public.operators FOR SELECT TO authenticated USING (true);
CREATE POLICY operators_update ON public.operators FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- Pacientes: solo los propios.
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated USING (operator_id = (SELECT auth.uid()));
CREATE POLICY subjects_insert ON public.subjects FOR INSERT TO authenticated WITH CHECK (operator_id = (SELECT auth.uid()));
CREATE POLICY subjects_update ON public.subjects FOR UPDATE TO authenticated
  USING (operator_id = (SELECT auth.uid())) WITH CHECK (operator_id = (SELECT auth.uid()));
CREATE POLICY subjects_delete ON public.subjects FOR DELETE TO authenticated USING (operator_id = (SELECT auth.uid()));

-- Sesiones: solo las propias y siempre sobre un paciente propio.
CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated USING (operator_id = (SELECT auth.uid()));
CREATE POLICY sessions_insert ON public.sessions FOR INSERT TO authenticated WITH CHECK (
  operator_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = subject_id AND sub.operator_id = (SELECT auth.uid()))
);
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO authenticated
  USING (operator_id = (SELECT auth.uid())) WITH CHECK (operator_id = (SELECT auth.uid()));

-- Resultados: solo de sesiones propias.
CREATE POLICY game_results_select ON public.game_results FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.operator_id = (SELECT auth.uid()))
);
CREATE POLICY game_results_insert ON public.game_results FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.operator_id = (SELECT auth.uid()))
);

-- Chat
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_conversation_participant(id));
CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(id)) WITH CHECK (public.is_conversation_participant(id));

CREATE POLICY participants_select ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id) OR public.is_conversation_creator(conversation_id));
CREATE POLICY participants_insert ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_creator(conversation_id));
CREATE POLICY participants_update ON public.conversation_participants FOR UPDATE TO authenticated
  USING (operator_id = (SELECT auth.uid())) WITH CHECK (operator_id = (SELECT auth.uid()));

CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND public.is_conversation_participant(conversation_id));

-- Vistas: sin acceso anónimo. Los percentiles normativos son agregados (sin datos
-- individuales) y se comparten entre médicos con sesión.
REVOKE ALL ON public.v_latest_sessions FROM anon;
REVOKE ALL ON public.mv_normative_percentiles FROM anon, authenticated;
GRANT SELECT ON public.mv_normative_percentiles TO authenticated;

-- Las funciones de trigger no deben poder llamarse por la API.
REVOKE ALL ON FUNCTION public.update_session_completion() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_new_message() FROM public, anon, authenticated;

-- Tiempo real para el chat (la publicación ya existe en Supabase).
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
