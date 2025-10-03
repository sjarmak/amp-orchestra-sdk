/**
 * Session Manager Context - Multi-session state management
 *
 * Provides a thin layer above the terminal manager to support
 * multiple concurrent sessions with different threads/environments.
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { nanoid } from "nanoid";
import { invoke } from '@tauri-apps/api/core';
import { useAmpService } from "../hooks/useAmpService";

export type SessionEnvironment = "production" | "development";

export interface Thread {
  id: string;             // Amp thread Id
  name: string;           // user-visible title ("Fix login bug")
  createdAt: number;
  lastActiveAt: number;
}

export interface Session {
  id: string;
  name: string;
  environment: SessionEnvironment;
  repositoryId: string; // Parent repository for this session
  worktreePath: string; // Path to the worktree directory
  worktreeBranch: string; // Git branch for this worktree
  threads: Thread[];      // NEW
  activeThreadId?: string;// NEW
  createdAt: number;
  lastActiveAt: number;
}

export interface WorktreeMeta {
  path: string;
  branch: string;
  isMain: boolean;
  commitHash?: string;
  lastModified?: number;
}

export interface WorktreeError {
  type:
    | "creation_failed"
    | "cleanup_failed"
    | "invalid_branch"
    | "path_exists"
    | "git_error";
  message: string;
  details?: string;
}

// Re-export types for terminal threading integration
export type {
  WorkSession,
  TerminalThreadMeta,
} from "../types/terminal-threads";

interface SessionManagerState {
  sessions: Session[];
  activeSessionId: string | null;
  currentEnvironment: SessionEnvironment;
  pendingSessions: Set<string>; // Track sessions being created asynchronously
  worktreeErrors: Map<string, WorktreeError>; // Track worktree operation errors
}

type SessionAction =
  | {
      type: "CREATE_SESSION";
      payload: {
        repositoryId: string;
        name: string;
        environment: SessionEnvironment;
        worktreePath: string;
        worktreeBranch: string;
        threadId?: string;
        id: string;
      };
    }
  | { type: "CREATE_SESSION_PENDING"; payload: { sessionId: string } }
  | {
      type: "CREATE_SESSION_FULFILLED";
      payload: {
        sessionId: string;
        worktreePath: string;
        worktreeBranch: string;
      };
    }
  | {
      type: "SET_WORKTREE_FAILED";
      payload: { sessionId: string; error: WorktreeError };
    }
  | { type: "ADD_THREAD"; payload: { sessionId: string; thread: Thread } }
  | { type: "SET_ACTIVE_THREAD"; payload: { sessionId: string; threadId: string } }
  | { type: "CREATE_THREAD"; payload: { sessionId: string; thread: Thread } }
  | { type: "RENAME_THREAD"; payload: { sessionId: string; threadId: string; name: string } }
  | { type: "DELETE_THREAD"; payload: { sessionId: string; threadId: string } }
  | { type: "SWITCH_THREAD"; payload: { sessionId: string; threadId: string } }
  | { type: "UPDATE_THREAD_ACTIVITY"; payload: { sessionId: string; threadId: string } }
  | { type: "SWITCH_SESSION"; payload: { sessionId: string } }
  | { type: "SWITCH_ENVIRONMENT"; payload: { environment: SessionEnvironment } }
  | { type: "RENAME_SESSION"; payload: { sessionId: string; name: string } }
  | { type: "DELETE_SESSION"; payload: { sessionId: string } }
  | { type: "UPDATE_ACTIVITY"; payload: { sessionId?: string } }
  | { type: "RESTORE_STATE"; payload: SessionManagerState };

interface SessionManagerContextValue {
  state: SessionManagerState;
  currentSession: Session | null;
  currentThread: Thread | null; // NEW - convenience getter
  currentEnvironment: SessionEnvironment;
  createSession: (
    repoId: string,
    name: string,
    environment: SessionEnvironment,
    branch: string,
    threadId?: string,
    repoPath?: string
  ) => Promise<string>;
  getSessionsForRepo: (repoId: string) => Session[];
  switchSession: (sessionId: string) => void;
  switchEnvironment: (environment: SessionEnvironment) => void;
  renameSession: (sessionId: string, name: string) => void;
  deleteSession: (sessionId: string, force?: boolean) => Promise<void>;
  updateActivity: (sessionId?: string) => void;
  addThread: (sessionId: string, thread: Thread) => void; // NEW
  setActiveThread: (sessionId: string, threadId: string) => void; // NEW
  createThread: (sessionId: string, name?: string) => Promise<string>;
  switchThread: (sessionId: string, threadId: string) => void;
  renameThread: (sessionId: string, threadId: string, name: string) => void;
  deleteThread: (sessionId: string, threadId: string) => Promise<void>;
  getWorktreeError: (sessionId: string) => WorktreeError | null;
  isSessionPending: (sessionId: string) => boolean;
  checkRepositoryClean: (repoPath: string) => Promise<boolean>;
  clearWorktreeError: (sessionId: string) => void;
}

const STORAGE_KEY = "amp_orchestra_sessions_by_repo";
const STORAGE_VERSION = 3;

function loadStateFromStorage(): SessionManagerState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);

      // Handle migration from v1/v2 to v3
      if (!data.version || data.version < STORAGE_VERSION) {
        if (data.version === 2) {
          console.log("Migrating session storage from v2 to v3");
          // Migrate v2 sessions with threadId to v3 with threads array
          const migratedSessions = data.sessions?.map((session: any) => {
            const threads: Thread[] = session.threadId ? [{
              id: session.threadId,
              name: session.name, // Use session name as thread name
              createdAt: session.createdAt,
              lastActiveAt: session.lastActiveAt,
            }] : [];

            return {
              ...session,
              threads,
              activeThreadId: session.threadId,
              // Remove old threadId property
              threadId: undefined,
            };
          }) || [];

          // v3 post-migration sanitiser: detect legacy UUID threads and clear them
          const sanitizedSessions = migratedSessions.map((session: any) => {
            if (session.threads.length && session.threads.some((t: Thread) => t.id.match(/^[0-9a-f-]{36}$/))) {
              console.log('[migration] Found legacy UUID thread in session:', session.name, '- clearing for fresh start');
              return {
                ...session,
                threads: [], // Clear legacy threads - new ones will be created on first use
                activeThreadId: undefined,
              };
            }
            return session;
          });

          return {
            ...data,
            sessions: sanitizedSessions,
            pendingSessions: new Set(data.pendingSessions || []),
            worktreeErrors: new Map(Object.entries(data.worktreeErrors || {})),
          };
        } else {
          console.log("Migrating session storage from v1 to v3");
          // Clear old data - worktree paths are required
          return null;
        }
      }

      // Convert Sets and Maps back from serialized form
      const loadedState = {
        ...data,
        pendingSessions: new Set(data.pendingSessions || []),
        worktreeErrors: new Map(Object.entries(data.worktreeErrors || {})),
      };

      // Runtime sanitizer: always check for legacy UUID threads and clear them
      const sanitizedSessions = loadedState.sessions.map((session: Session) => {
        if (session.threads.length && session.threads.some(t => t.id.match(/^[0-9a-f-]{36}$/))) {
          console.log('[runtime-sanitizer] Found legacy UUID thread in session:', session.name, '- clearing for fresh start');
          return {
            ...session,
            threads: [], // Clear legacy threads - new ones will be created on first use
            activeThreadId: undefined,
          };
        }
        return session;
      });

      return {
        ...loadedState,
        sessions: sanitizedSessions,
      };
    }
  } catch (error) {
    console.warn("Failed to load session state from localStorage:", error);
  }
  return null;
}

function saveStateToStorage(state: SessionManagerState) {
  try {
    // Convert Sets and Maps to serializable form
    const serializable = {
      ...state,
      version: STORAGE_VERSION,
      pendingSessions: Array.from(state.pendingSessions),
      worktreeErrors: Object.fromEntries(state.worktreeErrors),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.warn("Failed to save session state to localStorage:", error);
  }
}

function createInitialSession(repositoryId: string = "default"): Session {
  return {
    id: nanoid(),
    name: "Main",
    environment: "production",
    repositoryId,
    worktreePath: repositoryId, // For initial session, use repository path directly
    worktreeBranch: "main", // Default to main branch
    threads: [], // Start with empty threads array
    activeThreadId: undefined, // No active thread initially
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

const initialState: SessionManagerState = {
  sessions: [createInitialSession()],
  activeSessionId: null,
  currentEnvironment: "production",
  pendingSessions: new Set(),
  worktreeErrors: new Map(),
};

// Initialize with first session active
initialState.activeSessionId = initialState.sessions[0].id;

function sessionReducer(
  state: SessionManagerState,
  action: SessionAction
): SessionManagerState {
  switch (action.type) {
    case "CREATE_SESSION": {
      const newSession: Session = {
        id: action.payload.id,
        name: action.payload.name,
        environment: action.payload.environment,
        repositoryId: action.payload.repositoryId,
        worktreePath: action.payload.worktreePath,
        worktreeBranch: action.payload.worktreeBranch,
        threads: action.payload.threadId ? [{
          id: action.payload.threadId,
          name: action.payload.name, // Use session name for thread name
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        }] : [],
        activeThreadId: action.payload.threadId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      const newPendingSessions = new Set(state.pendingSessions);
      newPendingSessions.delete(newSession.id);

      return {
        ...state,
        sessions: [...state.sessions, newSession],
        activeSessionId: newSession.id,
        pendingSessions: newPendingSessions,
      };
    }

    case "CREATE_SESSION_PENDING": {
      const newPendingSessions = new Set(state.pendingSessions);
      newPendingSessions.add(action.payload.sessionId);

      return {
        ...state,
        pendingSessions: newPendingSessions,
      };
    }

    case "CREATE_SESSION_FULFILLED": {
      const { sessionId, worktreePath, worktreeBranch } = action.payload;
      const newPendingSessions = new Set(state.pendingSessions);
      newPendingSessions.delete(sessionId);

      return {
        ...state,
        pendingSessions: newPendingSessions,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, worktreePath, worktreeBranch }
            : session
        ),
      };
    }

    case "SET_WORKTREE_FAILED": {
      const { sessionId, error } = action.payload;
      const newPendingSessions = new Set(state.pendingSessions);
      newPendingSessions.delete(sessionId);

      const newWorktreeErrors = new Map(state.worktreeErrors);
      newWorktreeErrors.set(sessionId, error);

      return {
        ...state,
        pendingSessions: newPendingSessions,
        worktreeErrors: newWorktreeErrors,
      };
    }

    case "ADD_THREAD": {
      const { sessionId, thread } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { 
                ...session, 
                threads: [...session.threads, thread],
                activeThreadId: thread.id, // Automatically switch to new thread
                lastActiveAt: Date.now()
              }
            : session
        ),
      };
    }

    case "SET_ACTIVE_THREAD": {
      const { sessionId, threadId } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { 
                ...session, 
                activeThreadId: threadId,
                lastActiveAt: Date.now(),
                threads: session.threads.map(t => 
                  t.id === threadId ? { ...t, lastActiveAt: Date.now() } : t
                )
              }
            : session
        ),
      };
    }

    case "CREATE_THREAD": {
      const { sessionId, thread } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { 
                ...session, 
                threads: [...session.threads, thread],
                activeThreadId: thread.id, // Automatically switch to new thread
                lastActiveAt: Date.now()
              }
            : session
        ),
      };
    }

    case "RENAME_THREAD": {
      const { sessionId, threadId, name } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                threads: session.threads.map(thread =>
                  thread.id === threadId
                    ? { ...thread, name }
                    : thread
                ),
                lastActiveAt: Date.now()
              }
            : session
        ),
      };
    }

    case "DELETE_THREAD": {
      const { sessionId, threadId } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          
          const remainingThreads = session.threads.filter(t => t.id !== threadId);
          const newActiveThreadId = session.activeThreadId === threadId 
            ? remainingThreads.length > 0 ? remainingThreads[0].id : undefined
            : session.activeThreadId;

          return {
            ...session,
            threads: remainingThreads,
            activeThreadId: newActiveThreadId,
            lastActiveAt: Date.now()
          };
        }),
      };
    }

    case "SWITCH_THREAD": {
      const { sessionId, threadId } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { 
                ...session, 
                activeThreadId: threadId,
                lastActiveAt: Date.now(),
                threads: session.threads.map(t => 
                  t.id === threadId ? { ...t, lastActiveAt: Date.now() } : t
                )
              }
            : session
        ),
      };
    }

    case "UPDATE_THREAD_ACTIVITY": {
      const { sessionId, threadId } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                threads: session.threads.map(thread =>
                  thread.id === threadId
                    ? { ...thread, lastActiveAt: Date.now() }
                    : thread
                )
              }
            : session
        ),
      };
    }

    case "SWITCH_SESSION": {
      const { sessionId } = action.payload;
      const sessionExists = state.sessions.find((s) => s.id === sessionId);

      if (!sessionExists) {
        console.warn('SessionManager: Tried to switch to non-existent session:', sessionId);
        return state;
      }

      console.log('SessionManager: Switching to session:', sessionId, sessionExists.name);
      console.log('SessionManager: Session worktree path:', sessionExists.worktreePath);

      return {
        ...state,
        activeSessionId: sessionId,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, lastActiveAt: Date.now() }
            : session
        ),
      };
    }

    case "SWITCH_ENVIRONMENT": {
      return {
        ...state,
        currentEnvironment: action.payload.environment,
      };
    }

    case "RENAME_SESSION": {
      const { sessionId, name } = action.payload;

      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, name, lastActiveAt: Date.now() }
            : session
        ),
      };
    }

    case "DELETE_SESSION": {
      const { sessionId } = action.payload;
      const remainingSessions = state.sessions.filter(
        (s) => s.id !== sessionId
      );

      // If we're deleting the last session, create a new one for the same repository
      if (remainingSessions.length === 0) {
        const deletedSession = state.sessions.find((s) => s.id === sessionId);
        const newSession = createInitialSession(
          deletedSession?.repositoryId || "default"
        );
        return {
          ...state,
          sessions: [newSession],
          activeSessionId: newSession.id,
          pendingSessions: new Set(),
          worktreeErrors: new Map(),
        };
      }

      // If we're deleting the active session, switch to the most recent
      let newActiveId = state.activeSessionId;
      if (sessionId === state.activeSessionId) {
        const mostRecent = remainingSessions.reduce((latest, session) =>
          session.lastActiveAt > latest.lastActiveAt ? session : latest
        );
        newActiveId = mostRecent.id;
      }

      return {
        ...state,
        sessions: remainingSessions,
        activeSessionId: newActiveId,
      };
    }

    case "UPDATE_ACTIVITY": {
      const { sessionId } = action.payload;
      const targetId = sessionId || state.activeSessionId;

      if (!targetId) return state;

      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === targetId
            ? { ...session, lastActiveAt: Date.now() }
            : session
        ),
      };
    }

    case "RESTORE_STATE": {
      return action.payload;
    }

    default:
      return state;
  }
}

const SessionManagerContext = createContext<SessionManagerContextValue | null>(
  null
);

interface SessionManagerProviderProps {
  children: ReactNode;
}

export function SessionManagerProvider({
  children,
}: SessionManagerProviderProps) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    initialState,
    (initial) => {
      const stored = loadStateFromStorage();
      if (stored && stored.sessions.length > 0) {
        return stored;
      }
      return initial;
    }
  );

  const { createSession: createAmpSession } = useAmpService();

  const currentSession =
    state.sessions.find((s) => s.id === state.activeSessionId) || null;

  const currentThread = currentSession?.activeThreadId
    ? currentSession.threads.find((t) => t.id === currentSession.activeThreadId) || null
    : null;

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  const createSession = async (
    repoId: string,
    name: string,
    environment: SessionEnvironment,
    branch: string,
    threadId?: string,
    repoPath?: string
  ): Promise<string> => {
    const newId = nanoid(); // Generate ID upfront so we can return it

    // Mark session as pending
    dispatch({ type: "CREATE_SESSION_PENDING", payload: { sessionId: newId } });

    try {
      let actualThreadId = threadId;
      
      // Create default thread when creating new session if no threadId provided
      if (!actualThreadId) {
        const actualRepoPath = repoPath ?? repoId;
        const ampSessionId = await createAmpSession({
          working_directory: actualRepoPath,
          // Add agent_id if environment is development 
          ...(environment === "development" && { agent_id: "development" })
        });
        
        // The ampSessionId is the threadId from Amp
        actualThreadId = ampSessionId;
        console.log('Created Amp session with default thread ID:', actualThreadId);
      }

      const actualRepoPath = repoPath ?? repoId; // fallback for older calls
      console.log('Calling create_git_worktree with:', { repoPath: actualRepoPath, sessionId: newId });
      
      // Call Rust backend to create worktree
      const worktreeMeta = await invoke<WorktreeMeta>('create_git_worktree', {
        repoPath: actualRepoPath,
        sessionId: newId,
      });

      console.log('Received worktree metadata:', worktreeMeta);

      // Create the session with worktree info from backend and threadId
      dispatch({
        type: "CREATE_SESSION",
        payload: {
          repositoryId: repoId,
          name,
          environment,
          worktreePath: worktreeMeta.path,
          worktreeBranch: worktreeMeta.branch,
          threadId: actualThreadId,
          id: newId,
        },
      });

      console.log('Session created successfully with ID:', newId, 'and threadId:', actualThreadId);
      return newId;
    } catch (error) {
      // Handle worktree creation failure
      const worktreeError: WorktreeError = {
        type: "creation_failed",
        message: `Failed to create worktree for branch ${branch}`,
        details: error instanceof Error ? error.message : String(error),
      };

      dispatch({
        type: "SET_WORKTREE_FAILED",
        payload: { sessionId: newId, error: worktreeError },
      });

      throw error;
    }
  };

  const getSessionsForRepo = (repoId: string): Session[] => {
    return state.sessions.filter((session) => session.repositoryId === repoId);
  };

  const switchSession = (sessionId: string) => {
    console.log('SessionManager.switchSession called with:', sessionId);
    console.log('Current activeSessionId:', state.activeSessionId);
    dispatch({ type: "SWITCH_SESSION", payload: { sessionId } });
  };

  const switchEnvironment = (environment: SessionEnvironment) => {
    dispatch({ type: "SWITCH_ENVIRONMENT", payload: { environment } });
  };

  const renameSession = (sessionId: string, name: string) => {
    dispatch({ type: "RENAME_SESSION", payload: { sessionId, name } });
  };

  const deleteSession = async (sessionId: string, force: boolean = false) => {
    try {
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session) {
        dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
        return;
      }

      // Skip worktree cleanup for the main session (no separate worktree)
      if (session.worktreePath !== session.repositoryId) {
        try {
          await invoke('remove_git_worktree', {
            worktreePath: session.worktreePath,
            branchName: session.worktreeBranch,
            force,
          });
        } catch (error) {
          console.warn('Failed to clean up worktree:', error);
          // Continue with session deletion even if worktree cleanup fails
        }
      }

      dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
    } catch (error) {
      console.error('Failed to delete session:', error);
      // Still proceed with session deletion
      dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
    }
  };

  const updateActivity = useCallback((sessionId?: string) => {
    dispatch({ type: "UPDATE_ACTIVITY", payload: { sessionId } });
  }, []);

  const addThread = useCallback((sessionId: string, thread: Thread) => {
    dispatch({ type: "ADD_THREAD", payload: { sessionId, thread } });
  }, []);

  const setActiveThread = useCallback((sessionId: string, threadId: string) => {
    dispatch({ type: "SET_ACTIVE_THREAD", payload: { sessionId, threadId } });
  }, []);

  const createThread = async (sessionId: string, name?: string): Promise<string> => {
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create new Amp thread
    const ampSessionId = await createAmpSession({
      // Pass working_directory only for worktree sessions, omit for "default"
      ...(session.worktreePath !== "default" && { working_directory: session.worktreePath }),
      // Add agent_id if environment is development 
      ...(session.environment === "development" && { agent_id: "development" })
    });

    const thread: Thread = {
      id: ampSessionId, // Use Amp session ID as thread ID
      name: name || `Thread ${session.threads.length + 1}`,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    dispatch({ type: "CREATE_THREAD", payload: { sessionId, thread } });
    return thread.id;
  };

  const switchThread = useCallback((sessionId: string, threadId: string) => {
    dispatch({ type: "SWITCH_THREAD", payload: { sessionId, threadId } });
  }, []);

  const renameThread = useCallback((sessionId: string, threadId: string, name: string) => {
    dispatch({ type: "RENAME_THREAD", payload: { sessionId, threadId, name } });
  }, []);

  const deleteThread = async (sessionId: string, threadId: string): Promise<void> => {
    // Note: We don't clean up the Amp session here as it may be managed elsewhere
    dispatch({ type: "DELETE_THREAD", payload: { sessionId, threadId } });
  };

  const getWorktreeError = (sessionId: string): WorktreeError | null => {
    return state.worktreeErrors.get(sessionId) || null;
  };

  const isSessionPending = (sessionId: string): boolean => {
    return state.pendingSessions.has(sessionId);
  };

  const checkRepositoryClean = async (repoPath: string): Promise<boolean> => {
    try {
      const isClean = await invoke<boolean>('check_repository_clean', {
        repoPath,
      });
      return isClean;
    } catch (error) {
      console.error('Failed to check repository status:', error);
      throw error;
    }
  };

  const clearWorktreeError = (sessionId: string) => {
    if (state.worktreeErrors.has(sessionId)) {
      const newWorktreeErrors = new Map(state.worktreeErrors);
      newWorktreeErrors.delete(sessionId);
      dispatch({
        type: "RESTORE_STATE",
        payload: {
          ...state,
          worktreeErrors: newWorktreeErrors,
        },
      });
    }
  };

  const contextValue: SessionManagerContextValue = {
    state,
    currentSession,
    currentThread,
    currentEnvironment: state.currentEnvironment,
    createSession,
    getSessionsForRepo,
    switchSession,
    switchEnvironment,
    renameSession,
    deleteSession,
    updateActivity,
    addThread,
    setActiveThread,
    createThread,
    switchThread,
    renameThread,
    deleteThread,
    getWorktreeError,
    isSessionPending,
    checkRepositoryClean,
    clearWorktreeError,
  };

  return (
    <SessionManagerContext.Provider value={contextValue}>
      {children}
    </SessionManagerContext.Provider>
  );
}

export function useSessionManager(): SessionManagerContextValue {
  const context = useContext(SessionManagerContext);
  if (!context) {
    throw new Error(
      "useSessionManager must be used within a SessionManagerProvider"
    );
  }
  return context;
}
