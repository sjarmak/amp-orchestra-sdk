-- Chat sessions metadata
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  context TEXT NOT NULL, -- 'production' | 'development'
  title TEXT,
  last_snippet TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_chat_sessions_updated_at
AFTER UPDATE ON chat_sessions
FOR EACH ROW
BEGIN
  UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
