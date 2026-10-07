-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — esquema privado (no expuesto por la API REST de Supabase).
-- Avisos del revisor de seguridad resueltos:
--   · Las funciones auxiliares del chat (SECURITY DEFINER) ya no se pueden llamar
--     por /rest/v1/rpc; solo las usan las políticas RLS.
--   · Los percentiles normativos (vista materializada) dejan de estar en la API.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.is_conversation_participant(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_conversation_creator(uuid) SET SCHEMA private;
ALTER MATERIALIZED VIEW public.mv_normative_percentiles SET SCHEMA private;
REVOKE ALL ON private.mv_normative_percentiles FROM anon, authenticated;
