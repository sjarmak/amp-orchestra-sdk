import { PersistedConfigFile } from './config.js';
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

export interface AmpRuntimeConfig {
  ampCliPath?: string;
  ampServerUrl?: string;
}

export interface YamlConfig {
  defaults?: {
    amp_server_url?: string;
    amp_cli_path?: string;
  };
  // Add more YAML structure as needed
}

export type ResolvedConnection =
  | { mode: "server"; serverUrl: string }
  | { mode: "local-cli"; cliPath: string }
  | { mode: "production"; cliPath: "amp" };

export interface ConnectionResolverOptions {
  overrides?: Partial<AmpRuntimeConfig>;
  persisted?: PersistedConfigFile;
  yamlConfig?: YamlConfig;
  env?: NodeJS.ProcessEnv;
  globalFlags?: {
    ampServer?: string;
    ampPath?: string;
  };
}

/**
 * Resolves which Amp backend to use based on hierarchical precedence rules
 * 
 * Server URL Resolution (Highest Priority):
 * 1. Runtime overrides (from UI)
 * 2. YAML case-level amp_server_url  
 * 3. YAML suite-level amp_server_url
 * 4. YAML defaults amp_server_url
 * 5. Global --amp-server flag
 * 6. Environment AMP_URL
 * 7. Persisted config localServerUrl
 * 
 * CLI Path Resolution (If No Server URL Found):
 * 1. Runtime overrides ampCliPath
 * 2. YAML case-level amp_cli_path
 * 3. YAML suite-level amp_cli_path  
 * 4. YAML defaults amp_cli_path
 * 5. Global --amp-path flag
 * 6. AMP_CLI_PATH environment variable
 * 7. Legacy AMP_BIN environment variable
 * 8. Persisted config customCliPath
 * 9. Default "amp" (system PATH)
 */
export function resolveConnection(options: ConnectionResolverOptions = {}): ResolvedConnection {
  const {
    overrides = {},
    persisted = {},
    yamlConfig = {},
    env = process.env,
    globalFlags = {}
  } = options;

  // Step 1: Try to resolve server URL (highest priority)
  const serverUrl = resolveServerUrl({
    overrides,
    yamlConfig,
    globalFlags,
    env,
    persisted
  });

  if (serverUrl) {
    return { mode: "server", serverUrl };
  }

  // Step 2: Resolve CLI path (if no server URL found)
  const cliPath = resolveCliPath({
    overrides,
    yamlConfig,
    globalFlags,
    env,
    persisted
  });

  // Determine mode based on CLI path
  if (cliPath === "amp") {
    return { mode: "production", cliPath: "amp" };
  } else {
    return { mode: "local-cli", cliPath };
  }
}

/**
 * Resolves server URL following the hierarchical precedence
 */
function resolveServerUrl({
  overrides,
  yamlConfig,
  globalFlags,
  env,
  persisted
}: {
  overrides: Partial<AmpRuntimeConfig>;
  yamlConfig: YamlConfig;
  globalFlags: { ampServer?: string };
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfigFile;
}): string | null {
  // 1. Runtime overrides (from UI)
  if (overrides.ampServerUrl) {
    return overrides.ampServerUrl;
  }

  // 2-4. YAML configuration (case-level, suite-level, defaults)
  // TODO: Implement YAML case/suite level resolution when YAML parsing is added
  if (yamlConfig.defaults?.amp_server_url) {
    return yamlConfig.defaults.amp_server_url;
  }

  // 5. Global --amp-server flag
  if (globalFlags.ampServer) {
    return globalFlags.ampServer;
  }

  // 6. Environment AMP_URL
  if (env.AMP_URL) {
    return env.AMP_URL;
  }

  // 7. Persisted config localServerUrl
  if (persisted.localServerUrl) {
    return persisted.localServerUrl;
  }

  return null;
}

/**
 * Resolves CLI path following the hierarchical precedence
 */
function resolveCliPath({
  overrides,
  yamlConfig,
  globalFlags,
  env,
  persisted
}: {
  overrides: Partial<AmpRuntimeConfig>;
  yamlConfig: YamlConfig;
  globalFlags: { ampPath?: string };
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfigFile;
}): string {
  // 1. Runtime overrides ampCliPath
  if (overrides.ampCliPath) {
    // Special case: explicit "production" always returns "amp"
    if (overrides.ampCliPath === "production") {
      return "amp";
    }
    return expandHomePath(overrides.ampCliPath);
  }

  // 2-4. YAML configuration (case-level, suite-level, defaults)
  // TODO: Implement YAML case/suite level resolution when YAML parsing is added
  if (yamlConfig.defaults?.amp_cli_path) {
    return expandHomePath(yamlConfig.defaults.amp_cli_path);
  }

  // 5. Global --amp-path flag
  if (globalFlags.ampPath) {
    return expandHomePath(globalFlags.ampPath);
  }

  // 6. AMP_CLI_PATH environment variable
  if (env.AMP_CLI_PATH) {
    return expandHomePath(env.AMP_CLI_PATH);
  }

  // 7. Legacy AMP_BIN environment variable
  if (env.AMP_BIN) {
    return expandHomePath(env.AMP_BIN);
  }

  // 8. Persisted config customCliPath
  if (persisted.customCliPath) {
    return expandHomePath(persisted.customCliPath);
  }

  // 9. Default local CLI path (user-agnostic)
  const defaultLocalPath = join(homedir(), 'amp', 'cli', 'dist', 'main.js');
  try {
    const fs = require("fs");
    if (fs.existsSync(defaultLocalPath)) {
      return defaultLocalPath;
    }
  } catch {
    // Fall through to system amp
  }

  // 10. Default "amp" (system PATH)
  return "amp";
}

