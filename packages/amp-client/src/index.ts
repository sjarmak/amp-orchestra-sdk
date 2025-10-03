// Authentication exports
export {
  AmpAuthConfig,
  AmpVersionInfo,
  loadAmpAuthConfig,
  hasAuthEnvironment,
  ensureAmpAuth,
  getAmpVersion,
  ampArgsFromEnv
} from './auth.js';

// Configuration exports  
export {
  AmpRuntimeConfig,
  RuntimeConfig,
  getRuntimeConfig,
  initTauriProvider,
  getAmpCliPath,
  getAmpExtraArgs,
  getAmpEnvironment,
  validateAmpPath,
  sanitizeEnvironment
} from './config.js';

// Client exports
export {
  AmpAdapterConfig,
  AmpIterationResult,
  StreamingEvent,
  InteractiveHandle,
  InteractiveState,
  AmpClient
} from './client.js';

// Web client exports
export {
  ThreadData,
  NormalizedThread,
  WebFetcherConfig,
  ThreadWebFetcher
} from './web-client.js';

// Utility exports
export {
  getCurrentAmpThreadId,
  redactSecrets
} from './utils.js';
