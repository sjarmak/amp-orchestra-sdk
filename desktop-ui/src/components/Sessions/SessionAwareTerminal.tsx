/**
 * Session Aware Terminal - Wrapper that connects TerminalTabSwitcher to sessions
 * 
 * This component bridges the session management system with the existing
 * terminal infrastructure, enabling session-specific state keying and
 * automatic terminal mode synchronization.
 */

import { useEffect } from 'react'
import { GitBranch, Loader2, AlertCircle } from 'lucide-react'
import SimpleTerminal from '../terminal/SimpleTerminal'
import { useSessionManager } from '../../contexts/SessionManagerContext'
import { Badge } from '../ui/badge'

interface SessionAwareTerminalProps {
  className?: string
}

export function SessionAwareTerminal({ className }: SessionAwareTerminalProps) {
  const { currentSession, updateActivity, isSessionPending, getWorktreeError } = useSessionManager()
  
  // Phase 0 simplification: No need for mode synchronization
  
  // Update session activity when terminal is interacted with
  useEffect(() => {
    const handleActivity = () => {
      updateActivity()
    }
    
    // Listen for various interaction events
    const events: (keyof DocumentEventMap)[] = ['click', 'keydown', 'focus']
    const options: AddEventListenerOptions = { passive: true } // Create stable options object
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, options)
    })
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, options) // Use same options object
      })
    }
  }, [])

  // Extract branch name from worktree branch (e.g. "orchestra/abc123" -> "abc123")
  const getBranchDisplayName = (worktreeBranch: string) => {
    if (worktreeBranch.startsWith('orchestra/')) {
      return worktreeBranch.replace('orchestra/', '')
    }
    return worktreeBranch
  }

  const getSessionStateIndicator = (session: any) => {
    if (!session) return null

    const isPending = isSessionPending(session.id)
    const worktreeError = getWorktreeError(session.id)
    const hasError = !!worktreeError

    if (isPending) {
      return (
        <Badge variant="pending" className="ml-2">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Creating...
        </Badge>
      )
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="ml-2" title={worktreeError.message}>
          <AlertCircle className="w-2.5 h-2.5" />
          Error
        </Badge>
      )
    }

    // Show worktree branch badge for normal sessions
    if (session.worktreeBranch && session.worktreeBranch !== 'main') {
      return (
        <Badge variant="outline" className="ml-2" title={`Worktree: ${session.worktreePath}`}>
          <GitBranch className="w-2.5 h-2.5" />
          {getBranchDisplayName(session.worktreeBranch)}
        </Badge>
      )
    }

    return null
  }
  
  // Render the terminal - CRITICAL: removed key remount that was causing memory leaks
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Session indicator */}
      {currentSession && (
        <div className="flex items-center justify-between px-4 py-1 text-xs text-muted-foreground border-b border-border/50">
          <div className="flex items-center">
            <span>Session: {currentSession.name}</span>
            <span className="ml-2 capitalize">({currentSession.environment})</span>
          </div>
          {getSessionStateIndicator(currentSession)}
        </div>
      )}
      
      {/* Terminal interface - Phase 0 simplification */}
      <div className="flex-1 min-h-0">
        <SimpleTerminal 
          kind="terminal"
          className="h-full"
          active={true}
        />
      </div>
    </div>
  )
}
