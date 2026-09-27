import { test } from "node:test"
import assert from "node:assert/strict"

import { bearerToken, createVerifier, tokenLabel } from "../src/auth.js"
import { parseScanReply, parseVersion } from "../src/clamd.js"
import { loadConfig } from "../src/config.js"
import { createConcurrency, Busy } from "../src/limiter.js"
import { createLogger } from "../src/log.js"
import { createRateLimiter } from "../src/rate-limit.js"

const SECRET = "a".repeat(64)

test("bearer tokens are read only from a Bearer header", () => {
  assert.equal(bearerToken("Bearer abc"), "abc")
  assert.equal(bearerToken("bearer   abc  "), "abc")
  assert.equal(bearerToken("Basic abc"), null)
  assert.equal(bearerToken("Bearer "), null)
  assert.equal(bearerToken(undefined), null)
  assert.equal(bearerToken("Bearer " + "x".repeat(5000)), null)
})

test("the verifier accepts the secret and nothing else, whatever the length", () => {
  const verify = createVerifier(SECRET)
  assert.equal(verify(`Bearer ${SECRET}`), true)
  assert.equal(verify(`Bearer ${SECRET}x`), false)
  assert.equal(verify(`Bearer ${SECRET.slice(1)}`), false)
  assert.equal(verify("Bearer short"), false)
  assert.equal(verify(""), false)
  assert.equal(verify(undefined), false)
  assert.equal(verify(SECRET), false, "the raw secret without Bearer is not accepted")
  assert.throws(() => createVerifier(""))
})

test("token labels are one way and short", () => {
  const label = tokenLabel(`Bearer ${SECRET}`)
  assert.equal(label.length, 16)
  assert.ok(!SECRET.includes(label))
  assert.equal(tokenLabel(undefined), "none")
})

test("config refuses a missing or short secret, and reads limits", () => {
  assert.throws(() => loadConfig({}), /CLAMAV_SERVICE_SECRET/)
  assert.throws(() => loadConfig({ CLAMAV_SERVICE_SECRET: "short" }), /at least 32/)
  const c = loadConfig({ CLAMAV_SERVICE_SECRET: SECRET, MAX_FILE_BYTES: "1000", CLAMD_HOST: "x", TRUST_PROXY: "true" })
  assert.equal(c.maxFileBytes, 1000)
  assert.equal(c.clamd.host, "x")
  assert.equal(c.clamd.port, 3310)
  assert.equal(c.trustProxy, true)
  assert.equal(loadConfig({ CLAMAV_SERVICE_SECRET: SECRET }).maxFileBytes, 1024 * 1024 * 1024)
  assert.throws(() => loadConfig({ CLAMAV_SERVICE_SECRET: SECRET, PORT: "abc" }), /Invalid number/)
})

test("clamd version replies parse into version, signatures and date", () => {
  assert.deepEqual(parseVersion("ClamAV 1.4.6/28129/Sun Sep 20 06:26:26 2026\0"), {
    version: "1.4.6",
    signatures: 28129,
    updatedAt: "2026-09-20T06:26:26.000Z",
  })
  assert.deepEqual(parseVersion("ClamAV 1.4.6"), { version: "1.4.6", signatures: null, updatedAt: null })
  assert.equal(parseVersion("nonsense"), null)
})

test("clamd scan replies parse into clean, infected and error", () => {
  assert.deepEqual(parseScanReply("stream: OK\0"), { status: "clean" })
  assert.deepEqual(parseScanReply("1: stream: OK"), { status: "clean" })
  assert.deepEqual(parseScanReply("stream: Eicar-Test-Signature FOUND\0"), { status: "infected", threat: "Eicar-Test-Signature" })
  assert.deepEqual(parseScanReply("stream: Win.Trojan.Agent-123 FOUND"), { status: "infected", threat: "Win.Trojan.Agent-123" })
  assert.equal(parseScanReply("INSTREAM size limit exceeded. ERROR").code, "too_large")
  const err = parseScanReply("Can't allocate memory ERROR")
  assert.equal(err.status, "error")
  assert.equal(err.code, "engine_error")
  assert.equal(parseScanReply("").status, "error")
  assert.equal(parseScanReply("garbage").status, "error")
})

test("token buckets allow a burst, then refill over time", () => {
  let t = 0
  const rl = createRateLimiter({ perMinute: 60, capacity: 3, now: () => t })
  assert.ok(rl.take("a").ok)
  assert.ok(rl.take("a").ok)
  assert.ok(rl.take("a").ok)
  const no = rl.take("a")
  assert.equal(no.ok, false)
  assert.equal(no.retryAfterSec, 1)
  assert.ok(rl.take("b").ok, "another key has its own bucket")
  t += 1000
  assert.ok(rl.take("a").ok, "one token back after a second at 60 a minute")
  assert.equal(rl.take("a").ok, false)
  t += 60_000
  rl.sweep()
  assert.equal(rl.size(), 0, "full buckets are swept")
})

test("the bucket map never grows past its cap", () => {
  const rl = createRateLimiter({ perMinute: 1, capacity: 1, maxKeys: 100 })
  for (let i = 0; i < 1000; i++) rl.take(`k${i}`)
  assert.ok(rl.size() <= 100)
})

test("concurrency: a slot at a time, a queue, and busy past it", async () => {
  const c = createConcurrency({ max: 1, maxQueue: 1, timeoutMs: 50 })
  const r1 = await c.acquire()
  const waiting = c.acquire()
  await assert.rejects(c.acquire(), Busy)
  r1()
  const r2 = await waiting
  assert.equal(c.running(), 1)
  const late = c.acquire()
  await assert.rejects(late, Busy, "a wait past the timeout is busy")
  r2()
  r2()
  assert.equal(c.running(), 0, "releasing twice counts once")
})

test("logs are JSON lines and never carry secret-looking fields", () => {
  const lines = []
  const log = createLogger({ level: "info", write: (l) => lines.push(l) })
  log.debug("hidden")
  log.info("scan", { status: "clean", authorization: "Bearer x", secret: "y", bytes: 3 })
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.msg, "scan")
  assert.equal(entry.bytes, 3)
  assert.equal(entry.authorization, undefined)
  assert.equal(entry.secret, undefined)
})
