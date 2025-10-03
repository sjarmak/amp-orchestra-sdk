export interface ThreadData {
  id: string;
  messages?: any[];
  toolCalls?: any[];
  diffs?: any[];
  metrics?: any;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface NormalizedThread {
  id: string;
  url: string;
  repo: string | null;
  branch: string | null;
  latest_commit_sha: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string;
  source: 'web' | 'cache' | 'git';
  messages: any[];
  tool_calls: any[];
  diffs: any[];
  metrics: any[];
}

export interface WebFetcherConfig {
  sessionCookie: string;
  profile?: string;
}

// Helper function to make HTTP requests via Tauri or direct fetch
async function ampFetch(method: string, path: string, body?: any, profile?: string): Promise<string> {
  // Check if we're in Tauri environment
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    const { invoke } = (window as any).__TAURI__.core;
    return invoke('amp_proxy_simple', {
      method,
      path,
      body: body ? JSON.stringify(body) : null,
      profile: profile || null
    }) as Promise<string>;
  }

  // Fallback to direct fetch for non-Tauri environments
  const response = await fetch(`https://ampcode.com${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'amp-client/1.0'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

export class ThreadWebFetcher {
  private sessionCookie: string;
  private profile?: string;

  constructor(sessionCookieOrConfig: string | WebFetcherConfig) {
    if (typeof sessionCookieOrConfig === 'string') {
      this.sessionCookie = sessionCookieOrConfig;
    } else {
      this.sessionCookie = sessionCookieOrConfig.sessionCookie;
      this.profile = sessionCookieOrConfig.profile;
    }
  }

  async fetchThread(threadId: string): Promise<NormalizedThread> {
    try {
      const responseText = await ampFetch('GET', `/threads/${threadId}`, null, this.profile);
      const threadData = JSON.parse(responseText);
      return this.normalizeThread(threadData);
    } catch (error) {
      // Fallback to cookie-based fetch for non-Tauri environments
      if (typeof window !== 'undefined' && !(window as any).__TAURI__ && this.sessionCookie) {
        const response = await fetch(`https://ampcode.com/threads/${threadId}`, {
          method: 'GET',
          headers: {
            'Cookie': this.sessionCookie,
            'Accept': 'application/json',
            'User-Agent': 'amp-client/1.0'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch thread ${threadId}: ${response.status} ${response.statusText}`);
        }

        const threadData = await response.json();
        return this.normalizeThread(threadData);
      }
      
      throw error;
    }
  }

  private normalizeThread(data: any): NormalizedThread {
    // Flatten tool calls and diffs from messages
    const toolCalls = [];
    const diffs = [];
    const messages = [];
    const metrics = [];

    // Process messages and extract nested data
    if (data.messages && Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        messages.push({
          id: msg.id,
          thread_id: data.id,
          role: msg.role,
          content: msg.content,
          created_at: msg.timestamp,
          idx: msg.idx || 0
        });

        // Extract tool calls
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          for (const toolCall of msg.toolCalls) {
            toolCalls.push({
              id: toolCall.id,
              thread_id: data.id,
              message_id: msg.id,
              tool_name: toolCall.toolName,
              arguments_json: JSON.stringify(toolCall.parameters || {}),
              started_at: toolCall.timestamp,
              finished_at: toolCall.durationMs ? new Date(new Date(toolCall.timestamp).getTime() + toolCall.durationMs).toISOString() : null,
              status: toolCall.result ? 'completed' : 'pending',
              result_json: toolCall.result ? JSON.stringify(toolCall.result) : null
            });
          }
        }

        // Extract diffs
        if (msg.diffs && Array.isArray(msg.diffs)) {
          for (const diff of msg.diffs) {
            diffs.push({
              id: diff.id,
              thread_id: data.id,
              message_id: msg.id,
              file_path: diff.filePath,
              patch: diff.patch || `--- ${diff.filePath}\n+++ ${diff.filePath}\n${diff.newContent || ''}`,
              created_at: diff.timestamp
            });
          }
        }
      }
    }

    // Extract global metrics
    if (data.metrics) {
      const agentMode = (typeof process !== 'undefined' && (process as any).env && (process as any).env.AMP_EXPERIMENTAL_AGENT_MODE)
        ? (process as any).env.AMP_EXPERIMENTAL_AGENT_MODE
        : null;
      metrics.push({
        id: 1,
        thread_id: data.id,
        at: data.lastUpdatedAt,
        input_tokens: data.metrics.promptTokens,
        output_tokens: data.metrics.completionTokens,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        inference_duration_ms: data.metrics.durationMs,
        tokens_per_second: null,
        active_tool_count: null,
        file_tracker_records: null,
        service_tier: null,
        agent_mode: agentMode,
        raw_event_json: JSON.stringify(data.metrics)
      });
    }

    return {
      id: data.id,
      url: `https://ampcode.com/threads/${data.id}`,
      repo: null,
      branch: null,
      latest_commit_sha: null,
      created_at: data.createdAt,
      updated_at: data.lastUpdatedAt,
      last_sync_at: new Date().toISOString(),
      source: 'web',
      messages,
      tool_calls: toolCalls,
      diffs,
      metrics
    };
  }
}
