/**
 * Amp Session Management - Core session abstraction for dual TUI sessions
 * 
 * This module implements the core session management functionality that enables
 * running multiple Amp instances (production/development) simultaneously with
 * proper environment isolation and process management.
 */

import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebglAddon } from 'xterm-addon-webgl'
import { CanvasAddon } from 'xterm-addon-canvas'
import { BehaviorSubject } from 'rxjs'
import { invoke } from '@tauri-apps/api/core'
import type { AmpProfile } from '../../hooks/useProfileManager'

export type SessionMode = 'production' | 'development'
export type SessionStatus = 'detecting' | 'spawning' | 'running' | 'auth' | 'error' | 'dead'

export interface AmpSession {
  id: string
  mode: SessionMode
  profile: AmpProfile
  term: Terminal
  fit: FitAddon
  renderer: WebglAddon | CanvasAddon | null
  processId: string | null
  status: BehaviorSubject<SessionStatus>
  
  // Lifecycle methods
  spawn(): Promise<void>
  kill(): Promise<void>
  restart(): Promise<void>
  dispose(): void
  
  // Status helpers
  isRunning(): boolean
  needsAuth(): boolean
  
  // Performance helpers
  writeBuffered(data: string): void
  flushBuffer(): void
}

export interface SessionEnvironment {
  AMP_BIN?: string
  AMP_CLI_PATH?: string
  AMP_URL?: string
  NODE_TLS_REJECT_UNAUTHORIZED?: string
  AMP_TOKEN?: string
  AMP_API_KEY?: string
  AMP_REFRESH_TOKEN?: string
  [key: string]: string | undefined
}

/**
 * Build environment variables for a session based on profile configuration
 */
export async function buildSessionEnvironment(profile: AmpProfile): Promise<SessionEnvironment> {
  console.log('[buildSessionEnvironment] Building environment for profile:', {
    id: profile.id,
    name: profile.name,
    connection_type: profile.connection_type,
    api_url: profile.api_url,
    cli_path: profile.cli_path,
    tls_enabled: profile.tls_enabled
  })
  
  // Use Tauri's environment access instead of process.env for browser compatibility
  const env: SessionEnvironment = {}
  
  // Configure based on connection type
  switch (profile.connection_type) {
    case 'production':
      console.log('[buildSessionEnvironment] Using production configuration')
      env.AMP_BIN = 'amp'
      env.AMP_URL = 'https://ampcode.com/'
      delete env.AMP_CLI_PATH
      delete env.NODE_TLS_REJECT_UNAUTHORIZED
      break
      
    case 'local-server':
      console.log('[buildSessionEnvironment] Using local-server configuration')
      delete env.AMP_BIN
      delete env.AMP_CLI_PATH
      env.AMP_URL = profile.api_url || 'https://localhost:7002'
      env.NODE_TLS_REJECT_UNAUTHORIZED = profile.tls_enabled === false ? '0' : '1'
      console.log('[buildSessionEnvironment] Set AMP_URL to:', env.AMP_URL)
      console.log('[buildSessionEnvironment] Set NODE_TLS_REJECT_UNAUTHORIZED to:', env.NODE_TLS_REJECT_UNAUTHORIZED)
      break
      
    case 'local-cli':
      console.log('[buildSessionEnvironment] Using local-cli configuration')
      delete env.AMP_BIN
      env.AMP_CLI_PATH = profile.cli_path
      console.log('[buildSessionEnvironment] Set AMP_CLI_PATH to:', env.AMP_CLI_PATH)
      if (profile.api_url) {
        env.AMP_URL = profile.api_url
        console.log('[buildSessionEnvironment] Set AMP_URL to:', env.AMP_URL)
      }
      if (profile.tls_enabled === false) {
        env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        console.log('[buildSessionEnvironment] Set NODE_TLS_REJECT_UNAUTHORIZED to 0')
      }
      break
  }
  
  // Add authentication tokens if available
  if (profile.token) {
    env.AMP_TOKEN = profile.token
    console.log('[buildSessionEnvironment] Added AMP_TOKEN (length:', profile.token.length, ')')
  }
  
  // Try to get AMP_API_KEY from shell environment
  if (!env.AMP_API_KEY) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const apiKey = await invoke<string | null>('get_shell_env_var', { var_name: 'AMP_API_KEY' })
      if (apiKey) {
        env.AMP_API_KEY = apiKey
        console.log('[buildSessionEnvironment] Found AMP_API_KEY from shell config')
      } else {
        console.log('[buildSessionEnvironment] No AMP_API_KEY found in shell config')
      }
    } catch (e) {
      console.log('[buildSessionEnvironment] Failed to read shell environment:', e)
    }
  }
  
  console.log('[buildSessionEnvironment] Final environment variables:', Object.keys(env))
  console.log('[buildSessionEnvironment] Environment values:', Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key, 
      key === 'AMP_TOKEN' ? `[REDACTED:${value?.length || 0}]` : 
      key === 'AMP_API_KEY' ? `[API_KEY:${value?.substring(0, 10)}...${value?.length}]` : value
    ])
  ))
  
  return env
}

