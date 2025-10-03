import { EventEmitter } from 'events';
import { EnhancedAmpClient, type EnhancedAmpAdapterConfig, type StreamingEvent } from './enhanced-client.js';
import { ConfigService } from './config-service.js';
import { v4 as uuidv4 } from 'uuid';

export interface SessionConfig {
  workingDirectory?: string;
  modelOverride?: string;
  agentId?: string;
  autoRoute?: boolean;
  alloyMode?: boolean;
  multiProvider?: boolean;
}

export interface SendMessageOptions {
  sessionId: string;
  prompt: string;
  workingDirectory?: string;
  modelOverride?: string;
}

export interface SessionInfo {
  id: string;
  threadId?: string;
  workingDirectory: string;
  config: SessionConfig;
  client: EnhancedAmpClient;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface SessionManagerEvents {
  'session-created': { sessionId: string; info: SessionInfo };
  'session-destroyed': { sessionId: string };
  'session-message': { sessionId: string; event: StreamingEvent };
  'auth-status-changed': { authenticated: boolean; connection: any; version?: string };
}

/**
 * Manages multiple Amp sessions with event forwarding and lifecycle management
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private configService: ConfigService;
  private maxSessions: number;

  constructor(configService: ConfigService, maxSessions: number = 10) {
    super();
    this.configService = configService;
    this.maxSessions = maxSessions;

    // Listen for configuration changes that might require session restarts
    this.configService.on('config-changed', (event) => {
      // If environment settings changed, we need to restart all sessions
      if (this.isEnvironmentChange(event)) {
        this.restartAllSessions();
      }
    });
  }

  /**
   * Create a new session
   */
  async createSession(config: SessionConfig = {}): Promise<string> {
    // Enforce session limits
    if (this.sessions.size >= this.maxSessions) {
      // Remove oldest inactive session
      const oldestInactive = this.findOldestInactiveSession();
      if (oldestInactive) {
        await this.destroySession(oldestInactive.id);
      } else {
        throw new Error(`Maximum number of sessions (${this.maxSessions}) reached`);
      }
    }

    const sessionId = uuidv4();
    const workingDirectory = config.workingDirectory || process.cwd();

    // Get current configuration for the client
    const persistedConfig = this.configService.get();
    
    // Build client configuration
    const clientConfig: EnhancedAmpAdapterConfig = {
      runtimeConfig: {
        ampCliPath: persistedConfig.customCliPath,
        ampServerUrl: persistedConfig.localServerUrl
      },
      env: persistedConfig.ampEnv,
      agentId: config.agentId,
      autoRoute: config.autoRoute,
      alloyMode: config.alloyMode,
      multiProvider: config.multiProvider,
      modelOverride: config.modelOverride
    };

    // Create and initialize client
    const client = new EnhancedAmpClient(clientConfig);
    
    // Forward streaming events with session context
    client.on('streaming-event', (event: StreamingEvent) => {
      this.emit('session-message', { sessionId, event });
      
      // Update last activity
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
        session.isActive = true;
      }
      
      // Handle auth status changes
      if (event.type === 'connection-info') {
        this.emit('auth-status-changed', {
          authenticated: event.data.authenticated,
          connection: event.data.connection,
          version: event.data.version
        });
      }
    });

    // Create session info
    const sessionInfo: SessionInfo = {
      id: sessionId,
      workingDirectory,
      config,
      client,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: false
    };

    this.sessions.set(sessionId, sessionInfo);

