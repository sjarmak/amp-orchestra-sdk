# Thread-Based Session Management System

This document describes the new thread-based session management system implemented in Amp Orchestra. This system provides better isolation, multi-threading capabilities, and toolbox profile integration.

## Architecture Overview

The system uses a three-table architecture:
- **Sessions** - Top-level containers bound to toolbox profiles
- **Threads** - Individual conversation threads within sessions with context isolation
- **Messages** - Chat messages belonging to specific threads

## Core Commands

### 1. `new_session_create(profile_id?)`

Creates a new session bound to a toolbox profile.

```typescript
interface SessionCreateRequest {
  profile_id?: number;
}

interface SessionInfo {
  id: string;
  title?: string;
  profile_id?: number;
  created_at: string;
  updated_at: string;
}
```

**Usage:**
```javascript
// Create session with profile
const session = await invoke('new_session_create', { 
  request: { profile_id: 123 } 
});

// Create session without profile
const session = await invoke('new_session_create', { 
  request: {} 
});
```

### 2. `thread_start(session_id, context, agent_mode?)`

Starts a new thread within a session with proper environment isolation.

```typescript
interface ThreadStartRequest {
  session_id: string;
  context: "production" | "development";
  agent_mode?: string;
}

interface ThreadInfo {
  id: string;
  session_id: string;
  context: string;
  agent_mode?: string;
  toolbox_snapshot?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}
```

**Usage:**
```javascript
const thread = await invoke('thread_start', {
  request: {
    session_id: "session-123",
    context: "development",
    agent_mode: "geppetto:main"
  }
});
```

### 3. `thread_attach(thread_id)`

Attaches to an existing thread with history restoration if the process died.

```typescript
interface ThreadAttachRequest {
  thread_id: string;
}
```

**Usage:**
```javascript
const thread = await invoke('thread_attach', {
  request: { thread_id: "thread-456" }
});
```

### 4. `thread_refresh_env(thread_id)`

Refreshes a thread's environment when toolbox profile changes.

```typescript
interface ThreadRefreshEnvRequest {
  thread_id: string;
}
```

**Usage:**
```javascript
const thread = await invoke('thread_refresh_env', {
  request: { thread_id: "thread-456" }
});
```

## Helper Commands

### Session Management

- `list_sessions(profile_id?)` - List sessions with optional profile filter
- `get_thread_history(thread_id, limit?, offset?)` - Get thread message history

### Thread Management

- `list_threads(session_id, include_archived?)` - List threads in a session
- `thread_send_message(thread_id, message)` - Send message to a thread
- `thread_archive(thread_id)` - Archive (soft delete) a thread

## Key Features

### 1. Session Isolation
- Each session can be bound to a different toolbox profile
- Sessions provide organizational boundaries for related threads
- Sessions persist profile snapshots for reproducibility

### 2. Multi-Threading Support
- Multiple threads can run within the same session
- Each thread has its own Amp CLI process
- Threads can have different contexts (production/development)

### 3. Environment Snapshots
- Toolbox configurations are captured as JSON snapshots
- Environment can be restored even after profile changes
- Supports environment refresh without losing thread state

### 4. Context Awareness
- Development context: uses local CLI and development settings
- Production context: uses production Amp service
- Agent modes can be set per thread

### 5. Process Management
- Integration with existing `AmpSessionMap` for process lifecycle
- Automatic process cleanup and resource management
- Worktree isolation support (when feature enabled)

### 6. Database Integration
- All session and thread metadata stored in SQLite
- Message history preserved in database
- Supports pagination and filtering

## Event Streaming

The system emits events via Tauri's event system:

- `thread_stream` - Thread-specific chat events
- Format matches existing `chat_stream` events but with `thread_id` instead of `session_id`

## Migration

The system uses migration `007_add_threads_architecture.sql` which:
- Adds the new three-table schema
- Keeps existing `chat_sessions` for backward compatibility
- Includes proper indexes and triggers

## Error Handling

All commands return `Result<T, String>` with descriptive error messages:
- Database connection errors
- Profile not found errors
- Thread/session not found errors
- Process spawn failures

## Integration Points

### With Existing Systems
- **AmpSessionMap**: Manages active processes
- **Toolbox Resolver**: Creates environment snapshots
- **Profile Manager**: Provides toolbox profile data
- **Worktree Manager**: Provides filesystem isolation (optional)

### With Frontend
- Commands are exposed as Tauri commands
- Events are emitted for real-time updates
- Compatible with existing chat interface patterns

## Usage Patterns

### Basic Workflow
1. Create a session with a toolbox profile
2. Start one or more threads in different contexts
3. Send messages to threads via `thread_send_message`
4. Archive threads when done
5. Reuse session for related work

### Multi-Context Development
1. Create session for a project
2. Start development thread for local testing
3. Start production thread for deployment
4. Switch between threads as needed
5. Both threads share the same toolbox profile but run in different environments

### Profile Updates
1. Update toolbox profile externally
2. Call `thread_refresh_env` on active threads
3. New environment is applied without losing chat history
4. Threads restart with updated toolbox configuration
