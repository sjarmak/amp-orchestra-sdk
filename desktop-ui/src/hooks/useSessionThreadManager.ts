import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface SessionInfo {
  id: string;
  title: string | null;
  profile_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadInfo {
  id: string;
  session_id: string;
  context: 'production' | 'development';
  agent_mode: string | null;
  toolbox_snapshot: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface SessionCreateRequest {
  profile_id?: number | null;
}

export interface ThreadStartRequest {
  session_id: string;
  context: 'production' | 'development';
  agent_mode?: string | null;
}

export interface ThreadAttachRequest {
  thread_id: string;
}

export interface ThreadRefreshEnvRequest {
  thread_id: string;
}

export const useSessionThreadManager = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all sessions from the database
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const sessionList = await invoke<SessionInfo[]>('list_sessions', { profileId: null });
      setSessions(sessionList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load threads for a specific session
  const loadThreadsForSession = useCallback(async (sessionId: string) => {
    try {
      const threadList = await invoke<ThreadInfo[]>('list_threads', { 
        sessionId, 
        includeArchived: false 
      });
      setThreads(prev => [...prev.filter(t => t.session_id !== sessionId), ...threadList]);
    } catch (err) {
      console.error(`Failed to load threads for session ${sessionId}:`, err);
    }
  }, []);

  // Create a new session
  const createNewSession = useCallback(async (request: SessionCreateRequest = {}) => {
    try {
      const session = await invoke<SessionInfo>('new_session_create', { request });
      
      // Reload sessions to get the updated list
      await loadSessions();
      
      return session;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMessage);
      console.error('Failed to create session:', err);
      throw err;
    }
  }, [loadSessions]);

  // Start a new thread in a session
  const startThread = useCallback(async (request: ThreadStartRequest) => {
    try {
      const thread = await invoke<ThreadInfo>('thread_start', { request });
      
      // Update local thread state
      setThreads(prev => [...prev, thread]);
      
      return thread;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start thread';
      setError(errorMessage);
      console.error('Failed to start thread:', err);
      throw err;
    }
  }, []);

  // Attach to existing thread
  const attachToThread = useCallback(async (request: ThreadAttachRequest) => {
    try {
      const thread = await invoke<ThreadInfo>('thread_attach', { request });
      return thread;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to attach to thread';
      setError(errorMessage);
      console.error('Failed to attach to thread:', err);
      throw err;
    }
  }, []);

  // Refresh thread environment
  const refreshThreadEnv = useCallback(async (request: ThreadRefreshEnvRequest) => {
    try {
      const thread = await invoke<ThreadInfo>('thread_refresh_env', { request });
      
      // Update local thread state
      setThreads(prev => prev.map(t => t.id === thread.id ? thread : t));
      
      return thread;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh thread environment';
      setError(errorMessage);
      console.error('Failed to refresh thread environment:', err);
      throw err;
    }
  }, []);

  // Send message to thread
  const sendMessageToThread = useCallback(async (threadId: string, message: string) => {
    try {
      await invoke('thread_send_message', {
        threadId,
        message
      });
    } catch (err) {
      console.error('Failed to send message to thread:', err);
      throw err;
    }
  }, []);

  // Get session by ID
  const getSession = useCallback((sessionId: string) => {
    return sessions.find(session => session.id === sessionId);
  }, [sessions]);

  // Get threads for a session
  const getThreadsForSession = useCallback((sessionId: string) => {
    return threads.filter(thread => thread.session_id === sessionId);
  }, [threads]);

  // Get thread by ID
  const getThread = useCallback((threadId: string) => {
    return threads.find(thread => thread.id === threadId);
  }, [threads]);

  // Get threads by context
  const getThreadsByContext = useCallback((context: 'production' | 'development') => {
    return threads.filter(thread => thread.context === context);
  }, [threads]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    // State
    sessions,
    threads,
    loading,
    error,
    
    // Session management
    loadSessions,
    createNewSession,
    getSession,
    
    // Thread management  
    loadThreadsForSession,
    startThread,
    attachToThread,
    refreshThreadEnv,
    sendMessageToThread,
    getThread,
    getThreadsForSession,
    getThreadsByContext,
  };
};
