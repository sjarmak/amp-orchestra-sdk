/**
 * ThreadsChat Component - Updated Chat Interface with Session/Thread Architecture
 *
 * This is the new chat component that uses the sessions/threads architecture
 * for better isolation and environment management.
 */

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  RefreshCw,
  CornerDownLeft,
} from "lucide-react";
import { AssistantMessage } from "./AssistantMessage";
import { ChatContextSwitcher } from "../ChatContextSwitcher";
import { ThreadPicker } from "./ThreadPicker";
import { NewThreadButton } from "./NewThreadButton";


import { useAmpService } from "../../hooks/useAmpService";
import { useDualChatContext } from "../../hooks/useDualChatContext";
import { useSessionThreadManager } from "../../hooks/useSessionThreadManager";
import { useSessionManager } from "../../contexts/SessionManagerContext";

export function ThreadsChat() {
  const [message, setMessage] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isPreparingContext, setIsPreparingContext] = useState(false);


  const { isAuthenticated, authStatus, setEnvironment, chatHistory } =
    useAmpService();

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

  const {
    createNewSession,
    startThread,
    refreshThreadEnv,
    sendMessageToThread,
  } = useSessionThreadManager();

  const {
    currentSession: activeSession,
    createThread,
    switchThread,
    renameThread,
    deleteThread,
  } = useSessionManager();

  const handleSwitchContext = async (ctx: "production" | "development") => {
    console.log("handleSwitchContext called with:", ctx);
    setIsPreparingContext(true);
    switchContext(ctx);

    try {
      // Set environment based on context
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

      // Check if we need to create a session/thread for this context
      const target = getContext(ctx);
      if (!target.currentSessionId) {
        // Create new session
        const session = await createNewSession();
        setSessionId(ctx, session.id);

        // Create initial thread
        const thread = await startThread({
          session_id: session.id,
          context: ctx,
        });
        setThreadId(ctx, thread.id);
      } else if (!target.currentThreadId) {
        // Session exists but no thread, create thread
        const thread = await startThread({
          session_id: target.currentSessionId,
          context: ctx,
        });
        setThreadId(ctx, thread.id);
      }
    } catch (error) {
      console.error("Failed to switch context:", error);
    } finally {
      setIsPreparingContext(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !activeThreadId) return;

    // Add user message with timestamp
    addMessage(activeContext, {
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId: activeSessionId || undefined,
    });

    const userMessage = message;
    setMessage("");

    try {
      await sendMessageToThread(activeThreadId, userMessage);
      // Response will be handled through the chatHistory synchronization
    } catch (error) {
      console.error("Failed to send message:", error);
      addMessage(activeContext, {
        role: "error",
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: Date.now(),
        sessionId: activeSessionId || undefined,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCreateNewThread = async () => {
    try {
      if (!activeSession) {
        console.error("No active session");
        return;
      }

      const threadId = await createThread(activeSession.id);
      switchThread(activeSession.id, threadId);
      setThreadId(activeContext, threadId);
      clearContext(activeContext);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  };

  const handleThreadSelect = (threadId: string) => {
    if (!activeSession) return;
    
    switchThread(activeSession.id, threadId);
    setThreadId(activeContext, threadId);
    clearContext(activeContext);
  };

  const handleRenameThread = (threadId: string, name: string) => {
    if (!activeSession) return;
    renameThread(activeSession.id, threadId, name);
  };

  const handleDeleteThread = (threadId: string) => {
    if (!activeSession) return;
    
    // If deleting the active thread, switch to another one or clear
    if (activeThreadId === threadId) {
      const otherThreads = activeSession.threads.filter((t: any) => t.id !== threadId);
      if (otherThreads.length > 0) {
        handleThreadSelect(otherThreads[0].id);
      } else {
        setThreadId(activeContext, null);
        clearContext(activeContext);
      }
    }
    
    deleteThread(activeSession.id, threadId);
  };

  const handleRefreshEnvironment = async () => {
    if (!activeThreadId) return;

    try {
      setIsPreparingContext(true);
      await refreshThreadEnv({ thread_id: activeThreadId });
    } catch (error) {
      console.error("Failed to refresh environment:", error);
    } finally {
      setIsPreparingContext(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  // Initialize session and thread for the active context if none exists
  const sessionInitialized = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initializeSessionThread = async () => {
      const contextKey = `${activeContext}-${isAuthenticated}`;

      // Only create once per context when authenticated
      if (
        isAuthenticated &&
        !activeSessionId &&
        !sessionInitialized.current.has(contextKey)
      ) {
        sessionInitialized.current.add(contextKey);

        try {
          console.log(
            "Creating initial session/thread for context:",
            activeContext
          );
          const session = await createNewSession();
          setSessionId(activeContext, session.id);

          const thread = await startThread({
            session_id: session.id,
            context: activeContext,
          });
          setThreadId(activeContext, thread.id);

          console.log(
            "Initial session/thread created:",
            { session: session.id, thread: thread.id },
            "for context:",
            activeContext
          );
        } catch (error) {
          console.error("Failed to create initial session/thread:", error);
          sessionInitialized.current.delete(contextKey); // Allow retry on error
        }
      }
    };

    initializeSessionThread();
  }, [
    isAuthenticated,
    activeSessionId,
    activeThreadId,
    activeContext,
    createNewSession,
    startThread,
    setSessionId,
    setThreadId,
  ]);

  // Synchronize chatHistory from useAmpService with useDualChatContext
  useEffect(() => {
    if (activeThreadId && chatHistory.length > 0) {
      // Filter messages for the current thread
      const threadMessages = chatHistory.filter(
        (msg) => msg.sessionId === activeThreadId
      );

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
          "messages for thread:",
          activeThreadId,
          "current context messages:",
          currentMessages.length
        );

        // Clear messages but preserve session ID and thread ID
        clearMessages(activeContext);
        threadMessages.forEach((message) => {
          addMessage(activeContext, message);
        });
      }
    }
  }, [
    chatHistory,
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
        </div>

        {/* Oracle's Chat Header Layout */}
        <div className="border-b border-border pb-4 mb-4">
          {/* Thread Management Row */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground">Thread:</span>
              <ThreadPicker
                threads={activeSession?.threads || []}
                activeThreadId={activeThreadId || undefined}
                onThreadSelect={handleThreadSelect}
                onCreateThread={handleCreateNewThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                disabled={!activeSession}
              />
            </div>
            <NewThreadButton
              onCreateThread={handleCreateNewThread}
              disabled={!activeSession}
              className="text-xs px-2 py-1"
            />
          </div>

          {/* Context and Controls Row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground">Context:</span>
              <ChatContextSwitcher
                activeContext={activeContext}
                onSwitch={handleSwitchContext}
                productionMessageCount={getContext("production").messages.length}
                developmentMessageCount={getContext("development").messages.length}
              />
            </div>

            <button
              onClick={handleRefreshEnvironment}
              disabled={!activeThreadId || isPreparingContext}
              className="px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh environment"
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Refresh Env
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
                  {activeThreadId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Thread: {activeThreadId.slice(-8)}
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
                  ? "Preparing context..."
                  : "Type a message... (⌘+Enter to send)"
                : "Authentication required"
            }
            disabled={!isAuthenticated || isPreparingContext || !activeThreadId}
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            rows={5}
            className="w-full px-3 py-2 pr-12 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none min-h-[100px]"
          />
          <button
            onClick={sendMessage}
            disabled={
              !message.trim() ||
              !isAuthenticated ||
              isPreparingContext ||
              !activeThreadId
            }
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

export default ThreadsChat;
