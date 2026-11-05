/**
 * ===========================================================================
 *  WHAT THE CDN KEEPS, PER PUBLIC PAGE TYPE, AND HOW LONG A FIRST LOAD TAKES (round 54)
 * ===========================================================================
 * A local production build (`next start` in DIR) reading the Supabase stub
 * with the round 52 and 53 websites (scripts/site-speed-fixture.mjs) and
 * local-fixture's satori: her creator page, a product page, her OnePage,
 * Explore and the Loop Club community, beside nova's Storelib theme website
 * and mara's imported Materia.
 *
 *   node scripts/load/local-bench.mjs --stub --stub-port 54453 &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54453 <CLAUDE.md placeholders> pnpm build
 *   DIR=<built checkout> STUB_PORT=54453 node scripts/check-cdn-r54.mjs [--json FILE]
 *
 * HEADERS  every page type asked as a stranger, a signed in visitor, a buyer
 *          with a cart, with Instagram's click id (?utm_source=ig&fbclid=…),
 *          and as a client side move (RSC) and a prefetch: what the CDN is
 *          told (Cache-Control, Vercel-CDN-Cache-Control, Vary), whether it
 *          sets a cookie (Vercel never stores one that does), and whether a
 *          CDN may keep it at all.
 * MODEL    twelve hours of visits replayed against those exact headers by a
 *          CDN stand in that does what Vercel's does: fresh for s-maxage,
 *          then served stale while one request draws it again, for
 *          stale-while-revalidate; a key per address the browser asked for
 *          (path AND query) plus each Vary header, except an ISR page, whose
 *          query Vercel never keys on (allowQuery is empty for a page that
 *          reads no searchParams). Reports hit, stale, miss and draws per
 *          page type, and the ISR revalidations an hour. Visits follow a
 *          long tail (Zipf, s = 1.1) over many pages of each type, a quarter
 *          of them carrying a click id that is new every time. It is a model
 *          of the traffic, fed with measured headers, and says so.
 * BROWSER  each page in a phone browser (CPU 4x slower) on fast and slow 4G,
 *          CDN cold and warm: TTFB, FCP, LCP, the load event, "fully loaded"
 *          (the later of LCP and load), the documents, RSC requests, any
 *          request made twice, redirects, and blank or flashing frames from
 *          Chrome's own screencast (a frame that is one flat colour after a
 *          frame that was not). ONLY=Explore,Community limits the browser part
 *          to those page types; SKIP=model,browser leaves a part out.
 */
import { spawn, execFileSync } from "node:child_process"
import { createServer as createHttpsServer } from "node:https"
import { request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { brotliCompressSync, constants as zlibConstants } from "node:zlib"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { siteSpeedFixture } from "./site-speed-fixture.mjs"
import { HANDLE, products } from "./load/local-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3727)
const STUB_PORT = Number(process.env.STUB_PORT || 54453)
const RUNS = Math.max(1, Number(process.env.RUNS || 2))
const PROFILES = (process.env.PROFILES || "fast4g,slow4g").split(",")
const DB_MS = Number(process.env.DB_MS || 25)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const SKIP = new Set((process.env.SKIP || "").split(",").filter(Boolean))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = { headers: [], model: [], browser: [] }

const P1 = products[0]
const SURFACES = [
  /* [type, host, path] */
  ["Storelib theme site /", "nova.storelib.com", "/"],
  ["Storelib theme site product", "nova.storelib.com", "/products/nova-pack-1"],
  ["Imported (Materia) site /", "mara.storelib.com", "/"],
  ["Creator page", "storelib.com", `/${HANDLE}`],
  ["Product page", "storelib.com", `/${HANDLE}/${P1.slug}`],
  ["OnePage", "storelib.me", `/${HANDLE}`],
  ["Explore", "storelib.com", "/explore"],
  ["Community landing", "storelib.com", "/community/loop-club"],
]

const { T } = await siteSpeedFixture({ personal: false })
const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T, delayMs: DB_MS })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })

function ask(host, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    let first = 0
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path, method: "GET", headers: { host, "x-forwarded-host": host, "x-forwarded-proto": "https", accept: "text/html", "sec-fetch-dest": "document", "user-agent": "Mozilla/5.0 (iPhone) Safari/604.1", "accept-language": "en-US,en;q=0.9", ...headers } }, (res) => {
      const chunks = []
      res.on("data", (c) => { if (!first) first = performance.now(); chunks.push(c) })
      res.on("end", () => resolve({ status: res.statusCode, h: res.headers, body: Buffer.concat(chunks), ttfb: (first || performance.now()) - t0 }))
    })
    req.on("error", reject)
    req.setTimeout(90_000, () => req.destroy(new Error("timeout")))
    req.end()
  })
}
for (let i = 0; i < 600; i++) { try { await ask("storelib.com", "/robots.txt"); break } catch { await sleep(200) } }

