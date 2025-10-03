import { useRef, useLayoutEffect, useEffect, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'

export type SimpleTerminalKind = 'terminal' | 'shell'

interface SimpleTerminalProps {
  kind?: SimpleTerminalKind
  env?: Record<string, string>
  cwd?: string
  className?: string
  sessionId?: string
}

export default function SimpleTerminalFixed({ 
  kind = 'shell', 
  env = {}, 
  cwd, 
  className = '', 
  sessionId 
}: SimpleTerminalProps) {
  const { terminalTheme } = useTheme()
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef(sessionId || `${kind}_${Date.now()}`)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSessionOpen, setIsSessionOpen] = useState(false)

  // Cleanup function
  const cleanup = () => {
    setIsSessionOpen(false)
    if (xtermRef.current) {
      try {
        xtermRef.current.dispose()
      } catch (e) {
        console.error('Failed to dispose terminal:', e)
      }
      xtermRef.current = null
    }
    fitRef.current = null
  }

  useLayoutEffect(() => {
    const container = termRef.current
    if (!container) {
      return cleanup
    }

    // Create terminal with better wrapping and sizing configuration
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      convertEol: false,
      scrollback: 1000,
      allowTransparency: false,
      theme: {
        background: terminalTheme.background,
        foreground: terminalTheme.foreground,
        cursor: terminalTheme.cursor,
      },
      fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: 1.0,
      letterSpacing: 0,
      // Ensure proper wrapping behavior
      cols: 80, // Will be recalculated by fit addon
      rows: 24, // Will be recalculated by fit addon
      scrollOnUserInput: true,
      disableStdin: false,
    })

    const fit = new FitAddon()
    xtermRef.current = term
    fitRef.current = fit

    try {
      // Direct mounting without IntersectionObserver
      term.open(container)
      term.loadAddon(fit)
      
      // Wait for layout to settle before first fit
      requestAnimationFrame(() => {
        try {
          // Check container dimensions before fitting
          const rect = container.getBoundingClientRect()
          if (rect.width > 10 && rect.height > 10) {
            fit.fit()
            console.log(`[SimpleTerminal] Initial fit: ${term.cols}x${term.rows}`)
            setIsReady(true)
            
            // Start PTY session after proper sizing
            startPtySession()
          } else {
            // Retry after a short delay if container not ready
            setTimeout(() => {
              try {
                fit.fit()
                console.log(`[SimpleTerminal] Delayed fit: ${term.cols}x${term.rows}`)
                setIsReady(true)
                startPtySession()
              } catch (e) {
                console.warn('[SimpleTerminal] Delayed fit failed:', e)
                setIsReady(true) // Set ready anyway to avoid blocking
                startPtySession()
              }
            }, 100)
          }
        } catch (e) {
          console.warn('[SimpleTerminal] Initial fit failed:', e)
          setError(`Failed to fit terminal: ${e}`)
          setIsReady(true) // Set ready anyway to avoid blocking
        }
      })

    } catch (e) {
      setError(`Failed to open terminal: ${e}`)
      return cleanup
    }

    // PTY session management
    const startPtySession = async () => {
      try {
        const cols = term.cols || 80
        const rows = term.rows || 24
        
        console.log(`[SimpleTerminal] Starting PTY with dimensions: ${cols}x${rows}`)
        
        const backendSessionId = await invoke('cmd_start_tui', {
          profile: kind,
          cwd: cwd || '/Users/sjarmak/amp-orchestra',
          cols,
          rows,
          env,
        }) as string
        
        // Update session ID to match backend
        sessionIdRef.current = backendSessionId
        setIsSessionOpen(true)
        
        // Set up input handling
        const onDataDispose = term.onData((data) => {
          invoke('cmd_write_stdin', { 
            sessionId: backendSessionId, 
            utf8Chunk: data 
          }).catch(() => {
            // Ignore write errors - session might not be ready
          })
        })

        // Set up output handling
        const unlisten = await listen('terminal://data', (e: any) => {
          const { id, chunk } = e.payload as { id: string; chunk: string }
          if (id === backendSessionId && chunk) {
            try {
              term.write(chunk)
            } catch (e) {
              // Ignore write errors to disposed terminals
            }
          }
        })

        term.focus()

        // Cleanup function
        return () => {
          try {
            onDataDispose.dispose()
            unlisten()
          } catch (e) {
            // Ignore cleanup errors
          }
        }

      } catch (e) {
        setError(`Failed to start PTY: ${e}`)
        
        // Show error in terminal
        term.write('\r\n\x1b[31mFailed to start terminal session:\x1b[0m\r\n')
        term.write(`Error: ${e}\r\n`)
        term.write(`Session ID: ${sessionIdRef.current}\r\n`)
        term.write('\r\nTerminal UI is ready but backend connection failed.\r\n')
      }
    }

    return cleanup
  }, [kind, cwd, terminalTheme])

  // Handle resize events with container awareness
  useEffect(() => {
    if (!isReady || !fitRef.current || !termRef.current) return

    let resizeTimeout: number

    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = window.setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            const el = termRef.current
            if (!el) return

            // Check if container has valid dimensions
            const rect = el.getBoundingClientRect()
            if (rect.width < 10 || rect.height < 10) return

            fitRef.current?.fit()
            
            if (isSessionOpen && xtermRef.current && sessionIdRef.current) {
              const cols = xtermRef.current.cols
              const rows = xtermRef.current.rows
              console.log(`[SimpleTerminal] Resizing to ${cols}x${rows}`)
              invoke('cmd_resize', { sessionId: sessionIdRef.current, cols, rows }).catch(() => {})
            }
          } catch (e) {
            console.warn('[SimpleTerminal] Resize error:', e)
          }
        })
      }, 100) // Throttle resize calls
    }

    // Watch for container size changes (important for ResizableSplit)
    let resizeObserver: ResizeObserver | null = null
    try {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(termRef.current)
    } catch (e) {
      console.warn('[SimpleTerminal] ResizeObserver not available')
    }

    // Also handle window resize
    window.addEventListener('resize', handleResize)

    // Initial fit after small delay to ensure layout is settled
    const initialFitTimeout = setTimeout(handleResize, 50)

    return () => {
      clearTimeout(resizeTimeout)
      clearTimeout(initialFitTimeout)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [isReady, isSessionOpen])

  return (
    <div className={`h-full w-full ${className}`}>
      {error && (
        <div className="p-2 bg-red-100 text-red-800 text-xs border-b">
          <strong>Terminal Error:</strong> {error}
        </div>
      )}
      {!isReady && !error && (
        <div className="p-2 bg-yellow-100 text-yellow-800 text-xs border-b">
          Initializing terminal...
        </div>
      )}
      <div 
        ref={termRef}
        className="h-full w-full"
        style={{ 
          backgroundColor: terminalTheme.background,
          minHeight: '200px'  // Ensure minimum height
        }}
      />
    </div>
  )
}
