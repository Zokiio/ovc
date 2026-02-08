export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
}

const DEFAULT_LOG_LEVEL: LogLevel = 'warn'

function parseLogLevel(value: unknown): LogLevel | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error' || normalized === 'silent') {
    return normalized
  }

  return null
}

function resolveLogLevel(): LogLevel {
  let level = parseLogLevel(import.meta.env.VITE_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL

  if (typeof window !== 'undefined') {
    const override = parseLogLevel(window.localStorage.getItem('voice_log_level'))
    if (override) {
      level = override
    }
  }

  return level
}

const ACTIVE_LOG_LEVEL = resolveLogLevel()

function canLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[ACTIVE_LOG_LEVEL]
}

export function createLogger(scope: string) {
  const prefix = `[${scope}]`

  return {
    debug: (...args: unknown[]) => {
      if (canLog('debug')) {
        console.debug(prefix, ...args)
      }
    },
    info: (...args: unknown[]) => {
      if (canLog('info')) {
        console.info(prefix, ...args)
      }
    },
    warn: (...args: unknown[]) => {
      if (canLog('warn')) {
        console.warn(prefix, ...args)
      }
    },
    error: (...args: unknown[]) => {
      if (canLog('error')) {
        console.error(prefix, ...args)
      }
    },
  }
}

export function getActiveLogLevel(): LogLevel {
  return ACTIVE_LOG_LEVEL
}
