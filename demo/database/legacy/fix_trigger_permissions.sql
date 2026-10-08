-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix: Trigger cannot UPDATE sessions due to missing RLS policy
--
-- Problem: update_session_completion() runs as SECURITY INVOKER by default.
-- When it tries to UPDATE sessions, RLS blocks it because there's no
-- UPDATE policy on the sessions table.
--
-- Solution: Make the trigger function SECURITY DEFINER so it runs with
-- the owner's permissions (bypasses RLS). This is the standard pattern
-- for internal bookkeeping triggers that modify related tables.
--
-- Also adds SET search_path = public (from earlier advisory fix).
-- ═══════════════════════════════════════════════════════════════════════════════

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
$$;

-- Also make update_updated_at SECURITY DEFINER for consistency
-- (it updates subjects.updated_at which also has no UPDATE-via-trigger path)
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
$$;

-- Also fix unhide_conversation trigger (same pattern)
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
$$;
