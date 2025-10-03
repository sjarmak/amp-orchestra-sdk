import { spawn } from 'child_process';

export interface AmpAuthConfig {
  ampBin?: string;
  ampArgs?: string;
  ampAuthCmd?: string;
  ampToken?: string;
  enableJsonL?: boolean;
  debug?: boolean;
}

export interface AmpVersionInfo {
  version: string;
  success: boolean;
  error?: string;
}

/**
 * Runs a shell command and returns the result
 */
async function runCommand(
  command: string, 
  options: { cwd?: string; env?: Record<string, string>; debug?: boolean } = {}
): Promise<{ success: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    if (options.debug) {
      console.log(`[AMP_DEBUG] Running command: ${command}`);
      console.log(`[AMP_DEBUG] Working directory: ${options.cwd || process.cwd()}`);
      console.log(`[AMP_DEBUG] Environment variables:`, Object.keys(options.env || {}));
    }
    
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (options.debug) {
        console.log(`[AMP_DEBUG] stdout:`, chunk.trim());
      }
    });
    
    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (options.debug) {
        console.log(`[AMP_DEBUG] stderr:`, chunk.trim());
      }
    });

    child.on('close', (exitCode) => {
      const output = stdout + stderr;
      if (options.debug) {
        console.log(`[AMP_DEBUG] Command completed with exit code: ${exitCode}`);
        console.log(`[AMP_DEBUG] Total output length: ${output.length} characters`);
      }
      resolve({
        success: exitCode === 0,
        output,
        exitCode: exitCode || 0
      });
    });

    child.on('error', (error) => {
      if (options.debug) {
        console.log(`[AMP_DEBUG] Command error:`, error);
      }
      resolve({
        success: false,
        output: `Command failed: ${error.message}`,
        exitCode: -1
      });
    });
  });
}

/**
 * Redacts secrets from environment variables and command outputs
 */
function redactSecrets(text: string, env?: Record<string, string>): string {
  let redacted = text;
  
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (/TOKEN|KEY|SECRET/i.test(key) && value) {
        redacted = redacted.split(value).join('[REDACTED]');
      }
    });
  }
  
  return redacted;
}

/**
 * Loads Amp configuration from environment variables
 */
export function loadAmpAuthConfig(): AmpAuthConfig {
  return {
    ampBin: process.env.AMP_BIN || 'amp',
    ampArgs: process.env.AMP_ARGS,
    ampAuthCmd: process.env.AMP_AUTH_CMD,
    ampToken: process.env.AMP_TOKEN,
    enableJsonL: process.env.AMP_ENABLE_JSONL === 'true',
    debug: process.env.AMP_DEBUG === 'true'
  };
}

/**
 * Checks if authentication environment is available
 */
export function hasAuthEnvironment(): boolean {
  const config = loadAmpAuthConfig();
  return !!(config.ampBin && (config.ampAuthCmd || config.ampToken));
}

/**
 * Authenticates with Amp CLI using environment configuration
 */
export async function ensureAmpAuth(): Promise<{ success: boolean; message: string }> {
  const config = loadAmpAuthConfig();
  
  if (config.debug) {
    console.log('[AMP_DEBUG] Starting authentication process');
    console.log('[AMP_DEBUG] Configuration:', {
      ampBin: config.ampBin,
      hasAmpArgs: !!config.ampArgs,
      hasAmpAuthCmd: !!config.ampAuthCmd,
      hasAmpToken: !!config.ampToken,
      enableJsonL: config.enableJsonL
    });
  }

  if (!config.ampBin) {
    if (config.debug) console.log('[AMP_DEBUG] Error: AMP_BIN not configured');
    return { success: false, message: 'AMP_BIN not configured' };
  }

  if (!config.ampAuthCmd && !config.ampToken) {
    if (config.debug) console.log('[AMP_DEBUG] Error: Neither AMP_AUTH_CMD nor AMP_TOKEN configured');
    return { success: false, message: 'Neither AMP_AUTH_CMD nor AMP_TOKEN configured' };
  }

  // Run authentication command if provided
  if (config.ampAuthCmd) {
    if (config.debug) console.log('[AMP_DEBUG] Running auth command:', config.ampAuthCmd);
    const authEnv: Record<string, string> = config.ampToken ? { AMP_TOKEN: config.ampToken } : {};
    const result = await runCommand(config.ampAuthCmd, { env: authEnv, debug: config.debug });
    
    if (!result.success) {
      const errorMsg = `Authentication failed: ${redactSecrets(result.output, authEnv)}`;
      if (config.debug) console.log('[AMP_DEBUG] Auth command failed:', errorMsg);
      return { 
        success: false, 
        message: errorMsg
      };
    }
    if (config.debug) console.log('[AMP_DEBUG] Auth command succeeded');
  }

  // Verify amp is working by getting version
  if (config.debug) console.log('[AMP_DEBUG] Checking Amp version');
  const versionInfo = await getAmpVersion(config);
  if (!versionInfo.success) {
    const errorMsg = `Amp version check failed: ${versionInfo.error}`;
    if (config.debug) console.log('[AMP_DEBUG] Version check failed:', errorMsg);
    return {
      success: false,
      message: errorMsg
    };
  }

  const successMsg = `Authenticated successfully. Amp version: ${versionInfo.version}`;
  if (config.debug) console.log('[AMP_DEBUG] Authentication complete:', successMsg);
  return {
    success: true,
    message: successMsg
  };
}

/**
 * Gets Amp version information
 */
export async function getAmpVersion(config?: AmpAuthConfig): Promise<AmpVersionInfo> {
  const authConfig = config || loadAmpAuthConfig();
  const command = `${authConfig.ampBin} --version`;
  
  if (authConfig.debug) {
    console.log('[AMP_DEBUG] Getting version with command:', command);
  }
  
  const result = await runCommand(command, { debug: authConfig.debug });

  if (!result.success) {
    if (authConfig.debug) {
      console.log('[AMP_DEBUG] Version command failed:', result.output);
    }
    return {
      success: false,
      version: '',
      error: result.output
    };
  }

  // Extract version from output (format may vary)
  const versionMatch = result.output.match(/amp\s+v?(\d+\.\d+\.\d+[^\s]*)/i) ||
                      result.output.match(/version\s+v?(\d+\.\d+\.\d+[^\s]*)/i) ||
                      result.output.match(/(\d+\.\d+\.\d+[^\s]*)/);

  const version = versionMatch ? versionMatch[1] : result.output.trim();
  
  if (authConfig.debug) {
    console.log('[AMP_DEBUG] Extracted version:', version);
  }

  return {
    success: true,
    version
  };
}

/**
 * Builds amp CLI arguments from environment configuration
 */
export function ampArgsFromEnv(): string[] {
  const config = loadAmpAuthConfig();
  const args: string[] = [];

  // Add extra args from AMP_ARGS
  if (config.ampArgs) {
    args.push(...config.ampArgs.split(/\s+/).filter(Boolean));
  }

  // Add JSON logs if enabled
  if (config.enableJsonL) {
    args.push('--json-logs');
  }

  return args;
}
