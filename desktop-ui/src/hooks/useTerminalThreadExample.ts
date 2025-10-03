/**
 * Terminal Thread Example Hook - Phase A Demonstration
 * 
 * Shows how to use the new terminal threading system.
 * This is a demonstration hook that components can use
 * to interact with the new multi-threaded terminal system.
 */

import { useEffect, useCallback } from 'react'
import { useTerminalIntegration, useTerminalMigration } from './useTerminalIntegration'
import { useTerminalLifecycleManager } from '../contexts/TerminalLifecycleManager'
import type { SessionEnvironment } from '../types/terminal-threads'

interface UseTerminalThreadExampleReturn {
  // Current state
  hasActiveThread: boolean
  threadsCount: number
  
  // Example operations
  createExampleThread(name: string, environment: SessionEnvironment): Promise<void>
  getTerminalForCurrentThread(profile: string): Promise<void>
  
  // Debugging
  logCurrentState(): void
}

export function useTerminalThreadExample(): UseTerminalThreadExampleReturn {
  const terminalIntegration = useTerminalIntegration()
  const terminalLifecycle = useTerminalLifecycleManager()
  const migration = useTerminalMigration()
  
  // Run migration on first use
  useEffect(() => {
    migration.migrateExistingSessions().catch(error => {
      console.error('[useTerminalThreadExample] Migration failed:', error)
    })
  }, [migration])
  
  // Initialize threads if none exist
  useEffect(() => {
    if (terminalIntegration.currentWorkSession && terminalIntegration.currentTerminalThreads.length === 0) {
      terminalIntegration.initializeTerminalThreads().catch(error => {
        console.error('[useTerminalThreadExample] Failed to initialize threads:', error)
      })
    }
  }, [terminalIntegration])
  
  // Example: Create a new terminal thread
  const createExampleThread = useCallback(async (name: string, environment: SessionEnvironment): Promise<void> => {
    try {
      console.log('[useTerminalThreadExample] Creating thread:', name, 'for environment:', environment)
      
      const threadId = await terminalIntegration.createTerminalThread({
        name,
        environment,
        profiles: environment === 'production' ? ['prod'] : ['dev'],
        makeDefault: false
      })
      
      console.log('[useTerminalThreadExample] Created thread:', threadId)
      
      // Optionally switch to the new thread
      terminalIntegration.switchTerminalThread(threadId)
    } catch (error) {
      console.error('[useTerminalThreadExample] Failed to create thread:', error)
      throw error
    }
  }, [terminalIntegration])
  
  // Example: Get terminal handle for current thread
  const getTerminalForCurrentThread = useCallback(async (profile: string): Promise<void> => {
    try {
      console.log('[useTerminalThreadExample] Getting terminal for profile:', profile)
      
      const handle = await terminalIntegration.getTerminalHandle(profile)
      if (handle) {
        console.log('[useTerminalThreadExample] Got terminal handle:', {
          threadId: handle.threadId,
          profile: handle.profile,
          sessionId: handle.sessionId,
          isReady: handle.session?.status === 'running'
        })
      } else {
        console.log('[useTerminalThreadExample] No terminal handle available')
      }
    } catch (error) {
      console.error('[useTerminalThreadExample] Failed to get terminal:', error)
    }
  }, [terminalIntegration])
  
  // Debug helper
  const logCurrentState = useCallback((): void => {
    console.log('[useTerminalThreadExample] Current state:')
    console.log('- Work session:', terminalIntegration.currentWorkSession?.name)
    console.log('- Terminal threads:', terminalIntegration.currentTerminalThreads.length)
    console.log('- Active thread:', terminalIntegration.activeTerminalThread?.name)
    console.log('- Lifecycle runtimes:', terminalLifecycle.listThreads().length)
    
    // Log detailed thread information
    terminalIntegration.currentTerminalThreads.forEach((thread, index) => {
      console.log(`- Thread ${index + 1}:`, {
        id: thread.threadId,
        name: thread.name,
        environment: thread.environment,
        profiles: thread.profiles,
        isDefault: thread.isDefault,
        isActive: thread.threadId === terminalIntegration.activeTerminalThread?.threadId
      })
    })
  }, [terminalIntegration, terminalLifecycle])
  
  return {
    hasActiveThread: !!terminalIntegration.activeTerminalThread,
    threadsCount: terminalIntegration.currentTerminalThreads.length,
    createExampleThread,
    getTerminalForCurrentThread,
    logCurrentState
  }
}

// Example usage in a component:
//
// function MyComponent() {
//   const terminalExample = useTerminalThreadExample()
//   
//   const handleCreateThread = async () => {
//     await terminalExample.createExampleThread(
//       'Development Work', 
//       'development'
//     )
//   }
//   
//   const handleGetTerminal = async () => {
//     await terminalExample.getTerminalForCurrentThread('dev')
//   }
//   
//   return (
//     <div>
//       <p>Active thread: {terminalExample.hasActiveThread ? 'Yes' : 'No'}</p>
//       <p>Threads count: {terminalExample.threadsCount}</p>
//       <button onClick={handleCreateThread}>Create Thread</button>
//       <button onClick={handleGetTerminal}>Get Dev Terminal</button>
//       <button onClick={terminalExample.logCurrentState}>Log State</button>
//     </div>
//   )
// }
