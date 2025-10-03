/**
 * M1.7 TUI Terminal Provider - PTY Integration
 * 
 * Manages TUI terminal sessions with proper PTY integration according to M1.7 spec.
 * Provides session lifecycle management independent of component mounting/unmounting.
 */

import { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode, useMemo } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

export interface TuiSession {
  id: string
  profile: string
  status: 'starting' | 'running' | 'error' | 'exited'
  lastActivity: Date
}

interface TerminalProviderContextValue {
  // Session state
  sessions: Map<string, TuiSession>
  activeSessionId: string | null
  
  // Session operations (M1.7 spec)
  startSession(profile: string, variantId?: string, cwd?: string, cols?: number, rows?: number, env?: Record<string, string>): Promise<string>
  writeToSession(sessionId: string, data: string): Promise<void>
  resizeSession(sessionId: string, cols: number, rows: number): Promise<void>
  killSession(sessionId: string): Promise<void>
  
  // Session queries
  getSession(sessionId: string): TuiSession | null
  setActiveSession(sessionId: string): void
  
  // Event handlers for terminal data
  onTerminalData: (callback: (sessionId: string, data: string) => void) => () => void
}

const TerminalProviderContext = createContext<TerminalProviderContextValue | null>(null)

interface TerminalProviderProps {
  children: ReactNode
}

export function TerminalProvider({ children }: TerminalProviderProps) {
  const [sessions, setSessions] = useState<Map<string, TuiSession>>(new Map())
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  
  // Terminal data event handlers
  const terminalDataHandlers = useRef<Array<(sessionId: string, data: string) => void>>([])
  
  // Keep a ref to current sessions for cleanup
  const sessionsRef = useRef(sessions)
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])
  
  // M1.7 TUI session management commands
  const startSession = useCallback(async (
    profile: string, 
    variantId?: string, 
    cwd?: string, 
    cols = 80, 
    rows = 24, 
    env?: Record<string, string>
  ): Promise<string> => {
    // Generate unique variantId if not provided
    const uniqueVariantId = variantId || crypto.randomUUID()
    // Reduced logging for session start
    if (profile !== 'prod_default') { // Only log non-default profiles to reduce spam
      console.log('[TerminalProvider] Starting TUI session:', { profile, variantId, cwd, cols, rows })
    }
    
    try {
      // Call the M1.7 spec cmd_start_tui command
      const sessionId = await invoke<string>('cmd_start_tui', {
        profile,
        variantId: uniqueVariantId,
        cwd,
        cols,
        rows,
        env
      })
      
      console.log('[TerminalProvider] Session started with ID:', sessionId)
      
      // Create session object
      const session: TuiSession = {
        id: sessionId,
        profile,
        status: 'starting',
        lastActivity: new Date()
      }
      
      // Add to sessions map with defensive check for duplicates
      setSessions(prev => {
        const newSessions = new Map(prev)
        // Defensive check to prevent duplicate React nodes
        if (newSessions.has(sessionId)) {
          console.warn('[TerminalProvider] Session already exists, not adding duplicate:', sessionId)
          return prev
        }
        newSessions.set(sessionId, session)
        return newSessions
      })
      
      // Set as active if no current active session
      if (!activeSessionId) {
        setActiveSessionId(sessionId)
      }
      
      // Update status to running after a brief delay
      setTimeout(() => {
        setSessions(prev => {
          const newSessions = new Map(prev)
          const existingSession = newSessions.get(sessionId)
          if (existingSession) {
            newSessions.set(sessionId, { ...existingSession, status: 'running' })
          }
          return newSessions
        })
      }, 1000)
      
      return sessionId
    } catch (error) {
      console.error('[TerminalProvider] Failed to start session:', error)
      throw error
    }
  }, [activeSessionId])
  
  const writeToSession = useCallback(async (sessionId: string, data: string): Promise<void> => {
    console.log('[TerminalProvider] Writing to session:', sessionId, 'data length:', data.length)
    
    try {
      await invoke('cmd_write_stdin', {
        sessionId,
        utf8Chunk: data
      })
      
      // Update last activity
      setSessions(prev => {
        const newSessions = new Map(prev)
        const session = newSessions.get(sessionId)
        if (session) {
          newSessions.set(sessionId, { ...session, lastActivity: new Date() })
        }
        return newSessions
      })
    } catch (error) {
      console.error('[TerminalProvider] Failed to write to session:', error)
      throw error
    }
  }, [])
  
  const resizeSession = useCallback(async (sessionId: string, cols: number, rows: number): Promise<void> => {
    console.log('[TerminalProvider] Resizing session:', sessionId, 'to', cols, 'x', rows)
    
    try {
      await invoke('cmd_resize', {
        sessionId,
        cols,
        rows
      })
    } catch (error) {
      console.error('[TerminalProvider] Failed to resize session:', error)
      throw error
    }
  }, [])
  
  const killSession = useCallback(async (sessionId: string): Promise<void> => {
    console.log('[TerminalProvider] Killing session:', sessionId)
    
    // Check if session exists in our state first
    const session = sessions.get(sessionId)
    if (!session) {
      console.log('[TerminalProvider] Session not found in state, skipping:', sessionId)
      return
    }
    
    try {
      await invoke('cmd_kill', {
        sessionId
      })
      
      // Update session status
      setSessions(prev => {
        const newSessions = new Map(prev)
        const session = newSessions.get(sessionId)
        if (session) {
          newSessions.set(sessionId, { ...session, status: 'exited' })
        }
        return newSessions
      })
      
      // Clear active session if this was active
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
      
      // Remove from sessions after a brief delay to allow UI updates
      setTimeout(() => {
        setSessions(prev => {
          const newSessions = new Map(prev)
          newSessions.delete(sessionId)
          return newSessions
        })
      }, 1000)
      
    } catch (error) {
      console.log('[TerminalProvider] Failed to kill session (may already be dead):', sessionId, error)
      // Don't throw error - just clean up the session from state
      setSessions(prev => {
        const newSessions = new Map(prev)
        newSessions.delete(sessionId)
        return newSessions
      })
      
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
    }
  }, [activeSessionId, sessions])
  
  const getSession = useCallback((sessionId: string): TuiSession | null => {
    return sessions.get(sessionId) || null
  }, [sessions])
  
  const setActiveSession = useCallback((sessionId: string): void => {
    if (sessions.has(sessionId)) {
      setActiveSessionId(sessionId)
    }
  }, [sessions])
  
  const onTerminalData = useCallback((callback: (sessionId: string, data: string) => void) => {
    terminalDataHandlers.current.push(callback)
    
    return () => {
      const index = terminalDataHandlers.current.indexOf(callback)
      if (index > -1) {
        terminalDataHandlers.current.splice(index, 1)
      }
    }
  }, [])
  
  // Listen for terminal data events from Tauri backend
  useEffect(() => {
    console.log('[TerminalProvider] Setting up terminal data listener')
    
    const unlistenPromise = listen('terminal://data', (event: any) => {
      const { id, chunk } = event.payload
      
      // Reduced logging - only log occasionally to avoid spam
      if (Math.random() < 0.01) { // Log ~1% of messages
        console.log('[TerminalProvider] Received terminal data for session:', id, 'length:', chunk.length)
      }
      
      // Update last activity
      setSessions(prev => {
        const newSessions = new Map(prev)
        const session = newSessions.get(id)
        if (session) {
          newSessions.set(id, { ...session, lastActivity: new Date() })
        }
        return newSessions
      })
      
      // Notify all handlers
      terminalDataHandlers.current.forEach(handler => {
        try {
          handler(id, chunk)
        } catch (error) {
          console.error('[TerminalProvider] Error in terminal data handler:', error)
        }
      })
    })
    
    return () => {
      unlistenPromise.then(unlisten => unlisten())
    }
  }, [])
  
  // Cleanup sessions on page unload (not on component unmount to prevent infinite cycles)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[TerminalProvider] Cleaning up sessions on page unload')
      // Use sync cleanup since beforeunload has limited time
      for (const sessionId of sessionsRef.current.keys()) {
        // Note: invoke calls in beforeunload may not complete, but we try anyway
        invoke('cmd_kill', { sessionId }).catch(() => {
          // Ignore errors during cleanup
        })
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])
  
  const contextValue: TerminalProviderContextValue = {
    sessions,
    activeSessionId,
    startSession,
    writeToSession,
    resizeSession,
    killSession,
    getSession,
    setActiveSession,
    onTerminalData
  }
  
  return (
    <TerminalProviderContext.Provider value={contextValue}>
      {children}
    </TerminalProviderContext.Provider>
  )
}

