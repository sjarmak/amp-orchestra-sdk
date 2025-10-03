/**
 * M1.7 Execution Profile Selector Component
 * 
 * Provides selection between Dev and Prod execution profiles with proper gating.
 * Only shows profile selector when EnvKind == Local according to M1.7 spec.
 */

import React, { useState, useCallback, useEffect, memo } from 'react'
import { ChevronDown, Settings, Zap, Shield } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useEnvironmentPersistence } from '../../hooks/useEnvironmentPersistence'

export type ExecutionProfile = 'dev' | 'prod'

export interface ProfileConfig {
  name: string
  description: string
  icon: React.ReactNode
  color: string
  entrypoint: string
}

interface ExecutionProfileSelectorProps {
  currentProfile: ExecutionProfile
  onProfileChange: (profile: ExecutionProfile) => void
  envKind: 'local' | 'production' // Only show selector when 'local'
  className?: string
  disabled?: boolean
}

/**
 * Execution Profile Selector with gating logic
 * 
 * Features:
 * - Dev/Prod profile selection with visual indicators
 * - Automatic gating based on environment kind
 * - Profile descriptions and entrypoint information
 * - Persistent selection (localStorage)
 * - Accessible dropdown design
 */
const ExecutionProfileSelectorComponent: React.FC<ExecutionProfileSelectorProps> = ({
  currentProfile,
  onProfileChange,
  envKind,
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { setLastProfile, getRecommendedProfile } = useEnvironmentPersistence()
  
  // Profile configurations according to M1.7 spec
  const profiles: Record<ExecutionProfile, ProfileConfig> = {
    dev: {
      name: 'Development',
      description: 'Use local CLI with dev server',
      icon: <Settings className="w-4 h-4" />,
      color: 'text-blue-500',
      entrypoint: 'node ~/amp/cli/dist/main.js'
    },
    prod: {
      name: 'Production',
      description: 'Use system amp binary',
      icon: <Shield className="w-4 h-4" />,
      color: 'text-green-500',
      entrypoint: 'amp'
    }
  }
  
  // Always show selector but disable in production for clarity
  const shouldShowSelector = true
  const isDisabledByEnv = envKind !== 'local'
  
  // Restore preferred profile on environment change
  useEffect(() => {
    if (shouldShowSelector && !disabled) {
      const recommendedProfile = getRecommendedProfile(envKind)
      if (recommendedProfile !== currentProfile) {
        onProfileChange(recommendedProfile)
      }
    }
  }, [envKind, shouldShowSelector, disabled, getRecommendedProfile, currentProfile, onProfileChange])
  
  // Save profile changes with environment context
  useEffect(() => {
    if (shouldShowSelector && !isDisabledByEnv) {
      setLastProfile(envKind, currentProfile)
    }
  }, [currentProfile, shouldShowSelector, isDisabledByEnv, envKind, setLastProfile])
  
  const handleProfileSelect = useCallback((profile: ExecutionProfile) => {
    onProfileChange(profile)
    setIsOpen(false)
  }, [onProfileChange])
  
  const toggleDropdown = useCallback(() => {
    if (!disabled && !isDisabledByEnv) {
      setIsOpen(prev => !prev)
    }
  }, [disabled, isDisabledByEnv])
  
  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && !(event.target as Element).closest('.profile-selector')) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isOpen])
  
  // Don't render if explicitly hidden
  if (!shouldShowSelector) {
    return null
  }
  
  const currentConfig = profiles[currentProfile]
  
  return (
    <div className={cn('profile-selector relative', className)}>
      {/* Profile Selector Button */}
      <button
        onClick={toggleDropdown}
        disabled={disabled || isDisabledByEnv}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          disabled || isDisabledByEnv
            ? 'opacity-50 cursor-not-allowed bg-muted/20'
            : 'bg-background border-border hover:border-border/80',
          isOpen && 'bg-muted/30 border-border/60'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={isDisabledByEnv 
          ? `Profile locked in ${envKind} environment: ${currentConfig.name} - ${currentConfig.description}`
          : `Current profile: ${currentConfig.name} - ${currentConfig.description}`
        }
      >
        <div className={cn('flex items-center gap-2', currentConfig.color)}>
          {currentConfig.icon}
          <span className="font-medium">{currentConfig.name}</span>
          {isDisabledByEnv && (
            <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground">
              LOCKED
            </span>
          )}
        </div>
        <ChevronDown 
          className={cn(
            'w-4 h-4 transition-transform', 
            isOpen && 'transform rotate-180',
            isDisabledByEnv && 'opacity-30'
          )} 
        />
      </button>
      
      {/* Dropdown Menu - only show if not disabled by environment */}
      {isOpen && !isDisabledByEnv && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="p-1">
            {Object.entries(profiles).map(([profileKey, config]) => {
              const profile = profileKey as ExecutionProfile
              const isSelected = profile === currentProfile
              
              return (
                <button
                  key={profile}
                  onClick={() => handleProfileSelect(profile)}
                  className={cn(
                    'w-full flex items-start gap-3 px-3 py-3 text-left rounded-sm transition-colors',
                    'hover:bg-muted/50 focus:outline-none focus:bg-muted/50',
                    isSelected && 'bg-muted text-foreground'
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className={cn('flex-shrink-0 mt-0.5', config.color)}>
                    {config.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{config.name}</span>
                      {isSelected && (
                        <Zap className="w-3 h-3 text-primary" />
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      {config.description}
                    </p>
                    
                    <code className="text-xs text-muted-foreground mt-1 font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                      {config.entrypoint}
                    </code>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      
      {/* Environment Info with enhanced clarity */}
      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
        <div className={cn(
          'w-2 h-2 rounded-full',
          envKind === 'local' ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
        )} />
        <span className="font-medium">
          {envKind === 'local' ? 'Local Environment' : 'Production Environment'}
        </span>
        {isDisabledByEnv && (
          <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded">
            Profile selection locked
          </span>
        )}
      </div>
    </div>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const ExecutionProfileSelector = memo(ExecutionProfileSelectorComponent, (prevProps, nextProps) => {
  return (
    prevProps.currentProfile === nextProps.currentProfile &&
    prevProps.envKind === nextProps.envKind &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.className === nextProps.className &&
    prevProps.onProfileChange === nextProps.onProfileChange
  )
})

ExecutionProfileSelector.displayName = 'ExecutionProfileSelector'

export default ExecutionProfileSelector
