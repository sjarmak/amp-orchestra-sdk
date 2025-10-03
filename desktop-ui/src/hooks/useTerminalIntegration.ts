/**
 * Terminal Integration Hook - Phase A Implementation
 * 
 * Provides high-level integration between SessionManager and TerminalLifecycleManager.
 * Offers a unified API for working with terminal threads in the context of work sessions.
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useSessionManager } from '../contexts/SessionManagerContext'
import { useTerminalLifecycleManager } from '../contexts/TerminalLifecycleManager'
import type { 
  WorkSession, 
  TerminalThreadMeta, 
  CreateTerminalThreadConfig,
  TerminalHandle
} from '../types/terminal-threads'
import {
  loadWorkSessions,
  saveWorkSessions,
  migrateSessionsToWorkSessions,
  createDefaultTerminalThreads
} from '../utils/terminal-persistence'

interface UseTerminalIntegrationReturn {
  // Current session and threads
  currentWorkSession: WorkSession | null
  currentTerminalThreads: TerminalThreadMeta[]
  activeTerminalThread: TerminalThreadMeta | null
  
  // Thread management
  createTerminalThread(config: CreateTerminalThreadConfig): Promise<string>
  closeTerminalThread(threadId: string): Promise<void>
  switchTerminalThread(threadId: string): void
  
  // Session handles
  getTerminalHandle(profile: string): Promise<TerminalHandle | null>
  isTerminalReady(profile: string): boolean
  
  // Migration and initialization
  initializeTerminalThreads(): Promise<void>
}

export function useTerminalIntegration(): UseTerminalIntegrationReturn {
  const sessionManager = useSessionManager()
  const terminalLifecycle = useTerminalLifecycleManager()
  
  // Convert current session to WorkSession format
  const currentWorkSession = useMemo((): WorkSession | null => {
    const current = sessionManager.currentSession
    if (!current) return null
    
    // Try to load from WorkSession storage first
    const workSessions = loadWorkSessions()
    const existing = workSessions.find(ws => ws.id === current.id)
    
    if (existing) {
      return existing
    }
    
    // Fallback: convert Session to WorkSession
    return {
      ...current,
      terminalThreads: [],
      activeTerminalThreadId: undefined
    }
  }, [sessionManager.currentSession])
  
  // Get terminal threads for current session
  const currentTerminalThreads = useMemo((): TerminalThreadMeta[] => {
    return currentWorkSession?.terminalThreads ?? []
  }, [currentWorkSession])
  
  // Get active terminal thread
  const activeTerminalThread = useMemo((): TerminalThreadMeta | null => {
    if (!currentWorkSession?.activeTerminalThreadId) return null
    
    return currentTerminalThreads.find(
      thread => thread.threadId === currentWorkSession.activeTerminalThreadId
    ) ?? null
  }, [currentWorkSession, currentTerminalThreads])
  
  /**
   * Create a new terminal thread for the current session
   */
  const createTerminalThread = useCallback(async (config: CreateTerminalThreadConfig): Promise<string> => {
    if (!currentWorkSession) {
      throw new Error('No active work session')
    }
    
    // Create thread in lifecycle manager
    const threadId = await terminalLifecycle.createThread(config)
    
    // Update work session with new thread
    const newThread: TerminalThreadMeta = {
      threadId,
      name: config.name,
      environment: config.environment,
      isDefault: config.makeDefault ?? false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      profiles: config.profiles ?? (config.environment === 'production' ? ['prod'] : ['dev'])
    }
    
    const updatedWorkSession: WorkSession = {
      ...currentWorkSession,
      terminalThreads: [...currentWorkSession.terminalThreads, newThread],
      activeTerminalThreadId: threadId // Set as active
    }
    
    // Persist the updated work session
    const workSessions = loadWorkSessions()
    const updatedSessions = workSessions.map(ws => 
      ws.id === currentWorkSession.id ? updatedWorkSession : ws
    )
    
    // Add if not found
    if (!workSessions.find(ws => ws.id === currentWorkSession.id)) {
      updatedSessions.push(updatedWorkSession)
    }
    
    saveWorkSessions(updatedSessions)
    
    return threadId
  }, [currentWorkSession, terminalLifecycle])
  
  /**
   * Close a terminal thread and remove it from the current session
   */
  const closeTerminalThread = useCallback(async (threadId: string): Promise<void> => {
    if (!currentWorkSession) return
    
    // Close thread in lifecycle manager
    await terminalLifecycle.closeThread(threadId)
    
    // Update work session to remove thread
    const updatedWorkSession: WorkSession = {
      ...currentWorkSession,
      terminalThreads: currentWorkSession.terminalThreads.filter(t => t.threadId !== threadId),
      activeTerminalThreadId: currentWorkSession.activeTerminalThreadId === threadId 
        ? undefined 
        : currentWorkSession.activeTerminalThreadId
    }
    
    // If no active thread, set the first available one
    if (!updatedWorkSession.activeTerminalThreadId && updatedWorkSession.terminalThreads.length > 0) {
      updatedWorkSession.activeTerminalThreadId = updatedWorkSession.terminalThreads[0].threadId
    }
    
    // Persist the updated work session
    const workSessions = loadWorkSessions()
    const updatedSessions = workSessions.map(ws => 
      ws.id === currentWorkSession.id ? updatedWorkSession : ws
    )
    saveWorkSessions(updatedSessions)
  }, [currentWorkSession, terminalLifecycle])
  
  /**
   * Switch to a different terminal thread
   */
  const switchTerminalThread = useCallback((threadId: string): void => {
    if (!currentWorkSession) return
    
    const threadExists = currentWorkSession.terminalThreads.find(t => t.threadId === threadId)
    if (!threadExists) {
      console.warn('[useTerminalIntegration] Thread not found in current session:', threadId)
      return
    }
    
    // Update lifecycle manager
    terminalLifecycle.setActiveThread(threadId)
    
    // Update work session
    const updatedWorkSession: WorkSession = {
      ...currentWorkSession,
      activeTerminalThreadId: threadId,
      lastActiveAt: Date.now()
    }
    
    // Persist the change
    const workSessions = loadWorkSessions()
    const updatedSessions = workSessions.map(ws => 
      ws.id === currentWorkSession.id ? updatedWorkSession : ws
    )
    saveWorkSessions(updatedSessions)
  }, [currentWorkSession, terminalLifecycle])
  
  /**
   * Get a terminal handle for the active thread and specified profile
   */
  const getTerminalHandle = useCallback(async (profile: string): Promise<TerminalHandle | null> => {
    if (!activeTerminalThread) {
      console.warn('[useTerminalIntegration] No active terminal thread')
      return null
    }
    
    try {
      const handle = await terminalLifecycle.getHandle(activeTerminalThread.threadId, profile)
      return handle
    } catch (error) {
      console.error('[useTerminalIntegration] Failed to get terminal handle:', error)
      return null
    }
  }, [activeTerminalThread, terminalLifecycle])
  
  /**
   * Check if terminal is ready for the active thread and specified profile
   */
  const isTerminalReady = useCallback((profile: string): boolean => {
    if (!activeTerminalThread) return false
    
    return terminalLifecycle.isSessionReady(activeTerminalThread.threadId, profile)
  }, [activeTerminalThread, terminalLifecycle])
  
  /**
   * Initialize terminal threads for the current session if none exist
   */
  const initializeTerminalThreads = useCallback(async (): Promise<void> => {
    if (!currentWorkSession) return
    
    // Check if session already has terminal threads
    if (currentWorkSession.terminalThreads.length > 0) return
    
    console.log('[useTerminalIntegration] Initializing terminal threads for session:', currentWorkSession.name)
    
    // Create default thread for the session environment
    const defaultConfig: CreateTerminalThreadConfig = {
      name: `${currentWorkSession.name} Terminal`,
      environment: currentWorkSession.environment,
      makeDefault: true
    }
    
    try {
      await createTerminalThread(defaultConfig)
      console.log('[useTerminalIntegration] Created default terminal thread for session')
    } catch (error) {
      console.error('[useTerminalIntegration] Failed to initialize terminal threads:', error)
    }
  }, [currentWorkSession, createTerminalThread])
  
  // Auto-initialize terminal threads when work session changes
  useEffect(() => {
    if (currentWorkSession && currentWorkSession.terminalThreads.length === 0) {
      // Small delay to avoid initialization conflicts
      const timer = setTimeout(() => {
        initializeTerminalThreads()
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [currentWorkSession, initializeTerminalThreads])
  
  return {
    currentWorkSession,
    currentTerminalThreads,
    activeTerminalThread,
    createTerminalThread,
    closeTerminalThread,
    switchTerminalThread,
    getTerminalHandle,
    isTerminalReady,
    initializeTerminalThreads
  }
}

/**
 * Migration helper hook for existing installations
 */
export function useTerminalMigration() {
  const sessionManager = useSessionManager()
  
  const migrateExistingSessions = useCallback(async (): Promise<void> => {
    console.log('[useTerminalMigration] Checking for session migration needs')
    
    const existingWorkSessions = loadWorkSessions()
    
    // If we already have work sessions, no migration needed
    if (existingWorkSessions.length > 0) {
      console.log('[useTerminalMigration] Work sessions already exist, no migration needed')
      return
    }
    
    // Migrate from SessionManager sessions
    if (sessionManager.state.sessions.length > 0) {
      console.log('[useTerminalMigration] Migrating', sessionManager.state.sessions.length, 'sessions to WorkSession format')
      
      const migratedSessions = migrateSessionsToWorkSessions(sessionManager.state.sessions)
      saveWorkSessions(migratedSessions)
      
      console.log('[useTerminalMigration] Migration completed successfully')
    } else {
      // Fresh installation - create default work sessions
      console.log('[useTerminalMigration] Fresh installation, creating default work sessions')
      
      const defaultSessions: WorkSession[] = [
        {
          id: 'default-prod',
          name: 'Main (Production)',
          environment: 'production',
          repositoryId: 'default',
          worktreePath: 'default',
          worktreeBranch: 'main',
          threads: [], // NEW - Session threads (different from terminalThreads)
          activeThreadId: undefined, // NEW
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          terminalThreads: createDefaultTerminalThreads('production'),
          activeTerminalThreadId: undefined
        },
        {
          id: 'default-dev',
          name: 'Main (Development)',
          environment: 'development',
          repositoryId: 'default',
          worktreePath: 'default',
          worktreeBranch: 'main',
          threads: [], // NEW - Session threads (different from terminalThreads)
          activeThreadId: undefined, // NEW
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          terminalThreads: createDefaultTerminalThreads('development'),
          activeTerminalThreadId: undefined
        }
      ]
      
      // Set active terminal thread IDs
      defaultSessions.forEach(session => {
        if (session.terminalThreads.length > 0) {
          session.activeTerminalThreadId = session.terminalThreads[0].threadId
        }
      })
      
      saveWorkSessions(defaultSessions)
      console.log('[useTerminalMigration] Created default work sessions')
    }
  }, [sessionManager.state.sessions])
  
  return { migrateExistingSessions }
}
