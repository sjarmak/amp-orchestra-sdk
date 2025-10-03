/**
 * Sessions Panel - Expandable session management panel
 * 
 * A full-width expandable panel for managing multiple concurrent sessions.
 * Transforms from SessionSidebar following Oracle guidance: expandable panel structure.
 */

import { useState } from 'react'
import { Plus, Folder, Edit2, X, Check, GitBranch, Loader2, AlertCircle } from 'lucide-react'
import { useSessionManager, type SessionEnvironment } from '../../contexts/SessionManagerContext'
import { useRepository } from '../../contexts/RepositoryContext'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

interface SessionsPanelProps {
  className?: string
  onClose?: () => void
}

export function SessionsPanel({ className = '', onClose }: SessionsPanelProps) {
  const { state, currentSession, createSession, switchSession, renameSession, deleteSession, isSessionPending, getWorktreeError } = useSessionManager()
  const { activeRepository } = useRepository()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  
  const handleCreateSession = async () => {
    if (!activeRepository) {
      console.warn('No active repository selected')
      return
    }
    
    console.log('Creating session for repository:', activeRepository.path)
    
    try {
      const environment: SessionEnvironment = 'production' // Default to production
      const branch = 'main' // Default branch for new sessions
      const sessionId = await createSession(activeRepository.id, `Session ${state.sessions.length + 1}`, environment, branch, undefined, activeRepository.path)
      console.log('Successfully created session:', sessionId)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }
  
  const handleStartRename = (sessionId: string, currentName: string) => {
    setEditingId(sessionId)
    setEditName(currentName)
  }
  
  const handleConfirmRename = () => {
    if (editingId && editName.trim()) {
      renameSession(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }
  
  const handleCancelRename = () => {
    setEditingId(null)
    setEditName('')
  }
  
  const handleDeleteSession = (sessionId: string) => {
    if (state.sessions.length > 1) { // Don't delete the last session
      deleteSession(sessionId)
    }
  }
  
  const getSessionIcon = () => {
    return Folder
  }
  
  const formatTooltipDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return `Created: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
  }

  // Extract branch name from worktree branch (e.g. "orchestra/abc123" -> "abc123")
  const getBranchDisplayName = (worktreeBranch: string) => {
    if (worktreeBranch.startsWith('orchestra/')) {
      return worktreeBranch.replace('orchestra/', '')
    }
    return worktreeBranch
  }

  const getSessionStateIndicator = (session: any) => {
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
  
  return (
    <div className={`w-80 bg-background border-r border-border flex flex-col ${className}`}>
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4">
        <h2 className="text-sm font-semibold text-foreground">Sessions</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCreateSession}
            className="w-8 h-8 p-0 rounded-full"
            title="New Session"
          >
            <Plus className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="w-8 h-8 p-0 rounded-full"
              title="Close Panel"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="space-y-2 px-4">
          {state.sessions.map((session) => {
            const isActive = session.id === currentSession?.id
            const SessionIcon = getSessionIcon()
            
            return (
              <div
                key={session.id}
                className={`group relative rounded-lg border transition-all duration-200 ${
                  isActive 
                    ? 'bg-muted border-muted-foreground/20' 
                    : 'border-border hover:bg-muted/50 hover:border-muted-foreground/20'
                }`}
              >
                {/* Main session button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => switchSession(session.id)}
                  className={`w-full h-14 p-3 flex items-center justify-start gap-3 ${
                    isActive ? 'bg-transparent' : ''
                  }`}
                  title={session.name}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <SessionIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  <div className="flex-1 text-left">
                    {editingId === session.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmRename()
                          if (e.key === 'Escape') handleCancelRename()
                        }}
                        onBlur={handleConfirmRename}
                        className="w-full bg-transparent border-none outline-none text-sm font-medium"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex-1">
                        <div 
                          className="text-sm font-medium text-foreground"
                          title={formatTooltipDate(session.createdAt)}
                        >
                          {session.name}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground capitalize">
                            {session.environment}
                          </div>
                          {getSessionStateIndicator(session)}
                        </div>
                      </div>
                    )}
                  </div>
                </Button>
                
                {/* Hover controls */}
                {!editingId && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartRename(session.id, session.name)
                        }}
                        className="w-8 h-8 p-0 bg-background border border-border rounded-full shadow-sm"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      
                      {state.sessions.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteSession(session.id)
                          }}
                          className="w-8 h-8 p-0 bg-background border border-border rounded-full shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Delete"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Rename controls */}
                {editingId === session.id && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleConfirmRename}
                      className="w-8 h-8 p-0 bg-background border border-border rounded-full shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Confirm"
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelRename}
                      className="w-8 h-8 p-0 bg-background border border-border rounded-full shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Current session indicator at bottom */}
      {currentSession && (
        <div className="border-t border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Active Session</div>
          <div className="text-sm px-3 py-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">{currentSession.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{currentSession.environment}</div>
              </div>
              {getSessionStateIndicator(currentSession)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
