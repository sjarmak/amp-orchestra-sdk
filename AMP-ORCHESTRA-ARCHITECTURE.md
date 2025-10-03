# Amp-Orchestra – Backend & Integration Architecture

This document provides a comprehensive analysis of the amp-orchestra repository architecture and implementation roadmap for advanced developer features including interactive chat, environment switching, model configuration, and parallel testing capabilities.

## Overview

Amp-Orchestra is a monorepo containing a desktop Amp chat interface with sophisticated backend integration capabilities. The architecture follows a modular approach with clear separation between UI (Tauri/React), backend services, and Amp CLI orchestration.

## Current Architecture

### Component Flow
```
desktop-ui (Tauri/React) → Node Sidecar → @ampsm/amp-client → Amp CLI Binary → Amp Cloud API
```

### Package Structure

```
packages/
├── amp-client/          # Amp CLI orchestration (complete)
│   ├── auth.ts         # Login/version validation
│   ├── client.ts       # runIteration(), continueThread(), streaming
│   └── config.ts       # Environment/path resolution
├── workspace/          # Git + filesystem helpers (stubs)
│   ├── git/           # Git operations (needs implementation)
│   ├── filesystem/    # FileDiffTracker (todo)
│   └── workspace/     # WorkspaceManager (todo)
└── shared/            # Common utilities (placeholder)

desktop-ui/             # React + Tauri frontend
├── components/
│   ├── FileExplorer.tsx
│   ├── Editor.tsx
│   └── Terminal.tsx
├── contexts/ThemeContext.tsx
└── App.tsx            # Three-panel layout
```

## Current Integration Points

### 1. Amp CLI Connection

The system uses sophisticated environment detection:

**Production Mode:**
- Uses `amp` command from system PATH
- Connects to Amp Cloud API
- Standard authentication flow

**Development Mode:**
- Uses custom CLI binary path (e.g., `./bin/amp-dev`)
- Can override with `AMP_CLI_PATH` environment variable
- Optional local server via `AMP_URL=https://localhost:7002`

### 2. Authentication Flow

- Environment-driven via `AMP_TOKEN`, `AMP_AUTH_CMD`
- `ensureAmpAuth()` validates CLI accessibility
- Version checking with `amp --version`
- Token redaction for security

### 3. Streaming Architecture

The client streams JSONL events:
- `assistant_message` - Chat responses
- `token_usage` - Usage metrics
- `tool_start/tool_finish` - Tool execution telemetry
- `session_result` - Final results

## Implementation Roadmap

### Phase 1: Interactive Amp Chat Backend

#### Required Components

**SessionManager**
```typescript
class SessionManager {
  private sessions: Map<string, AmpClient> = new Map();
  
  async createSession(config: SessionConfig): Promise<string>
  async sendMessage(sessionId: string, prompt: string): Promise<void>
  streamEvents(sessionId: string): EventEmitter
  async stopSession(sessionId: string): Promise<void>
}
```

**IPC Events**
- `chat/send` - {sessionId, prompt}
- `chat/stream` - Server-sent events for real-time updates
- `chat/stop` - Process termination
- `session/create` - New chat session
- `session/list` - Active sessions

#### Integration Points

1. **First Message**: SessionManager calls `client.runIteration()`
2. **Follow-ups**: Uses `continueThread()` with persistent threadId
3. **Working Directory**: Defaults to workspace root or specified worktree
4. **Streaming**: Real-time event forwarding to UI

### Phase 2: Environment Switching

#### Configuration System

**Environment Options:**
| Option | Configuration |
|--------|--------------|
| Production | `{ ampCliPath: "production" }` |
| Local CLI | `{ ampCliPath: "/path/to/amp-local" }` |
| Local Server | `{ ampServerUrl: "https://localhost:7002" }` |

**Settings UI:**
- Environment dropdown in main toolbar
- Validation with visual feedback
- Session restart on environment change
- Persistent configuration storage

#### Implementation Details

```typescript
interface EnvironmentConfig {
  name: string;
  ampCliPath?: string;
  ampServerUrl?: string;
  authMethod?: 'token' | 'command';
}

// Existing amp-client automatically handles these configurations
// via getAmpEnvironment() and getAmpCliPath()
```

### Phase 3: Model Configuration System

#### UI Components

**Model Selector:**
- Header dropdown: "Model: (default) / gpt-4 / claude-3 / ..."
- Per-session model override
- Real-time switching capability

**Advanced Combinations Panel:**
- Multi-model selection
- Batch run configuration
- Custom model parameters

#### Backend Enhancement

