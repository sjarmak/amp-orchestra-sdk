/**
 * Throttled Resize Hook - Prevents ResizeObserver ping-pong effects
 * 
 * This hook provides optimized resize handling that prevents the 990ms long tasks
 * caused by ResizeObserver ping-pong effects and excessive fit() calls during rapid
 * resize events.
 */

import { useCallback, useRef, useEffect } from 'react'
import type { Terminal } from 'xterm'
import type { FitAddon } from 'xterm-addon-fit'

interface UseThrottledResizeOptions {
  terminal?: Terminal
  fitAddon?: FitAddon
  onDimensionChange?: (cols: number, rows: number) => void
  throttleMs?: number
}

interface ThrottledResizeState {
  isThrottling: boolean
  pendingResize: boolean
  lastCols: number
  lastRows: number
  rafId: number | null
  timeoutId: number | null
}

/**
 * Custom hook for throttled terminal resize handling
 * 
 * Features:
 * - Uses requestAnimationFrame for smooth resize operations
 * - Tracks actual dimension changes to avoid unnecessary work
 * - Prevents ResizeObserver ping-pong with intelligent throttling
 * - Properly cleans up all resources on unmount
 * 
 * @param options Configuration object
 * @returns Resize handler function and cleanup function
 */
export function useThrottledResize({
  terminal,
  fitAddon,
  onDimensionChange,
  throttleMs = 100
}: UseThrottledResizeOptions) {
  const stateRef = useRef<ThrottledResizeState>({
    isThrottling: false,
    pendingResize: false,
    lastCols: 0,
    lastRows: 0,
    rafId: null,
    timeoutId: null
  })

  // Cleanup function to prevent leaks
  const cleanup = useCallback(() => {
    const state = stateRef.current
    
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId)
      state.rafId = null
    }
    
    if (state.timeoutId !== null) {
      clearTimeout(state.timeoutId)
      state.timeoutId = null
    }
    
    state.isThrottling = false
    state.pendingResize = false
  }, [])

  // Actual resize implementation
  const performResize = useCallback(() => {
    if (!terminal || !fitAddon) {
      return
    }

    const state = stateRef.current
    
    try {
      // Use requestAnimationFrame for smooth fit operations
      state.rafId = requestAnimationFrame(() => {
        state.rafId = null
        
        // Check if component is still mounted and terminal is valid
        if (!terminal.element) {
          return
        }
        
        fitAddon.fit()
        
        // Only trigger dimension change callback if dimensions actually changed
        const newCols = terminal.cols
        const newRows = terminal.rows
        
        if (newCols !== state.lastCols || newRows !== state.lastRows) {
          console.log('[ThrottledResize] Dimensions changed:', { 
            from: `${state.lastCols}x${state.lastRows}`, 
            to: `${newCols}x${newRows}` 
          })
          
          state.lastCols = newCols
          state.lastRows = newRows
          
          if (onDimensionChange) {
            onDimensionChange(newCols, newRows)
          }
        }
        
        // Reset throttling state
        state.isThrottling = false
        
        // If there was a pending resize during throttling, process it
        if (state.pendingResize) {
          state.pendingResize = false
          scheduleResize()
        }
      })
    } catch (error) {
      console.error('[ThrottledResize] Error during resize:', error)
      state.isThrottling = false
      state.pendingResize = false
    }
  }, [terminal, fitAddon, onDimensionChange])

  // Schedule a resize with throttling
  const scheduleResize = useCallback(() => {
    const state = stateRef.current
    
    if (state.isThrottling) {
      // Mark that we need to resize once throttling is complete
      state.pendingResize = true
      return
    }
    
    state.isThrottling = true
    state.pendingResize = false
    
    // Clear any existing timeout
    if (state.timeoutId !== null) {
      clearTimeout(state.timeoutId)
    }
    
    // Throttle the resize operation
    state.timeoutId = window.setTimeout(() => {
      state.timeoutId = null
      performResize()
    }, throttleMs)
  }, [performResize, throttleMs])

  // Public resize handler
  const handleResize = useCallback(() => {
    scheduleResize()
  }, [scheduleResize])

  // Initialize dimension tracking
  useEffect(() => {
    if (terminal) {
      const state = stateRef.current
      state.lastCols = terminal.cols || 0
      state.lastRows = terminal.rows || 0
    }
  }, [terminal])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    handleResize,
    cleanup,
    isThrottling: () => stateRef.current.isThrottling
  }
}

/**
 * Create a ResizeObserver with proper error handling and cleanup
 * 
 * @param element Element to observe
 * @param callback Resize callback
 * @returns Cleanup function
 */
export function createSafeResizeObserver(
  element: HTMLElement | null,
  callback: () => void
): (() => void) | null {
  if (!element || !('ResizeObserver' in window)) {
    return null
  }

  let observer: ResizeObserver | null = null
  
  try {
    observer = new ResizeObserver(callback)
    observer.observe(element)
    console.log('[SafeResizeObserver] Created and observing element')
    
    return () => {
      if (observer) {
        try {
          observer.disconnect()
          console.log('[SafeResizeObserver] Disconnected successfully')
        } catch (error) {
          console.error('[SafeResizeObserver] Error disconnecting:', error)
        } finally {
          observer = null
        }
      }
    }
  } catch (error) {
    console.error('[SafeResizeObserver] Failed to create observer:', error)
    return null
  }
}
