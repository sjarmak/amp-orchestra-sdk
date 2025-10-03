import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Gets the current Amp thread ID from the local state file
 */
export async function getCurrentAmpThreadId(): Promise<string | null> {
  try {
    const threadIdPath = join(homedir(), '.local', 'state', 'amp', 'last-thread-id');
    const threadId = await readFile(threadIdPath, 'utf-8');
    return threadId.trim();
  } catch {
    return null;
  }
}

/**
 * Redacts secrets from text based on environment variable keys
 */
export function redactSecrets(text: string, env?: Record<string, string>): string {
  if (!env) return text;

  let redacted = text;
  Object.entries(env).forEach(([key, value]) => {
    if (/TOKEN|KEY|SECRET/i.test(key) && value) {
      redacted = redacted.split(value).join("[REDACTED]");
    }
  });

  return redacted;
}
