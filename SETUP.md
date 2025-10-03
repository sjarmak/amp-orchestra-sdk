# Amp Orchestra Setup Guide

This guide explains how to set up authentication and connection modes for the Amp Orchestra desktop application.

## Quick Start

### 1. Production Mode (Recommended)
```bash
export AMP_API_KEY=your_api_key_here
cd desktop-ui && pnpm tauri dev
```

### 2. Local CLI Development
```bash
# AMP_URL automatically set to https://localhost:7002 when using local CLI
export AMP_API_KEY=your_api_key_here  
cd desktop-ui && pnpm tauri dev
```

### 3. Local Server Mode (Manual Override)
```bash
# Only needed to force server mode (skips CLI auto-detection)
export AMP_URL=https://localhost:7002
cd desktop-ui && pnpm tauri dev
```

## Environment Variables

### Authentication
- **`AMP_API_KEY`** - Your Amp API key (preferred)
- **`AMP_TOKEN`** - Legacy token (backward compatibility) 
- **`AMP_AUTH_CMD`** - Custom authentication command

### Connection Configuration
- **`AMP_CLI_PATH`** - Path to local Amp CLI binary
- **`AMP_URL`** - Server URL override
- **`AMP_BIN`** - Legacy binary path

### Debug & Advanced
- **`AMP_DEBUG=true`** - Enable detailed logging
- **`AMP_ENABLE_JSONL=true`** - Enable JSON log parsing
- **`AMP_ARGS`** - Additional CLI arguments

## Connection Modes

### Production SaaS (Default)
- Connects to `https://ampcode.com`
- Requires `AMP_API_KEY`
- Uses system `amp` binary or auto-detects local CLI

### Local Development Server
- Connects to `https://localhost:7002`  
- No authentication required
- Set `AMP_URL=https://localhost:7002`

### Local CLI Binary
- Uses local Amp CLI binary
- Requires `AMP_API_KEY`
- **Auto-detects** `~/amp/cli/dist/main.js` or set `AMP_CLI_PATH`
- **Auto-sets** `AMP_URL=https://localhost:7002` for local development

## Path Resolution

The system automatically resolves CLI paths in this order:

1. **Runtime overrides** (from UI settings)
2. **Global flags** (`--amp-path`)
3. **Environment variables** (`AMP_CLI_PATH`, `AMP_BIN`)
4. **User-agnostic default**: `~/amp/cli/dist/main.js`
5. **System PATH**: `amp`

## Configuration Storage

Settings are stored in platform-specific locations:

- **macOS**: `~/Library/Application Support/ampsm/config.json`
- **Linux**: `~/.config/ampsm/config.json` 
- **Windows**: `%APPDATA%/ampsm/config.json`

## Testing Authentication

Use the test script to verify your setup:

```bash
node test-auth.cjs
```

Example output:
```
🔍 Testing Amp Authentication Configuration

📋 Current Configuration:
  AMP_BIN: amp
  AMP_API_KEY: [SET]
  AMP_AUTH_CMD: [NOT SET]
  AMP_DEBUG: false

🌐 Connection Resolution:
  Mode: production
  Description: Production (ampcode.com)

🔐 Testing Authentication...
  Success: ✅
  Message: Authenticated successfully. Amp version: 0.0.1756944095-ge9e810
```

## Troubleshooting

### Authentication Issues
- Verify `AMP_API_KEY` is set correctly
- Check connection status in the app's bottom panel
- Enable debug logging with `AMP_DEBUG=true`

### Local CLI Issues
- Verify the CLI binary exists at the expected path
- Check if `~/amp/cli/dist/main.js` exists for auto-detection
- Manually set `AMP_CLI_PATH` if needed

### Connection Status Indicators

In the app, look for status indicators:

- **✅ Connected** (green) - Authentication successful
- **⚠️ Not Connected** (red) - Authentication failed
- **Connection description** - Shows which mode you're using

## Next Steps

Once authenticated, you can:

1. **Chat with Amp** - Send messages and receive streaming responses
2. **Switch environments** - Change between production/local modes
3. **Access file explorer** - Browse and edit files
4. **Use terminal** - Interactive Amp CLI access
