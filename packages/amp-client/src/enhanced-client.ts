import { spawn, ChildProcess } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { EventEmitter } from "events";
import { 
  ensureAmpAuth, 
  type AmpAuthConfig,
  resolveConnection,
  getConnectionEnvironment,
  sanitizeEnvironment,
  type ResolvedConnection,
  type AmpRuntimeConfig,
  getConnectionDescription,
  isProd,
  isLocalServer,
  isLocalCli,
  ampArgsFromEnv
} from '@ampsm/amp-backend-core';

export interface EnhancedAmpAdapterConfig {
  // Runtime configuration for connection resolution
  runtimeConfig?: AmpRuntimeConfig;
  
  // Legacy support
  ampPath?: string;
  ampArgs?: string[];
  enableJSONLogs?: boolean;
  env?: Record<string, string>;
  extraArgs?: string[];
  ampSettings?: { mode?: string };
  
  // SDLC Agent configuration
  agentId?: string;
  autoRoute?: boolean;
  alloyMode?: boolean;
  multiProvider?: boolean;
  
  // Model override capability
  modelOverride?: string;
}

export interface StreamingEvent {
  type: string;
  data: any;
  timestamp: number;
}

export interface ConnectionInfo extends StreamingEvent {
  type: 'connection-info';
  data: {
    connection: ResolvedConnection;
    description: string;
    authenticated: boolean;
    version?: string;
  };
}

export interface AmpIterationResult {
  success: boolean;
  threadId?: string;
  error?: string;
  events: StreamingEvent[];
}

/**
 * Enhanced Amp client with sophisticated connection resolution and authentication
 */
export class EnhancedAmpClient extends EventEmitter {
  private config: EnhancedAmpAdapterConfig;
  private connection: ResolvedConnection | null = null;
  private authenticated: boolean = false;
  private version: string | null = null;

  constructor(config: EnhancedAmpAdapterConfig = {}) {
    super();
    this.config = config;
  }

  /**
   * Initialize the client by resolving connection and authenticating
   */
  async initialize(): Promise<void> {
    // Resolve the connection using the hierarchical resolver
    this.connection = resolveConnection({
      overrides: this.config.runtimeConfig,
      env: this.config.env || process.env
    });

    // Emit connection info immediately
    this.emit('streaming-event', {
      type: 'connection-info',
      data: {
        connection: this.connection,
        description: getConnectionDescription(this.connection),
        authenticated: false
      },
      timestamp: Date.now()
    } as ConnectionInfo);

    // For CLI modes, perform authentication
    if (this.connection.mode !== "server") {
      try {
        const authResult = await ensureAmpAuth();
        this.authenticated = authResult.success;
        
        if (authResult.success) {
          // Extract version from auth message
          const versionMatch = authResult.message.match(/version:\s*(.+)$/);
          this.version = versionMatch ? versionMatch[1] : null;
        }

        this.emit('streaming-event', {
          type: 'connection-info',
          data: {
            connection: this.connection,
            description: getConnectionDescription(this.connection),
            authenticated: this.authenticated,
            version: this.version || undefined
          },
          timestamp: Date.now()
        } as ConnectionInfo);

        if (!authResult.success) {
          throw new Error(authResult.message);
        }
      } catch (error) {
        this.emit('streaming-event', {
          type: 'auth-error',
          data: {
            error: error instanceof Error ? error.message : String(error),
            connection: this.connection
          },
          timestamp: Date.now()
        });
        throw error;
      }
    } else {
      // For server mode, skip authentication
      this.authenticated = true;
      this.emit('streaming-event', {
        type: 'connection-info',
        data: {
          connection: this.connection,
          description: getConnectionDescription(this.connection),
          authenticated: true
        },
        timestamp: Date.now()
      } as ConnectionInfo);
    }
  }