/**
 * Session implementation that manages a single Amp TUI process
 */
export class AmpSessionImpl implements AmpSession {
  public id: string
  public mode: SessionMode
  public profile: AmpProfile
  public term: Terminal
  public fit: FitAddon
  public renderer: WebglAddon | CanvasAddon | null = null
  public processId: string | null = null
  public status: BehaviorSubject<SessionStatus>
  
  private environment: SessionEnvironment
  private writeBuffer: string = ''
  private writeTimeoutId: number | null = null
  private readonly WRITE_DEBOUNCE_MS = 16 // Target 60fps
  private spawnTimeoutId: number | null = null
  private readonly SPAWN_TIMEOUT_MS = 10000 // 10 second timeout
  
  static async create(profile: AmpProfile): Promise<AmpSession> {
    const environment = await buildSessionEnvironment(profile)
    return new AmpSessionImpl(profile, environment)
  }
  
  private constructor(profile: AmpProfile, environment: SessionEnvironment) {
    this.id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.mode = this.profileToMode(profile)
    this.profile = profile
    this.environment = environment
    this.status = new BehaviorSubject<SessionStatus>('detecting')
    
    // Initialize xterm components with memory-safe configuration
    this.term = new Terminal({
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      // Limit scroll buffer to prevent unbounded memory growth
      scrollback: 1000,
      theme: {
        background: '#0a0a0a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      cursorBlink: true,
      allowTransparency: true,
      allowProposedApi: true
    })
    
    this.fit = new FitAddon()
    this.term.loadAddon(this.fit)
    
    // Load performance addons (try WebGL first, fallback to Canvas)
    this.initializeRenderer()
    
    // Set up input handling
    this.term.onData((data) => {
      this.handleInput(data)
    })
  }
  
  private profileToMode(profile: AmpProfile): SessionMode {
    return profile.connection_type === 'production' ? 'production' : 'development'
  }
  
  /**
   * Initialize high-performance rendering addon
   * Try WebGL first (fastest), fallback to Canvas (still faster than DOM)
   */
  private initializeRenderer(): void {
    try {
      // Try WebGL first for best performance
      this.renderer = new WebglAddon()
      this.term.loadAddon(this.renderer)
      console.log(`[Session ${this.id}] Loaded WebGL renderer for ~3x faster scrolling`)
    } catch (webglError) {
      console.warn(`[Session ${this.id}] WebGL not available, trying Canvas:`, webglError)
      
      try {
        // Fallback to Canvas renderer
        this.renderer = new CanvasAddon()
        this.term.loadAddon(this.renderer)
        console.log(`[Session ${this.id}] Loaded Canvas renderer for improved performance`)
      } catch (canvasError) {
        console.warn(`[Session ${this.id}] Canvas not available, using default DOM renderer:`, canvasError)
        this.renderer = null
      }
    }
    
    // Defer renderer initialization until terminal is attached to DOM
    if (this.renderer) {
      // Wait for next tick to ensure DOM is ready
      setTimeout(() => {
        try {
          if (this.renderer && this.term.element) {
            // Check if terminal container has valid dimensions
            const container = this.term.element.parentElement
            if (container) {
              const rect = container.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                // Validate renderer dimensions before fitting
                const rows = container.querySelector('.xterm-rows') as HTMLElement | null
                const h = rows?.offsetHeight || 0
                const w = rows?.offsetWidth || 0
                
                if (h > 0 && w > 0) {
                  // Force renderer to initialize properly
                  this.fit.fit()
                } else {
                  console.log(`[Session ${this.id}] Renderer not ready yet (${w}x${h}), retrying...`)
                  // Retry after a short delay
                  setTimeout(() => {
                    if (this.renderer && this.term.element) {
                      try {
                        this.fit.fit()
                      } catch (retryError) {
                        console.warn(`[Session ${this.id}] Retry failed:`, retryError)
                        this.renderer = null
                      }
                    }
                  }, 100)
                }
              }
            }
          }
        } catch (error) {
          console.warn(`[Session ${this.id}] Failed to initialize renderer:`, error)
          // Fallback: remove renderer and use DOM rendering
          this.renderer = null
        }
      }, 0)
    }
  }
  
