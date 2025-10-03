/**
 * Terminal Lifecycle Manager Context - Phase A Implementation
 * 
 * Manages the lifecycle of terminal threads and their associated PTY sessions.
 * Provides a clean API for creating, managing, and accessing terminal threads
 * while preserving all proven patterns from SimpleTerminal.
 * 
 * Key Features:
 * - Map<threadId, TerminalRuntime> management
 * - Lazy PTY spawning to save resources
 * - Session ID format: ${threadId}-${profile}_default
 * - Memory management and cleanup patterns
 * - Integration with existing TerminalProvider
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
  useMemo
} from 'react'
import { nanoid } from 'nanoid'
import type {
  TerminalThreadMeta,
  TerminalRuntime,
  CreateTerminalThreadConfig,
  TerminalHandle,
  TerminalLifecycleEvent,
  SessionEnvironment
} from '../types/terminal-threads'
import { useTerminalProvider } from '../components/terminal/TerminalProvider'

interface TerminalLifecycleManagerState {
  /** Runtime map of active terminal threads */
  runtimes: Map<string, TerminalRuntime>
  /** Currently active thread ID */
  activeThreadId: string | null
  /** Lifecycle event log for debugging */
  eventLog: TerminalLifecycleEvent[]
}

interface TerminalLifecycleManagerContext {
  // State
  state: TerminalLifecycleManagerState
  
  // Thread Management
  createThread(config: CreateTerminalThreadConfig): Promise<string>
  closeThread(threadId: string): Promise<void>
  getThread(threadId: string): TerminalRuntime | null
  listThreads(): TerminalRuntime[]
  
  // Session Management
  getHandle(threadId: string, profile: string): Promise<TerminalHandle>
  isSessionReady(threadId: string, profile: string): boolean
  
  // Active State
  setActiveThread(threadId: string): void
  getActiveThread(): TerminalRuntime | null
  
  // Lifecycle
  addEventListener(callback: (event: TerminalLifecycleEvent) => void): () => void
}

const STORAGE_KEY = 'amp_terminal_threads'

const TerminalLifecycleContext = createContext<TerminalLifecycleManagerContext | null>(null)

interface TerminalLifecycleManagerProps {
  children: ReactNode
}

/**
 * Load persisted terminal thread metadata from localStorage
 */
function loadThreadMetadata(): TerminalThreadMeta[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('[TerminalLifecycleManager] Failed to load thread metadata:', error)
  }
  return []
}

/**
 * Save terminal thread metadata to localStorage
 */
function saveThreadMetadata(threads: TerminalThreadMeta[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads))
  } catch (error) {
    console.warn('[TerminalLifecycleManager] Failed to save thread metadata:', error)
  }
}

/**
 * Create default profiles based on environment
 */
function getDefaultProfiles(environment: SessionEnvironment): string[] {
  return environment === 'production' ? ['prod'] : ['dev']
}

/**
 * Generate session ID following existing pattern: ${threadId}-${profile}_default
 */
function generateSessionId(threadId: string, profile: string): string {
  return `${threadId}-${profile}_default`
}