Extend existing `modelOverride` parameter:
```typescript
// Current: limited to "gpt-5", "glm-4.5"
// Enhanced: generic model passing
if (modelOverride) {
  args.push("--try-model", modelOverride);
}
```

### Phase 4: Parallel Batch Runs & Benchmarking

#### Core Components

**WorktreeManager**
```typescript
class WorktreeManager {
  async createWorktree(baseSha: string, branchName: string): Promise<string>
  async cleanup(branchName: string): Promise<void>
  listWorktrees(): Promise<Worktree[]>
}
```

**BatchRunner**
```typescript
interface BatchConfig {
  prompt: string;
  combinations: Array<{
    model: string;
    branchPointSha?: string;
    customArgs?: string[];
  }>;
}

class BatchRunner {
  async runBatch(config: BatchConfig): Promise<BatchResult[]>
  async getBatchHistory(): Promise<BatchResult[]>
}
```

#### Implementation Strategy

1. **Worktree Creation**: Use `git worktree add --detach` for isolation
2. **Parallel Execution**: `Promise.allSettled` with CPU-bounded concurrency
3. **Result Aggregation**: Collect metrics, diffs, and telemetry
4. **Persistence**: Store results in `batch-results/*.json`

#### UI Features

**Benchmark Dashboard:**
- Results table: combination | success | tokens | duration | diff
- Historical comparison
- Export capabilities
- Progress indicators for running batches

### Phase 5: Configuration & Persistence

#### Configuration File Structure
```json
{
  "defaultEnvironment": "production",
  "customCliPath": "/path/to/amp-dev",
  "localServerUrl": "https://localhost:7002",
  "theme": "dark",
  "recentWorkspaces": ["/path/to/project1", "/path/to/project2"],
  "modelPreferences": {
    "default": "gpt-4",
    "coding": "claude-3",
    "analysis": "gpt-4-turbo"
  },
  "batchSettings": {
    "maxConcurrency": 4,
    "timeout": 300000
  }
}
```

#### Storage Strategy

**Location**: `~/.config/amp-orchestra/config.json`
**Management**: ConfigStore with IPC synchronization
**Backup**: Automatic versioning for recovery

## Security Considerations

### Authentication
- OS keychain integration for token storage
- Environment variable redaction in logs
- Secure IPC communication

### Process Management
- Session limits to prevent resource exhaustion
- Graceful cleanup of child processes
- Sandbox worktree operations

### Data Protection
- Configuration file encryption for sensitive data
- Audit logging for environment switches
- Secure cleanup of temporary files

## Performance Optimizations

### Resource Management
- Connection pooling for Amp CLI instances
- Efficient streaming buffer management
- Worktree cleanup automation

### UI Responsiveness
- Background processing for heavy operations
- Progressive loading of large result sets
- Debounced configuration updates

## Testing Strategy

### Unit Tests
- Mock Amp CLI responses
- Configuration validation
- Session lifecycle management

### Integration Tests
- End-to-end chat flows
- Environment switching scenarios
- Batch run execution

### Performance Tests
- Concurrent session handling
- Large file processing
- Memory usage monitoring

## Development Priorities

### Immediate (Phase 1)
1. Implement missing workspace/git utilities
2. Create Node sidecar process with SessionManager
3. Wire live streaming UI to backend
4. Basic chat functionality

### Short-term (Phases 2-3)
1. Environment switching UI
2. Model selector implementation
3. Configuration persistence
4. Enhanced error handling

### Long-term (Phases 4-5)
1. Batch runner implementation
2. Benchmark dashboard
3. Advanced configuration options
4. Performance optimizations

## Potential Pitfalls & Mitigation

### Concurrency Issues
- **Problem**: Multiple Amp processes consuming resources
- **Solution**: Session limits and queuing system

### Storage Management
- **Problem**: Worktree disk bloat
- **Solution**: Automated cleanup with `git worktree prune`

### Environment Safety
- **Problem**: Production/development confusion
- **Solution**: Clear visual indicators and confirmation dialogs

### Stream Processing
- **Problem**: Invalid JSON in streaming data
- **Solution**: Robust parsing with error recovery

## Conclusion

Amp-Orchestra provides a solid foundation with its existing CLI wrapper and streaming capabilities. The proposed architecture leverages these strengths while adding the sophisticated features needed for advanced development workflows.

The implementation roadmap prioritizes core functionality first, then builds advanced features incrementally. This approach ensures a stable base while enabling powerful developer tools for model experimentation, environment management, and automated testing workflows.

The modular design allows for independent development of features while maintaining clean integration points and consistent user experience across all components.