  /**
   * Start a new Amp iteration/thread
   */
  async runIteration(
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    if (!this.connection) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = this.connection.mode === "server" 
      ? await this.runServerIteration(prompt, workingDirectory, modelOverride)
      : await this.runCliIteration(prompt, workingDirectory, modelOverride);

    // Update authentication state if iteration failed with explicit auth errors
    if (!result.success && this.authenticated) {
      const msg = (result.error || '').toLowerCase();
      const isAuthError =
        msg.includes('unauthorized') ||
        msg.includes('invalid token') ||
        msg.includes('invalid api key') ||
        msg.includes('forbidden') ||
        msg.includes('401');
      if (isAuthError) {
        this.authenticated = false;
        this.emit('streaming-event', {
          type: 'connection-info',
          data: {
            connection: this.connection,
            description: getConnectionDescription(this.connection),
            authenticated: this.authenticated,
            version: this.version || undefined
          },
          timestamp: Date.now()
        } as ConnectionInfo);
      }
    }

    return result;
  }

  /**
   * Continue an existing thread
   */
  async continueThread(
    threadId: string,
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    if (!this.connection) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = this.connection.mode === "server" 
      ? await this.continueServerThread(threadId, prompt, workingDirectory, modelOverride)
      : await this.continueCliThread(threadId, prompt, workingDirectory, modelOverride);

    // Update authentication state if iteration failed with explicit auth errors
    if (!result.success && this.authenticated) {
      const msg = (result.error || '').toLowerCase();
      const isAuthError =
        msg.includes('unauthorized') ||
        msg.includes('invalid token') ||
        msg.includes('invalid api key') ||
        msg.includes('forbidden') ||
        msg.includes('401');
      if (isAuthError) {
        this.authenticated = false;
        this.emit('streaming-event', {
          type: 'connection-info',
          data: {
            connection: this.connection,
            description: getConnectionDescription(this.connection),
            authenticated: this.authenticated,
            version: this.version || undefined
          },
          timestamp: Date.now()
        } as ConnectionInfo);
      }
    }

    return result;
  }

  /**
   * Run iteration using server mode (HTTP API)
   */
  private async runServerIteration(
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    // TODO: Implement HTTP API client when server SDK is ready
    // For now, fall back to CLI mode but preserve connection context
    console.warn('Server mode not fully implemented yet, falling back to CLI');
    
    // For server mode fallback, we need to resolve the CLI path properly
    // Force CLI resolution by removing server URL environment variables
    const cliOnlyEnv = { ...this.config.env || process.env };
    delete cliOnlyEnv.AMP_URL;
    
    const cliConnection = resolveConnection({
      overrides: this.config.runtimeConfig,
      env: cliOnlyEnv
    });
    
    // Ensure we have a CLI connection, fallback to "amp" if needed
    const finalConnection: ResolvedConnection = cliConnection.mode === "server" 
      ? { mode: "production", cliPath: "amp" }
      : cliConnection;
      
    return this.runCliIterationWithConnection(finalConnection, prompt, workingDirectory, modelOverride);
  }

  /**
   * Continue thread using server mode (HTTP API)
   */
  private async continueServerThread(
    threadId: string,
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    // TODO: Implement HTTP API client when server SDK is ready
    console.warn('Server mode not fully implemented yet, falling back to CLI');
    
    // For server mode fallback, we need to resolve the CLI path properly
    // Force CLI resolution by removing server URL environment variables
    const cliOnlyEnv = { ...this.config.env || process.env };
    delete cliOnlyEnv.AMP_URL;
    
    const cliConnection = resolveConnection({
      overrides: this.config.runtimeConfig,
      env: cliOnlyEnv
    });
    
    // Ensure we have a CLI connection, fallback to "amp" if needed
    const finalConnection: ResolvedConnection = cliConnection.mode === "server" 
      ? { mode: "production", cliPath: "amp" }
      : cliConnection;
      
    return this.continueCliThreadWithConnection(finalConnection, threadId, prompt, workingDirectory, modelOverride);
  }

  /**
   * Run iteration using CLI mode
   */
  private async runCliIteration(
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    return this.runCliIterationWithConnection(this.connection!, prompt, workingDirectory, modelOverride);
  }

  /**
   * Continue thread using CLI mode
   */
  private async continueCliThread(
    threadId: string,
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    return this.continueCliThreadWithConnection(this.connection!, threadId, prompt, workingDirectory, modelOverride);
  }

