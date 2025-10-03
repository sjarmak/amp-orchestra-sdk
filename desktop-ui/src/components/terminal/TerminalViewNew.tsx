/**
 * M1.7 Terminal View Component
 * 
 * Renders a PTY-based terminal using xterm.js with proper integration to the TerminalProvider.
 * Supports window resize, theme integration, and Chat/Terminal toggle functionality.
 */

import React, { useEffect, useRef, useCallback, useState, memo } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebglAddon } from 'xterm-addon-webgl'
import { CanvasAddon } from 'xterm-addon-canvas'
import 'xterm/css/xterm.css'
import { useTerminalProvider, useTuiSession } from './TerminalProvider'
import { useFileLinks } from '../../hooks/useFileLinks'
import { useThrottledResize, createSafeResizeObserver } from './useThrottledResize'

interface TerminalViewProps {
  profile: string
  variantId?: string
  className?: string
  onReady?: () => void
  onExit?: () => void
  autoStart?: boolean
}

/**
 * TerminalView component that provides a full PTY terminal experience
 * 
 * Features:
 * - Real PTY integration via Tauri backend
 * - xterm.js with WebGL/Canvas acceleration
 * - Automatic resizing and theme support
 * - File link integration
 * - Session lifecycle management
 */
const TerminalViewComponent: React.FC<TerminalViewProps> = ({
  profile,
  variantId,
  className = '',
  onReady,
  onExit,
  autoStart = true
}) => {
  // Only log actual mounts, not re-renders
  useEffect(() => {
    console.log('[TerminalView] mounted:', profile, variantId)
    return () => console.log('[TerminalView] unmounted:', profile, variantId)
  }, [])
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const rendererRef = useRef<WebglAddon | CanvasAddon | null>(null)
  const rendererReadyRef = useRef<boolean>(false)
  const xtermOpenedRef = useRef<boolean>(false)
  const isCleanedUpRef = useRef<boolean>(false)
  
  const [isInitialized, setIsInitialized] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)
  const [sessionStartAttempted, setSessionStartAttempted] = useState(false)
  
  const terminalProvider = useTerminalProvider()
  const tuiSession = useTuiSession(profile, variantId)
  const { setupFileLinkHandlers } = useFileLinks()
  
  // Debug session info
  useEffect(() => {
    console.log('[TerminalView] Session info:', {
      profile,
      variantId,
      sessionId: tuiSession.session?.id,
      status: tuiSession.session?.status
    })
  }, [profile, variantId, tuiSession.session?.id, tuiSession.session?.status])
  
  // Initialize xterm terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current || isInitialized || isCleanedUpRef.current) {
      return
    }
    
    console.log('[TerminalView] Initializing xterm terminal')
    setIsInitialized(true)
    isCleanedUpRef.current = false
    xtermOpenedRef.current = false
    rendererReadyRef.current = false

    // Use setTimeout for async initialization to prevent blocking
    const initializeAsync = () => {
      setTimeout(() => {
        if (isCleanedUpRef.current) return
        
        const terminal = new Terminal({
          fontSize: 14,
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Monaco, "Courier New", monospace',
          theme: {
            background: getComputedStyle(document.documentElement)
                         .getPropertyValue('--background')
                         .trim() || '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#ffffff',
            selectionBackground: '#264f78',
            black: '#000000',
            red: '#f14c4c',
            green: '#23d18b',
            yellow: '#f5f543',
            blue: '#3b8eea',
            magenta: '#d670d6',
            cyan: '#29b8db',
            white: '#e5e5e5',
          },
          cursorBlink: true,
          allowProposedApi: true,
          scrollback: 10000,
          rightClickSelectsWord: true,
          scrollSensitivity: 1,
        })

        // Open terminal in DOM
        if (!terminalRef.current || isCleanedUpRef.current || xtermOpenedRef.current) {
          console.error('[TerminalView] Terminal container not available or already opened')
          setIsInitialized(false)
          return
        }
        
        // Check container dimensions before opening
        const rect = terminalRef.current.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          console.warn('[TerminalView] Container has no dimensions, deferring initialization')
          setIsInitialized(false)
          return
        }
        
        terminal.open(terminalRef.current)
        xtermOpenedRef.current = true

        // Add fit addon for responsive resizing
        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        
        xtermRef.current = terminal
        fitAddonRef.current = fitAddon

        console.log('[TerminalView] Terminal initialized successfully')
        
        // Setup file link handlers
        setupFileLinkHandlers(terminalRef.current)
        
        // Initial terminal sizing with renderer readiness validation
        const performResize = () => {
          if (isCleanedUpRef.current) return
          if (!xtermOpenedRef.current || !fitAddon) return
          
          const container = terminalRef.current
          if (!container) return
          
          // Validate renderer dimensions before any operations
          const rows = container.querySelector('.xterm-rows') as HTMLElement | null
          const h = rows?.offsetHeight || 0
          const w = rows?.offsetWidth || 0
          rendererReadyRef.current = h > 0 && w > 0
          
          if (!rendererReadyRef.current) {
            console.log('[TerminalView] Renderer not ready yet, retrying...')
            return
          }
          
          try {
            fitAddon.fit()
            if (tuiSession.session?.status === 'running') {
              tuiSession.resize(terminal.cols, terminal.rows).catch(console.error)
            }
          } catch (error) {
            console.warn('[TerminalView] Error during resize:', error)
          }
        }
        
        // Perform initial resize with retries for proper layout
        setTimeout(performResize, 50)
        setTimeout(performResize, 150)
        setTimeout(performResize, 300)
        setTimeout(performResize, 500)
        
        // Only set ready after initial renderer check
        setTimeout(() => {
          if (rendererReadyRef.current && !isCleanedUpRef.current) {
            setTerminalReady(true)
          }
        }, 200)
        
        // Attempt to load performance addons asynchronously with error handling
        setTimeout(() => {
          if (isCleanedUpRef.current || !xtermOpenedRef.current) return
          
          try {
            const webglAddon = new WebglAddon()
            terminal.loadAddon(webglAddon)
            rendererRef.current = webglAddon
            console.log('[TerminalView] Loaded WebGL renderer for improved performance')
          } catch (webglError) {
            console.warn('[TerminalView] WebGL not available, trying Canvas:', webglError)
            try {
              const canvasAddon = new CanvasAddon()
              terminal.loadAddon(canvasAddon)
              rendererRef.current = canvasAddon
              console.log('[TerminalView] Loaded Canvas renderer')
            } catch (canvasError) {
              console.warn('[TerminalView] Canvas not available, using DOM renderer:', canvasError)
              rendererRef.current = null
            }
          }
          
          // Force renderer readiness check after addon loading
          setTimeout(() => {
            if (isCleanedUpRef.current) return
            const container = terminalRef.current
            if (!container) return
            
            const rows = container.querySelector('.xterm-rows') as HTMLElement | null
            const h = rows?.offsetHeight || 0
            const w = rows?.offsetWidth || 0
            rendererReadyRef.current = h > 0 && w > 0
            
            if (rendererReadyRef.current && !terminalReady) {
              setTerminalReady(true)
            }
          }, 50)
        }, 100)
      }, 0)
    }

    initializeAsync()
    

    
    return () => {
      console.log('[TerminalView] Cleaning up xterm terminal')
      isCleanedUpRef.current = true
      
      // Dispose renderer addon first to prevent memory leaks
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose()
        } catch (error) {
          console.warn('[TerminalView] Error disposing renderer:', error)
        }
        rendererRef.current = null
      }
      
      // Dispose fit addon
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.dispose()
        } catch (error) {
          console.warn('[TerminalView] Error disposing fit addon:', error)
        }
        fitAddonRef.current = null
      }
      
      // Dispose terminal
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose()
        } catch (error) {
          console.warn('[TerminalView] Error disposing terminal:', error)
        }
        xtermRef.current = null
      }
      
      xtermOpenedRef.current = false
      rendererReadyRef.current = false
      setIsInitialized(false)
      setTerminalReady(false)
    }
  }, [isInitialized, tuiSession, setupFileLinkHandlers])

  // Handle terminal input
  useEffect(() => {
    const terminal = xtermRef.current
    if (!terminal) return
    
    const handleInput = (data: string) => {
      if (tuiSession.session?.status === 'running') {
        tuiSession.write(data).catch(console.error)
      }
    }
    
    const disposable = terminal.onData(handleInput)
    return () => disposable.dispose()
  }, [tuiSession])
  
  // Handle terminal data from PTY
  useEffect(() => {
    const terminal = xtermRef.current
    if (!terminal) return
    
    const unsubscribe = terminalProvider.onTerminalData((sessionId, data) => {
      // Reduced logging for data events
      if (tuiSession.session?.id === sessionId) {
      // Only log occasionally to avoid spam
          if (Math.random() < 0.01) {
            console.log('[TerminalView] Writing data to terminal:', data.length, 'bytes')
          }
        terminal.write(data)
      }
    })
    
    return unsubscribe
  }, [terminalProvider, tuiSession.session?.id])
  
  // Initialize throttled resize handling with renderer readiness check
  const { handleResize, cleanup } = useThrottledResize({
    terminal: xtermRef.current || undefined,
    fitAddon: fitAddonRef.current || undefined,
    onDimensionChange: useCallback((cols: number, rows: number) => {
      if (rendererReadyRef.current && tuiSession.session?.status === 'running') {
        tuiSession.resize(cols, rows).catch(console.error)
      }
    }, [tuiSession]),
    throttleMs: 100
  })

  // Handle window and container resize
  useEffect(() => {
    if (!terminalRef.current) return

    // Add window resize listener
    window.addEventListener('resize', handleResize)
    
    // Create ResizeObserver with proper cleanup
    const cleanupResizeObserver = createSafeResizeObserver(
      terminalRef.current,
      handleResize
    )
    
    return () => {
      window.removeEventListener('resize', handleResize)
      cleanupResizeObserver?.()
      cleanup()
    }
  }, [handleResize, cleanup])
  
  // Auto-start session if requested
  useEffect(() => {
    if (terminalReady && autoStart && !sessionStartAttempted && (!tuiSession.session || tuiSession.session.status === 'exited')) {
      const startSession = async () => {
        try {
          setSessionStartAttempted(true)
          const terminal = xtermRef.current
          const cols = terminal?.cols || 80
          const rows = terminal?.rows || 24
          
          console.log('[TerminalView] Auto-starting session with dimensions:', cols, 'x', rows)
          await tuiSession.start({ cols, rows })
          onReady?.()
        } catch (error) {
          console.error('[TerminalView] Failed to auto-start session:', error)
          setSessionStartAttempted(false) // Allow retry on error
        }
      }
      
      startSession()
    }
  }, [terminalReady, autoStart, sessionStartAttempted, tuiSession.session?.status, profile, variantId, onReady])
  
  // Handle session status changes
  useEffect(() => {
    if (tuiSession.session?.status === 'running') {
      // Reset the start attempted flag when session is running
      setSessionStartAttempted(false)
    } else if (tuiSession.session?.status === 'exited') {
      // Reset flag when session exits to allow restart
      setSessionStartAttempted(false)
      onExit?.()
    }
  }, [tuiSession.session?.status, onExit])
  
  // Theme updates
  useEffect(() => {
    const terminal = xtermRef.current
    if (!terminal) return
    
    const updateTheme = () => {
      const newBackground = getComputedStyle(document.documentElement)
                             .getPropertyValue('--background')
                             .trim() || '#1e1e1e'
      
      terminal.options.theme = {
        ...terminal.options.theme,
        background: newBackground
      }
      
      fitAddonRef.current?.fit()
    }
    
    // Listen for theme changes via mutation observer
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          updateTheme()
        }
      })
    })
    
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    })
    
    return () => {
      observer.disconnect()
    }
  }, [])
  
  // Focus handling
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      xtermRef.current?.focus()
    }
  }, [])
  
  // Render status overlay for non-running sessions
  const renderStatusOverlay = () => {
    const session = tuiSession.session
    
    if (!session || session.status === 'running') {
      return null
    }
    
    switch (session.status) {
      case 'starting':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
            <div className="text-center">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Starting {profile} session...</p>
            </div>
          </div>
        )
      
      case 'error':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
            <div className="text-center p-4">
              <div className="text-destructive mb-2">❌</div>
              <p className="text-sm text-muted-foreground mb-4">Failed to start terminal session</p>
              <button
                onClick={() => tuiSession.start()}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        )
      
      case 'exited':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
            <div className="text-center p-4">
              <div className="text-muted-foreground mb-2">💤</div>
              <p className="text-sm text-muted-foreground mb-4">Terminal session ended</p>
              <button
                onClick={() => tuiSession.start()}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
              >
                Restart
              </button>
            </div>
          </div>
        )
      
      default:
        return null
    }
  }
  
  return (
    <div className={`terminal-view relative ${className}`} style={{ height: '100%', minHeight: '100%' }}>
      {/* Terminal container */}
      <div 
        ref={terminalRef}
        className="w-full h-full cursor-text"
        style={{
          backgroundColor: getComputedStyle(document.documentElement)
                            .getPropertyValue('--background')
                            .trim() || '#1e1e1e',
          minHeight: '100%',
          height: '100%',
          overflow: 'hidden'
        }}
        onClick={handleClick}
      />
      
      {/* Status overlay */}
      {renderStatusOverlay()}
      
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-0 right-0 bg-muted text-muted-foreground text-xs px-2 py-1 border border-border z-20">
          {tuiSession.session?.status || 'no-session'} | {profile}
        </div>
      )}
    </div>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const TerminalView = memo(TerminalViewComponent, (prevProps, nextProps) => {
  return (
    prevProps.profile === nextProps.profile &&
    prevProps.variantId === nextProps.variantId &&
    prevProps.className === nextProps.className &&
    prevProps.autoStart === nextProps.autoStart &&
    prevProps.onReady === nextProps.onReady &&
    prevProps.onExit === nextProps.onExit
  )
})

TerminalView.displayName = 'TerminalView'

export default TerminalView
