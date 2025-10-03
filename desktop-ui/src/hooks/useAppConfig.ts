/**
 * useAppConfig Hook
 * 
 * Hook to access and manage application configuration state.
 */

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface AppConfig {
  connection_mode?: string
  custom_cli_path?: string
  local_server_url?: string
  amp_env: Record<string, string>
  runtime: {
    amp_url: string
    cli_path: string
    extra_args: string[]
    use_local_cli: boolean
  }
  active_toolbox_profile_id?: number
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Use the existing config_get command
        const configData = await invoke<any>('config_get')
        setConfig(configData)
      } catch (error) {
        console.error('[useAppConfig] Failed to load config:', error)
        // Set a default config to prevent blocking
        setConfig({
          connection_mode: 'production',
          amp_env: { AMP_BIN: 'amp' },
          runtime: {
            amp_url: 'https://ampcode.com',
            cli_path: 'amp',
            extra_args: [],
            use_local_cli: false
          }
        })
      } finally {
        setLoading(false)
      }
    }
    
    loadConfig()
  }, [])
  
  const updateConfig = async (updates: Partial<AppConfig>) => {
    if (!config) return
    
    try {
      const newConfig = { ...config, ...updates }
      
      // Update configuration via Tauri commands
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'runtime' && key !== 'amp_env') {
          await invoke('config_set', { key, value: JSON.stringify(value) })
        }
      }
      
      setConfig(newConfig)
    } catch (error) {
      console.error('[useAppConfig] Failed to update config:', error)
    }
  }
  
  return {
    config,
    loading,
    updateConfig
  }
}
