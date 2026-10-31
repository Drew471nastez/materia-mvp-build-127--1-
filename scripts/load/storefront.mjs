#!/usr/bin/env node
/**
 * A read-only load test of the public storefront. docs/operations/load-testing.md.
 *
 *   BASE_URL=https://storelib-git-x.vercel.app node scripts/load/storefront.mjs
 *   node scripts/load/storefront.mjs --base http://localhost:3100 --seconds 20 --concurrency 8
 *
 * Options (flag or environment):
 *   --base / BASE_URL           where to send requests (required)
 *   --seconds / LOAD_SECONDS    how long to run, default 30
 *   --concurrency / LOAD_CONCURRENCY   requests in flight at once, default 10, at most 50
 *   --paths / LOAD_PATHS        comma separated paths, default the list below
 *   --json                      print the result as JSON as well
 *   --i-mean-production         required to aim at storelib.com or storelib.me (--i-know-this-is-production also works)
 *
 * GET only, no cookies, no body. Nothing it asks for writes anything, so it
 * is safe against a preview deployment that shares production's database.
 * It still costs function time and CDN bandwidth: keep runs short.
 *
 * Reports, overall and per path: requests, p50, p95 and p99 latency (to the
 * full body), the error rate (network failure or status >= 500; a 404 is an
 * answer, counted on its own), and the share of answers Vercel's CDN served
 * from cache (`x-vercel-cache` HIT or STALE, of those that carried it).
 */

import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const DEFAULT_PATHS = ["/", "/pricing", "/explore", "/features", "/robots.txt", "/sitemap.xml"]
const MAX_CONCURRENCY = 50
const MAX_SECONDS = 600
const TIMEOUT_MS = 15_000

function option(name, envName, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1]
  return process.env[envName] ?? fallback
}

/** Refuses production unless asked in so many words. Exported for the test suite. */
export function refuseTarget(base, iMeanProduction) {
  let url
  try {
    url = new URL(base)
  } catch {
    return `BASE_URL is not an address: ${base}`
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return `BASE_URL must be http or https: ${base}`
  const host = url.hostname.toLowerCase()
  const isProduction = ["storelib.com", "storelib.me"].some((d) => host === d || host.endsWith(`.${d}`))
  if (isProduction && !iMeanProduction) return `${host} is production. Aim at a preview deployment, or pass --i-mean-production if you really mean it.`
  return null
}

export function clampConcurrency(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v < 1) return 1
  return Math.min(v, MAX_CONCURRENCY)
}

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted, p) {
  if (!sorted.length) return null
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

export function summarise(results) {
  const ms = results.filter((r) => r.ms !== null).map((r) => r.ms).sort((a, b) => a - b)
  const errors = results.filter((r) => r.error || r.status >= 500).length
  const notFound = results.filter((r) => r.status === 404).length
  const withCache = results.filter((r) => r.cache)
  const hits = withCache.filter((r) => r.cache === "HIT" || r.cache === "STALE" || r.cache === "PRERENDER").length
  const round = (v) => (v === null ? null : Math.round(v))
  return {
    requests: results.length,
    p50: round(percentile(ms, 50)),
    p95: round(percentile(ms, 95)),
    p99: round(percentile(ms, 99)),
    errorRate: results.length ? errors / results.length : 0,
    errors,
    notFound,
    cacheHeaderSeen: withCache.length,
    cacheHitRatio: withCache.length ? hits / withCache.length : null,
  }
}

async function hit(base, path) {
  const started = performance.now()
  try {
    const res = await fetch(new URL(path, base), {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "storelib-load-test/1", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await res.arrayBuffer()
    return { path, status: res.status, ms: performance.now() - started, cache: res.headers.get("x-vercel-cache"), error: null }
  } catch (e) {
    return { path, status: 0, ms: null, cache: null, error: e instanceof Error ? e.name : "error" }
  }
}

async function main() {
  const base = option("base", "BASE_URL", "")
  if (!base) {
    console.error("storefront load: set BASE_URL or pass --base")
    process.exit(2)
  }
  const refusal = refuseTarget(base, process.argv.includes("--i-mean-production") || process.argv.includes("--i-know-this-is-production"))
  if (refusal) {
    console.error(`storefront load: ${refusal}`)
    process.exit(2)
  }
  const seconds = Math.min(MAX_SECONDS, Math.max(1, Number(option("seconds", "LOAD_SECONDS", "30")) || 30))
  const asked = option("concurrency", "LOAD_CONCURRENCY", "10")
  const concurrency = clampConcurrency(asked)
  if (Number(asked) > MAX_CONCURRENCY) console.warn(`storefront load: concurrency capped at ${MAX_CONCURRENCY}`)
  const paths = String(option("paths", "LOAD_PATHS", DEFAULT_PATHS.join(",")))
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`))

  console.log(`storefront load: ${base}, ${paths.length} paths, ${concurrency} at once, ${seconds} s`)
  const results = []
  const until = Date.now() + seconds * 1000
  let next = 0
  const worker = async () => {
    while (Date.now() < until) {
      const path = paths[next++ % paths.length]
      results.push(await hit(base, path))
    }
  }
  const started = Date.now()
  await Promise.all(Array.from({ length: concurrency }, worker))
  const elapsed = (Date.now() - started) / 1000

  const all = summarise(results)
  const perPath = paths.map((p) => ({ path: p, ...summarise(results.filter((r) => r.path === p)) }))
  const pct = (v) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`)
  const fmt = (s) => `p50 ${s.p50 ?? "-"} ms  p95 ${s.p95 ?? "-"} ms  p99 ${s.p99 ?? "-"} ms  errors ${pct(s.errorRate)}  cache hits ${pct(s.cacheHitRatio)}`

  console.log(`\n${all.requests} requests in ${elapsed.toFixed(1)} s (${(all.requests / elapsed).toFixed(1)} per second)`)
  console.log(`all    ${fmt(all)}`)
  for (const p of perPath) console.log(`  ${p.path.padEnd(28)} ${String(p.requests).padStart(6)}  ${fmt(p)}${p.notFound ? `  (${p.notFound} not found)` : ""}`)
  if (all.cacheHeaderSeen === 0) console.log("\nNo x-vercel-cache header seen: this is not a Vercel deployment, so the cache ratio is not measured.")
  const errorsByKind = {}
  for (const r of results) if (r.error || r.status >= 500) errorsByKind[r.error ?? r.status] = (errorsByKind[r.error ?? r.status] ?? 0) + 1
  if (Object.keys(errorsByKind).length) console.log(`errors by kind: ${JSON.stringify(errorsByKind)}`)
  if (process.argv.includes("--json")) console.log(JSON.stringify({ base, seconds: elapsed, concurrency, all, perPath, errorsByKind }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
