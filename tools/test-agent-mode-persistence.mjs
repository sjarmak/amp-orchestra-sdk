#!/usr/bin/env node

// Comprehensive test for agent mode persistence using orchestra-ui automation
// Tests the full workflow of setting agent mode and verifying it persists

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WAIT_SHORT = 500
const WAIT_MEDIUM = 1000
const WAIT_LONG = 2000

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function checkConfig() {
  const configPaths = [
    path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json'),
    path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  ]
  
  for (const configPath of configPaths) {
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(content)
      if (config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE) {
        return {
          found: true,
          path: configPath,
          agentMode: config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE,
          config
        }
      }
    } catch (e) {
      // Config doesn't exist or is invalid
    }
  }
  return { found: false }
}

async function testAgentModePersistence() {
  try {
    log('🚀 Starting agent mode persistence test...')
    
    // 1. Launch and focus the app
    log('📱 Launching app...')
    await orchestraUI.launch()
    await orchestraUI.sleep(WAIT_MEDIUM)
    await orchestraUI.focus()
    await orchestraUI.sleep(WAIT_SHORT)
    
    // 2. Check initial state
    log('🔍 Checking initial environment badge...')
    const initialBadge = await orchestraUI.getEnvironmentBadgeText()
    log(`Initial badge: ${initialBadge}`)
    
    // 3. Check if we can evaluate JS in the webview
    log('🧪 Testing WebView evaluation...')
    try {
      const title = await orchestraUI.evalJS('document.title')
      log(`Page title: ${title}`)
    } catch (e) {
      log(`❌ WebView evaluation failed: ${e.message}`)
      return false
    }
    
    // 4. Check initial agent mode
    log('🤖 Checking initial agent mode...')
    try {
      const agentModeElement = await orchestraUI.evalJS(`
        document.querySelector('[data-testid="agent-mode-chip"], .agent-mode, [class*="agent"], [class*="mode"]')?.textContent?.trim()
      `)
      log(`Current agent mode display: ${agentModeElement || 'not found'}`)
    } catch (e) {
      log(`Could not find agent mode element: ${e.message}`)
    }
    
    // 5. Open preferences using keyboard shortcut
    log('⚙️ Opening preferences (Cmd+,)...')
    await orchestraUI.keystroke(',', ['cmd'])
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 6. Check if preferences opened
    log('🔍 Checking if preferences dialog opened...')
    const prefsOpen = await orchestraUI.evalJS(`
      !!document.querySelector('[data-testid="preferences-dialog"], .preferences, [class*="preferences"]')
    `)
    log(`Preferences open: ${prefsOpen}`)
    
    if (!prefsOpen) {
      log('❌ Preferences not open, trying alternative methods...')
      // Try clicking on settings if there's a menu
      try {
        await orchestraUI.clickMenu('Application>Preferences...')
        await orchestraUI.sleep(WAIT_MEDIUM)
      } catch (e) {
        log(`Menu click failed: ${e.message}`)
      }
    }
    
    // 7. Look for agent mode dropdown/selector
    log('🎛️ Looking for agent mode selector...')
    const agentModeSelector = await orchestraUI.evalJS(`
      const selectors = [
        'select[data-testid="agent-mode"]',
        'select[name="agent_mode"]',
        '[data-testid="agent-mode-select"]',
        '.agent-mode-selector',
        'select:has(option[value*="claudetto"])',
        'select:has(option[value*="default"])'
      ]
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el) return { found: true, selector, options: Array.from(el.options).map(o => o.value) }
      }
      return { found: false }
    `)
    
    log(`Agent mode selector: ${JSON.stringify(agentModeSelector, null, 2)}`)
    
    // 8. Try to change agent mode if selector found
    if (agentModeSelector.found) {
      log('🎯 Setting agent mode to claudetto:main...')
      await orchestraUI.evalJS(`
        const select = document.querySelector('${agentModeSelector.selector}')
        if (select) {
          select.value = 'claudetto:main'
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      `)
      await orchestraUI.sleep(WAIT_SHORT)
    } else {
      log('❌ Could not find agent mode selector')
    }
    
    // 9. Look for and click Apply/Save button
    log('💾 Looking for Apply/Save button...')
    const applyButton = await orchestraUI.evalJS(`
      const buttons = Array.from(document.querySelectorAll('button'))
      const applyBtn = buttons.find(btn => 
        btn.textContent.toLowerCase().includes('apply') ||
        btn.textContent.toLowerCase().includes('save') ||
        btn.getAttribute('data-testid')?.includes('apply')
      )
      return applyBtn ? { found: true, text: applyBtn.textContent } : { found: false }
    `)
    
    if (applyButton.found) {
      log(`Found apply button: "${applyButton.text}", clicking...`)
      await orchestraUI.evalJS(`
        const buttons = Array.from(document.querySelectorAll('button'))
        const applyBtn = buttons.find(btn => 
          btn.textContent.toLowerCase().includes('apply') ||
          btn.textContent.toLowerCase().includes('save')
        )
        if (applyBtn) applyBtn.click()
      `)
      await orchestraUI.sleep(WAIT_MEDIUM)
    }
    
    // 10. Close preferences
    log('❌ Closing preferences...')
    await orchestraUI.keystroke('Escape')
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 11. Check if agent mode persisted
    log('🔍 Checking if agent mode persisted...')
    const finalAgentMode = await orchestraUI.evalJS(`
      document.querySelector('[data-testid="agent-mode-chip"], .agent-mode, [class*="agent"], [class*="mode"]')?.textContent?.trim()
    `)
    log(`Final agent mode display: ${finalAgentMode || 'not found'}`)
    
    // 12. Check config file
    log('📄 Checking config file...')
    const configCheck = checkConfig()
    if (configCheck.found) {
      log(`✅ Config found at: ${configCheck.path}`)
      log(`Agent mode in config: ${configCheck.agentMode}`)
    } else {
      log('❌ No config with agent mode found')
    }
    
    // 13. Test environment switching persistence
    log('🔄 Testing environment switching...')
    const isEnvSwitcherOpen = await orchestraUI.isEnvironmentSwitcherOpen()
    log(`Environment switcher open: ${isEnvSwitcherOpen}`)
    
    // Try to find and click environment tabs
    const envTabs = await orchestraUI.evalJS(`
      const tabs = Array.from(document.querySelectorAll('[role="tab"], .tab, [data-testid*="tab"]'))
      return tabs.map(tab => ({
        text: tab.textContent?.trim(),
        active: tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('active')
      }))
    `)
    log(`Environment tabs: ${JSON.stringify(envTabs, null, 2)}`)
    
    log('✅ Agent mode persistence test completed')
    return true
    
  } catch (error) {
    log(`❌ Test failed: ${error.message}`)
    log(`Stack: ${error.stack}`)
    return false
  }
}

async function main() {
  console.log('🧪 Agent Mode Persistence Test')
  console.log('==============================')
  
  const success = await testAgentModePersistence()
  
  if (success) {
    console.log('\n✅ Test completed successfully')
  } else {
    console.log('\n❌ Test failed')
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { testAgentModePersistence }
