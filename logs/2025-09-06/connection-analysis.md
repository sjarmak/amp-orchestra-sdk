# Amp Orchestra Connection Analysis - September 6, 2025

## Key Findings

### 1. **Process Spawn Success**
The `spawn_amp_process` function in [session_commands.rs](file:///Users/sjarmak/amp-orchestra/desktop-ui/src-tauri/src/session_commands.rs#L391-L462) successfully spawns processes:
- Command: `node`
- Args: `["amp"]` 
- Environment includes: `AMP_CLI_PATH=amp`, `AMP_API_KEY`, `NODE_TLS_REJECT_UNAUTHORIZED=0`
- Process spawns successfully but no subsequent stdout/stderr captured

### 2. **Configuration Mismatch Issue**
Major disconnect found in [session_commands.rs](file:///Users/sjarmak/amp-orchestra/desktop-ui/src-tauri/src/session_commands.rs#L113-L134):
```javascript
const client = new EnhancedAmpClient({
    runtimeConfig: {
        // Force system amp (production) to avoid local CLI timeouts
        ampCliPath: 'production'  // <-- HARDCODED TO PRODUCTION
    },
    env: process.env,  // Process env has AMP_CLI_PATH=amp but it's ignored
    modelOverride: MODEL_OVERRIDE
});
```

The system environment has `AMP_CLI_PATH=amp` (local CLI) but the client configuration hardcodes `ampCliPath: 'production'`, causing a conflict.

### 3. **Missing Debug Output After Command Input**
- App launches successfully
- Process spawns successfully  
- When `/whoami` is typed and entered, no additional debug output appears
- This suggests the message isn't reaching the amp process or the response isn't being captured

### 4. **Environment Configuration Issues**
The spawn process logs show:
- `AMP_API_KEY` is successfully retrieved from shell config
- `NODE_TLS_REJECT_UNAUTHORIZED=0` is added
- `AMP_URL` defaults to `https://ampcode.com/`
- But the client config overrides CLI path to 'production'

## Root Cause Analysis

The primary issue is a **configuration inconsistency**:

1. The Rust backend sets `AMP_CLI_PATH=amp` (local development)
2. But the Node.js client hardcodes `ampCliPath: 'production'` 
3. This means the system tries to use production Amp services while having environment variables set for local development

## Recommended Fixes

### 1. Fix Configuration Consistency
In [session_commands.rs](file:///Users/sjarmak/amp-orchestra/desktop-ui/src-tauri/src/session_commands.rs#L130-L137), change:
```javascript
const client = new EnhancedAmpClient({
    runtimeConfig: {
        ampCliPath: process.env.AMP_CLI_PATH || 'amp'  // Use env var instead of hardcoded
    },
    env: process.env,
    modelOverride: MODEL_OVERRIDE
});
```

### 2. Enhanced Logging
Add debug logging after the client initialization to verify:
- Which CLI path is actually being used
- Authentication status
- Connection attempts

### 3. Verify AMP_CLI_PATH Environment
The current setup expects `AMP_CLI_PATH=amp` but may need the full path to the local amp binary if using local development.

## Test Commands Run

1. `RUST_LOG=debug AMP_DEBUG=true pnpm tauri:dev` - App startup with debug logging
2. Used orchestra-ui tool to automate typing `/whoami` command
3. Captured logs in `logs/2025-09-06/` directory

## Log Files Generated

- `tauri-debug.log` - First run (port conflict)
- `tauri-clean.log` - Second run (successful startup) 
- `tauri-full.log` - Third run (full interaction test)
