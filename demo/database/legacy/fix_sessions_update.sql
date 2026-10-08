-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix: Missing UPDATE policy on sessions + missing UPDATE policy prevents
-- updateSessionQuality() from writing quality_frames_pct and avg_fps.
--
-- Also: The trigger already handles ended_at/completed/games_played via
-- SECURITY DEFINER, but the client needs UPDATE access for quality metrics.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow operators to update their own sessions (needed for quality metrics write)
CREATE POLICY sessions_update ON sessions
  FOR UPDATE USING (operator_id = auth.uid());
