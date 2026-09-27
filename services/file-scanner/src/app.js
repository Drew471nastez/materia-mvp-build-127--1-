import http from "node:http"
import { randomUUID } from "node:crypto"

import { createVerifier, tokenLabel } from "./auth.js"
import { ScanError, instream, ping, version } from "./clamd.js"
import { Busy, createConcurrency } from "./limiter.js"
import { createRateLimiter } from "./rate-limit.js"
import { silentLogger } from "./log.js"

/**
 * ===========================================================================
 *  THE HTTP API
 * ===========================================================================
 *   GET  /health   No secret. Is the API up, does clamd answer PING, and how
 *                  old are its signatures. 200 when scanning works, 503 when
 *                  it does not. Says nothing a stranger could use.
 *   POST /scan     Bearer secret. The request body is the file, raw
 *                  (application/octet-stream), streamed to clamd as it
 *                  arrives. Nothing is written to disk.
 *
 * Every /scan answer is JSON of one shape:
 *
 *   { status: "clean" | "infected" | "error", threat?, sha256, bytes,
 *     durationMs, engine: { version, signatures, updatedAt }, requestId,
 *     error?, message? }
 *
 * "clean" and "infected" are both a scan that worked (HTTP 200). "error" is a
 * scan that did not happen, with an HTTP status that says why: 400 bad
 * request, 401 wrong secret, 413 too large, 415 multipart, 429 too many,
 * 503 clamd down or busy, 504 too slow.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/

export function createApp(config, { logger = silentLogger, now = () => Date.now() } = {}) {
  const verify = createVerifier(config.secret)
  const scanLimiter = createRateLimiter({ perMinute: config.rateLimit.perMinute, capacity: config.rateLimit.burst, now })
  const authFailLimiter = createRateLimiter({
    perMinute: config.rateLimit.authFailuresPerMinute,
    capacity: config.rateLimit.authFailuresPerMinute,
    now,
  })
  const healthLimiter = createRateLimiter({ perMinute: config.rateLimit.healthPerMinute, capacity: config.rateLimit.healthPerMinute, now })
  const slots = createConcurrency({
    max: config.maxConcurrentScans,
    maxQueue: config.maxQueuedScans,
    timeoutMs: config.queueTimeoutMs,
  })
  const startedAt = now()
  let draining = false
  let inFlight = 0

  /* The engine's version and signature date, asked of clamd at most once a minute. */
  let engine = null
  let engineAt = 0
  let engineLoading = null
  function refreshEngine() {
    if (engineLoading) return engineLoading
    engineLoading = version(config.clamd)
      .then((v) => {
        if (v) {
          engine = v
          engineAt = now()
        }
        return engine
      })
      .catch(() => engine)
      .finally(() => {
        engineLoading = null
      })
    return engineLoading
  }
  async function engineInfo({ wait = false } = {}) {
    if (!engine || now() - engineAt > 60_000) {
      const p = refreshEngine()
      if (wait || !engine) await p
    }
    return engine ? { version: engine.version, signatures: engine.signatures, updatedAt: engine.updatedAt } : null
  }

  function clientIp(req) {
    if (config.trustProxy) {
      const fwd = req.headers["x-forwarded-for"]
      const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : ""
      if (first && first.length <= 64) return first
    }
    return req.socket.remoteAddress || "unknown"
  }

  function send(res, status, body, extraHeaders = {}) {
    if (res.headersSent) return
    const text = JSON.stringify(body)
    res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders, "Content-Length": Buffer.byteLength(text) })
    res.end(text)
  }

  function sendError(res, status, error, message, extra = {}, headers = {}) {
    send(res, status, { status: "error", error, message, ...extra }, headers)
  }

  async function health(req, res, ip) {
    const limited = healthLimiter.take(`health:${ip}`)
    if (!limited.ok) return sendError(res, 429, "rate_limited", "Too many requests", {}, { "Retry-After": String(limited.retryAfterSec) })
    const t0 = now()
    let reachable = false
    try {
      reachable = await ping(config.clamd, { timeoutMs: Math.min(config.clamd.commandTimeoutMs, 3000) })
    } catch {
      reachable = false
    }
    const latencyMs = now() - t0
    const info = reachable ? await engineInfo({ wait: true }) : engine
    const ageHours = info?.updatedAt ? Math.max(0, (now() - Date.parse(info.updatedAt)) / 3_600_000) : null
    const stale = ageHours !== null && ageHours > config.maxSignatureAgeHours
    const status = draining ? "draining" : !reachable ? "down" : stale ? "degraded" : "ok"
    const body = {
      status,
      clamd: { reachable, latencyMs },
      engine: info ? { ...info, ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10 } : null,
      limits: { maxFileBytes: config.maxFileBytes, scanTimeoutMs: config.scanTimeoutMs },
      scans: { running: slots.running(), waiting: slots.waiting() },
      uptimeSec: Math.round((now() - startedAt) / 1000),
    }
    if (req.method === "HEAD") {
      res.writeHead(status === "ok" || status === "degraded" ? 200 : 503, JSON_HEADERS)
      return res.end()
    }
    send(res, status === "ok" || status === "degraded" ? 200 : 503, body)
  }

  async function scan(req, res, ip, requestId) {
    const t0 = now()
    const auth = req.headers.authorization

    if (!verify(auth)) {
      const limited = authFailLimiter.take(`auth:${ip}`)
      logger.warn("scan refused", { requestId, ip, reason: "bad_secret" })
      if (!limited.ok) return sendError(res, 429, "rate_limited", "Too many failed attempts", {}, { "Retry-After": String(limited.retryAfterSec), Connection: "close" })
      return sendError(res, 401, "unauthorized", "Missing or wrong bearer secret", {}, { "WWW-Authenticate": "Bearer", Connection: "close" })
    }

    const limited = scanLimiter.take(`scan:${tokenLabel(auth)}:${ip}`)
    if (!limited.ok) {
      logger.warn("scan refused", { requestId, ip, reason: "rate_limited" })
      return sendError(res, 429, "rate_limited", "Too many scans, slow down", {}, { "Retry-After": String(limited.retryAfterSec), Connection: "close" })
    }

    const type = String(req.headers["content-type"] || "").toLowerCase()
    if (type.startsWith("multipart/")) {
      return sendError(res, 415, "unsupported_media_type", "Send the file as the raw request body (application/octet-stream), not multipart", {}, { Connection: "close" })
    }

    const declared = req.headers["content-length"]
    const hasLength = declared !== undefined
    const length = hasLength ? Number(declared) : null
    if (hasLength && (!Number.isFinite(length) || length < 0)) {
      return sendError(res, 400, "bad_request", "Invalid Content-Length", {}, { Connection: "close" })
    }
    if (length !== null && length > config.maxFileBytes) {
      logger.info("scan refused", { requestId, ip, reason: "too_large", declaredBytes: length })
      return sendError(res, 413, "too_large", `The file is over the ${config.maxFileBytes} byte limit`, { maxBytes: config.maxFileBytes }, { Connection: "close" })
    }
    if (length === 0 || (!hasLength && !req.headers["transfer-encoding"])) {
      return sendError(res, 400, "empty_body", "The request body is the file to scan, and it is empty")
    }

    let release
    try {
      release = await slots.acquire()
    } catch (e) {
      if (e instanceof Busy) {
        logger.warn("scan refused", { requestId, ip, reason: "busy" })
        return sendError(res, 503, "busy", "The scanner is busy, try again shortly", {}, { "Retry-After": "5", Connection: "close" })
      }
      throw e
    }

    inFlight++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new ScanError("timeout", "The scan took too long")), config.scanTimeoutMs)
    /* A caller that hangs up mid upload ends the scan, and clamd's connection with it. */
    const onClose = () => {
      if (!res.writableEnded) controller.abort(new ScanError("client_error", "The client went away"))
    }
    res.on("close", onClose)
    try {
      const info = engineInfo()
      /* destroyOnReturn: false, so stopping early does not tear down the socket this answer goes out on. */
      const result = await instream(config.clamd, req.iterator({ destroyOnReturn: false }), {
        maxBytes: config.maxFileBytes,
        signal: controller.signal,
      })
      const durationMs = now() - t0
      const engineNow = await info
      if (result.status === "error") {
        const status = result.code === "too_large" ? 413 : 502
        logger.warn("scan failed", { requestId, ip, error: result.code, bytes: result.bytes, durationMs })
        return sendError(res, status, result.code, result.message, { bytes: result.bytes, durationMs, engine: engineNow, requestId }, { Connection: "close" })
      }
      const body = {
        status: result.status,
        ...(result.threat ? { threat: result.threat } : {}),
        sha256: result.sha256,
        bytes: result.bytes,
        durationMs,
        engine: engineNow,
        requestId,
      }
      logger.info("scan", {
        requestId,
        ip,
        status: result.status,
        threat: result.threat,
        bytes: result.bytes,
        sha256: result.sha256,
        durationMs,
        signatures: engineNow?.signatures ?? null,
      })
      send(res, 200, body)
    } catch (e) {
      const durationMs = now() - t0
      const code = e instanceof ScanError ? e.code : "internal_error"
      const status =
        code === "too_large" ? 413 : code === "timeout" ? 504 : code === "clamd_unavailable" ? 503 : code === "client_error" || code === "aborted" ? 400 : 500
      const message =
        code === "internal_error" ? "The scan failed" : e.message
      ;(code === "internal_error" ? logger.error : logger.warn)("scan failed", { requestId, ip, error: code, detail: code === "internal_error" ? e.message : undefined, durationMs })
      if (!res.destroyed) {
        sendError(
          res,
          status,
          code,
          message,
          { durationMs, requestId, ...(code === "too_large" ? { maxBytes: config.maxFileBytes } : {}) },
          { Connection: "close", ...(status === 503 ? { "Retry-After": "10" } : {}) },
        )
      }
    } finally {
      clearTimeout(timer)
      res.off("close", onClose)
      release()
      inFlight--
      /* Whatever of the body was not read is not wanted: close once the answer is out. */
      if (!req.readableEnded) {
        if (res.writableFinished) req.destroy()
        else res.once("finish", () => req.destroy())
      }
    }
  }

  async function handle(req, res) {
    const incoming = req.headers["x-request-id"]
    const requestId = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader("X-Request-Id", requestId)
    const ip = clientIp(req)
    const path = (req.url || "/").split("?")[0]

    try {
      if (path === "/health" || path === "/healthz") {
        if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "method_not_allowed", "Use GET", {}, { Allow: "GET, HEAD" })
        return await health(req, res, ip)
      }
      if (path === "/scan") {
        if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "Use POST", {}, { Allow: "POST" })
        if (draining) return sendError(res, 503, "shutting_down", "The scanner is restarting, try again", {}, { "Retry-After": "5", Connection: "close" })
        return await scan(req, res, ip, requestId)
      }
      return sendError(res, 404, "not_found", "Not found")
    } catch (e) {
      logger.error("request failed", { requestId, path, detail: e instanceof Error ? e.message : String(e) })
      if (!res.headersSent) sendError(res, 500, "internal_error", "Something went wrong")
      else res.destroy()
    }
  }

  function createServer() {
    const server = http.createServer({ requestTimeout: config.scanTimeoutMs + 15_000, headersTimeout: 15_000 }, (req, res) => {
      void handle(req, res)
    })
    server.keepAliveTimeout = 5_000
    server.maxHeadersCount = 50
    return server
  }

  return {
    handle,
    createServer,
    startDraining: () => {
      draining = true
    },
    inFlight: () => inFlight,
    refreshEngine,
  }
}
