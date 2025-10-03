# Amp JSON Streaming Integration Guide

A comprehensive guide for integrating Amp's JSON streaming capabilities into applications, with specific guidance for Tauri + React + Rust architectures.

## Overview

Amp provides **Claude Code compatible** JSON streaming output through the `--stream-json` flag, enabling real-time conversational AI integration into any application. The streaming API outputs JSONL format (one JSON object per line) with support for multi-turn conversations, tool execution, and real-time message processing.

## Core Documentation & Implementation Files

### Primary Documentation
- **Complete API Specification**: [`/Users/sjarmak/amp/doc/cli-stream-json-mode.md`](file:///Users/sjarmak/amp/doc/cli-stream-json-mode.md)
- **CLI Execute Mode**: [`/Users/sjarmak/amp/doc/cli-execute-mode.md`](file:///Users/sjarmak/amp/doc/cli-execute-mode.md)

### Core Implementation
- **Reference Implementation**: [`/Users/sjarmak/amp/cli/src/stream-json-mode.ts`](file:///Users/sjarmak/amp/cli/src/stream-json-mode.ts)
- **TypeScript Schema & Types**: [`/Users/sjarmak/amp/cli/src/types/stream-json-schema.ts`](file:///Users/sjarmak/amp/cli/src/types/stream-json-schema.ts)

### Integration Examples
- **Node.js Client Example**: [`/Users/sjarmak/amp/scripts/test-cli-stream-json-input.js`](file:///Users/sjarmak/amp/scripts/test-cli-stream-json-input.js)
- **Shell Script Integration**: [`/Users/sjarmak/amp/demo-stream-input.sh`](file:///Users/sjarmak/amp/demo-stream-input.sh)
- **Claude Code Compatibility**: [`/Users/sjarmak/amp/test-claude-streaming.js`](file:///Users/sjarmak/amp/test-claude-streaming.js)

### Production Integration Examples
- **Industrial Orchestrator**: [`/Users/sjarmak/amp-orchestrator/packages/core/src/amp.ts`](file:///Users/sjarmak/amp-orchestrator/packages/core/src/amp.ts)
- **Interactive Chat Interface**: [`/Users/sjarmak/amp-orchestrator/docs/INTERACTIVE-CHAT.md`](file:///Users/sjarmak/amp-orchestrator/docs/INTERACTIVE-CHAT.md)
- **Testing Framework**: [`/Users/sjarmak/amp-orchestrator/test-streaming-simple.cjs`](file:///Users/sjarmak/amp-orchestrator/test-streaming-simple.cjs)

## Key Features

### Stream Message Types

1. **System Init Message** - Session metadata and available tools
2. **Assistant Messages** - AI responses with text and tool calls
3. **User Messages** - Tool execution results  
4. **Result Messages** - Final success/error summary

### Core Capabilities

- **Real-time Streaming**: Process messages as they arrive with `--stream-json-input`
- **Multi-turn Conversations**: Maintain context across multiple messages
- **Tool Support**: Handle streaming tool calls and results
- **Claude Code Compatible**: 100% compatible with existing Claude Code parsers
- **Backpressure Management**: Node.js stream handling with proper drain events
- **Error Resilience**: Comprehensive error reporting and graceful degradation

## Basic Usage Patterns

### Simple Query
```bash
amp --execute "what is 2+2?" --stream-json
```

### Interactive Streaming Mode
```bash
amp --execute --stream-json --stream-json-input
```

### Multi-message Input
```bash
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}' | amp -x --stream-json --stream-json-input
```

## Tauri + React + Rust Integration Architecture

### Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   Rust Backend  │    │   Amp Process   │
│   (Frontend)    │◄──►│   (Tauri Core)  │◄──►│   (CLI Stream)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1. Rust Backend Integration (Tauri Core)

#### Cargo.toml Dependencies
```toml
[dependencies]
tauri = { version = "1.0", features = ["api-all"] }
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio-process = "0.2"
futures = "0.3"
```

#### Rust Implementation (`src-tauri/src/amp_client.rs`)
```rust
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamMessage {
    #[serde(rename = "system")]
    System { 
        subtype: String,
        session_id: String,
        // ... other fields
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: AssistantMessage,
        session_id: String,
    },
    #[serde(rename = "user")]
    User {
        message: UserMessage,
        session_id: String,
    },
    #[serde(rename = "result")]
    Result {
        subtype: String,
        duration_ms: u64,
        is_error: bool,
        session_id: String,
    },
}

pub struct AmpClient {
    process: Option<Child>,
    message_sender: Option<mpsc::UnboundedSender<StreamMessage>>,
}

impl AmpClient {
    pub fn new() -> Self {
        Self {
            process: None,
            message_sender: None,
        }
    }

    pub async fn start_session(&mut self) -> Result<mpsc::UnboundedReceiver<StreamMessage>, Box<dyn std::error::Error>> {
        let mut child = Command::new("amp")
            .args(&["--execute", "--stream-json", "--stream-json-input"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::unbounded_channel();

        // Spawn task to read streaming output
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(message) = serde_json::from_str::<StreamMessage>(&line) {
                    if tx.send(message).is_err() {
                        break; // Channel closed
                    }
                }
            }
        });

        self.process = Some(child);
        Ok(rx)
    }

    pub async fn send_message(&mut self, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(process) = &mut self.process {
            let message = serde_json::json!({
                "type": "user",
                "message": {
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": content
                    }]
                }
            });

            let stdin = process.stdin.as_mut().unwrap();
            use tokio::io::AsyncWriteExt;
            stdin.write_all(format!("{}\n", message).as_bytes()).await?;
            stdin.flush().await?;
        }
        Ok(())
    }
}
```

#### Tauri Commands (`src-tauri/src/main.rs`)
```rust
mod amp_client;

use amp_client::{AmpClient, StreamMessage};
use std::sync::Mutex;
use tauri::{State, Window};
use tokio::sync::mpsc;

struct AppState {
    amp_client: Mutex<AmpClient>,
}

#[tauri::command]
async fn start_amp_session(
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    let mut client = state.amp_client.lock().unwrap();
    
    match client.start_session().await {
        Ok(mut rx) => {
            let session_id = "session_started".to_string();
            
            // Spawn task to forward messages to frontend
            tokio::spawn(async move {
                while let Some(message) = rx.recv().await {
                    let _ = window.emit("amp_message", &message);
                }
            });
            
            Ok(session_id)
        }
        Err(e) => Err(format!("Failed to start session: {}", e)),
    }
}

#[tauri::command]
async fn send_amp_message(
    state: State<'_, AppState>,
    message: String,
) -> Result<(), String> {
    let mut client = state.amp_client.lock().unwrap();
    
    client.send_message(&message).await
        .map_err(|e| format!("Failed to send message: {}", e))
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            amp_client: Mutex::new(AmpClient::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_amp_session,
            send_amp_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2. React Frontend Integration

#### TypeScript Types (`src/types/amp.ts`)
```typescript
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  session_id: string;
}

export interface SystemMessage extends StreamMessage {
  type: 'system';
  subtype: string;
  cwd?: string;
  tools?: string[];
}

export interface AssistantMessage extends StreamMessage {
  type: 'assistant';
  message: {
    id: string;
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: any;
    }>;
    stop_reason: string | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ResultMessage extends StreamMessage {
  type: 'result';
  subtype: 'success' | 'error';
  duration_ms: number;
  is_error: boolean;
  result?: string;
  error?: string;
}
```

#### React Chat Component (`src/components/AmpChat.tsx`)
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import type { StreamMessage, AssistantMessage, ResultMessage } from '../types/amp';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export const AmpChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const setupAmpSession = async () => {
      try {
        await invoke('start_amp_session');
        setIsConnected(true);
        
        // Listen for streaming messages
        const unlisten = await listen<StreamMessage>('amp_message', (event) => {
          handleStreamMessage(event.payload);
        });

        return unlisten;
      } catch (error) {
        console.error('Failed to setup Amp session:', error);
      }
    };

    setupAmpSession();
  }, []);

  const handleStreamMessage = useCallback((message: StreamMessage) => {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          setMessages(prev => [...prev, {
            id: `system-${Date.now()}`,
            role: 'system',
            content: 'Amp session initialized',
            timestamp: new Date(),
          }]);
        }
        break;
        
      case 'assistant':
        const assistantMsg = message as AssistantMessage;
        const textContent = assistantMsg.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');
          
        setMessages(prev => {
          const existing = prev.find(m => m.id === assistantMsg.message.id);
          if (existing) {
            return prev.map(m => 
              m.id === assistantMsg.message.id 
                ? { ...m, content: textContent, isStreaming: false }
                : m
            );
          }
          
          return [...prev, {
            id: assistantMsg.message.id,
            role: 'assistant',
            content: textContent,
            timestamp: new Date(),
            isStreaming: assistantMsg.message.stop_reason === null,
          }];
        });
        break;
        
      case 'result':
        const resultMsg = message as ResultMessage;
        setIsLoading(false);
        
        if (resultMsg.is_error && resultMsg.error) {
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Error: ${resultMsg.error}`,
            timestamp: new Date(),
          }]);
        }
        break;
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || !isConnected || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      await invoke('send_amp_message', { message: input.trim() });
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.role === 'system'
                  ? 'bg-gray-200 text-gray-800 text-sm'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.isStreaming && (
                <div className="text-xs opacity-70 mt-1">Streaming...</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={isConnected ? "Ask Amp anything..." : "Connecting..."}
            disabled={!isConnected || isLoading}
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={!isConnected || isLoading || !input.trim()}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mt-2">
          Status: {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
};
```

### 3. Advanced Integration Features

#### Error Handling & Reconnection
```typescript
const useAmpConnection = () => {
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const reconnect = useCallback(async () => {
    setConnectionState('connecting');
    try {
      await invoke('start_amp_session');
      setConnectionState('connected');
    } catch (error) {
      setConnectionState('disconnected');
      // Retry logic
      setTimeout(reconnect, 5000);
    }
  }, []);

  return { connectionState, reconnect };
};
```

#### Message Queue Management
```rust
// In Rust backend
pub struct MessageQueue {
    pending_messages: Vec<String>,
    is_processing: bool,
}

impl MessageQueue {
    pub async fn process_queue(&mut self, client: &mut AmpClient) {
        if self.is_processing || self.pending_messages.is_empty() {
            return;
        }
        
        self.is_processing = true;
        
        while let Some(message) = self.pending_messages.pop() {
            if let Err(_) = client.send_message(&message).await {
                self.pending_messages.push(message); // Re-queue on error
                break;
            }
        }
        
        self.is_processing = false;
    }
}
```

## Testing & Development

### Local Testing Script
```bash
#!/bin/bash
# Test basic streaming functionality
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Hello, test message"}]}}' | \
  /Users/sjarmak/amp/cli/dist/amp --execute --stream-json --stream-json-input
```

### Development Environment Setup
1. **Clone Amp repository**: `git clone <amp-repo-url>`
2. **Build Amp CLI**: `cd amp && pnpm install && pnpm build`
3. **Test streaming**: Use examples in [`/Users/sjarmak/amp/scripts/test-cli-stream-json-input.js`](file:///Users/sjarmak/amp/scripts/test-cli-stream-json-input.js)

## Production Considerations

### Performance Optimizations
- **Connection Pooling**: Maintain persistent Amp processes
- **Message Batching**: Group multiple messages when appropriate  
- **Memory Management**: Monitor process memory usage
- **Error Recovery**: Implement automatic restart on process crashes

### Security Considerations
- **Process Sandboxing**: Run Amp processes with limited permissions
- **Input Validation**: Sanitize all user inputs before sending to Amp
- **Output Filtering**: Validate and sanitize Amp responses
- **Rate Limiting**: Prevent abuse through message rate limiting

### Monitoring & Logging
- **Process Health**: Monitor Amp process status
- **Message Metrics**: Track message throughput and latency
- **Error Tracking**: Log and alert on streaming errors
- **Usage Analytics**: Monitor token usage and costs

## Integration Checklist

- [ ] Set up Tauri project with Rust backend
- [ ] Implement Amp client in Rust with tokio async runtime
- [ ] Create React components for chat interface
- [ ] Add TypeScript types for stream messages
- [ ] Implement error handling and reconnection logic
- [ ] Add message queue management
- [ ] Test with various message types (text, tool calls)
- [ ] Add monitoring and logging
- [ ] Configure security and rate limiting
- [ ] Deploy and test in production environment

## Reference Links

- **Main Documentation**: [`/Users/sjarmak/amp/doc/cli-stream-json-mode.md`](file:///Users/sjarmak/amp/doc/cli-stream-json-mode.md)
- **Amp Repository**: [`/Users/sjarmak/amp/`](file:///Users/sjarmak/amp/)
- **Orchestrator Examples**: [`/Users/sjarmak/amp-orchestrator/`](file:///Users/sjarmak/amp-orchestrator/)
- **Tauri Documentation**: https://tauri.app/
- **Claude Code Compatibility**: https://docs.anthropic.com/en/docs/claude-code/sdk.md

This integration guide provides a complete foundation for embedding Amp's conversational AI capabilities into any Tauri-based desktop application with React and Rust.
