/**
 * STRUCTURED LOGS: ONE JSON OBJECT A LINE.
 *
 * Never a file's bytes, never a header value, never the secret. Callers pass
 * named fields; anything that looks like a credential is dropped here as a
 * second line of defence.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const SECRET_KEYS = /secret|authorization|token|password|cookie/i

export function createLogger({ level = "info", write = (line) => process.stdout.write(line + "\n") } = {}) {
  const min = LEVELS[level] ?? LEVELS.info

  function emit(lvl, msg, fields = {}) {
    if (LEVELS[lvl] < min) return
    const entry = { time: new Date().toISOString(), level: lvl, msg }
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || SECRET_KEYS.test(k)) continue
      entry[k] = v instanceof Error ? v.message : v
    }
    try {
      write(JSON.stringify(entry))
    } catch {
      /* A log line that cannot be written is not worth crashing a scan for. */
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  }
}

/** A logger that says nothing, for tests. */
export const silentLogger = { debug() {}, info() {}, warn() {}, error() {} }
