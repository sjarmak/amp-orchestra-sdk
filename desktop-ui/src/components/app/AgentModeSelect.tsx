import { useEffect, useState } from 'react'
import { useAmpService } from '../../hooks/useAmpService'

const OPTIONS = [
  'default',
  'geppetto:main',
  'claudetto:main',
  'gronk-fast:main',
  'gronk-fast:search',
  'gronk-fast:main+search',
  'bolt:search',
]

export function AgentModeSelect({ className = '' }: { className?: string }) {
  const { getAgentMode, setAgentMode } = useAmpService()
  const [value, setValue] = useState<string>('default')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const current = await getAgentMode()
      if (mounted && current) setValue(current)
    })()
    return () => { mounted = false }
  }, [getAgentMode])

  return (
    <select
      className={`text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground shadow-none outline-none appearance-none truncate ${className}`}
      value={value}
      onChange={async (e) => {
        const v = e.target.value
        setValue(v)
        await setAgentMode(v === 'default' ? null : v)
      }}
      title="Select agent mode"
    >
      {OPTIONS.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

export default AgentModeSelect
