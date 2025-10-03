/**
 * Terminal Manager Context - Global session state management
 * 
 * Provides React context for managing multiple Amp TUI sessions with
 * integration into the profile-based authentication system.
 */

import { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useProfileManager, type AmpProfile } from '../../hooks/useProfileManager'
import { AmpSession, SessionMode, SessionStatus, createAmpSession, getSessionModeFromProfile } from './session'

export type { SessionMode }

interface TerminalManagerContextValue {
  // Session state
  sessions: Map<string, AmpSession>
  activeSessions: Map<SessionMode, AmpSession | null>
  
  // Session operations
  createSession(profile: AmpProfile): Promise<AmpSession>
  getSession(mode: SessionMode): AmpSession | null
  getSessionByProfile(profileId: string): AmpSession | null
  killSession(sessionId: string): Promise<void>
  killSessionByMode(mode: SessionMode): Promise<void>
  restartSession(sessionId: string): Promise<void>
  
  // Profile integration
  createSessionForActiveProfile(mode?: SessionMode): Promise<AmpSession | null>
  switchSessionMode(fromMode: SessionMode, toMode: SessionMode): Promise<void>
  
  // Status queries
  getSessionStatus(sessionId: string): SessionStatus | null
  getSessionsForMode(mode: SessionMode): AmpSession[]
  hasRunningSessions(): boolean
  
  // Cleanup
  killAllSessions(): Promise<void>
}

const TerminalManagerContext = createContext<TerminalManagerContextValue | null>(null)

interface TerminalManagerProviderProps {
  children: ReactNode
}