/** What a CDN in front reads off an answer: the rule, its fresh and stale seconds, whether it may keep it at all. */
function ruleOf(h) {
  const rule = String(h["vercel-cdn-cache-control"] ?? h["cdn-cache-control"] ?? h["cache-control"] ?? "")
  const fresh = Number(rule.match(/s-maxage=(\d+)/)?.[1] ?? 0)
  const stale = Number(rule.match(/stale-while-revalidate=(\d+)/)?.[1] ?? 0)
  const isr = !!h["x-nextjs-cache"] || /\bx-nextjs-prerender\b/.test(Object.keys(h).join(" "))
  const keeps = fresh > 0 && /\bpublic\b|s-maxage/.test(rule) && !/private|no-store/.test(rule) && !h["set-cookie"]
  return { rule, fresh, stale, isr, keeps }
}

/* ── HEADERS ── */
console.log("\nHEADERS (origin, per page type and visitor)\n")
const VISITORS = [
  ["stranger", {}],
  ["signed in", { cookie: "sb-placeholder-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0; sl_owned_hint=1" }],
  ["cart + tracker cookies", { cookie: "sl_theme_cart=c1; sl_cart_n=1; sl_asid=a1; materia_visitor=v1; storelib_consent=all; _ga=GA1.1.1" }],
  ["?utm_source=ig&fbclid=…", {}, "?utm_source=ig&utm_medium=social&fbclid=PAZXh0bgNhZW0CMTEAAabc"],
  ["RSC move", { rsc: "1", accept: "*/*", "sec-fetch-dest": "empty" }],
  ["RSC prefetch", { rsc: "1", "next-router-prefetch": "1", accept: "*/*", "sec-fetch-dest": "empty" }],
]
const firstAfterBoot = {}
for (const [type, host, path] of SURFACES) {
  /* The first request for each page type after `next start`: its route's code loaded and its reads asked for the first time (the cold half of a cold start; a new Vercel instance also pays the boot itself). */
  firstAfterBoot[type] = Math.round((await ask(host, path)).ttfb)
  await ask(host, path)
  for (const [who, headers, query] of VISITORS) {
    const r = await ask(host, `${path}${query ?? ""}`, headers)
    const rule = ruleOf(r.h)
    const row = { type, host, path, who, status: r.status, cc: r.h["cache-control"] ?? null, cdn: r.h["vercel-cdn-cache-control"] ?? null, vary: r.h.vary ?? null, tag: r.h["vercel-cache-tag"] ?? null, setCookie: [].concat(r.h["set-cookie"] ?? []).map((c) => c.split("=")[0]), isr: r.h["x-nextjs-cache"] ?? null, keeps: rule.keeps, fresh: rule.fresh, stale: rule.stale, ttfb: Math.round(r.ttfb) }
    out.headers.push(row)
    console.log(`  ${type.padEnd(28)} ${who.padEnd(24)} ${r.status} keeps=${String(rule.keeps).padEnd(5)} fresh=${String(rule.fresh).padStart(5)} stale=${String(rule.stale).padStart(6)} isr=${row.isr ?? "-"}  cc="${row.cc ?? ""}" cdn="${row.cdn ?? ""}" vary="${row.vary ?? ""}" set-cookie=${row.setCookie.join("|") || "-"}`)
  }
}

out.firstAfterBoot = firstAfterBoot
console.log(`\n  first request after boot, TTFB: ${Object.entries(firstAfterBoot).map(([t, v]) => `${t} ${v} ms`).join(", ")}`)

