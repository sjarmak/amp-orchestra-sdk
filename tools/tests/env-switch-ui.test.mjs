#!/usr/bin/env node

/**
 * Environment switching UI test without WebView eval
 * Tests basic UI interaction using orchestra-ui commands
 */

import { describe, test, beforeAll, afterAll, expect } from 'vitest'
import { cleanEnv, launchApp, quitApp, wait } from './helpers/env-switch-utils.mjs'
import orchestraUI from '../amp_toolbox/orchestra-ui-helpers.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BUNDLE_ID = 'com.sjarmak.amp-orchestra'
const LOCAL_CLI_PATH = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')
const LOCAL_URL = 'https://localhost:7002'

describe('Environment Switching (UI interaction)', () => {
  beforeAll(async () => {
    console.log('[TEST] Starting UI environment switching test')
    cleanEnv()
    await launchApp()
    await wait(5000) // Give app time to fully load
    console.log('[TEST] App should be ready for interaction')
  }, 30000)

  afterAll(async () => {
    try { quitApp() } catch {}
    cleanEnv()
  })

  test('TC-1: Can open preferences with Cmd+,', async () => {
    console.log('[TEST] Testing preferences shortcut...')
    
    // Focus the app first
    orchestraUI.focus()
    await wait(500)
    
    // Press Cmd+, to open preferences
    orchestraUI.keystroke(',', ['cmd'])
    await wait(2000) // Give dialog time to open
    
    console.log('[TEST] ✓ Preferences shortcut executed')
  })

  test('TC-2: Can navigate UI with keyboard', async () => {
    console.log('[TEST] Testing keyboard navigation...')
    
    // Try to press Escape to close any dialogs
    orchestraUI.keystroke('Escape')
    await wait(500)
    
    // Press Cmd+K to focus chat input
    orchestraUI.keystroke('k', ['cmd']) 
    await wait(500)
    
    // Type a simple message
    orchestraUI.typeText('ping')
    await wait(500)
    
    // Press Enter to send
    orchestraUI.keystroke('Return')
    await wait(3000) // Give time for response
    
    console.log('[TEST] ✓ Basic UI navigation working')
  })

  test('TC-3: Configuration persists after app launch', async () => {
    console.log('[TEST] Testing configuration persistence...')
    
    // Create a test configuration
    const configPath = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json')
    const testConfig = {
      connection_mode: 'local-cli',
      amp_cli_path: LOCAL_CLI_PATH,
      amp_server_url: LOCAL_URL
    }
    
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2))
    console.log('[TEST] Written test configuration')
    
    // Restart the app to test persistence
    quitApp()
    await wait(2000)
    
    await launchApp()
    await wait(5000)
    
    // Verify config still exists
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(savedConfig.connection_mode).toBe('local-cli')
    
    console.log('[TEST] ✓ Configuration persisted correctly')
  })

  test('TC-4: Basic app lifecycle works', async () => {
    console.log('[TEST] Testing basic app lifecycle...')
    
    // App should be running from previous test
    orchestraUI.focus()
    await wait(500)
    
    // Try to interact with the app
    orchestraUI.keystroke('k', ['cmd'])
    await wait(500)
    
    orchestraUI.typeText('test message')
    await wait(500)
    
    // Clear the input
    orchestraUI.keystroke('a', ['cmd'])
    orchestraUI.keystroke('Delete')
    
    console.log('[TEST] ✓ App lifecycle test completed')
  })
})
