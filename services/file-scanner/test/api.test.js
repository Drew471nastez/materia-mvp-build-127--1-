import { test, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { createHash } from "node:crypto"
import { Readable } from "node:stream"
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createApp } from "../src/app.js"
import { instream, ping, version, ScanError } from "../src/clamd.js"
import { loadConfig } from "../src/config.js"
import { createLogger } from "../src/log.js"
import { EICAR, startFakeClamd } from "./fake-clamd.js"

const SECRET = "s3cret-".padEnd(64, "x")
const cleanups = []
after(async () => {
  for (const fn of cleanups.reverse()) await fn()
})

async function setup({ env = {}, clamd = {} } = {}) {
  const fake = await startFakeClamd(clamd)
  const lines = []
  const config = loadConfig({
    CLAMAV_SERVICE_SECRET: SECRET,
    CLAMD_HOST: "127.0.0.1",
    CLAMD_PORT: String(fake.port),
    ...env,
  })
  const app = createApp(config, { logger: createLogger({ level: "debug", write: (l) => lines.push(l) }) })
  const server = app.createServer()
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${server.address().port}`
  const close = async () => {
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
    await fake.close()
  }
  cleanups.push(close)
  return { fake, base, lines, config, close }
}

function post(base, body, headers = {}) {
  return fetch(`${base}/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/octet-stream", ...headers },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  })
}

/** A body sent in pieces with no Content-Length (chunked). */
function chunked(parts, delayMs = 0) {
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      if (i < parts.length) controller.enqueue(parts[i++])
      else controller.close()
    },
  })
}

const opts = (fake) => ({ host: "127.0.0.1", port: fake.port, commandTimeoutMs: 1000 })

test("clamd: PING and VERSION", async () => {
  const fake = await startFakeClamd()
  cleanups.push(fake.close)
  assert.equal(await ping(opts(fake)), true)
  assert.deepEqual(await version(opts(fake)), { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-20T06:26:26.000Z" })
})

test("clamd: INSTREAM frames every chunk, hashes and counts the bytes", async () => {
  const fake = await startFakeClamd()
  cleanups.push(fake.close)
  const big = Buffer.alloc(300 * 1024, 7)
  const r = await instream(opts(fake), Readable.from([big, Buffer.from("tail")]), { maxBytes: 1e9 })
  assert.equal(r.status, "clean")
  assert.equal(r.bytes, big.length + 4)
  assert.equal(r.sha256, createHash("sha256").update(Buffer.concat([big, Buffer.from("tail")])).digest("hex"))
  assert.equal(fake.stats.streams[0].bytes, big.length + 4, "clamd received exactly the bytes sent")
  assert.ok(fake.stats.maxFrame <= 64 * 1024, "no frame is larger than 64 KB")
})

test("clamd: EICAR split across chunks is found", async () => {
  const fake = await startFakeClamd()
  cleanups.push(fake.close)
  const r = await instream(opts(fake), Readable.from([Buffer.from(EICAR.slice(0, 20)), Buffer.from(EICAR.slice(20))]), { maxBytes: 1e6 })
  assert.equal(r.status, "infected")
  assert.equal(r.threat, "Eicar-Test-Signature")
})

test("clamd: over maxBytes stops reading at once", async () => {
  const fake = await startFakeClamd()
  cleanups.push(fake.close)
  let pulled = 0
  async function* gen() {
    for (let i = 0; i < 100; i++) {
      pulled++
      yield Buffer.alloc(1000)
    }
  }
  await assert.rejects(instream(opts(fake), gen(), { maxBytes: 2500 }), (e) => e instanceof ScanError && e.code === "too_large")
  assert.ok(pulled <= 4, `read ${pulled} chunks, should stop at the third`)
})

test("clamd: its own StreamMaxLength answer comes back as too_large", async () => {
  const fake = await startFakeClamd({ streamMaxLength: 100 * 1024 })
  cleanups.push(fake.close)
  const r = await instream(opts(fake), Readable.from([Buffer.alloc(1024 * 1024)]), { maxBytes: 1e9 })
  assert.equal(r.status, "error")
  assert.equal(r.code, "too_large")
})

test("clamd: unreachable is clamd_unavailable, and a stall is aborted by the signal", async () => {
  await assert.rejects(instream({ host: "127.0.0.1", port: 1, commandTimeoutMs: 500 }, Readable.from([Buffer.from("x")]), {}), (e) => e.code === "clamd_unavailable")
  const fake = await startFakeClamd({ stall: true })
  cleanups.push(fake.close)
  const signal = AbortSignal.timeout(200)
  const t0 = Date.now()
  await assert.rejects(instream(opts(fake), Readable.from([Buffer.from("x")]), { signal }))
  assert.ok(Date.now() - t0 < 2000)
})

test("health: up with engine info, no secret needed", async () => {
  const { base } = await setup()
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.clamd.reachable, true)
  assert.equal(body.engine.version, "1.4.6")
  assert.equal(body.engine.signatures, 28129)
  assert.equal(typeof body.engine.ageHours, "number")
  assert.equal(body.limits.maxFileBytes, 1024 * 1024 * 1024)
  assert.equal(JSON.stringify(body).includes(SECRET), false)
  assert.equal(res.headers.get("cache-control"), "no-store")
})

test("health: 503 when clamd is down", async () => {
  const { base, fake } = await setup()
  await fake.close()
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 503)
  assert.equal((await res.json()).status, "down")
})

