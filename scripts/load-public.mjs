#!/usr/bin/env node
/**
 * ===========================================================================
 *  ANONYMOUS TRAFFIC ON A LOCAL PRODUCTION BUILD, THEN A DATABASE THAT IS
 *  SLOW, THEN ONE THAT IS DOWN, THEN BACK (round rel2-db)
 * ===========================================================================
 * A LOCAL, SINGLE PROCESS MEASUREMENT. One `next start` on this machine reads
 * the Supabase stub (scripts/supabase-stub-server.mjs) in this same process,
 * with the rows of scripts/load/local-fixture.mjs. No CDN, no Vercel, no
 * network to a database, no real Postgres: it shows what one server process
 * does per page and how it behaves when its database is slow or refuses. It
 * is not production capacity and says nothing about Vercel's concurrency.
 *
 * What it loads, each at every level for --seconds:
 *
 *   onepage   /l/<handle>, a published OnePage
 *   product   /<handle>/<product>, a product page
 *   explore   /explore, with Explore switched on in the fixture
 *   track     POST /api/track-view, one page view per request from a new
 *             visitor address each time (no rate limit is hit by design)
 *   app       /app/products, signed in as the fixture's creator
 *
 * Then, at --degraded-levels: every database answer 3 s late, then every
 * answer a 503, then the stub back to normal ("recovered").
 *
 * 1. Build pointed at the stub, with the stub running (static pages read it
 *    at build time):
 *
 *      node scripts/load-public.mjs --stub &              # serves 127.0.0.1:54391
 *      NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *
 * 2. Run (starts the stub and `next start` itself):
 *
 *      node scripts/load-public.mjs --seconds 20 --levels 50,200 --json /tmp/load.json
 *
 * Options: --dir (default .), --port (3994), --stub-port (54391), --seconds
 * (20, at most 120), --levels (50,200, each at most 400), --degraded-levels
 * (50), --targets (all), --phases (normal,slow,down,recovered), --slow-ms
 * (3000), --json FILE. Local only: the base is always http://127.0.0.1.
 *
 * Reports per phase, target and level: requests, throughput, p50/p95/p99/max
 * to the last byte, errors (network, timeout, status >= 500), the share of
 * answers that were the page itself (its own words in a 200), statuses, the
 * database requests per second the stub answered while it ran, and the
 * server's resident memory at its peak.
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { fixtureTables, BENCH_PATHS, CREATOR, HANDLE, USER, products } from "./load/local-fixture.mjs"
import { percentile } from "./load/storefront.mjs"

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback
}
const list = (v) => String(v).split(",").map((s) => s.trim()).filter(Boolean)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STUB_PORT = Number(opt("stub-port", 54391))

/** The fixture's creator as Supabase Auth answers for them. */
export const SIGNED_IN = { id: USER, aud: "authenticated", role: "authenticated", email: "satori@example.com", email_confirmed_at: "2026-10-01T10:00:00.000Z", app_metadata: { provider: "email" }, user_metadata: { full_name: "Satori Studio" }, created_at: "2026-10-01T10:00:00.000Z", updated_at: "2026-10-01T10:00:00.000Z" }

/** What each target sends. `visitor` is a number unique to the request. */
export const TARGETS = {
  onepage: { path: `/l/${HANDLE}`, mark: "Satori Studio" },
  product: { path: BENCH_PATHS.product, mark: products[0].title },
  explore: { path: BENCH_PATHS.explore, mark: products[0].title },
  track: {
    path: "/api/track-view",
    method: "POST",
    body: (visitor) => JSON.stringify({ creatorId: CREATOR, productId: products[0].id, sessionId: `s-${visitor}`, visitorId: `v-${visitor}`, referrerDomain: "Direct", pageUrl: `/${HANDLE}/${products[0].slug}`, deviceType: "desktop", browser: "Chrome", os: "Linux", screenWidth: 1440, screenHeight: 900, language: "en", pageTitle: "Loop Pack 1" }),
  },
  app: { path: "/app/products", signedIn: true, mark: products[0].title },
}

/* ── Memory of a process and everything it started, from /proc (Linux) ── */
function treeRssMb(rootPid) {
  try {
    const kids = new Map()
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue
      try {
        const stat = readFileSync(`/proc/${d}/stat`, "utf8")
        const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1])
        if (!kids.has(ppid)) kids.set(ppid, [])
        kids.get(ppid).push(Number(d))
      } catch {
        /* gone */
      }
    }
    let kb = 0
    const walk = (pid) => {
      try {
        const m = readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)
        if (m) kb += Number(m[1])
      } catch {
        /* gone */
      }
      for (const k of kids.get(pid) ?? []) walk(k)
    }
    walk(rootPid)
    return Math.round(kb / 1024)
  } catch {
    return null
  }
}

