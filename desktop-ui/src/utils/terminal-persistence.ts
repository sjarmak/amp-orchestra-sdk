/**
 * Terminal Persistence Helpers - Phase A Implementation
 * 
 * Provides utilities for loading, saving, and migrating terminal thread metadata.
 * Integrates with the existing SessionManagerContext for unified state management.
 */

import type { 
  TerminalThreadMeta, 
  WorkSession,
  SessionEnvironment 
} from '../types/terminal-threads'
import type { Session } from '../contexts/SessionManagerContext'

const TERMINAL_THREADS_STORAGE_KEY = 'amp_terminal_threads_v1'
const WORK_SESSIONS_STORAGE_KEY = 'amp_work_sessions_v1'

/**
 * Load terminal thread metadata from localStorage
 */
export function loadTerminalThreads(): TerminalThreadMeta[] {
  try {
    const stored = localStorage.getItem(TERMINAL_THREADS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      
      // Validate the structure
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidThreadMeta)
      }
    }
  } catch (error) {
    console.warn('[TerminalPersistence] Failed to load terminal threads:', error)
  }
  return []
}

/**
 * Save terminal thread metadata to localStorage
 */
export function saveTerminalThreads(threads: TerminalThreadMeta[]): void {
  try {
    const validThreads = threads.filter(isValidThreadMeta)
    localStorage.setItem(TERMINAL_THREADS_STORAGE_KEY, JSON.stringify(validThreads))
  } catch (error) {
    console.warn('[TerminalPersistence] Failed to save terminal threads:', error)
  }
}

/**
 * Load work sessions with terminal thread associations
 */
export function loadWorkSessions(): WorkSession[] {
  try {
    const stored = localStorage.getItem(WORK_SESSIONS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidWorkSession)
      }
    }
  } catch (error) {
    console.warn('[TerminalPersistence] Failed to load work sessions:', error)
  }
  return []
}

/**
 * Save work sessions with terminal thread associations
 */
export function saveWorkSessions(sessions: WorkSession[]): void {
  try {
    const validSessions = sessions.filter(isValidWorkSession)
    localStorage.setItem(WORK_SESSIONS_STORAGE_KEY, JSON.stringify(validSessions))
  } catch (error) {
    console.warn('[TerminalPersistence] Failed to save work sessions:', error)
  }
}

/**
 * Migrate existing Session data to WorkSession format
 * This ensures backward compatibility with existing session data
 */
export function migrateSessionsToWorkSessions(existingSessions: Session[]): WorkSession[] {
  console.log('[TerminalPersistence] Migrating', existingSessions.length, 'existing sessions to WorkSession format')
  
  return existingSessions.map(session => {
    const workSession: WorkSession = {
      ...session,
      terminalThreads: [],
      activeTerminalThreadId: undefined
    }
    
    // Create default terminal threads for each session based on environment
    const defaultThread: TerminalThreadMeta = {
      threadId: `${session.id}-default-thread`,
      name: `${session.name} Terminal`,
      environment: session.environment,
      isDefault: true,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      profiles: getDefaultProfilesForEnvironment(session.environment)
    }
    
    workSession.terminalThreads = [defaultThread]
    workSession.activeTerminalThreadId = defaultThread.threadId
    
    return workSession
  })
}

/**
 * Create default terminal threads for an environment
 */
export function createDefaultTerminalThreads(environment: SessionEnvironment): TerminalThreadMeta[] {
  const threadId = `default-${environment}-${Date.now()}`
  
  const defaultThread: TerminalThreadMeta = {
    threadId,
    name: environment === 'production' ? 'Main (Production)' : 'Main (Development)',
    environment,
    isDefault: true,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    profiles: getDefaultProfilesForEnvironment(environment)
  }
  
  return [defaultThread]
}

/**
 * Merge existing terminal threads with new defaults if none exist
 */
export function ensureDefaultTerminalThreads(
  existing: TerminalThreadMeta[],
  environment: SessionEnvironment
): TerminalThreadMeta[] {
  const hasDefaultForEnvironment = existing.some(
    t => t.environment === environment && t.isDefault
  )
  
  if (!hasDefaultForEnvironment) {
    const defaults = createDefaultTerminalThreads(environment)
    return [...existing, ...defaults]
  }
  
  return existing
}

/**
 * Clean up orphaned terminal threads (threads with no associated work sessions)
 */
export function cleanupOrphanedThreads(
  threads: TerminalThreadMeta[],
  workSessions: WorkSession[]
): TerminalThreadMeta[] {
  const referencedThreadIds = new Set<string>()
  
  // Collect all referenced thread IDs
  workSessions.forEach(session => {
    session.terminalThreads.forEach(thread => {
      referencedThreadIds.add(thread.threadId)
    })
  })
  
  const cleanedThreads = threads.filter(thread => 
    referencedThreadIds.has(thread.threadId) || thread.isDefault
  )
  
  const removedCount = threads.length - cleanedThreads.length
  if (removedCount > 0) {
    console.log('[TerminalPersistence] Cleaned up', removedCount, 'orphaned terminal threads')
  }
  
  return cleanedThreads
}

/**
 * Export all terminal data for backup
 */
export function exportTerminalData() {
  return {
    terminalThreads: loadTerminalThreads(),
    workSessions: loadWorkSessions(),
    timestamp: Date.now(),
    version: '1.0'
  }
}

/**
 * Import terminal data from backup
 */
export function importTerminalData(data: {
  terminalThreads?: TerminalThreadMeta[]
  workSessions?: WorkSession[]
  timestamp?: number
  version?: string
}): boolean {
  try {
    if (data.terminalThreads) {
      saveTerminalThreads(data.terminalThreads)
    }
    
    if (data.workSessions) {
      saveWorkSessions(data.workSessions)
    }
    
    console.log('[TerminalPersistence] Successfully imported terminal data')
    return true
  } catch (error) {
    console.error('[TerminalPersistence] Failed to import terminal data:', error)
    return false
  }
}

/**
 * Clear all persisted terminal data (for testing/reset)
 */
export function clearTerminalData(): void {
  try {
    localStorage.removeItem(TERMINAL_THREADS_STORAGE_KEY)
    localStorage.removeItem(WORK_SESSIONS_STORAGE_KEY)
    console.log('[TerminalPersistence] Cleared all terminal data')
  } catch (error) {
    console.warn('[TerminalPersistence] Failed to clear terminal data:', error)
  }
}

// Private helper functions

function isValidThreadMeta(obj: any): obj is TerminalThreadMeta {
  return (
    obj &&
    typeof obj.threadId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.environment === 'string' &&
    typeof obj.isDefault === 'boolean' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.lastActiveAt === 'number' &&
    Array.isArray(obj.profiles)
  )
}

function isValidWorkSession(obj: any): obj is WorkSession {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.environment === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.lastActiveAt === 'number' &&
    Array.isArray(obj.terminalThreads)
  )
}

function getDefaultProfilesForEnvironment(environment: SessionEnvironment): string[] {
  return environment === 'production' ? ['prod'] : ['dev']
}
