/**
 * M1.7 TUI Integration Component
 * 
 * Main integration component that combines all M1.7 terminal features:
 * - TerminalProvider for session management
 * - Chat/Terminal toggle functionality  
 * - ExecutionProfileSelector with proper gating
 * - TerminalView with PTY integration
 * - Connection to existing Chat component
 */

import { useState, useCallback } from 'react'
// TerminalProvider now provided at App level
// import ChatTerminalToggle, { ViewMode } from './ChatTerminalToggle' // DEPRECATED: Removed in Phase 0
import Chat from '../Chat/Chat' // Existing chat component
import ThreadsChat from '../Chat/ThreadsChat' // New threads-based chat component
import { useAppConfig } from '../../hooks/useAppConfig'
// import { TerminalTabsNew } from './TerminalTabsNew' // DEPRECATED: Removed in Phase 0
import { TerminalEnvironmentSwitcher } from './TerminalEnvironmentSwitcher'
import { AmpProfileKind } from './TerminalSessionProvider'
import SimpleTerminal from './SimpleTerminal'

// Local type definition since we removed ChatTerminalToggle
export type ViewMode = 'chat' | 'terminal'

interface TuiIntegrationProps {
  className?: string
}

/**
 * Complete M1.7 TUI Integration
 * 
 * Features:
 * - Seamless Chat/Terminal switching with state preservation
 * - Execution profile management with environment gating
 * - PTY-based terminal sessions with proper lifecycle
 * - Integration with existing app configuration
 * - Metrics collection for session usage
 * - Clean session cleanup and error handling
 */
export function TuiIntegration({ className = '' }: TuiIntegrationProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [activeEnvironment, setActiveEnvironment] = useState<AmpProfileKind>('prod')
  
  // Feature flag for new session/thread architecture
  const useThreadsArchitecture = process.env.NODE_ENV === 'development' || 
                                localStorage.getItem('amp_threads_architecture') === 'true'
  
  // Get app configuration to determine environment kind
  const { config: appConfig, loading: configLoading } = useAppConfig()
  
  // Determine environment kind for profile gating - simplified for Phase 0
  const connectionMode = appConfig?.connection_mode
  const envKind = connectionMode === 'local-cli' ? 'local' : 'production'
  
  // Handle view mode changes
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    console.log('[TuiIntegration] Switching to mode:', mode)
    setViewMode(mode)
    
    // Collect metrics for mode switching
    if (typeof window !== 'undefined' && (window as any).plausible) {
      (window as any).plausible('TUI Mode Switch', {
        props: {
          mode,
          environment: activeEnvironment,
          env_kind: envKind
        }
      })
    }
  }, [activeEnvironment, envKind])
  
  // Phase 0 simplification: No session management needed

  // Handle environment changes - simplified for Phase 0
  const handleEnvironmentChange = useCallback((environment: AmpProfileKind) => {
    console.log('[TuiIntegration] Switching to environment:', environment)
    setActiveEnvironment(environment)
    // Users must explicitly create sessions via the "New" button
    
    // Collect metrics for environment changes
    if (typeof window !== 'undefined' && (window as any).plausible) {
      (window as any).plausible('TUI Environment Switch', {
        props: {
          environment,
          env_kind: envKind
        }
      })
    }
  }, [envKind])

  // Phase 0 simplification: No terminal status tracking needed

  // Render terminal content with session management
  const terminalContent = (
    <div className="flex flex-col h-full">
      {/* Environment Switcher */}
      <div className="flex-shrink-0 p-3 border-b border-border bg-muted/10 flex justify-center">
        <TerminalEnvironmentSwitcher
          activeEnvironment={activeEnvironment}
          onSwitch={handleEnvironmentChange}
          disabled={false}
          envKind={envKind}
        />
      </div>
      
      {/* Environment indicator - Phase 0 simplification */}
      <div className="flex-shrink-0 px-3 py-2 bg-muted/10 border-b border-border">
        <span className="text-sm text-muted-foreground">
          {activeEnvironment === 'dev' ? 'Development' : 'Production'} Terminal
        </span>
      </div>
      
      {/* Single Terminal - Phase 0 simplification */}
      <div className="flex-1 min-h-0">
        <SimpleTerminal
          kind="terminal"
          className="w-full h-full"
          active={true}
        />
      </div>
    </div>
  )
  
  // Render chat content
  const renderChatContent = () => {
    return (
      <div className="h-full">
        {useThreadsArchitecture ? <ThreadsChat /> : <Chat />}
      </div>
    )
  }
  
  // Show loading state while config is loading
  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    )
  }
  
  return (
    <div className={`tui-integration flex-1 min-h-0 flex flex-col ${className}`}>
      {/* Simple view mode toggle - Phase 0 simplification */}
      <div className="flex border-b border-border bg-background">
        <button
          onClick={() => handleViewModeChange('chat')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === 'chat'
              ? 'text-foreground border-b-2 border-primary bg-background'
              : 'text-muted-foreground bg-muted/20 hover:text-foreground'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => handleViewModeChange('terminal')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === 'terminal'
              ? 'text-foreground border-b-2 border-primary bg-background'
              : 'text-muted-foreground bg-muted/20 hover:text-foreground'
          }`}
        >
          Terminal
        </button>
      </div>
      
      {/* Content area */}
      <div className="flex-1 min-h-0">
        {viewMode === 'chat' ? renderChatContent() : terminalContent}
      </div>
    </div>
  )
}

export default TuiIntegration
