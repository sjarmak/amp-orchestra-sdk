import React, { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { SessionEnvironment } from '../../contexts/SessionManagerContext'
import { Button } from '../ui/button'

interface NewSessionLeafProps {
  onCreateSession: (name: string, useWorktree: boolean, environment?: SessionEnvironment) => void
}

export const NewSessionLeaf: React.FC<NewSessionLeafProps> = ({
  onCreateSession,
}) => {
  const [isCreating, setIsCreating] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [useWorktree, setUseWorktree] = useState(false)

  const handleStartCreate = () => {
    setIsCreating(true)
    setNewSessionName('New Session')
  }

  const handleConfirmCreate = () => {
    console.log('NewSessionLeaf.handleConfirmCreate called with:', { newSessionName, useWorktree });

    if (newSessionName.trim()) {
      // Environment is now global, so sessions don't need to specify one
      console.log('Calling onCreateSession with:', newSessionName.trim(), useWorktree);
      onCreateSession(newSessionName.trim(), useWorktree)
      setIsCreating(false)
      setNewSessionName('')
      setUseWorktree(false)
    } else {
      console.log('Session name is empty, not creating session');
    }
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setNewSessionName('')
    setUseWorktree(false)
  }

  if (isCreating) {
    return (
      <div className="ml-6 px-3 py-1.5 text-xs">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreate()
                if (e.key === 'Escape') handleCancelCreate()
              }}
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              placeholder="Session name"
              autoFocus
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={handleConfirmCreate}
              className="w-5 h-5 p-0 rounded-full"
              title="Create session"
            >
              <Check className="w-2.5 h-2.5" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelCreate}
              className="w-5 h-5 p-0 rounded-full"
              title="Cancel"
            >
              <X className="w-2.5 h-2.5" />
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
              className="w-3 h-3 rounded border-border"
            />
            <span>Create worktree (isolated branch)</span>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="ml-6">
      <div
        className="flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 text-muted-foreground rounded-md transition-colors"
        onClick={handleStartCreate}
      >
        <Plus className="w-2 h-2 mr-2 flex-shrink-0" />
        <span className="text-muted-foreground/70">New Session</span>
      </div>
    </div>
  )
}
