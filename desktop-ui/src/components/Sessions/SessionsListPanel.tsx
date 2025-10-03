/**
 * Sessions List Panel - Placeholder component
 * 
 * This is a placeholder component to maintain compatibility
 * while the session management system is being implemented.
 */

interface SessionsListPanelProps {
  currentSessionId?: string | undefined
}

export function SessionsListPanel({ currentSessionId }: SessionsListPanelProps) {
  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>Sessions list panel coming soon...</p>
      {currentSessionId && (
        <p className="text-xs mt-2">Current session: {currentSessionId}</p>
      )}
    </div>
  )
}
