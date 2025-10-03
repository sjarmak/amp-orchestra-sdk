/**
 * Environment Persistence Hook
 * 
 * Manages last-used profile preferences per environment kind
 */

import { useCallback, useEffect, useState } from 'react'
import { ExecutionProfile } from '../components/terminal/ExecutionProfileSelector'

interface EnvironmentPreferences {
  local: {
    lastProfile: ExecutionProfile
    timestamp: number
  }
  production: {
    lastProfile: ExecutionProfile
    timestamp: number
  }
}

const STORAGE_KEY = 'amp-environment-preferences'
const DEFAULT_PREFERENCES: EnvironmentPreferences = {
  local: {
    lastProfile: 'dev',
    timestamp: 0
  },
  production: {
    lastProfile: 'prod',
    timestamp: 0
  }
}

export function useEnvironmentPersistence() {
  const [preferences, setPreferences] = useState<EnvironmentPreferences>(DEFAULT_PREFERENCES)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed
        })
      }
    } catch (error) {
      console.warn('Failed to load environment preferences:', error)
    }
  }, [])

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch (error) {
      console.warn('Failed to save environment preferences:', error)
    }
  }, [preferences])

  // Get last used profile for an environment kind
  const getLastProfile = useCallback((envKind: 'local' | 'production'): ExecutionProfile => {
    return preferences[envKind].lastProfile
  }, [preferences])

  // Set last used profile for an environment kind
  const setLastProfile = useCallback((envKind: 'local' | 'production', profile: ExecutionProfile) => {
    setPreferences(prev => ({
      ...prev,
      [envKind]: {
        lastProfile: profile,
        timestamp: Date.now()
      }
    }))
  }, [])

  // Get recommended profile for environment (with fallbacks)
  const getRecommendedProfile = useCallback((envKind: 'local' | 'production'): ExecutionProfile => {
    const lastUsed = getLastProfile(envKind)
    
    // In production environment, always recommend prod profile regardless of last used
    if (envKind === 'production') {
      return 'prod'
    }
    
    // In local environment, use last preference or default to dev
    return lastUsed
  }, [getLastProfile])

  return {
    preferences,
    getLastProfile,
    setLastProfile,
    getRecommendedProfile
  }
}