  /**
   * Run CLI iteration with specific connection
   */
  private async runCliIterationWithConnection(
    connection: ResolvedConnection,
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    const cwd = workingDirectory || process.cwd();
    
    // Set up CLI command and arguments
    let cliCommand: string;
    let args: string[];
    
    if (connection.mode === "local-cli") {
      // Use node to run the local CLI script with stdin (-x) and JSON streaming
      cliCommand = "node";
      args = [connection.cliPath, '-x', '--stream-json'];
    } else {
      // Use system amp with stdin (-x) and JSON streaming
      cliCommand = "amp";
      args = ['-x', '--stream-json'];
    }
    
    // TODO: Add model override when CLI supports it
    // const model = modelOverride || this.config.modelOverride;

    // Add environment args
    args.push(...ampArgsFromEnv());

    // Add SDLC agent configuration
    if (this.config.agentId) {
      args.push('--agent', this.config.agentId);
    }
    // TODO: Add these flags when CLI supports them
    // if (this.config.auto_route) {
    //   args.push('--auto-route');
    // }

    // Get environment
    const connectionEnv = getConnectionEnvironment(connection, this.config.ampSettings);
    const processEnv = sanitizeEnvironment(
      { ...process.env, ...this.config.env, ...connectionEnv },
      connection
    );

    // Debug logging to see what's actually being executed
    console.log('[DEBUG] Executing CLI command:', cliCommand, args);
    console.log('[DEBUG] All AMP environment keys:', Object.keys(processEnv).filter(k => k.startsWith('AMP_')));
    console.log('[DEBUG] Other relevant env keys:', Object.keys(processEnv).filter(k => 
      k.includes('URL') || k.includes('TOKEN') || k.includes('KEY') || k.includes('PROXY')
    ));
    console.log('[DEBUG] Working directory:', cwd);

    // Execute and write prompt to stdin with retries on transient network errors
    const execOnce = () => this.executeCliCommand(cliCommand, args, cwd, processEnv, prompt + '\n');
    return this.attemptWithRetry(execOnce);
  }

  /**
   * Continue CLI thread with specific connection
   */
  private async continueCliThreadWithConnection(
    connection: ResolvedConnection,
    threadId: string,
    prompt: string,
    workingDirectory?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    const cwd = workingDirectory || process.cwd();
    
    // Set up CLI command and arguments
    let cliCommand: string;
    let args: string[];
    
    if (connection.mode === "local-cli") {
      // Use node to run the local CLI script with both --execute and --stream-json
      cliCommand = "node";
      args = [connection.cliPath, '--execute', prompt, 'threads', 'continue', threadId, '--stream-json'];
    } else {
      // Use system amp command with both --execute and --stream-json
      cliCommand = "amp";
      args = ['--execute', prompt, 'threads', 'continue', threadId, '--stream-json'];
    }
    
    // TODO: Add model override when CLI supports it
    // const model = modelOverride || this.config.modelOverride;

    // Add environment args
    args.push(...ampArgsFromEnv());

    // Get environment
    const connectionEnv = getConnectionEnvironment(connection, this.config.ampSettings);
    const processEnv = sanitizeEnvironment(
      { ...process.env, ...this.config.env, ...connectionEnv },
      connection
    );

    const execOnce = () => this.executeCliCommand(cliCommand, args, cwd, processEnv);
    return this.attemptWithRetry(execOnce);
  }

