# Amp Session Orchestrator Connection Architecture

This document provides a comprehensive overview of how the Amp Session Orchestrator connects to both production and local development versions of Amp, detailing the exact mechanisms, configuration requirements, and authentication flows.

## Overview

The Amp Session Orchestrator supports three distinct connection modes:

1. **Production SaaS** (`ampcode.com`)
2. **Local Development Server** (`https://localhost:7002`)
3. **Local CLI Binary** (Node.js or native executable)

## Connection Resolution Logic

The system uses a hierarchical resolver that determines which Amp backend to use based on the following precedence order:

### Server URL Resolution (Highest Priority)

1. YAML case-level `amp_server_url`
2. YAML suite-level `amp_server_url`
3. YAML defaults `amp_server_url`
4. Global `--amp-server` flag

### CLI Path Resolution (If No Server URL Found)

1. YAML case-level `amp_cli_path`
2. YAML suite-level `amp_cli_path`
3. YAML defaults `amp_cli_path`
4. Global `--amp-path` flag
5. `AMP_CLI_PATH` environment variable
6. Legacy `AMP_BIN` environment variable
7. Default `amp` (system PATH)

**Key Decision Point**: If a server URL is resolved, the orchestrator communicates via HTTP/JSON and **skips all local authentication logic**. Otherwise, it launches the resolved executable locally and performs authentication.

## Core Configuration Files

### Authentication Configuration

- **[/Users/sjarmak/amp-orchestrator/packages/cli/src/utils/amp-auth.ts](/Users/sjarmak/amp-orchestrator/packages/cli/src/utils/amp-auth.ts)** - Primary authentication utilities

### Configuration Management

- **[/Users/sjarmak/amp-orchestrator/packages/cli/src/commands/config.ts](/Users/sjarmak/amp-orchestrator/packages/cli/src/commands/config.ts)** - CLI configuration commands
- **[/Users/sjarmak/amp-orchestrator/packages/core/src/config.ts](/Users/sjarmak/amp-orchestrator/packages/core/src/config.ts)** - Core configuration utilities

### Documentation

- **[/Users/sjarmak/amp-orchestrator/docs/USING_LOCAL_AMP.md](/Users/sjarmak/amp-orchestrator/docs/USING_LOCAL_AMP.md)** - Local development setup guide
- **[/Users/sjarmak/amp-orchestrator/docs/AUTHENTICATED_TESTS.md](/Users/sjarmak/amp-orchestrator/docs/AUTHENTICATED_TESTS.md)** - Authentication testing documentation

### Configuration Examples

- **[/Users/sjarmak/amp-orchestrator/configs/evals/local-dev-example.yaml](/Users/sjarmak/amp-orchestrator/configs/evals/local-dev-example.yaml)** - Complete local development configuration

## Environment Variables

### Core Amp Configuration

- `AMP_BIN` - Path to Amp binary (default: `amp`)
- `AMP_TOKEN` - Authentication token for Amp CLI
- `AMP_AUTH_CMD` - Authentication command template (e.g., `'amp auth login --token "$AMP_TOKEN"'`)
- `AMP_ARGS` - Additional arguments for Amp CLI
- `AMP_ENABLE_JSONL` - Enable JSON logs parsing (`'true'`/`'false'`)

### Connection Override Variables

- `AMP_URL` - Server URL override
- `AMP_CLI_PATH` - Local CLI binary path
- `AMP_SERVER_URL` - Local server URL (typically `https://localhost:7002`)

### Development Environment

- `NODE_TLS_REJECT_UNAUTHORIZED=0` - Disable TLS verification for localhost
- `OPENROUTER_API_KEY` - OpenRouter API key for alternative models

### System Configuration

- `AMPSM_DB_PATH` - SQLite database path override
- `AMP_SESSION_ORCHESTRATOR_DB` - Alternative database path

## Authentication Flow

The authentication system is implemented in [`amp-auth.ts`](/Users/sjarmak/amp-orchestrator/packages/cli/src/utils/amp-auth.ts):

### Authentication Functions

1. **`loadAmpAuthConfig()`** - Loads configuration from environment variables
2. **`hasAuthEnvironment()`** - Checks if authentication environment is available
3. **`ensureAmpAuth()`** - Main authentication workflow

### Authentication Process

1. **Configuration Loading**: Captures environment variables (`AMP_BIN`, `AMP_TOKEN`, etc.)
2. **Pre-flight Checks**:
   - Fail if `AMP_BIN` is missing
   - Fail if neither `AMP_AUTH_CMD` nor `AMP_TOKEN` is provided
3. **Authentication Command Execution**: If `AMP_AUTH_CMD` exists, execute it with `AMP_TOKEN` in environment
4. **Version Verification**: Run `<AMP_BIN> --version` to confirm binary works
5. **Success Confirmation**: Return authentication status and version information