/* ── MODEL: twelve hours of visits against those headers ── */
if (!SKIP.has("model")) {
  console.log("\nMODEL (12 h replayed against the measured headers; a model of traffic, not production)\n")
  /* Pages of each type and visits in 12 h: a long tail of many pages, a few in demand. */
  const SHAPE = { pages: 400, visits: 6000, clickIds: 0.25, rscShare: 0.15, hours: 12 }
  let seed = 54
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const zipf = (() => { const w = Array.from({ length: SHAPE.pages }, (_, i) => 1 / Math.pow(i + 1, 1.1)); const sum = w.reduce((a, b) => a + b, 0); let acc = 0; return w.map((x) => (acc += x / sum)) })()
  const pick = () => { const u = rand(); let lo = 0, hi = zipf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (zipf[m] < u) lo = m + 1; else hi = m } return lo }
  for (const [type] of SURFACES) {
    const doc = out.headers.find((r) => r.type === type && r.who === "stranger")
    const tagged = out.headers.find((r) => r.type === type && r.who.startsWith("?utm"))
    const rsc = out.headers.find((r) => r.type === type && r.who === "RSC move")
    const cdn = new Map()
    const n = { hit: 0, stale: 0, miss: 0, bypass: 0, draws: 0, isrRevalidations: 0 }
    const span = SHAPE.hours * 3600
    const times = Array.from({ length: SHAPE.visits }, () => rand() * span).sort((a, b) => a - b)
    for (const t of times) {
      const page = pick()
      const isRsc = rand() < SHAPE.rscShare
      const clickId = !isRsc && rand() < SHAPE.clickIds
      const h = isRsc ? rsc : clickId ? tagged : doc
      if (!h || !h.keeps) { n.bypass++; n.draws++; continue }
      /* An ISR page is keyed without its query; any other answer on the whole address the browser asked for. */
      const key = `${page}|${isRsc ? "rsc" : ""}|${clickId && !h.isr ? `c${t}` : ""}`
      const e = cdn.get(key)
      if (e && t < e.at + h.fresh) n.hit++
      else if (e && t < e.at + h.fresh + h.stale) { n.stale++; n.draws++; if (h.isr) n.isrRevalidations++; cdn.set(key, { at: t }) }
      else { n.miss++; n.draws++; cdn.set(key, { at: t }) }
    }
    const total = SHAPE.visits
    const row = { type, ...n, hitRate: (n.hit + n.stale) / total, missRate: n.miss / total, bypassRate: n.bypass / total, drawsPerHour: n.draws / SHAPE.hours, isrPerHour: n.isrRevalidations / SHAPE.hours }
    out.model.push(row)
    console.log(`  ${type.padEnd(28)} hit ${(100 * (n.hit / total)).toFixed(1).padStart(5)}%  stale ${(100 * (n.stale / total)).toFixed(1).padStart(5)}%  miss ${(100 * row.missRate).toFixed(1).padStart(5)}%  bypass ${(100 * row.bypassRate).toFixed(1).padStart(5)}%  served from CDN ${(100 * row.hitRate).toFixed(1).padStart(5)}%  origin draws/h ${row.drawsPerHour.toFixed(0).padStart(4)}  ISR revalidations/h ${row.isrPerHour.toFixed(0)}`)
  }
}

