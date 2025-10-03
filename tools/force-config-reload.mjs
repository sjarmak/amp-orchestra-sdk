#!/usr/bin/env node

// Force config reload test - restarts the app and monitors config loading

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function readConfig() {
  const configPath = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return { found: true, config: JSON.parse(content) }
  } catch (e) {
    return { found: false, error: e.message }
  }
}

async function killApp() {
  try {
    log('🔄 Killing existing app processes...')
    const killResult = spawnSync('pkill', ['-f', 'amp-orchestra'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    if (killResult.status === 0) {
      log('✅ App processes terminated')
    } else {
      log('⚠️ No app processes found to kill')
    }
    
    // Wait for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 3000))
    
  } catch (e) {
    log(`Could not kill app: ${e.message}`)
  }
}

async function startApp() {
  try {
    log('🚀 Starting app...')
    
    // Clear startup logs
    const logPath = '/Users/sjarmak/amp-orchestra/logs/startup-env.log'
    try {
      fs.writeFileSync(logPath, '')
      log('🧹 Cleared startup logs')
    } catch (e) {
      log(`Could not clear logs: ${e.message}`)
    }
    
    // Start the app in the background
    const startResult = spawnSync('open', ['-a', 'Amp Orchestra'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    if (startResult.status === 0) {
      log('✅ App launched')
    } else {
      log(`❌ Failed to launch app: ${startResult.stderr?.toString()}`)
      return false
    }
    
    // Wait for app to start up
    log('⏳ Waiting for app startup...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    return true
    
  } catch (e) {
    log(`Could not start app: ${e.message}`)
    return false
  }
}

function monitorStartupLogs() {
  const logPath = '/Users/sjarmak/amp-orchestra/logs/startup-env.log'
  
  log('👀 Monitoring startup logs for config loading...')
  
  let lastContent = ''
  let checkCount = 0
  
  const interval = setInterval(() => {
    try {
      checkCount++
      const currentContent = fs.readFileSync(logPath, 'utf8')
      
      if (currentContent !== lastContent) {
        const newLines = currentContent.replace(lastContent, '').trim()
        if (newLines) {
          log('📋 New startup log entries:')
          newLines.split('\n').forEach(line => {
            if (line.trim()) {
              log(`  ${line}`)
            }
          })
        }
        lastContent = currentContent
      }
      
      // Check for specific config loading patterns
      if (currentContent.includes('AMP_EXPERIMENTAL_AGENT_MODE')) {
        log('🎯 Found agent mode in startup logs!')
        clearInterval(interval)
        return
      }
      
      if (currentContent.includes('local-cli')) {
        log('🔧 Found local-cli mode in startup logs!')
      }
      
      if (checkCount > 20) { // Stop after 10 seconds
        log('⏰ Finished monitoring startup logs')
        clearInterval(interval)
      }
      
    } catch (e) {
      // File might not exist yet or be temporarily unavailable
    }
  }, 500)
  
  return interval
}

async function main() {
  log('🔄 Force Config Reload Test')
  console.log('===========================')
  
  // 1. Verify config file exists and is correct
  log('📄 Checking config file...')
  const config = readConfig()
  if (!config.found) {
    log(`❌ Config file not found: ${config.error}`)
    return false
  }
  
  const agentMode = config.config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE
  const connectionMode = config.config.connection_mode
  
  log(`✅ Config file exists:`)
  log(`  Connection mode: ${connectionMode}`)
  log(`  Agent mode: ${agentMode}`)
  
  if (connectionMode !== 'local-cli' || agentMode !== 'claudetto:main') {
    log('❌ Config file does not have expected values!')
    return false
  }
  
  // 2. Kill existing app
  await killApp()
  
  // 3. Start monitoring logs
  const logMonitor = monitorStartupLogs()
  
  // 4. Start app
  const started = await startApp()
  if (!started) {
    clearInterval(logMonitor)
    return false
  }
  
  // 5. Wait for startup to complete
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  // 6. Check final state
  log('🔍 Checking final app state...')
  
  // Read the logs again to see what was loaded
  const logPath = '/Users/sjarmak/amp-orchestra/logs/startup-env.log'
  try {
    const logContent = fs.readFileSync(logPath, 'utf8')
    const lines = logContent.split('\n')
    const recentLines = lines.slice(-10)
    
    log('📋 Recent startup log entries:')
    recentLines.forEach(line => {
      if (line.trim()) {
        log(`  ${line}`)
      }
    })
    
    const hasAgentMode = logContent.includes('AMP_EXPERIMENTAL_AGENT_MODE')
    const hasLocalCli = logContent.includes('local-cli')
    
    if (hasAgentMode && hasLocalCli) {
      log('🎉 SUCCESS: Config loaded correctly!')
      return true
    } else {
      log(`❌ Config not loaded correctly:`)
      log(`  Agent mode found: ${hasAgentMode}`)
      log(`  Local CLI found: ${hasLocalCli}`)
      return false
    }
    
  } catch (e) {
    log(`Could not read startup logs: ${e.message}`)
    return false
  }
}

main().then(success => {
  console.log('\n' + '='.repeat(40))
  if (success) {
    console.log('✅ CONFIG RELOAD TEST PASSED!')
    console.log('The app should now be running with agent mode')
  } else {
    console.log('❌ CONFIG RELOAD TEST FAILED!')
    console.log('The app may not be loading the config correctly')
  }
}).catch(console.error)
