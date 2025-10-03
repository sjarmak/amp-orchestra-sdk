-- Migration 007: Add new threads table architecture
-- This migration introduces a new session/thread model for better isolation and navigation

-- Create sessions table (replaces chat_sessions for new architecture)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT,
    profile_id INTEGER NULL REFERENCES toolbox_profiles(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc') || 'Z'),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc') || 'Z')
);

-- Create threads table (multiple threads per session, context-aware)
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    context TEXT NOT NULL CHECK (context IN ('production', 'development')),
    agent_mode TEXT,
    toolbox_snapshot TEXT, -- JSON snapshot of toolbox configuration at thread creation
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc') || 'Z'),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc') || 'Z'),
    archived_at TEXT NULL -- Soft delete for threads
);

-- Create messages table (messages belong to threads)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc') || 'Z')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_threads_session_id ON threads(session_id);
CREATE INDEX IF NOT EXISTS idx_threads_context ON threads(context);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);

-- Create triggers for automatic updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_sessions_updated_at
AFTER UPDATE ON sessions
FOR EACH ROW
BEGIN
  UPDATE sessions SET updated_at = (datetime('now', 'utc') || 'Z') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_threads_updated_at
AFTER UPDATE ON threads
FOR EACH ROW
BEGIN
  UPDATE threads SET updated_at = (datetime('now', 'utc') || 'Z') WHERE id = NEW.id;
END;

-- Keep existing chat_sessions table for backward compatibility
-- Migration is additive - no data loss
