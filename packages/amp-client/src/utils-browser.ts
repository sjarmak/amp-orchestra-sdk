/**
 * Browser-compatible utility functions
 */

/**
 * Gets the current Amp thread ID - browser version (not available)
 */
export async function getCurrentAmpThreadId(): Promise<string | null> {
  // In browser environment, we can't access the file system
  return null;
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