let visitorSeq = 0
/** A visitor address from the documentation range, different for each request, so the per address limit on page views is never what is measured. */
const visitorIp = (n) => `198.51.${(n >> 8) & 255}.${n & 255}`

/** Requests at a fixed number in flight for `seconds`; every answer read to its last byte. */
export async function hammer(base, target, { concurrency, seconds, cookie = null, timeoutMs = 30_000 }) {
  const until = Date.now() + seconds * 1000
  const times = []
  let errors = 0
  let shown = 0
  const statuses = {}
  const worker = async () => {
    while (Date.now() < until) {
      const n = ++visitorSeq
      const headers = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", accept: "text/html,*/*", "x-forwarded-for": visitorIp(n) }
      if (target.method === "POST") Object.assign(headers, { "content-type": "application/json", origin: base, referer: `${base}${TARGETS.product.path}`, "sec-fetch-site": "same-origin" })
      if (target.signedIn && cookie) headers.cookie = `${cookie.name}=${cookie.value}`
      const t0 = performance.now()
      try {
        const res = await fetch(`${base}${target.path}`, { method: target.method ?? "GET", body: target.body ? target.body(n) : undefined, redirect: "manual", headers, signal: AbortSignal.timeout(timeoutMs) })
        /* A 200 is not the page: an error screen answers 200 too. `shown` counts the answers that carry the page's own words. */
        if (target.mark) {
          if (res.status === 200 && (await res.text()).includes(target.mark)) shown++
        } else await res.arrayBuffer()
        statuses[res.status] = (statuses[res.status] ?? 0) + 1
        if (res.status >= 500) errors++
      } catch (e) {
        errors++
        const kind = e?.name === "TimeoutError" ? "timeout" : "network"
        statuses[kind] = (statuses[kind] ?? 0) + 1
      }
      times.push(performance.now() - t0)
    }
  }
  const t0 = Date.now()
  await Promise.all(Array.from({ length: concurrency }, worker))
  const wall = (Date.now() - t0) / 1000
  const sorted = [...times].sort((a, b) => a - b)
  return {
    requests: times.length,
    wall: Math.round(wall * 10) / 10,
    rps: Math.round((times.length / wall) * 10) / 10,
    p50: Math.round(percentile(sorted, 50) ?? 0),
    p95: Math.round(percentile(sorted, 95) ?? 0),
    p99: Math.round(percentile(sorted, 99) ?? 0),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    errors,
    errorRate: times.length ? Math.round((errors / times.length) * 1000) / 10 : 0,
    /* The share of answers that were the real page (null where there is no page, as for a beacon). */
    shownRate: target.mark ? (times.length ? Math.round((shown / times.length) * 1000) / 10 : 0) : null,
    statuses,
  }
}

