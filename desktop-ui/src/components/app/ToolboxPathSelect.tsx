import { useEffect, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAmpService } from '../../hooks/useAmpService'

export function ToolboxPathSelect({ className = '' }: { className?: string }) {
  const { getToolboxPath, setToolboxPath } = useAmpService()
  const [value, setValue] = useState<string>('')
  
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const current = await getToolboxPath()
      if (mounted && current) setValue(current)
    })()
    return () => { mounted = false }
  }, [getToolboxPath])

  const handleSelect = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Toolbox Directory'
      })
      
      if (selected && typeof selected === 'string') {
        setValue(selected)
        await setToolboxPath(selected)
      }
    } catch (error) {
      console.error('Failed to select toolbox directory:', error)
    }
  }

  const handleClear = async () => {
    setValue('')
    await setToolboxPath(null)
  }

  const displayValue = value || 'No toolbox selected'
  const isSelected = Boolean(value)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleSelect}
        className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground hover:bg-muted transition-colors flex items-center gap-1"
        title="Select toolbox directory"
      >
        <FolderOpen className="w-3 h-3" />
        <span className="max-w-32 truncate">
          {displayValue}
        </span>
      </button>
      {isSelected && (
        <button
          onClick={handleClear}
          className="text-xs p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear toolbox selection"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

export default ToolboxPathSelect
