# Session/Thread Architecture Implementation

This document outlines the implementation of the new session/thread architecture for the React frontend, as requested in the Oracle analysis.

## Overview

The implementation provides a two-level hierarchical structure where sessions contain multiple threads, each with isolated environments and context switching capabilities between development and production modes.

## Components Implemented

### 1. `useSessionThreadManager.ts` Hook
- **Purpose**: Manages sessions and threads using the new Rust backend commands
- **Features**:
  - Session CRUD operations
  - Thread management within sessions
  - Message sending to specific threads
  - Environment refresh for threads
- **Integration**: Uses Tauri commands: `list_sessions`, `list_threads`, `new_session_create`, `thread_start`, `thread_attach`, `thread_refresh_env`, `thread_send_message`

### 2. Updated `useDualChatContext.ts` Hook
- **Changes**: Added `currentThreadId` field to track active thread per context
- **New Methods**: `setThreadId()` for thread switching
- **Backward Compatibility**: Maintains existing session-based interface

### 3. `ThreadsSessionsPanel.tsx` Component
- **Purpose**: Hierarchical sessions/threads sidebar panel
- **Features**:
  - Expandable sessions showing contained threads
  - Context badges (production/development) per thread
  - Quick actions: create threads, refresh environments
  - Thread selection and switching
  - Visual indicators for active threads
- **UI Design**: Clean two-level hierarchy with proper spacing and icons

### 4. `ThreadsChat.tsx` Component  
- **Purpose**: New chat interface using thread-based architecture
- **Features**:
  - Thread-based messaging instead of session-based
  - Context switching with automatic session/thread creation
  - Environment refresh actions
  - Integration with existing message streaming
  - New thread creation within sessions
- **Integration**: Works with `useSessionThreadManager` and updated `useDualChatContext`

### 5. Updated `TuiIntegration.tsx` Component
- **Changes**: Added feature flag support to conditionally use ThreadsChat
- **Feature Flag**: `useThreadsArchitecture` based on development mode or localStorage setting
- **Backward Compatibility**: Falls back to legacy Chat component when disabled

## Backend Integration

The implementation integrates with the following Rust commands that were already implemented:

### Session Management
- `new_session_create(request: SessionCreateRequest)` - Create new session bound to toolbox profile
- `list_sessions(profile_id: Option<i64>)` - List all sessions with optional profile filter

### Thread Management  
- `thread_start(request: ThreadStartRequest)` - Start new thread with proper environment isolation
- `thread_attach(request: ThreadAttachRequest)` - Attach to existing thread (with history if process died)
- `thread_refresh_env(request: ThreadRefreshEnvRequest)` - Refresh thread environment when toolbox changes
- `list_threads(session_id: String, include_archived: Option<bool>)` - List threads in a session

### Messaging
- `thread_send_message(thread_id: String, message: String)` - Send messages to specific thread

## Database Schema

The implementation uses the new database schema defined in migration `007_add_threads_architecture.sql`:

### Sessions Table
- `id` (TEXT PRIMARY KEY)
- `title` (TEXT)  
- `profile_id` (INTEGER, references toolbox_profiles)
- `created_at`, `updated_at` (TEXT)

### Threads Table
- `id` (TEXT PRIMARY KEY)
- `session_id` (TEXT, references sessions)
- `context` (TEXT, 'production' or 'development')
- `agent_mode` (TEXT, optional)
- `toolbox_snapshot` (TEXT, JSON snapshot)
- `created_at`, `updated_at`, `archived_at` (TEXT)

### Messages Table
- `id` (TEXT PRIMARY KEY)
- `thread_id` (TEXT, references threads)
- `role`, `content` (TEXT)
- `created_at` (TEXT)

## Key Features

### 1. Hierarchical UI Structure
- Sessions expand to show contained threads
- Visual indicators for context (production/development)
- Agent mode badges per thread
- Quick action buttons for common operations

### 2. Isolated Environment Management
- Each thread has its own toolbox snapshot
- Environment refresh actions per thread
- Context switching creates new threads when needed
- Proper environment isolation between contexts

### 3. Message Threading
- Messages are sent to specific thread IDs
- Chat history is maintained per thread
- Streaming message handling continues to work
- Backward compatibility with existing message format

### 4. Session Isolation
- Sessions are bound to toolbox profiles
- Threads within a session can swap between dev/production contexts
- Clean separation between different project contexts

## Activation

The new architecture is controlled by a feature flag:

```typescript
const useThreadsArchitecture = process.env.NODE_ENV === 'development' || 
                              localStorage.getItem('amp_threads_architecture') === 'true'
```

### To Enable:
```javascript
localStorage.setItem('amp_threads_architecture', 'true')
```

### To Disable:
```javascript
localStorage.removeItem('amp_threads_architecture')
```

## User Experience

### New Workflow:
1. **Session Creation**: Users create sessions (optionally bound to toolbox profiles)
2. **Thread Management**: Within each session, users can create multiple threads
3. **Context Switching**: Each thread can switch between development and production contexts
4. **Environment Refresh**: Users can refresh the toolbox environment for specific threads
5. **Messaging**: Messages are sent to the currently active thread

### UI Elements:
- **Sessions Panel**: Shows expandable hierarchy with sessions → threads
- **Context Badges**: Visual indicators for production (green) vs development (blue)  
- **Quick Actions**: Create thread, refresh environment, archive thread
- **Active Thread Display**: Shows current thread ID in the chat interface

## Benefits

1. **Better Isolation**: Each thread has its own environment and context
2. **Improved Organization**: Hierarchical structure makes it easy to manage multiple conversations
3. **Context Flexibility**: Easy switching between dev/production within the same session
4. **Environment Management**: Per-thread toolbox refresh without affecting other threads
5. **Scalability**: Supports many threads per session without UI clutter
6. **Backward Compatibility**: Existing workflows continue to work with legacy Chat component

## Testing

The implementation maintains full TypeScript compliance and passes all existing type checks. The feature flag approach allows for safe rollout and easy rollback if needed.

## Future Enhancements

1. Thread archiving and restoration
2. Thread search and filtering
3. Bulk operations on threads
4. Thread templates and cloning
5. Enhanced thread metadata and tagging
