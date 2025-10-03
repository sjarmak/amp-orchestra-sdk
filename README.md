# Amp Orchestra

Chat-first IDE with Amp integration - think Conductor but open source.

## Architecture

- **apps/desktop** - Electron app with chat interface
- **packages/amp-client** - Amp API client (extracted from amp-session-orchestrator)
- **packages/workspace** - Git/file operations
- **packages/shared** - Common utilities

## Development

```bash
pnpm install
pnpm dev
```

## Migration from amp-session-orchestrator

This repo extracts the core infrastructure while rebuilding the UI around chat-first workflow.
