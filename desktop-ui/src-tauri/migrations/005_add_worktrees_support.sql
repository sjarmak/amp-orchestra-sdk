-- Migration 005: Add worktree support
-- This migration adds the worktrees table to track Git worktrees
-- for session isolation and management.

CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    repo_root TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed TEXT,
    cleanup_scheduled BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_worktrees_session ON worktrees(session_id);
CREATE INDEX IF NOT EXISTS idx_worktrees_cleanup ON worktrees(cleanup_scheduled);
CREATE INDEX IF NOT EXISTS idx_worktrees_created_at ON worktrees(created_at);

-- Add a unique constraint to ensure one worktree per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_worktrees_unique_session ON worktrees(session_id);
