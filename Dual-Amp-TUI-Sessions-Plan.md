# Dual Amp TUI Sessions - Implementation Plan

## Overview

This plan outlines the implementation of dual Amp TUI (Terminal User Interface) sessions to allow users to run both production and development Amp instances simultaneously and seamlessly switch between them without process interruption.

## Current State Analysis

### Existing Implementation
The current `TuiTerminal` component serves dual roles:
1. **Session Manager**: Detects Amp, spawns processes, manages environment, handles cleanup
2. **Terminal View**: Mounts xterm instance and manages I/O

### Current Limitations
- **Single Instance**: Only supports one active installation at a time
- **Process Restart**: Switching between prod/dev modes kills and respawns the process
- **Environment Conflicts**: Cannot handle contradictory environment variables for coexisting processes
- **State Loss**: Process state is lost when switching modes

### Current Architecture
```
TuiTerminal Component
├── Process Management (lines 198-327, 351-358)
├── xterm Integration
├── Environment Detection
└── UI Rendering
```

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────┐
│    TerminalManagerContext       │  React Context (Singleton)
│  • sessions: Map<mode, Session> │
│  • createSession(mode)          │
│  • getSession(mode)             │
│  • killSession(mode)            │
└─────────────┬───────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────────────────┐  │  (Future: Split panes, etc.)
│ TerminalTabSwitcher│  │
└───┬────────────────┘  │
    │                   │
┌───▼──────────┐    ┌───▼──────────┐
│ TerminalView │    │ TerminalView │  (prop: mode)
│ (Production) │    │ (Development)│
└──────────────┘    └──────────────┘
```

### Session Abstraction

#### AmpSession Interface
```typescript
export interface AmpSession {
  mode: 'production' | 'dev'
  installation: AmpInstallation
  term: Terminal              // xterm instance
  fit: FitAddon
  proc: ChildProcess
  status: BehaviorSubject<'detecting'|'spawning'|'running'|'auth'|'error'|'dead'>
  kill(): void
}
```

#### Session Lifecycle
- **Creation**: Lazy initialization on first access or explicit "Start" button
- **Persistence**: Sessions run independently in background when not visible
- **Cleanup**: Individual session termination without affecting other sessions
- **Environment Isolation**: Dedicated environment variables per session

### Component Hierarchy

#### TerminalManagerContext
- Global session state management
- Session lifecycle operations
- Hook-based API for components

#### TerminalTabSwitcher
- UI container with tab navigation
- Session visibility management
- ShadCN tabs implementation

#### TerminalView
- Lightweight rendering component
- Attaches to existing xterm instances
- No process ownership or lifecycle management

## Implementation Details

### 1. Session Management (`terminal/session.ts`)

#### Environment Variable Isolation
```typescript
function buildSessionEnvironment(installation: AmpInstallation, mode: 'production' | 'dev') {
  const env = {
    ...process.env,  // Inherit base environment
    AMP_BIN: installation.type === 'production' ? installation.path : undefined,
    AMP_CLI_PATH: installation.type === 'dev' ? installation.path : undefined,
    AMP_URL: installation.type === 'dev' ? 'https://localhost:7002' : undefined,
    NODE_TLS_REJECT_UNAUTHORIZED: installation.type === 'dev' ? '0' : undefined,
  }
  
  // Remove undefined values
  return Object.fromEntries(Object.entries(env).filter(([_, v]) => v !== undefined))
}
```

#### Process Spawning
- Dedicated environment per session
- Proper cleanup on session termination
- Status monitoring and error handling

### 2. Context Provider

```typescript
export function useAmpSession(mode: 'production' | 'dev') {
  const ctx = useContext(TerminalManagerContext)
  return {
    session: ctx.sessions.get(mode),
    start: () => ctx.createSession(mode),
    kill: () => ctx.killSession(mode),
    status: ctx.getStatus(mode)
  }
}
```

### 3. TerminalView Component

```typescript
function TerminalView({ mode }: { mode: 'production' | 'dev' }) {
  const { session, start } = useAmpSession(mode)
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!session) {
      start()
    } else if (containerRef.current) {
      session.term.open(containerRef.current)
      session.fit.fit()
    }
  }, [session, start])
  
  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
    />
  )
}
```

### 4. Tab Switcher UI

```typescript
export function TerminalTabSwitcher() {
  return (
    <Tabs defaultValue="production" className="w-full h-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="production">
          <Terminal className="w-4 h-4 mr-2" />
          Production
        </TabsTrigger>
        <TabsTrigger value="dev">
          <Code className="w-4 h-4 mr-2" />
          Development
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="production" className="h-full">
        <TerminalView mode="production" />
      </TabsContent>
      
      <TabsContent value="dev" className="h-full">
        <TerminalView mode="dev" />
      </TabsContent>
    </Tabs>
  )
}
```

### 5. Tauri Backend Updates

#### Command Interface
```rust
#[tauri::command]
async fn spawn_amp_process(
    path: String,
    args: Vec<String>,
    env: HashMap<String, String>
) -> Result<ProcessId, String> {
    // Implementation with environment override support
}
```

## Migration Strategy

### Phase 1: Foundation
1. **Extract Session Logic**: Move process management from `TuiTerminal.tsx` to `session.ts`
2. **Create Context**: Implement `TerminalManagerContext` with session map
3. **Session Abstraction**: Define `AmpSession` interface and lifecycle methods

### Phase 2: Component Refactoring  
1. **TerminalView**: Create lightweight rendering component
2. **Tab Switcher**: Implement UI with ShadCN tabs
3. **Integration**: Replace existing `TuiTerminal` usage

### Phase 3: Backend Updates
1. **Environment Support**: Update Tauri commands to accept env overrides
2. **Process Isolation**: Ensure proper process separation
3. **Error Handling**: Implement robust error recovery

### Phase 4: Testing & Polish
1. **QA Matrix**: Test all session combinations and edge cases
2. **Documentation**: Update AGENTS.md and README
3. **Performance**: Optimize memory usage and process handling

## Quality Assurance

### Test Scenarios
- **Dual Login**: Authenticate both production and development sessions
- **Background Processing**: Ensure output continues when tabs are hidden
- **Session Isolation**: Kill one session without affecting the other
- **Environment Conflicts**: Verify environment variable separation
- **Memory Usage**: Monitor resource consumption with dual sessions
- **Theme Switching**: Test theme consistency across both sessions
- **Window Resize**: Verify terminal resizing works correctly

### Performance Considerations
- **Memory**: Each xterm + fit addon ≈ 2-3 MB (acceptable overhead)
- **CPU**: Background process output has minimal impact
- **Cleanup**: Proper disposal of listeners and resources

## File Structure Changes

```
desktop-ui/src/components/terminal/
├── session.ts                    # New: Session abstraction
├── TerminalManagerContext.tsx    # New: Global session management
├── TerminalView.tsx             # New: Lightweight renderer
├── TerminalTabSwitcher.tsx      # New: Tab-based UI
└── TuiTerminal.tsx             # Modified: Legacy compatibility
```

## Configuration

### Environment Variables

#### Production Mode
```bash
export AMP_BIN=amp
unset AMP_CLI_PATH
unset AMP_URL
```

#### Development Mode  
```bash
export AMP_CLI_PATH=~/amp/cli/dist/main.js
export AMP_URL=https://localhost:7002
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Benefits

