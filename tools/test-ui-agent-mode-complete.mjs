#!/usr/bin/env node

// Complete UI automation test for agent mode persistence using improved orchestra-ui
// Tests the full user workflow end-to-end

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WAIT_SHORT = 1000
const WAIT_MEDIUM = 2000
const WAIT_LONG = 3000

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function readConfig() {
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return { found: true, config: JSON.parse(content) }
  } catch (e) {
    return { found: false }
  }
}

async function testCompleteAgentModeWorkflow() {
  try {
    log('🚀 Complete Agent Mode UI Automation Test')
    console.log('==========================================')
    
    // 1. Launch and focus the app
    log('📱 Launching app...')
    await orchestraUI.launch()
    await orchestraUI.sleep(WAIT_LONG)
    await orchestraUI.focus()
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 2. Test basic UI functionality
    log('🧪 Testing basic UI detection...')
    const title = await orchestraUI.evalJS('document.title')
    log(`✅ App title: ${title}`)
    
    // 3. Check initial environment badge
    log('🔍 Looking for environment badge...')
    try {
      const envBadge = await orchestraUI.evalJS(`
        const el = document.querySelector('[data-test-id="env-badge"]')
        return el ? { found: true, text: el.textContent.trim() } : null
      `)
      
      if (envBadge && envBadge.found) {
        log(`✅ Environment badge: "${envBadge.text}"`)
      } else {
        log('⚠️ Environment badge not found via querySelector, trying UI inspection...')
        
        // Fallback to UI element inspection
        const badge = await orchestraUI.evalJS('window.__MOCK_ENV_BADGE__')
        log(`UI inspection result: ${JSON.stringify(badge)}`)
      }
    } catch (e) {
      log(`Could not find environment badge: ${e.message}`)
    }
    
    // 4. Check initial agent mode display
    log('🤖 Looking for agent mode chip...')
    try {
      const agentChip = await orchestraUI.evalJS(`
        const el = document.querySelector('[data-test-id="agent-mode-chip"]')
        return el ? { found: true, text: el.textContent.trim() } : null
      `)
      
      if (agentChip && agentChip.found) {
        log(`✅ Agent mode chip: "${agentChip.text}"`)
      } else {
        log('⚠️ Agent mode chip not found, may be in production mode')
      }
    } catch (e) {
      log(`Could not find agent mode chip: ${e.message}`)
    }
    
    // 5. Open preferences using keyboard shortcut
    log('⚙️ Opening preferences (Cmd+,)...')
    await orchestraUI.keystroke(',', ['cmd'])
    await orchestraUI.sleep(WAIT_LONG)
    
    // 6. Check if preferences dialog opened
    log('🔍 Checking if preferences dialog opened...')
    try {
      const prefsOpen = await orchestraUI.evalJS(`
        const dialog = document.querySelector('[data-testid="preferences-dialog"], [role="dialog"]')
        return !!dialog
      `)
      log(`Preferences dialog open: ${prefsOpen}`)
      
      if (!prefsOpen) {
        log('⚠️ Preferences dialog not detected, continuing with workflow...')
      }
    } catch (e) {
      log(`Could not check preferences dialog: ${e.message}`)
    }
    
    // 7. Look for agent mode selector and set it to claudetto:main
    log('🎛️ Looking for agent mode selector...')
    
    // Since we can't directly interact with the DOM, we'll simulate the expected workflow
    await orchestraUI.sleep(WAIT_SHORT)
    
    // Click on Development radio button if needed
    log('🔄 Ensuring Development mode is selected...')
    // We'll use tab navigation to find the right elements
    await orchestraUI.keystroke('tab', []) // Tab to first element
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke('tab', []) // Tab to development radio
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke(' ', []) // Space to select
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // Navigate to agent mode dropdown
    log('🎯 Navigating to agent mode dropdown...')
    // Tab through the form elements to reach the agent mode dropdown
    for (let i = 0; i < 5; i++) {
      await orchestraUI.keystroke('tab', [])
      await orchestraUI.sleep(WAIT_SHORT)
    }
    
    // Open dropdown and select claudetto:main
    log('🔽 Opening agent mode dropdown...')
    await orchestraUI.keystroke(' ', []) // Space to open dropdown
    await orchestraUI.sleep(WAIT_SHORT)
    
    log('📝 Selecting claudetto:main...')
    // Navigate to claudetto:main option (assuming it's the 3rd option)
    await orchestraUI.keystroke('ArrowDown', []) // Move to next option
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke('ArrowDown', []) // Move to claudetto:main
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke('Return', []) // Select option
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 8. Apply settings
    log('💾 Applying dev settings...')
    // Tab to the Apply button and click it
    await orchestraUI.keystroke('tab', [])
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke('Return', []) // Enter to click Apply button
    await orchestraUI.sleep(WAIT_LONG)
    
    // 9. Close preferences
    log('❌ Closing preferences...')
    await orchestraUI.keystroke('Escape', [])
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 10. Check if agent mode persisted
    log('🔍 Checking if agent mode persisted in UI...')
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // Since we can't directly inspect the DOM, we'll check the config file
    const configAfterChange = readConfig()
    if (configAfterChange.found) {
      const agentMode = configAfterChange.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
      if (agentMode === 'claudetto:main') {
        log('✅ SUCCESS: Agent mode persisted in config!')
        log(`Agent mode: ${agentMode}`)
      } else {
        log(`⚠️ Agent mode in config: ${agentMode || 'not set'}`)
      }
    } else {
      log('❌ Could not read config file after changes')
    }
    
    // 11. Test environment switching persistence
    log('🔄 Testing environment switching persistence...')
    
    // Open preferences again
    await orchestraUI.keystroke(',', ['cmd'])
    await orchestraUI.sleep(WAIT_LONG)
    
    // Switch to Production
    log('🏭 Switching to Production...')
    await orchestraUI.keystroke('tab', []) // Tab to Production radio
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke(' ', []) // Space to select Production
    await orchestraUI.sleep(WAIT_LONG)
    
    // Close preferences
    await orchestraUI.keystroke('Escape', [])
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // Switch back to Development
    log('🔧 Switching back to Development...')
    await orchestraUI.keystroke(',', ['cmd'])
    await orchestraUI.sleep(WAIT_LONG)
    
    await orchestraUI.keystroke('tab', []) // Tab to first radio
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke('tab', []) // Tab to Development radio
    await orchestraUI.sleep(WAIT_SHORT)
    await orchestraUI.keystroke(' ', []) // Space to select Development
    await orchestraUI.sleep(WAIT_LONG)
    
    // Close preferences
    await orchestraUI.keystroke('Escape', [])
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 12. Final verification
    log('🔍 Final verification...')
    const finalConfig = readConfig()
    if (finalConfig.found) {
      const finalAgentMode = finalConfig.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
      const connectionMode = finalConfig.config.connection_mode
      
      log(`Final connection mode: ${connectionMode}`)
      log(`Final agent mode: ${finalAgentMode || 'not set'}`)
      
      if (finalAgentMode === 'claudetto:main' && connectionMode === 'local-cli') {
        log('🎉 SUCCESS: Agent mode persistence works correctly!')
        return true
      } else {
        log('❌ Agent mode persistence issue detected')
        return false
      }
    } else {
      log('❌ Could not verify final config')
      return false
    }
    
  } catch (error) {
    log(`❌ Test failed with error: ${error.message}`)
    log(`Stack trace: ${error.stack}`)
    return false
  }
}

async function main() {
  console.log('🎭 Automated UI Test for Agent Mode Persistence')
  console.log('===============================================')
  
  const success = await testCompleteAgentModeWorkflow()
  
  if (success) {
    console.log('\n🎉 UI automation test PASSED!')
    console.log('Agent mode persistence is working correctly.')
  } else {
    console.log('\n❌ UI automation test FAILED!')
    console.log('Agent mode persistence needs further investigation.')
  }
  
  return success
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { testCompleteAgentModeWorkflow }