export function TerminalLifecycleManager({ children }: TerminalLifecycleManagerProps) {
  const terminalProvider = useTerminalProvider()
  
  const [state, setState] = useState<TerminalLifecycleManagerState>({
    runtimes: new Map(),
    activeThreadId: null,
    eventLog: []
  })
  
  // Event listeners for lifecycle events
  const eventListeners = useRef<Array<(event: TerminalLifecycleEvent) => void>>([])
  
  // Thread metadata persistence
  const persistedThreads = useRef<TerminalThreadMeta[]>(loadThreadMetadata())
  
  /**
   * Emit a lifecycle event
   */
  const emitEvent = useCallback((event: TerminalLifecycleEvent) => {
    setState(prev => ({
      ...prev,
      eventLog: [...prev.eventLog.slice(-99), event] // Keep last 100 events
    }))
    
    eventListeners.current.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[TerminalLifecycleManager] Error in event listener:', error)
      }
    })
  }, [])
  
  /**
   * Create a new terminal thread
   */
  const createThread = useCallback(async (config: CreateTerminalThreadConfig): Promise<string> => {
    const threadId = nanoid()
    const now = Date.now()
    
    // Create thread metadata
    const threadMeta: TerminalThreadMeta = {
      threadId,
      name: config.name,
      environment: config.environment,
      isDefault: config.makeDefault ?? false,
      createdAt: now,
      lastActiveAt: now,
      profiles: config.profiles ?? getDefaultProfiles(config.environment)
    }
    
    // Create runtime (without spawning PTY sessions yet - lazy loading)
    const runtime: TerminalRuntime = {
      meta: threadMeta,
      sessions: new Map(),
      lastActivity: now,
      status: 'idle'
    }
    
    // Update state
    setState(prev => {
      const newRuntimes = new Map(prev.runtimes)
      newRuntimes.set(threadId, runtime)
      
      return {
        ...prev,
        runtimes: newRuntimes,
        activeThreadId: prev.activeThreadId ?? threadId // Set as active if no current active
      }
    })
    
    // Update persisted metadata
    persistedThreads.current = [...persistedThreads.current, threadMeta]
    saveThreadMetadata(persistedThreads.current)
    
    emitEvent({
      type: 'thread_created',
      threadId,
      name: config.name,
      environment: config.environment
    })
    
    console.log('[TerminalLifecycleManager] Created thread:', threadId, 'with profiles:', threadMeta.profiles)
    return threadId
  }, [emitEvent])
  
  /**
   * Close a terminal thread and cleanup all its sessions
   */
  const closeThread = useCallback(async (threadId: string): Promise<void> => {
    const runtime = state.runtimes.get(threadId)
    if (!runtime) {
      console.warn('[TerminalLifecycleManager] Thread not found:', threadId)
      return
    }
    
    console.log('[TerminalLifecycleManager] Closing thread:', threadId)
    
    // Kill all sessions in this thread
    const killPromises = Array.from(runtime.sessions.entries()).map(([profile, session]) => {
      emitEvent({
        type: 'session_terminated',
        threadId,
        profile,
        sessionId: session.id
      })
      return terminalProvider.killSession(session.id).catch(error => {
        console.warn('[TerminalLifecycleManager] Failed to kill session:', session.id, error)
      })
    })
    
    await Promise.all(killPromises)
    
    // Update state
    setState(prev => {
      const newRuntimes = new Map(prev.runtimes)
      newRuntimes.delete(threadId)
      
      return {
        ...prev,
        runtimes: newRuntimes,
        activeThreadId: prev.activeThreadId === threadId ? null : prev.activeThreadId
      }
    })
    
    // Update persisted metadata
    persistedThreads.current = persistedThreads.current.filter(t => t.threadId !== threadId)
    saveThreadMetadata(persistedThreads.current)
    
    emitEvent({ type: 'thread_closed', threadId })
  }, [state.runtimes, terminalProvider, emitEvent])
  
  /**
   * Get a terminal handle for specific thread/profile combination
   * Implements lazy PTY spawning - only creates session when requested
   */
  const getHandle = useCallback(async (threadId: string, profile: string): Promise<TerminalHandle> => {
    const runtime = state.runtimes.get(threadId)
    if (!runtime) {
      throw new Error(`Terminal thread not found: ${threadId}`)
    }
    
    const sessionId = generateSessionId(threadId, profile)
    let session = runtime.sessions.get(profile)
    
    // Lazy spawn PTY session if not already created
    if (!session || session.status === 'exited') {
      console.log('[TerminalLifecycleManager] Lazy spawning session for:', threadId, profile)
      
      // Update status to initializing
      setState(prev => {
        const newRuntimes = new Map(prev.runtimes)
        const updatedRuntime = newRuntimes.get(threadId)
        if (updatedRuntime) {
          newRuntimes.set(threadId, { ...updatedRuntime, status: 'initializing' })
        }
        return { ...prev, runtimes: newRuntimes }
      })
      
      try {
        // Use the proven TerminalProvider patterns for session creation
        const actualSessionId = await terminalProvider.startSession(
          profile,
          threadId, // Use threadId as variantId for backend compatibility
          undefined, // cwd
          80, // cols
          24, // rows
          { THREAD_ID: threadId } // Pass threadId in environment
        )
        
        // Get the created session from TerminalProvider
        const newSession = terminalProvider.getSession(actualSessionId)
        if (newSession) {
          session = newSession
          // Update runtime with the new session
          setState(prev => {
            const newRuntimes = new Map(prev.runtimes)
            const updatedRuntime = newRuntimes.get(threadId)
            if (updatedRuntime) {
              const newSessions = new Map(updatedRuntime.sessions)
              newSessions.set(profile, session!)
              newRuntimes.set(threadId, {
                ...updatedRuntime,
                sessions: newSessions,
                status: 'ready',
                lastActivity: Date.now()
              })
            }
            return { ...prev, runtimes: newRuntimes }
          })
          
          emitEvent({
            type: 'session_spawned',
            threadId,
            profile,
            sessionId: actualSessionId
          })
        }
      } catch (error) {
        console.error('[TerminalLifecycleManager] Failed to spawn session:', error)
        setState(prev => {
          const newRuntimes = new Map(prev.runtimes)
          const updatedRuntime = newRuntimes.get(threadId)
          if (updatedRuntime) {
            newRuntimes.set(threadId, { ...updatedRuntime, status: 'error' })
          }
          return { ...prev, runtimes: newRuntimes }
        })
        throw error
      }
    }
    
    emitEvent({ type: 'handle_requested', threadId, profile })
    
    return {
      threadId,
      profile,
      sessionId: session?.id ?? sessionId,
      session
    }
  }, [state.runtimes, terminalProvider, emitEvent])
  
  /**
   * Check if a session is ready for a thread/profile combination
   */
  const isSessionReady = useCallback((threadId: string, profile: string): boolean => {
    const runtime = state.runtimes.get(threadId)
    if (!runtime) return false
    
    const session = runtime.sessions.get(profile)
    return session?.status === 'running'
  }, [state.runtimes])
  
  /**
   * Get a thread runtime by ID
   */
  const getThread = useCallback((threadId: string): TerminalRuntime | null => {
    return state.runtimes.get(threadId) || null
  }, [state.runtimes])
  
  /**
   * List all active thread runtimes
   */
  const listThreads = useCallback((): TerminalRuntime[] => {
    return Array.from(state.runtimes.values())
  }, [state.runtimes])
  
  /**
   * Set the active thread
   */
  const setActiveThread = useCallback((threadId: string): void => {
    if (state.runtimes.has(threadId)) {
      setState(prev => ({
        ...prev,
        activeThreadId: threadId
      }))
    }
  }, [state.runtimes])
  
  /**
   * Get the active thread runtime
   */
  const getActiveThread = useCallback((): TerminalRuntime | null => {
    return state.activeThreadId ? state.runtimes.get(state.activeThreadId) || null : null
  }, [state.activeThreadId, state.runtimes])
  
  /**
   * Add event listener
   */
  const addEventListener = useCallback((callback: (event: TerminalLifecycleEvent) => void) => {
    eventListeners.current.push(callback)
    return () => {
      const index = eventListeners.current.indexOf(callback)
      if (index > -1) {
        eventListeners.current.splice(index, 1)
      }
    }
  }, [])
  
  // Initialize threads from persisted metadata on mount
  useEffect(() => {
    const initializePersistedThreads = async () => {
      for (const threadMeta of persistedThreads.current) {
        // Create runtime without spawning sessions (lazy loading)
        const runtime: TerminalRuntime = {
          meta: threadMeta,
          sessions: new Map(),
          lastActivity: threadMeta.lastActiveAt,
          status: 'idle'
        }
        
        setState(prev => {
          const newRuntimes = new Map(prev.runtimes)
          newRuntimes.set(threadMeta.threadId, runtime)
          return {
            ...prev,
            runtimes: newRuntimes,
            activeThreadId: prev.activeThreadId ?? threadMeta.threadId
          }
        })
      }
    }
    
    initializePersistedThreads()
  }, [])
  
  // Context value with memoization for performance
  const contextValue = useMemo((): TerminalLifecycleManagerContext => ({
    state,
    createThread,
    closeThread,
    getThread,
    listThreads,
    getHandle,
    isSessionReady,
    setActiveThread,
    getActiveThread,
    addEventListener
  }), [
    state,
    createThread,
    closeThread,
    getThread,
    listThreads,
    getHandle,
    isSessionReady,
    setActiveThread,
    getActiveThread,
    addEventListener
  ])
  
  return (
    <TerminalLifecycleContext.Provider value={contextValue}>
      {children}
    </TerminalLifecycleContext.Provider>
  )
}

/**
 * Hook to use the Terminal Lifecycle Manager
 */
export function useTerminalLifecycleManager(): TerminalLifecycleManagerContext {
  const context = useContext(TerminalLifecycleContext)
  if (!context) {
    throw new Error('useTerminalLifecycleManager must be used within a TerminalLifecycleManager')
  }
  return context
}

/**
 * Migration helper for existing sessions
 * This can be called during app initialization to migrate existing data
 */
export async function migrateExistingSessions(
  manager: TerminalLifecycleManagerContext
): Promise<void> {
  const existingThreads = loadThreadMetadata()
  
  // If no existing threads, create default threads for both environments
  if (existingThreads.length === 0) {
    console.log('[TerminalLifecycleManager] Creating default threads for fresh installation')
    
    // Create default production thread
    await manager.createThread({
      name: 'Main (Production)',
      environment: 'production',
      makeDefault: true
    })
    
    // Create default development thread
    await manager.createThread({
      name: 'Main (Development)',
      environment: 'development',
      makeDefault: true
    })
  }
}
