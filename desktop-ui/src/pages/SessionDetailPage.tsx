import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Clock, 
  User, 
  MessageSquare,
  RefreshCw,
  ArrowLeft,
  Settings
} from 'lucide-react';
import { useSessionThreadManager, SessionInfo, ThreadInfo } from '../hooks/useSessionThreadManager';
import { useDualChatContextWithRouter, ChatContext } from '../hooks/useDualChatContextWithRouter';

export const SessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const { 
    sessions, 
    loading, 
    error, 
    startThread, 
    refreshThreadEnv,
    loadThreadsForSession,
    getThreadsForSession 
  } = useSessionThreadManager();
  
  const { setSessionId, setThreadId } = useDualChatContextWithRouter();
  
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Find the current session
  const currentSession = sessions.find(s => s.id === sessionId);
  const sessionThreads = sessionId ? getThreadsForSession(sessionId) : [];
  const selectedThread = sessionThreads.find(t => t.id === selectedThreadId);

  // Group threads by context
  const productionThreads = sessionThreads.filter(t => t.context === 'production');
  const developmentThreads = sessionThreads.filter(t => t.context === 'development');

  useEffect(() => {
    if (sessionId) {
      loadThreadsForSession(sessionId);
    }
  }, [sessionId, loadThreadsForSession]);

  const handleCreateThread = async (context: ChatContext) => {
    if (!sessionId) return;
    
    try {
      const newThread = await startThread({
        session_id: sessionId,
        context
      });
      
      setSessionId(context, sessionId);
      setThreadId(context, newThread.id);
      setSelectedThreadId(newThread.id);
    } catch (error) {
      console.error('Failed to create new thread:', error);
    }
  };

  const handleThreadSelect = (thread: ThreadInfo) => {
    setSessionId(thread.context as ChatContext, thread.session_id);
    setThreadId(thread.context as ChatContext, thread.id);
    setSelectedThreadId(thread.id);
  };

  const handleRefreshThreadEnv = async (threadId: string) => {
    try {
      await refreshThreadEnv({ thread_id: threadId });
    } catch (error) {
      console.error('Failed to refresh thread environment:', error);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const utcString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
      const date = new Date(utcString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch {
      return 'Unknown';
    }
  };

  const getSessionTitle = (session: SessionInfo) => {
    return session.title || 'Untitled Session';
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
          <span className="text-sm text-muted-foreground">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-red-600">
          Error loading session: {error}
        </div>
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Session not found
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Session Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/sessions')}
              className="p-1 rounded hover:bg-accent transition-colors"
              title="Back to sessions"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            
            <div>
              <h1 className="text-lg font-semibold">
                {getSessionTitle(currentSession)}
              </h1>
              <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-1">
                <div className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>Updated {formatDate(currentSession.updated_at)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MessageSquare className="h-3 w-3" />
                  <span>{sessionThreads.length} threads</span>
                </div>
              </div>
            </div>
          </div>
          
          <button
            className="p-2 rounded hover:bg-accent transition-colors"
            title="Session settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Thread Toolbar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Threads</h2>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleCreateThread('production')}
              className="flex items-center space-x-1 px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
              title="New production thread"
            >
              <Plus className="h-3 w-3" />
              <span>Production</span>
            </button>
            <button
              onClick={() => handleCreateThread('development')}
              className="flex items-center space-x-1 px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
              title="New development thread"
            >
              <Plus className="h-3 w-3" />
              <span>Development</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Threads List */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {sessionThreads.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No threads yet</p>
                <p className="text-xs mt-1">Create a thread to get started</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Production Threads */}
                {productionThreads.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Production
                    </h3>
                    <div className="space-y-1">
                      {productionThreads.map((thread) => (
                        <ThreadItem
                          key={thread.id}
                          thread={thread}
                          isSelected={selectedThreadId === thread.id}
                          onSelect={() => handleThreadSelect(thread)}
                          onRefresh={() => handleRefreshThreadEnv(thread.id)}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Development Threads */}
                {developmentThreads.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Development
                    </h3>
                    <div className="space-y-1">
                      {developmentThreads.map((thread) => (
                        <ThreadItem
                          key={thread.id}
                          thread={thread}
                          isSelected={selectedThreadId === thread.id}
                          onSelect={() => handleThreadSelect(thread)}
                          onRefresh={() => handleRefreshThreadEnv(thread.id)}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedThread ? (
            <div className="flex-1 flex flex-col">
              {/* Chat Header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center space-x-2">
                  <span className={`
                    text-xs px-2 py-1 rounded-full border
                    ${selectedThread.context === 'production' 
                      ? 'bg-green-100 text-green-800 border-green-300' 
                      : 'bg-blue-100 text-blue-800 border-blue-300'
                    }
                  `}>
                    {selectedThread.context}
                  </span>
                  {selectedThread.agent_mode && (
                    <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{selectedThread.agent_mode}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Content Placeholder */}
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chat interface will be integrated here</p>
                  <p className="text-xs mt-1">Thread ID: {selectedThread.id}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a thread to start chatting</p>
                <p className="text-xs mt-1">Or create a new thread using the buttons above</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ThreadItemProps {
  thread: ThreadInfo;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  formatDate: (date: string) => string;
}

const ThreadItem: React.FC<ThreadItemProps> = ({
  thread,
  isSelected,
  onSelect,
  onRefresh,
  formatDate
}) => (
  <div
    onClick={onSelect}
    className={`
      p-3 rounded-lg cursor-pointer transition-colors group
      ${isSelected 
        ? 'bg-primary text-primary-foreground' 
        : 'hover:bg-accent'
      }
    `}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <MessageSquare className="h-3 w-3" />
          <span className="text-xs text-muted-foreground">
            Thread
          </span>
        </div>
        
        {thread.agent_mode && (
          <div className="flex items-center space-x-1 text-xs opacity-75 mb-1">
            <User className="h-3 w-3" />
            <span>{thread.agent_mode}</span>
          </div>
        )}
        
        <div className="flex items-center space-x-1 text-xs opacity-75">
          <Clock className="h-3 w-3" />
          <span>{formatDate(thread.updated_at)}</span>
        </div>
      </div>
      
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Refresh environment"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    </div>
  </div>
);
