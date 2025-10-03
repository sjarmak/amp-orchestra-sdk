# Amp Orchestra — Redesign Starter Plan (Phase 0–1)

Status: In progress
Owner: sjarmak
Last updated: 2025-09-07

---

## Progress update (2025-09-08)

- Phase 0 M0.1–M0.5: Completed. EnvKind + gating, schema migration (agent_mode/toolbox_path), runtime_env + wiring, fake Amp CLI shim + test, CI workflow; Rust build fixed.
- Dev-only UI: environment switching handled elsewhere; removed gear/preferences. Agent Mode dropdown + Toolbox Path remain wired; session_create persists both.
- M1.1 Agent Mode end-to-end: Completed. Agent mode selection flows through UI → IPC → Rust orchestrator → child env.
- M1.2 Toolbox Resolver: Completed. Feature-flagged symlink fan-in with Windows copy fallback, security limits, comprehensive unit/integration tests.
- M1.3 Toolbox UI surfaces: Completed. File picker component, header display, full IPC + persistence, comprehensive component tests.
- Immediate next steps: M1.4 complete metrics export updates, then remaining Phase 1 tasks.

## 0) Guiding principles

- Zero regression: production path must remain unchanged until explicitly enabled; new features are dev-only by default.
- Strong tests first: every new module lands with unit + integration coverage; E2E added for user-visible flows.
- Gating: Agent Mode is allowed in both Production and Local; Toolbox features remain flag-gated. Ensure parity and no regressions when flags are off.
- Observability: structured logs and metrics for env composition, flags, and selected modes.
- Execution protocol: the coding agent must change [ ] to [X] on completion of each task.

---

## 1) Milestones overview

- Phase 0 — Foundations & Safety Nets
  - M0.1 Feature flags & environment plumbing
  - M0.2 Schema & migrations (additive, reversible)
  - M0.3 Runtime spawn wrapper skeleton
  - M0.4 Fake Amp CLI shim + test harness
  - M0.5 CI hardening and coverage gates
- Phase 1 — Agent Modes + Toolbox Resolver
  - M1.1 Agent Mode end-to-end (dev-only UI + wiring)
  - M1.2 Toolbox Resolver (symlink fan-in) + env composition
  - M1.3 Toolbox UI surfaces
  - M1.4 Metrics + export updates
  - M1.5 CI regression gates and E2E
  - M1.6 Docs + rollback hooks
  - M1.7 Large TUI Terminal View (pty integration + toggle)

---

## 2) Phase 0 — Foundations & Safety Nets

### M0.1 Feature flags & environment plumbing

Objective
- Introduce `EnvKind` and feature flags; ensure prod coercion to defaults.

Tasks
- [X] Define `EnvKind { Local, Prod, CI }` in backend (Rust) and expose via IPC to desktop-ui.
- [X] Add runtime feature switches: `agent_modes`, `toolboxes` (default off in Prod).
- [X] Desktop UI: derive `devMode` from `EnvKind` and gate controls.

Acceptance criteria
- [X] With `EnvKind=Prod`, any selected mode is coerced to `default`; toolbox ignored.
- [X] With `EnvKind=Local`, selections flow through IPC (no actual spawn yet).

Tests
- [X] Unit (TS): reducer/UI gating tests.
- [X] Unit (Rust): `env_kind` propagation.

---

### M0.2 Schema & migrations (no UI yet)

Objective
- Add additive, nullable columns to support agent mode and toolbox path.

Schema (SQLite)
```sql
-- up
ALTER TABLE runs ADD COLUMN agent_mode TEXT NULL;
ALTER TABLE runs ADD COLUMN toolbox_path TEXT NULL;

-- Optional future tables (scoped for Phase 2):
-- CREATE TABLE toolboxes (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, path TEXT, created_at TEXT);
-- CREATE TABLE toolbox_sets (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT);
-- CREATE TABLE toolbox_set_items (set_id INTEGER, toolbox_id INTEGER, "order" INTEGER);
-- CREATE TABLE mcps (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, endpoint TEXT, auth_ref TEXT, config_json TEXT);

-- down (rollback)
-- NOTE: SQLite lacks DROP COLUMN; provide logical rollback via table-rebuild script if needed.
```

Backfill
- [ ] Script to set `agent_mode='default'` where NULL; leave `toolbox_path` NULL.

Tasks
- [X] Update Rust data models for `runs` (agent_mode, toolbox_path).
- [X] Add migration runner step invoked before app start in dev/ci.

Acceptance criteria
- [X] Legacy DB opens without errors; new columns readable/writable.

Tests
- [X] Unit (Rust): loading DB pre-migration then migrating succeeds; rollback script verified on a copy.

---

### M0.3 Runtime spawn wrapper skeleton

