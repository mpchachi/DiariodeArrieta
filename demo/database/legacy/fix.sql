-- 1. Añadir la columna de 'oculto' a los participantes de la conversación
ALTER TABLE conversation_participants 
ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- 2. Actualizar la política de mensajes para arreglar el bug de los mensajes vacíos
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.operator_id = auth.uid())
  );

-- 3. Crear política para que un usuario pueda ocultar/desocultar sus propios chats
DROP POLICY IF EXISTS participants_update ON conversation_participants;
CREATE POLICY participants_update ON conversation_participants
  FOR UPDATE USING (operator_id = auth.uid());

-- 4. Crear el Trigger para desocultar chats automáticamente cuando llega un mensaje nuevo
CREATE OR REPLACE FUNCTION unhide_conversation()
RETURNS trigger AS $$
BEGIN
  UPDATE conversation_participants 
  SET hidden = false 
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS unhide_on_new_message ON messages;
CREATE TRIGGER unhide_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION unhide_conversation();
