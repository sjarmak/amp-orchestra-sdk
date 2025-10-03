/**
 * Terminal UI framework and integration for amp-orchestra
 * 
 * This package provides a Flutter-inspired TUI framework with:
 * - Widget-based architecture with stateful/stateless patterns
 * - Text selection and copy support
 * - Rich text rendering with ANSI support
 * - Autocomplete with command and file triggers
 * - Real-time message display
 * - Interactive confirmation dialogs
 * - Debug overlays and development tools
 * - Theme system with dark/light mode
 * - Keyboard shortcuts and navigation
 * - Terminal integration with progress bars and title updates
 */

// Core framework exports - TODO: Uncomment as implementations are added
// export * from './framework'
// export * from './widgets'
// export * from './lib'

// Main app runner
export { tuiUI } from './app'

// Amp CLI detection and management
export * from './amp-detection'

// Types and interfaces
export type {
  TuiDependencies,
  BashToolInvocation,
  ExecutingCommand
} from './app'
