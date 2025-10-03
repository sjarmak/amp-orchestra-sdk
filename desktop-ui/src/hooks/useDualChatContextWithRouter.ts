import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChatMessage } from './useAmpService';

export type ChatContext = 'production' | 'development';

export interface ChatContextState {
  messages: ChatMessage[];
  currentSessionId: string | null;
  currentThreadId: string | null;
  isActive: boolean;
}

export interface DualChatContextState {
  production: ChatContextState;
  development: ChatContextState;
  activeContext: ChatContext;
}

export const useDualChatContextWithRouter = () => {
  const { sessionId, threadId } = useParams<{ sessionId?: string; threadId?: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<DualChatContextState>({
    production: {
      messages: [],
      currentSessionId: null,
      currentThreadId: null,
      isActive: true
    },
    development: {
      messages: [],
      currentSessionId: null,
      currentThreadId: null,
      isActive: false
    },
    activeContext: 'production'
  });

  // Sync URL params with state when they change
  useEffect(() => {
    if (sessionId && state.activeContext) {
      setState(prev => ({
        ...prev,
        [state.activeContext]: {
          ...prev[state.activeContext],
          currentSessionId: sessionId,
          currentThreadId: threadId || null
        }
      }));
    }
  }, [sessionId, threadId, state.activeContext]);

  const switchContext = useCallback((context: ChatContext) => {
    setState(prev => {
      const newState = {
        ...prev,
        activeContext: context,
        production: {
          ...prev.production,
          isActive: context === 'production'
        },
        development: {
          ...prev.development,
          isActive: context === 'development'
        }
      };

      // Navigate to the session for the new context if it has one
      const contextState = newState[context];
      if (contextState.currentSessionId) {
        if (contextState.currentThreadId) {
          navigate(`/sessions/${contextState.currentSessionId}/threads/${contextState.currentThreadId}`);
        } else {
          navigate(`/sessions/${contextState.currentSessionId}`);
        }
      } else {
        navigate('/sessions');
      }

      return newState;
    });
  }, [navigate]);

  const addMessage = useCallback((context: ChatContext, message: ChatMessage) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        messages: [...prev[context].messages, message]
      }
    }));
  }, []);

  const updateMessages = useCallback((context: ChatContext, messages: ChatMessage[]) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        messages
      }
    }));
  }, []);

  const setSessionId = useCallback((context: ChatContext, sessionId: string | null) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        currentSessionId: sessionId
      }
    }));

    // Update URL if this is the active context
    if (context === state.activeContext && sessionId) {
      const currentThreadId = state[context].currentThreadId;
      if (currentThreadId) {
        navigate(`/sessions/${sessionId}/threads/${currentThreadId}`);
      } else {
        navigate(`/sessions/${sessionId}`);
      }
    }
  }, [navigate, state.activeContext]);

  const setThreadId = useCallback((context: ChatContext, threadId: string | null) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        currentThreadId: threadId
      }
    }));

    // Update URL if this is the active context and we have a session
    if (context === state.activeContext && state[context].currentSessionId) {
      if (threadId) {
        navigate(`/sessions/${state[context].currentSessionId}/threads/${threadId}`);
      } else {
        navigate(`/sessions/${state[context].currentSessionId}`);
      }
    }
  }, [navigate, state.activeContext]);

  const clearContext = useCallback((context: ChatContext) => {
    setState(prev => ({
      ...prev,
      [context]: {
        messages: [],
        currentSessionId: null,
        currentThreadId: null,
        isActive: prev[context].isActive
      }
    }));

    // Navigate to sessions list if clearing the active context
    if (context === state.activeContext) {
      navigate('/sessions');
    }
  }, [navigate, state.activeContext]);

  const clearMessages = useCallback((context: ChatContext) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        messages: []
      }
    }));
  }, []);

  // Get active context data
  const activeContextData = state[state.activeContext];
  
  return {
    // Current state
    state,
    activeContext: state.activeContext,
    activeMessages: activeContextData.messages,
    activeSessionId: activeContextData.currentSessionId,
    activeThreadId: activeContextData.currentThreadId,
    
    // URL-derived state
    urlSessionId: sessionId,
    urlThreadId: threadId,
    
    // Context management
    switchContext,
    
    // Message management
    addMessage,
    updateMessages,
    setSessionId,
    setThreadId,
    clearContext,
    clearMessages,
    
    // Helper functions
    getContext: (context: ChatContext) => state[context],
    hasMessages: (context: ChatContext) => state[context].messages.length > 0
  };
};
