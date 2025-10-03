/**
 * Terminal Session Tabs Component
 * 
 * Simple tab bar for switching between terminal sessions with close buttons.
 * Follows Oracle's guidance for clean session management UI.
 */

import React from 'react'
import { X, Plus, Terminal } from 'lucide-react'
import { useTerminalSessions, AmpProfileKind } from './TerminalSessionProvider'

interface TerminalSessionTabsProps {
  onNewSession?: (profile: AmpProfileKind) => void
  className?: string
}

export function TerminalSessionTabs({ onNewSession, className = '' }: TerminalSessionTabsProps) {
  const { sessions, activeId, setActiveId, closeSession } = useTerminalSessions()

  const handleTabClick = (sessionId: string) => {
    setActiveId(sessionId)
  }

  const handleCloseClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation() // Prevent tab activation
    closeSession(sessionId)
  }

  const handleNewSessionClick = () => {
    if (onNewSession) {
      // Default to prod profile for new sessions
      onNewSession('prod')
    }
  }

  const getProfileBadgeColor = (profile: AmpProfileKind) => {
    return profile === 'dev' 
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  }

  return (
    <div className={`terminal-session-tabs flex items-center bg-muted/5 border-b border-border ${className}`}>
      <div className="flex-1 flex items-center overflow-x-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`
              relative flex items-center gap-2 px-3 py-2 cursor-pointer
              border-r border-border/50 min-w-0 max-w-48
              hover:bg-muted/20 transition-colors
              ${activeId === session.id 
                ? 'bg-muted/30 border-b-2 border-b-primary' 
                : 'bg-transparent'
              }
            `}
            onClick={() => handleTabClick(session.id)}
            title={`${session.title || session.profile} session - ${session.cwd || 'default directory'}`}
          >
            {/* Terminal icon */}
            <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            
            {/* Session title */}
            <span className="text-sm truncate flex-1 min-w-0">
              {session.title || `${session.profile} session`}
            </span>
            
            {/* Profile badge */}
            <span 
              className={`
                text-xs px-1.5 py-0.5 rounded text-center uppercase font-medium
                flex-shrink-0 ${getProfileBadgeColor(session.profile)}
              `}
            >
              {session.profile}
            </span>
            
            {/* Close button - only show if more than one session */}
            {sessions.length > 1 && (
              <button
                onClick={(e) => handleCloseClick(e, session.id)}
                className="
                  w-4 h-4 rounded hover:bg-destructive/20 hover:text-destructive
                  flex items-center justify-center flex-shrink-0
                  opacity-60 hover:opacity-100 transition-opacity
                "
                title="Close session"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* New session button */}
      <button
        onClick={handleNewSessionClick}
        className="
          flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground
          hover:text-foreground hover:bg-muted/20 transition-colors
          border-l border-border/50 flex-shrink-0
        "
        title="Create new terminal session"
      >
        <Plus className="w-4 h-4" />
        <span>New</span>
      </button>
    </div>
  )
}

export default TerminalSessionTabs
