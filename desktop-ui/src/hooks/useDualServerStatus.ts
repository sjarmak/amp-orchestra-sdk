import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ServerStatus {
  available: boolean;
  connection_description: string;
  version?: string;
  error?: string;
  last_checked: number;
}

export interface DualServerStatus {
  production: ServerStatus;
  development: ServerStatus;
}

interface AuthStatusResponse {
  success: boolean;
  message: string;
  version?: string;
  connection_mode: string;
  connection_description: string;
}

export const useDualServerStatus = () => {
  const [status, setStatus] = useState<DualServerStatus>({
    production: {
      available: false,
      connection_description: 'Checking...',
      last_checked: Date.now()
    },
    development: {
      available: false,
      connection_description: 'Checking...',
      last_checked: Date.now()
    }
  });

  const checkServerStatus = useCallback(async (serverType: 'production' | 'development') => {
    try {
      console.log(`[DEBUG] Checking ${serverType} server status`);
      
      // Switch environment mode based on server type (normalize 'development' -> 'local-cli')
      await invoke('set_environment', {
        mode: serverType === 'development' ? 'local-cli' : 'production',
        cli_path: serverType === 'development' ? process.env.AMP_CLI_PATH || null : null,
        server_url: serverType === 'development' ? process.env.AMP_URL || 'https://localhost:7002' : null,
        token: process.env.AMP_TOKEN || null
      });
      
      // Check auth status with the configured environment
      const authStatus: AuthStatusResponse = await invoke('auth_status');
      
      const serverStatus: ServerStatus = {
        available: authStatus.success,
        connection_description: authStatus.connection_description,
        version: authStatus.version,
        error: authStatus.success ? undefined : authStatus.message,
        last_checked: Date.now()
      };

      setStatus(prev => ({
        ...prev,
        [serverType]: serverStatus
      }));

      return serverStatus;
    } catch (error) {
      console.error(`Failed to check ${serverType} server status:`, error);
      
      const errorStatus: ServerStatus = {
        available: false,
        connection_description: `${serverType} server unavailable`,
        error: error instanceof Error ? error.message : 'Unknown error',
        last_checked: Date.now()
      };

      setStatus(prev => ({
        ...prev,
        [serverType]: errorStatus
      }));

      return errorStatus;
    }
  }, []);

  // Check both servers on mount and periodically
  useEffect(() => {
    const checkBothServers = async () => {
      // Check sequentially to avoid race conditions
      await checkServerStatus('production');
      await checkServerStatus('development');
    };

    // Initial check
    checkBothServers();

    // Check every 30 seconds
    const interval = setInterval(checkBothServers, 30000);

    return () => clearInterval(interval);
  }, [checkServerStatus]);

  return {
    status,
    refresh: async () => {
      // Refresh sequentially to avoid race conditions
      await checkServerStatus('production');
      await checkServerStatus('development');
    }
  };
};
