import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'

export type ToolCall = {
  id: string
  name: string
  input: any
  result?: any
  status: 'pending' | 'completed' | 'error'
}

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-border rounded-md bg-card/60">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 opacity-80" />
          <div className="text-sm">
            <span className="font-medium">{call.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">#{call.id.slice(0, 6)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={'text-xs px-2 py-0.5 rounded-full border '+ (call.status === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : call.status === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-secondary text-muted-foreground border-border')}>
            {call.status === 'pending' ? 'Running' : call.status === 'error' ? 'Error' : 'Done'}
          </span>
          <button onClick={() => setOpen(o => !o)} className="p-1 hover:bg-accent rounded">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Arguments</div>
            <pre className="bg-muted/40 text-muted-foreground p-2 rounded border border-border overflow-auto whitespace-pre-wrap break-all max-w-full"><code>{JSON.stringify(call.input, null, 2)}</code></pre>
          </div>
          {call.result !== undefined && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Result</div>
              <pre className="bg-muted/40 text-muted-foreground p-2 rounded border border-border overflow-auto whitespace-pre-wrap break-all max-w-full"><code>{typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
