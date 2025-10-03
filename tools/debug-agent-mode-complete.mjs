#!/usr/bin/env node

// Complete debugging script for agent mode persistence issue
// Tests the full workflow step by step with detailed diagnostics

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function readConfig() {
  const configPaths = [
    path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json'),
    path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  ]
  
  for (const configPath of configPaths) {
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(content)
      return { found: true, path: configPath, config }
    } catch (e) {
      // Continue checking other paths
    }
  }
  return { found: false }
}

async function checkAppDatabase() {
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'com.sjarmak.amp-orchestra', 'app.db')
  
  if (!fs.existsSync(dbPath)) {
    return { found: false, path: dbPath }
  }
  
  try {
    // Use sqlite3 to check if it's installed and query the database
    const result = spawnSync('sqlite3', [dbPath, '.tables'], { 
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    })
    
    if (result.status === 0) {
      const tables = result.stdout.split(/\s+/).filter(Boolean)
      return {
        found: true,
        path: dbPath,
        tables,
        canQuery: true
      }
    } else {
      return {
        found: true,
        path: dbPath,
        canQuery: false,
        error: result.stderr
      }
    }
  } catch (e) {
    return {
      found: true,
      path: dbPath,
      canQuery: false,
      error: `sqlite3 not available: ${e.message}`
    }
  }
}

function checkEnvironmentVariables() {
  const envVars = [
    'AMP_EXPERIMENTAL_AGENT_MODE',
    'AMP_CLI_PATH', 
    'AMP_URL',
    'AMP_BIN',
    'AMP_TOKEN',
    'AMP_TOOLBOX'
  ]
  
  const result = {}
  for (const envVar of envVars) {
    const value = process.env[envVar]
    result[envVar] = {
      set: !!value,
      value: value || null,
      // Redact sensitive values
      display: envVar === 'AMP_TOKEN' && value ? `[REDACTED:${value.length}]` : value
    }
  }
  return result
}

async function testAgentModeFlow() {
  log('🧪 Complete Agent Mode Persistence Test')
  console.log('=====================================')
  
  // 1. Check initial state
  log('📄 Checking configuration files...')
  const configCheck = readConfig()
  if (configCheck.found) {
    log(`✅ Config found at: ${configCheck.path}`)
    const config = configCheck.config
    log(`Connection mode: ${config.connection_mode || 'not set'}`)
    log(`Custom CLI path: ${config.custom_cli_path || 'not set'}`)
    log(`Local server URL: ${config.local_server_url || 'not set'}`)
    
    if (config.amp_env) {
      log(`Environment variables in config:`)
      Object.entries(config.amp_env).forEach(([key, value]) => {
        const display = key === 'AMP_TOKEN' ? `[REDACTED:${String(value).length}]` : value
        log(`  ${key}: ${display}`)
      })
      
      if (config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE) {
        log(`✅ AMP_EXPERIMENTAL_AGENT_MODE found: ${config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE}`)
      } else {
        log(`❌ AMP_EXPERIMENTAL_AGENT_MODE not found in config`)
      }
    } else {
      log(`❌ No amp_env section in config`)
    }
  } else {
    log('❌ No configuration files found')
  }
  
  // 2. Check database
  log('💾 Checking application database...')
  const dbCheck = await checkAppDatabase()
  if (dbCheck.found) {
    log(`✅ Database found at: ${dbCheck.path}`)
    if (dbCheck.canQuery) {
      log(`Available tables: ${dbCheck.tables.join(', ')}`)
      
      // Query for sessions with agent mode
      try {
        const sessionsResult = spawnSync('sqlite3', [
          dbCheck.path, 
          'SELECT id, context, agent_mode, toolbox_path FROM chat_sessions ORDER BY updated_at DESC LIMIT 5;'
        ], { 
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8'
        })
        
        if (sessionsResult.status === 0 && sessionsResult.stdout.trim()) {
          log('Recent chat sessions:')
          sessionsResult.stdout.trim().split('\n').forEach((line, i) => {
            log(`  ${i + 1}: ${line}`)
          })
        } else {
          log('No chat sessions found or query failed')
        }
      } catch (e) {
        log(`Could not query sessions: ${e.message}`)
      }
    } else {
      log(`❌ Cannot query database: ${dbCheck.error}`)
    }
  } else {
    log(`❌ Database not found at: ${dbCheck.path}`)
  }
  
  // 3. Check environment variables
  log('🌍 Checking current environment variables...')
  const envCheck = checkEnvironmentVariables()
  Object.entries(envCheck).forEach(([key, info]) => {
    if (info.set) {
      log(`✅ ${key}: ${info.display}`)
    } else {
      log(`❌ ${key}: not set`)
    }
  })
  
  // 4. Test the flow systematically
  log('🔄 Testing agent mode persistence theory...')
  
  log(`
Theory of the problem:
1. User sets agent mode in Development preferences ✓
2. EnvironmentSwitcher calls setEnvironment() with agent_mode ✓
3. set_environment() stores it in app_state.amp_env["AMP_EXPERIMENTAL_AGENT_MODE"] ✓
4. config.save() persists it to the JSON config file ✓
5. get_agent_mode() reads from app_state.amp_env["AMP_EXPERIMENTAL_AGENT_MODE"] ✓
6. TopBar component calls get_agent_mode() and displays it ✓

Potential issues to investigate:
A. Agent mode is being cleared when switching between environments
B. App state is not being loaded correctly on startup
C. The UI event handlers aren't triggering properly
D. The agent mode is being overridden somewhere in the flow
`)

  // 5. Specific diagnostic checks
  log('🔍 Diagnostic checks...')
  
  // Check if app is currently running
  try {
    const psResult = spawnSync('pgrep', ['-f', 'amp-orchestra'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    })
    if (psResult.status === 0 && psResult.stdout.trim()) {
      log(`✅ App is running (PIDs: ${psResult.stdout.trim().split('\n').join(', ')})`)
    } else {
      log(`❌ App is not running`)
    }
  } catch (e) {
    log(`Could not check if app is running: ${e.message}`)
  }
  
  // Check config file permissions
  if (configCheck.found) {
    try {
      const stats = fs.statSync(configCheck.path)
      log(`✅ Config file is writable: ${!!(stats.mode & 0o200)}`)
      log(`   Size: ${stats.size} bytes, Modified: ${stats.mtime.toISOString()}`)
    } catch (e) {
      log(`❌ Could not check config file permissions: ${e.message}`)
    }
  }
  
  log('🎯 Next steps for debugging:')
  console.log(`
1. Start the app in development mode
2. Open preferences (Cmd+,) and set agent mode to "claudetto:main"
3. Click "Apply Dev Settings" 
4. Close preferences
5. Check if "Mode: claudetto:main" appears in top-right
6. Switch to Production tab, then back to Development
7. Run this script again to see if config persisted

Manual test commands:
  # Watch config file for changes:
  fswatch ${configCheck.found ? configCheck.path : '~/.config/ampsm/config.json'} | while read f; do echo "Config changed: $(date)"; cat "$f"; done
  
  # Monitor app logs:
  tail -f ~/amp-orchestra/logs/ui-connection.log
  
  # Check running processes:
  ps aux | grep amp-orchestra
`)
}

testAgentModeFlow().catch(console.error)
