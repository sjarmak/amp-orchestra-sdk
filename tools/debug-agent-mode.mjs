#!/usr/bin/env node

// Manual debugging script to check agent mode functionality
// Run this while the app is running to see internal state

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function describeStep(name) { process.stdout.write(`\n=== ${name} ===\n`) }

function homeConfigPaths() {
  const mac = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json')
  const xdg = path.join(os.homedir(), '.config', 'ampsm', 'config.json')
  return [mac, xdg]
}

function read(p) { 
  try { 
    return fs.readFileSync(p, 'utf8') 
  } catch { 
    return null 
  } 
}

async function main() {
  describeStep('Agent Mode Debug Check')
  
  // Check config files
  const configPaths = homeConfigPaths()
  for (const configPath of configPaths) {
    console.log(`\n📁 Config path: ${configPath}`)
    const content = read(configPath)
    if (content) {
      try {
        const config = JSON.parse(content)
        console.log('✅ Config found:')
        console.log(`   connection_mode: ${config.connection_mode}`)
        console.log(`   custom_cli_path: ${config.custom_cli_path}`)
        console.log(`   local_server_url: ${config.local_server_url}`)
        console.log(`   amp_env keys: ${Object.keys(config.amp_env || {})}`)
        if (config.amp_env?.AMP_EXPERIMENTAL_AGENT_MODE) {
          console.log(`   ✅ AMP_EXPERIMENTAL_AGENT_MODE: ${config.amp_env.AMP_EXPERIMENTAL_AGENT_MODE}`)
        } else {
          console.log(`   ❌ AMP_EXPERIMENTAL_AGENT_MODE: not set`)
        }
      } catch (error) {
        console.log(`❌ Invalid JSON: ${error.message}`)
      }
    } else {
      console.log('❌ Config not found')
    }
  }

  // Check app database
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'com.sjarmak.amp-orchestra', 'app.db')
  console.log(`\n💾 Database path: ${dbPath}`)
  if (fs.existsSync(dbPath)) {
    console.log('✅ Database exists')
    // We could use sqlite3 to check if sessions have agent_mode set
  } else {
    console.log('❌ Database not found')
  }

  // Check environment variables that might be set
  describeStep('Environment Variables')
  const envVars = ['AMP_EXPERIMENTAL_AGENT_MODE', 'AMP_CLI_PATH', 'AMP_URL', 'AMP_BIN']
  for (const envVar of envVars) {
    const value = process.env[envVar]
    if (value) {
      console.log(`✅ ${envVar}: ${value}`)
    } else {
      console.log(`❌ ${envVar}: not set`)
    }
  }

  console.log('\n📝 Manual Test Steps:')
  console.log('1. Ensure app is in Development mode (Local CLI badge visible)')
  console.log('2. Open Preferences (Cmd+,)')
  console.log('3. Change Agent Mode dropdown to "claudetto:main"')
  console.log('4. Click "Apply Dev Settings"')
  console.log('5. Close preferences (Escape or Done button)')
  console.log('6. Check if top-right shows "Mode: claudetto:main"')
  console.log('7. Switch to Production tab, then back to Development')
  console.log('8. Verify agent mode is preserved')
  
  console.log('\n🔍 If agent mode chip still shows "default":')
  console.log('   - Check if AMP_EXPERIMENTAL_AGENT_MODE appears in config above')
  console.log('   - Check Tauri console for "setting AMP_EXPERIMENTAL_AGENT_MODE=" messages')
  console.log('   - Verify TopBar component is reading from get_agent_mode correctly')
}

main().catch(console.error)
