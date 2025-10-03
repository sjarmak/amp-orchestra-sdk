#!/usr/bin/env node

// Manual agent mode persistence test with automated verification
// Guides the user through the workflow and verifies results

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function readConfig() {
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return { found: true, path: configPath, config: JSON.parse(content) }
  } catch (e) {
    return { found: false, path: configPath, error: e.message }
  }
}

function watchConfigFile(duration = 30000) {
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  
  let lastContent = ''
  let changeCount = 0
  
  try {
    lastContent = fs.readFileSync(configPath, 'utf8')
  } catch (e) {
    log('Config file does not exist yet, waiting for creation...')
  }
  
  log(`👀 Watching config file for ${duration/1000} seconds...`)
  
  const interval = setInterval(() => {
    try {
      const currentContent = fs.readFileSync(configPath, 'utf8')
      if (currentContent !== lastContent) {
        changeCount++
        log(`🔄 Config change #${changeCount} detected!`)
        
        try {
          const config = JSON.parse(currentContent)
          const agentMode = config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
          const connectionMode = config.connection_mode
          
          log(`  Connection mode: ${connectionMode}`)
          log(`  Agent mode: ${agentMode || 'not set'}`)
          
          if (agentMode === 'claudetto:main' && connectionMode === 'local-cli') {
            log('🎉 SUCCESS: Target configuration detected!')
          }
        } catch (parseError) {
          log(`⚠️ Config file format error: ${parseError.message}`)
        }
        
        lastContent = currentContent
      }
    } catch (e) {
      // File might be temporarily unavailable during write
    }
  }, 500)
  
  setTimeout(() => {
    clearInterval(interval)
    log(`⏰ Finished watching config file (detected ${changeCount} changes)`)
  }, duration)
  
  return interval
}

async function verifyAgentModePersistence() {
  log('🔍 Agent Mode Persistence Verification')
  console.log('======================================')
  
  // 1. Check initial state
  const initialConfig = readConfig()
  if (initialConfig.found) {
    log(`✅ Config file exists: ${initialConfig.path}`)
    const agentMode = initialConfig.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
    const connectionMode = initialConfig.config.connection_mode
    log(`Initial connection mode: ${connectionMode}`)
    log(`Initial agent mode: ${agentMode || 'not set'}`)
  } else {
    log(`❌ Config file not found: ${initialConfig.path}`)
    log(`Error: ${initialConfig.error}`)
  }
  
  // 2. Display manual test instructions
  console.log(`
🎯 MANUAL TEST WORKFLOW
======================

Please follow these exact steps while this script monitors the config file:

1. 🚀 Ensure the Amp Orchestra app is running and focused

2. ⚙️ Open Preferences:
   - Press Cmd+, (Command + Comma)
   - Or click the Settings gear icon in the top-right

3. 🔄 Switch to Development Mode:
   - Click the "Development (Local CLI)" radio button
   - Wait a moment for the form to expand

4. 🎛️ Set Agent Mode:
   - Look for "Agent Mode (dev only)" dropdown
   - Change it from "default" to "claudetto:main"

5. 💾 Apply Changes:
   - Click the "Apply Dev Settings" button
   - Wait for the operation to complete

6. ❌ Close Preferences:
   - Press Escape or click "Done"

7. 👀 Verify UI Display:
   - Look for "Mode: claudetto:main" chip in top-right corner
   - The environment badge should show "Local CLI"

8. 🔄 Test Persistence:
   - Open preferences again (Cmd+,)
   - Switch to "Production (System amp)" mode
   - Close preferences
   - Open preferences again
   - Switch back to "Development (Local CLI)"
   - Verify agent mode is still "claudetto:main"
   - Close preferences

Expected Results:
✅ Config file should be updated with agent_mode: "claudetto:main"
✅ UI should show "Mode: claudetto:main" when in Development
✅ Agent mode should persist when switching environments

`)
  
  // 3. Start watching config file
  const watchInterval = watchConfigFile(60000)
  
  // 4. Wait and then verify results
  return new Promise((resolve) => {
    setTimeout(async () => {
      log('🔍 Final verification...')
      
      const finalConfig = readConfig()
      if (finalConfig.found) {
        const agentMode = finalConfig.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
        const connectionMode = finalConfig.config.connection_mode
        
        log(`Final connection mode: ${connectionMode}`)
        log(`Final agent mode: ${agentMode || 'not set'}`)
        
        // Check for success conditions
        const agentModeCorrect = agentMode === 'claudetto:main'
        const connectionModeCorrect = connectionMode === 'local-cli'
        
        if (agentModeCorrect && connectionModeCorrect) {
          log('🎉 SUCCESS: Agent mode persistence verified!')
          log('✅ Configuration is correctly saved')
          log('✅ Agent mode is set to claudetto:main')
          log('✅ Connection mode is local-cli')
          resolve(true)
        } else {
          log('❌ FAILURE: Agent mode persistence issue detected')
          
          if (!connectionModeCorrect) {
            log(`  Issue: Connection mode is "${connectionMode}", expected "local-cli"`)
          }
          if (!agentModeCorrect) {
            log(`  Issue: Agent mode is "${agentMode || 'not set'}", expected "claudetto:main"`)
          }
          
          console.log(`
🐛 DEBUGGING TIPS:
=================

1. Check if the preferences dialog opened correctly
2. Verify you clicked "Development (Local CLI)" radio button
3. Make sure the "Agent Mode" dropdown was visible and changed
4. Confirm you clicked "Apply Dev Settings" button
5. Check the app logs for any errors:
   tail -f ~/amp-orchestra/logs/startup-env.log

If the issue persists:
- Try restarting the app after making changes
- Check if there are permission issues with the config directory
- Verify the Tauri backend is processing the set_environment command
`)
          
          resolve(false)
        }
      } else {
        log('❌ FAILURE: Could not read final config')
        log(`Config path: ${finalConfig.path}`)
        log(`Error: ${finalConfig.error}`)
        resolve(false)
      }
    }, 65000)
  })
}

async function main() {
  console.log('🧪 Manual Agent Mode Persistence Test')
  console.log('====================================')
  
  const success = await verifyAgentModePersistence()
  
  if (success) {
    console.log('\n🎉 Agent mode persistence test PASSED!')
    console.log('The fix is working correctly.')
  } else {
    console.log('\n❌ Agent mode persistence test FAILED!')
    console.log('The issue needs further investigation.')
  }
  
  return success
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
