-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — los médicos del equipo piloto se ven los pacientes entre sí, pero NO
-- los que crea la cuenta de FixedGap (mateo, para pruebas).
-- Con las reglas de 005_teams basta con sacar a mateo del equipo: un médico sin
-- equipo solo ve lo suyo y nadie ve lo suyo. (Efecto: mateo tampoco ve los de ellos.)
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE public.operators SET team_id = NULL WHERE username = 'mateo';
