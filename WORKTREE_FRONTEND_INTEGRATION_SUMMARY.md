# Worktree Frontend Integration Summary

## Overview

Successfully integrated actual Git worktree creation with the frontend session management system. The SessionManagerContext now uses real Tauri invoke calls instead of simulated worktree operations.

## Changes Made

### 1. SessionManagerContext.tsx Updates

**Tauri Integration:**
- Added `import { invoke } from '@tauri-apps/api/core'`
- Replaced simulated worktree creation with actual `invoke('create_git_worktree')` calls
- Integrated worktree cleanup in session deletion with `invoke('remove_git_worktree')`

**Enhanced createSession Function:**
```typescript
const createSession = async (
  repoId: string,
  name: string,
  environment: SessionEnvironment,
  branch: string,
  threadId?: string
): Promise<string> => {
  const newId = nanoid();
  dispatch({ type: "CREATE_SESSION_PENDING", payload: { sessionId: newId } });

  try {
    // Call Rust backend to create worktree
    const worktreeMeta = await invoke<WorktreeMeta>('create_git_worktree', {
      repoPath: repoId,
      sessionId: newId,
    });

    // Create session with actual worktree info
    dispatch({
      type: "CREATE_SESSION",
      payload: {
        repositoryId: repoId,
        name,
        environment,
        worktreePath: worktreeMeta.path,
        worktreeBranch: worktreeMeta.branch,
        threadId,
        id: newId,
      },
    });

    return newId;
  } catch (error) {
    // Handle worktree creation failure
    const worktreeError: WorktreeError = {
      type: "creation_failed",
      message: `Failed to create worktree for branch ${branch}`,
      details: error instanceof Error ? error.message : String(error),
    };

    dispatch({
      type: "SET_WORKTREE_FAILED",
      payload: { sessionId: newId, error: worktreeError },
    });

    throw error;
  }
};
```

**Enhanced deleteSession Function:**
```typescript
const deleteSession = async (sessionId: string, force: boolean = false) => {
  try {
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) {
      dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
      return;
    }

    // Skip worktree cleanup for the main session (no separate worktree)
    if (session.worktreePath !== session.repositoryId) {
      try {
        await invoke('remove_git_worktree', {
          worktreePath: session.worktreePath,
          branchName: session.worktreeBranch,
          force,
        });
      } catch (error) {
        console.warn('Failed to clean up worktree:', error);
        // Continue with session deletion even if worktree cleanup fails
      }
    }

    dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
  } catch (error) {
    console.error('Failed to delete session:', error);
    // Still proceed with session deletion
    dispatch({ type: "DELETE_SESSION", payload: { sessionId } });
  }
};
```

**New Helper Functions:**
- `checkRepositoryClean(repoPath: string)` - Check if repo has uncommitted changes
- `clearWorktreeError(sessionId: string)` - Clear error state for a session

### 2. Interface Updates

**Updated SessionManagerContextValue:**
```typescript
interface SessionManagerContextValue {
  // ... existing properties
  deleteSession: (sessionId: string, force?: boolean) => Promise<void>;
  checkRepositoryClean: (repoPath: string) => Promise<boolean>;
  clearWorktreeError: (sessionId: string) => void;
}
```

## Tauri Commands Used

The integration uses these Tauri commands from `worktree_commands.rs`:

1. **`create_git_worktree`**
   - Input: `{ repoPath: string, sessionId: string }`
   - Output: `WorktreeMeta { path, branch, isMain, commitHash?, lastModified? }`

2. **`remove_git_worktree`**
   - Input: `{ worktreePath: string, branchName: string, force: boolean }`
   - Output: `void`

3. **`check_repository_clean`**
   - Input: `{ repoPath: string }`
   - Output: `boolean`

## Error Handling

**Worktree Creation Errors:**
- Errors are captured and stored in `state.worktreeErrors`
- Sessions with errors are marked and can be retried
- User-friendly error messages with technical details

**Session Deletion Safety:**
- Attempts worktree cleanup but continues deletion if cleanup fails
- Supports force deletion for stuck worktrees
- Graceful handling of missing sessions

**Repository State Validation:**
- Can check repository cleanliness before session creation
- Prevents conflicts from uncommitted changes

## Usage Example

```typescript
import { useSessionManager } from './contexts/SessionManagerContext';

function MyComponent() {
  const {
    createSession,
    deleteSession,
    checkRepositoryClean,
    getWorktreeError,
    isSessionPending,
  } = useSessionManager();

  const handleCreateSession = async () => {
    try {
      // Check if repo is clean first
      const isClean = await checkRepositoryClean('/path/to/repo');
      if (!isClean) {
        alert('Please commit or stash changes first');
        return;
      }

      // Create session with actual worktree
      const sessionId = await createSession(
        '/path/to/repo',
        'My Session',
        'development',
        'feature/my-branch'
      );
      
      console.log('Created session:', sessionId);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId, false); // or true for force
      console.log('Deleted session:', sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };
}
```

## Testing

A test component has been created at `test-worktree-integration.tsx` that demonstrates:
- Creating sessions with actual worktrees
- Repository cleanliness validation
- Error handling and display
- Session deletion with cleanup
- Pending state management

## Benefits

1. **Real Isolation**: Sessions now have actual separate Git worktrees
2. **Robust Error Handling**: Comprehensive error management for Git operations
3. **Safety Checks**: Repository validation before operations
4. **Cleanup Management**: Proper worktree cleanup on session deletion
5. **User Feedback**: Clear pending states and error messages

## Next Steps

1. **UI Integration**: Update session creation dialogs to show progress
2. **Error Recovery**: Add retry mechanisms for failed operations  
3. **Batch Operations**: Support creating multiple sessions efficiently
4. **Conflict Resolution**: Handle Git conflicts during worktree operations
5. **Performance**: Optimize for large repositories with many sessions
