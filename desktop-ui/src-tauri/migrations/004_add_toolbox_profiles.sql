-- Migration 004: Add toolbox profiles support
-- This migration adds support for multiple toolbox paths organized as named profiles

-- Create toolbox profiles table
CREATE TABLE toolbox_profiles (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- Create toolbox profile paths table (ordered list of paths for each profile)
CREATE TABLE toolbox_profile_paths (
    profile_id INTEGER NOT NULL REFERENCES toolbox_profiles(id) ON DELETE CASCADE,
    path       TEXT    NOT NULL,
    order_idx  INTEGER NOT NULL,              -- 0 = first (lowest precedence), higher = higher precedence
    PRIMARY KEY (profile_id, order_idx)
);

-- Add toolbox_profile_id column to runs table
ALTER TABLE runs ADD COLUMN toolbox_profile_id INTEGER NULL REFERENCES toolbox_profiles(id);

-- Add toolbox_profile_id column to chat_sessions table  
ALTER TABLE chat_sessions ADD COLUMN toolbox_profile_id INTEGER NULL REFERENCES toolbox_profiles(id);

-- Keep existing toolbox_path column for backward compatibility and rollback
-- No changes to existing toolbox_path column
