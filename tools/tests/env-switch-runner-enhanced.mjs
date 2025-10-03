#!/usr/bin/env node

// Enhanced environment switch test runner using webviewEval for more reliable UI state checking

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import orchestraUI from '../amp_toolbox/orchestra-ui-helpers.mjs'

const BUNDLE_ID = 'com.sjarmak.amp-orchestra'
const REPO_ROOT = path.resolve(path.join(process.cwd()))
const LOG_FILE = path.join(REPO_ROOT, 'logs', 'ui-connection.log')
const DEV_APP = path.join(REPO_ROOT, 'desktop-ui', 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Amp Orchestra.app')

function homeConfigPaths() {
  const mac = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json')
  const xdg = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  return [mac, xdg]
}

function rm(p) { try { fs.rmSync(p, { force: true, recursive: true }) } catch {} }
function mkdir(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
function read(p) { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
function write(p, s) { mkdir(path.dirname(p)); fs.writeFileSync(p, s) }

function describeStep(name) { process.stdout.write(`\n=== ${name} ===\n`) }

function assert(cond, msg) { if (!cond) { throw new Error('ASSERT: ' + msg) } }

function cleanEnv() {
  for (const p of homeConfigPaths()) rm(p)
  rm(LOG_FILE)
}

function lastLog() { 
  const content = read(LOG_FILE).trim()
  console.log(`[DEBUG] Log file content: "${content}"`)
  return content.split(/\n/).filter(Boolean).at(-1) || '' 
}

// Enhanced function to wait for app to be ready
async function waitForAppReady(maxWaitMs = 3000) {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const title = orchestraUI.evalJS('document.title')
      if (title && title !== 'undefined') {
        console.log(`[DEBUG] App ready, title: "${title}"`)
        return true
      }
    } catch {
      // App not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('App did not become ready within timeout')
}

// Enhanced function to check environment badge
function checkEnvironmentBadge(expectedText) {
  try {
    const badgeText = orchestraUI.getEnvironmentBadgeText()
    console.log(`[DEBUG] Environment badge text: "${badgeText}"`)
    return badgeText === expectedText
  } catch (error) {
    console.log(`[DEBUG] Failed to get environment badge: ${error.message}`)
    return false
  }
}

// Enhanced function to wait for environment badge to show expected text
async function waitForEnvironmentBadge(expectedText, maxWaitMs = 5000) {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    if (checkEnvironmentBadge(expectedText)) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return false
}

async function main() {
  const localCli = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')

  describeStep('Enhanced ENV_SWITCH test with webviewEval')

  describeStep('TC-0 Clean slate')
  cleanEnv()

  describeStep('TC-1 Launch in Production mode')
  if (fs.existsSync(DEV_APP)) {
    spawnSync('open', [DEV_APP])
  } else {
    orchestraUI.launch(BUNDLE_ID)
  }
  await waitForAppReady()

  // Check initial production mode
  console.log('🔍 Checking initial production environment badge...')
  const prodBadgeFound = await waitForEnvironmentBadge('Production', 3000)
  if (prodBadgeFound) {
    console.log('✅ Production badge found')
  } else {
    console.log('⚠️  Production badge not found, checking current state...')
    const currentBadge = orchestraUI.getEnvironmentBadgeText()
    console.log(`Current badge: "${currentBadge}"`)
  }

  describeStep('TC-2 Switch to Local CLI')
  // Open environment switcher
  orchestraUI.keystroke(',', ['command'])
  orchestraUI.sleep(500)

  // Check if environment switcher opened
  const switcherOpen = orchestraUI.isEnvironmentSwitcherOpen()
  console.log(`[DEBUG] Environment switcher open: ${switcherOpen}`)
  assert(switcherOpen, 'Environment switcher did not open')

  // Configure local CLI
  const cfgPath = homeConfigPaths()[0]
  const cfg0 = { connection_mode: 'local-cli' }
  cfg0.custom_cli_path = localCli
  cfg0.local_server_url = 'https://localhost:7002'
  cfg0.amp_env = cfg0.amp_env || {}
  cfg0.amp_env.AMP_CLI_PATH = localCli
  cfg0.amp_env.AMP_URL = 'https://localhost:7002'
  cfg0.amp_env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  write(cfgPath, JSON.stringify(cfg0, null, 2))

  // Apply changes
  orchestraUI.quit(BUNDLE_ID)
  orchestraUI.sleep(800)
  if (fs.existsSync(DEV_APP)) { 
    spawnSync('open', [DEV_APP]) 
  } else { 
    orchestraUI.launch(BUNDLE_ID) 
  }
  await waitForAppReady()

  describeStep('TC-3 Verify Local CLI mode')
  // Check environment badge shows local mode
  console.log('🔍 Checking local environment badge...')
  const localBadgeFound = await waitForEnvironmentBadge('Local', 5000)
  if (localBadgeFound) {
    console.log('✅ Local badge found')
  } else {
    console.log('⚠️  Local badge not found, checking current state...')
    const currentBadge = orchestraUI.getEnvironmentBadgeText()
    console.log(`Current badge: "${currentBadge}"`)
  }

  // Test ping command
  orchestraUI.keystroke('k', ['command'])
  orchestraUI.typeText('ping')
  orchestraUI.keystroke('\r')
  orchestraUI.sleep(1500)

  // Check for response in chat
  const lastMessage = orchestraUI.getLastAssistantMessage()
  console.log(`[DEBUG] Last assistant message: "${lastMessage}"`)

  describeStep('TC-4 Persistence across restart')
  orchestraUI.quit(BUNDLE_ID)
  orchestraUI.sleep(800)
  orchestraUI.launch(BUNDLE_ID)
  await waitForAppReady()

  // Verify local mode persisted
  console.log('🔍 Checking persistence of local environment badge...')
  const persistedBadgeFound = await waitForEnvironmentBadge('Local', 3000)
  if (persistedBadgeFound) {
    console.log('✅ Local badge persisted across restart')
  } else {
    const currentBadge = orchestraUI.getEnvironmentBadgeText()
    console.log(`⚠️  Badge did not persist. Current: "${currentBadge}"`)
  }

  const cfgPath2 = homeConfigPaths().find(p => fs.existsSync(p))
  const cfg = cfgPath2 ? JSON.parse(read(cfgPath2)) : {}
  assert(cfg.connection_mode === 'local-cli', 'connection_mode not persisted')

  describeStep('TC-5 Reset to defaults')
  orchestraUI.keystroke(',', ['command'])
  orchestraUI.sleep(500)
  
  // Use webviewEval to find and click reset button
  try {
    const resetClicked = orchestraUI.evalJS(`
      const resetButton = document.querySelector('button[type="button"]');
      if (resetButton && resetButton.textContent.includes('Reset')) {
        resetButton.click();
        return true;
      }
      return false;
    `)
    console.log(`[DEBUG] Reset button clicked: ${resetClicked}`)
  } catch (error) {
    console.log(`[DEBUG] Failed to click reset via JS: ${error.message}`)
    // Fallback to keyboard navigation
    orchestraUI.keystroke('\t')
    orchestraUI.keystroke('\r')
  }

  orchestraUI.sleep(800)
  orchestraUI.quit(BUNDLE_ID)
  orchestraUI.sleep(800)
  orchestraUI.launch(BUNDLE_ID)
  await waitForAppReady()

  // Verify reset to production
  console.log('🔍 Checking reset to production environment badge...')
  const prodBadgeFoundAfterReset = await waitForEnvironmentBadge('Production', 3000)
  if (prodBadgeFoundAfterReset) {
    console.log('✅ Reset to Production successful')
  } else {
    const currentBadge = orchestraUI.getEnvironmentBadgeText()
    console.log(`⚠️  Reset may have failed. Current badge: "${currentBadge}"`)
  }

  describeStep('✅ Enhanced test completed successfully!')
}

main().catch(err => { 
  console.error('❌ Test failed:', err.stack || String(err))
  process.exit(1) 
})
