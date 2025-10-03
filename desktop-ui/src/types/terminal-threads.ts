/**
 * Terminal Threading System Types - Phase A Data Models
 * 
 * Defines the core data structures for the multi-threaded terminal system.
 * Extends the existing Session model to support terminal thread management.
 */

import type { Session } from '../contexts/SessionManagerContext'
import type { TuiSession } from '../components/terminal/TerminalProvider'

// Re-export SessionEnvironment for convenience
export type SessionEnvironment = 'production' | 'development'

/**
 * Terminal thread metadata - persisted to localStorage
 */
export interface TerminalThreadMeta {
  /** Thread ID used as the primary key */
  threadId: string
  /** Human-readable thread name */
  name: string
  /** Environment context (production/development) */
  environment: SessionEnvironment
  /** Whether this is the default thread for the environment */
  isDefault: boolean
  /** Creation timestamp */
  createdAt: number
  /** Last access timestamp */
  lastActiveAt: number
  /** Terminal profiles associated with this thread */
  profiles: string[]
}

/**
 * Runtime terminal session data - not persisted, created on demand
 */
export interface TerminalRuntime {
  /** Thread metadata */
  meta: TerminalThreadMeta
  /** Map of profile -> TuiSession for this thread */
  sessions: Map<string, TuiSession>
  /** Last activity timestamp for lifecycle management */
  lastActivity: number
  /** PTY spawning status to support lazy loading */
  status: 'idle' | 'initializing' | 'ready' | 'error'
}

/**
 * Extended WorkSession type that includes terminal threads
 * This extends the existing Session interface
 */
export interface WorkSession extends Session {
  /** Terminal threads associated with this work session */
  terminalThreads: TerminalThreadMeta[]
  /** Active terminal thread ID */
  activeTerminalThreadId?: string
}

/**
 * Terminal thread configuration for creation
 */
export interface CreateTerminalThreadConfig {
  /** Thread name */
  name: string
  /** Environment context */
  environment: SessionEnvironment
  /** Initial profiles to create (defaults to ['dev', 'prod'] based on environment) */
  profiles?: string[]
  /** Whether to make this the default thread for the environment */
  makeDefault?: boolean
}

/**
 * Terminal handle for accessing specific thread/profile combinations
 * Follows the existing session ID pattern: ${threadId}-${profile}_default
 */
export interface TerminalHandle {
  /** Thread ID */
  threadId: string
  /** Profile name */
  profile: string
  /** Generated session ID for backend compatibility */
  sessionId: string
  /** Runtime session data (lazy-loaded) */
  session?: TuiSession
}

/**
 * Terminal lifecycle events for monitoring and debugging
 */
export type TerminalLifecycleEvent = 
  | { type: 'thread_created'; threadId: string; name: string; environment: SessionEnvironment }
  | { type: 'thread_closed'; threadId: string }
  | { type: 'session_spawned'; threadId: string; profile: string; sessionId: string }
  | { type: 'session_terminated'; threadId: string; profile: string; sessionId: string }
  | { type: 'handle_requested'; threadId: string; profile: string }
