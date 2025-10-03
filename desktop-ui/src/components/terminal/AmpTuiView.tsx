import { useState } from 'react'
import { Terminal as TerminalIcon, Code } from 'lucide-react'
import SimpleTerminal from './SimpleTerminal'

export type TuiProfile = 'prod' | 'dev'

interface AmpTuiViewProps {
  className?: string
  defaultProfile?: TuiProfile
  onProfileChange?: (profile: TuiProfile) => void
}

export function AmpTuiView({ 
  className = '', 
  defaultProfile = 'prod',
  onProfileChange 
}: AmpTuiViewProps) {
  const [activeProfile, setActiveProfile] = useState<TuiProfile>(defaultProfile)
  
  console.log('AmpTuiView rendering with profile:', activeProfile)

  const handleProfileChange = (value: TuiProfile) => {
    // Only toggle visibility; do NOT change global environment.
    setActiveProfile(value)
    onProfileChange?.(value)
  }

  return (
    <div className={`flex-1 h-full flex flex-col min-h-0 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        {/* Environment tabs (chat-style) */}
        <div className="flex items-center space-x-1 bg-muted/50 rounded-md p-1">
          <button
            onClick={() => handleProfileChange('prod')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
              activeProfile === 'prod'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
            title="Switch to production"
          >
            <TerminalIcon className="w-3 h-3" />
            <span>Production</span>
          </button>
          <button
            onClick={() => handleProfileChange('dev')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
              activeProfile === 'dev'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
            title="Switch to development"
          >
            <Code className="w-3 h-3" />
            <span>Development</span>
          </button>
        </div>

      </div>

      <div className="flex-1 h-full min-h-[300px] border overflow-hidden relative">
        {(['prod','dev'] as TuiProfile[]).map((p) => {
          const isActive = activeProfile === p
          const className = `absolute inset-0 ${isActive ? '' : 'amp-tui-hidden'}`
          return (
            <div key={p} className={className}>
              <SimpleTerminal 
                key={`persistent-${p}`}
                kind="terminal"
                cwd="/Users/sjarmak/amp-orchestra"
                className="h-full"
                active={isActive}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AmpTuiView
