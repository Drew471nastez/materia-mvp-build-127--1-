#!/usr/bin/env node
/**
 * ===========================================================================
 *  A LOAD TEST OF A LOCAL PRODUCTION BUILD, WITH A DATABASE THAT ANSWERS
 * ===========================================================================
 * There is no staging. This measures the server's own cost per page: a
 * production build (`pnpm build`, `next start`) on this machine, reading the
 * Supabase stub (scripts/supabase-stub-server.mjs) with the rows in
 * scripts/load/local-fixture.mjs, so pages render real markup instead of
 * their error screens. No CDN, no network to a database: a floor for the
 * server, not a forecast for Vercel. docs/operations/load-testing.md.
 *
 * 1. Build pointed at the stub, with the stub running (static pages are
 *    rendered at build time and read it then):
 *
 *      node scripts/load/local-bench.mjs --stub &       # serves 127.0.0.1:54391
 *      NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *
 * 2. Run the matrix (starts the stub and `next start` itself):
 *
 *      node scripts/load/local-bench.mjs --dir . --seconds 20 --levels 10,50,100
 *      node scripts/load/local-bench.mjs --pages home,product --cpu-prof /tmp/prof   # .cpuprofile per process
 *
 * Options: --dir (the built checkout, default .), --port (default 3993),
 * --stub-port (default 54391), --seconds (default 20, at most 120),
 * --levels (in flight, default 10,50,100, each at most 200), --pages (names
 * from BENCH_PATHS, default all), --json FILE, --cpu-prof DIR.
 *
 * Local only: the base is always http://127.0.0.1. For a preview deployment
 * use scripts/load/scenarios.mjs (--pages), never this.
 *
 * Reports per page and level: requests, throughput, p50/p95/p99 to the last
 * byte, errors (network, timeout, status >= 500), the share of 200s, and the
 * server's resident memory (whole process tree, sampled every 500ms: peak).
 */
import { spawn } from "node:child_process"
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { serveSupabaseStub } from "../supabase-stub-server.mjs"
import { fixtureTables, BENCH_PATHS } from "./local-fixture.mjs"
import { percentile } from "./storefront.mjs"

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STUB_PORT = Number(opt("stub-port", 54391))

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

/** Requests at a fixed number in flight for `seconds`; every answer read to its last byte. */
export async function hammer(url, { concurrency, seconds, timeoutMs = 15_000 }) {
  const until = Date.now() + seconds * 1000
  const times = []
  let errors = 0
  let ok = 0
  const statuses = {}
  const worker = async () => {
    while (Date.now() < until) {
      const t0 = performance.now()
      try {
        const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "storelib-local-bench/1", accept: "text/html,*/*" }, signal: AbortSignal.timeout(timeoutMs) })
        await res.arrayBuffer()
        statuses[res.status] = (statuses[res.status] ?? 0) + 1
        if (res.status >= 500) errors++
        if (res.status === 200) ok++
      } catch {
        errors++
        statuses.network = (statuses.network ?? 0) + 1
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
    rps: Math.round((times.length / wall) * 10) / 10,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    errorRate: times.length ? Math.round((errors / times.length) * 1000) / 10 : 0,
    ok200: times.length ? Math.round((ok / times.length) * 1000) / 10 : 0,
    statuses,
  }
}

async function main() {
  const tables = fixtureTables()
  const stub = await serveSupabaseStub({ port: STUB_PORT, tables })
  if (argv.includes("--stub")) {
    console.log(`stub: http://127.0.0.1:${STUB_PORT} (Ctrl+C to stop)`)
    return
  }
  const dir = resolve(opt("dir", "."))
  if (!existsSync(join(dir, ".next/BUILD_ID"))) {
    console.error(`No production build in ${dir}. Build it pointed at the stub first (see the top of this file).`)
    process.exit(1)
  }
  const port = Number(opt("port", 3993))
  const base = `http://127.0.0.1:${port}`
  const seconds = Math.min(120, Math.max(1, Number(opt("seconds", 20))))
  const levels = String(opt("levels", "10,50,100")).split(",").map((n) => Math.min(200, Math.max(1, Number(n))))
  const names = String(opt("pages", Object.keys(BENCH_PATHS).join(","))).split(",").filter((n) => BENCH_PATHS[n])
  const prof = opt("cpu-prof", null)
  if (prof) mkdirSync(prof, { recursive: true })

  const env = {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
    ...(prof ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --cpu-prof --cpu-prof-dir=${resolve(prof)}`.trim() } : {}),
  }
  const next = spawn(process.execPath, [join(dir, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  next.stdout.on("data", (d) => { out += d })
  next.stderr.on("data", (d) => { out += d })
  const stop = () => {
    try { next.kill("SIGINT") } catch { /* gone */ }
    stub.server.close()
  }
  process.on("exit", stop)
  let up = false
  for (let i = 0; i < 300 && !up; i++) {
    try { up = (await fetch(`${base}/robots.txt`)).status < 500 } catch { await sleep(200) }
  }
  if (!up) { console.error(`next start did not come up\n${out.slice(-2000)}`); process.exit(1) }

  const rows = []
  for (const name of names) {
    const url = `${base}${BENCH_PATHS[name]}`
    /* Warm: the first render of a page compiles nothing in production, but fills caches the steady state has. */
    for (let i = 0; i < 3; i++) await fetch(url).then((r) => r.arrayBuffer()).catch(() => {})
    for (const concurrency of levels) {
      let peak = 0
      const sampler = setInterval(() => { peak = Math.max(peak, treeRssMb(next.pid) ?? 0) }, 500)
      const r = await hammer(url, { concurrency, seconds })
      clearInterval(sampler)
      const row = { page: name, path: BENCH_PATHS[name], concurrency, ...r, peakRssMb: peak }
      rows.push(row)
      console.log(`${name.padEnd(8)} c=${String(concurrency).padEnd(4)} ${String(r.requests).padStart(6)} req  ${String(r.rps).padStart(7)}/s  p50 ${String(r.p50).padStart(5)}  p95 ${String(r.p95).padStart(5)}  p99 ${String(r.p99).padStart(5)} ms  err ${r.errorRate}%  200s ${r.ok200}%  rss ${peak} MB  ${JSON.stringify(r.statuses)}`)
      await sleep(1000)
    }
  }
  const json = opt("json", null)
  if (json) writeFileSync(json, JSON.stringify({ measuredAt: new Date().toISOString(), seconds, rows, dbRequests: stub.log.length }, null, 2))
  next.kill("SIGINT")
  /* --cpu-prof writes its file as the process exits on a signal it handles. */
  await new Promise((r) => { next.once("exit", r); setTimeout(r, 8000) })
  stub.server.close()
  if (/Error|error/.test(out) && argv.includes("--show-errors")) console.log(out.slice(-4000))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