  private async handleInput(data: string) {
    if (this.processId) {
      try {
        await invoke('process_input', {
          processId: this.processId,
          data: data
        })
      } catch (error) {
        console.error('Failed to send input to process:', error)
      }
    }
  }
  
  /**
   * Spawn the Amp process for this session
   */
  async spawn(): Promise<void> {
    if (this.processId) {
      console.warn('Process already running for session:', this.id)
      return
    }
    
    this.status.next('spawning')
    
    // Set up timeout to prevent getting stuck in spawning state
    this.spawnTimeoutId = window.setTimeout(() => {
      if (this.status.value === 'spawning') {
        console.warn('[Session] Spawn timeout reached, marking as error')
        this.status.next('error')
      }
    }, this.SPAWN_TIMEOUT_MS)
    
    // Remove undefined values from environment
    const cleanEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(this.environment)) {
      if (value !== undefined) {
        cleanEnv[key] = value
      }
    }
    
    // Determine command based on profile type
    let command: string
    let args: string[] = []
    
    if (this.profile.connection_type === 'production') {
      command = 'amp'
    } else if (this.profile.connection_type === 'local-cli' && this.profile.cli_path) {
      command = 'node'
      args = [this.profile.cli_path]
    } else {
      command = 'amp' // fallback
    }
    
