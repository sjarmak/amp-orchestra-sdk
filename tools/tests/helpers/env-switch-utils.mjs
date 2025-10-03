#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import orchestraUI from '../../amp_toolbox/orchestra-ui-helpers.mjs'

const BUNDLE_ID = 'com.sjarmak.amp-orchestra'
const REPO_ROOT = process.cwd() // We run from repo root
const LOG_FILE = path.join(REPO_ROOT, 'logs', 'ui-connection.log')
const DEV_APP = path.join(REPO_ROOT, 'desktop-ui', 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Amp Orchestra.app')

function homeConfigPaths() {
  const mac = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json')
  const xdg = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  return [mac, xdg]
}

function rmSafe(p) { try { fs.rmSync(p, { force: true, recursive: true }) } catch {}
}
function mkdirp(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {}
}
function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}
function writeFileSafe(p, s) { mkdirp(path.dirname(p)); fs.writeFileSync(p, s) }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function waitForAppReady(timeoutMs = 10000) {
  const start = Date.now()
  console.log('[TEST] Waiting for app to become ready...')
  
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = orchestraUI.evalJS('document.readyState')
      console.log(`[TEST] Document ready state: ${ready}`)
      if (ready === 'complete' || ready === 'interactive') {
        console.log('[TEST] App is ready!')
        return true
      }
    } catch (error) {
      console.log(`[TEST] Error checking ready state: ${error.message}`)
    }
    await wait(200)
  }
  throw new Error('App did not become ready')
}

function cleanEnv() {
  console.log('[TEST] Cleaning environment...')
  // Kill any existing app instance first
  try {
    spawnSync('killall', ['Amp Orchestra'], { stdio: 'ignore' })
    console.log('[TEST] Killed any existing app instances')
  } catch {}
  
  for (const p of homeConfigPaths()) {
    rmSafe(p)
    console.log(`[TEST] Removed config at ${p}`)
  }
  rmSafe(LOG_FILE)
  console.log('[TEST] Environment cleaned')
}

async function launchApp() {
  console.log(`[TEST] Looking for app at: ${DEV_APP}`)
  if (fs.existsSync(DEV_APP)) {
    console.log('[TEST] Launching app with open command...')
    const result = spawnSync('open', [DEV_APP], { stdio: 'inherit' })
    if (result.error) {
      throw new Error(`Failed to launch app: ${result.error.message}`)
    }
    console.log('[TEST] App launch command completed, waiting for startup...')
    await wait(3000) // Give app time to start
  } else {
    console.log('[TEST] Using orchestra-ui launch fallback...')
    orchestraUI.launch(BUNDLE_ID)
    await wait(3000) // Give app time to start
  }
}

function quitApp() { orchestraUI.quit(BUNDLE_ID) }

function focusApp() { orchestraUI.focus(BUNDLE_ID) }

async function openPreferences() {
  orchestraUI.keystroke(',', ['command'])
  await wait(400)
  // ensure switcher is open
  const start = Date.now()
  while (Date.now() - start < 3000) {
    try {
      if (orchestraUI.isEnvironmentSwitcherOpen()) return true
    } catch {}
    await wait(150)
  }
  throw new Error('Environment switcher did not open')
}

function getEnvBadge() { return orchestraUI.getEnvironmentBadgeText(BUNDLE_ID) }

async function waitForBadge(expected, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = safeGetEnvBadge()
    if (t === expected) return true
    await wait(200)
  }
  return false
}

function safeGetEnvBadge() {
  try { return getEnvBadge() } catch { return '' }
}

function setInputValueByLabelJS(labelText, value) {
  const js = `(() => {
    function findInputByLabel(text) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
      const candidates = []
      while (walker.nextNode()) {
        const el = walker.currentNode
        const textContent = (el.textContent || '').trim()
        if (!textContent) continue
        if (textContent.includes(text)) candidates.push(el)
      }
      for (const el of candidates) {
        const input = el.querySelector('input, textarea') || el.closest('label')?.querySelector('input, textarea')
        if (input) return input
      }
      // fallback: any input with placeholder matching label
      const byPlaceholder = Array.from(document.querySelectorAll('input, textarea')).find(i => (i.placeholder || '').includes(text))
      if (byPlaceholder) return byPlaceholder
      return null
    }
    const input = findInputByLabel(${JSON.stringify(labelText)})
    if (input) {
      input.focus(); input.value = ${JSON.stringify(value)};
      const evt = new Event('input', { bubbles: true }); input.dispatchEvent(evt);
      const chg = new Event('change', { bubbles: true }); input.dispatchEvent(chg);
      return true
    }
    return false
  })()`
  return orchestraUI.evalJS(js, BUNDLE_ID)
}

function clickByTextJS(text) {
  const js = `(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], input[type="radio"], label, a'))
    for (const el of all) {
      const t = (el.textContent || el.value || '').trim()
      if (t.includes(${JSON.stringify(text)})) { el.click(); return true }
    }
    return false
  })()`
  return orchestraUI.evalJS(js, BUNDLE_ID)
}

function selectLocalCLIAndSet(cliPath, serverUrl) {
  // Try to select Local CLI and set fields
  const selected = clickByTextJS('Local') || clickByTextJS('Local CLI')
  const ok1 = setInputValueByLabelJS('CLI Path', cliPath)
  const ok2 = setInputValueByLabelJS('Server URL', serverUrl)
  return Boolean(selected && ok1 && ok2)
}

function selectProduction() {
  return clickByTextJS('Production')
}

async function sendPingAndWait(timeoutMs = 6000) {
  const before = safeGetLastAssistantMessage()
  orchestraUI.keystroke('k', ['command'])
  orchestraUI.typeText('ping')
  orchestraUI.keystroke('\r')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const last = safeGetLastAssistantMessage()
    if (last && last !== before) return last
    await wait(250)
  }
  throw new Error('No assistant response to ping')
}

function safeGetLastAssistantMessage() {
  try { return orchestraUI.getLastAssistantMessage(BUNDLE_ID) } catch { return '' }
}

function checkErrorToast() {
  const js = `(() => {
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .toast, .Toastify__toast'))
    return alerts.map(a => a.textContent.trim()).join('\n')
  })()`
  return orchestraUI.evalJS(js, BUNDLE_ID)
}

function clickResetToDefaults() {
  return clickByTextJS('Reset') || clickByTextJS('Reset to Defaults')
}

export {
  BUNDLE_ID,
  REPO_ROOT,
  LOG_FILE,
  DEV_APP,
  homeConfigPaths,
  cleanEnv,
  launchApp,
  quitApp,
  focusApp,
  wait,
  waitForAppReady,
  openPreferences,
  getEnvBadge,
  waitForBadge,
  selectLocalCLIAndSet,
  selectProduction,
  sendPingAndWait,
  checkErrorToast,
  clickResetToDefaults,
  writeFileSafe,
  readFileSafe,
  rmSafe
}