### User Experience
- **No Process Interruption**: Switch between modes instantly
- **Persistent State**: Command history and session state maintained
- **Parallel Development**: Work with both environments simultaneously
- **Visual Clarity**: Clear indication of which environment is active

### Developer Experience
- **Clean Architecture**: Separation of concerns between UI and process management
- **Extensibility**: Easy to add new session types or UI layouts
- **Maintainability**: Isolated session logic simplifies debugging
- **Performance**: Efficient resource usage with proper cleanup

## Risk Mitigation

### Backwards Compatibility
- Maintain existing `TuiTerminal` component during transition
- Gradual migration path with feature flags
- Fallback mechanisms for edge cases

### Resource Management
- Proper cleanup on application exit
- Memory leak prevention
- Process termination guarantees

### Error Recovery
- Session restart capability
- Graceful degradation on backend failures
- User-friendly error messages

## Timeline Estimate

| Phase | Task | Effort | Priority |
|-------|------|--------|----------|
| 1 | Session abstraction & env handling | 4h | High |
| 2 | Context & hook implementation | 2h | High |
| 2 | UI switcher & view detaching | 3h | High |
| 3 | Tauri backend env passing | 2h | Medium |
| 4 | QA + polish + documentation | 3h | Medium |
| **Total** | | **14h** | |

## Success Metrics

- [ ] Both sessions can run simultaneously without conflicts
- [ ] Switching between tabs is instantaneous (< 100ms)
- [ ] Background processes continue running when hidden
- [ ] Memory usage remains under 10MB total for both sessions
- [ ] All existing TUI features work in both sessions
- [ ] Authentication works independently for each session
- [ ] File links open correctly from both sessions
- [ ] Theme changes apply to both sessions
- [ ] Window resize affects currently visible session
- [ ] Session cleanup is complete on termination

## Future Enhancements

### Split Pane Support
- Side-by-side view of both sessions
- Configurable layout options
- Synchronized scrolling capabilities

### Multi-Project Support
- Multiple workspaces per session type
- Project-specific configurations
- Workspace switching within sessions

### Advanced Features
- Session recording/playback
- Command history synchronization
- Custom keyboard shortcuts per session
- Session templates and presets
