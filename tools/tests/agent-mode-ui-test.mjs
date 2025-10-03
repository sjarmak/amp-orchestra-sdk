#!/usr/bin/env node

// Agent Mode UI Test - Verifies agent mode chip updates correctly

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import orchestraUI from '../amp_toolbox/orchestra-ui-helpers.mjs'

const BUNDLE_ID = 'com.sjarmak.amp-orchestra'
const REPO_ROOT = path.resolve(path.join(process.cwd()))
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
}

async function waitForAppReady(maxWaitMs = 10000) {
  const startTime = Date.now()
  console.log(`[DEBUG] Waiting for app to be ready (max ${maxWaitMs}ms)...`)
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const title = orchestraUI.evalJS('document.title')
      console.log(`[DEBUG] Checking readiness, title: "${title}"`)
      if (title && title !== 'undefined' && title !== '') {
        console.log(`[DEBUG] App ready, title: "${title}"`)
        return true
      }
    } catch (error) {
      console.log(`[DEBUG] App not ready yet: ${error.message}`)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  // Final attempt to see what's happening
  try {
    const readyState = orchestraUI.evalJS('document.readyState')
    const title = orchestraUI.evalJS('document.title')
    console.log(`[DEBUG] Final check - readyState: "${readyState}", title: "${title}"`)
  } catch (error) {
    console.log(`[DEBUG] Cannot access webview: ${error.message}`)
  }
  
  throw new Error('App did not become ready within timeout')
}

// Get the agent mode chip text
function getAgentModeChip() {
  try {
    return orchestraUI.evalJS(`
      const chip = document.querySelector('[data-test-id="agent-mode-chip"]');
      return chip ? chip.textContent.trim() : null;
    `)
  } catch (error) {
    console.log(`[DEBUG] Failed to get agent mode chip: ${error.message}`)
    return null
  }
}

// Wait for agent mode chip to show expected text
async function waitForAgentModeChip(expectedText, maxWaitMs = 5000) {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    const chipText = getAgentModeChip()
    console.log(`[DEBUG] Current agent chip: "${chipText}"`)
    if (chipText === expectedText) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return false
}

// Check if preferences dialog is open
function isPreferencesOpen() {
  try {
    return orchestraUI.evalJS(`
      const dialog = document.querySelector('[role="dialog"]');
      return dialog && dialog.style.display !== 'none';
    `)
  } catch {
    return false
  }
}

// Switch to Development tab via chat interface
async function switchToDevelopment() {
  try {
    const clicked = orchestraUI.evalJS(`
      const devButton = document.querySelector('button[value="development"]');
      if (devButton) {
        devButton.click();
        return true;
      }
      return false;
    `)
    console.log(`[DEBUG] Development button clicked: ${clicked}`)
    return clicked
  } catch (error) {
    console.log(`[DEBUG] Failed to click development button: ${error.message}`)
    return false
  }
}

// Change agent mode in preferences
async function changeAgentMode(mode) {
  try {
    const changed = orchestraUI.evalJS(`
      const select = document.querySelector('[data-test-id="env-agent-mode"]');
      if (select) {
        select.value = "${mode}";
        select.dispatchEvent(new Event('change'));
        return true;
      }
      return false;
    `)
    console.log(`[DEBUG] Agent mode changed to ${mode}: ${changed}`)
    return changed
  } catch (error) {
    console.log(`[DEBUG] Failed to change agent mode: ${error.message}`)
    return false
  }
}

// Click Apply Dev Settings button
async function applyDevSettings() {
  try {
    const clicked = orchestraUI.evalJS(`
      const button = document.querySelector('button:contains("Apply Dev Settings")') || 
                     Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Apply Dev Settings'));
      if (button) {
        button.click();
        return true;
      }
      return false;
    `)
    console.log(`[DEBUG] Apply Dev Settings clicked: ${clicked}`)
    return clicked
  } catch (error) {
    console.log(`[DEBUG] Failed to click Apply Dev Settings: ${error.message}`)
    return false
  }
}

