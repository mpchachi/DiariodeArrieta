-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — un médico solo puede cambiar su nombre visible (no su equipo, usuario ni id).
-- Revocar UPDATE de una sola columna no basta si el UPDATE de toda la tabla sigue
-- concedido: se revoca el de la tabla y se concede solo el de display_name.
-- (Detectado en la prueba de 005_teams: un médico podía asignarse a otro equipo.)
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.operators FROM authenticated, anon;
GRANT UPDATE (display_name) ON public.operators TO authenticated;
