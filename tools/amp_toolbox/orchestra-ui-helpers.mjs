#!/usr/bin/env node

// Helper functions for orchestra-ui WebView evaluation
// Makes it easier to use the E2E bridge methods

import { spawnSync } from 'node:child_process'
import path from 'node:path'

const DEFAULT_BUNDLE_ID = 'com.sjarmak.amp-orchestra'
const ORCHESTRA_UI_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), 'orchestra-ui')

function ui(args) {
  const env = { ...process.env, TOOLBOX_ACTION: 'execute' }
  const res = spawnSync('node', [ORCHESTRA_UI_PATH], {
    input: JSON.stringify(args), 
    stdio: ['pipe', 'pipe', 'pipe'], 
    env
  })
  if (res.status !== 0) {
    throw new Error(res.stderr.toString() || 'orchestra-ui failed')
  }
  const output = res.stdout.toString().trim()
  try {
    return JSON.parse(output)
  } catch {
    return output
  }
}

function webviewEval(expr, bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'webviewEval', bundleId, expr })
}

// E2E Bridge helper functions
export function getEnvironmentBadgeText(bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval('window.__AMP_E2E_BRIDGE__.getEnvironmentBadgeText()', bundleId)
}

export function getLastAssistantMessage(bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval('window.__AMP_E2E_BRIDGE__.getLastAssistantMessage()', bundleId)
}

export function getChatInputValue(bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval('window.__AMP_E2E_BRIDGE__.getChatInputValue()', bundleId)
}

export function getAllMessages(bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval('window.__AMP_E2E_BRIDGE__.getAllMessages()', bundleId)
}

export function isEnvironmentSwitcherOpen(bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval('window.__AMP_E2E_BRIDGE__.isEnvironmentSwitcherOpen()', bundleId)
}

// General WebView evaluation
export function evalJS(expr, bundleId = DEFAULT_BUNDLE_ID) {
  return webviewEval(expr, bundleId)
}

// Other UI actions
export function launch(bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'launch', bundleId })
}

export function focus(bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'focus', bundleId })
}

export function keystroke(text, modifiers = [], bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'keystroke', text, modifiers, bundleId })
}

export function typeText(text, bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'typeText', text, bundleId })
}

export function paste(text, bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'paste', text, bundleId })
}

export function clickMenu(menuPath, bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'menu', text: menuPath, bundleId })
}

export function quit(bundleId = DEFAULT_BUNDLE_ID) {
  return ui({ cmd: 'quit', bundleId })
}

export function sleep(delayMs) {
  return ui({ cmd: 'sleep', delayMs })
}

// Export the raw ui function for custom commands
export { ui }

// Default export for convenience
export default {
  ui,
  webviewEval,
  getEnvironmentBadgeText,
  getLastAssistantMessage,
  getChatInputValue,
  getAllMessages,
  isEnvironmentSwitcherOpen,
  evalJS,
  launch,
  focus,
  keystroke,
  typeText,
  paste,
  clickMenu,
  quit,
  sleep
}
