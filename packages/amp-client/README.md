# @ampsm/amp-client

A standalone TypeScript client library for Amp authentication and API communication.

## Features

- **Authentication**: Environment-based auth configuration and validation
- **CLI Integration**: Execute Amp commands with streaming support  
- **Web API Client**: Fetch threads from ampcode.com with session cookies
- **Configuration**: Runtime configuration for local vs production modes
- **Utilities**: Thread ID management and secret redaction

## Installation

```bash
npm install @ampsm/amp-client
# or
pnpm add @ampsm/amp-client
```

## Usage

### Basic Authentication

```typescript
import { loadAmpAuthConfig, ensureAmpAuth, hasAuthEnvironment } from '@ampsm/amp-client/auth';

// Check if auth environment is configured
if (hasAuthEnvironment()) {
  const result = await ensureAmpAuth();
  if (result.success) {
    console.log(result.message);
  } else {
    console.error('Auth failed:', result.message);
  }
}
```

### Client Operations

```typescript
import { AmpClient } from '@ampsm/amp-client/client';

const client = new AmpClient({
  enableJSONLogs: true,
  agentId: 'my-agent'
});

// Run iteration
const result = await client.runIteration(
  'Create a hello world function',
  '/path/to/project',
  'gpt-5'
);

// Continue existing thread  
const continueResult = await client.continueThread(
  'thread-id-123',
  'Add error handling',
  '/path/to/project'
);
```

### Web API Client

```typescript
import { ThreadWebFetcher } from '@ampsm/amp-client/web-client';

const fetcher = new ThreadWebFetcher('session_cookie_value');
const thread = await fetcher.fetchThread('thread-id-123');
```

### Configuration

```typescript
import { getAmpCliPath, getAmpEnvironment } from '@ampsm/amp-client/config';

const cliPath = getAmpCliPath({ ampCliPath: 'production' });
const env = getAmpEnvironment({ 
  ampServerUrl: 'https://localhost:7002' 
}, { mode: 'local-cli' });
```

## Environment Variables

- `AMP_BIN` / `AMP_CLI_PATH`: Path to amp CLI
- `AMP_TOKEN`: Authentication token
- `AMP_AUTH_CMD`: Command to run for authentication
- `AMP_ARGS`: Additional CLI arguments
- `AMP_ENABLE_JSONL`: Enable JSON logging
- `AMP_URL`: Server URL override

## License

MIT