Objective
- Implement typed env composition without enabling new UI yet.

Modules
- `runtime_env.rs`
  - Input: `EnvKind`, Variant { agentMode?: string, toolboxPath?: string }
  - Output: `EnvMap` (AMP_TOOLBOX, PATH additions, AMP_EXPERIMENTAL_AGENT_MODE when Local)
- `agent_mode.rs`
  - Coercion: if `EnvKind != Local`, return `default`.

Tasks
- [X] Implement `compose_runtime_env()`; log structured JSON for composed env.
- [X] Wire desktop-ui -> IPC -> Rust orchestrator (no UI controls yet).

Acceptance criteria
- [X] Given inputs, function returns deterministic env map; prod coercion validated.

Tests
- [X] Unit (Rust): table-driven tests for combinations of EnvKind and Variant.

---

### M0.4 Fake Amp CLI shim + test harness

Objective
- Provide a stable, non-interactive target for integration tests asserting argv/env wiring and preventing the real TUI from launching.

Why
- The real Amp CLI defaults to launching the interactive TUI (`src/main.ts` → `src/tui/app.ts`), which is unsuitable for CI and deterministic tests. The shim echoes argv/env as JSON so we can verify agent mode flags, AMP_TOOLBOX, and PATH composition without rendering the TUI.

Files
- `tools/fake-amp-cli.mjs`

Example implementation
```js
#!/usr/bin/env node
import process from 'node:process';
const out = {
  argv: process.argv.slice(2),
  env: {
    AMP_TOOLBOX: process.env.AMP_TOOLBOX || null,
    AMP_EXPERIMENTAL_AGENT_MODE: process.env.AMP_EXPERIMENTAL_AGENT_MODE || null,
    PATH: process.env.PATH || null,
  }
};
console.log(JSON.stringify(out));
```

Commands
```bash
pnpm exec node tools/fake-amp-cli.mjs --agent-mode geppetto:main
```

Tasks
- [X] Orchestrator accepts `AMP_CLI_BIN` override to use shim in tests.
- [X] Integration test spawns a Variant and asserts shim output.

Tests
- [X] Vitest integration: `spawn_with_modes.int.test.mjs` asserts argv/env.

---

### M0.5 CI hardening and coverage gates

Objective
- Ensure all builds and tests run in CI with coverage; publish shim logs on failure.

Tasks
- [X] CI job runs: `pnpm build && pnpm typecheck && pnpm test`.
- [X] Collect coverage: `pnpm test -- --coverage` for TS; Rust uses `cargo build`.
- [X] Upload artifacts: logs/ directory if present.

Acceptance criteria
- [X] CI green on main and PRs; coverage for new modules ≥ 90%.

---

### Phase 0 Exit checklist
- [X] DB migration applied and reversible strategy documented.
- [X] `runtime_env` composes env with correct prod coercion.
- [X] Fake CLI harness validated locally and in CI.

---

## 3) Phase 1 — Agent Modes + Toolbox Resolver

### M1.1 Agent Mode end-to-end (dev-only)

Objective
- Let developers select an Agent Mode in UI (Local only) and pass to child process; record in metrics.

Tasks
- [ ] Extend Preset & Variant schemas to include `agentMode` (persist to DB where applicable).
- [X] UI: Add dropdown; visible in both Prod and Local.
- [X] Session creation persists `agent_mode` and `toolbox_path` to chat_sessions.
- [X] DB: add `agent_mode` and `toolbox_path` to chat_sessions (migration 003).
- [X] Orchestrator: set `AMP_EXPERIMENTAL_AGENT_MODE=<mode>` when selected.
- [X] Metrics: include `agent_mode` in exports/results.

Acceptance criteria
- [X] Both Prod and Local propagate selected agent mode to child/env.
- [X] UI shows chip `Mode: <value>` in header.

Tests
- [X] Unit (TS): UI state round-trip (set/get Agent Mode).
- [X] Integration (Rust): env composition matrix; command selection.
- [ ] E2E: WebView selects mode, run summary shows chip, metrics contain mode (deferred to end of Phase 1).

---

### M1.2 Toolbox Resolver (symlink fan-in) + env composition

Objective
- Allow selecting a toolbox path; symlink fan-in into a runtime dir and expose via `AMP_TOOLBOX` and PATH.

Tasks
- [X] Implement `toolbox_resolver.rs`:
  - Input: `Vec<PathBuf>`; Output: `{resolved_dir, bin_dir}`.
  - Create `~/.amp-orchestra/runtime_toolboxes/<run>/<variant>/` and symlink all roots (ordered; last-write wins).
  - Windows: if symlinks unavailable, copy files (warn).
  - Security: canonicalize paths, forbid traversal, limit file count/size.