test("scan: no secret or a wrong one is 401, and repeated failures are 429", async () => {
  const { base, fake, lines } = await setup({ env: { AUTH_FAILURES_PER_MINUTE: "3" } })
  const none = await fetch(`${base}/scan`, { method: "POST", body: "hello" })
  assert.equal(none.status, 401)
  assert.equal((await none.json()).status, "error")
  const wrong = await post(base, "hello", { Authorization: "Bearer nope" })
  assert.equal(wrong.status, 401)
  await post(base, "hello", { Authorization: `Bearer ${SECRET}x` })
  const fourth = await post(base, "hello", { Authorization: "Bearer nope" })
  assert.equal(fourth.status, 429)
  assert.ok(fourth.headers.get("retry-after"))
  assert.equal(fake.stats.streams.length, 0, "nothing reached clamd")
  assert.equal(lines.join("\n").includes(SECRET), false, "the secret is never logged")
})

test("scan: clean file answers the full shape", async () => {
  const { base, lines } = await setup()
  const data = Buffer.from("just a pdf, honestly")
  const res = await post(base, data, { "X-Request-Id": "req-1" })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, "clean")
  assert.equal(body.threat, undefined)
  assert.equal(body.bytes, data.length)
  assert.equal(body.sha256, createHash("sha256").update(data).digest("hex"))
  assert.equal(typeof body.durationMs, "number")
  assert.deepEqual(body.engine, { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-20T06:26:26.000Z" })
  assert.equal(body.requestId, "req-1")
  const log = lines.map((l) => JSON.parse(l)).find((l) => l.msg === "scan")
  assert.equal(log.status, "clean")
  assert.equal(JSON.stringify(log).includes("honestly"), false, "no file contents in the logs")
})

test("scan: EICAR is infected with its threat name", async () => {
  const { base } = await setup()
  const res = await post(base, chunked([new TextEncoder().encode("padding " + EICAR.slice(0, 30)), new TextEncoder().encode(EICAR.slice(30))]))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, "infected")
  assert.equal(body.threat, "Eicar-Test-Signature")
})

test("scan: Content-Length over the limit is 413 before a byte reaches clamd", async () => {
  const { base, fake } = await setup({ env: { MAX_FILE_BYTES: "1000" } })
  const res = await post(base, Buffer.alloc(5000))
  assert.equal(res.status, 413)
  const body = await res.json()
  assert.equal(body.error, "too_large")
  assert.equal(body.maxBytes, 1000)
  assert.equal(fake.stats.streams.length, 0)
})

test("scan: a chunked stream that passes the limit is cut off with 413", async () => {
  const { base } = await setup({ env: { MAX_FILE_BYTES: "1000" } })
  const res = await post(base, chunked([new Uint8Array(600), new Uint8Array(600), new Uint8Array(600)]))
  assert.equal(res.status, 413)
  assert.equal((await res.json()).error, "too_large")
})

test("scan: multipart is 415 and an empty body is 400", async () => {
  const { base } = await setup()
  const mp = await post(base, "x", { "Content-Type": "multipart/form-data; boundary=x" })
  assert.equal(mp.status, 415)
  const empty = await post(base, new Uint8Array(0))
  assert.equal(empty.status, 400)
  assert.equal((await empty.json()).error, "empty_body")
})

