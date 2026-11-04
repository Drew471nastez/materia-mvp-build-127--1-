#!/usr/bin/env node
/**
 * A load test of the paths visitors and buyers take, for a STAGING deployment
 * (a Vercel preview on a staging Supabase project and Stripe test keys).
 * docs/operations/load-testing.md, "The key paths".
 *
 *   node scripts/load/scenarios.mjs --base http://localhost:3100 --creator demo --seconds 20 --concurrency 8
 *   node scripts/load/scenarios.mjs --base https://storelib-git-x-team.vercel.app \
 *     --onepage demo --creator demo --site demo --assets /api/site-theme/assets/<install>/<v>/theme.css \
 *     --creator-id <uuid> --product <uuid> --checkout --rate 20 --seconds 60
 *
 * Scenarios (each runs only when what it needs is given):
 *   onepage   GET /l/<onepage>                       --onepage <slug>  (or --onepage-path)
 *   creator   GET /<creator>                         --creator <handle>
 *   site      GET /w/<site>, or --site-path          --site <name>     (an imported theme: --site-path /api/site-theme/site/<name>/)
 *   product   GET /<creator>/<slug>                  --product-path /<creator>/<slug>
 *   pages     GET each of --pages in turn            --pages /,/pricing,/blog,/sitemap.xml   (each reported on its own as page:<path>)
 *   assets    GET each of --assets                   --assets /a.css,/b.js  (also /robots.txt, /favicon.ico when any scenario runs)
 *   collect   POST /api/track-view (analytics)       --creator-id <uuid>   WRITES a page view row on the target
 *   checkout  POST /api/checkout/stripe-session      --product <uuid> --checkout   CREATES a Stripe PaymentIntent, test mode only
 *
 * Options (flag or environment):
 *   --base / BASE_URL                 target (required)
 *   --seconds / LOAD_SECONDS          default 30, at most 600
 *   --concurrency / LOAD_CONCURRENCY  requests in flight, default 10, at most 50 (200 against a local server)
 *   --rate / LOAD_RATE                requests per second across all workers, default unlimited, at most 500
 *   --scenarios / LOAD_SCENARIOS      comma list to keep (default: every one that is configured)
 *   --json                            print the result as JSON as well
 *   --i-know-this-is-production       required for any host that is not local, a private address,
 *                                     a Vercel branch preview (`*-git-*.vercel.app`) or listed in LOAD_ALLOW_HOSTS
 *
 * Safety:
 *   - storelib.com, storelib.me and every subdomain of them, and every host not
 *     on the allow list above, are refused without --i-know-this-is-production.
 *   - checkout never runs against live Stripe, whatever flag is passed: before
 *     the run it reads the product page and its scripts for the publishable key
 *     and refuses on `pk_live_`. When it cannot find one it refuses too, unless
 *     LOAD_STRIPE_PUBLISHABLE_KEY (the target's key) is given and starts `pk_test_`.
 *   - no cookies are sent; no buyer is a real address (`load+N@example.com`).
 *
 * Reports, overall and per scenario: requests, p50, p95 and p99 latency (to the
 * full body), the error rate (network failure, timeout or status >= 500),
 * 4xx answers and 429s counted on their own.
 */

import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { percentile } from "./storefront.mjs"

const MAX_CONCURRENCY = 50
/* A local `next start` (scripts/load/local-bench.mjs) costs nobody anything: 100 in flight is one of its levels. */
const MAX_LOCAL_CONCURRENCY = 200
const MAX_SECONDS = 600
const MAX_RATE = 500
const TIMEOUT_MS = 15_000
const PROD_FLAG = "--i-know-this-is-production"
const PRODUCTION_DOMAINS = ["storelib.com", "storelib.me"]

function argValue(argv, name) {
  const i = argv.indexOf(`--${name}`)
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1]
  return undefined
}

