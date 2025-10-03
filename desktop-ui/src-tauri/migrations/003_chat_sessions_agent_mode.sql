-- Extend chat_sessions with agent_mode and toolbox_path
ALTER TABLE chat_sessions ADD COLUMN agent_mode TEXT NULL;
ALTER TABLE chat_sessions ADD COLUMN toolbox_path TEXT NULL;

-- Backfill existing rows with default values
UPDATE chat_sessions SET agent_mode = COALESCE(agent_mode, 'default') WHERE agent_mode IS NULL;
-- toolbox_path remains NULL unless explicitly set
