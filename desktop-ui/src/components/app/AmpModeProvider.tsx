/**
 * Amp Mode Provider
 * 
 * Context provider for managing Amp mode (production vs dev) across the app
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type AmpMode = 'production' | 'dev'

interface AmpModeContextType {
  mode: AmpMode
  setMode: (mode: AmpMode) => void
  isDevMode: boolean
  isProdMode: boolean
}

const AmpModeContext = createContext<AmpModeContextType | null>(null)

interface AmpModeProviderProps {
  children: ReactNode
  defaultMode?: AmpMode
}

/**
 * Provider for Amp mode management
 * 
 * Manages the current Amp mode (production vs dev) and provides utilities
 * for checking and switching modes. Persists mode to localStorage.
 */
export const AmpModeProvider: React.FC<AmpModeProviderProps> = ({ 
  children, 
  defaultMode = 'production' 
}) => {
  const [mode, setModeState] = useState<AmpMode>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('amp-mode')
      if (saved === 'production' || saved === 'dev') {
        return saved
      }
    }
    return defaultMode
  })

  // Persist to localStorage when mode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('amp-mode', mode)
    }
  }, [mode])

  const setMode = (newMode: AmpMode) => {
    setModeState(newMode)
  }

  const contextValue: AmpModeContextType = {
    mode,
    setMode,
    isDevMode: mode === 'dev',
    isProdMode: mode === 'production',
  }

  return (
    <AmpModeContext.Provider value={contextValue}>
      {children}
    </AmpModeContext.Provider>
  )
}

/**
 * Hook to access Amp mode context
 */
export const useAmpMode = (): AmpModeContextType => {
  const context = useContext(AmpModeContext)
  if (!context) {
    throw new Error('useAmpMode must be used within an AmpModeProvider')
  }
  return context
}

/**
 * Mode switcher component
 */
export const AmpModeSwitcher: React.FC<{ className?: string }> = ({ 
  className = '' 
}) => {
  const { mode, setMode } = useAmpMode()

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm text-gray-500">Mode:</span>
      <div className="flex gap-1">
        <button
          onClick={() => setMode('production')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            mode === 'production'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          Prod
        </button>
        <button
          onClick={() => setMode('dev')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            mode === 'dev'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          Dev
        </button>
      </div>
    </div>
  )
}
