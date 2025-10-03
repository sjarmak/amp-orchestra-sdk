import { useRef, useLayoutEffect } from 'react'
import { Terminal, IDisposable } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
// import { WebglAddon } from 'xterm-addon-webgl'
import { CanvasAddon } from 'xterm-addon-canvas'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useThrottledResize, createSafeResizeObserver } from './useThrottledResize'

export type SimpleTerminalKind = 'terminal' | 'shell'

interface SimpleTerminalProps {
  kind?: SimpleTerminalKind
  env?: Record<string, string>
  cwd?: string
  className?: string
  active?: boolean
  sessionId?: string
}

export default function SimpleTerminal({ kind = 'terminal', env = {}, cwd, className = '', active = true, sessionId }: SimpleTerminalProps) {
  const { terminalTheme } = useTheme()
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef(sessionId || `${kind}_${Date.now()}`)
  const writeBufRef = useRef<string>('')
  const flushScheduledRef = useRef<boolean>(false)
  const flushTimerRef = useRef<number | null>(null)
  const isCleanedUpRef = useRef<boolean>(false)
  const timeoutsRef = useRef<number[]>([])
  const isSessionOpenRef = useRef<boolean>(false)
  const onDataDisposeRef = useRef<IDisposable | null>(null)
  const rendererReadyRef = useRef<boolean>(false)
  const xtermOpenedRef = useRef<boolean>(false)
  const subscribedRef = useRef<boolean>(false)
  const reducedMotionRef = useRef<boolean>(false)
  const activeRef = useRef<boolean>(active)
  const ptyOpenedRef = useRef<boolean>(false)
  const firstFitDoneRef = useRef<boolean>(false)
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<CanvasAddon | null>(null)

  // Use throttled resize hook for better performance
  const { handleResize: throttledResize, cleanup: resizeCleanup } = useThrottledResize({
    terminal: xtermRef.current || undefined,
    fitAddon: fitRef.current || undefined,
    onDimensionChange: (cols, rows) => {
      // Only resize PTY if session is open and dimensions actually changed
      if (isSessionOpenRef.current && xtermRef.current) {
        const mySessionId = sessionIdRef.current
        invoke('cmd_resize', { sessionId: mySessionId, cols, rows })
          .catch(() => {/* ignore resizes before session exists */})
      }
    },
    throttleMs: 100
  })

  // Update activeRef when active prop changes and immediately reconcile when becoming active
  useLayoutEffect(() => {
    activeRef.current = active
    if (active && xtermRef.current && fitRef.current) {
      // Use throttled resize for smooth performance
      throttledResize()
      
      // Flush any buffered content
      if (writeBufRef.current) {
        const data = writeBufRef.current
        writeBufRef.current = ''
        try { xtermRef.current.write(data) } catch {}
      }
      try { xtermRef.current.refresh(0, xtermRef.current.rows - 1) } catch {}
      try { xtermRef.current.focus() } catch {}
    }
  }, [active, throttledResize])

  useLayoutEffect(() => {
    // Reset cleanup flag for this mount
    isCleanedUpRef.current = false
    xtermOpenedRef.current = false
    subscribedRef.current = false
    ptyOpenedRef.current = false
    
    // Capture a stable session id for this mount
    const mySessionId = sessionIdRef.current

    // Setup xterm with Oracle's guidance for memory management
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      convertEol: false,
      scrollback: 1000, // Oracle's fix: limit scrollback to prevent unbounded memory growth
      allowTransparency: false,
      allowProposedApi: true,
      windowsMode: false,
      theme: {
        background: terminalTheme.background,
        foreground: terminalTheme.foreground,
        cursor: terminalTheme.cursor,
        cursorAccent: terminalTheme.cursorAccent,
        selectionBackground: terminalTheme.selectionBackground,
        black: terminalTheme.black,
        red: terminalTheme.red,
        green: terminalTheme.green,
        yellow: terminalTheme.yellow,
        blue: terminalTheme.blue,
        magenta: terminalTheme.magenta,
        cyan: terminalTheme.cyan,
        white: terminalTheme.white,
        brightBlack: terminalTheme.brightBlack,
        brightRed: terminalTheme.brightRed,
        brightGreen: terminalTheme.brightGreen,
        brightYellow: terminalTheme.brightYellow,
        brightBlue: terminalTheme.brightBlue,
        brightMagenta: terminalTheme.brightMagenta,
        brightCyan: terminalTheme.brightCyan,
        brightWhite: terminalTheme.brightWhite,
      },
      fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: 1.1,
      letterSpacing: 0, 
    })

    const fit = new FitAddon()
    
    // Use Canvas renderer to fix theme switching issues
    const loadBestRenderer = () => {
      const canvas = new CanvasAddon()
      term.loadAddon(canvas)
      rendererRef.current = canvas
      console.log('Using Canvas renderer')
    }

    const safeFit = () => {
      if (isCleanedUpRef.current) return
      if (!xtermOpenedRef.current) return
      if (!rendererReadyRef.current) return
      const el = termRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return
      
      // Additional renderer safety check before any fit operations
      const rows = el.querySelector('.xterm-rows') as HTMLElement | null
      const h = rows?.offsetHeight || 0
      const w = rows?.offsetWidth || 0
      if (h === 0 || w === 0) {
        console.log('[SimpleTerminal] Renderer dimensions not ready for fit:', w, 'x', h)
        return
      }
      
      try { 
        if ((term as any)?.element) {
          requestAnimationFrame(() => { 
            try { 
              if (isCleanedUpRef.current) return
              fit.fit() 
              // Mark first fit as done and potentially trigger PTY open
              if (!firstFitDoneRef.current) {
                firstFitDoneRef.current = true
                if (!ptyOpenedRef.current && rendererReadyRef.current) {
                  ptyOpenedRef.current = true
                  openPty().catch(error => console.error('Failed to open PTY after first fit:', error))
                }
              }
            } catch (error) {
              console.warn('[SimpleTerminal] Error during fit:', error)
            } 
          })
        }
      } catch {
        requestAnimationFrame(() => { 
          try { 
            if (!isCleanedUpRef.current && xtermOpenedRef.current && rendererReadyRef.current && (term as any)?.element) {
              fit.fit()
              if (!firstFitDoneRef.current) {
                firstFitDoneRef.current = true
                if (!ptyOpenedRef.current && rendererReadyRef.current) {
                  ptyOpenedRef.current = true
                  openPty().catch(error => console.error('Failed to open PTY after first fit:', error))
                }
              }
            }
          } catch (error) {
            console.warn('[SimpleTerminal] Error during fallback fit:', error)
          }
        })
      }
    }

    let unlistenPromise: Promise<() => void> | null = null

    // Open PTY session only after terminal is opened and renderer ready and first fit done
    const openPty = async () => {
      try {
        // Get actual terminal dimensions instead of hardcoded values
        const cols = xtermRef.current?.cols || 80
        const rows = xtermRef.current?.rows || 24
        await invoke('cmd_start_tui', {
          profile: kind, // Pass kind as profile for backward compatibility
          cwd,
          cols,
          rows,
          env,
        })
        isSessionOpenRef.current = true
        
        term.focus()
        onDataDisposeRef.current = term.onData((data) => {
          if (!isSessionOpenRef.current) return
          invoke('cmd_write_stdin', { sessionId: mySessionId, utf8Chunk: data }).catch(error => {
            console.warn('Ignored write before session ready:', error)
          })
        })
      } catch (error) {
        console.error('Failed to open PTY session:', error, 'Session ID:', mySessionId)
        // Show error in terminal with more detail
        term.write('\r\n\x1b[31mFailed to start terminal session:\x1b[0m\r\n')
        term.write(`Error: ${error}\r\n`)
        term.write(`Session ID: ${mySessionId}\r\n`)
        term.write(`Kind: ${kind}\r\n`)
        term.write(`CWD: ${cwd || 'default'}\r\n`)
        term.write('\r\nTerminal is ready but backend connection failed.\r\n')
      }
    }

    // IntersectionObserver-based mounting - Oracle's fix for proper height calculation
    const mountTerminal = (el: HTMLDivElement) => {
      if (isCleanedUpRef.current || xtermOpenedRef.current) return
      
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      
      try {
        term.open(el)
        xtermOpenedRef.current = true
        
        // Load fit addon after opening
        term.loadAddon(fit)
        fitRef.current = fit
        
        loadBestRenderer()
        
        // Set up throttled resize handling
        resizeCleanupRef.current = createSafeResizeObserver(el, throttledResize)
        
        // Initial fit and setup renderer readiness check
        safeFit()
        
        // Check renderer readiness after initial fit
        timeoutsRef.current.push(window.setTimeout(() => {
          try {
            const rows = el.querySelector('.xterm-rows') as HTMLElement | null
            const h = rows?.offsetHeight || 0
            const w = rows?.offsetWidth || 0
            rendererReadyRef.current = h > 0 && w > 0
            
            if (rendererReadyRef.current) {
              try { term.focus() } catch {}
              try { term.refresh(0, term.rows - 1) } catch {}
            }
          } catch {}
        }, 16))

        // Set up event listeners and data handling
        setupEventHandlers()
        
      } catch (error) {
        console.error('Failed to open xterm terminal:', error)
        return
      }
    }

    const setupEventHandlers = () => {
      // Now safe to subscribe and open PTY
      let gotFirstByte = false
      const flushBuffer = () => {
        if (!xtermOpenedRef.current || isCleanedUpRef.current) { writeBufRef.current = ''; flushScheduledRef.current = false; return }
        // Defer until renderer ready
        if (!rendererReadyRef.current) { flushScheduledRef.current = false; scheduleFlush(); return }
        // Skip flushing if terminal is not active
        if (!activeRef.current) { flushScheduledRef.current = false; return }
        flushScheduledRef.current = false
        const data = writeBufRef.current
        if (!data) return
        writeBufRef.current = ''
        try {
          xtermRef.current?.write(data)
        } catch {
          // Ignore write errors to disposed terminals
        }
      }
      const scheduleFlush = () => {
        if (flushScheduledRef.current) return
        flushScheduledRef.current = true
        const tick = () => {
          if (!rendererReadyRef.current) { requestAnimationFrame(tick); return }
          flushBuffer()
        }
        const throttle = reducedMotionRef.current || !activeRef.current || document.hidden
        if (throttle) {
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
          flushTimerRef.current = window.setTimeout(tick, 50)
        } else {
          requestAnimationFrame(tick)
        }
      }

      if (!subscribedRef.current) {
        subscribedRef.current = true
        unlistenPromise = listen('terminal://data', (e: any) => {
        if (isCleanedUpRef.current || !xtermOpenedRef.current) return

        const { id, chunk } = e.payload as { id: string; chunk: string }
        const match = id === mySessionId
        if (!match) return

        // If not active, buffer but don't flush to avoid rendering artifacts
        if (!activeRef.current) {
          writeBufRef.current += chunk
          if (writeBufRef.current.length > 1_000_000) {
            writeBufRef.current = writeBufRef.current.slice(-500_000)
          }
          return
        }

        if (!gotFirstByte && chunk && chunk.length > 0) {
          gotFirstByte = true
          throttledResize()
        }

        // Write raw PTY bytes directly; let xterm handle ANSI/OSC sequences.
        writeBufRef.current += chunk
        // Cap buffer to avoid runaway growth
        if (writeBufRef.current.length > 1_000_000) {
          writeBufRef.current = writeBufRef.current.slice(-500_000)
        }
        scheduleFlush()
        })
      }
    }

    // Set up IntersectionObserver for proper height calculation - Oracle's fix
    if (termRef.current && 'IntersectionObserver' in window) {
      intersectionObserverRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            const el = entry.target as HTMLDivElement
            const rect = el.getBoundingClientRect()
            // Only mount when element has proper dimensions
            if (rect.height > 0 && rect.width > 0) {
              mountTerminal(el)
              // Stop observing once mounted
              if (intersectionObserverRef.current) {
                intersectionObserverRef.current.disconnect()
                intersectionObserverRef.current = null
              }
            }
          }
        },
        { threshold: 0.1, rootMargin: '10px' }
      )
      intersectionObserverRef.current.observe(termRef.current)
    } else {
      // Fallback for browsers without IntersectionObserver
      if (termRef.current) {
        mountTerminal(termRef.current)
      }
    }

    // Detect prefers-reduced-motion and switch flush strategy accordingly
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      reducedMotionRef.current = !!mq.matches
      const handler = (e: MediaQueryListEvent) => { reducedMotionRef.current = !!e.matches }
      // @ts-ignore - Safari types
      mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler)
    } catch {}

    // Flush immediately when the document becomes visible again
    const onVisibility = () => {
      if (!document.hidden && xtermRef.current) {
        try { (fitRef.current as any)?.fit?.() } catch {}
        if (writeBufRef.current) {
          const data = writeBufRef.current
          writeBufRef.current = ''
          try { xtermRef.current.write(data) } catch {}
        }
        try { xtermRef.current.refresh(0, xtermRef.current.rows - 1) } catch {}
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    xtermRef.current = term

    // Keep xterm focused when user interacts with terminal
    termRef.current?.addEventListener('mousedown', () => setTimeout(() => xtermRef.current?.focus(), 0))

    return () => {
      // Mark as cleaned up to prevent further listener calls
      isCleanedUpRef.current = true
      
      // Cleanup IntersectionObserver
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect()
        intersectionObserverRef.current = null
      }
      
      // Cleanup throttled resize
      resizeCleanup()
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current()
        resizeCleanupRef.current = null
      }
      
      // Cancel scheduled timeouts
      if (flushTimerRef.current) { 
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null 
      }
      timeoutsRef.current.forEach(id => clearTimeout(id))
      timeoutsRef.current = []
      
      // Cleanup resources but preserve backend session for reuse
      isSessionOpenRef.current = false
      
      // Dispose xterm data handlers
      try { 
        if (onDataDisposeRef.current) {
          onDataDisposeRef.current.dispose()
          onDataDisposeRef.current = null
        }
      } catch (e) {
        console.error('Failed to dispose xterm data handler:', e)
      }
      
      // Clear write buffer
      writeBufRef.current = ''
      
      // Clean up listeners
      if (unlistenPromise) {
        unlistenPromise.then((u) => u()).catch(() => {})
      }
      document.removeEventListener('visibilitychange', onVisibility)
      
      // Dispose terminal
      try { 
        if (term) {
          term.dispose()
        }
      } catch (e) {
        console.error('Failed to dispose terminal:', e)
      }
      
      // Clear references
      xtermRef.current = null
      fitRef.current = null
    }
  }, [])

  // Disable theme switching to prevent corruption - terminal uses initial theme only

  return (
    <div 
      data-testid="simple-terminal"
      tabIndex={0} 
      className={`h-full w-full ${className}`} 
      ref={termRef}
      style={{ 
        width: '100%',
        height: '100%',
        backgroundColor: terminalTheme.background,
        position: 'relative',
        overflow: 'hidden',
      }}
      onFocus={() => xtermRef.current?.focus()}
      onMouseDown={() => xtermRef.current?.focus()}
    >
    </div>
  )
}