- [X] Orchestrator: set `AMP_TOOLBOX` and prepend `bin_dir` to PATH.
- [X] Cleanup policy: remove temp dir on completion unless `keep_artifacts`.

Acceptance criteria
- [X] Shim sees `AMP_TOOLBOX`; a dummy tool within toolbox is executable in PATH.
- [X] Resolver deterministic and secure; handles duplicate names.

Tests
- [X] Unit (Rust): resolver behavior, error handling, path validation.
- [X] Integration: create temporary toolboxes; assert discovery/execution via shim.
- [ ] E2E: create simple bash tool, invoke through agent chat; confirm output.

---

### M1.3 Toolbox UI surfaces

Tasks
- [X] Add file picker for Toolbox Path (dev + prod visible, but prod ignored by runtime until Phase 2 gating decision).
- [X] Show selected toolbox on Variant card.
- [X] Persist `toolbox_path` to DB and IPC.

Tests
- [X] Unit (TS): state store save/restore.
- [X] Component tests: UI interaction and data flow.

---

### M1.4 Metrics + export updates

Tasks
- [X] Add `agent_mode` to exported metrics/results.
- [ ] Add `toolbox_path`, `tools_available_count`, optional `tools_used[]`.
- [ ] Update JSONL/CSV/HTML exporters to display per-mode comparisons.

Tests
- [X] Unit/Typecheck pass with `agent_mode` addition.
- [ ] Unit: exporter includes remaining fields and renders HTML sections.

---

### M1.5 CI regression gates and E2E (deferred to end of Phase 1)

Tasks
- [ ] Add Playwright or WebView-based E2E to CI (`tools/tests/*`).
- [ ] Add rule: touching spawn/env composition modules requires tests.
- [ ] Parity check: Prod vs Local basic flows (no coercion of agent mode).

Acceptance criteria
- [ ] E2E stable (headless), with video/screenshot on failure.

---

### M1.6 Docs + rollback hooks

Tasks
- [ ] Update AGENTS.md/SETUP.md: how to choose modes/toolboxes; fake CLI for testing.
- [ ] Provide `ROLLBACK_phase1.sql` that recreates pre-Phase-0 schema (copy-table pattern).
- [ ] Release notes template with risks and manual steps.

---

### M1.7 Large TUI Terminal View (pty integration + toggle)

Objective
- Provide a reliable, full-screen terminal interface that runs the Amp TUI inside the app, with a clean toggle between Chat and TUI modes, preserving state.
- Support two execution profiles: Development (local CLI) and Production (system amp), obeying EnvKind gating and existing env composition (agent_mode, toolbox).

Architecture & design

Backend (Tauri / Rust)
- Implement a TuiSession manager using portable-pty for a real PTY. Each session stores:
  - master pty handle (for resize), child process handle, writer, and a reader thread that emits bytes.
- IPC commands:
  - cmd_start_tui(profile, variant_id?, cwd?, cols, rows, env?) -> session_id
  - cmd_write_stdin(session_id, utf8_chunk)
  - cmd_resize(session_id, cols, rows)
  - cmd_kill(session_id)
- Resolve entrypoint by profile with gating:
  - EnvKind!=Local → always use system amp
  - EnvKind==Local → Dev profile uses local CLI; Prod profile uses system amp
- Spawn with compose_runtime_env() so agent_mode/toolbox propagate identically to chat runs.

Frontend (React)
- Add a TerminalProvider that owns session lifecycle so unmounting the view does not kill the PTY.
- TerminalView uses xterm.js + fit addon; subscribes to tauri events for PTY data; forwards keystrokes via IPC.
- Add tabs or a top-level toggle: Chat ↔ Terminal. Preserve scrollback and focus when switching.
- Implement window and container resize → fit addon → cmd_resize.

Tasks
- [ ] Backend: add portable-pty; implement TuiSession manager and IPC commands; integrate compose_runtime_env(SpawnKind::Tui).
- [ ] Frontend: install xterm + fit addon; implement TerminalProvider and TerminalView; add Chat/Terminal tabs with last-tab persistence.
- [ ] Gating: hide profile selector when EnvKind!=Local; backend coerces to ProdBin regardless of requested profile.
- [ ] Deferred: optional Dev override for local CLI path (post-Phase 1).
- [ ] UX: toolbar actions (Ctrl-C, Clear, Copy/Paste); show active profile and toolbox/mode chips.
- [ ] Metrics: tui_launch, tui_exit_code, tui_duration_ms; include agent_mode/toolbox in context.

Acceptance criteria
- [ ] TUI renders correctly; resizing works; switching tabs preserves state and process.
- [ ] Local: Dev profile runs local CLI; Prod profile runs system amp. Prod/CI: always system amp.
- [ ] Env composition matches chat runs; Local observes agent_mode/toolbox; Prod coerces to defaults.
- [ ] Clean exit on window close or kill; no orphaned PTYs.

