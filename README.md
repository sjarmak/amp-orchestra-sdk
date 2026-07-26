# Amp Orchestra SDK

**Status: archived.** This repo is the public half of the Amp Orchestra experiment from my time working on Amp, the agentic coding tool from Sourcegraph. Development stopped in October 2025; the code is kept as work history and is not maintained.

Amp Orchestra was a chat-first desktop IDE built around Amp agent sessions: a chat interface as the primary surface, an embedded Monaco editor, an xterm.js terminal, and one git worktree per session so parallel agent runs stay isolated. This repo extracts the core infrastructure from the earlier `amp-session-orchestrator` while rebuilding the UI around a chat-first workflow.

## Layout

Two workspaces share the repo: a pnpm workspace for TypeScript and a Cargo workspace for Rust.

- `desktop-ui/` - Tauri 2 desktop app; React 19 + Vite + Tailwind frontend with Monaco and xterm.js, Rust backend in `src-tauri/`
- `unified-core/` - Rust crate with the session domain model, a `GitBackend` trait for worktree create/list/cleanup, SQLite persistence via sqlx, and a batch/benchmark evaluation layer targeting SWE-bench-style runs
- `packages/amp-client` - standalone Amp authentication and API client, extracted from `amp-session-orchestrator`
- `packages/amp-backend-core` - core backend library that `amp-client` builds on
- `packages/workspace` - git and file operations
- `packages/tui-terminal`, `packages/shared` - terminal integration and common utilities

## What the experiment produced

The lasting output is the design record, kept in the repo root as working documents: `AMP-ORCHESTRA-UNIFIED-DESIGN.md` and `AMP-ORCHESTRA-ARCHITECTURE.md` for the target architecture, `WORKTREE_MANAGER_IMPLEMENTATION.md` for the worktree-per-session model, `STEP1-MIGRATION-ANALYSIS.md` for the planned move from a Node core to the Rust `unified-core` crate, and two postmortems on embedding the Amp TUI in a webview terminal (`TUI_TERMINAL_POSTMORTEM.md`, `TUI_TERMINAL_POSTMORTEM_SEPT2025.md`).

Built with TypeScript 5 and Rust (tokio, sqlx, git2), tested with Vitest, managed as pnpm and Cargo workspaces. MIT licensed.

## Related repos

- [`amp-session-orchestrator`](https://github.com/sjarmak/amp-session-orchestrator) - the earlier public orchestrator this repo extracted `amp-client` and core infrastructure from
- `amp-orchestra` - the private prototype this repo was split out of