/** True for localhost, loopback and private network addresses. */
export function isLocalHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "0.0.0.0") return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * Null when the target may be loaded, else why not. An allow list, not a deny
 * list: a creator's custom domain or a production deployment's own
 * `*.vercel.app` address is production too, and cannot be told apart by name.
 */
export function refuseTarget(base, { iKnowThisIsProduction = false, allowHosts = [] } = {}) {
  let url
  try {
    url = new URL(base)
  } catch {
    return `BASE_URL is not an address: ${base}`
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return `BASE_URL must be http or https: ${base}`
  const host = url.hostname.toLowerCase()
  if (iKnowThisIsProduction) return null
  if (PRODUCTION_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return `${host} is production. Aim at a staging preview, or pass ${PROD_FLAG}.`
  if (isLocalHost(host)) return null
  if (allowHosts.map((h) => h.trim().toLowerCase()).filter(Boolean).includes(host)) return null
  if (host.endsWith(".vercel.app") && host.includes("-git-")) return null
  return `${host} is not a known staging host (local, a private address, a *-git-*.vercel.app branch preview, or LOAD_ALLOW_HOSTS). It may be production: add it to LOAD_ALLOW_HOSTS if it is staging, or pass ${PROD_FLAG}.`
}

/** What the page's scripts say about Stripe: "live", "test" or "unknown". Live wins over test. */
export function stripeModeOf(texts) {
  const all = texts.join("\n")
  if (/pk_live_[A-Za-z0-9]{8,}/.test(all)) return "live"
  if (/pk_test_[A-Za-z0-9]{8,}/.test(all)) return "test"
  return "unknown"
}

/** Decides whether checkout may run. Null to go ahead, else why not. Live Stripe is refused whatever the flags. */
export function refuseCheckout(scanned, envKey) {
  if (scanned === "live") return "the target's pages carry a live Stripe key (pk_live_): checkout load is never run against live Stripe."
  if (envKey && !envKey.startsWith("pk_test_")) return "LOAD_STRIPE_PUBLISHABLE_KEY is not a test key: checkout load is never run against live Stripe."
  if (scanned === "test") return null
  if (envKey && envKey.startsWith("pk_test_")) return null
  return "could not find the target's Stripe key in its pages. Set LOAD_STRIPE_PUBLISHABLE_KEY to the target's pk_test_ key to confirm test mode."
}

export function clamp(n, lo, hi, fallback) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, v))
}

/** The scenarios a configuration allows, in a fixed order. */
export function buildScenarios(cfg) {
  const s = []
  const get = (name, path) => ({ name, method: "GET", path: () => path })
  if (cfg.onepage || cfg.onepagePath) s.push(get("onepage", cfg.onepagePath || `/l/${encodeURIComponent(cfg.onepage)}`))
  if (cfg.creator) s.push(get("creator", `/${encodeURIComponent(cfg.creator)}`))
  if (cfg.site || cfg.sitePath) s.push(get("site", cfg.sitePath || `/w/${encodeURIComponent(cfg.site)}`))
  if (cfg.productPath) s.push(get("product", cfg.productPath))
  for (const p of cfg.pages ?? []) s.push(get(`page:${p}`, p))
  const assets = (cfg.assets ?? []).filter(Boolean)
  if (s.length || assets.length) {
    const list = [...assets, "/robots.txt", "/favicon.ico"]
    let i = 0
    s.push({ name: "assets", method: "GET", path: () => list[i++ % list.length] })
  }
  if (cfg.creatorId) {
    s.push({
      name: "collect",
      method: "POST",
      path: () => "/api/track-view",
      contentType: "text/plain;charset=UTF-8",
      body: (base) => JSON.stringify({ creatorId: cfg.creatorId, href: new URL(cfg.creator ? `/${cfg.creator}` : "/", base).href }),
    })
  }
  if (cfg.product && cfg.checkout) {
    let n = 0
    s.push({
      name: "checkout",
      method: "POST",
      path: () => "/api/checkout/stripe-session",
      contentType: "application/json",
      body: () => JSON.stringify({ productId: cfg.product, firstName: "Load", lastName: "Test", email: `load+${Date.now().toString(36)}${n++}@example.com`, agreedToTerms: true }),
    })
  }
  const keep = cfg.only?.length ? new Set(cfg.only) : null
  return keep ? s.filter((x) => keep.has(x.name)) : s
}

