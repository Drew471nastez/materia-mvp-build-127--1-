import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { createLogger } from "./log.js"

/**
 * The entry point: read the settings, listen, and stop cleanly.
 *
 * On SIGTERM (a deploy, `docker compose down`) the service stops taking new
 * scans, lets the ones in flight finish for up to SHUTDOWN_GRACE_MS, then
 * exits. /health says "draining" meanwhile, so a load balancer moves on.
 */
/* In the single container image the entrypoint runs as root (the ClamAV init
   needs it); the API gives that up before it reads a byte from the network. */
if (process.env.RUN_AS_USER && process.getuid?.() === 0) {
  try {
    process.setgroups?.([])
    process.setgid(process.env.RUN_AS_USER)
    process.setuid(process.env.RUN_AS_USER)
  } catch (e) {
    process.stderr.write(JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "could not drop privileges", detail: e.message }) + "\n")
    process.exit(1)
  }
}

let config
try {
  config = loadConfig()
} catch (e) {
  process.stderr.write(JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "config error", detail: e.message }) + "\n")
  process.exit(1)
}

const logger = createLogger({ level: config.logLevel })
const app = createApp(config, { logger })
const server = app.createServer()

server.listen(config.port, config.host, () => {
  logger.info("listening", {
    host: config.host,
    port: config.port,
    clamd: config.clamd.socket ? `unix:${config.clamd.socket}` : `${config.clamd.host}:${config.clamd.port}`,
    maxFileBytes: config.maxFileBytes,
    scanTimeoutMs: config.scanTimeoutMs,
    maxConcurrentScans: config.maxConcurrentScans,
  })
  /* Ask clamd for its version once at start, so the first scan has it. */
  void app.refreshEngine()
})

let stopping = false
function shutdown(signal) {
  if (stopping) return
  stopping = true
  logger.info("shutting down", { signal, inFlight: app.inFlight() })
  app.startDraining()
  server.close()
  server.closeIdleConnections?.()
  const deadline = Date.now() + config.shutdownGraceMs
  const tick = setInterval(() => {
    if (app.inFlight() === 0 || Date.now() >= deadline) {
      clearInterval(tick)
      if (app.inFlight() > 0) logger.warn("exiting with scans in flight", { inFlight: app.inFlight() })
      server.closeAllConnections?.()
      process.exit(0)
    }
  }, 100)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("unhandledRejection", (e) => logger.error("unhandled rejection", { detail: e instanceof Error ? e.message : String(e) }))