export function TerminalManagerProvider({ children }: TerminalManagerProviderProps) {
  const [sessions, setSessions] = useState<Map<string, AmpSession>>(new Map())
  const [activeSessions, setActiveSessions] = useState<Map<SessionMode, AmpSession | null>>(new Map([
    ['production', null],
    ['development', null]
  ]))
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  // Dedup map to prevent concurrent duplicate session creation per profile
  const pendingCreateRef = useRef<Map<string, Promise<AmpSession>>>(new Map())
  // Component mount tracking for disposal guards
  const isMountedRef = useRef(true)
  
  const profileManager = useProfileManager()

  // Create a new session for the given profile
  const createSession = useCallback(async (profile: AmpProfile): Promise<AmpSession> => {
    console.log('Creating session for profile:', profile.name)

    // If a creation is already in-flight for this profile, reuse it
    const existingPromise = pendingCreateRef.current.get(profile.id)
    if (existingPromise) {
      console.log('Reusing existing session creation promise for profile:', profile.name)
      return existingPromise
    }

    // Check if we already have a running session for this profile
    const existingSession = getSessionByProfile(profile.id)
    if (existingSession && existingSession.isRunning()) {
      console.log('Reusing existing running session for profile:', profile.name)
      return existingSession
    }

    console.log('Starting new session creation for profile:', profile.name)
    setIsCreatingSession(true)

    const creationPromise = (async () => {
      try {
        const session = await createAmpSession(profile)
        const mode = getSessionModeFromProfile(profile)

        // Add to sessions map
        setSessions(prev => {
          const newSessions = new Map(prev)
          newSessions.set(session.id, session)
          return newSessions
        })

        // Update active session for this mode
        setActiveSessions(prev => {
          const newActive = new Map(prev)
          newActive.set(mode, session)
          return newActive
        })

        // Spawn the process
        try {
          await session.spawn()
          // Check if component is still mounted after async operation
          if (!isMountedRef.current) {
            console.log('Component unmounted during session spawn, disposing session')
            session.dispose()
            return session
          }
        } catch (error) {
          console.error('Failed to spawn session process:', error)
          
          // Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            session.dispose()
            throw error
          }

          // Mark session as failed and remove it from active sessions to prevent infinite retry
          session.status.next('error')

          // Remove the failed session from active sessions but keep it in sessions map
          // so users can manually retry if needed
          setActiveSessions(prev => {
            const newActive = new Map(prev)
            newActive.set(mode, null)
            return newActive
          })

          throw error // Re-throw to let caller handle the error
        }

        return session
      } finally {
        setIsCreatingSession(false)
        pendingCreateRef.current.delete(profile.id)
      }
    })()

    // Store and return the promise
    pendingCreateRef.current.set(profile.id, creationPromise)
    return creationPromise
  }, [])
  
  // Get session by mode (returns the active session for that mode)
  const getSession = useCallback((mode: SessionMode): AmpSession | null => {
    return activeSessions.get(mode) || null
  }, [activeSessions])
  
  // Get session by profile ID
  const getSessionByProfile = useCallback((profileId: string): AmpSession | null => {
    for (const session of sessions.values()) {
      if (session.profile.id === profileId) {
        return session
      }
    }
    return null
  }, [sessions])
  
  // Kill a specific session
  const killSession = useCallback(async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId)
    if (!session) {
      console.warn('Session not found:', sessionId)
      return
    }
    
    console.log('Killing session:', sessionId)
    
    try {
      await session.kill()
    } catch (error) {
      console.error('Failed to kill session:', error)
    }
    
    // Remove from sessions map
    setSessions(prev => {
      const newSessions = new Map(prev)
      newSessions.delete(sessionId)
      return newSessions
    })
    
    // Update active sessions if this was active
    setActiveSessions(prev => {
      const newActive = new Map(prev)
      for (const [mode, activeSession] of newActive.entries()) {
        if (activeSession?.id === sessionId) {
          newActive.set(mode, null)
        }
      }
      return newActive
    })
    
    // Clean up session resources
    try {
      session.dispose()
      console.log('Session disposed successfully:', sessionId)
    } catch (error) {
      console.error('Error disposing session:', sessionId, error)
    }
  }, [sessions])
  
  // Kill session by mode
  const killSessionByMode = useCallback(async (mode: SessionMode): Promise<void> => {
    const session = getSession(mode)
    if (session) {
      await killSession(session.id)
    }
  }, [getSession, killSession])
  
  // Restart a specific session
  const restartSession = useCallback(async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId)
    if (!session) {
      console.warn('Session not found for restart:', sessionId)
      return
    }
    
    console.log('Restarting session:', sessionId)
    
    try {
      await session.restart()
    } catch (error) {
      console.error('Failed to restart session:', error)
    }
  }, [sessions])
  
  // Create session for currently active profile
  const createSessionForActiveProfile = useCallback(async (_mode?: SessionMode): Promise<AmpSession | null> => {
    if (!profileManager.activeProfile) {
      console.warn('No active profile for session creation')
      return null
    }

    const profile = profileManager.activeProfile

    // If a creation is already pending for this profile, await it
    const pending = pendingCreateRef.current.get(profile.id)
    if (pending) {
      console.log('Awaiting existing session creation for profile:', profile.name)
      return await pending
    }
    
    // Check if we already have a session for this profile
    const existingSession = getSessionByProfile(profile.id)
    if (existingSession && existingSession.isRunning()) {
      console.log('Using existing running session for profile:', profile.name)
      return existingSession
    }
    
    console.log('Creating new session for active profile:', profile.name)
    return await createSession(profile)
  }, [profileManager.activeProfile, createSession, getSessionByProfile])
  
  // Switch session between modes (if profiles support it)
  const switchSessionMode = useCallback(async (fromMode: SessionMode, _toMode: SessionMode): Promise<void> => {
    const fromSession = getSession(fromMode)
    if (!fromSession) {
      console.warn('No session found for mode:', fromMode)
      return
    }
    
    // For now, we'll just kill the old session and create a new one
    // In the future, we might support session migration
    await killSession(fromSession.id)
    
    // Create new session for the target mode using active profile
    await createSessionForActiveProfile(_toMode)
  }, [getSession, killSession, createSessionForActiveProfile])
  
  // Get session status
  const getSessionStatus = useCallback((sessionId: string): SessionStatus | null => {
    const session = sessions.get(sessionId)
    return session ? session.status.value : null
  }, [sessions])
  
  // Get all sessions for a specific mode
  const getSessionsForMode = useCallback((mode: SessionMode): AmpSession[] => {
    return Array.from(sessions.values()).filter(session => 
      getSessionModeFromProfile(session.profile) === mode
    )
  }, [sessions])
  
  // Check if any sessions are running
  const hasRunningSessions = useCallback((): boolean => {
    return Array.from(sessions.values()).some(session => session.isRunning())
  }, [sessions])
  
  // Kill all sessions (cleanup)
  const killAllSessions = useCallback(async (): Promise<void> => {
    console.log('Killing all sessions')
    
    const killPromises = Array.from(sessions.keys()).map(sessionId => 
      killSession(sessionId).catch(error => 
        console.error('Failed to kill session', sessionId, error)
      )
    )
    
    await Promise.all(killPromises)
  }, [sessions, killSession])
  
  // Listen for Tauri events related to process I/O
  useEffect(() => {
    let isMounted = true
    let unlistenFn: (() => void) | null = null
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen('process_output', (event: any) => {
          if (!isMounted) return
          const { sessionId, data } = event.payload
          const session = sessions.get(sessionId)
          
          if (session) {
            // Use buffered writes to prevent UI stalls from burst output
            session.writeBuffered(data)
          }
        })
        console.log('[TerminalManager] Process output listener established')
      } catch (error) {
        console.error('[TerminalManager] Failed to setup process_output listener:', error)
      }
    }
    
    setupListener()
    
    return () => {
      isMounted = false
      if (unlistenFn) {
        try {
          unlistenFn()
          console.log('[TerminalManager] Process output listener cleaned up')
        } catch (error) {
          console.error('[TerminalManager] Error cleaning up process_output listener:', error)
        }
        unlistenFn = null
      }
    }
  }, [sessions])
  
  // Listen for process status changes
  useEffect(() => {
    let isMounted = true
    let unlistenFn: (() => void) | null = null
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen('process_status', (event: any) => {
          if (!isMounted) return
          const { sessionId, status } = event.payload
          const session = sessions.get(sessionId)
          
          if (session) {
            console.log(`[TerminalManager] Process status event: ${sessionId} -> ${status}`)
            
            // Only update if the new status represents actual progress
            const currentStatus = session.status.value
            
            // Avoid downgrading from 'running' to 'spawning' (race condition)
            if (currentStatus === 'running' && status === 'spawning') {
              console.log(`[TerminalManager] Ignoring downgrade from ${currentStatus} to ${status}`)
              return
            }
            
            session.status.next(status)
          }
        })
        console.log('[TerminalManager] Process status listener established')
      } catch (error) {
        console.error('[TerminalManager] Failed to setup process_status listener:', error)
      }
    }
    
    setupListener()
    
    return () => {
      isMounted = false
      if (unlistenFn) {
        try {
          unlistenFn()
          console.log('[TerminalManager] Process status listener cleaned up')
        } catch (error) {
          console.error('[TerminalManager] Error cleaning up process_status listener:', error)
        }
        unlistenFn = null
      }
    }
  }, [sessions])
  
  // Auto-create session when active profile changes - with retry protection and duplicate guard
  const autoCreateStartedRef = useRef(false)
  const retryTimeoutsRef = useRef<Set<number>>(new Set())
  
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 3
    let isMounted = true

    const attemptSessionCreation = async () => {
      if (!isMounted) return
      if (autoCreateStartedRef.current) return
      autoCreateStartedRef.current = true

      if (!profileManager.activeProfile) return
      if (isCreatingSession) return
      if (sessions.size > 0) return

      // If a creation is pending for this profile, don't start another
      const pending = pendingCreateRef.current.get(profileManager.activeProfile.id)
      if (pending) return

      console.log(`[TerminalManager] Auto-creating session for profile ${profileManager.activeProfile.id} (attempt ${retryCount + 1}/${maxRetries})`)
      retryCount++

      try {
        await createSessionForActiveProfile()
        console.log(`[TerminalManager] Successfully created session for profile ${profileManager.activeProfile.id}`)
      } catch (error) {
        console.error('Failed to auto-create session:', error)

        if (retryCount < maxRetries && isMounted) {
          const delay = Math.pow(2, retryCount) * 1000
          console.log(`Retrying session creation in ${delay}ms`)
          const timeoutId = window.setTimeout(() => {
            retryTimeoutsRef.current.delete(timeoutId)
            if (isMounted) {
              autoCreateStartedRef.current = false
              attemptSessionCreation()
            }
          }, delay)
          retryTimeoutsRef.current.add(timeoutId)
        } else {
          console.error('Max retries reached for session creation, giving up')
        }
      }
    }

    // Reset guard and kick off once per activeProfile change
    autoCreateStartedRef.current = false
    attemptSessionCreation()

    return () => {
      isMounted = false
      retryCount = 0
      autoCreateStartedRef.current = false
      // Clean up any pending retry timeouts
      retryTimeoutsRef.current.forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      retryTimeoutsRef.current.clear()
      console.log('[TerminalManager] Cleaned up retry timeouts')
    }
  }, [profileManager.activeProfile?.id, createSessionForActiveProfile, isCreatingSession, sessions.size])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('Cleaning up terminal manager')
      isMountedRef.current = false
      
      // Clear pending creation promises
      pendingCreateRef.current.clear()
      
      killAllSessions().catch(error => 
        console.error('Failed to cleanup sessions:', error)
      )
    }
  }, [killAllSessions])
  
  const contextValue: TerminalManagerContextValue = {
    sessions,
    activeSessions,
    createSession,
    getSession,
    getSessionByProfile,
    killSession,
    killSessionByMode,
    restartSession,
    createSessionForActiveProfile,
    switchSessionMode,
    getSessionStatus,
    getSessionsForMode,
    hasRunningSessions,
    killAllSessions
  }
  
  return (
    <TerminalManagerContext.Provider value={contextValue}>
      {children}
    </TerminalManagerContext.Provider>
  )
}

// Hook to use the terminal manager
export function useTerminalManager(): TerminalManagerContextValue {
  const context = useContext(TerminalManagerContext)
  if (!context) {
    throw new Error('useTerminalManager must be used within a TerminalManagerProvider')
  }
  return context
}

// Convenience hook for session management
export function useAmpSession(mode: SessionMode) {
  const terminalManager = useTerminalManager()
  const session = terminalManager.getSession(mode)
  
  const start = useCallback(async (): Promise<AmpSession | null> => {
    if (session && session.isRunning()) {
      return session
    }
    return await terminalManager.createSessionForActiveProfile(mode)
  }, [terminalManager, mode, session])
  
  const kill = useCallback(async (): Promise<void> => {
    if (session) {
      await terminalManager.killSession(session.id)
    }
  }, [terminalManager, session])
  
  const restart = useCallback(async (): Promise<void> => {
    if (session) {
      await terminalManager.restartSession(session.id)
    }
  }, [terminalManager, session])
  
  return {
    session,
    status: session?.status.value || null,
    isRunning: session?.isRunning() || false,
    needsAuth: session?.needsAuth() || false,
    start,
    kill,
    restart
  }
}