async function main() {
  const tables = fixtureTables()
  const stub = await serveSupabaseStub({ port: STUB_PORT, tables, users: [SIGNED_IN], controlPath: "/__stub", keepLog: false })
  if (argv.includes("--stub")) {
    console.log(`stub: http://127.0.0.1:${STUB_PORT} (Ctrl+C to stop)`)
    return
  }
  const dir = resolve(opt("dir", "."))
  if (!existsSync(join(dir, ".next/BUILD_ID"))) {
    console.error(`No production build in ${dir}. Build it pointed at the stub first (see the top of this file).`)
    process.exit(1)
  }
  const port = Number(opt("port", 3994))
  const base = `http://127.0.0.1:${port}`
  const seconds = Math.min(120, Math.max(1, Number(opt("seconds", 20))))
  const levels = list(opt("levels", "50,200")).map((n) => Math.min(400, Math.max(1, Number(n))))
  const degradedLevels = list(opt("degraded-levels", "50")).map((n) => Math.min(400, Math.max(1, Number(n))))
  const names = list(opt("targets", Object.keys(TARGETS).join(","))).filter((n) => TARGETS[n])
  const phases = list(opt("phases", "normal,slow,down,recovered"))
  const slowMs = Number(opt("slow-ms", 3000))
  const SETTINGS = { normal: { delayMs: 0, failStatus: null }, slow: { delayMs: slowMs, failStatus: null }, down: { delayMs: 0, failStatus: 503 }, recovered: { delayMs: 0, failStatus: null } }

  const env = {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_PUBLIC_SITE_URL: base,
  }
  const next = spawn(process.execPath, [join(dir, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  next.stdout.on("data", (d) => { out = (out + d).slice(-200_000) })
  next.stderr.on("data", (d) => { out = (out + d).slice(-200_000) })
  process.on("exit", () => {
    try { next.kill("SIGKILL") } catch { /* gone */ }
  })
  let up = false
  for (let i = 0; i < 300 && !up; i++) {
    try { up = (await fetch(`${base}/robots.txt`)).status < 500 } catch { await sleep(200) }
  }
  if (!up) { console.error(`next start did not come up\n${out.slice(-2000)}`); process.exit(1) }
  const cookie = stub.sessionCookie(USER)

  /* What each page renders on a healthy database, so a run of fast error screens is not read as a fast page. */
  const proof = {}
  for (const name of names) {
    const t = TARGETS[name]
    const headers = { "user-agent": "Mozilla/5.0 Chrome/130.0", "x-forwarded-for": "198.51.100.1", ...(t.signedIn ? { cookie: `${cookie.name}=${cookie.value}` } : {}), ...(t.method === "POST" ? { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" } : {}) }
    for (let i = 0; i < 3; i++) await fetch(`${base}${t.path}`, { method: t.method ?? "GET", body: t.body ? t.body(0) : undefined, headers, redirect: "manual" }).then((r) => r.arrayBuffer()).catch(() => {})
    const res = await fetch(`${base}${t.path}`, { method: t.method ?? "GET", body: t.body ? t.body(0) : undefined, headers, redirect: "manual" })
    const html = await res.text()
    const mark = t.mark
    proof[name] = { status: res.status, bytes: html.length, shows: mark ? html.includes(mark) : res.status === 204, location: res.headers.get("location") }
    console.log(`proof  ${name.padEnd(8)} ${res.status} ${html.length} bytes, ${mark ? `shows "${mark}": ${proof[name].shows}` : `answers ${res.status}`}${proof[name].location ? `, to ${proof[name].location}` : ""}`)
  }

  const rows = []
  for (const phase of phases) {
    const setting = SETTINGS[phase]
    if (!setting) continue
    stub.control.set(setting)
    const at = phase === "normal" ? levels : degradedLevels
    console.log(`\n== ${phase}: database ${setting.failStatus ? `answers ${setting.failStatus}` : setting.delayMs ? `answers ${setting.delayMs} ms late` : "answers at once"}`)
    for (const name of names) {
      for (const concurrency of at) {
        let peak = 0
        const sampler = setInterval(() => { peak = Math.max(peak, treeRssMb(next.pid) ?? 0) }, 500)
        const before = stub.control.requests()
        const r = await hammer(base, TARGETS[name], { concurrency, seconds, cookie })
        clearInterval(sampler)
        const dbRequests = stub.control.requests() - before
        const row = { phase, target: name, path: TARGETS[name].path, concurrency, ...r, dbRequests, dbPerSecond: Math.round((dbRequests / r.wall) * 10) / 10, dbPerRequest: r.requests ? Math.round((dbRequests / r.requests) * 10) / 10 : 0, peakRssMb: peak }
        rows.push(row)
        console.log(`${phase.padEnd(9)} ${name.padEnd(8)} c=${String(concurrency).padEnd(4)} ${String(r.requests).padStart(6)} req ${String(r.rps).padStart(7)}/s  p50 ${String(r.p50).padStart(6)}  p95 ${String(r.p95).padStart(6)}  p99 ${String(r.p99).padStart(6)}  max ${String(r.max).padStart(6)} ms  err ${r.errors} (${r.errorRate}%)  page ${r.shownRate === null ? "-" : `${r.shownRate}%`}  db ${row.dbPerSecond}/s (${row.dbPerRequest}/req)  rss ${peak} MB  ${JSON.stringify(r.statuses)}`)
        /* Let the server finish what the run left in flight before the next one is measured. */
        stub.control.set({ delayMs: 0, failStatus: null })
        await sleep(2000)
        stub.control.set(setting)
      }
    }
  }
  stub.control.set(SETTINGS.normal)
  const json = opt("json", null)
  if (json) writeFileSync(json, JSON.stringify({ measuredAt: new Date().toISOString(), note: "local, single next start process, stub database in the same process: not production capacity", seconds, proof, rows }, null, 2))
  next.kill("SIGINT")
  await new Promise((r) => { next.once("exit", r); setTimeout(r, 8000) })
  stub.server.close()
  if (argv.includes("--show-errors")) console.log(out.slice(-6000))
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