// Hook to use the terminal provider
export function useTerminalProvider(): TerminalProviderContextValue {
  const context = useContext(TerminalProviderContext)
  if (!context) {
    throw new Error('useTerminalProvider must be used within a TerminalProvider')
  }
  return context
}

// Convenience hook for managing a single session
export function useTuiSession(profile: string, variantId?: string) {
  const terminalProvider = useTerminalProvider()
  const [actualSessionId, setActualSessionId] = useState<string | null>(null)
  
  // Find session by profile/variant instead of using synthetic ID
  const session = useMemo(() => {
    for (const [sessionId, sessionData] of terminalProvider.sessions) {
      if (sessionData.profile === profile && 
          (!variantId || sessionId.includes(variantId))) {
        return sessionData
      }
    }
    return null
  }, [terminalProvider.sessions, profile, variantId])
  
  // Update actualSessionId when session is found
  useEffect(() => {
    if (session) {
      setActualSessionId(session.id)
    }
  }, [session])
  
  const start = useCallback(async (options?: {
    cwd?: string
    cols?: number
    rows?: number
    env?: Record<string, string>
  }): Promise<void> => {
    if (!session || session.status === 'exited') {
      const newSessionId = await terminalProvider.startSession(
        profile,
        variantId,
        options?.cwd,
        options?.cols,
        options?.rows,
        options?.env
      )
      setActualSessionId(newSessionId)
    }
  }, [terminalProvider, profile, variantId, session])
  
  const write = useCallback(async (data: string): Promise<void> => {
    if (session && session.status === 'running' && actualSessionId) {
      await terminalProvider.writeToSession(actualSessionId, data)
    }
  }, [terminalProvider, actualSessionId, session])
  
  const resize = useCallback(async (cols: number, rows: number): Promise<void> => {
    if (session && session.status === 'running' && actualSessionId) {
      await terminalProvider.resizeSession(actualSessionId, cols, rows)
    }
  }, [terminalProvider, actualSessionId, session])
  
  const kill = useCallback(async (): Promise<void> => {
    if (session && actualSessionId) {
      await terminalProvider.killSession(actualSessionId)
      setActualSessionId(null)
    }
  }, [terminalProvider, actualSessionId, session])
  
  return {
    session,
    start,
    write,
    resize,
    kill,
    isActive: terminalProvider.activeSessionId === actualSessionId
  }
}
