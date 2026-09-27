/**
 * THE SERVICE'S SETTINGS, READ ONCE FROM THE ENVIRONMENT.
 *
 * Every limit has a default that is safe to run with. The one thing with no
 * default is the secret: a scanner that anybody on the internet can feed
 * files to is a free CPU for strangers, so the service refuses to start
 * without a long one.
 */

const MiB = 1024 * 1024

function int(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid number "${value}" (expected an integer from ${min} to ${max})`)
  }
  return n
}

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback
  return /^(1|true|yes|on)$/i.test(String(value).trim())
}

/** The shortest secret the service accepts. `openssl rand -hex 32` gives 64. */
export const MIN_SECRET_LENGTH = 32

export function loadConfig(env = process.env) {
  const secret = String(env.CLAMAV_SERVICE_SECRET ?? "")
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `CLAMAV_SERVICE_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    )
  }

  return {
    host: env.HOST || "0.0.0.0",
    port: int(env.PORT, 8080, { min: 1, max: 65535 }),
    secret,
    clamd: {
      /* A unix socket wins when both are given: it never leaves the machine. */
      socket: env.CLAMD_SOCKET || "",
      host: env.CLAMD_HOST || "clamav",
      port: int(env.CLAMD_PORT, 3310, { min: 1, max: 65535 }),
      /* How long connecting, PING and VERSION may take. */
      commandTimeoutMs: int(env.CLAMD_COMMAND_TIMEOUT_MS, 5_000, { min: 100 }),
    },
    /* 1 GiB by default. Keep clamd's StreamMaxLength a little above this. */
    maxFileBytes: int(env.MAX_FILE_BYTES, 1024 * MiB, { min: 1 }),
    /* From the first byte to the verdict. */
    scanTimeoutMs: int(env.SCAN_TIMEOUT_MS, 120_000, { min: 1_000 }),
    /* Scans sent to clamd at once, and how many more may wait for a turn. */
    maxConcurrentScans: int(env.MAX_CONCURRENT_SCANS, 4, { min: 1, max: 64 }),
    maxQueuedScans: int(env.MAX_QUEUED_SCANS, 32, { min: 0, max: 10_000 }),
    queueTimeoutMs: int(env.QUEUE_TIMEOUT_MS, 30_000, { min: 0 }),
    rateLimit: {
      /* Scans per minute for one caller, with a burst on top. */
      perMinute: int(env.RATE_LIMIT_PER_MINUTE, 120, { min: 1 }),
      burst: int(env.RATE_LIMIT_BURST, 30, { min: 1 }),
      /* Wrong secrets one address may send in a minute before it is told to wait. */
      authFailuresPerMinute: int(env.AUTH_FAILURES_PER_MINUTE, 10, { min: 1 }),
      /* Health checks per minute from one address. */
      healthPerMinute: int(env.HEALTH_PER_MINUTE, 120, { min: 1 }),
    },
    /* Only behind a proxy you run: otherwise X-Forwarded-For is whatever the caller typed. */
    trustProxy: bool(env.TRUST_PROXY, false),
    /* Signatures older than this make /health report "degraded". */
    maxSignatureAgeHours: int(env.MAX_SIGNATURE_AGE_HOURS, 48, { min: 1 }),
    shutdownGraceMs: int(env.SHUTDOWN_GRACE_MS, 30_000, { min: 0 }),
    logLevel: ["debug", "info", "warn", "error"].includes(env.LOG_LEVEL) ? env.LOG_LEVEL : "info",
  }
}
