# Amp Connection Debug Guide

This guide outlines the debugging enhancements added to investigate persistent connection errors in Amp Orchestra.

## What Was Added

### 1. Enhanced Session Environment Logging

Added comprehensive logging to `buildSessionEnvironment` function in [`desktop-ui/src/components/terminal/session.ts`](file:///Users/sjarmak/amp-orchestra/desktop-ui/src/components/terminal/session.ts#L52-L115):

```typescript
console.log('[buildSessionEnvironment] Building environment for profile:', {
  id: profile.id,
  name: profile.name,
  connection_type: profile.connection_type,
  api_url: profile.api_url,
  cli_path: profile.cli_path,
  tls_enabled: profile.tls_enabled
})
```

**What it logs:**
- Profile configuration details
- Connection type specific settings
- Environment variable assignments
- Token presence (length only for security)
- Final environment summary

### 2. Enhanced Tauri Process Spawn Logging

Added detailed logging to `spawn_amp_process` in [`desktop-ui/src-tauri/src/session_commands.rs`](file:///Users/sjarmak/amp-orchestra/desktop-ui/src-tauri/src/session_commands.rs#L368-L409):

```rust
println!("[spawn_amp_process] Command: {}", command);
println!("[spawn_amp_process] Args: {:?}", args);
println!("[spawn_amp_process] Environment variables ({}): {:?}", env.len(), 
    env.iter().map(|(k, v)| {
        if k == "AMP_TOKEN" {
            format!("{}=[REDACTED:{}]", k, v.len())
        } else {
            format!("{}={}", k, v)
        }
    }).collect::<Vec<_>>()
);
```

**What it logs:**
- Command and arguments being executed
- All environment variables (tokens redacted)
- Process spawn success/failure
- Session and process IDs

### 3. Enhanced Frontend Error Handling

Added detailed error logging in session spawn process:

```typescript
console.log('[Session] Invoking spawn_amp_process with:', {
  command,
  args,
  envKeys: Object.keys(cleanEnv),
  sessionId: this.id
})
```

**What it logs:**
- Pre-spawn configuration
- Process ID on successful spawn
- Detailed error information on failure

## How to Debug Connection Issues

### Step 1: Enable Debug Logging

1. Open browser developer tools (F12)
2. Go to Console tab
3. Start a new Amp session
4. Watch for log messages with prefixes:
   - `[buildSessionEnvironment]` - Environment setup
   - `[Session]` - Session management
   - `[spawn_amp_process]` - Tauri backend

### Step 2: Check Tauri Console

For backend logging:
1. If running in development: Check terminal running `pnpm tauri dev`
2. If running built app: Look for Tauri console output

### Step 3: Test Different Configurations

#### Production Configuration
- Command: `amp`
- Environment: `AMP_BIN=amp`
- Should work if `amp` is in PATH

#### Development Configuration (CLI Path)
- Command: `node`
- Args: `["/path/to/amp/cli/dist/main.js"]`
- Environment: `AMP_CLI_PATH=/path/to/amp/cli/dist/main.js`

#### Local Server Configuration
- Command: `amp`
- Environment: 
  - `AMP_URL=https://localhost:7002`
  - `NODE_TLS_REJECT_UNAUTHORIZED=0`

### Step 4: Manual Testing

Use the debug HTML page at [`debug-amp-connection.html`](file:///Users/sjarmak/amp-orchestra/debug-amp-connection.html) for manual testing:

1. Open the file in a browser
2. If running in Tauri app, the functions will work
3. Test different configurations individually
4. Monitor console output for detailed error information

## Common Connection Error Patterns

### 1. Command Not Found
```
[spawn_amp_process] ERROR: Failed to spawn process amp: No such file or directory (os error 2)
```
**Solution:** Ensure `amp` binary is in PATH or use absolute path

### 2. Permission Denied
```
[spawn_amp_process] ERROR: Failed to spawn process: Permission denied (os error 13)
```
**Solution:** Check file permissions on CLI path

### 3. Environment Variable Issues
```
[buildSessionEnvironment] Set AMP_CLI_PATH to: undefined
```
**Solution:** Verify profile configuration has correct paths

### 4. TLS Certificate Issues
Look for network-related errors in process output when `NODE_TLS_REJECT_UNAUTHORIZED` is not set correctly.

## Debugging Commands

### Check Current Environment
```bash
# Production setup
export AMP_BIN=amp
unset AMP_CLI_PATH
unset AMP_URL
unset NODE_TLS_REJECT_UNAUTHORIZED

# Development setup
export AMP_CLI_PATH=~/amp/cli/dist/main.js
export AMP_URL=https://localhost:7002
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Test Amp Binary Manually
```bash
# Test production
amp --version

# Test development
node ~/amp/cli/dist/main.js --version

# Test with environment
AMP_URL=https://localhost:7002 NODE_TLS_REJECT_UNAUTHORIZED=0 amp --version
```

## Next Steps

With these debugging enhancements in place:

1. **Run a test session** - Start the app and try to create a new Amp session
2. **Collect logs** - Gather both frontend console logs and backend Tauri logs
3. **Identify failure point** - Determine if it's environment setup, command execution, or process communication
4. **Apply targeted fix** - Based on the specific error pattern identified

The enhanced logging will provide clear visibility into:
- What environment variables are being set
- What command is being executed
- Why the process spawn is failing
- What the actual system error is

This should significantly reduce the time needed to diagnose and fix connection issues.
