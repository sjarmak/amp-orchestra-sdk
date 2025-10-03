import { EventEmitter } from 'events';
import {
  loadConfig,
  saveConfig,
  updateConfig,
  getConfigValue,
  setConfigValue,
  redactConfigSecrets,
  type PersistedConfigFile
} from '@ampsm/amp-backend-core';

export interface ConfigChangeEvent {
  type: 'config-changed';
  key?: string;
  value?: any;
  config: PersistedConfigFile;
}

/**
 * Configuration service with persistence and change notifications
 */
export class ConfigService extends EventEmitter {
  private config: PersistedConfigFile = {};
  private saveQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    this.config = await loadConfig();
  }

  /**
   * Get the current configuration
   */
  get(): PersistedConfigFile {
    return { ...this.config };
  }

  /**
   * Get a redacted version of the configuration (safe for display)
   */
  getRedacted(): PersistedConfigFile {
    return redactConfigSecrets(this.config);
  }

  /**
   * Get a specific configuration value using dot notation
   */
  async getValue(key: string): Promise<any> {
    return getConfigValue(key);
  }

  /**
   * Set a specific configuration value using dot notation
   */
  async setValue(key: string, value: any): Promise<void> {
    // Queue the save operation to avoid race conditions
    this.saveQueue = this.saveQueue.then(async () => {
      await setConfigValue(key, value);
      this.config = await loadConfig(); // Reload to get updated config
      
      this.emit('config-changed', {
        type: 'config-changed',
        key,
        value,
        config: this.config
      } as ConfigChangeEvent);
    });
    
    await this.saveQueue;
  }

  /**
   * Update multiple configuration values
   */
  async update(updates: Partial<PersistedConfigFile>): Promise<void> {
    // Queue the save operation to avoid race conditions
    this.saveQueue = this.saveQueue.then(async () => {
      await updateConfig(updates);
      this.config = await loadConfig(); // Reload to get updated config
      
      this.emit('config-changed', {
        type: 'config-changed',
        config: this.config
      } as ConfigChangeEvent);
    });
    
    await this.saveQueue;
  }

  /**
   * Set the entire configuration
   */
  async set(config: PersistedConfigFile): Promise<void> {
    // Queue the save operation to avoid race conditions
    this.saveQueue = this.saveQueue.then(async () => {
      await saveConfig(config);
      this.config = { ...config };
      
      this.emit('config-changed', {
        type: 'config-changed',
        config: this.config
      } as ConfigChangeEvent);
    });
    
    await this.saveQueue;
  }

  /**
   * Get current environment settings
   */
  getEnvironmentSettings(): string {
    if (this.config.customCliPath && this.config.customCliPath !== 'amp') {
      if (this.config.localServerUrl) {
        return 'local-server';
      } else {
        return 'local-cli';
      }
    } else {
      return 'production';
    }
  }

  /**
   * Set environment mode and update related configuration
   */
  async setEnvironment(mode: 'production' | 'local-server' | 'local-cli', options?: {
    cliPath?: string;
    serverUrl?: string;
    token?: string;
  }): Promise<void> {
    const updates: Partial<PersistedConfigFile> = {};

    switch (mode) {
      case 'production':
        updates.customCliPath = 'amp';
        updates.localServerUrl = undefined;
        updates.defaultEnvironment = 'production';
        break;
        
      case 'local-server':
        updates.customCliPath = 'amp';
        updates.localServerUrl = options?.serverUrl || 'https://localhost:7002';
        updates.defaultEnvironment = 'local-server';
        break;
        
      case 'local-cli':
        updates.customCliPath = options?.cliPath || '/path/to/local/amp';
        updates.localServerUrl = 'https://localhost:7002'; // Local CLI usually uses local server
        updates.defaultEnvironment = 'local-cli';
        break;
    }

    // Update token if provided
    if (options?.token) {
      if (!updates.ampEnv) {
        updates.ampEnv = { ...this.config.ampEnv };
      }
      updates.ampEnv.AMP_TOKEN = options.token;
    }

    await this.update(updates);
  }

  /**
   * Get authentication configuration for the current environment
   */
  getAuthConfig(): {
    ampBin: string;
    ampToken?: string;
    ampAuthCmd?: string;
    ampUrl?: string;
  } {
    const env = this.config.ampEnv || {};
    
    return {
      ampBin: this.config.customCliPath || env.AMP_BIN || 'amp',
      ampToken: env.AMP_API_KEY || env.AMP_TOKEN, // Prefer AMP_API_KEY, fallback to AMP_TOKEN
      ampAuthCmd: env.AMP_AUTH_CMD,
      ampUrl: this.config.localServerUrl || env.AMP_URL
    };
  }

  /**
   * Validate configuration and return any issues
   */
  validate(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const environment = this.getEnvironmentSettings();
    
    if (environment === 'local-cli') {
      if (!this.config.customCliPath || this.config.customCliPath === 'amp') {
        issues.push('Local CLI mode requires a custom CLI path');
      }
    }
    
    if (environment !== 'local-server') {
      const ampEnv = this.config.ampEnv || {};
      if (!ampEnv.AMP_API_KEY && !ampEnv.AMP_TOKEN && !ampEnv.AMP_AUTH_CMD) {
        issues.push('Authentication requires either AMP_API_KEY or AMP_AUTH_CMD');
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Export configuration for sharing or backup
   */
  export(): string {
    return JSON.stringify(this.getRedacted(), null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  async import(configJson: string): Promise<void> {
    try {
      const config = JSON.parse(configJson);
      await this.set(config);
    } catch (error) {
      throw new Error(`Invalid configuration JSON: ${error instanceof Error ? error.message : error}`);
    }
  }
}
