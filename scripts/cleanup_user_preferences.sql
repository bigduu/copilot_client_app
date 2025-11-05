-- Cleanup script for Copilot Chat 0.2.0 deployment
--
-- Removes orphaned user preference entries that reference deleted chats.
-- Run from psql (or your DB client) before deploying if you suspect stale data.

BEGIN;

DELETE FROM user_preferences up
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_sessions cs
  WHERE cs.id = up.last_opened_chat_id
);

COMMIT;

