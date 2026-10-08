-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix: unhide_conversation trigger was unhiding for ALL participants
--
-- Problem: When anyone sends a message to a group, the trigger unhides the
-- conversation for every participant — defeating the purpose of "hide".
--
-- Solution: Only unhide for the SENDER. Other participants who hid the chat
-- keep it hidden until they explicitly open it or a direct mention occurs.
-- Also update conversations.updated_at on new message for correct sort order.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Unhide only for the sender (they're actively using this conversation)
  UPDATE conversation_participants
  SET hidden = false
  WHERE conversation_id = NEW.conversation_id
    AND operator_id = NEW.sender_id;

  -- Update conversation timestamp for correct sort order
  UPDATE conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- Replace the old trigger
DROP TRIGGER IF EXISTS unhide_on_new_message ON messages;
CREATE TRIGGER on_new_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION on_new_message();
