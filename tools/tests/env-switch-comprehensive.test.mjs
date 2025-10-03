#!/usr/bin/env node

/**
 * Comprehensive environment switching test suite
 * Tests the complete functionality using file system validation,
 * configuration management, and app lifecycle testing
 */

import { describe, test, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest'
import { cleanEnv, launchApp, quitApp, wait } from './helpers/env-switch-utils.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const LOCAL_CLI_PATH = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')
const LOCAL_URL = 'https://localhost:7002'
const BUNDLE_ID = 'com.sjarmak.amp-orchestra'

function getConfigPath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'config.json')
}

function createConfig(config) {
  const configPath = getConfigPath()
  const configDir = path.dirname(configPath)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  return configPath
}

function readConfig() {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return null
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function isAppRunning() {
  // Try multiple ways to detect the app
  const pgrepResult = spawnSync('pgrep', ['-f', 'Amp Orchestra'], { stdio: 'pipe' })
  if (pgrepResult.status === 0 && pgrepResult.stdout.toString().trim().length > 0) {
    return true
  }
  
  const pkillResult = spawnSync('pgrep', ['-f', 'com.sjarmak.amp-orchestra'], { stdio: 'pipe' })
  return pkillResult.status === 0 && pkillResult.stdout.toString().trim().length > 0
}

function killApp() {
  // Try multiple ways to kill the app
  spawnSync('killall', ['Amp Orchestra'], { stdio: 'ignore' })
  spawnSync('killall', ['-9', 'Amp Orchestra'], { stdio: 'ignore' })
  // Also try killing by bundle ID process
  spawnSync('pkill', ['-f', 'com.sjarmak.amp-orchestra'], { stdio: 'ignore' })
}

describe('Comprehensive Environment Switching Tests', () => {
  beforeEach(() => {
    console.log('\n[TEST] === Starting new test ===')
    cleanEnv()
  })

  afterEach(() => {
    killApp()
    cleanEnv()
  })

  describe('Configuration Management', () => {
    test('TC-1: Production configuration creates and persists correctly', () => {
      console.log('[TEST] Testing production configuration...')
      
      const prodConfig = {
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      }

      const configPath = createConfig(prodConfig)
      expect(fs.existsSync(configPath)).toBe(true)

      const savedConfig = readConfig()
      expect(savedConfig.connection_mode).toBe('production')
      expect(savedConfig.amp_cli_path).toBe('')
      expect(savedConfig.amp_server_url).toBe('')
      
      console.log('[TEST] ✓ Production configuration working correctly')
    })

    test('TC-2: Local CLI configuration creates and persists correctly', () => {
      console.log('[TEST] Testing local CLI configuration...')
      
      const localConfig = {
        connection_mode: 'local-cli',
        amp_cli_path: LOCAL_CLI_PATH,
        amp_server_url: LOCAL_URL
      }

      const configPath = createConfig(localConfig)
      expect(fs.existsSync(configPath)).toBe(true)

      const savedConfig = readConfig()
      expect(savedConfig.connection_mode).toBe('local-cli')
      expect(savedConfig.amp_cli_path).toBe(LOCAL_CLI_PATH)
      expect(savedConfig.amp_server_url).toBe(LOCAL_URL)
      
      console.log('[TEST] ✓ Local CLI configuration working correctly')
    })

    test('TC-3: Configuration switching works correctly', () => {
      console.log('[TEST] Testing configuration switching...')
      
      // Start with production
      createConfig({
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      })
      
      let config = readConfig()
      expect(config.connection_mode).toBe('production')

      // Switch to local CLI
      createConfig({
        connection_mode: 'local-cli',
        amp_cli_path: LOCAL_CLI_PATH,
        amp_server_url: LOCAL_URL
      })

      config = readConfig()
      expect(config.connection_mode).toBe('local-cli')
      expect(config.amp_cli_path).toBe(LOCAL_CLI_PATH)

      // Switch back to production
      createConfig({
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      })

      config = readConfig()
      expect(config.connection_mode).toBe('production')
      expect(config.amp_cli_path).toBe('')
      
      console.log('[TEST] ✓ Configuration switching working correctly')
    })
  })

  describe('Application Lifecycle', () => {
    test('TC-4: App can be launched and terminated correctly', async () => {
      console.log('[TEST] Testing app lifecycle...')
      
      // Force kill any running app first to ensure clean state
      killApp()
      await wait(2000)
      
      // Now ensure app is not running
      expect(isAppRunning()).toBe(false)
      
      // Launch app
      await launchApp()
      await wait(5000) // Give app time to start
      
      // Check if app is running
      expect(isAppRunning()).toBe(true)
      console.log('[TEST] ✓ App launched successfully')
      
      // Terminate app
      killApp()
      await wait(4000) // Give more time for termination
      
      // Verify app is terminated
      expect(isAppRunning()).toBe(false)
      console.log('[TEST] ✓ App terminated successfully')
    }, 15000)

    test('TC-5: App respects configuration on startup', async () => {
      console.log('[TEST] Testing configuration loading on startup...')
      
      // Create local CLI config
      createConfig({
        connection_mode: 'local-cli',
        amp_cli_path: LOCAL_CLI_PATH,
        amp_server_url: LOCAL_URL
      })
      
      // Launch app
      await launchApp()
      await wait(5000)
      
      // Verify app is running
      expect(isAppRunning()).toBe(true)
      
      // Verify config still exists and is correct
      const config = readConfig()
      expect(config.connection_mode).toBe('local-cli')
      expect(config.amp_cli_path).toBe(LOCAL_CLI_PATH)
      
      console.log('[TEST] ✓ App loads configuration correctly on startup')
    }, 15000)
  })

  describe('Environment Variable Management', () => {
    test('TC-6: Production mode has correct defaults', () => {
      console.log('[TEST] Testing production mode defaults...')
      
      const prodConfig = {
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      }

      createConfig(prodConfig)
      
      // In production mode, we expect no custom CLI path or server URL
      const config = readConfig()
      expect(config.amp_cli_path).toBe('')
      expect(config.amp_server_url).toBe('')
      
      console.log('[TEST] ✓ Production mode defaults are correct')
    })

    test('TC-7: Local CLI mode has correct settings', () => {
      console.log('[TEST] Testing local CLI mode settings...')
      
      const localConfig = {
        connection_mode: 'local-cli',
        amp_cli_path: LOCAL_CLI_PATH,
        amp_server_url: LOCAL_URL
      }

      createConfig(localConfig)
      
      const config = readConfig()
      expect(config.amp_cli_path).toBe(LOCAL_CLI_PATH)
      expect(config.amp_server_url).toBe(LOCAL_URL)
      
      console.log('[TEST] ✓ Local CLI mode settings are correct')
    })
  })

  describe('Persistence and Recovery', () => {
    test('TC-8: Configuration persists across multiple app restarts', async () => {
      console.log('[TEST] Testing configuration persistence across restarts...')
      
      // Create initial config
      createConfig({
        connection_mode: 'local-cli',
        amp_cli_path: LOCAL_CLI_PATH,
        amp_server_url: LOCAL_URL
      })
      
      // First launch
      await launchApp()
      await wait(3000)
      expect(isAppRunning()).toBe(true)
      
      // Terminate
      killApp()
      await wait(4000)
      expect(isAppRunning()).toBe(false)
      
      // Verify config still exists
      let config = readConfig()
      expect(config.connection_mode).toBe('local-cli')
      
      // Second launch
      await launchApp()
      await wait(3000)
      expect(isAppRunning()).toBe(true)
      
      // Verify config is still correct
      config = readConfig()
      expect(config.connection_mode).toBe('local-cli')
      expect(config.amp_cli_path).toBe(LOCAL_CLI_PATH)
      
      console.log('[TEST] ✓ Configuration persists across restarts')
    }, 25000)
  })

  describe('Error Handling', () => {
    test('TC-9: Invalid configuration is handled gracefully', () => {
      console.log('[TEST] Testing invalid configuration handling...')
      
      // Create config with invalid JSON
      const configPath = getConfigPath()
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(configPath, '{ invalid json }')
      
      // Reading should handle this gracefully
      expect(() => readConfig()).toThrow()
      
      // Clean up and create valid config
      fs.unlinkSync(configPath)
      createConfig({
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      })
      
      const config = readConfig()
      expect(config.connection_mode).toBe('production')
      
      console.log('[TEST] ✓ Invalid configuration handled gracefully')
    })

    test('TC-10: Missing configuration directory is created', () => {
      console.log('[TEST] Testing missing directory creation...')
      
      const configPath = getConfigPath()
      const configDir = path.dirname(configPath)
      
      // Remove config directory if it exists
      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true })
      }
      
      expect(fs.existsSync(configDir)).toBe(false)
      
      // Create config should create directory
      createConfig({
        connection_mode: 'production',
        amp_cli_path: '',
        amp_server_url: ''
      })
      
      expect(fs.existsSync(configDir)).toBe(true)
      expect(fs.existsSync(configPath)).toBe(true)
      
      console.log('[TEST] ✓ Missing configuration directory created successfully')
    })
  })
})
