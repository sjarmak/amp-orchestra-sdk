-- Migration 006: Add batch processing support
-- This migration adds tables for batch execution and tracking

CREATE TABLE batch_runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_sessions INTEGER NOT NULL,
    completed_sessions INTEGER DEFAULT 0,
    failed_sessions INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE batch_sessions (
    batch_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    metrics_json TEXT,
    PRIMARY KEY (batch_id, session_id),
    FOREIGN KEY (batch_id) REFERENCES batch_runs (id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);

-- Index for efficient batch session queries
CREATE INDEX idx_batch_sessions_batch_id ON batch_sessions (batch_id);
CREATE INDEX idx_batch_sessions_status ON batch_sessions (status);
CREATE INDEX idx_batch_runs_status ON batch_runs (status);
CREATE INDEX idx_batch_runs_created_at ON batch_runs (created_at);
