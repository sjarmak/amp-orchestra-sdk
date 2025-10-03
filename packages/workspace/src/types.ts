export interface FileDiff {
  path: string;
  linesAdded: number;
  linesDeleted: number;
  operation: 'create' | 'modify' | 'delete';
  diff?: string;
}

export interface GitRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs?: number;
}

export interface GitRetryOptions {
  operation: string;
  config?: Partial<GitRetryConfig>;
  logger?: Logger;
}

export interface GitRetryResult<T> {
  result: T;
  attempts: number;
  totalDelayMs: number;
}

export interface LockInfo {
  sessionId: string;
  pid: number;
  timestamp: number;
  hostname?: string;
}

export interface RebaseResult {
  status: 'ok' | 'conflict';
  files?: string[];
}

export interface BranchInfo {
  aheadBy: number;
  behindBy: number;
  branchpointSha: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  createChild(childNamespace: string): Logger;
}
