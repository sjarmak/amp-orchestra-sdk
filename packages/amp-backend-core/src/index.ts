// Main exports for the amp-backend-core package
export * from './auth.js';
export * from './config.js';
export * from './resolver.js';

// Re-export commonly used types
export type {
  AmpAuthConfig,
  AmpVersionInfo
} from './auth.js';

export type {
  PersistedConfigFile
} from './config.js';

export type {
  AmpRuntimeConfig,
  ResolvedConnection,
  ConnectionResolverOptions
} from './resolver.js';
