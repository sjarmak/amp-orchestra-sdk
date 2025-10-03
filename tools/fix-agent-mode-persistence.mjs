#!/usr/bin/env node

// Script to manually create the config file and test agent mode persistence
// This will help us understand where the persistence is breaking

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function ensureConfigDirectories() {
  const configPaths = [
    path.join(os.homedir(), 'Library', 'Application Support', 'ampsm'),
    path.join(os.homedir(), '.config', 'ampsm')
  ]
  
  const createdDirs = []
  for (const dir of configPaths) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      createdDirs.push(dir)
      log(`✅ Created directory: ${dir}`)
    } catch (e) {
      if (e.code !== 'EEXIST') {
        log(`❌ Failed to create directory ${dir}: ${e.message}`)
      }
    }
  }
  return createdDirs
}

function createTestConfig() {
  const configDir = path.join(os.homedir(), '.config', 'ampsm')
  const configPath = path.join(configDir, 'config.json')
  
  const testConfig = {
    amp_env: {
      "AMP_EXPERIMENTAL_AGENT_MODE": "claudetto:main",
      "AMP_CLI_PATH": "/Users/sjarmak/amp/cli/dist/main.js",
      "AMP_URL": "https://localhost:7002",
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    },
    connection_mode: "local-cli",
    custom_cli_path: "/Users/sjarmak/amp/cli/dist/main.js",
    local_server_url: "https://localhost:7002",
    runtime: {
      amp_url: "https://localhost:7002",
      cli_path: "/Users/sjarmak/amp/cli/dist/main.js",
      extra_args: [],
      use_local_cli: true
    }
  }
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2))
    log(`✅ Created test config at: ${configPath}`)
    return { success: true, path: configPath, config: testConfig }
  } catch (e) {
    log(`❌ Failed to create config: ${e.message}`)
    return { success: false, error: e.message }
  }
}

function checkCurrentConfig() {
  const configPaths = [
    path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json'),
    path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  ]
  
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8')
        const config = JSON.parse(content)
        return { found: true, path: configPath, config }
      } catch (e) {
        log(`❌ Invalid config at ${configPath}: ${e.message}`)
      }
    }
  }
  return { found: false }
}

function watchConfigFile(configPath, duration = 30000) {
  log(`👀 Watching config file for ${duration/1000} seconds...`)
  
  let lastContent = ''
  try {
    lastContent = fs.readFileSync(configPath, 'utf8')
  } catch (e) {
    // File doesn't exist yet
  }
  
  const interval = setInterval(() => {
    try {
      const currentContent = fs.readFileSync(configPath, 'utf8')
      if (currentContent !== lastContent) {
        log(`🔄 Config file changed!`)
        const config = JSON.parse(currentContent)
        log(`New agent mode: ${config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE || 'not set'}`)
        log(`Connection mode: ${config.connection_mode || 'not set'}`)
        lastContent = currentContent
      }
    } catch (e) {
      // File might have been temporarily unavailable
    }
  }, 1000)
  
  setTimeout(() => {
    clearInterval(interval)
    log(`⏰ Finished watching config file`)
  }, duration)
  
  return interval
}

async function main() {
  log('🔧 Agent Mode Persistence Fix Tool')
  console.log('=================================')
  
  // 1. Ensure config directories exist
  log('📁 Ensuring config directories exist...')
  ensureConfigDirectories()
  
  // 2. Check current config
  log('📄 Checking current configuration...')
  const currentConfig = checkCurrentConfig()
  if (currentConfig.found) {
    log(`✅ Found existing config at: ${currentConfig.path}`)
    const agentMode = currentConfig.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
    log(`Current agent mode: ${agentMode || 'not set'}`)
  } else {
    log('❌ No existing config found')
    
    // 3. Create test config
    log('🆕 Creating test configuration...')
    const testResult = createTestConfig()
    if (!testResult.success) {
      log('❌ Failed to create test config, exiting')
      return
    }
  }
  
  // 4. Instructions for testing
  log('🧪 Testing Instructions:')
  console.log(`
Now follow these steps to test agent mode persistence:

1. 🚀 Start/restart the Amp Orchestra app
2. ⚙️  Open Preferences (Cmd+,)  
3. 🔄 Switch to Development mode if not already
4. 🎯 Set Agent Mode to "claudetto:main"
5. 💾 Click "Apply Dev Settings"
6. ❌ Close preferences (Escape)
7. 👀 Check if "Mode: claudetto:main" appears in top-right corner
8. 🔄 Switch to Production tab, then back to Development
9. 🔍 Verify agent mode is still "claudetto:main"

Expected behavior:
- Agent mode should persist when switching between environments
- Config file should be updated with the new agent mode
- TopBar should show the correct agent mode

If it's still not working, the issue might be in:
- AppConfig.save() not being called
- App state not being loaded properly on startup  
- Frontend not calling the correct Tauri commands
`)

  // 5. Watch config file for changes
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  const watchInterval = watchConfigFile(configPath, 60000)
  
  // 6. Final diagnostics
  setTimeout(() => {
    log('🔍 Final diagnostic check...')
    const finalConfig = checkCurrentConfig()
    if (finalConfig.found) {
      const agentMode = finalConfig.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
      const connectionMode = finalConfig.config.connection_mode
      
      if (agentMode && agentMode !== 'default' && connectionMode === 'local-cli') {
        log('✅ SUCCESS: Agent mode is persisted in config!')
        log(`Final agent mode: ${agentMode}`)
      } else {
        log('❌ ISSUE: Agent mode is not properly persisted')
        log(`Final agent mode: ${agentMode || 'not set'}`)
        log(`Connection mode: ${connectionMode || 'not set'}`)
        
        console.log(`
🐛 Debugging next steps:
1. Check the app logs: tail -f ~/amp-orchestra/logs/startup-env.log
2. Check Tauri console for error messages  
3. Verify the save() function is being called in set_environment
4. Check if app state is being loaded on startup
`)
      }
    } else {
      log('❌ ISSUE: No config file found after testing')
    }
  }, 65000)
}

main().catch(console.error)
