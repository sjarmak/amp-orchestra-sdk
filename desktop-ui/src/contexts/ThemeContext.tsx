import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'

type Theme = 'light' | 'dark'

interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent?: string
  selectionBackground?: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  terminalTheme: TerminalTheme
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

const lightTerminalTheme: TerminalTheme = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(0, 0, 0, 0.3)',
  black: '#000000',
  red: '#cc241d',
  green: '#689d6a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#8ec07c',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
}

const darkTerminalTheme: TerminalTheme = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(255, 255, 255, 0.3)',
  black: '#1d2021',
  red: '#cc241d',
  green: '#689d6a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#8ec07c',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage for saved theme, default to dark
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme
      return savedTheme || 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    const root = window.document.documentElement
    
    // Remove previous theme classes
    root.classList.remove('light', 'dark')
    
    // Add current theme class
    root.classList.add(theme)
    
    // Save to localStorage
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    // Listen for system theme changes from Tauri
    const unlisten = listen<boolean>('theme-changed', (event) => {
      const systemIsDark = event.payload
      const newTheme = systemIsDark ? 'dark' : 'light'
      setTheme(newTheme)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const terminalTheme = theme === 'light' ? lightTerminalTheme : darkTerminalTheme

  const value = {
    theme,
    toggleTheme,
    terminalTheme
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
