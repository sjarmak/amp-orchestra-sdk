#!/usr/bin/env node

// Basic agent mode test using direct DOM queries instead of E2E bridge
// Focuses on the core issue: why agent mode isn't persisting in development

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'

const WAIT_SHORT = 500
const WAIT_MEDIUM = 1000
const WAIT_LONG = 2000

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function testBasicAgentMode() {
  try {
    log('🚀 Starting basic agent mode test...')
    
    // 1. Launch and focus the app
    log('📱 Launching app...')
    await orchestraUI.launch()
    await orchestraUI.sleep(WAIT_MEDIUM)
    await orchestraUI.focus()
    await orchestraUI.sleep(WAIT_SHORT)
    
    // 2. Test simple WebView evaluation first
    log('🧪 Testing basic WebView evaluation...')
    try {
      const title = await orchestraUI.evalJS('document.title')
      log(`✅ Page title: ${title}`)
    } catch (e) {
      log(`❌ Basic WebView evaluation failed: ${e.message}`)
      return false
    }
    
    // 3. Look for environment badge using direct DOM queries
    log('🔍 Looking for environment badge...')
    const badgeSelectors = [
      '[data-testid="env-badge"]',
      '[data-test-id="env-badge"]',
      '.env-badge',
      '.environment-badge',
      '[class*="badge"]',
      '[class*="environment"]'
    ]
    
    let badgeFound = false
    for (const selector of badgeSelectors) {
      try {
        const element = await orchestraUI.evalJS(`
          const el = document.querySelector('${selector}')
          return el ? { found: true, text: el.textContent.trim(), selector: '${selector}' } : null
        `)
        if (element && element.found) {
          log(`✅ Environment badge found: "${element.text}" (selector: ${element.selector})`)
          badgeFound = true
          break
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!badgeFound) {
      log('❌ Could not find environment badge')
    }
    
    // 4. Look for agent mode display
    log('🤖 Looking for agent mode display...')
    const agentSelectors = [
      '[data-testid="agent-mode-chip"]',
      '[data-test-id="agent-mode-chip"]',
      '.agent-mode',
      '[class*="mode"]',
      '[class*="agent"]'
    ]
    
    let agentModeFound = false
    for (const selector of agentSelectors) {
      try {
        const element = await orchestraUI.evalJS(`
          const el = document.querySelector('${selector}')
          return el ? { found: true, text: el.textContent.trim(), selector: '${selector}' } : null
        `)
        if (element && element.found) {
          log(`✅ Agent mode found: "${element.text}" (selector: ${element.selector})`)
          agentModeFound = true
          break
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!agentModeFound) {
      log('❌ Could not find agent mode display')
    }
    
    // 5. Try to open preferences with Cmd+,
    log('⚙️ Trying to open preferences (Cmd+,)...')
    await orchestraUI.keystroke(',', ['cmd'])
    await orchestraUI.sleep(WAIT_LONG)
    
    // 6. Look for preferences dialog
    log('🔍 Looking for preferences dialog...')
    const prefsSelectors = [
      '[data-testid="preferences-dialog"]',
      '[data-test-id="preferences-dialog"]',
      '.preferences-dialog',
      '.preferences',
      '[class*="preferences"]',
      '[class*="settings"]',
      '[role="dialog"]'
    ]
    
    let prefsFound = false
    for (const selector of prefsSelectors) {
      try {
        const element = await orchestraUI.evalJS(`
          const el = document.querySelector('${selector}')
          return el ? { found: true, visible: !el.hidden && el.offsetParent !== null, selector: '${selector}' } : null
        `)
        if (element && element.found && element.visible) {
          log(`✅ Preferences dialog found (selector: ${element.selector})`)
          prefsFound = true
          break
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!prefsFound) {
      log('❌ Could not find preferences dialog')
      // Try alternative: look for any modal/dialog
      try {
        const anyDialog = await orchestraUI.evalJS(`
          const dialogs = document.querySelectorAll('[role="dialog"], .modal, .dialog')
          return Array.from(dialogs).map((el, i) => ({
            index: i,
            className: el.className,
            id: el.id,
            visible: !el.hidden && el.offsetParent !== null
          }))
        `)
        log(`Available dialogs: ${JSON.stringify(anyDialog, null, 2)}`)
      } catch (e) {
        log(`Could not query dialogs: ${e.message}`)
      }
    }
    
    // 7. Look for all form elements to find agent mode selector
    log('🎛️ Looking for form elements...')
    try {
      const formElements = await orchestraUI.evalJS(`
        const selects = Array.from(document.querySelectorAll('select'))
        const inputs = Array.from(document.querySelectorAll('input'))
        const buttons = Array.from(document.querySelectorAll('button'))
        
        return {
          selects: selects.map((el, i) => ({
            index: i,
            name: el.name,
            id: el.id,
            className: el.className,
            options: Array.from(el.options).map(o => ({ value: o.value, text: o.textContent }))
          })),
          inputs: inputs.map((el, i) => ({
            index: i,
            type: el.type,
            name: el.name,
            id: el.id,
            className: el.className,
            value: el.value
          })),
          buttons: buttons.map((el, i) => ({
            index: i,
            text: el.textContent.trim(),
            className: el.className,
            id: el.id
          }))
        }
      `)
      
      log(`Form elements found:`)
      log(`  Selects: ${formElements.selects.length}`)
      log(`  Inputs: ${formElements.inputs.length}`) 
      log(`  Buttons: ${formElements.buttons.length}`)
      
      // Look for agent mode in selects
      const agentSelect = formElements.selects.find(select => 
        select.name?.includes('agent') || 
        select.id?.includes('agent') ||
        select.className?.includes('agent') ||
        select.options?.some(opt => opt.value?.includes('claudetto') || opt.value?.includes('default'))
      )
      
      if (agentSelect) {
        log(`✅ Found potential agent mode select:`)
        log(`  Name: ${agentSelect.name}`)
        log(`  Options: ${JSON.stringify(agentSelect.options, null, 2)}`)
      }
      
    } catch (e) {
      log(`Could not query form elements: ${e.message}`)
    }
    
    // 8. Close any open dialogs
    log('❌ Closing dialogs...')
    await orchestraUI.keystroke('Escape')
    await orchestraUI.sleep(WAIT_SHORT)
    
    log('✅ Basic agent mode test completed')
    return true
    
  } catch (error) {
    log(`❌ Test failed: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🧪 Basic Agent Mode Test')
  console.log('========================')
  
  const success = await testBasicAgentMode()
  
  if (success) {
    console.log('\n✅ Test completed')
  } else {
    console.log('\n❌ Test failed')
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
