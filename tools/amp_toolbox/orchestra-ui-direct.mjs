#!/usr/bin/env node

// Direct UI testing using System Events accessibility instead of WebView evaluation
// This bypasses the AppleScript "do JavaScript" limitation

import { spawnSync } from 'node:child_process'

const DEFAULT_BUNDLE_ID = 'com.sjarmak.amp-orchestra'

function ap(script) {
  const res = spawnSync('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.status !== 0) {
    const err = res.stderr?.toString() || 'osascript error'
    throw new Error(err)
  }
  return res.stdout?.toString() ?? ''
}

function activate(bundleId) {
  ap(`tell application id "${bundleId}" to activate`)
}

function encodeAppleScriptString(s) {
  const esc = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${esc}"`
}

// Get environment badge text using accessibility API
function getEnvironmentBadgeText(bundleId = DEFAULT_BUNDLE_ID) {
  try {
    activate(bundleId)
    // Give app time to focus
    spawnSync('sleep', ['0.5'])
    
    const script = `
      tell application "System Events"
        tell process (get name of application id "${bundleId}")
          set allTexts to every static text
          repeat with txt in allTexts
            set txtValue to get value of txt
            if txtValue contains "Production" or txtValue contains "Local CLI" then
              return txtValue
            end if
          end repeat
          return "BADGE_NOT_FOUND"
        end tell
      end tell
    `
    const result = ap(script).trim()
    return result === 'BADGE_NOT_FOUND' ? null : result
  } catch (error) {
    console.error(`[DEBUG] Failed to get environment badge: ${error.message}`)
    return null
  }
}

// Get agent mode chip text
function getAgentModeChip(bundleId = DEFAULT_BUNDLE_ID) {
  try {
    activate(bundleId)
    spawnSync('sleep', ['0.5'])
    
    const script = `
      tell application "System Events"
        tell process (get name of application id "${bundleId}")
          set allTexts to every static text
          repeat with txt in allTexts
            set txtValue to get value of txt
            if txtValue contains "Mode:" then
              return txtValue
            end if
          end repeat
          return "CHIP_NOT_FOUND"
        end tell
      end tell
    `
    const result = ap(script).trim()
    return result === 'CHIP_NOT_FOUND' ? null : result
  } catch (error) {
    console.error(`[DEBUG] Failed to get agent mode chip: ${error.message}`)
    return null
  }
}

// Click a button by its text content
function clickButtonByText(text, bundleId = DEFAULT_BUNDLE_ID) {
  try {
    activate(bundleId)
    spawnSync('sleep', ['0.2'])
    
    const script = `
      tell application "System Events"
        tell process (get name of application id "${bundleId}")
          set allButtons to every button
          repeat with btn in allButtons
            if (get value of btn) contains "${text}" then
              click btn
              return "CLICKED"
            end if
          end repeat
          return "BUTTON_NOT_FOUND"
        end tell
      end tell
    `
    const result = ap(script).trim()
    return result === 'CLICKED'
  } catch (error) {
    console.error(`[DEBUG] Failed to click button: ${error.message}`)
    return false
  }
}

// Open preferences via keyboard shortcut
function openPreferences(bundleId = DEFAULT_BUNDLE_ID) {
  try {
    activate(bundleId)
    spawnSync('sleep', ['0.2'])
    ap('tell application "System Events" to keystroke "," using {command down}')
    spawnSync('sleep', ['0.5'])
    return true
  } catch (error) {
    console.error(`[DEBUG] Failed to open preferences: ${error.message}`)
    return false
  }
}

// Check if preferences dialog is open
function isPreferencesOpen(bundleId = DEFAULT_BUNDLE_ID) {
  try {
    const script = `
      tell application "System Events"
        tell process (get name of application id "${bundleId}")
          set allTexts to every static text
          repeat with txt in allTexts
            if (get value of txt) contains "Preferences" then
              return "OPEN"
            end if
          end repeat
          return "CLOSED"
        end tell
      end tell
    `
    const result = ap(script).trim()
    return result === 'OPEN'
  } catch (error) {
    console.error(`[DEBUG] Failed to check preferences state: ${error.message}`)
    return false
  }
}

export {
  getEnvironmentBadgeText,
  getAgentModeChip, 
  clickButtonByText,
  openPreferences,
  isPreferencesOpen,
  activate
}

// If run directly, test the functionality
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Testing direct UI access...')
  
  console.log('Environment badge:', getEnvironmentBadgeText())
  console.log('Agent mode chip:', getAgentModeChip())
  console.log('Preferences open:', isPreferencesOpen())
  
  console.log('Opening preferences...')
  openPreferences()
  spawnSync('sleep', ['1'])
  console.log('Preferences open after shortcut:', isPreferencesOpen())
}