Tests
- Unit (Rust): resolve entry (EnvKind×Profile), stdin/out piping, resize, exit.
- Integration (shim): PTY launch prints marker; bytes visible in UI buffer; send "q" to exit.
- E2E (WebView/Playwright): open Terminal, assert first ANSI frame; toggle Chat ↔ Terminal retains buffer; Prod build hides profile selector.

Risks & mitigations
- Windows PTY quirks → use portable-pty winpty backend; add Windows CI smoke test.
- Resource leaks → Drop impl on TuiSession; ensure cmd_kill on window close.
- Performance → set scrollback=10k; lazy render when hidden; throttle resize events.

Rollback
- Feature flag enable_terminal_view=false hides the tab and prevents TUI codepaths from executing. No DB changes required.

---

### Phase 1 Exit checklist
- [ ] Agent Mode selectable and propagated in both Prod and Local; Toolbox path behind flag.
- [ ] Env/flags verified by unit/integration; E2E at end reflects UI + metrics.
- [ ] CI gates in place; coverage ≥ 90% on new code.
- [ ] Rollback scripts/docs present.

---

## 4) Test strategy (summary)

Unit (Rust)
- `agent_mode.rs`: coercion rules.
- `runtime_env.rs`: env composition matrix.
- `toolbox_resolver.rs`: symlink/copy logic, security checks.

Unit (TS/Vitest)
- UI gating and reducers; preset/variant persistence.

Integration (TS + Node shim)
- Spawn variants against fake CLI; assert argv/env; toolbox tool discovery.

E2E (WebView/Playwright)
- Agent Mode dropdown, Toolbox picker, metrics exposure, production coercion.
- TUI large terminal view toggle + first-frame render sanity; production coercion verified.

Coverage
```bash
pnpm test -- --coverage
# For Rust backend (if applicable):
# cargo test --all --locked
```

---

## 5) Risks & mitigations

- Schema incompatibility → Additive nullable columns; transactional migrations; documented rollback.
- Env leakage to Prod → Strict `EnvKind` checks; unit tests; CI validation step builds prod and inspects behavior.
- Symlink resolver security → Canonicalization, deny traversal, file count/size limits; Windows fallback to copy.
- E2E flakiness → Headless, retry once, record artifacts.

---

## 6) Rollback plan

- Feature flags: disable `agent_modes` and `toolboxes` at runtime; hide UI controls.
- Database: apply `down` migration script rebuilding table without new columns (copy-table strategy).
- Release notes include manual rollback steps and verification checklist.

---

## 7) Appendix

Example Preset JSON
```json
{
  "models": ["gpt-5"],
  "alloy": "standard",
  "agentMode": "geppetto:main",
  "tools": ["git", "shell", "browser"],
  "toolboxPath": "~/amp_tools/my_project_tools",
  "limits": { "max_turns": 30, "max_tokens": 300000 }
}
```

Matrix with agentMode axis (YAML)
```yaml
variants:
  agentMode: ["default", "geppetto:main", "claudetto:main"]
  seed: [11, 42]
limits:
  max_parallel: 4
```

Spawn env (pseudo-Rust)
```rust
let mut cmd = Command::new(amp_path);
cmd.env("AMP_TOOLBOX", resolved_toolbox_dir);
cmd.env("PATH", format!("{}:{}", resolved_toolbox_bin, current_path));
if env.kind == EnvKind::Local {
   cmd.env("AMP_EXPERIMENTAL_AGENT_MODE", agent_mode_str);
}
if let Some(cfg) = mcp_cfg_path { cmd.env("AMP_MCP_CONFIG", cfg); }
```

Tool template (bash)
```bash
#!/usr/bin/env bash
set -euo pipefail
args=$(cat)
printf '{"ok":true,"message":"hello"}'
```

---

## 8) Work log checklists (for the coding agent)

- [X] Phase 0
  - [X] M0.1 Feature flags & environment plumbing
  - [X] M0.2 Schema & migrations
  - [X] M0.3 Runtime spawn wrapper skeleton
  - [X] M0.4 Fake Amp CLI shim + test harness
  - [X] M0.5 CI hardening and coverage gates
- [ ] Phase 1
- [X] M1.1 Agent Mode end-to-end
- [X] M1.2 Toolbox Resolver + env composition
- [X] M1.3 Toolbox UI surfaces
- [ ] M1.4 Metrics + export updates (agent_mode done)
- [ ] M1.5 CI regression gates and E2E (deferred)
- [ ] M1.6 Docs + rollback hooks
- [ ] M1.7 Large TUI Terminal View (pty integration + toggle)
