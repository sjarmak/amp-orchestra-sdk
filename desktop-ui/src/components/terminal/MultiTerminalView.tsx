/**
 * Multi-Terminal View Component
 * 
 * Manages multiple SimpleTerminal instances following Oracle's guidance:
 * - Renders all terminal sessions but only the active one receives events
 * - Preserves existing SimpleTerminal logic and PTY connections
 * - Each terminal maintains its own state and connection
 */


import { useTerminalSessions, AmpProfileKind } from './TerminalSessionProvider'
import SimpleTerminal from './SimpleTerminal'
import TerminalSessionTabs from './TerminalSessionTabs'

interface MultiTerminalViewProps {
  className?: string
  active?: boolean // Whether this terminal view is currently active (e.g., vs chat)
}

export function MultiTerminalView({ className = '', active = true }: MultiTerminalViewProps) {
  const { sessions, activeId, createSession } = useTerminalSessions()

  const handleNewSession = (profile: AmpProfileKind) => {
    const sessionId = createSession(profile, undefined, `${profile} session`)
    console.log('[MultiTerminalView] Created new session:', sessionId)
  }

  return (
    <div className={`multi-terminal-view h-full flex flex-col ${className}`}>
      {/* Session tabs */}
      <TerminalSessionTabs 
        onNewSession={handleNewSession}
        className="flex-shrink-0"
      />
      
      {/* Terminal container */}
      <div className="relative flex-1 min-h-0">
        {sessions.map((session) => {
          const isActiveSession = session.id === activeId
          const terminalActive = active && isActiveSession
          
          return (
            <div
              key={session.id}
              className={`
                absolute inset-0 w-full h-full
                ${isActiveSession ? 'z-10' : 'z-0 pointer-events-none opacity-0'}
              `}
            >
              <SimpleTerminal
                key={session.id} // Unique key for each session
                kind="terminal"
                cwd={session.cwd}
                className="w-full h-full"
                active={terminalActive} // Only active if this view is active AND this session is active
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MultiTerminalView