## Configuration Persistence

User configuration is stored in JSON format at:

- **macOS**: `~/Library/Application Support/ampsm/config.json`
- **Linux**: `~/.config/ampsm/config.json`
- **Windows**: `%APPDATA%\ampsm\config.json`

Configuration management commands:

```bash
amp-sessions config set ampEnv.AMP_TOKEN your_token_here
amp-sessions config get ampEnv.AMP_TOKEN
```

## Connection Modes Setup

### 1. Production SaaS Mode

**Endpoints**:

- Base URL: `https://ampcode.com`
- Thread URLs: `https://ampcode.com/threads/{threadId}`
- Authentication: `https://ampcode.com/auth/cli-login`

**Configuration**:

```bash
export AMP_BIN=amp                             # optional if on PATH
export AMP_TOKEN=<production_token>            # or
export AMP_AUTH_CMD='amp auth login --token "$AMP_TOKEN"'
```

**Usage**:

```bash
amp-sessions new --repo . --name demo --prompt "Hello world"
```

### 2. Local Development Server Mode

**Setup**:

1. Start the dev server in the Amp monorepo: `pnpm dev`
2. Server runs on `https://localhost:7002`

**Configuration**:

```bash
amp-sessions iterate 123 --amp-server https://localhost:7002
```

**YAML Configuration**:

```yaml
defaults:
  amp_server_url: "https://localhost:7002"
```

**Note**: No authentication token required when using server mode.

### 3. Local CLI Binary Mode

**Setup**:

1. Build the CLI: `cd amp/cli && pnpm build` (produces `dist/main.js`)
2. Configure binary path via any of:
   - CLI flag: `--amp-path /abs/path/to/dist/main.js`
   - Environment: `export AMP_CLI_PATH=/abs/path/to/dist/main.js`
   - YAML: `amp_cli_path: "/abs/path/to/dist/main.js"`

**Configuration**:

```bash
export AMP_CLI_PATH=/path/to/amp/cli/dist/main.js
export AMP_AUTH_CMD='node $AMP_CLI_PATH auth login --token "$AMP_TOKEN"'
export AMP_TOKEN=<dev_or_prod_token>
export AMP_ENABLE_JSONL=true
export AMP_ARGS="--timeout 300 --verbose"
```

**Verification**:

```bash
amp-sessions verify-amp
```

## Database and Workspace Configuration

SQLite session database location is determined by [`getDbPath()`](/Users/sjarmak/amp-orchestrator/packages/core/src/config.ts):

- **macOS**: `~/Library/Application Support/ampsm/sessions.sqlite`
- **Windows**: `%APPDATA%/ampsm/sessions.sqlite`
- **Linux**: `~/.config/ampsm/sessions.sqlite`

Override with `AMPSM_DB_PATH` environment variable for multiple orchestrator instances.

## Security Considerations

- Configuration values containing `TOKEN`, `KEY`, or `SECRET` are automatically redacted in logs
- The `AMP_TOKEN` environment variable is passed through to child processes and injected into authentication commands
- Local development server mode bypasses authentication for easier development

## Common Failure Modes and Solutions

| Error                                           | Cause                        | Solution                                             |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| "AMP_BIN not configured"                        | Missing binary configuration | Set `AMP_BIN` or use `AMP_CLI_PATH` / `--amp-path`   |
| "Neither AMP_AUTH_CMD nor AMP_TOKEN configured" | Missing authentication       | Provide `AMP_TOKEN` or `AMP_AUTH_CMD`                |
| Auth succeeds but version check fails           | Binary issues                | Verify binary is executable and correct architecture |
| Unexpected server mode usage                    | Configuration conflicts      | Check for server URLs in YAML defaults               |

## Testing and Verification

The [`AUTHENTICATED_TESTS.md`](/Users/sjarmak/amp-orchestrator/docs/AUTHENTICATED_TESTS.md) document provides:

- End-to-end test harness examples
- CI/CD integration patterns
- Working minimal configuration setups

Key verification commands:

```bash
amp-sessions verify-amp          # Test authentication and basic functionality
amp-sessions config get          # Review current configuration
```

## Key Takeaways

1. **Single Resolver**: One hierarchical resolver controls all connection decisions
2. **Server vs Binary Mode**: Server URL resolution bypasses all local authentication
3. **Flexible Configuration**: CLI flags, YAML files, environment variables, and persisted config all work together
4. **Security First**: Automatic redaction of sensitive values and secure token handling
5. **Multi-Environment Support**: Seamlessly switch between production, local server, and local binary modes

This architecture enables developers to quickly switch between different Amp environments based on their workflow needs while maintaining security and configuration consistency.