export function summarise(results) {
  const ms = results.filter((r) => r.ms !== null).map((r) => r.ms).sort((a, b) => a - b)
  const errors = results.filter((r) => r.error || r.status >= 500).length
  const round = (v) => (v === null ? null : Math.round(v))
  return {
    requests: results.length,
    p50: round(percentile(ms, 50)),
    p95: round(percentile(ms, 95)),
    p99: round(percentile(ms, 99)),
    errors,
    errorRate: results.length ? errors / results.length : 0,
    client4xx: results.filter((r) => r.status >= 400 && r.status < 500 && r.status !== 429).length,
    limited429: results.filter((r) => r.status === 429).length,
  }
}

/** A pacer: at most `rate` starts a second across all workers (null: no limit). */
export function pacer(rate, now = () => performance.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  if (!rate) return async () => {}
  const gap = 1000 / rate
  let next = now()
  return async () => {
    const at = Math.max(next, now())
    next = at + gap
    const wait = at - now()
    if (wait > 0) await sleep(wait)
  }
}

async function hit(base, sc) {
  const started = performance.now()
  try {
    const headers = { "user-agent": "storelib-load-test/2", accept: "text/html,application/json,*/*" }
    if (sc.contentType) headers["content-type"] = sc.contentType
    const res = await fetch(new URL(sc.path(), base), {
      method: sc.method,
      redirect: "manual",
      headers,
      body: sc.body ? sc.body(base) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await res.arrayBuffer()
    return { name: sc.name, status: res.status, ms: performance.now() - started, error: null }
  } catch (e) {
    return { name: sc.name, status: 0, ms: null, error: e instanceof Error ? e.name : "error" }
  }
}

/** Reads a page and up to 40 of its scripts, for the Stripe key. */
async function scanStripeMode(base, path) {
  const texts = []
  try {
    const res = await fetch(new URL(path, base), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const html = await res.text()
    texts.push(html)
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]).slice(0, 40)
    for (const src of srcs) {
      try {
        const js = await fetch(new URL(src, base), { signal: AbortSignal.timeout(TIMEOUT_MS) })
        texts.push(await js.text())
      } catch {
        /* one script that does not load is not the answer */
      }
    }
  } catch {
    return "unknown"
  }
  return stripeModeOf(texts)
}

async function main(argv = process.argv) {
  const env = process.env
  const opt = (name, envName) => argValue(argv, name) ?? (envName ? env[envName] : undefined)
  const base = opt("base", "BASE_URL")
  if (!base) {
    console.error("load: set BASE_URL or pass --base")
    process.exit(2)
  }
  const refusal = refuseTarget(base, { iKnowThisIsProduction: argv.includes(PROD_FLAG), allowHosts: String(env.LOAD_ALLOW_HOSTS ?? "").split(",") })
  if (refusal) {
    console.error(`load: ${refusal}`)
    process.exit(2)
  }
  const cfg = {
    onepage: opt("onepage", "LOAD_ONEPAGE"),
    onepagePath: opt("onepage-path", "LOAD_ONEPAGE_PATH"),
    creator: opt("creator", "LOAD_CREATOR"),
    site: opt("site", "LOAD_SITE"),
    sitePath: opt("site-path", "LOAD_SITE_PATH"),
    productPath: opt("product-path", "LOAD_PRODUCT_PATH"),
    pages: String(opt("pages", "LOAD_PAGES") ?? "").split(",").map((p) => p.trim()).filter((p) => p.startsWith("/")),
    assets: String(opt("assets", "LOAD_ASSETS") ?? "").split(",").map((p) => p.trim()).filter(Boolean),
    creatorId: opt("creator-id", "LOAD_CREATOR_ID"),
    product: opt("product", "LOAD_PRODUCT"),
    checkout: argv.includes("--checkout"),
    only: String(opt("scenarios", "LOAD_SCENARIOS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  }
  const seconds = clamp(opt("seconds", "LOAD_SECONDS") ?? 30, 1, MAX_SECONDS, 30)
  const askedC = opt("concurrency", "LOAD_CONCURRENCY") ?? 10
  const cap = isLocalHost(new URL(base).hostname) ? MAX_LOCAL_CONCURRENCY : MAX_CONCURRENCY
  const concurrency = clamp(askedC, 1, cap, 10)
  if (Number(askedC) > cap) console.warn(`load: concurrency capped at ${cap}`)
  const askedR = opt("rate", "LOAD_RATE")
  const rate = askedR ? clamp(askedR, 1, MAX_RATE, null) : null

  if (cfg.product && cfg.checkout) {
    const page = cfg.creator ? `/${cfg.creator}` : "/"
    const scanned = await scanStripeMode(base, page)
    const why = refuseCheckout(scanned, env.LOAD_STRIPE_PUBLISHABLE_KEY)
    if (why) {
      console.error(`load: checkout refused: ${why}`)
      process.exit(2)
    }
    console.log(`load: checkout uses Stripe test mode (${scanned === "test" ? "seen in the target's pages" : "LOAD_STRIPE_PUBLISHABLE_KEY"})`)
  } else if (cfg.product && !cfg.checkout) {
    console.log("load: --product given without --checkout: checkout is not run")
  }

  const scenarios = buildScenarios(cfg)
  if (!scenarios.length) {
    console.error("load: nothing to run. Give at least one of --onepage, --creator, --site, --product-path, --pages, --assets, --creator-id, --product with --checkout")
    process.exit(2)
  }

  console.log(`load: ${base}, scenarios ${scenarios.map((s) => s.name).join(", ")}, ${concurrency} at once, ${rate ? `${rate} a second` : "no rate cap"}, ${seconds} s`)
  const results = []
  const until = Date.now() + seconds * 1000
  const wait = pacer(rate)
  let next = 0
  const worker = async () => {
    while (Date.now() < until) {
      await wait()
      if (Date.now() >= until) break
      results.push(await hit(base, scenarios[next++ % scenarios.length]))
    }
  }
  const started = Date.now()
  await Promise.all(Array.from({ length: concurrency }, worker))
  const elapsed = (Date.now() - started) / 1000

  const all = summarise(results)
  const per = scenarios.map((s) => ({ scenario: s.name, ...summarise(results.filter((r) => r.name === s.name)) }))
  const pct = (v) => `${(v * 100).toFixed(1)}%`
  const fmt = (s) => `p50 ${s.p50 ?? "-"} ms  p95 ${s.p95 ?? "-"} ms  p99 ${s.p99 ?? "-"} ms  errors ${pct(s.errorRate)}  4xx ${s.client4xx}  429 ${s.limited429}`
  console.log(`\n${all.requests} requests in ${elapsed.toFixed(1)} s (${(all.requests / elapsed).toFixed(1)} per second)`)
  console.log(`all        ${fmt(all)}`)
  for (const p of per) console.log(`  ${p.scenario.padEnd(Math.max(9, ...per.map((x) => x.scenario.length)))} ${String(p.requests).padStart(6)}  ${fmt(p)}`)
  const errorsByKind = {}
  for (const r of results) if (r.error || r.status >= 500) errorsByKind[`${r.name}:${r.error ?? r.status}`] = (errorsByKind[`${r.name}:${r.error ?? r.status}`] ?? 0) + 1
  if (Object.keys(errorsByKind).length) console.log(`errors by kind: ${JSON.stringify(errorsByKind)}`)
  if (argv.includes("--json")) console.log(JSON.stringify({ base, seconds: elapsed, concurrency, rate, all, scenarios: per, errorsByKind }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
