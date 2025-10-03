#!/usr/bin/env bash
set -euo pipefail

if [[ ${AMP_TOKEN:-} == "" ]]; then
  echo "AMP_TOKEN is not set. Export a valid token before running."
  exit 1
fi

log() { printf '%(%Y-%m-%d %H:%M:%S)T %b\n' -1 "$*"; }
NODE_BIN_DIR="/Users/sjarmak/.local/share/mise/installs/node/22.18.0/bin"
clean() { /usr/bin/env -i PATH="${NODE_BIN_DIR}:/usr/local/bin:/usr/bin:/bin" "$@"; }

run() {
  local name=$1; shift
  log "▶ $name"
  local output
  if output=$("$@" 2>&1); then
    if echo "$output" | grep -q '"success":true'; then
      log "✅ $name PASSED"
    else
      log "❌ $name FAILED - no success JSON"
      echo "$output" | head -3
    fi
  else
    log "❌ $name FAILED - command error"
    echo "$output" | head -3
  fi
}

# Layer 0: curl health checks (show actual errors)
log "▶ curl-prod"
if curl -sS https://ampcode.com/api/health 2>&1; then
  log "✅ curl-prod PASSED"
else
  log "❌ curl-prod FAILED"
fi

log "▶ curl-dev"
if curl -ksS https://localhost:7002/api/health 2>&1; then
  log "✅ curl-dev PASSED"
else
  log "❌ curl-dev FAILED (expected if no local server)"
fi

# Layer 1: CLI direct (check if binaries exist first)
if command -v amp >/dev/null 2>&1; then
  run "cli-prod " clean AMP_TOKEN=$AMP_TOKEN amp -x whoami --stream-json
else
  log "❌ cli-prod FAILED - amp binary not found in PATH"
fi

if command -v node >/dev/null 2>&1 && [[ -f /Users/sjarmak/amp/cli/dist/main.js ]]; then
  run "cli-dev  " clean AMP_TOKEN=$AMP_TOKEN AMP_URL=https://localhost:7002 NODE_TLS_REJECT_UNAUTHORIZED=0 \
    node /Users/sjarmak/amp/cli/dist/main.js -x whoami --stream-json
else
  log "❌ cli-dev FAILED - node not found or CLI file missing"
fi
