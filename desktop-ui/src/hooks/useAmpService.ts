import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AuthStatus {
  success: boolean;
  message: string;
  version?: string;
  connection_mode: string;
  connection_description: string;
}

export interface SessionConfig {
  working_directory?: string;
  model_override?: string;
  agent_id?: string;
  auto_route?: boolean;
  alloy_mode?: boolean;
  multi_provider?: boolean;
}

export interface SendMessageOptions {
  session_id: string;
  prompt: string;
  working_directory?: string;
  model_override?: string;
}

export type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: any; is_error?: boolean }

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: number;
  sessionId?: string;
  threadId?: string;  // The Amp thread ID for filtering messages
  blocks?: AssistantBlock[];
}

export interface ToolboxProfile {
  id: number;
  name: string;
  paths: string[];
  created_at: string;
}

export interface CreateToolboxProfileRequest {
  name: string;
  paths: string[];
}

export interface UpdateToolboxProfileRequest {
  id: number;
  name?: string;
  paths?: string[];
}

export interface StreamingEvent {
  type: string;
  data?: any;
  timestamp?: number;
  [key: string]: any;
}

export const useAmpService = () => {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentThreadId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const status = await invoke<AuthStatus>('auth_status');
      setAuthStatus(status);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthStatus({
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed',
        connection_mode: 'unknown',
        connection_description: 'Connection failed'
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new session
  const createSession = useCallback(async (config: SessionConfig = {}) => {
    try {
      const sessionId = await invoke<string>('session_create', { config });
      setCurrentSessionId(sessionId);
      return sessionId;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(async (prompt: string, options?: Partial<SendMessageOptions>) => {
    if (!currentSessionId && !options?.session_id) {
      throw new Error('No active session');
    }

    const sessionId = options?.session_id || currentSessionId!;

    // Add user message to history immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      sessionId,
      threadId: sessionId  // Store the actual Amp thread ID for filtering
    };
    setChatHistory(prev => [...prev, userMessage]);

    try {
      console.log('[DEBUG] Sending message:', { sessionId, prompt });
      await invoke('chat_send', {
        options: {
          session_id: sessionId,
          prompt,
          working_directory: options?.working_directory,
          model_override: options?.model_override
        }
      });
      console.log('[DEBUG] Message sent successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Add error message to history
      const errorMessage: ChatMessage = {
        role: 'error',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        sessionId,
        threadId: sessionId  // Store the actual Amp thread ID for filtering
      };
      setChatHistory(prev => [...prev, errorMessage]);
      throw error;
    }
  }, [currentSessionId]);

  // Set environment (production, local-server, local-cli)
  const setEnvironment = useCallback(async (
    mode: 'production' | 'local-server' | 'local-cli',
    options?: {
      cli_path?: string;
      server_url?: string;
      token?: string;
    }
  ) => {
    try {
      await invoke('set_environment', {
        mode,
        cli_path: options?.cli_path,
        server_url: options?.server_url,
        token: options?.token
      });
      
      // Immediately update the auth status to reflect the change
      // The backend emits 'env_changed' event which triggers checkAuth()
      // but we also want to update the UI immediately
      setAuthStatus(prev => prev ? {
        ...prev,
        connection_mode: mode
      } : null);
      
      // Wait a bit for backend to update before refreshing
      setTimeout(async () => {
        await checkAuth();
      }, 200);
    } catch (error) {
      console.error('Failed to set environment:', error);
      throw error;
    }
  }, [checkAuth]);


  // Get configuration (backend config)
  const getConfig = useCallback(async (key?: string) => {
    try {
      return await invoke('config_get', { key });
    } catch (error) {
      console.error('Failed to get config:', error);
      throw error;
    }
  }, []);

  // Set configuration (backend config)
  const setConfig = useCallback(async (key: string, value: any) => {
    try {
      await invoke('config_set', { key, value });
    } catch (error) {
      console.error('Failed to set config:', error);
      throw error;
    }
  }, []);

  // Agent mode controls (app state env)
  const getAgentMode = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<string | null>('get_agent_mode');
      return result;
    } catch (error) {
      console.error('Failed to get agent mode:', error);
      return null;
    }
  }, []);

  const setAgentMode = useCallback(async (mode: string | null) => {
    try {
      await invoke('set_agent_mode', { mode });
    } catch (error) {
      console.error('Failed to set agent mode:', error);
      throw error;
    }
  }, []);

  // Toolbox path controls (app state env)
  const getToolboxPath = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<string | null>('get_toolbox_path');
      return result;
    } catch (error) {
      console.error('Failed to get toolbox path:', error);
      return null;
    }
  }, []);

  const setToolboxPath = useCallback(async (path: string | null) => {
    try {
      await invoke('set_toolbox_path', { path });
    } catch (error) {
      console.error('Failed to set toolbox path:', error);
      throw error;
    }
  }, []);

  // Debug function for toolbox state
  const debugToolboxState = useCallback(async () => {
    try {
      const result = await invoke('debug_toolbox_state');
      return result;
    } catch (error) {
      console.error('Failed to get toolbox debug state:', error);
      throw error;
    }
  }, []);

  // Toolbox profile management
  const listToolboxProfiles = useCallback(async (): Promise<ToolboxProfile[]> => {
    try {
      return await invoke<ToolboxProfile[]>('list_toolbox_profiles');
    } catch (error) {
      console.error('Failed to list toolbox profiles:', error);
      throw error;
    }
  }, []);

  const createToolboxProfile = useCallback(async (request: CreateToolboxProfileRequest): Promise<ToolboxProfile> => {
    try {
      return await invoke<ToolboxProfile>('create_toolbox_profile', { request });
    } catch (error) {
      console.error('Failed to create toolbox profile:', error);
      throw error;
    }
  }, []);

  const updateToolboxProfile = useCallback(async (request: UpdateToolboxProfileRequest): Promise<ToolboxProfile | null> => {
    try {
      return await invoke<ToolboxProfile | null>('update_toolbox_profile', { request });
    } catch (error) {
      console.error('Failed to update toolbox profile:', error);
      throw error;
    }
  }, []);

  const deleteToolboxProfile = useCallback(async (id: number): Promise<boolean> => {
    try {
      return await invoke<boolean>('delete_toolbox_profile', { id });
    } catch (error) {
      console.error('Failed to delete toolbox profile:', error);
      throw error;
    }
  }, []);

  const setActiveToolboxProfile = useCallback(async (profileId: number | null) => {
    try {
      await invoke('set_active_toolbox_profile', { profileId: profileId });
    } catch (error) {
      console.error('Failed to set active toolbox profile:', error);
      throw error;
    }
  }, []);

  const getActiveToolboxProfile = useCallback(async (): Promise<ToolboxProfile | null> => {
    try {
      return await invoke<ToolboxProfile | null>('get_active_toolbox_profile');
    } catch (error) {
      console.error('Failed to get active toolbox profile:', error);
      return null;
    }
  }, []);

  const migrateToolboxProfiles = useCallback(async () => {
    try {
      await invoke('migrate_toolbox_profiles');
    } catch (error) {
      console.error('Failed to migrate toolbox profiles:', error);
      throw error;
    }
  }, []);

  // Listen for streaming events
  useEffect(() => {
    const unlisten = listen<{ session_id: string; event: StreamingEvent }>('chat_stream', (event) => {
      console.log('[DEBUG] Received chat_stream event:', event);
      const { session_id, event: streamingEvent } = event.payload;
      
      console.log('[DEBUG] Processing streaming event type:', streamingEvent.type, streamingEvent.data);
      
      if (
        streamingEvent.type === 'assistant' ||
        streamingEvent.type === 'result' ||
        streamingEvent.type === 'user'
      ) {
        let content: string | undefined;
        let blocks: AssistantBlock[] | undefined;

        if (streamingEvent.type === 'assistant') {
          const msg = streamingEvent.message ?? streamingEvent.data?.message ?? streamingEvent;
          const parts = msg?.content ?? streamingEvent.content;
          if (Array.isArray(parts)) {
            blocks = [];
            content = '';
            for (const p of parts) {
              if (p?.type === 'text') {
                const t = p?.text ?? '';
                content += t;
                blocks.push({ type: 'text', text: t });
              } else if (p?.type === 'tool_use') {
                blocks.push({ type: 'tool_use', id: p.id || p.tool_use_id || '', name: p.name || 'tool', input: p.input });
              }
            }
          } else {
            content = msg?.text ?? streamingEvent.text ?? undefined;
          }
        } else if (streamingEvent.type === 'user') {
          // Tool results often arrive as user messages with tool_result blocks
          const msg = streamingEvent.message ?? streamingEvent.data?.message ?? streamingEvent;
          const parts = msg?.content ?? streamingEvent.content;
          if (Array.isArray(parts)) {
            blocks = [];
            for (const p of parts) {
              if (p?.type === 'tool_result') {
                const resultContent = Array.isArray(p.content)
                  ? p.content.map((c: any) => c?.text ?? c?.content ?? '').join('')
                  : p.content;
                blocks.push({ type: 'tool_result', tool_use_id: p.tool_use_id || p.id || '', content: resultContent, is_error: !!p.is_error });
              }
            }
          }
        } else if (streamingEvent.type === 'result') {
          // Show error text if present; otherwise only append if no assistant followed
          content = streamingEvent.error || streamingEvent.data?.error || streamingEvent.data?.result;
        }
        
        if (!content && (!blocks || blocks.length === 0)) return;
        
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: content || '',
          timestamp: streamingEvent.timestamp || Date.now(),
          sessionId: session_id,
          threadId: session_id,  // Store the actual Amp thread ID for filtering
          blocks
        };
        
        setChatHistory(prev => {
          if (streamingEvent.type === 'result') {
            let lastUserIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (m.sessionId === session_id && m.role === 'user') { lastUserIdx = i; break; }
            }
            const hasAssistantAfter = prev.slice(lastUserIdx + 1).some(m => m.sessionId === session_id && m.role === 'assistant');
            if (hasAssistantAfter) return prev;
            return [...prev, assistantMessage];
          }

          if (streamingEvent.type === 'user' && blocks && blocks.length > 0) {
            // Attach tool_result blocks to the last assistant message in this session
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (m.sessionId === session_id && m.role === 'assistant') {
                const newBlocks = [...(m.blocks || []), ...blocks];
                return [...prev.slice(0, i), { ...m, blocks: newBlocks }, ...prev.slice(i + 1)];
              }
            }
            return prev;
          }

          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.sessionId === session_id) {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: (lastMessage.content || '') + (assistantMessage.content || ''), blocks: [...(lastMessage.blocks || []), ...((assistantMessage.blocks) || [])] }
            ];
          }
          return [...prev, assistantMessage];
        });
      } else if (streamingEvent.type === 'error' || streamingEvent.type === 'error_output') {
        const err = streamingEvent.error || streamingEvent.data?.error || streamingEvent.data?.content || JSON.stringify(streamingEvent.data ?? streamingEvent);
        if (typeof err === 'string' && err.includes("NODE_TLS_REJECT_UNAUTHORIZED") && err.includes("Warning")) return;
        const errorMessage: ChatMessage = { role: 'error', content: err, timestamp: streamingEvent.timestamp || Date.now(), sessionId: session_id, threadId: session_id };
        setChatHistory(prev => [...prev, errorMessage]);
      } else if (streamingEvent.type === 'connection-info' || (streamingEvent.type === 'system' && streamingEvent.subtype === 'connection-info')) {
        const data = streamingEvent.data ?? streamingEvent;
        setAuthStatus(prev => prev ? {
          ...prev,
          success: !!data.authenticated,
          connection_mode: data.connection?.mode ?? prev.connection_mode,
          connection_description: data.description ?? prev.connection_description,
          version: data.version ?? prev.version
        } : null);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Listen for environment changes from backend and refresh auth status
  useEffect(() => {
    const unlistenEnv = listen<{ connection_mode: string }>('env_changed', async () => {
      await checkAuth();
    });
    return () => { unlistenEnv.then(fn => fn()); };
  }, [checkAuth]);
  
  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const syncSessionId = useCallback((sessionId: string | null) => {
    console.log('[useAmpService] Syncing session ID:', currentSessionId, '->', sessionId);
    setCurrentSessionId(sessionId);
  }, [currentSessionId]);



  return {
    // State
    authStatus,
    isLoading,
    currentSessionId,
    currentThreadId,
    chatHistory,
    
    // Actions
    checkAuth,
    createSession,
    sendMessage,
    setEnvironment,
    getConfig,
    setConfig,
    getAgentMode,
    setAgentMode,
    getToolboxPath,
    setToolboxPath,
    debugToolboxState,
    listToolboxProfiles,
    createToolboxProfile,
    syncSessionId,
    updateToolboxProfile,
    deleteToolboxProfile,
    setActiveToolboxProfile,
    getActiveToolboxProfile,
    migrateToolboxProfiles,
    
    // Helpers
    isAuthenticated: authStatus?.success || false,
    connectionMode: authStatus?.connection_mode || 'unknown',
    connectionDescription: authStatus?.connection_description || 'Unknown connection'
  };
};
