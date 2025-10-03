# ENV_SWITCH_TEST_PLAN.md
Test plan for verifying that the in-app “Environment Switcher” UI controls all runtime behaviour of the Desktop UI (Tauri) without relying on external shell variables.

## 1 — Scope & Objectives
1. Validate that the UI toggles between:
   • Production (System amp binary)
   • Local CLI (Node script path + https://localhost:7002)
2. Ensure settings are stored in AppConfig and survive full app restarts.
3. Confirm set_environment() Tauri command mutates AppState and that no external env vars influence behaviour.
4. Check UX feedback (icons / labels) reflects the active environment.
5. Verify graceful error handling when a bogus CLI path is supplied.
6. Verify “Reset to Defaults” returns the app to pristine Production mode.

## 2 — Prerequisites

| Item | Notes |
| --- | --- |
| OS | macOS or Linux workstation with Node ≥18 |
| Project | Fresh git clone of monorepo, branch env-switch-tests |
| PNPM | npm i -g pnpm |
| Amp assets | • System amp binary on PATH (Production) • Local CLI build ~/amp/cli/dist/main.js |
| No servers | Do not run local Amp server; tests only assert path/env passed to CLI. |
| Orchestra | tools/amp_toolbox/orchestra-ui available for automation |

## 3 — Logging & Observability guards

1. Rust back-end writes to ~/amp-orchestra/logs/ui-connection.log (check env.AMP_* lines)
2. EnhancedAmpClient prints [DEBUG] keys and STREAMING_EVENT lines
3. UI badge data-test-id=env-badge should reflect mode

## 4 — Automation Harness

Use orchestra-ui to launch/focus and type. Future: vitest runner alias `pnpm test:env-switch`.

## 5 — Test Matrix & Steps

Each test starts with a clean config (remove ~/.config/ampsm/config.json) and empty logs.

### TC-1 Switch to Production (system amp)
- Launch app, expect env-badge “Production”
- Send prompt, assert ui-connection.log shows AMP_BIN=amp, no AMP_URL/AMP_CLI_PATH
- Renderer console shows amp version

### TC-2 Switch to Local CLI (node path)
- Open Prefs, enable Local CLI, set CLI Path=~/amp/cli/dist/main.js, Server URL=https://localhost:7002
- Send prompt, assert env shows AMP_CLI_PATH and AMP_URL, NODE_TLS_REJECT_UNAUTHORIZED present
- Renderer shows node … main.js executing

### TC-3 Persistence across restart
- Restart app; env-badge remains “Local CLI”; logs show same env

### TC-4 Bad path error handling
- Set CLI Path=/bad/path
- Expect toast/error, child not spawned, ui-connection.log shows spawn failure

### TC-5 UI indicators accuracy
- Verify env-badge text/color updates instantly on switches

### TC-6 Clear to defaults
- Use Reset to Defaults; restart; env-badge “Production”; logs show system amp

## 6 — CLI Assertions Cheat-Sheet

| Mode | Must have | Must NOT have |
| --- | --- | --- |
| Production | AMP_BIN=amp | AMP_CLI_PATH, AMP_URL |
| Local CLI | AMP_CLI_PATH=/abs/path/main.js, AMP_URL=https://localhost:7002 | – |

## 7 — Pass / Fail Criteria
- All TCs green, no shell env needed, AppConfig persists correctly.

## 8 — Next Steps
- Add missing data-test-ids and toasts if needed
- Wire a visible Reset to Defaults
- Add CI job running this suite on PRs affecting desktop-ui
