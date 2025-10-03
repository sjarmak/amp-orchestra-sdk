# AGENTS.md

## Commands

- **Build all**: `pnpm build` (runs tsc in each package)
- **Test all**: `pnpm test` (runs vitest in each package)
- **Test single package**: `cd packages/[name] && pnpm test` or `pnpm --filter @ampsm/[name] test`
- **Typecheck**: `pnpm typecheck` (runs tsc --noEmit in each package)
- **Dev mode**: `pnpm dev` (parallel dev servers)

### Rust Commands

- **Build Rust**: `cargo build` (default modern implementation)
- **Build with legacy**: `cargo build --features legacy_node` (compatibility mode)
- **Test Rust**: `cargo test` (modern tests)
- **Test with legacy**: `cargo test --features legacy_node` (legacy + modern tests)
- **Check all**: `cargo check` and `cargo check --features legacy_node`

### Amp Configuration

To use production Amp instead of local development:
```bash
export AMP_BIN=amp  # Use system amp binary instead of local CLI
unset AMP_CLI_PATH  # Remove local CLI path
unset AMP_URL       # Use default production URL
```

To use local development (requires local server at localhost:7002):
```bash
export AMP_CLI_PATH=~/amp/cli/dist/main.js
export AMP_URL=https://localhost:7002
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Architecture

Monorepo with pnpm workspaces:

- **desktop-ui** - Tauri app (React + Vite) with chat interface
- **packages/amp-client** - Amp API authentication and client library
- **packages/workspace** - Git/file operations utilities
- **packages/shared** - Common utilities (referenced in tsconfig but may not exist yet)

## Code Style

- **TypeScript**: Strict mode, ES2022 target, ESNext modules
- **Imports**: ESM only (`"type": "module"`), allow `.ts` extensions
- **Exports**: Multi-format exports (ESM/CJS) with `dist/` output
- **Build**: Use `tsc` for libraries, `tsup` for workspace package
- **Tests**: Vitest framework
- **Naming**: Scoped packages `@ampsm/[name]`

## Testing Tools

### Orchestra UI Automation

The `tools/amp_toolbox/orchestra-ui` tool now supports WebView JavaScript evaluation:

```bash
# Basic usage
echo '{"cmd": "webviewEval", "expr": "document.title"}' | TOOLBOX_ACTION=execute node tools/amp_toolbox/orchestra-ui

# Using helpers
import orchestraUI from './tools/amp_toolbox/orchestra-ui-helpers.mjs'
const envBadge = orchestraUI.getEnvironmentBadgeText()
const isReady = orchestraUI.evalJS('document.readyState === "complete"')
```

**E2E Bridge Functions:**
- `getEnvironmentBadgeText()` - Get current environment (Production/Local)
- `getLastAssistantMessage()` - Get last chat response
- `getChatInputValue()` - Get chat input field value
- `getAllMessages()` - Get all chat messages
- `isEnvironmentSwitcherOpen()` - Check if env switcher dialog is open

**Enhanced Tests:**
- `tools/test-webview-eval.mjs` - Basic WebView evaluation test
- `tools/tests/env-switch-runner-enhanced.mjs` - Enhanced environment switching test with UI state verification

## Toolbox Resolver (dev-only flag)

- Enable merged toolbox PATH in spawns:
  - Set `AMP_ENABLE_TOOLBOXES=1`
  - Provide roots via `AMP_TOOLBOX_PATHS` (colon- or comma-separated on POSIX, semicolon on Windows)
  - On spawn, PATH is prepended with `~/.amp-orchestra/runtime_toolboxes/<hash>/bin` and `AMP_TOOLBOX` is set to the runtime dir
- Limits (override via env): `AMP_TOOLBOX_MAX_FILES` (default 10000), `AMP_TOOLBOX_MAX_MB` (default 500)
- Windows: hardlink/copy fallback when symlinks unavailable

Fake CLI shim for env/argv assertions:
- tools/fake-amp-cli.mjs
- Example: `pnpm exec node tools/fake-amp-cli.mjs --agent-mode geppetto:main`

## Continuous Integration

### Windows CI Support (M1.7 Preparation)

The project includes comprehensive CI support across platforms:

- **Cross-Platform CI** (`cross-platform-ci.yml`) - Linux, Windows, and macOS build testing
- **Windows CI** (`windows-ci.yml`) - Dedicated Windows-specific testing with PTY support
- **Toolbox Resolver** (`toolbox-resolver.yml`) - Multi-platform toolbox testing

**PTY Support Testing:**
- Added `portable-pty` dependency for cross-platform terminal support
- Created comprehensive PTY smoke tests in `desktop-ui/src-tauri/tests/pty_smoke_test.rs`
- Tests basic PTY operations, platform-specific commands, and error handling
- Validates Windows winpty backend and Unix PTY systems

**Windows-Specific Features:**
- Uses PowerShell as default shell on Windows CI
- Installs winpty via Chocolatey for proper PTY support
- Tests both cmd.exe and PowerShell command execution
- Handles Windows path separators correctly (`\` vs `/`)

Run PTY smoke tests locally:
```bash
cd desktop-ui/src-tauri
cargo test --test pty_smoke_test -- --nocapture
```

## Debugging

### Authentication Issues
Enable debug logging for authentication by setting:
```bash
export AMP_DEBUG=true
```

This provides detailed logging for:
- Command execution with working directories
- Environment variables (keys only, values are redacted)
- stdout/stderr output from amp commands
- Authentication flow steps
- Version checking

### File Links
- File links (`file://path/to/file.ts#L32`) now automatically open in VSCode
- Supports line numbers and ranges (`#L32`, `#L32-L42`)
- Falls back to system default if VSCode unavailable
- Debug logs prefixed with `[FILE_LINKS]` in browser console