    try {
      
      console.log('[Session] Invoking spawn_amp_process with:', {
        command,
        args,
        envKeys: Object.keys(cleanEnv),
        sessionId: this.id
      })
      
      // Spawn the process via Tauri
      this.processId = await invoke<string>('spawn_amp_process', {
        command,
        args,
        env: cleanEnv,
        sessionId: this.id
      })
      
      console.log('[Session] Successfully spawned process with ID:', this.processId)
      
      // Clear spawn timeout since we succeeded
      if (this.spawnTimeoutId) {
        clearTimeout(this.spawnTimeoutId)
        this.spawnTimeoutId = null
      }
      
      this.status.next('running')
      
      // Set up process event listeners (these come through Tauri events)
      // The actual process I/O handling is done in the Tauri backend
      
    } catch (error) {
      console.error('[Session] Failed to spawn Amp process:', {
        error: error,
        command,
        args,
        envKeys: Object.keys(cleanEnv),
        sessionId: this.id
      })
      
      // Clear spawn timeout on error
      if (this.spawnTimeoutId) {
        clearTimeout(this.spawnTimeoutId)
        this.spawnTimeoutId = null
      }
      
      this.status.next('error')
      throw error
    }
  }
  
  /**
   * Kill the Amp process for this session
   */
  async kill(): Promise<void> {
    if (!this.processId) {
      return
    }
    
    try {
      await invoke('kill_process', { processId: this.processId })
      this.processId = null
      this.status.next('dead')
    } catch (error) {
      console.error('Failed to kill process:', error)
      this.status.next('error')
      throw error
    }
  }
  
  /**
   * Restart the session by killing and respawning
   */
  async restart(): Promise<void> {
    await this.kill()
    await new Promise(resolve => setTimeout(resolve, 1000)) // Brief delay
    await this.spawn()
  }
  
  /**
   * Check if the session is currently running
   */
  isRunning(): boolean {
    return this.status.value === 'running'
  }
  
  /**
   * Check if the session needs authentication
   */
  needsAuth(): boolean {
    return this.status.value === 'auth'
  }
  
  /**
   * Buffer terminal writes to prevent render-thrashing from rapid output
   * This targets 60fps (16ms debounce) to maintain smooth performance
   */
  writeBuffered(data: string): void {
    this.writeBuffer += data
    
    if (this.writeTimeoutId !== null) {
      clearTimeout(this.writeTimeoutId)
    }
    
    this.writeTimeoutId = window.setTimeout(() => {
      this.flushBuffer()
    }, this.WRITE_DEBOUNCE_MS)
  }
  
  /**
   * Flush accumulated writes to the terminal
   */
  flushBuffer(): void {
    if (this.writeBuffer.length > 0) {
      this.term.write(this.writeBuffer)
      this.writeBuffer = ''
    }
    this.writeTimeoutId = null
  }
  
  /**
   * Clean up resources when session is destroyed
   */
  dispose(): void {
    console.log(`[Session ${this.id}] Disposing session resources`)
    
    // Flush any pending writes
    if (this.writeTimeoutId !== null) {
      clearTimeout(this.writeTimeoutId)
      this.writeTimeoutId = null
      this.flushBuffer()
    }
    
    // Clear spawn timeout
    if (this.spawnTimeoutId !== null) {
      clearTimeout(this.spawnTimeoutId)
      this.spawnTimeoutId = null
    }
    
    // Kill process if still running
    if (this.processId) {
      this.kill().catch(error => 
        console.error(`[Session ${this.id}] Error killing process during disposal:`, error)
      )
    }
    
    // Dispose renderer addon first to prevent WebGL context leaks
    if (this.renderer) {
      try {
        this.renderer.dispose()
        console.log(`[Session ${this.id}] Renderer addon disposed`)
      } catch (error) {
        console.error(`[Session ${this.id}] Error disposing renderer:`, error)
      }
      this.renderer = null
    }
    
    // Dispose fit addon
    try {
      this.fit.dispose()
      console.log(`[Session ${this.id}] Fit addon disposed`)
    } catch (error) {
      console.error(`[Session ${this.id}] Error disposing fit addon:`, error)
    }
    
    // Complete and dispose terminal
    try {
      this.term.dispose()
      console.log(`[Session ${this.id}] Terminal disposed`)
    } catch (error) {
      console.error(`[Session ${this.id}] Error disposing terminal:`, error)
    }
    
    // Complete the BehaviorSubject to prevent further emissions
    try {
      this.status.complete()
      console.log(`[Session ${this.id}] Status BehaviorSubject completed`)
    } catch (error) {
      console.error(`[Session ${this.id}] Error completing status subject:`, error)
    }
    
    // Clear buffer to free memory
    this.writeBuffer = ''
    
    console.log(`[Session ${this.id}] Session disposal complete`)
  }
}

/**
 * Factory function to create a new session from a profile
 */
export async function createAmpSession(profile: AmpProfile): Promise<AmpSession> {
  return await AmpSessionImpl.create(profile)
}

/**
 * Utility to get session mode from profile
 */
export function getSessionModeFromProfile(profile: AmpProfile): SessionMode {
  return profile.connection_type === 'production' ? 'production' : 'development'
}