/* ── BROWSER ── */
if (!SKIP.has("browser")) {
  const cdn = new Map()
  const TLS_PORT = PORT + 1000
  const dir = join(tmpdir(), `cdn-r54-tls-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=storelib.test", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" })
  createHttpsServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const key = `${req.headers.host}${req.url}|${req.headers.rsc ?? ""}|${req.headers["sec-fetch-dest"] ?? ""}`
    const hit = req.method === "GET" ? cdn.get(key) : null
    if (hit && (hit.headers["content-encoding"] !== "br" || /\bbr\b/.test(String(req.headers["accept-encoding"] ?? "")))) {
      res.writeHead(hit.status, { ...hit.headers, "x-cdn": "HIT" })
      res.end(hit.body)
      return
    }
    const up = httpRequest({ host: "127.0.0.1", port: PORT, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } }, (r) => {
      const chunks = []
      r.on("data", (c) => chunks.push(c))
      r.on("end", () => {
        let body = Buffer.concat(chunks)
        const headers = { ...r.headers }
        if (!headers["content-encoding"] && /^(?:text\/|application\/(?:javascript|json)|image\/svg)/.test(String(headers["content-type"] ?? "")) && /\bbr\b/.test(String(req.headers["accept-encoding"] ?? "")) && body.length > 1024) {
          body = brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
          headers["content-encoding"] = "br"
          delete headers["content-length"]
          delete headers["transfer-encoding"]
        }
        const rule = ruleOf(headers)
        delete headers["vercel-cdn-cache-control"]
        if (req.method === "GET" && r.statusCode === 200 && (rule.keeps || /immutable/.test(String(headers["cache-control"] ?? "")))) cdn.set(key, { status: r.statusCode, headers, body })
        res.writeHead(r.statusCode ?? 502, { ...headers, "x-cdn": "MISS" })
        res.end(body)
      })
    })
    up.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(up)
  }).listen(TLS_PORT, "127.0.0.1")

  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
  const NETWORK = {
    slow4g: { latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 },
    fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  }
  const OBSERVE = () => {
    window.__perf = { lcp: 0, lcpEl: "", cls: 0 }
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpEl = e.element ? e.element.nodeName.toLowerCase() + (e.url ? ` ${e.url.slice(-40)}` : "") : "" } }).observe({ type: "largest-contentful-paint", buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value }).observe({ type: "layout-shift", buffered: true })
  }
  const hosts = [...new Set(SURFACES.map(([, h]) => h))]
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--ignore-certificate-errors", `--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1:${TLS_PORT}`).join(", ")}, MAP * ~NOTFOUND`],
  })
  /** A frame that is one flat colour: its channels barely move. */
  const flat = async (b64) => { const s = await sharp(Buffer.from(b64, "base64")).stats(); return s.channels.slice(0, 3).every((c) => c.stdev < 2.5) }

  async function load(profile, host, path) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const cdp = await page.createCDPSession()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await page.setUserAgent(IPHONE)
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK[profile] })
    await page.evaluateOnNewDocument(OBSERVE)
    const reqs = []
    const docs = []
    let redirects = 0
    cdp.on("Network.requestWillBeSent", (e) => {
      if (e.redirectResponse) redirects++
      reqs.push({ url: e.request.url, method: e.request.method, rsc: !!(e.request.headers.RSC || e.request.headers.rsc), type: e.type })
      if (e.type === "Document") docs.push(e.request.url)
    })
    const frames = []
    cdp.on("Page.screencastFrame", (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 30, maxWidth: 195, maxHeight: 422, everyNthFrame: 1 })
    let m
    try {
      await page.goto(`https://${host}${path}`, { waitUntil: "load", timeout: 120_000 })
      await sleep(2500)
      m = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { ttfb: nav.responseStart, fcp: fcp?.startTime ?? NaN, lcp: window.__perf.lcp, lcpEl: window.__perf.lcpEl, cls: window.__perf.cls, load: nav.loadEventEnd } })
    } catch (e) {
      m = { error: String(e.message ?? e) }
    }
    await cdp.send("Page.stopScreencast").catch(() => {})
    /* Flashes: a flat frame after the first frame that was not flat. */
    let painted = false, flashes = 0
    for (const f of frames) { const isFlat = await flat(f.data).catch(() => false); if (!isFlat) painted = true; else if (painted) flashes++ }
    const seen = new Map()
    for (const r of reqs) if (r.method === "GET" && !r.url.startsWith("data:")) seen.set(r.url, (seen.get(r.url) ?? 0) + 1)
    const twice = [...seen].filter(([, n]) => n > 1).map(([u, n]) => `${u.replace(/^https:\/\/[^/]+/, "")} x${n}`)
    await ctx.close()
    return { ...m, full: Math.max(m.lcp ?? 0, m.load ?? 0), documents: docs.length, rsc: reqs.filter((r) => r.rsc).length, api: reqs.filter((r) => /\/api\//.test(r.url)).length, twice, redirects, frames: frames.length, flashes, requests: reqs.length }
  }

  const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN }
  const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : "-")
  console.log("\nBROWSER (iPhone, CPU 4x slower; full = the later of LCP and the load event)\n")
  for (const profile of PROFILES) {
    for (const [type, host, path] of SURFACES.filter(([t]) => !process.env.ONLY || process.env.ONLY.split(",").some((o) => t.includes(o)))) {
      for (const mode of ["cdn-cold", "cdn-warm"]) {
        const runs = []
        for (let i = 0; i < RUNS; i++) {
          if (mode === "cdn-cold") cdn.clear()
          else await load("fast4g", host, path).catch(() => null)
          runs.push(await load(profile, host, path))
        }
        const ok = runs.filter((r) => !r.error)
        const row = { profile, type, host, path, mode, ttfb: median(ok.map((r) => r.ttfb)), fcp: median(ok.map((r) => r.fcp)), lcp: median(ok.map((r) => r.lcp)), load: median(ok.map((r) => r.load)), full: median(ok.map((r) => r.full)), cls: median(ok.map((r) => r.cls)), lcpEl: ok[0]?.lcpEl ?? "", documents: Math.max(...ok.map((r) => r.documents)), rsc: Math.max(...ok.map((r) => r.rsc)), api: Math.max(...ok.map((r) => r.api)), redirects: Math.max(...ok.map((r) => r.redirects)), flashes: Math.max(...ok.map((r) => r.flashes)), twice: ok[0]?.twice ?? [], requests: median(ok.map((r) => r.requests)), errors: runs.filter((r) => r.error).map((r) => r.error) }
        out.browser.push(row)
        console.log(`${profile.padEnd(7)} ${type.padEnd(28)} ${mode.padEnd(9)} TTFB ${ms(row.ttfb).padStart(8)} FCP ${ms(row.fcp).padStart(8)} LCP ${ms(row.lcp).padStart(8)} load ${ms(row.load).padStart(8)} FULL ${ms(row.full).padStart(8)}  docs ${row.documents} rsc ${row.rsc} api ${row.api} redirects ${row.redirects} flashes ${row.flashes} cls ${row.cls?.toFixed?.(3)} req ${row.requests}${row.twice.length ? `  TWICE ${row.twice.slice(0, 4).join(", ")}` : ""}  LCP el ${row.lcpEl}${row.errors.length ? `  ERR ${row.errors[0]}` : ""}`)
      }
    }
  }
  await browser.close()
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))
process.exit(0)
