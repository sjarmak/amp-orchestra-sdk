import { useState, useCallback, useEffect } from 'react';
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

// Per-session message storage
interface SessionMessages {
  [sessionId: string]: {
    production: ChatMessage[];
    development: ChatMessage[];
  };
}

const STORAGE_KEY = 'amp_session_messages_v1';

// Load messages from localStorage
function loadMessagesFromStorage(): SessionMessages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('[useDualChatContext] Failed to load messages from localStorage:', error);
  }
  return {};
}

// Save messages to localStorage
function saveMessagesToStorage(messages: SessionMessages): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (error) {
    console.warn('[useDualChatContext] Failed to save messages to localStorage:', error);
  }
}

export const useDualChatContext = () => {
  // Per-session message storage
  const [sessionMessages, setSessionMessages] = useState<SessionMessages>(loadMessagesFromStorage);

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

  // Save to localStorage whenever sessionMessages changes
  useEffect(() => {
    saveMessagesToStorage(sessionMessages);
  }, [sessionMessages]);

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
    setState(prev => {
      const sessionId = prev[context].currentSessionId;
      if (!sessionId) {
        console.warn('[useDualChatContext] Cannot add message without active session');
        return prev;
      }

      // Update session messages storage
      setSessionMessages(prevMessages => {
        const sessionData = prevMessages[sessionId] || { production: [], development: [] };
        return {
          ...prevMessages,
          [sessionId]: {
            ...sessionData,
            [context]: [...sessionData[context], message]
          }
        };
      });

      // Update current state
      return {
        ...prev,
        [context]: {
          ...prev[context],
          messages: [...prev[context].messages, message]
        }
      };
    });
  }, []);

  const updateMessages = useCallback((context: ChatContext, messages: ChatMessage[]) => {
    setState(prev => {
      const sessionId = prev[context].currentSessionId;
      if (!sessionId) {
        return {
          ...prev,
          [context]: {
            ...prev[context],
            messages
          }
        };
      }

      // Update session messages storage
      setSessionMessages(prevMessages => {
        const sessionData = prevMessages[sessionId] || { production: [], development: [] };
        return {
          ...prevMessages,
          [sessionId]: {
            ...sessionData,
            [context]: messages
          }
        };
      });

      // Update current state
      return {
        ...prev,
        [context]: {
          ...prev[context],
          messages
        }
      };
    });
  }, []);

  const setSessionId = useCallback((context: ChatContext, sessionId: string | null) => {
    setSessionMessages(currentMessages => {
      setState(prev => {
        // Load messages for this session from storage
        const sessionData = sessionId ? currentMessages[sessionId] : null;
        const messages = sessionData ? sessionData[context] : [];

        return {
          ...prev,
          [context]: {
            ...prev[context],
            currentSessionId: sessionId,
            messages
          }
        };
      });
      return currentMessages; // Don't modify sessionMessages here
    });
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
    setState(prev => {
      const sessionId = prev[context].currentSessionId;

      // Clear messages from storage for this session
      if (sessionId) {
        setSessionMessages(prevMessages => {
          const sessionData = prevMessages[sessionId] || { production: [], development: [] };
          return {
            ...prevMessages,
            [sessionId]: {
              ...sessionData,
              [context]: []
            }
          };
        });
      }

      return {
        ...prev,
        [context]: {
          messages: [],
          currentSessionId: null,
          currentThreadId: null,
          isActive: prev[context].isActive
        }
      };
    });
  }, []);

  const clearMessages = useCallback((context: ChatContext) => {
    setState(prev => {
      const sessionId = prev[context].currentSessionId;

      // Clear messages from storage for this session
      if (sessionId) {
        setSessionMessages(prevMessages => {
          const sessionData = prevMessages[sessionId] || { production: [], development: [] };
          return {
            ...prevMessages,
            [sessionId]: {
              ...sessionData,
              [context]: []
            }
          };
        });
      }

      return {
        ...prev,
        [context]: {
          ...prev[context],
          messages: []
        }
      };
    });
  }, []);

  // Switch to a different session and load its messages
  const switchToSession = useCallback((sessionId: string | null) => {
    setSessionMessages(currentMessages => {
      setState(prev => {
        const sessionData = sessionId ? currentMessages[sessionId] : null;

        return {
          ...prev,
          production: {
            ...prev.production,
            currentSessionId: sessionId,
            messages: sessionData ? sessionData.production : []
          },
          development: {
            ...prev.development,
            currentSessionId: sessionId,
            messages: sessionData ? sessionData.development : []
          }
        };
      });
      return currentMessages; // Don't modify sessionMessages here
    });
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
    switchToSession,

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
