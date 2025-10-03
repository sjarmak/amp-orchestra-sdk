import { Markdown } from './Markdown'
import { ToolCallCard, ToolCall } from './ToolCallCard'

export type AssistantBlocks = Array<
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: any; is_error?: boolean }
>

export function AssistantMessage({ content, blocks }: { content: string; blocks?: AssistantBlocks }) {
  const toolCalls: ToolCall[] = []

  if (blocks) {
    const callMap = new Map<string, ToolCall>()
    for (const b of blocks) {
      if (b.type === 'tool_use') {
        const call: ToolCall = { id: b.id, name: b.name, input: b.input, status: 'pending' }
        callMap.set(b.id, call)
        toolCalls.push(call)
      } else if (b.type === 'tool_result') {
        const call = callMap.get(b.tool_use_id)
        if (call) {
          call.result = b.content
          call.status = b.is_error ? 'error' : 'completed'
        } else {
          // Orphan result
          toolCalls.push({ id: b.tool_use_id, name: 'tool', input: {}, result: b.content, status: b.is_error ? 'error' : 'completed' })
        }
      }
    }
  }

  return (
    <div className="space-y-3">
      {content?.trim() ? (
        <div>
          <Markdown content={content} />
        </div>
      ) : null}
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          {toolCalls.map(c => (
            <ToolCallCard key={c.id} call={c} />
          ))}
        </div>
      )}
    </div>
  )
}