    try {
      // Initialize client (resolve connection + authenticate)
      await client.initialize();
      sessionInfo.isActive = true;
      
      this.emit('session-created', { sessionId, info: sessionInfo });
      return sessionId;
    } catch (error) {
      // Clean up on failure
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Send a message to a session (either new thread or continue existing)
   */
  async sendMessage(options: SendMessageOptions): Promise<void> {
    const session = this.sessions.get(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    if (!session.client.isReady()) {
      throw new Error(`Session ${options.sessionId} is not ready`);
    }

    const workingDirectory = options.workingDirectory || session.workingDirectory;
    const modelOverride = options.modelOverride || session.config.modelOverride;

    try {
      let result;
      
      if (session.threadId) {
        // Continue existing thread
        result = await session.client.continueThread(
          session.threadId,
          options.prompt,
          workingDirectory,
          modelOverride
        );
      } else {
        // Start new thread
        result = await session.client.runIteration(
          options.prompt,
          workingDirectory,
          modelOverride
        );
        
        // Store thread ID for future messages
        if (result.threadId) {
          session.threadId = result.threadId;
        }
      }

      session.lastActivity = new Date();
      
      if (!result.success && result.error) {
        this.emit('session-message', {
          sessionId: options.sessionId,
          event: {
            type: 'error',
            data: { error: result.error },
            timestamp: Date.now()
          }
        });
      }
    } catch (error) {
      this.emit('session-message', {
        sessionId: options.sessionId,
        event: {
          type: 'error',
          data: { 
            error: error instanceof Error ? error.message : String(error)
          },
          timestamp: Date.now()
        }
      });
      throw error;
    }
  }

  /**
   * Destroy a session and clean up resources
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Clean up client resources
    session.client.removeAllListeners();
    session.isActive = false;

    this.sessions.delete(sessionId);
    this.emit('session-destroyed', { sessionId });
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Stop all sessions
   */
  async stopAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.destroySession(id)));
  }

  /**
   * Restart all sessions (useful when configuration changes)
   */
  private async restartAllSessions(): Promise<void> {
    const sessionsToRecreate = this.getAllSessions().map(session => ({
      config: session.config,
      workingDirectory: session.workingDirectory
    }));

    // Stop all current sessions
    await this.stopAllSessions();

    // Recreate sessions with new configuration
    for (const sessionData of sessionsToRecreate) {
      try {
        const config = { ...sessionData.config, workingDirectory: sessionData.workingDirectory };
        await this.createSession(config);
      } catch (error) {
        console.error('Failed to recreate session:', error);
      }
    }
  }

  /**
   * Find the oldest inactive session for cleanup
   */
  private findOldestInactiveSession(): SessionInfo | null {
    let oldest: SessionInfo | null = null;
    
    for (const session of this.sessions.values()) {
      if (!session.isActive && (!oldest || session.lastActivity < oldest.lastActivity)) {
        oldest = session;
      }
    }
    
    return oldest;
  }

  /**
   * Check if a configuration change affects connection/environment
   */
  private isEnvironmentChange(event: any): boolean {
    if (!event.key) return false;
    
    const environmentKeys = [
      'defaultEnvironment',
      'customCliPath', 
      'localServerUrl',
      'ampEnv.AMP_BIN',
      'ampEnv.AMP_TOKEN',
      'ampEnv.AMP_AUTH_CMD',
      'ampEnv.AMP_URL'
    ];
    
    return environmentKeys.some(key => event.key.startsWith(key));
  }

  /**
   * Get authentication status from any active session
   */
  getAuthStatus(): { authenticated: boolean; connection: any; version?: string } | null {
    for (const session of this.sessions.values()) {
      if (session.isActive) {
        const info = session.client.getConnectionInfo();
        return {
          authenticated: info.authenticated,
          connection: info.connection,
          version: info.version || undefined
        };
      }
    }
    return null;
  }

  /**
   * Clean up inactive sessions older than the specified time
   */
  async cleanupInactiveSessions(maxAgeMinutes: number = 30): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const sessionsToCleanup: string[] = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (!session.isActive && session.lastActivity < cutoffTime) {
        sessionsToCleanup.push(sessionId);
      }
    }
    
    for (const sessionId of sessionsToCleanup) {
      await this.destroySession(sessionId);
    }
  }
}
