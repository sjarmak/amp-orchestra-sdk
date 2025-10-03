#!/usr/bin/env node

// Simple UI check using direct AppleScript UI element inspection
// Bypasses the complex WebView evaluation

import { spawnSync } from 'node:child_process'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function ap(script) {
  const res = spawnSync('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.status !== 0) {
    const err = res.stderr?.toString() || 'osascript error'
    throw new Error(err)
  }
  return res.stdout?.toString() ?? ''
}

async function checkUIElements() {
  const bundleId = 'com.sjarmak.amp-orchestra'
  
  try {
    log('🔍 Direct UI Element Inspection')
    console.log('==============================')
    
    // 1. Activate the app
    log('📱 Activating app...')
    ap(`tell application id "${bundleId}" to activate`)
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 2. Get all text elements from the app
    log('📄 Scanning for all text elements...')
    const script = `
      tell application "System Events"
        tell process (name of first application process whose bundle identifier is "${bundleId}")
          set allTexts to {}
          try
            set textElements to every static text
            repeat with textElement in textElements
              try
                set textValue to value of textElement
                if textValue is not missing value and textValue is not "" then
                  set end of allTexts to textValue
                end if
              end try
            end repeat
          on error errMsg
            return "Error getting text elements: " & errMsg
          end try
          return allTexts
        end tell
      end tell
    `
    
    const result = ap(script).trim()
    log(`📋 Raw result: ${result}`)
    
    if (result.includes('Error')) {
      log(`❌ AppleScript error: ${result}`)
      return false
    }
    
    // Parse the AppleScript list result
    if (result && result !== '{}') {
      // AppleScript returns results like {"text1", "text2", "text3"}
      const cleanResult = result.replace(/^\{|\}$/g, '')
      const textElements = cleanResult.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      
      log(`✅ Found ${textElements.length} text elements:`)
      textElements.forEach((text, i) => {
        if (text.length > 0 && text.length < 100) {
          log(`  ${i + 1}: "${text}"`)
        }
      })
      
      // Look for environment and agent mode indicators
      const envTexts = textElements.filter(text => 
        text.includes('Production') || 
        text.includes('Development') || 
        text.includes('Local CLI') ||
        text.includes('Mode:') ||
        text.includes('claudetto') ||
        text.includes('default')
      )
      
      if (envTexts.length > 0) {
        log('🎯 Found relevant environment/mode text:')
        envTexts.forEach(text => log(`  • "${text}"`))
        
        const hasAgentMode = envTexts.some(text => 
          text.includes('Mode:') && 
          (text.includes('claudetto') || text.includes('default'))
        )
        
        if (hasAgentMode) {
          log('🎉 SUCCESS: Found agent mode display in UI!')
          return true
        } else {
          log('⚠️ Found environment text but no agent mode display')
        }
      } else {
        log('❌ No environment or agent mode text found in UI')
      }
    }
    
    return false
    
  } catch (error) {
    log(`❌ Error checking UI elements: ${error.message}`)
    return false
  }
}

async function checkWindowStructure() {
  const bundleId = 'com.sjarmak.amp-orchestra'
  
  try {
    log('🏗️ Checking app window structure...')
    
    const script = `
      tell application "System Events"
        tell process (name of first application process whose bundle identifier is "${bundleId}")
          try
            set windowCount to count of windows
            set windowInfo to "Windows: " & windowCount
            
            if windowCount > 0 then
              set firstWindow to window 1
              set windowTitle to name of firstWindow
              set windowInfo to windowInfo & ", Title: " & windowTitle
            end if
            
            return windowInfo
          on error errMsg
            return "Error: " & errMsg
          end try
        end tell
      end tell
    `
    
    const result = ap(script).trim()
    log(`🏠 Window info: ${result}`)
    
    return !result.includes('Error')
    
  } catch (error) {
    log(`❌ Error checking window structure: ${error.message}`)
    return false
  }
}

async function main() {
  log('🎭 Simple UI Verification Tool')
  console.log('=============================')
  
  // Check if app is running
  try {
    const psResult = spawnSync('pgrep', ['-f', 'amp-orchestra'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    })
    
    if (psResult.status === 0 && psResult.stdout.trim()) {
      log(`✅ App is running (PIDs: ${psResult.stdout.trim().split('\n').join(', ')})`)
    } else {
      log('❌ App is not running - please start Amp Orchestra first')
      return false
    }
  } catch (e) {
    log(`Could not check if app is running: ${e.message}`)
  }
  
  // Check window structure
  const windowOk = await checkWindowStructure()
  if (!windowOk) {
    log('❌ Could not access app window structure')
    return false
  }
  
  // Check UI elements
  const uiOk = await checkUIElements()
  
  console.log('\n' + '='.repeat(40))
  if (uiOk) {
    console.log('✅ UI VERIFICATION SUCCESSFUL!')
    console.log('Agent mode is visible in the UI')
  } else {
    console.log('❌ UI VERIFICATION FAILED!')
    console.log('Could not locate agent mode display')
    console.log('\nThis could indicate:')
    console.log('• App is in Production mode (agent mode hidden)')
    console.log('• Agent mode is set to "default" (may not show)')  
    console.log('• UI accessibility is restricted')
    console.log('• Manual verification is needed')
  }
  
  return uiOk
}

main().catch(console.error)
