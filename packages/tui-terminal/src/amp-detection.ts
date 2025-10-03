/**
 * Amp CLI Detection and Management
 * 
 * This module handles detection of Amp installations and provides utilities
 * for spawning and managing Amp CLI processes.
 */

import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import { platform } from 'node:os'

export interface AmpInstallation {
  type: 'production' | 'dev'
  path: string
  version?: string
  working: boolean
}

export interface AmpProcessOptions {
  mode?: 'production' | 'dev'
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

/**
 * Detect available Amp installations on the system
 */
export async function detectAmpInstallations(): Promise<AmpInstallation[]> {
  const installations: AmpInstallation[] = []
  
  // Check for production installation via which/where
  try {
    const productionPath = await findAmpInPath()
    if (productionPath) {
      const version = await getAmpVersion(productionPath)
      const inst: AmpInstallation = {
        type: 'production',
        path: productionPath,
        working: true
      }
      if (version) inst.version = version
      installations.push(inst)
    }
  } catch (error) {
    console.warn('Failed to detect production Amp:', error)
  }
  
  // Check for dev installation (common locations)
  const devPaths = [
    '/Users/sjarmak/amp/cli/dist/main.js', // Known dev location
    join(process.env.HOME || '', 'amp/cli/dist/main.js'),
    join(process.env.HOME || '', 'projects/amp/cli/dist/main.js'),
    join(process.env.HOME || '', 'src/amp/cli/dist/main.js'),
  ]
  
  for (const devPath of devPaths) {
    try {
      await access(devPath, constants.F_OK)
      const version = await getAmpVersion(`node ${devPath}`)
      const inst: AmpInstallation = {
        type: 'dev',
        path: devPath,
        working: true
      }
      if (version) inst.version = version
      installations.push(inst)
      break // Only add the first working dev installation
    } catch {
      // Path doesn't exist or isn't accessible, continue
    }
  }
  
  return installations
}

/**
 * Find Amp in system PATH
 */
async function findAmpInPath(): Promise<string | null> {
  const isWindows = platform() === 'win32'
  const command = isWindows ? 'where' : 'which'
  
  return new Promise((resolve) => {
    const proc: ChildProcessWithoutNullStreams = spawn(command, ['amp'], { stdio: 'pipe' })
    let output = ''
    
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })
    
    proc.on('close', (code: number) => {
      if (code === 0) {
        const path = output.trim().split('\n')[0]
        resolve(path || null)
      } else {
        resolve(null)
      }
    })
    
    proc.on('error', () => {
      resolve(null)
    })
  })
}

/**
 * Get version of an Amp installation
 */
async function getAmpVersion(ampPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let command: string
    let cmdArgs: string[]

    if (ampPath.startsWith('node ')) {
      const parts = ampPath.split(' ').slice(1)
      command = 'node'
      cmdArgs = [...parts, '--version']
    } else {
      command = ampPath
      cmdArgs = ['--version']
    }
    
    const proc: ChildProcessWithoutNullStreams = spawn(command, cmdArgs, { stdio: 'pipe' })
    let output = ''
    
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })
    
    proc.on('close', (code: number) => {
      if (code === 0) {
        resolve(output.trim())
      } else {
        resolve(undefined)
      }
    })
    
    proc.on('error', () => {
      resolve(undefined)
    })
  })
}

/**
 * Spawn an Amp CLI process
 */
export function spawnAmpProcess(
  installation: AmpInstallation,
  options: AmpProcessOptions = {}
): ChildProcess {
  const { args = [], cwd, env } = options
  
  // Determine command and arguments
  let command: string
  let cmdArgs: string[]
  
  if (installation.type === 'dev') {
    // For dev installation, use node to run the main.js file
    command = 'node'
    cmdArgs = [installation.path, ...args]
  } else {
    // For production installation, use the amp binary directly
    command = installation.path
    cmdArgs = args
  }
  
  // Set up environment variables
  const processEnv = {
    ...process.env,
    ...env
  }
  
  // For dev mode, point to dev server
  if (installation.type === 'dev') {
    processEnv.AMP_URL = 'https://localhost:7002'
  }
  
  // Enable TUI by default (no execute mode)
  const finalArgs = [...cmdArgs]
  
  console.log(`Spawning Amp process: ${command} ${finalArgs.join(' ')}`)
  
  return spawn(command, finalArgs, {
    cwd,
    env: processEnv,
    stdio: ['pipe', 'pipe', 'pipe'] // We'll handle stdin/stdout/stderr
  })
}

/**
 * Check if user is logged in to Amp
 */
export async function checkAmpLoginStatus(installation: AmpInstallation): Promise<boolean> {
  return new Promise((resolve) => {
    // Try to run a simple command that requires authentication
    const proc = spawnAmpProcess(installation, { 
      args: ['threads', 'list', '--limit', '1'] 
    })
    
    let output = ''
    let errorOutput = ''
    
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    
    proc.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString()
    })
    
    proc.on('close', (code: number | null) => {
      // If command succeeds, user is logged in
      // If it fails with authentication error, user is not logged in
      const isLoggedIn = code === 0 && !errorOutput.includes('not logged in') && !errorOutput.includes('authentication')
      resolve(isLoggedIn)
    })
    
    proc.on('error', () => {
      resolve(false)
    })
  })
}
