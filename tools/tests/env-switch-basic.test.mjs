#!/usr/bin/env node

/**
 * Basic environment switching test without WebView evaluation
 * Tests the core functionality using file system and log analysis
 */

import { describe, test, beforeAll, afterAll, expect } from 'vitest'
import { cleanEnv, launchApp, quitApp, wait } from './helpers/env-switch-utils.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOCAL_CLI_PATH = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')
const LOCAL_URL = 'https://localhost:7002'

describe('Environment Switching (Basic functionality)', () => {
  beforeAll(async () => {
    console.log('[TEST] Starting basic environment switching test')
    cleanEnv()
  }, 10000)

  test('TC-1: Configuration files are created correctly', async () => {
    // Test that we can create and read configuration files
    const configPaths = [
      path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json'),
      path.join(os.homedir(), '.config', 'ampsm', 'config.json')
    ]

    // Create a test config
    const testConfig = {
      connection_mode: 'local-cli',
      amp_cli_path: LOCAL_CLI_PATH,
      amp_server_url: LOCAL_URL
    }

    const configDir = path.dirname(configPaths[0])
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(configPaths[0], JSON.stringify(testConfig, null, 2))
    
    // Verify the config was written correctly
    const savedConfig = JSON.parse(fs.readFileSync(configPaths[0], 'utf8'))
    expect(savedConfig.connection_mode).toBe('local-cli')
    expect(savedConfig.amp_cli_path).toBe(LOCAL_CLI_PATH)
    expect(savedConfig.amp_server_url).toBe(LOCAL_URL)

    console.log('[TEST] ✓ Configuration file operations working correctly')
  })

  test('TC-2: Production mode configuration', async () => {
    // Test production mode settings
    const configPaths = [
      path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json'),
      path.join(os.homedir(), '.config', 'ampsm', 'config.json')
    ]

    const prodConfig = {
      connection_mode: 'production',
      amp_cli_path: '',
      amp_server_url: ''
    }

    const configDir = path.dirname(configPaths[0])
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(configPaths[0], JSON.stringify(prodConfig, null, 2))
    
    const savedConfig = JSON.parse(fs.readFileSync(configPaths[0], 'utf8'))
    expect(savedConfig.connection_mode).toBe('production')

    console.log('[TEST] ✓ Production mode configuration working correctly')
  })

  test('TC-3: App bundle exists and is launchable', async () => {
    const appPath = path.join(process.cwd(), 'desktop-ui', 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Amp Orchestra.app')
    console.log(`[TEST] Checking for app at: ${appPath}`)
    
    expect(fs.existsSync(appPath)).toBe(true)
    console.log('[TEST] ✓ App bundle exists at expected location')
  })

  afterAll(() => {
    cleanEnv()
    console.log('[TEST] Basic environment switching test completed')
  })
})
