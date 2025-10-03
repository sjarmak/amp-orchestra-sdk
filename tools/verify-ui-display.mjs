#!/usr/bin/env node

// Direct UI verification tool - checks what's actually displayed in the app
// Uses the improved orchestra-ui tool to inspect UI elements

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'

const WAIT_SHORT = 1000
const WAIT_MEDIUM = 2000

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function verifyUIDisplay() {
  try {
    log('🔍 Verifying Agent Mode Display in UI')
    console.log('====================================')
    
    // 1. Launch and focus the app
    log('📱 Launching and focusing app...')
    await orchestraUI.launch()
    await orchestraUI.sleep(WAIT_MEDIUM)
    await orchestraUI.focus()
    await orchestraUI.sleep(WAIT_MEDIUM)
    
    // 2. Test basic connectivity
    log('🧪 Testing UI connectivity...')
    const title = await orchestraUI.evalJS('document.title')
    log(`✅ App title: ${title}`)
    
    // 3. Look for environment badge using UI element inspection
    log('🏷️ Looking for environment badge...')
    try {
      const envBadgeResult = await orchestraUI.evalJS(`
        document.querySelector('[data-test-id="env-badge"]')
      `)
      
      if (envBadgeResult && envBadgeResult.textContent) {
        log(`✅ Environment badge found: "${envBadgeResult.textContent}"`)
      } else {
        log('⚠️ Environment badge not found via test-id, trying alternative selectors...')
        
        // Try alternative approaches
        const badgeInfo = await orchestraUI.evalJS('window.__GET_ENV_BADGE__')
        log(`Badge search result: ${JSON.stringify(badgeInfo)}`)
      }
    } catch (e) {
      log(`Could not find environment badge: ${e.message}`)
    }
    
    // 4. Look for agent mode chip using UI element inspection  
    log('🤖 Looking for agent mode chip...')
    try {
      const agentChipResult = await orchestraUI.evalJS(`
        document.querySelector('[data-test-id="agent-mode-chip"]')
      `)
      
      if (agentChipResult && agentChipResult.textContent) {
        log(`✅ Agent mode chip found: "${agentChipResult.textContent}"`)
        
        if (agentChipResult.textContent.includes('claudetto:main')) {
          log('🎉 SUCCESS: Agent mode correctly displayed as claudetto:main!')
          return true
        } else {
          log(`⚠️ Agent mode shows: "${agentChipResult.textContent}" (expected claudetto:main)`)
        }
      } else {
        log('❌ Agent mode chip not found')
        log('This could mean:')
        log('  1. App is in Production mode (agent mode only shows in Development)')
        log('  2. Agent mode is set to "default" (chip may be hidden)')
        log('  3. UI element selectors have changed')
      }
    } catch (e) {
      log(`Could not find agent mode chip: ${e.message}`)
    }
    
    // 5. Try to get all text content from the UI to see what's actually there
    log('📄 Scanning all visible text in the UI...')
    try {
      const uiTexts = await orchestraUI.evalJS(`
        Array.from(document.querySelectorAll('*'))
          .map(el => el.textContent)
          .filter(text => text && text.trim().length > 0 && text.trim().length < 100)
          .filter(text => text.includes('Mode:') || text.includes('Production') || 
                         text.includes('Development') || text.includes('Local') ||
                         text.includes('claudetto') || text.includes('default'))
      `)
      
      if (uiTexts && uiTexts.length > 0) {
        log('📋 Found relevant UI text elements:')
        uiTexts.forEach((text, i) => {
          log(`  ${i + 1}: "${text.trim()}"`)
        })
        
        const hasAgentMode = uiTexts.some(text => 
          text.includes('Mode:') && text.includes('claudetto')
        )
        
        if (hasAgentMode) {
          log('🎉 SUCCESS: Found agent mode in UI text!')
          return true
        }
      } else {
        log('❌ No relevant UI text found')
      }
    } catch (e) {
      log(`Could not scan UI text: ${e.message}`)
    }
    
    // 6. Final check - try to open preferences and see current settings
    log('⚙️ Checking preferences to verify current settings...')
    try {
      await orchestraUI.keystroke(',', ['cmd'])
      await orchestraUI.sleep(WAIT_MEDIUM)
      
      // Look for any visible dropdowns or form elements
      const formInfo = await orchestraUI.evalJS(`
        Array.from(document.querySelectorAll('select, input'))
          .map(el => ({
            tag: el.tagName,
            type: el.type || 'unknown',
            value: el.value || '',
            options: el.tagName === 'SELECT' ? 
              Array.from(el.options).map(opt => ({ value: opt.value, text: opt.textContent })) 
              : undefined
          }))
      `)
      
      if (formInfo && formInfo.length > 0) {
        log('📋 Found form elements in preferences:')
        formInfo.forEach((info, i) => {
          log(`  ${i + 1}: ${info.tag} (${info.type}) = "${info.value}"`)
          if (info.options) {
            info.options.forEach(opt => log(`     Option: ${opt.value} = "${opt.text}"`))
          }
        })
      }
      
      // Close preferences
      await orchestraUI.keystroke('Escape')
      await orchestraUI.sleep(WAIT_SHORT)
      
    } catch (e) {
      log(`Could not check preferences: ${e.message}`)
    }
    
    return false
    
  } catch (error) {
    log(`❌ Verification failed: ${error.message}`)
    return false
  }
}

async function main() {
  const success = await verifyUIDisplay()
  
  console.log('\n' + '='.repeat(50))
  if (success) {
    console.log('✅ UI VERIFICATION PASSED!')
    console.log('Agent mode is correctly displayed in the UI')
  } else {
    console.log('❌ UI VERIFICATION INCONCLUSIVE!')
    console.log('Could not definitively verify UI display')
    console.log('Manual inspection may be needed')
  }
  
  return success
}

main().catch(console.error)