async function main() {
  const localCli = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')

  describeStep('Agent Mode UI Test')

  describeStep('Clean slate')
  cleanEnv()

  describeStep('Launch app')
  console.log(`[DEBUG] Attempting to launch app, DEV_APP exists: ${fs.existsSync(DEV_APP)}`)
  
  try {
    if (fs.existsSync(DEV_APP)) {
      console.log(`[DEBUG] Using development app: ${DEV_APP}`)
      const result = spawnSync('open', [DEV_APP])
      console.log(`[DEBUG] open command result: ${result.status}`)
      if (result.stderr.length > 0) {
        console.log(`[DEBUG] open stderr: ${result.stderr.toString()}`)
      }
    } else {
      console.log(`[DEBUG] Using bundle ID: ${BUNDLE_ID}`)
      orchestraUI.launch(BUNDLE_ID)
    }
    
    // Give the app more time to launch
    orchestraUI.sleep(2000)
    
    await waitForAppReady()
  } catch (error) {
    console.log(`[DEBUG] Launch failed: ${error.message}`)
    
    // Try alternative launch method
    console.log(`[DEBUG] Trying alternative launch method...`)
    try {
      orchestraUI.launch(BUNDLE_ID)
      orchestraUI.sleep(3000)
      await waitForAppReady()
    } catch (altError) {
      console.log(`[DEBUG] Alternative launch also failed: ${altError.message}`)
      throw new Error(`Both launch methods failed. Primary: ${error.message}, Alternative: ${altError.message}`)
    }
  }

  describeStep('Switch to Development mode')
  const devSwitched = await switchToDevelopment()
  assert(devSwitched, 'Failed to switch to development mode')
  
  // Wait for development mode to be active
  orchestraUI.sleep(1000)

  describeStep('Check initial agent mode chip (should be "Mode: default")')
  const initialChip = await waitForAgentModeChip('Mode: default', 3000)
  if (initialChip) {
    console.log('✅ Initial agent mode chip shows "Mode: default"')
  } else {
    const current = getAgentModeChip()
    console.log(`⚠️  Initial agent mode chip: "${current}"`)
  }

  describeStep('Open preferences')
  orchestraUI.keystroke(',', ['command'])
  orchestraUI.sleep(500)

  const prefsOpen = isPreferencesOpen()
  assert(prefsOpen, 'Preferences dialog did not open')
  console.log('✅ Preferences dialog opened')

  describeStep('Change agent mode to claudetto:main')
  const modeChanged = await changeAgentMode('claudetto:main')
  assert(modeChanged, 'Failed to change agent mode to claudetto:main')
  console.log('✅ Agent mode changed to claudetto:main')

  describeStep('Apply dev settings')
  const applied = await applyDevSettings()
  assert(applied, 'Failed to click Apply Dev Settings')
  orchestraUI.sleep(1000)
  console.log('✅ Applied dev settings')

  describeStep('Close preferences')
  orchestraUI.keystroke('Escape')
  orchestraUI.sleep(500)

  describeStep('Check agent mode chip updated to "Mode: claudetto:main"')
  const updatedChip = await waitForAgentModeChip('Mode: claudetto:main', 5000)
  if (updatedChip) {
    console.log('✅ Agent mode chip updated to "Mode: claudetto:main"')
  } else {
    const current = getAgentModeChip()
    console.log(`❌ Agent mode chip did not update. Current: "${current}"`)
    throw new Error('Agent mode chip did not update')
  }

  describeStep('Test chat tab switching preserves agent mode')
  // Switch to Production
  orchestraUI.evalJS(`
    const prodButton = document.querySelector('button[value="production"]');
    if (prodButton) prodButton.click();
  `)
  orchestraUI.sleep(500)

  // Switch back to Development
  await switchToDevelopment()
  orchestraUI.sleep(1000)

  // Check that agent mode is preserved
  const preservedChip = await waitForAgentModeChip('Mode: claudetto:main', 3000)
  if (preservedChip) {
    console.log('✅ Agent mode preserved across tab switching')
  } else {
    const current = getAgentModeChip()
    console.log(`❌ Agent mode not preserved. Current: "${current}"`)
    throw new Error('Agent mode not preserved across tab switching')
  }

  describeStep('✅ Agent Mode UI Test completed successfully!')
}

main().catch(err => { 
  console.error('❌ Test failed:', err.stack || String(err))
  process.exit(1) 
})