test("scan: a scan that stalls past SCAN_TIMEOUT_MS is 504", async () => {
  const { base } = await setup({ env: { SCAN_TIMEOUT_MS: "1000" }, clamd: { stall: true } })
  const t0 = Date.now()
  const res = await post(base, "hello")
  assert.equal(res.status, 504)
  assert.equal((await res.json()).error, "timeout")
  assert.ok(Date.now() - t0 < 3000)
})

test("scan: a slow client is timed out too", async () => {
  const { base } = await setup({ env: { SCAN_TIMEOUT_MS: "1000" } })
  const res = await post(base, chunked([new Uint8Array(10), new Uint8Array(10), new Uint8Array(10)], 700))
  assert.equal(res.status, 504)
})

test("scan: clamd down is 503 with Retry-After", async () => {
  const { base, fake } = await setup()
  await fake.close()
  const res = await post(base, "hello")
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error, "clamd_unavailable")
  assert.ok(res.headers.get("retry-after"))
})

test("scan: clamd errors are reported as engine_error", async () => {
  const { base } = await setup({ clamd: { errorReply: "Can't allocate memory" } })
  const res = await post(base, "hello")
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.status, "error")
  assert.equal(body.error, "engine_error")
})

test("scan: past the per caller rate it is 429", async () => {
  const { base } = await setup({ env: { RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_BURST: "2" } })
  assert.equal((await post(base, "a")).status, 200)
  assert.equal((await post(base, "b")).status, 200)
  const third = await post(base, "c")
  assert.equal(third.status, 429)
  assert.ok(Number(third.headers.get("retry-after")) >= 1)
})

test("scan: more scans than slots and queue is 503 busy", async () => {
  const { base } = await setup({ env: { MAX_CONCURRENT_SCANS: "1", MAX_QUEUED_SCANS: "0" }, clamd: { delayMs: 400 } })
  const [a, b] = await Promise.all([post(base, "one"), new Promise((r) => setTimeout(r, 100)).then(() => post(base, "two"))])
  assert.equal(a.status, 200)
  assert.equal(b.status, 503)
  assert.equal((await b.json()).error, "busy")
})

test("routes: unknown path 404, wrong method 405", async () => {
  const { base } = await setup()
  assert.equal((await fetch(`${base}/nope`)).status, 404)
  assert.equal((await fetch(`${base}/scan`)).status, 405)
  assert.equal((await fetch(`${base}/health`, { method: "POST" })).status, 405)
})

test("a large file streams through without being held in memory", { skip: !existsSync("/proc/self/status") }, async () => {
  /* The API runs as its own process here, so its memory is measured apart
     from the client's and the fake clamd's. */
  const fake = await startFakeClamd({ streamMaxLength: 1024 * 1024 * 1024, discard: true })
  cleanups.push(fake.close)
  const port = 20000 + Math.floor(Math.random() * 20000)
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/server.js", import.meta.url))], {
    env: { ...process.env, CLAMAV_SERVICE_SECRET: SECRET, CLAMD_HOST: "127.0.0.1", CLAMD_PORT: String(fake.port), PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "inherit"],
  })
  cleanups.push(() => child.kill("SIGKILL"))
  await new Promise((resolve) => child.stdout.on("data", (d) => String(d).includes("listening") && resolve()))
  const rss = () => Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`, "utf8"))?.[1] ?? 0) / 1024
  const before = rss()
  let peak = before
  const sample = setInterval(() => (peak = Math.max(peak, rss())), 10)

  const size = 256 * 1024 * 1024
  let sent = 0
  const stream = new ReadableStream({
    pull(c) {
      if (sent >= size) return c.close()
      const n = Math.min(1024 * 1024, size - sent)
      sent += n
      c.enqueue(new Uint8Array(n))
    },
  })
  const res = await post(`http://127.0.0.1:${port}`, stream)
  const body = await res.json()
  clearInterval(sample)
  assert.equal(body.status, "clean")
  assert.equal(body.bytes, size)
  assert.equal(fake.stats.streams.at(-1).bytes, size)
  /* Measured at about 60 MB over the idle process. Holding the chunks until
     the verdict (the Promise.race leak this guards against) was 250 MB more. */
  assert.ok(peak - before < 150, `the API grew by ${Math.round(peak - before)} MB while streaming 256 MB`)
})
