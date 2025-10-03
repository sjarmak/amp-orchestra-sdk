import { useState, useCallback } from 'react';
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

export const useDualChatContext = () => {
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

  const switchContext = useCallback((context: ChatContext) => {
    setState(prev => ({
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
    }));
  }, []);

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
  }, []);

  const setThreadId = useCallback((context: ChatContext, threadId: string | null) => {
    setState(prev => ({
      ...prev,
      [context]: {
        ...prev[context],
        currentThreadId: threadId
      }
    }));
  }, []);

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
  }, []);

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
