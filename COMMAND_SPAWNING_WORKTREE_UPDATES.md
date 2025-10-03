# Command Spawning Worktree Path Updates

This document summarizes the updates made to use session worktree paths instead of hardcoded paths in all command spawning locations.

## Changes Made

### 1. **session_commands.rs** 

#### Added Helper Functions:
- `path_for(repo_path, session_id)` - Generates worktree path using `.amp-worktrees/{short_session_id}` pattern
- `get_session_worktree_path(session_id)` - Resolves session worktree path with fallback to current directory
- `find_repo_root(start_path)` - Finds Git repository root by traversing upwards

#### Updated Functions:
- **`config_get`**: Added `session_id: Option<String>` parameter, uses session worktree path instead of `current_dir(".")`
- **`config_set`**: Added `session_id: Option<String>` parameter, uses session worktree path instead of `current_dir(".")`
- **`spawn_amp_process`**: Added `.current_dir(working_dir)` using session worktree path resolution
- **`auth_status`**: Added `session_id: Option<String>` parameter, updates ResolvedConfig cwd with session worktree path

### 2. **commands.rs**

#### Added Helper Functions:
- `path_for(repo_path, session_id)` - Local copy of worktree path generation function
- `get_session_worktree_path(session_id, fallback_cwd)` - Session-aware path resolution with user-provided fallback
- `find_repo_root(start_path)` - Git repository root finder

#### Updated Functions:
- **`spawn_terminal`**: Added `session_id: Option<String>` parameter, uses session worktree path instead of user-provided `cwd`

### 3. **thread_session_commands.rs**

#### Added Helper Functions:
- `path_for(repo_path, session_id)` - Local copy of worktree path generation function  
- `get_session_worktree_path(session_id)` - Session worktree path resolver with current directory fallback
- `find_repo_root(start_path)` - Git repository root finder

#### Updated Functions:
- **`thread_start`**: Added `.current_dir(working_dir)` using session worktree path from `request.session_id`

### 4. **amp_auth.rs**

#### No Direct Changes Required:
- The `ensure_auth` function already accepts a `ResolvedConfig` with a `cwd` field
- Updated callers in `session_commands.rs` to provide session worktree path via config.cwd modification

## Implementation Details

### Worktree Path Resolution Logic:
1. **If session_id provided**: 
   - Find Git repository root from current directory
   - Generate worktree path using pattern: `{repo_root}/.amp-worktrees/{first_8_chars_of_session_id}`
   - Check if worktree exists, use it if available
   - Fall back to repository root if worktree doesn't exist
2. **If no session_id**: Fall back to current directory or user-provided path

### Error Handling:
- All functions include proper error handling for invalid paths
- Graceful fallbacks to current directory when worktree resolution fails
- Debug logging added for spawn_amp_process to track working directory usage

### Backward Compatibility:
- Added optional `session_id` parameters to maintain existing API compatibility
- Functions work correctly when session_id is None (legacy behavior)
- User-provided paths still respected as fallbacks

## Testing

- **Build Check**: `cargo check` passes successfully with only warnings (no errors)
- **Compilation**: All modules compile without issues
- **No Breaking Changes**: Existing function signatures preserved with optional parameters

## Benefits

1. **Session Isolation**: Commands now execute in correct session-specific worktrees
2. **Context Awareness**: File operations, git commands, and CLI spawning use session context
3. **Proper Scoping**: Configuration and authentication commands respect session boundaries
4. **Maintainability**: Centralized worktree path resolution logic
5. **Debugging**: Added logging to track working directory usage in spawned processes

## Files Modified

- `desktop-ui/src-tauri/src/session_commands.rs`
- `desktop-ui/src-tauri/src/commands.rs`  
- `desktop-ui/src-tauri/src/thread_session_commands.rs`

## Next Steps

Frontend code may need updates to pass `session_id` parameters to the modified Tauri commands:
- `config_get(key, session_id)`
- `config_set(key, value, session_id)`  
- `auth_status(session_id)`
- `spawn_terminal(cmd, cwd, session_id)`
