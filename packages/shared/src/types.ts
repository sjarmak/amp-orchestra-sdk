/**
 * Shared TypeScript types and interfaces
 */

// Basic types
export type ID = string
export type Timestamp = number

// Thread and message types
export interface Thread {
  id: ID
  title?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Message {
  id: ID
  threadId: ID
  content: string
  role: 'user' | 'assistant'
  timestamp: Timestamp
}

// Configuration types
export interface Config {
  [key: string]: unknown
}

// Event types
export interface AppEvent {
  type: string
  data?: unknown
  timestamp: Timestamp
}
