import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Expands tilde (~) in file paths to the user's home directory
 */
function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

export interface PersistedConfigFile {
  defaultEnvironment?: string;
  customCliPath?: string;
  localServerUrl?: string;
  theme?: string;
  recentWorkspaces?: string[];
  modelPreferences?: {
    default?: string;
    coding?: string;
    analysis?: string;
  };
  batchSettings?: {
    maxConcurrency?: number;
    timeout?: number;
  };
  ampEnv?: {
    AMP_BIN?: string;
    AMP_ARGS?: string;
    AMP_ENABLE_JSONL?: boolean;
    AMP_AUTH_CMD?: string;
    AMP_API_KEY?: string;
    AMP_TOKEN?: string; // Backward compatibility
    AMP_URL?: string;
    AMP_CLI_PATH?: string;
    [key: string]: any;
  };
}

/**
 * Returns the appropriate user configuration directory for the current platform
 */
export function getUserConfigDir(): string {
  const platform = process.platform;
  
  switch (platform) {
    case 'darwin': // macOS
      return join(homedir(), 'Library', 'Application Support', 'ampsm');
    case 'win32': // Windows
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ampsm');
    default: // Linux and other Unix-like systems
      return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ampsm');
  }
}

/**
 * Returns the SQLite database path, checking for environment override
 */
export function getDbPath(): string {
  const envDbPath = process.env.AMPSM_DB_PATH || process.env.AMP_SESSION_ORCHESTRATOR_DB;
  if (envDbPath) {
    return envDbPath;
  }

  const configDir = getUserConfigDir();
  
  if (!existsSync(configDir)) {
    try {
      mkdirSync(configDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create config directory ${configDir}:`, error);
      return './sessions.sqlite';
    }
  }

  return join(configDir, 'sessions.sqlite');
}

/**
 * Returns the configuration file path
 */
export function getConfigPath(): string {
  const configDir = getUserConfigDir();
  return join(configDir, 'config.json');
}

/**
 * Loads configuration from the persistent config file
 */
export async function loadConfig(): Promise<PersistedConfigFile> {
  const configPath = getConfigPath();
  
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Saves configuration to the persistent config file
 */
export async function saveConfig(config: PersistedConfigFile): Promise<void> {
  const configPath = getConfigPath();
  const configDir = getUserConfigDir();
  
  try {
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }
    
    // Set file permissions to 0600 (owner read/write only) for security
    await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}

/**
 * Updates specific configuration keys
 */
export async function updateConfig(updates: Partial<PersistedConfigFile>): Promise<void> {
  const currentConfig = await loadConfig();
  const mergedConfig = { ...currentConfig, ...updates };
  
  // Deep merge for nested objects like ampEnv
  if (updates.ampEnv && currentConfig.ampEnv) {
    mergedConfig.ampEnv = { ...currentConfig.ampEnv, ...updates.ampEnv };
  }
  
  await saveConfig(mergedConfig);
}

/**
 * Redacts secrets from configuration display
 */
export function redactConfigSecrets(config: PersistedConfigFile): PersistedConfigFile {
  const redacted = JSON.parse(JSON.stringify(config)); // Deep clone
  
  if (redacted.ampEnv) {
    Object.keys(redacted.ampEnv).forEach(key => {
      if (/TOKEN|KEY|SECRET/i.test(key) && redacted.ampEnv![key]) {
        redacted.ampEnv![key] = '[REDACTED]';
      }
    });
  }
  
  return redacted;
}

/**
 * Gets a specific configuration value using dot notation
 */
export async function getConfigValue(key: string): Promise<any> {
  const config = await loadConfig();
  const keys = key.split('.');
  let value: any = config;
  
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) break;
  }
  
  return value;
}

/**
 * Sets a specific configuration value using dot notation
 */
export async function setConfigValue(key: string, value: any): Promise<void> {
  const config = await loadConfig();
  const keys = key.split('.');
  const lastKey = keys.pop()!;
  
  let current: any = config;
  for (const k of keys) {
    if (!current[k] || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k];
  }
  
  current[lastKey] = value;
  await saveConfig(config);
}
