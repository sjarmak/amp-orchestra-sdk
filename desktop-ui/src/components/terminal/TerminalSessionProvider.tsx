import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type AmpProfileKind = 'dev' | 'prod'

export interface TerminalSession {
  id: string
  profile: AmpProfileKind
  cwd?: string
  title?: string
  createdAt: Date
}

interface TerminalSessionContextType {
  sessions: TerminalSession[]
  activeId: string | undefined
  createSession: (profile: AmpProfileKind, cwd?: string, title?: string) => string
  closeSession: (id: string) => void
  setActiveId: (id: string) => void
}

const TerminalSessionContext = createContext<TerminalSessionContextType | undefined>(undefined)

interface TerminalSessionProviderProps {
  children: ReactNode
}

export function TerminalSessionProvider({ children }: TerminalSessionProviderProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()

  const createSession = useCallback((profile: AmpProfileKind, cwd?: string, title?: string): string => {
    const id = `${profile}_${Date.now()}`
    const newSession: TerminalSession = {
      id,
      profile,
      cwd,
      title,
      createdAt: new Date()
    }
    
    setSessions(prev => [...prev, newSession])
    setActiveId(id)
    return id
  }, [])

  const closeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(session => session.id !== id))
    setActiveId(prev => {
      if (prev === id) {
        // If closing active session, switch to the last remaining session
        const remaining = sessions.filter(s => s.id !== id)
        return remaining.length > 0 ? remaining[remaining.length - 1].id : undefined
      }
      return prev
    })
  }, [sessions])

  const value: TerminalSessionContextType = {
    sessions,
    activeId,
    createSession,
    closeSession,
    setActiveId
  }

  return (
    <TerminalSessionContext.Provider value={value}>
      {children}
    </TerminalSessionContext.Provider>
  )
}

export function useTerminalSessions() {
  const context = useContext(TerminalSessionContext)
  if (!context) {
    throw new Error('useTerminalSessions must be used within TerminalSessionProvider')
  }
  return context
}
