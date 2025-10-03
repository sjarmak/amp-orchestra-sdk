import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ChatSession {
  id: string;
  context: string;
  title?: string;
  last_snippet?: string;
  agent_mode?: string;
  toolbox_path?: string;
  created_at: string;
  updated_at: string;
}

export const useSessionManager = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all sessions from the database
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const sessionList = await invoke<ChatSession[]>('sessions_list');
      setSessions(sessionList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new session
  const createNewSession = useCallback(async () => {
    try {
      const sessionId = await invoke<string>('session_create', { 
        config: {
          working_directory: null,
          model_override: null,
          agent_id: null,
          auto_route: null,
          alloy_mode: null,
          multi_provider: null,
        }
      });
      
      // Reload sessions to get the updated list
      await loadSessions();
      
      return sessionId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMessage);
      console.error('Failed to create session:', err);
      throw err;
    }
  }, [loadSessions]);

  // Get session by ID
  const getSession = useCallback((sessionId: string) => {
    return sessions.find(session => session.id === sessionId);
  }, [sessions]);

  // Get sessions by context
  const getSessionsByContext = useCallback((context: 'production' | 'development') => {
    return sessions.filter(session => session.context === context);
  }, [sessions]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    loading,
    error,
    loadSessions,
    createNewSession,
    getSession,
    getSessionsByContext,
  };
};