## Design Guidelines (Match conductor.build)

- **Layout**: Three-panel layout (sidebar, main content, right panel)
- **Theming**: Dark/light mode toggle with consistent theme variables
- **Colors**: Uses CSS custom properties for theming, clean contrasts
- **Typography**: Clean hierarchy, readable font sizes, proper spacing
- **Sidebar**: File tree with Lucide React icons, workspace switcher, minimal chrome
- **Chat**: Spacious messages, clean input, subtle shadows
- **Buttons**: Rounded corners, subtle hover states, modern styling
- **Spacing**: Generous whitespace, proper padding/margins
- **Modern**: Clean borders, subtle shadows, minimal visual noise
- **ABSOLUTELY NO EMOJIS IN THE UI** - Use Lucide React icons instead
- **Theme System**: Uses ThemeProvider context with localStorage persistence

## TUI Terminal Integration

The app includes a sophisticated Terminal User Interface (TUI) system based on Amp CLI:

- **TUI Package**: `@ampsm/tui-terminal` - Flutter-inspired widget framework for terminals
- **Framework Features**:
  - StatefulWidget/StatelessWidget patterns with proper lifecycle methods
  - Unicode support with proper grapheme segmentation (`splitIntoGraphemes()`)
  - Text selection system with cross-widget selection and copy support
  - Theme system with dark/light modes matching the main app
  - Keyboard shortcuts (Ctrl+C copy/exit, PageUp/Down scrolling, Alt+D debug)
  
- **Terminal Widgets**:
  - `MessageView` - Scrollable conversation history with text selection
  - `Autocomplete` - Smart completion for `/` commands and `@` file mentions  
  - `ConfirmationWidget` - Interactive user approval dialogs
  - `ActiveTools` - Real-time display of running bash commands
  - `DebugOverlay` - Development tools and diagnostics (Alt+D)
  - `ThinkingBlockManager` - Collapsible reasoning displays (Ctrl+R)
  
- **Input Features**:
  - Shell mode with `$` (normal) and `$$` (hidden/incognito) prefixes
  - Multi-line text editing with word wrapping
  - History navigation with up/down arrows
  - Enter to send, Escape to cancel/dismiss
  
- **Integration**: `TuiTerminal` React component in `desktop-ui/src/components/terminal/`
- **Testing**: Comprehensive test runner with raw terminal input simulation
- **Dependencies**: Requires `winston`, `wrap-ansi`, `open-simplex-noise` for full functionality
