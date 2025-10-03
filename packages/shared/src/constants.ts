/**
 * Shared constants
 */

export const APP_NAME = 'amp-orchestra'
export const APP_VERSION = '0.1.0'

export const DEFAULT_CONFIG = {
  theme: 'dark',
  enableTui: true,
  autoSave: true,
} as const

export const TERMINAL_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
} as const
