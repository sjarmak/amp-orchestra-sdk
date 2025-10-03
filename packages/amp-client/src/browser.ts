// Browser-specific exports for amp-client
// This file excludes Node.js dependencies to avoid bundling issues

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
} from './utils-browser.js';