  /**
   * Attempt an operation with limited retries on transient network/auth errors
   */
  private async attemptWithRetry(execOnce: () => Promise<AmpIterationResult>): Promise<AmpIterationResult> {
    const maxAttempts = 3;
    const backoffs = [500, 1500];
    let last: AmpIterationResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      last = await execOnce();
      if (last.success) return last;

      const msg = (last.error || '').toLowerCase();
      const isAuthError = msg.includes('unauthorized') || msg.includes('invalid token') || msg.includes('invalid api key') || msg.includes('forbidden') || msg.includes('401');
      const isTransient = msg.includes('timeout') || msg.includes('timed out') || msg.includes('network') || msg.includes('econnreset') || msg.includes('ecconnrefused') || msg.includes('socket hang up');

      if (isAuthError) {
        try {
          const authResult = await ensureAmpAuth();
          this.authenticated = authResult.success;
          this.version = authResult.success ? (authResult.message.match(/version:\s*(.+)$/)?.[1] || this.version) : this.version;
          this.emit('streaming-event', {
            type: 'connection-info',
            data: {
              connection: this.connection!,
              description: getConnectionDescription(this.connection!),
              authenticated: this.authenticated,
              version: this.version || undefined
            },
            timestamp: Date.now()
          } as ConnectionInfo);
          if (!authResult.success) break;
        } catch {
          break;
        }
      } else if (isTransient && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoffs[Math.min(attempt - 1, backoffs.length - 1)]));
        continue;
      } else {
        break;
      }
    }

    return last as AmpIterationResult;
  }

  /**
   * Execute CLI command and handle streaming
   */
  private async executeCliCommand(
    cliPath: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    stdinInput?: string
  ): Promise<AmpIterationResult> {
    return new Promise((resolve) => {
      const events: StreamingEvent[] = [];
      let threadId: string | undefined;
      let success = false;
      let error: string | undefined;

      const child = spawn(cliPath, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Provide stdin if requested (for -x mode)
      if (stdinInput && child.stdin) {
        try {
          child.stdin.write(stdinInput);
          child.stdin.end();
        } catch {}
      }

      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Handle stdout (JSONL streaming)
      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        
        // Process complete JSONL lines
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // Keep incomplete line
        
        for (let line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Handle CLI-prefixed streaming lines ("STREAMING_EVENT:")
          if (trimmed.startsWith('STREAMING_EVENT:')) {
            line = trimmed.slice('STREAMING_EVENT:'.length);
          }

          try {
            const parsed = JSON.parse(line);

            // Some CLI outputs wrap the event as { session_id, event: {...} }
            const innerEvent = (parsed && parsed.event) ? parsed.event : parsed;

            const streamingEvent: StreamingEvent = {
              type: innerEvent.type || 'message',
              data: innerEvent,
              timestamp: Date.now()
            };

            events.push(streamingEvent);
            this.emit('streaming-event', streamingEvent);

            // Extract thread ID from session result
            if (
              (innerEvent.type === 'session_result' || innerEvent.type === 'result') &&
              (innerEvent.thread_id || (innerEvent.data && (innerEvent.data.thread_id || innerEvent.data.session_id)))
            ) {
              threadId = innerEvent.thread_id || innerEvent.data?.thread_id || innerEvent.data?.session_id;
            }
          } catch {
            // Not JSON, emit as raw message
            const streamingEvent: StreamingEvent = {
              type: 'raw_output',
              data: { content: line },
              timestamp: Date.now()
            };
            events.push(streamingEvent);
            this.emit('streaming-event', streamingEvent);
          }
        }
      });

      // Handle stderr
      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderrBuffer += chunk;
        
        // Strip ANSI escape sequences for cleaner UI output
        const cleaned = chunk.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
        
        const streamingEvent: StreamingEvent = {
          type: 'error_output',
          data: { content: cleaned },
          timestamp: Date.now()
        };
        events.push(streamingEvent);
        this.emit('streaming-event', streamingEvent);
      });

      // Handle process completion
      child.on('close', (exitCode) => {
        success = exitCode === 0;
        
        if (!success) {
          error = stderrBuffer || `Process exited with code ${exitCode}`;
        }

        resolve({
          success,
          threadId,
          error,
          events
        });
      });

      // Handle process errors
      child.on('error', (processError) => {
        error = `Failed to start process: ${processError.message}`;
        resolve({
          success: false,
          error,
          events
        });
      });
    });
  }

  /**
   * Get current connection info
   */
  getConnectionInfo(): { connection: ResolvedConnection | null; authenticated: boolean; version: string | null } {
    return {
      connection: this.connection,
      authenticated: this.authenticated,
      version: this.version
    };
  }

  /**
   * Check if client is ready to use
   */
  isReady(): boolean {
    return this.connection !== null && this.authenticated;
  }
}
