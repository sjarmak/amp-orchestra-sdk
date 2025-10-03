/**
 * Chat Component - Main Chat Interface
 *
 * Extracted from the main App component for better modularity and reuse in M1.7 TUI integration.
 */

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Plus, CornerDownLeft } from "lucide-react";
import { AssistantMessage } from "./AssistantMessage";
import { ChatContextSwitcher } from "../ChatContextSwitcher";

import { useAmpService } from "../../hooks/useAmpService";
import { useDualChatContext } from "../../hooks/useDualChatContext";
import { useSessionManager } from "../../contexts/SessionManagerContext";

export function Chat() {
  const [message, setMessage] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [sessions] = useState<
    Array<{
      id: string;
      context: string;
      title?: string;
      last_snippet?: string;
    }>
  >([]);
  const [isPreparingContext, setIsPreparingContext] = useState(false);


  const {
    sendMessage: ampSendMessage,
    createSession,
    isAuthenticated,
    authStatus,
    setEnvironment,
    chatHistory,
    syncSessionId,

  } = useAmpService();

  const {
    activeContext,
    activeMessages,
    activeSessionId,
    activeThreadId,
    switchContext,
    addMessage,
    setSessionId,
    setThreadId,
    getContext,
    clearContext,
    clearMessages,
  } = useDualChatContext();

  const { currentSession, currentThread, switchEnvironment, createThread } = useSessionManager();

  // Sync useAmpService session ID when active session changes
  useEffect(() => {
    console.log('[Chat] useEffect triggered for activeSessionId change:', activeSessionId);
    console.log('[Chat] Syncing session ID from activeSessionId:', activeSessionId);
    if (syncSessionId) {
      syncSessionId(activeSessionId);
    } else {
      console.error('[Chat] syncSessionId function not available!');
    }
  }, [activeSessionId, syncSessionId]);

  const handleSwitchContext = async (ctx: "production" | "development") => {
    console.log("handleSwitchContext called with:", ctx);
    setIsPreparingContext(true);
    
    try {
      // First, switch both the chat context and the global environment
      switchContext(ctx);
      switchEnvironment(ctx);

      // Set environment based on context without creating new sessions
      if (ctx === "development") {
        console.log("Switching to development mode");
        await setEnvironment("local-cli", {
          cli_path: "/Users/sjarmak/amp/cli/dist/main.js",
          server_url: "https://localhost:7002",
        });
      } else {
        console.log("Switching to production mode");
        await setEnvironment("production");
      }

      // Ensure an inactive context starts clean; a fresh session will be
      // provisioned lazily once the context becomes active.
      const target = getContext(ctx);
      if (!target.currentSessionId) {
        clearMessages(ctx);
        setThreadId(ctx, null);
      }
    } catch (error) {
      console.error("Failed to switch context:", error);
    } finally {
      setIsPreparingContext(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    console.log('[Chat] sendMessage called with activeThreadId:', activeThreadId);
    console.log('[Chat] sendMessage called with activeSessionId:', activeSessionId);
    console.log('[Chat] message content:', message);

    if (!activeSessionId) {
      console.error('[Chat] No active session ID - cannot send message');
      return;
    }

    if (!activeThreadId) {
      console.error('[Chat] No active thread ID - cannot send message (thread should be created by bridge effect)');
      return;
    }

    // Use the thread ID for UI filtering, session ID for Amp communication
    const threadIdForMessage = activeThreadId || activeSessionId;

    // Add user message with timestamp
    addMessage(activeContext, {
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId: activeSessionId,
      threadId: threadIdForMessage,
    });

    const userMessage = message;
    setMessage("");

    try {
      console.log('[Chat] Calling ampSendMessage with activeSessionId:', activeSessionId);
      await ampSendMessage(userMessage);
      // Response will be handled through the chatHistory synchronization
    } catch (error) {
      console.error("Failed to send message:", error);
      addMessage(activeContext, {
        role: "error",
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: Date.now(),
        sessionId: activeSessionId,
        threadId: threadIdForMessage,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  // Initialize a session for the active context if none exists
  // Use a ref to track if we've already attempted to create a session to prevent multiple attempts
  const sessionInitialized = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initializeSession = async () => {
      const contextKey = `${activeContext}-${isAuthenticated}`;

      // Only create a session once per context and only when needed
      if (
        isAuthenticated &&
        !activeSessionId &&
        !sessionInitialized.current.has(contextKey)
      ) {
        sessionInitialized.current.add(contextKey);

        try {
          console.log("Creating initial session for context:", activeContext);
          const sessionId = await createSession();
          setSessionId(activeContext, sessionId);
          setThreadId(activeContext, sessionId);
          console.log(
            "Initial session created:",
            sessionId,
            "for context:",
            activeContext
          );
        } catch (error) {
          console.error("Failed to create initial session:", error);
          sessionInitialized.current.delete(contextKey); // Allow retry on error
        }
      }
    };

    initializeSession();
  }, [
    isAuthenticated,
    activeSessionId,
    activeContext,
    createSession,
    setSessionId,
    setThreadId,
  ]);

  // Bridge effect: Sync SessionManagerContext with DualChatContext (Session-based)
  useEffect(() => {
    console.log("Bridge: Effect triggered with currentThread:", currentThread);
    console.log("Bridge: currentSession:", currentSession);
    console.log("Bridge: currentSession?.activeThreadId:", currentSession?.activeThreadId);
    console.log("Bridge: activeSessionId:", activeSessionId);
    console.log("Bridge: activeThreadId:", activeThreadId);
    
    if (!currentSession) {
      console.log("Bridge: No currentSession available, skipping sync");
      return;
    }

    if (currentSession.environment !== activeContext) {
      console.log(
        "Bridge: Session environment mismatch, skipping sync",
        currentSession.environment,
        "!=",
        activeContext
      );
      return;
    }

    if (!currentThread) {
      console.log("Bridge: No currentThread - creating thread for session");
      // Create a thread immediately when switching to a session with no threads
      const createThreadAsync = async () => {
        try {
          const threadId = await createThread(currentSession.id, 'New Thread');
          console.log("Bridge: Created thread for sessionless session:", threadId);
        } catch (error) {
          console.error("Bridge: Failed to create thread:", error);
        }
      };
      createThreadAsync();
      return; // Let the next effect cycle handle the new thread
    }
    
    console.log("Bridge: Thread changed to:", currentThread);
    
    // Keep UI thread ID in sync for message filtering
    if (currentThread.id !== activeThreadId) {
      console.log("Bridge: Setting thread ID to:", currentThread.id);
      setThreadId(activeContext, currentThread.id);
    }
    
    // For Amp communication, we need to ensure we have a valid session ID
    // If the thread.id is a real Amp session ID, use it for both
    if (currentThread.id !== activeSessionId) {
      console.log("Bridge: Setting session ID to match thread:", currentThread.id);
      setSessionId(activeContext, currentThread.id);
    }
  }, [currentThread, activeContext, activeThreadId, activeSessionId, setThreadId, setSessionId, currentSession]);

  // Synchronize chatHistory from useAmpService with useDualChatContext
  useEffect(() => {
    // Use thread ID for filtering if available, otherwise fall back to session ID
    const filterId = activeThreadId || activeSessionId;
    const filterType = activeThreadId ? 'thread' : 'session';
    const filterField = activeThreadId ? 'threadId' : 'sessionId';
    
    // If no filter ID, clear messages (session with no threads)
    if (!filterId) {
      console.log('[Chat] No active thread or session ID - clearing messages');
      const currentContext = getContext(activeContext);
      if (currentContext.messages.length > 0) {
        clearMessages(activeContext);
      }
      return;
    }
    
    if (chatHistory.length > 0) {
      // Filter messages for the current thread/session
      console.log(`[Chat] Filtering messages for active${filterType}Id:`, filterId);
      console.log('[Chat] Total messages in chatHistory:', chatHistory.length);
      console.log(`[Chat] All messages with ${filterField}s:`, chatHistory.map(msg => ({ content: msg.content, [filterField]: (msg as any)[filterField] })));
      
      const threadMessages = chatHistory.filter(
        (msg) => (msg as any)[filterField] === filterId
      );
      
      console.log(`[Chat] Filtered ${filterType}Messages:`, threadMessages.length, threadMessages.map(msg => ({ content: msg.content, [filterField]: (msg as any)[filterField] })));

      // Get current context messages
      const currentContext = getContext(activeContext);
      const currentMessages = currentContext.messages;

      // Check if we need to sync - compare actual message content
      let needsSync = false;

      if (threadMessages.length !== currentMessages.length) {
        needsSync = true;
        console.log(
          "Sync needed: message count difference",
          threadMessages.length,
          "vs",
          currentMessages.length
        );
      } else if (threadMessages.length > 0 && currentMessages.length > 0) {
        // Check if any message content has changed
        for (let i = 0; i < threadMessages.length; i++) {
          const threadMsg = threadMessages[i];
          const contextMsg = currentMessages[i];

          if (
            threadMsg?.content !== contextMsg?.content ||
            threadMsg?.role !== contextMsg?.role ||
            JSON.stringify(threadMsg?.blocks || []) !==
              JSON.stringify(contextMsg?.blocks || [])
          ) {
            needsSync = true;
            console.log("Sync needed: message content changed at index", i);
            break;
          }
        }
      }

      if (needsSync && threadMessages.length > 0) {
        console.log(
          "Syncing chat history to dual context:",
          threadMessages.length,
          `messages for ${filterType}:`,
          filterId,
          "current context messages:",
          currentMessages.length
        );
        console.log(
          `${filterType} messages to sync:`,
          threadMessages.map((m) => ({
            role: m.role,
            content: m.content?.substring(0, 50),
          }))
        );

        // Clear messages but preserve thread/session ID
        clearMessages(activeContext);
        threadMessages.forEach((message) => {
          addMessage(activeContext, message);
        });
      } else if (threadMessages.length === 0 && currentMessages.length > 0) {
        // Clear messages when switching to a new thread/session with no messages
        console.log(
          `${filterType} ID changed and no messages found for new ${filterType}:`,
          filterId,
          "- clearing existing messages"
        );
        clearMessages(activeContext);
      } else {
        console.log(
          "Skipping sync - needsSync:",
          needsSync,
          `${filterType}Messages.length:`,
          threadMessages.length,
          "currentMessages.length:",
          currentMessages.length
        );
      }
    }
  }, [
    chatHistory,
    activeSessionId,
    activeThreadId,
    activeContext,
    getContext,
    addMessage,
    clearMessages,
  ]);

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Main Chat Area */}
      <div className="flex-1 p-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Amp</h2>
            {authStatus &&
              (authStatus.success ? (
                authStatus.connection_description !== "Production mode" ? (
                  <span className="text-xs px-2 py-1 rounded-full border bg-secondary text-muted-foreground border-border">
                    {authStatus.connection_description}
                  </span>
                ) : null
              ) : (
                <span className="text-xs px-2 py-1 rounded-full border bg-destructive/10 text-destructive border-destructive/20">
                  {"⚠ Not Connected"}
                </span>
              ))}
          </div>

          <div className="flex items-center gap-2">
            <ChatContextSwitcher
              activeContext={activeContext}
              onSwitch={handleSwitchContext}
              productionMessageCount={getContext("production").messages.length}
              developmentMessageCount={
                getContext("development").messages.length
              }
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sessions</span>
              <select
                className="text-xs px-2 py-1 rounded-md border border-border bg-secondary text-foreground hover:bg-secondary/60 transition-colors shadow-none outline-none appearance-none"
                value={activeSessionId || ""}
                onChange={(e) => {
                  const sid = e.target.value;
                  if (!sid) return;
                  setSessionId(activeContext, sid);
                }}
              >
                <option value="">Current</option>
                {sessions
                  .filter((s) =>
                    activeContext === "development"
                      ? s.context === "development"
                      : s.context === "production"
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.id}
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={async () => {
                // Create a brand new session (new thread) for the active context
                const sessionId = await createSession();
                clearContext(activeContext);
                setSessionId(activeContext, sessionId);
              }}
              className="px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors"
              data-test-id="chat-new-thread"
              title="Start a new thread"
            >
              <span className="inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> New thread
              </span>
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div
          ref={chatScrollRef}
          className="overflow-y-auto border rounded-md p-4 bg-muted/30 mb-4 h-[calc(100vh-280px)]"
        >
          {activeMessages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              {isAuthenticated ? (
                <div>
                  <MessageSquare className="h-12 w-12 mx-auto mb-4" />
                  <p className="mb-2">Ready to chat with Amp!</p>
                  <p className="text-sm">
                    {activeContext === "production"
                      ? "Production"
                      : "Development"}{" "}
                    context
                  </p>
                  {authStatus?.connection_description &&
                    authStatus.connection_description !== "Production mode" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {authStatus.connection_description}
                      </p>
                    )}
                </div>
              ) : (
                <div>
                  <MessageSquare className="h-12 w-12 mx-auto mb-4" />
                  <p className="mb-2">Authentication required</p>
                  <p className="text-sm">
                    Check your Amp configuration in settings
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {activeMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[80%] px-3 py-2 rounded-lg bg-card text-card-foreground border break-words">
                    {msg.role === "assistant" ? (
                      <AssistantMessage content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="relative flex-shrink-0 min-h-[120px]">
          <textarea
            id="chat-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              isAuthenticated
                ? isPreparingContext
                  ? "Switching context..."
                  : "Type a message... (⌘+Enter to send)"
                : "Authentication required"
            }
            disabled={!isAuthenticated || isPreparingContext}
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            rows={5}
            className="w-full px-3 py-2 pr-12 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none min-h-[100px]"
          />
          <button
            onClick={sendMessage}
            disabled={!message.trim() || !isAuthenticated || isPreparingContext}
            className="absolute bottom-2 right-2 p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            title="Send message (⌘+Enter)"
          >
            <span className="text-xs">⌘</span>
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
