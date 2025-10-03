import React, { useState } from 'react'
import { Edit2, X, Check, Circle, GitBranch, Loader2, AlertCircle } from 'lucide-react'
import { Session, useSessionManager } from '../../contexts/SessionManagerContext'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

interface SessionLeafProps {
  session: Session
  isActive: boolean
  onSelect: (session: Session) => void
  onRename?: (sessionId: string, newName: string) => void
  onDelete?: (sessionId: string) => void
}

export const SessionLeaf: React.FC<SessionLeafProps> = ({
  session,
  isActive,
  onSelect,
  onRename,
  onDelete,
}) => {
  const { switchSession, currentEnvironment, isSessionPending, getWorktreeError } = useSessionManager()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(session.name)

  const handleSelect = () => {
    console.log('SessionLeaf.handleSelect called for session:', session.name, session.id);
    onSelect(session)
    switchSession(session.id)
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditName(session.name)
  }

  const handleConfirmEdit = () => {
    if (editName.trim() && editName !== session.name) {
      onRename?.(session.id, editName.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(session.name)
    setIsEditing(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete?.(session.id)
  }

  const formatTooltipDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return `Created: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
  }

  // Determine session state and display appropriate indicators
  const isPending = isSessionPending(session.id)
  const worktreeError = getWorktreeError(session.id)
  const hasError = !!worktreeError

  // Extract branch name from worktree branch (e.g. "orchestra/abc123" -> "abc123")
  const getBranchDisplayName = (worktreeBranch: string) => {
    if (worktreeBranch.startsWith('orchestra/')) {
      return worktreeBranch.replace('orchestra/', '')
    }
    return worktreeBranch
  }

  const renderSessionState = () => {
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
    <div className="ml-6 relative group">
      <div
        className={`flex items-center px-3 py-1.5 text-xs cursor-pointer transition-colors rounded-md ${
          isActive 
            ? 'bg-accent text-accent-foreground border-l-2 border-primary' 
            : 'hover:bg-accent/50 text-muted-foreground'
        }`}
        onClick={handleSelect}
        title={formatTooltipDate(session.createdAt)}
      >
        <Circle className="w-2 h-2 mr-2 fill-current flex-shrink-0" />
        
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmEdit()
                if (e.key === 'Escape') handleCancelEdit()
              }}
              onBlur={handleConfirmEdit}
              className="w-full bg-transparent border-none outline-none text-xs font-medium"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center justify-between min-w-0">
              <div className="truncate">
                <span className="font-medium">{session.name}</span>
                <span className="ml-1 text-muted-foreground/70 capitalize">({currentEnvironment})</span>
              </div>
              {renderSessionState()}
            </div>
          )}
        </div>

        {/* Controls */}
        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStartEdit}
              className="w-5 h-5 p-0 rounded-full"
              title="Rename session"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="w-5 h-5 p-0 rounded-full text-muted-foreground hover:text-destructive"
              title="Delete session"
            >
              <X className="w-2.5 h-2.5" />
            </Button>
          </div>
        )}

        {/* Edit controls */}
        {isEditing && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleConfirmEdit}
              className="w-5 h-5 p-0 rounded-full"
              title="Confirm"
            >
              <Check className="w-2.5 h-2.5" />
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEdit}
              className="w-5 h-5 p-0 rounded-full"
              title="Cancel"
            >
              <X className="w-2.5 h-2.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