/**
 * Gets the appropriate environment variables for the resolved connection
 */
export function getConnectionEnvironment(
  connection: ResolvedConnection,
  ampSettings?: { mode?: string }
): Record<string, string> {
  const env: Record<string, string> = {};

  if (connection.mode === "server") {
    // Server mode: set AMP_URL and disable TLS verification for localhost
    env.AMP_URL = connection.serverUrl;
    if (connection.serverUrl.includes("localhost")) {
      env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  } else if (connection.mode === "local-cli") {
    // Local CLI mode: run completely locally, don't set AMP_URL
    // This ensures the CLI uses local execution instead of trying to connect to a server
  }
  // Production mode: no environment overrides needed

  return env;
}

/**
 * Validates if a CLI path exists and is executable
 */
export function validateAmpPath(path: string): boolean {
  if (path === "amp") {
    // Can't easily validate system PATH binaries, assume valid
    return true;
  }

  try {
    const fs = require("fs");
    return (
      fs.existsSync(path) &&
      fs.constants &&
      (fs.accessSync(path, fs.constants.F_OK | fs.constants.X_OK), true)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes environment variables for Amp production mode
 */
export function sanitizeEnvironment(
  env: Record<string, string | undefined>,
  connection: ResolvedConnection
): Record<string, string> {
  // Filter out undefined values and convert to proper string record
  const cleanEnv: Record<string, string> = {};
  Object.entries(env).forEach(([key, value]) => {
    if (value !== undefined) {
      cleanEnv[key] = value;
    }
  });

  // Sanity check: remove AMP_URL in production mode if present (even if empty)
  if (connection.mode === "production" && Object.prototype.hasOwnProperty.call(cleanEnv, 'AMP_URL')) {
    console.warn(
      "🚨 AMP_URL present in production mode; removing to force system defaults."
    );
    const sanitized = { ...cleanEnv };
    delete sanitized.AMP_URL;
    delete sanitized.NODE_TLS_REJECT_UNAUTHORIZED;
    return sanitized;
  }

  // For local-cli mode, preserve required environment variables for development
  if (connection.mode === "local-cli") {
    // Only remove server URLs if they conflict with local CLI execution
    // Keep development server URLs and required variables
    const sanitized = { ...cleanEnv };
    
    // Don't strip AMP_URL if it points to localhost (development server)
    if (cleanEnv.AMP_URL && !cleanEnv.AMP_URL.includes("localhost")) {
      console.log("[DEBUG] Removing non-localhost AMP_URL in local-cli mode:", cleanEnv.AMP_URL);
      delete sanitized.AMP_URL;
    }
    
    // Don't strip NODE_TLS_REJECT_UNAUTHORIZED for localhost connections
    if (cleanEnv.AMP_URL?.includes("localhost") && !cleanEnv.NODE_TLS_REJECT_UNAUTHORIZED) {
      sanitized.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    
    return sanitized;
  }

  return cleanEnv;
}

/**
 * Helper functions for checking connection modes
 */
export function isProd(connection: ResolvedConnection): boolean {
  return connection.mode === "production";
}

export function isLocalServer(connection: ResolvedConnection): boolean {
  return connection.mode === "server" && connection.serverUrl.includes("localhost");
}

export function isLocalCli(connection: ResolvedConnection): boolean {
  return connection.mode === "local-cli";
}

/**
 * Gets a human-readable description of the connection
 */
export function getConnectionDescription(connection: ResolvedConnection): string {
  switch (connection.mode) {
    case "production":
      return "Production (ampcode.com)";
    case "server":
      return connection.serverUrl.includes("localhost") 
        ? `Local Server (${connection.serverUrl})`
        : `Server (${connection.serverUrl})`;
    case "local-cli":
      return `Local CLI (${connection.cliPath})`;
  }
}

/**
 * Gets a color indicator for the connection type
 */
export function getConnectionColor(connection: ResolvedConnection): string {
  switch (connection.mode) {
    case "production":
      return "green";
    case "server":
      return connection.serverUrl.includes("localhost") ? "yellow" : "blue";
    case "local-cli":
      return "purple";
  }
}
