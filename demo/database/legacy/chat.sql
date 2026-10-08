-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — Chat Module Schema
-- Execute this script in your Supabase SQL Editor to enable Realtime Chat.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE conversation_type AS ENUM ('direct', 'group');

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversation_participants_operator ON conversation_participants(operator_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Conversations: Only visible if the operator is a participant
CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = id AND cp.operator_id = auth.uid())
  );

-- Conversations: Any operator can create a conversation
CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (true);

-- Conversations: Only participants can update (e.g., change group name)
CREATE POLICY conversations_update ON conversations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = id AND cp.operator_id = auth.uid())
  );

-- Participants: Any authenticated user can view participants
CREATE POLICY participants_select ON conversation_participants
  FOR SELECT USING (auth.role() = 'authenticated');

-- Participants: Any authenticated user can add participants
CREATE POLICY participants_insert ON conversation_participants
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Participants: Users can update their own row (e.g., hide/unhide)
CREATE POLICY participants_update ON conversation_participants
  FOR UPDATE USING (operator_id = auth.uid());

-- Messages: Can view if the operator is a participant in the conversation
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_id AND cp.operator_id = auth.uid())
  );

-- Messages: Can insert if the operator is the sender and is a participant in the conversation
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_id AND cp.operator_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
-- (Assuming update_updated_at function already exists from schema.sql)
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- On new message: unhide only for sender + update conversation timestamp
CREATE OR REPLACE FUNCTION on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_participants
  SET hidden = false
  WHERE conversation_id = NEW.conversation_id
    AND operator_id = NEW.sender_id;

  UPDATE conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION on_new_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME SETUP
-- ─────────────────────────────────────────────────────────────────────────────
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table messages;
