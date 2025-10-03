-- Initial schema for Amp Orchestra profile-based authentication system

-- Profiles table to store different Amp configurations
CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    api_url TEXT NOT NULL,
    cli_path TEXT,
    tls_insecure BOOLEAN NOT NULL DEFAULT 0,
    db_namespace TEXT,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UI state table for storing application state like active profile
CREATE TABLE ui_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update the updated_at column for profiles
CREATE TRIGGER update_profiles_updated_at 
    AFTER UPDATE ON profiles
    FOR EACH ROW
BEGIN
    UPDATE profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create trigger to automatically update the updated_at column for ui_state
CREATE TRIGGER update_ui_state_updated_at 
    AFTER UPDATE ON ui_state
    FOR EACH ROW
BEGIN
    UPDATE ui_state SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

-- Insert default profiles
INSERT INTO profiles (id, name, api_url, cli_path, tls_insecure, db_namespace) VALUES 
('bundled', 'Bundled', 'https://ampcode.com', NULL, 0, 'bundled'),
('global', 'Global', 'https://ampcode.com', 'amp', 0, 'global'),
('dev-home', 'Dev Home', 'https://localhost:7002', NULL, 1, 'dev-home');

-- Set default active profile to bundled
INSERT INTO ui_state (key, value) VALUES ('active_profile_id', 'bundled');
