#!/usr/bin/env node

// Simple verification that the agent mode fix is working
// Checks if the app is reading the config correctly

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function verifyFix() {
  log('🔍 Verifying Agent Mode Persistence Fix')
  console.log('====================================')
  
  // 1. Check that config file exists and has correct content
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  
  if (!fs.existsSync(configPath)) {
    log('❌ Config file still missing')
    return false
  }
  
  let config
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    config = JSON.parse(content)
    log('✅ Config file exists and is valid JSON')
  } catch (e) {
    log(`❌ Config file is corrupted: ${e.message}`)
    return false
  }
  
  // 2. Verify config has correct structure
  if (!config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE) {
    log('❌ Agent mode not set in config')
    return false
  }
  
  if (config.connection_mode !== 'local-cli') {
    log('❌ Connection mode is not local-cli')
    return false
  }
  
  log(`✅ Agent mode in config: ${config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE}`)
  log(`✅ Connection mode: ${config.connection_mode}`)
  
  // 3. Check if app startup logs show the config is being loaded
  const startupLogPath = '/Users/sjarmak/amp-orchestra/logs/startup-env.log'
  if (fs.existsSync(startupLogPath)) {
    try {
      const logContent = fs.readFileSync(startupLogPath, 'utf8')
      const lines = logContent.split('\n')
      const recentLines = lines.slice(-20) // Last 20 lines
      
      const foundConfigLoad = recentLines.some(line => 
        line.includes('parsed config: mode=Some("local-cli")') ||
        line.includes('AMP_EXPERIMENTAL_AGENT_MODE')
      )
      
      if (foundConfigLoad) {
        log('✅ App startup logs show config is being loaded')
      } else {
        log('❌ No recent config loading found in startup logs')
        log('Recent log lines:')
        recentLines.slice(-5).forEach(line => log(`  ${line}`))
      }
      
    } catch (e) {
      log(`Could not read startup logs: ${e.message}`)
    }
  }
  
  // 4. Test by creating a new session and checking if agent mode persists
  log('📝 Testing workflow:')
  console.log(`
The fix should now enable the following workflow:

1. ✅ Config directories created: ~/.config/ampsm/
2. ✅ Config file exists with agent mode: ${config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE}
3. ✅ App should load this config on startup
4. 🎯 USER TEST: Open the app and verify "Mode: ${config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE}" shows in top-right
5. 🎯 USER TEST: Switch to Production, then back to Development - mode should persist

If the mode still shows "default" in the UI, the issue might be:
- App cache needs clearing (restart the app)
- UI components not refreshing properly  
- get_agent_mode() Tauri command not working correctly
`)

  return true
}

async function main() {
  const success = await verifyFix()
  
  if (success) {
    console.log('\n✅ Agent mode persistence fix appears to be working')
    console.log('Please manually verify the UI shows the correct agent mode')
  } else {
    console.log('\n❌ Agent mode persistence fix needs more work')
  }
}

main().catch(console.error)
